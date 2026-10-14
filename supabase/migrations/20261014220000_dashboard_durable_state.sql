-- Dashboard durable state: installs, drafts, PR records.
--
-- Why this file exists: the console kept these three maps in process RAM
-- (lib/store.ts), keyed by one constant tenant, so every Netlify restart
-- forgot real installs and showed "connect your website" to installed
-- merchants. These tables make the backend the memory, per-tenant.
--
-- Ownership note: the SDK repo owns the database. If this file is applied
-- from here, it must be mirrored there (or moved there) so migration
-- history does not fork. Prefer landing it in the SDK repo and deleting
-- this copy; keep exactly one writer of schema.
--
-- Trust notes (AGENTS.md):
--   1. Unknown, never green: no seed rows. Empty tables read as honest
--      empty; routes render unknown/missing, never zero/green.
--   4. RLS is the control: anon holds no grants (default). authenticated
--      reads/writes only through the member predicate below — the same
--      agentport_is_tenant_member() gate every other console table uses.
--   6. No amounts, no PII: ids, names, digests, timestamps only. There is
--      deliberately NO token column — installation/OAuth tokens stay in
--      memory per operation and are never stored (a token in a table is a
--      token in a backup).
--   8. Revocation: uninstalls delete the row (owner/admin or the webhook
--      function below). A deleted row reads as missing, never installed.
--
-- Apply preview (dry run, linked project):  supabase db push --linked --dry-run
-- Apply (needs DB password, asks once):     supabase db push --linked

-- 1. GitHub App installations, one row per (tenant, installation). --------
CREATE TABLE IF NOT EXISTS public.github_installations (
  tenant_id       uuid        NOT NULL REFERENCES public.tenants (tenant_id) ON DELETE CASCADE,
  installation_id bigint      NOT NULL,
  account_login   text        NOT NULL DEFAULT '',
  installer_login text        NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, installation_id)
);
-- One installation belongs to exactly one tenant: a second tenant claiming
-- the same numeric id is refused by the constraint, not by application code.
CREATE UNIQUE INDEX IF NOT EXISTS github_installations_installation_uidx
  ON public.github_installations (installation_id);

ALTER TABLE public.github_installations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.github_installations FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.github_installations TO authenticated;

DROP POLICY IF EXISTS github_installations_member_read ON public.github_installations;
CREATE POLICY github_installations_member_read
  ON public.github_installations FOR SELECT TO authenticated
  USING (public.agentport_is_tenant_member(tenant_id));

DROP POLICY IF EXISTS github_installations_owner_write ON public.github_installations;
CREATE POLICY github_installations_owner_write
  ON public.github_installations FOR ALL TO authenticated
  USING (
    public.agentport_is_tenant_member(tenant_id)
    AND public.agentport_tenant_role(tenant_id) = ANY ('{owner,admin}')
  )
  WITH CHECK (
    public.agentport_is_tenant_member(tenant_id)
    AND public.agentport_tenant_role(tenant_id) = ANY ('{owner,admin}')
  );

-- 2. Dashboard drafts (setup / capabilities / rules), one row per section. --
-- Drafts are edits until the merchant's merge (Draft != live): this table
-- stores keystrokes, never liveness. Nothing here auto-enforces on save.
CREATE TABLE IF NOT EXISTS public.dashboard_drafts (
  tenant_id  uuid NOT NULL REFERENCES public.tenants (tenant_id) ON DELETE CASCADE,
  section    text NOT NULL CHECK (section IN ('setup', 'capabilities', 'rules')),
  payload    jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, section)
);

ALTER TABLE public.dashboard_drafts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.dashboard_drafts FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboard_drafts TO authenticated;

DROP POLICY IF EXISTS dashboard_drafts_member_read ON public.dashboard_drafts;
CREATE POLICY dashboard_drafts_member_read
  ON public.dashboard_drafts FOR SELECT TO authenticated
  USING (public.agentport_is_tenant_member(tenant_id));

DROP POLICY IF EXISTS dashboard_drafts_owner_write ON public.dashboard_drafts;
CREATE POLICY dashboard_drafts_owner_write
  ON public.dashboard_drafts FOR ALL TO authenticated
  USING (
    public.agentport_is_tenant_member(tenant_id)
    AND public.agentport_tenant_role(tenant_id) = ANY ('{owner,admin}')
  )
  WITH CHECK (
    public.agentport_is_tenant_member(tenant_id)
    AND public.agentport_tenant_role(tenant_id) = ANY ('{owner,admin}')
  );

-- 3. Install pull requests, one row per (tenant, repo). --------------------
-- A hint, never the authority: GitHub (open/merged/closed + checks rollup,
-- read live per view) decides signature state. Re-running the installer
-- replaces this row (same branch agentport/install), never appends.
CREATE TABLE IF NOT EXISTS public.install_pull_requests (
  tenant_id       uuid   NOT NULL REFERENCES public.tenants (tenant_id) ON DELETE CASCADE,
  repo            text   NOT NULL,
  pr_number       integer NOT NULL,
  pr_url          text   NOT NULL DEFAULT '',
  branch          text   NOT NULL DEFAULT 'agentport/install',
  installation_id bigint NOT NULL,
  recorded_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, repo)
);

ALTER TABLE public.install_pull_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.install_pull_requests FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.install_pull_requests TO authenticated;

DROP POLICY IF EXISTS install_pull_requests_member_read ON public.install_pull_requests;
CREATE POLICY install_pull_requests_member_read
  ON public.install_pull_requests FOR SELECT TO authenticated
  USING (public.agentport_is_tenant_member(tenant_id));

DROP POLICY IF EXISTS install_pull_requests_owner_write ON public.install_pull_requests;
CREATE POLICY install_pull_requests_owner_write
  ON public.install_pull_requests FOR ALL TO authenticated
  USING (
    public.agentport_is_tenant_member(tenant_id)
    AND public.agentport_tenant_role(tenant_id) = ANY ('{owner,admin}')
  )
  WITH CHECK (
    public.agentport_is_tenant_member(tenant_id)
    AND public.agentport_tenant_role(tenant_id) = ANY ('{owner,admin}')
  );

-- 4. Webhook writer: the delivery route is unauthenticated-by-design
-- (HMAC is the auth, verified in the route before any call here), so it
-- cannot write through member RLS. Pinned search_path, SECURITY DEFINER,
-- same pattern as the signup trigger. No token, no secret, no PII passes
-- through these arguments.
--
-- Execute is service_role ONLY (never authenticated): granting a DEFINER
-- function with a free p_tenant_id to authenticated would publish it as a
-- browser-callable RPC that bypasses RLS for any tenant id. No route calls
-- these yet — the webhook wiring lands with its service_role-exception
-- review, and until then these functions are inert by construction.
CREATE OR REPLACE FUNCTION public.record_github_install(
  p_tenant_id uuid,
  p_installation_id bigint,
  p_account_login text,
  p_installer_login text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.github_installations AS g
    (tenant_id, installation_id, account_login, installer_login, updated_at)
  VALUES
    (p_tenant_id, p_installation_id, COALESCE(p_account_login, ''), p_installer_login, now())
  ON CONFLICT (tenant_id, installation_id) DO UPDATE SET
    account_login   = EXCLUDED.account_login,
    installer_login = EXCLUDED.installer_login,
    updated_at      = now();
END;
$$;

REVOKE ALL ON FUNCTION public.record_github_install(uuid, bigint, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_github_install(uuid, bigint, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.remove_github_install(
  p_tenant_id uuid,
  p_installation_id bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.github_installations
  WHERE tenant_id = p_tenant_id AND installation_id = p_installation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_github_install(uuid, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remove_github_install(uuid, bigint) TO service_role;

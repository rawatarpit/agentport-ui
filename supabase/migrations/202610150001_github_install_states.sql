-- One-time GitHub install states (spec §8/§10.3).
--
-- Why: the Setup-URL callback must prove the arrival belongs to the tenant
-- that started it. A random 32-byte state is issued at install start; only
-- its SHA-256 hash lands here, bound to (tenant, initiator, purpose,
-- expiry). The callback consumes it atomically — missing, expired, or
-- already-consumed states reject. The raw state travels only in the
-- browser redirect, never in storage or logs.
--
-- Additive only: no existing object touched. RLS member/owner pattern
-- mirrors github_installations (20261014220000). No anon grants. No token,
-- secret, or amount column anywhere in this file.
--
-- NOTE (history ownership): the SDK repo owns supabase_migrations history.
-- If applied from here, mirror/delete there — one writer of schema.

CREATE TABLE IF NOT EXISTS public.github_install_states (
  state_hash   text        PRIMARY KEY,
  tenant_id    uuid        NOT NULL REFERENCES public.tenants (tenant_id) ON DELETE CASCADE,
  initiated_by uuid        NOT NULL,
  purpose      text        NOT NULL DEFAULT 'install' CHECK (purpose IN ('install', 'oauth')),
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.github_install_states ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.github_install_states FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.github_install_states TO authenticated;

DROP POLICY IF EXISTS github_install_states_member_read ON public.github_install_states;
CREATE POLICY github_install_states_member_read
  ON public.github_install_states FOR SELECT TO authenticated
  USING (public.agentport_is_tenant_member(tenant_id));

-- Writes (issue + atomic consume) are owner/admin only. The consume path is
-- a single UPDATE...RETURNING guarded by consumed_at IS NULL AND
-- expires_at > now(): a replay finds zero rows and fails closed.
DROP POLICY IF EXISTS github_install_states_owner_write ON public.github_install_states;
CREATE POLICY github_install_states_owner_write
  ON public.github_install_states FOR ALL TO authenticated
  USING (
    public.agentport_is_tenant_member(tenant_id)
    AND public.agentport_tenant_role(tenant_id) = ANY ('{owner,admin}')
  )
  WITH CHECK (
    public.agentport_is_tenant_member(tenant_id)
    AND public.agentport_tenant_role(tenant_id) = ANY ('{owner,admin}')
  );

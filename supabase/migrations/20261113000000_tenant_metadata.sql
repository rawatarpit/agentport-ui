-- Console-owned tenant metadata: industry and sector for sector-wise analytics.
--
-- Safety notes:
--   * This is a purely additive table. It does not reference, rename, or
--     modify any table the Rust governor writes to (ledger_entries,
--     policy_artifacts, push_batches, agent_capabilities, tenant_runtime,
--     tenants). The governor never reads this table, so it cannot be broken
--     by this migration.
--   * tenant_id references public.tenants (SDK-owned) but the governor does
--     not read this table, so the FK is read-only for us.
--   * RLS is enabled; tenants can only read/write their own row.
--   * No amounts, PII, CVV, passwords, or API keys. Industry/sector are
--     merchant-declared categories, not credentials.

CREATE TABLE IF NOT EXISTS public.tenant_metadata (
  tenant_id   uuid        NOT NULL REFERENCES public.tenants (tenant_id) ON DELETE CASCADE,
  industry    text        NULL,   -- merchant-declared, e.g. "retail", "healthcare", "finance"
  sector      text        NULL,   -- merchant-declared, e.g. "e-commerce", "clinics", "banks"
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id)
);

ALTER TABLE public.tenant_metadata ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.tenant_metadata FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_metadata TO authenticated;

DROP POLICY IF EXISTS tenant_metadata_member_read ON public.tenant_metadata;
CREATE POLICY tenant_metadata_member_read
  ON public.tenant_metadata FOR SELECT TO authenticated
  USING (public.agentport_is_tenant_member(tenant_id));

DROP POLICY IF EXISTS tenant_metadata_owner_write ON public.tenant_metadata;
CREATE POLICY tenant_metadata_owner_write
  ON public.tenant_metadata FOR ALL TO authenticated
  USING (
    public.agentport_is_tenant_member(tenant_id)
    AND public.agentport_tenant_role(tenant_id) = ANY ('{owner,admin}')
  )
  WITH CHECK (
    public.agentport_is_tenant_member(tenant_id)
    AND public.agentport_tenant_role(tenant_id) = ANY ('{owner,admin}')
  );

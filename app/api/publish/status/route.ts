import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { compileLiveFrom } from '@/lib/golive'
import { getDraftDb } from '@/lib/durable-store'
import { resolveCallerRole } from '@/lib/tenant'
import { readSelectedTenantId, tenantRefusalResponse } from '@/lib/tenant-server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/publish/status — what the publish panel may honestly say.
 *
 * `live` is the newest *stored artifact*, not a RAM row: an approval whose
 * envelope has not been signed and uploaded is not live, and this endpoint
 * will not pretend otherwise. `draft` is the compiled summary the merchant is
 * about to approve; a compile failure is returned as a reason, never as an
 * empty policy.
 */
export async function GET() {
  const supabase = createClient()
  const { data } = await supabase.auth.getUser()
  const t = await resolveCallerRole({
    getUserId: async () => data.user?.id ?? null,
    selectedTenantId: readSelectedTenantId(),
    listMemberships: async (userId: string) => {
      const { data: rows } = await supabase
        .from('tenant_members')
        .select('tenant_id,role,created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
      return (rows ?? []) as Array<{ tenant_id: string; role: string; created_at: string }>
    },
    getRole: async (tenantId: string) => {
      const { data: role } = await supabase.rpc('agentport_tenant_role', { target_tenant: tenantId })
      return typeof role === 'string' ? role : null
    },
  })
  if (t.tenantId === null) {
    return tenantRefusalResponse(t)
  }
  const tenantId = t.tenantId

  // The pin is the public half of the merchant key. It is not a secret, but
  // tenant_runtime has no member SELECT policy, so this scoped read uses the
  // server client after resolveCallerRole has proven membership. A failed
  // read is `unknown`, never `no pin` — generating a key against a pin we
  // could not see would be exactly the wrong guess.
  const keyPin = (async (): Promise<{ known: boolean; publicKey: string | null }> => {
    try {
      const { data, error } = await createAdminClient()
        .from('tenant_runtime')
        .select('policy_public_key_pem')
        .eq('tenant_id', tenantId)
        .maybeSingle()
      if (error) return { known: false, publicKey: null }
      const value = typeof data?.policy_public_key_pem === 'string' ? data.policy_public_key_pem.trim() : ''
      return { known: true, publicKey: value === '' ? null : value }
    } catch {
      return { known: false, publicKey: null }
    }
  })()

  const [rules, setup, capabilities, latest, tenant, pin] = await Promise.all([
    getDraftDb(tenantId, 'rules'),
    getDraftDb(tenantId, 'setup'),
    getDraftDb(tenantId, 'capabilities'),
    supabase
      .from('policy_artifacts')
      .select('version, published_at')
      .eq('tenant_id', tenantId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('tenants').select('display_name').eq('tenant_id', tenantId).maybeSingle(),
    keyPin,
  ])

  const compiled = compileLiveFrom({
    rules: rules?.payload,
    setup: setup?.payload,
    capabilities: capabilities?.payload,
  })

  const stored = latest.data as { version?: unknown; published_at?: unknown } | null
  const live =
    stored && Number.isInteger(stored.version) && typeof stored.published_at === 'string'
      ? { version: stored.version as number, publishedAt: stored.published_at }
      : null

  return Response.json({
    status: 'ok',
    tenantId,
    businessName: (tenant.data?.display_name as string | undefined) ?? null,
    live,
    draft: compiled.ok ? { summary: compiled.compiled.summary } : null,
    draftError: compiled.ok ? null : compiled.reason,
    nextVersion: (live?.version ?? 0) + 1,
    pinnedPublicKey: pin.publicKey,
    pinnedPublicKeyKnown: pin.known,
  })
}

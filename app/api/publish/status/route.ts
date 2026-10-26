import { createClient } from '@/lib/supabase/server'
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

  const [rules, setup, capabilities, latest, tenant] = await Promise.all([
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
    businessName: (tenant.data?.display_name as string | undefined) ?? null,
    live,
    draft: compiled.ok ? { summary: compiled.compiled.summary } : null,
    draftError: compiled.ok ? null : compiled.reason,
    nextVersion: (live?.version ?? 0) + 1,
  })
}

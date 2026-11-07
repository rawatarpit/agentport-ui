import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveCallerTenant } from '@/lib/tenant'
import { readSelectedTenantId, tenantRefusalResponse } from '@/lib/tenant-server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/publish/versions — applied-config history for the caller's tenant.
 *
 * Each row is a config the governor may enforce: who applied it, which
 * ceremony it satisfied, the digest, and when. `active` marks the version the
 * runtime currently points at. Members read their own tenant only; the table
 * itself is service-role-only, so membership is proven before the read.
 */
export async function GET() {
  const supabase = createClient()
  const { data } = await supabase.auth.getUser()
  const t = await resolveCallerTenant({
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
  })
  if (t.tenantId === null) {
    return tenantRefusalResponse(t)
  }
  const tenantId = t.tenantId
  const admin = createAdminClient()
  const [{ data: rows, error }, { data: runtime }] = await Promise.all([
    admin
      .from('tenant_config_versions')
      .select('version,actor_role,risk_tier,digest,created_at')
      .eq('tenant_id', tenantId)
      .order('version', { ascending: false }),
    admin.from('tenant_runtime').select('active_config_version').eq('tenant_id', tenantId).maybeSingle(),
  ])
  if (error) {
    console.error('config versions read failed', error)
    return Response.json({ status: 'error', reason: 'Could not read version history. Retry.' }, { status: 502 })
  }
  const activeVersion = Number(
    (runtime as { active_config_version?: unknown } | null)?.active_config_version ?? 0,
  )
  const versions = ((rows ?? []) as Array<{
    version: number
    actor_role: string
    risk_tier: string
    digest: string
    created_at: string
  }>).map((v) => ({
    version: v.version,
    approverRole: v.actor_role,
    riskTier: v.risk_tier,
    digest: v.digest,
    approvedAt: v.created_at,
    active: v.version === activeVersion,
    publishedAt: v.created_at,
  }))
  return Response.json({ status: 'ok', tenantId, activeVersion, versions })
}

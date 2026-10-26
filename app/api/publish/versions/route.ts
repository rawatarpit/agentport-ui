import { createClient } from '@/lib/supabase/server'
import { resolveCallerTenant } from '@/lib/tenant'
import { readSelectedTenantId, tenantRefusalResponse } from '@/lib/tenant-server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/publish/versions — publish history for the caller's tenant.
 *
 * Each version joins its approval (who, which ceremony, what digest, when)
 * with its artifact presence (stored or still awaiting upload). A version
 * approved but never uploaded reads as exactly that — intent recorded,
 * nothing distributed. Members read their own tenant only.
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
  const [approvals, artifacts] = await Promise.all([
    supabase
      .from('publish_approvals')
      .select('version,approver_role,risk_tier,digest,approved_at')
      .eq('tenant_id', tenantId)
      .order('version', { ascending: false }),
    supabase.from('policy_artifacts').select('version,published_at').eq('tenant_id', tenantId),
  ])
  const stored = new Map<number, string>(
    ((artifacts.data ?? []) as Array<{ version: number; published_at: string }>).map((r) => [r.version, r.published_at]),
  )
  const versions = ((approvals.data ?? []) as Array<{
    version: number
    approver_role: string
    risk_tier: string
    digest: string
    approved_at: string
  }>).map((a) => ({
    version: a.version,
    approverRole: a.approver_role,
    riskTier: a.risk_tier,
    digest: a.digest,
    approvedAt: a.approved_at,
    artifactStored: stored.has(a.version),
    publishedAt: stored.get(a.version) ?? null,
  }))
  return Response.json({ status: 'ok', tenantId, versions })
}

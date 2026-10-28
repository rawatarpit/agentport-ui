import { brokerFetch } from '@/lib/github-broker'
import { canManageIntegrations, resolveCallerContext } from '@/lib/tenant'
import { guardStateChange } from '@/lib/request-guard'
import { readSelectedTenantId, tenantRefusalResponse } from '@/lib/tenant-server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/github/install — start installation through the GitHub broker.
 *
 * The console proves the caller is an owner/admin of the selected tenant,
 * then forwards only the tenant id. The broker independently verifies the
 * Supabase token and membership, issues the one-time state, and returns the
 * GitHub install URL. No GitHub App credential is read here.
 */
export async function POST(req: Request) {
  const guarded = guardStateChange(req, 'github:install')
  if (guarded) return guarded
  const supabase = createClient()
  let ctx: Awaited<ReturnType<typeof resolveCallerContext>>
  try {
    const { data } = await supabase.auth.getUser()
    ctx = await resolveCallerContext({
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
  } catch {
    return Response.json({ status: 'error', reason: 'Sign in first.' }, { status: 401 })
  }
  if (!ctx.tenantId) return tenantRefusalResponse(ctx)
  if (!canManageIntegrations(ctx.role)) {
    return Response.json(
      { status: 'error', reason: 'Only the owner or an admin of this business can connect GitHub.' },
      { status: 403 },
    )
  }
  return brokerFetch(req, '/install', {
    method: 'POST',
    body: JSON.stringify({ tenantId: ctx.tenantId }),
  })
}

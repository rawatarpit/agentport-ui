import { insertInstallState } from '@/lib/durable-store'
import { installUrlFor, newInstallState } from '@/lib/install-state'
import { canManageIntegrations, resolveCallerContext } from '@/lib/tenant'
import { guardStateChange } from '@/lib/request-guard'
import { readSelectedTenantId, tenantRefusalResponse } from '@/lib/tenant-server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/github/install — start installation with a one-time state.
 *
 * Owner/admin only (viewers inspect; they never link). Issues a random
 * 32-byte state, stores only its hash bound to (tenant, initiator,
 * 10-minute expiry), and returns the GitHub install URL carrying the raw
 * state. The Setup-URL callback consumes it atomically — a leaked or
 * replayed state links nothing.
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
  if (!ctx.tenantId) {
    return tenantRefusalResponse(ctx)
  }
  if (!canManageIntegrations(ctx.role)) {
    return Response.json(
      { status: 'error', reason: 'Only the owner or an admin of this business can connect GitHub.' },
      { status: 403 },
    )
  }
  const issued = newInstallState()
  const stored = await insertInstallState({
    stateHash: issued.stateHash,
    tenantId: ctx.tenantId,
    initiatedBy: ctx.userId,
    purpose: 'install',
    expiresAt: issued.expiresAt,
  })
  if (!stored) {
    return Response.json({ status: 'error', reason: 'Could not start installation — try again.' }, { status: 503 })
  }
  return Response.json({ status: 'ok', installUrl: installUrlFor(issued.state), expiresAt: issued.expiresAt })
}

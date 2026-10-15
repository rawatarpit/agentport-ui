import { deleteInstallationDb } from '@/lib/durable-store'
import { canManageIntegrations, resolveCallerContext } from '@/lib/tenant'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/github/installations/[id] — disconnect an installation.
 *
 * Owner/admin only, tenant-scoped by RLS: deleting our link row blocks new
 * repository operations immediately (every read mints per call) while
 * preserving PR history rows. This does NOT uninstall the App on GitHub —
 * the copy says so, because claiming an uninstall we did not perform would
 * be the lie. Uninstall there; revoked ids fail closed everywhere here.
 */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const installationId = Number(params.id)
  if (!Number.isInteger(installationId) || installationId <= 0) {
    return Response.json({ status: 'error', reason: 'Unknown installation.' }, { status: 404 })
  }
  const supabase = createClient()
  let ctx: Awaited<ReturnType<typeof resolveCallerContext>>
  try {
    const { data } = await supabase.auth.getUser()
    ctx = await resolveCallerContext({
      getUserId: async () => data.user?.id ?? null,
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
    return Response.json({ status: 'error', reason: 'Signed in, but no business is linked to this login yet.' }, { status: 404 })
  }
  if (!canManageIntegrations(ctx.role)) {
    return Response.json(
      { status: 'error', reason: 'Only the owner or an admin of this business can disconnect GitHub.' },
      { status: 403 },
    )
  }
  const removed = await deleteInstallationDb(ctx.tenantId, installationId)
  if (!removed) {
    return Response.json({ status: 'error', reason: 'No such connection on this business.' }, { status: 404 })
  }
  return Response.json({ status: 'ok', disconnected: installationId })
}

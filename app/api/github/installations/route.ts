import { getInstallations } from '@/lib/store'
import { resolveCallerTenant } from '@/lib/tenant'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/github/installations — App installs linked to the caller's tenant.
 * IDs and account names only: installations are pointers, and the
 * installation token is minted per operation, never stored.
 *
 * RAM until the durable installs table lands (SDK repo owns the DB):
 * a restart loses rows recorded by webhook/callback, and logged-out
 * callers see nothing. Empty is honest-empty, never proof of no install.
 */
export async function GET() {
  let tenantId: string | null = null
  try {
    const supabase = createClient()
    const { data } = await supabase.auth.getUser()
    const t = await resolveCallerTenant({
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
    tenantId = t.tenantId
  } catch {
    tenantId = null
  }
  if (!tenantId) return Response.json({ status: 'ok', installations: [] })
  const installations = getInstallations(tenantId).map((i) => ({
    installationId: i.installationId,
    accountLogin: i.accountLogin,
    receivedAt: i.receivedAt,
  }))
  return Response.json({ status: 'ok', installations })
}

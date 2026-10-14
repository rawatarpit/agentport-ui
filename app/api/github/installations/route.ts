import { getInstallationsDb } from '@/lib/durable-store'
import { mintInstallationTokenFor } from '@/lib/github'
import { resolveCallerTenant } from '@/lib/tenant'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/github/installations — App installs linked to the caller's tenant.
 * IDs and account names only: installations are pointers, and the
 * installation token is minted per operation, never stored.
 *
 * Durable rows (github_installations) with live revalidation: an install
 * revoked on GitHub mints nothing, so revoked rows are hidden here —
 * revocation reads as missing immediately and silently. Rows that fail for
 * any other reason (App unconfigured, network) are kept: an outage must
 * not rewrite history as an uninstall.
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
  const rows = await getInstallationsDb(tenantId)
  const live: Array<{ installationId: number; accountLogin: string; receivedAt: string }> = []
  for (const r of rows) {
    const minted = await mintInstallationTokenFor(r.installationId)
    if (!minted.ok) {
      // Revoked installs mint nothing ('unknown installation') — hide the
      // row so revocation is silent and immediate. Anything else (config,
      // network) keeps the row: an outage is not an uninstall.
      if (minted.reason === 'unknown installation') continue
    }
    live.push({ installationId: r.installationId, accountLogin: r.accountLogin, receivedAt: r.receivedAt })
  }
  return Response.json({ status: 'ok', installations: live })
}

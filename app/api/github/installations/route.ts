import { getInstallationsDb } from '@/lib/durable-store'
import { mintInstallationTokenFor } from '@/lib/github'
import { resolveCallerTenant } from '@/lib/tenant'
import { readSelectedTenantId, tenantRefusalResponse } from '@/lib/tenant-server'
import { createClient } from '@/lib/supabase/server'

import { enforceRateLimit } from '@/lib/request-guard'

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
export async function GET(req: Request) {
  const limited = enforceRateLimit(req, 'github:read')
  if (limited) return limited

  let t: Awaited<ReturnType<typeof resolveCallerTenant>> = {
    tenantId: null,
    code: 'signed_out',
    reason: 'Sign in first — installs belong to your business.',
  }
  try {
    const supabase = createClient()
    const { data } = await supabase.auth.getUser()
    t = await resolveCallerTenant({
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
    // Leave the signed-out refusal in place.
  }
  if (t.tenantId === null) return tenantRefusalResponse(t)
  const rows = await getInstallationsDb(t.tenantId)
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

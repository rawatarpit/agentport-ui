import { brokerFetch } from '@/lib/github-broker'
import { resolveCallerTenant } from '@/lib/tenant'
import { readSelectedTenantId, tenantRefusalResponse } from '@/lib/tenant-server'
import { createClient } from '@/lib/supabase/server'

import { enforceRateLimit } from '@/lib/request-guard'

export const dynamic = 'force-dynamic'

/**
 * GET /api/github/installations — App installs linked to the caller's tenant.
 *
 * The broker revalidates each installation live (a revoked install mints
 * nothing and is hidden); this route only resolves the caller's tenant and
 * forwards the request. No installation token is stored or returned.
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
  return brokerFetch(req, `/installations?tenantId=${encodeURIComponent(t.tenantId)}`)
}

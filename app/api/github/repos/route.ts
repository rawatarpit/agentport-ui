import { brokerFetch } from '@/lib/github-broker'
import { resolveCallerTenant } from '@/lib/tenant'
import { readSelectedTenantId, tenantRefusalResponse } from '@/lib/tenant-server'
import { createClient } from '@/lib/supabase/server'

import { enforceRateLimit } from '@/lib/request-guard'

export const dynamic = 'force-dynamic'

async function callerTenant(): Promise<Awaited<ReturnType<typeof resolveCallerTenant>>> {
  try {
    const supabase = createClient()
    const { data } = await supabase.auth.getUser()
    return await resolveCallerTenant({
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
    return { tenantId: null, code: 'signed_out', reason: 'Sign in first — installs belong to your business.' }
  }
}

/**
 * GET /api/github/repos?installation=<id> — repositories the installation
 * can touch. The broker checks the durable installation row for this tenant
 * before minting, so another tenant's id is refused, not listed.
 */
export async function GET(req: Request) {
  const limited = enforceRateLimit(req, 'github:read')
  if (limited) return limited

  const t = await callerTenant()
  if (t.tenantId === null) return tenantRefusalResponse(t)
  const installationId = Number(new URL(req.url).searchParams.get('installation') ?? '')
  if (!Number.isInteger(installationId) || installationId <= 0) {
    return Response.json(
      { status: 'error', reason: 'No connected repo found — connect one first.' },
      { status: 404 },
    )
  }
  return brokerFetch(
    req,
    `/repos?tenantId=${encodeURIComponent(t.tenantId)}&installation=${installationId}`,
  )
}

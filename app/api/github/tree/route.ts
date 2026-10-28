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
 * GET /api/github/tree?installation=<id>&repo=<owner/name>[&ref=<branch>] —
 * file inventory for mapping. The broker mints per call from its own key,
 * never stores the token, and returns paths + sizes only.
 */
export async function GET(req: Request) {
  const limited = enforceRateLimit(req, 'github:read')
  if (limited) return limited

  const t = await callerTenant()
  if (t.tenantId === null) return tenantRefusalResponse(t)
  const params = new URL(req.url).searchParams
  const installationId = Number(params.get('installation') ?? '')
  const repo = (params.get('repo') ?? '').trim()
  const ref = (params.get('ref') ?? '').trim()
  if (!Number.isInteger(installationId) || installationId <= 0) {
    return Response.json(
      { status: 'error', reason: 'No connected repo found — connect one first.' },
      { status: 404 },
    )
  }
  if (!repo) return Response.json({ status: 'error', reason: 'Pick a repository first.' }, { status: 400 })
  const query = new URLSearchParams({
    tenantId: t.tenantId,
    installation: String(installationId),
    repo,
    ref,
  })
  return brokerFetch(req, `/tree?${query.toString()}`)
}

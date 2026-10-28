import { getPullRequestsDb } from '@/lib/durable-store'
import { brokerFetch } from '@/lib/github-broker'
import { canManageIntegrations, resolveCallerContext, resolveCallerTenant } from '@/lib/tenant'
import { enforceRateLimit, guardStateChange } from '@/lib/request-guard'
import { readSelectedTenantId, tenantRefusalResponse } from '@/lib/tenant-server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

async function callerContext(): Promise<Awaited<ReturnType<typeof resolveCallerContext>>> {
  try {
    const supabase = createClient()
    const { data } = await supabase.auth.getUser()
    return await resolveCallerContext({
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
    return { userId: null, tenantId: null, role: null, reason: 'Sign in first — installs belong to your business.' }
  }
}

async function callerTenantId(): Promise<Awaited<ReturnType<typeof resolveCallerTenant>>> {
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
 * POST /api/github/pr — open (or update) the install pull request.
 *
 * Owner/admin only. The console forwards the selected tenant, installation
 * and repo; the broker independently verifies membership, checks the durable
 * installation row, builds the discovery package from the tenant's drafts,
 * mints a one-hour installation token, and opens the PR. Nothing here can
 * merge or deploy it.
 */
export async function POST(req: Request) {
  const guarded = guardStateChange(req, 'github:pr')
  if (guarded) return guarded
  const t = await callerContext()
  if (t.tenantId === null) return tenantRefusalResponse(t)
  if (!canManageIntegrations(t.role)) {
    return Response.json(
      { status: 'error', reason: 'Only the owner or an admin of this business can open the install pull request.' },
      { status: 403 },
    )
  }
  let body: { installationId?: unknown; repo?: unknown }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return Response.json({ status: 'error', reason: 'Body must be JSON.' }, { status: 400 })
  }
  const installationId = Number(body.installationId)
  const repo = typeof body.repo === 'string' ? body.repo.trim() : ''
  if (!Number.isInteger(installationId) || installationId <= 0) {
    return Response.json(
      { status: 'error', reason: 'No connected repo found — connect one first.' },
      { status: 404 },
    )
  }
  if (!repo || !repo.includes('/')) {
    return Response.json(
      { status: 'error', reason: 'Pick one of the repositories the installation can touch.' },
      { status: 400 },
    )
  }
  return brokerFetch(req, '/pr/open', {
    method: 'POST',
    body: JSON.stringify({ tenantId: t.tenantId, installationId, repo }),
  })
}

/**
 * GET /api/github/pr?repo= — live PR state for the dashboard card.
 *
 * The broker reads the durable PR hint, re-checks the installation row, and
 * reads GitHub live. Read-only by construction. No record yet is an explicit
 * `none`, never an empty widget pretending a PR is coming.
 */
export async function GET(req: Request) {
  const limited = enforceRateLimit(req, 'github:read')
  if (limited) return limited
  const t = await callerTenantId()
  if (t.tenantId === null) return tenantRefusalResponse(t)
  let repo = (new URL(req.url).searchParams.get('repo') ?? '').trim()
  if (!repo) {
    const prs = await getPullRequestsDb(t.tenantId)
    repo = prs[0]?.repo ?? ''
  }
  if (!repo) {
    return Response.json({ status: 'ok', pr: { state: 'none', reason: 'No pull request opened yet.' } })
  }
  const query = new URLSearchParams({ tenantId: t.tenantId, repo })
  return brokerFetch(req, `/pr/state?${query.toString()}`)
}

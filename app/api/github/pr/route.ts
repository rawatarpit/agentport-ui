import { mintInstallationTokenFor, openInstallPr, readPrState } from '@/lib/github'
import { buildInstallFile } from '@/lib/golive'
import { getInstallations, getPullRequests, recordPullRequest } from '@/lib/store'
import { resolveCallerTenant } from '@/lib/tenant'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

async function callerTenantId(req?: Request): Promise<{ tenantId: string } | { tenantId: null; reason: string }> {
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
    void req
    return t
  } catch {
    return { tenantId: null, reason: 'Sign in first — installs belong to your business.' }
  }
}

/**
 * POST /api/github/pr — open (or update) the install pull request.
 *
 * Body: { installationId, repo }. The installation must be linked to the
 * caller's tenant (RAM binding until the durable installs table lands —
 * SDK repo owns the DB): another tenant's id is refused, not acted on.
 * Compiles the caller's drafts into the install file, mints a one-hour
 * installation token, and opens the PR on `agentport/install`. Re-running
 * updates the same branch and the same PR. Nothing here merges.
 */
export async function POST(req: Request) {
  const t = await callerTenantId(req)
  if (t.tenantId === null) {
    return Response.json({ status: 'error', reason: t.reason }, { status: 401 })
  }
  const tenantId = t.tenantId
  let body: { installationId?: unknown; repo?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ status: 'error', reason: 'Body must be JSON.' }, { status: 400 })
  }
  const installationId = Number(body.installationId)
  const repo = typeof body.repo === 'string' ? body.repo.trim() : ''
  if (!Number.isInteger(installationId) || installationId <= 0) {
    return Response.json({ status: 'error', reason: 'No connected repo found — connect one first.' }, { status: 404 })
  }
  if (!getInstallations(tenantId).some((i) => i.installationId === installationId)) {
    return Response.json({ status: 'error', reason: 'No connected repo found — connect one first.' }, { status: 404 })
  }
  if (!repo || !repo.includes('/')) {
    return Response.json({ status: 'error', reason: 'Pick one of the repositories the installation can touch.' }, { status: 400 })
  }

  const file = buildInstallFile(tenantId)
  if (!file.ok) {
    return Response.json({ status: 'error', reason: file.reason }, { status: 422 })
  }
  const minted = await mintInstallationTokenFor(installationId)
  if (!minted.ok) {
    return Response.json({ status: 'error', reason: minted.reason }, { status: 503 })
  }
  const opened = await openInstallPr({
    installationToken: minted.token,
    repoFullName: repo,
    filePath: file.path,
    fileContent: file.content,
    prTitle: 'Install AgentPort runtime',
    prBody:
      'This pull request adds the governed runtime wiring for this site.\n\n' +
      'What it asks for: read/write on contents and pull requests (to open this branch), read-only on checks.\n\n' +
      'Review it like any other change. Merge = live: what merges is what enforces, and nothing here can merge for you.',
  })
  if (!opened.ok) {
    return Response.json({ status: 'error', reason: opened.reason }, { status: 502 })
  }
  recordPullRequest(tenantId, {
    repo,
    number: opened.prNumber,
    url: opened.prUrl,
    branch: opened.branch,
    installationId,
  })
  return Response.json({ status: 'ok', pr: { repo, number: opened.prNumber, url: opened.prUrl, branch: opened.branch } })
}

/**
 * GET /api/github/pr?repo= — live PR state for the dashboard card.
 *
 * Reads branch, merge state, and check rollup through a fresh installation
 * token. Read-only by construction. No record yet is an explicit `none`,
 * never an empty widget pretending a PR is coming.
 */
export async function GET(req: Request) {
  const t = await callerTenantId(req)
  if (t.tenantId === null) {
    return Response.json({ status: 'error', reason: t.reason }, { status: 401 })
  }
  const tenantId = t.tenantId
  const repo = new URL(req.url).searchParams.get('repo') ?? ''
  const record = getPullRequests(tenantId).find((r) => (repo ? r.repo === repo : true))
  if (!record) {
    return Response.json({ status: 'ok', pr: { state: 'none', reason: 'No pull request opened yet.' } })
  }
  const minted = await mintInstallationTokenFor(record.installationId)
  if (!minted.ok) {
    return Response.json({ status: 'error', reason: minted.reason }, { status: 503 })
  }
  const state = await readPrState({ installationToken: minted.token, repoFullName: record.repo, prNumber: record.number })
  if (!state.ok) {
    return Response.json({ status: 'error', reason: state.reason }, { status: 502 })
  }
  return Response.json({ status: 'ok', pr: { ...state, repo: record.repo, number: record.number } })
}

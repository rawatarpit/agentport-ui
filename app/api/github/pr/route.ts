import { mintInstallationTokenFor, openInstallPr, readPrState } from '@/lib/github'
import { buildInstallFile } from '@/lib/golive'
import { getInstallations, getPullRequests, recordPullRequest, resolveTenant } from '@/lib/store'

export const dynamic = 'force-dynamic'

/**
 * POST /api/github/pr — open (or update) the install pull request.
 *
 * Body: { installationId, repo }. Compiles the tenant's drafts into the
 * install file, mints a one-hour installation token, and opens the PR on
 * `agentport/install`. Re-running updates the same branch and the same PR —
 * opening duplicates would turn review into archaeology, so the record is
 * replaced, never appended. Nothing here merges: the merge stays the
 * merchant's, in their repo, under their branch protection.
 */
export async function POST(req: Request) {
  const tenantId = resolveTenant()
  let body: { installationId?: unknown; repo?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ status: 'error', reason: 'Body must be JSON.' }, { status: 400 })
  }
  const installationId = Number(body.installationId)
  const repo = typeof body.repo === 'string' ? body.repo.trim() : ''
  if (!getInstallations(tenantId).some((i) => i.installationId === installationId)) {
    return Response.json({ status: 'error', reason: 'Unknown installation — install the App first.' }, { status: 404 })
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
    prTitle: 'Govern agent access with AgentPort',
    prBody:
      'This pull request adds the governed runtime wiring for this site.\n\n' +
      'Review it like any other change: what merges is what enforces.\n' +
      'Merging is your signature — nothing here can merge for you.',
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
  const tenantId = resolveTenant()
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

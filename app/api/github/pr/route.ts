import {
  mintInstallationTokenFor,
  openInstallPr,
  readPrState,
  readRepoFile,
  readRepoInfo,
  readRepoTree,
} from '@/lib/github'
import {
  buildInstallPackageFrom,
  detectPublishTarget,
  normaliseWorkerUrl,
} from '@/lib/install-package'
import {
  getDraftDb,
  getPullRequestsDb,
  getTenantProfileDb,
  installationKnownDb,
  recordPullRequestDb,
} from '@/lib/durable-store'
import { canManageIntegrations, resolveCallerContext, resolveCallerTenant } from '@/lib/tenant'
import { enforceRateLimit, guardStateChange } from '@/lib/request-guard'
import { readSelectedTenantId, tenantRefusalResponse } from '@/lib/tenant-server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

async function callerContext(
  req?: Request,
): Promise<{ tenantId: string; role: string } | { tenantId: null; code?: string; reason?: string }> {
  try {
    const supabase = createClient()
    const { data } = await supabase.auth.getUser()
    const c = await resolveCallerContext({
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
    void req
    return c
  } catch {
    return { tenantId: null, reason: 'Sign in first — installs belong to your business.' }
  }
}

async function callerTenantId(req?: Request): Promise<{ tenantId: string } | { tenantId: null; reason: string }> {
  try {
    const supabase = createClient()
    const { data } = await supabase.auth.getUser()
    const t = await resolveCallerTenant({
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
    void req
    return t
  } catch {
    return { tenantId: null, reason: 'Sign in first — installs belong to your business.' }
  }
}

/**
 * POST /api/github/pr — open (or update) the install pull request.
 *
 * Body: { installationId, repo }. Owner/admin only. The installation must be
 * linked to the caller's tenant (durable row): another tenant's id is refused,
 * not acted on. Builds the caller's discovery package, detects where this framework
 * serves static files, mints a one-hour installation token, and opens the PR
 * on `agentport/install`. Re-running updates the same branch and PR. Nothing
 * here merges or deploys.
 */
export async function POST(req: Request) {
  const guarded = guardStateChange(req, 'github:pr')
  if (guarded) return guarded
  const t = await callerContext(req)
  if (t.tenantId === null) {
    return tenantRefusalResponse(t)
  }
  if (!canManageIntegrations(t.role)) {
    return Response.json(
      { status: 'error', reason: 'Only the owner or an admin of this business can open the install pull request.' },
      { status: 403 },
    )
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
  if (!(await installationKnownDb(tenantId, installationId))) {
    return Response.json({ status: 'error', reason: 'No connected repo found — connect one first.' }, { status: 404 })
  }
  if (!repo || !repo.includes('/')) {
    return Response.json({ status: 'error', reason: 'Pick one of the repositories the installation can touch.' }, { status: 400 })
  }

  const [rules, setup, capabilities, profile] = await Promise.all([
    getDraftDb(tenantId, 'rules'),
    getDraftDb(tenantId, 'setup'),
    getDraftDb(tenantId, 'capabilities'),
    getTenantProfileDb(tenantId),
  ])
  if (!profile || !profile.businessName) {
    return Response.json(
      { status: 'error', reason: 'Set the business name before opening an install pull request.' },
      { status: 422 },
    )
  }
  const worker = normaliseWorkerUrl(process.env.AGENTPORT_WORKER_URL ?? '', tenantId)
  if (!worker.ok) {
    return Response.json({ status: 'error', reason: worker.reason }, { status: 503 })
  }
  const minted = await mintInstallationTokenFor(installationId)
  if (!minted.ok) {
    return Response.json({ status: 'error', reason: minted.reason }, { status: 503 })
  }
  const info = await readRepoInfo({ installationToken: minted.token, repoFullName: repo })
  if (!info.ok) {
    return Response.json({ status: 'error', reason: info.reason }, { status: 502 })
  }
  const tree = await readRepoTree({
    installationToken: minted.token,
    repoFullName: repo,
    ref: info.value.defaultBranch,
  })
  if (!tree.ok) {
    return Response.json({ status: 'error', reason: tree.reason }, { status: 502 })
  }
  if (tree.value.truncated) {
    return Response.json(
      { status: 'error', reason: 'The repository tree is too large to inspect safely. Pick a smaller website repository.' },
      { status: 422 },
    )
  }
  const paths = tree.value.entries.map((entry) => entry.path)
  const target = detectPublishTarget(paths)
  if (target.ambiguous) {
    return Response.json(
      {
        status: 'error',
        reason:
          'More than one website package matched. Pick the repository that serves the site, or open the install PR from a single-site repository.',
      },
      { status: 422 },
    )
  }
  const root = target.root ? `${target.root}/` : ''
  const prefix = `${root}${target.dir === '.' ? '' : `${target.dir}/`}`
  const manifestPath = `${prefix}.well-known/agent.json`
  const accessPath = `${prefix}.well-known/agent-access.html`
  const packageJsonPath = `${root}package.json`
  const llmsPath = `${prefix}llms.txt`
  const readIfPresent = async (path: string) => {
    if (!paths.includes(path)) return null
    const file = await readRepoFile({
      installationToken: minted.token,
      repoFullName: repo,
      path,
      ref: info.value.defaultBranch,
    })
    if (!file.ok) throw new Error(file.reason)
    return file.value
  }
  let existingManifest: string | null = null
  let existingAccessPage: string | null = null
  let existingLlms: string | null = null
  let packageJson: string | null = null
  try {
    ;[existingManifest, existingAccessPage, existingLlms, packageJson] = await Promise.all([
      readIfPresent(manifestPath),
      readIfPresent(accessPath),
      readIfPresent(llmsPath),
      readIfPresent(packageJsonPath),
    ])
  } catch (error) {
    return Response.json(
      { status: 'error', reason: error instanceof Error ? error.message : 'Could not read the repository files.' },
      { status: 502 },
    )
  }
  const pkg = buildInstallPackageFrom({
    drafts: {
      rules: rules?.payload,
      setup: setup?.payload,
      capabilities: capabilities?.payload,
    },
    tenantId,
    business: profile.businessName,
    siteUrl: profile.websiteUrl,
    workerUrl: worker.url,
    publishTarget: target,
    packageJson,
    existingManifest,
    existingAccessPage,
    existingLlms,
  })
  if (!pkg.ok) {
    return Response.json({ status: 'error', reason: pkg.reason }, { status: 422 })
  }
  const opened = await openInstallPr({
    installationToken: minted.token,
    repoFullName: repo,
    files: pkg.value.files,
    prTitle: 'Add Agent Port discovery package',
    prBody:
      'This pull request adds the Agent Port discovery package for this site.\n\n' +
      'It adds `agentport/` plus the files this framework serves at `/.well-known/agent.json` and `llms.txt`. ' +
      'It does not add a policy engine, a credential, a ledger, an approval queue, or an execution path. ' +
      'The hosted Agent Port governor evaluates every call and records every decision.\n\n' +
      `Target: \`${pkg.value.target.root || '.'}\` → \`${pkg.value.target.dir}\` (${pkg.value.target.framework}).\n\n` +
      'Review the diff like any other change. Merging this PR does not deploy it by itself; your normal CI/CD does. ' +
      'Nothing here can merge the PR for you.',
  })
  if (!opened.ok) {
    return Response.json({ status: 'error', reason: opened.reason }, { status: 502 })
  }
  await recordPullRequestDb(tenantId, {
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
  const limited = enforceRateLimit(req, 'github:read')
  if (limited) return limited
  const t = await callerTenantId(req)
  if (t.tenantId === null) {
    return tenantRefusalResponse(t)
  }
  const tenantId = t.tenantId
  const repo = new URL(req.url).searchParams.get('repo') ?? ''
  const record = (await getPullRequestsDb(tenantId)).find((r) => (repo ? r.repo === repo : true))
  if (!record) {
    return Response.json({ status: 'ok', pr: { state: 'none', reason: 'No pull request opened yet.' } })
  }
  // A PR hint is not authority: the installation must still be a durable row
  // linked to this tenant by the state-bound callback. Otherwise a stale or
  // forged record could mint a token for someone else's installation.
  if (!(await installationKnownDb(tenantId, record.installationId))) {
    return Response.json({ status: 'ok', pr: { state: 'none', reason: 'No connected installation for this pull request.' } })
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

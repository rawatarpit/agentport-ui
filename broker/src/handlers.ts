import {
  candidatePrivateKeys,
  createAppJwt,
  exchangeOAuthCode,
  getAuthenticatedUser,
  listInstallationRepos,
  listUserInstallations,
  mintInstallationTokenFor,
  openInstallPr,
  readPrState,
  readRepoFile,
  readRepoInfo,
  readRepoTree,
  verifyInstallationOwnership,
  verifyWebhookSignature,
} from '@/lib/github'
import { installUrlFor } from '@/lib/install-state'
import { buildInstallPackageFrom, detectPublishTarget, normaliseWorkerUrl } from '@/lib/install-package'
import { canManageIntegrations } from '@/lib/tenant'
import {
  getDrafts,
  getProfile,
  getPullRequest,
  installationKnown,
  listInstallations,
  recordPullRequest,
  roleFor,
  verifyTenantCaller,
  verifyUser,
} from './caller'
import type { BrokerConfig } from './config'
import { missingGithubConfig } from './config'
import type { InstallRecorder } from './install-recorder'
import type { InstallStateStore } from './state-store'

export type BrokerResponse = { status: number; body: unknown }

const PR_TITLE = 'Add Agent Port discovery package'
const PR_BODY =
  'This pull request adds the Agent Port discovery package for this site.\n\n' +
  'It adds `agentport/` plus the files this framework serves at `/.well-known/agent.json` and `llms.txt`. ' +
  'It does not add a policy engine, a credential, a ledger, an approval queue, or an execution path. ' +
  'The hosted Agent Port governor evaluates every call and records every decision.\n\n' +
  'Review the diff like any other change. Merging this PR does not deploy it by itself; your normal CI/CD does. ' +
  'Nothing here can merge the PR for you.'

function ok(body: unknown): BrokerResponse {
  return { status: 200, body }
}

function fail(reason: string, status = 400): BrokerResponse {
  return { status, body: { status: 'error', reason } }
}

function creds(config: BrokerConfig): { appId: string; privateKey: string } {
  return { appId: config.githubAppId, privateKey: config.githubAppPrivateKey }
}

function mintFailure(reason: string): string {
  if (reason === 'unknown installation') return 'installation-unknown'
  if (reason === 'GitHub App is not configured — install it first') return 'installation-key-missing'
  if (reason === 'GitHub App key does not parse') return 'installation-key-parse'
  if (reason === 'app authentication refused') return 'installation-key-auth'
  return 'installation-unverified'
}

export async function handleInstall(args: {
  config: BrokerConfig
  jwt: string
  tenantId: string
  stateStore: InstallStateStore
}): Promise<BrokerResponse> {
  const verified = await verifyTenantCaller(args.config, args.jwt, args.tenantId)
  if ('error' in verified) return fail(verified.error, verified.status)
  if (!canManageIntegrations(verified.role)) {
    return fail('Only the owner or an admin of this business can connect GitHub.', 403)
  }
  const issued = await args.stateStore.issue({
    tenantId: args.tenantId,
    initiatedBy: verified.caller.userId,
  })
  return ok({ status: 'ok', installUrl: installUrlFor(issued.state), expiresAt: issued.expiresAt })
}

export async function handleCallback(args: {
  config: BrokerConfig
  jwt: string
  query: URLSearchParams
  stateStore: InstallStateStore
  recorder: InstallRecorder
}): Promise<BrokerResponse> {
  const state = args.query.get('state') ?? ''
  const code = args.query.get('code') ?? ''
  const installationIdParam = args.query.get('installation_id') ?? ''

  if (state.length === 0) return fail('install-state-missing')
  if (state.length > 256) return fail('install-state-invalid')

  const caller = await verifyUser(args.config, args.jwt)
  if ('error' in caller) return fail('sign-in-required', 401)

  const consumed = await args.stateStore.consume(state)
  if (!consumed) return fail('install-state-invalid')
  if (consumed.initiatedBy !== caller.userId) return fail('install-state-session', 403)

  const role = await roleFor(caller, consumed.tenantId)
  if (!role || !canManageIntegrations(role)) return fail('install-start', 403)

  let requestedId: number | null = null
  if (installationIdParam.length > 0) {
    if (!/^[0-9]+$/.test(installationIdParam)) return fail('installation-id-invalid')
    requestedId = Number(installationIdParam)
    if (!Number.isSafeInteger(requestedId) || requestedId <= 0) return fail('installation-id-invalid')
  }

  if (!code) {
    if (requestedId !== null) return fail('installation-unverified')
    return fail('missing-installation')
  }

  const clientId = args.config.githubClientId
  const clientSecret = args.config.githubClientSecret
  if (!clientId || !clientSecret) return fail('oauth-unconfigured', 503)

  const exchanged = await exchangeOAuthCode({ clientId, clientSecret, code })
  if (!exchanged.ok) return fail(`oauth-${exchanged.reason}`)
  const userToken = exchanged.accessToken

  const appId = args.config.githubAppId
  if (!appId) return fail('installation-key', 503)

  const listed = await listUserInstallations(userToken)
  if (!listed.ok) return fail('installation-unverified', 502)

  const install = { installationId: 0, accountLogin: '', installerLogin: null as string | null }
  if (requestedId !== null) {
    const owned = await verifyInstallationOwnership(userToken, appId, requestedId, listed.value)
    if (!owned.ok) return fail(owned.reason, 403)
    install.installationId = requestedId
    install.accountLogin = owned.value.accountLogin
  } else {
    const owned: Array<{ id: number; accountLogin: string }> = []
    for (const candidate of listed.value) {
      if (candidate.appId !== appId) continue
      const verified = await verifyInstallationOwnership(userToken, appId, candidate.id, listed.value)
      if (verified.ok) owned.push({ id: verified.value.id, accountLogin: verified.value.accountLogin })
    }
    if (owned.length === 0) return fail('install-incomplete')
    if (owned.length > 1) return fail('installation-ambiguous')
    const only = owned[0]
    if (!only) return fail('install-incomplete')
    install.installationId = only.id
    install.accountLogin = only.accountLogin
  }

  const minted = await mintInstallationTokenFor(install.installationId, creds(args.config))
  if (!minted.ok) return fail(mintFailure(minted.reason), 503)

  const me = await getAuthenticatedUser(userToken)
  if (me.ok && me.value.login) install.installerLogin = me.value.login

  const recorded = await args.recorder.record({
    tenantId: consumed.tenantId,
    installationId: install.installationId,
    accountLogin: install.accountLogin,
    installerLogin: install.installerLogin,
  })
  if (!recorded) return fail('install-record', 503)

  return ok({ status: 'ok', installationId: install.installationId })
}

export async function handleInstallations(args: {
  config: BrokerConfig
  jwt: string
  tenantId: string
}): Promise<BrokerResponse> {
  const verified = await verifyTenantCaller(args.config, args.jwt, args.tenantId)
  if ('error' in verified) return fail(verified.error, verified.status)

  const rows = await listInstallations(verified.caller, args.tenantId)
  const live: Array<{ installationId: number; accountLogin: string; receivedAt: string }> = []
  for (const row of rows) {
    const minted = await mintInstallationTokenFor(row.installationId, creds(args.config))
    // A revoked install and a broken App key are both "not connected" to the
    // merchant. Only a successful mint is proof; never infer it from the row.
    if (!minted.ok) continue
    live.push({
      installationId: row.installationId,
      accountLogin: row.accountLogin,
      receivedAt: row.receivedAt,
    })
  }
  return ok({ status: 'ok', installations: live })
}

export async function handleRepos(args: {
  config: BrokerConfig
  jwt: string
  tenantId: string
  installationId: number
}): Promise<BrokerResponse> {
  const verified = await verifyTenantCaller(args.config, args.jwt, args.tenantId)
  if ('error' in verified) return fail(verified.error, verified.status)
  if (!(await installationKnown(verified.caller, args.tenantId, args.installationId))) {
    return fail('No connected repo found — connect one first.', 404)
  }
  const minted = await mintInstallationTokenFor(args.installationId, creds(args.config))
  if (!minted.ok) return fail(minted.reason, 503)
  const repos = await listInstallationRepos(minted.token)
  if (!repos.ok) return fail(repos.reason, 502)
  return ok({ status: 'ok', repos: repos.value })
}

export async function handleTree(args: {
  config: BrokerConfig
  jwt: string
  tenantId: string
  installationId: number
  repo: string
  ref: string
}): Promise<BrokerResponse> {
  const verified = await verifyTenantCaller(args.config, args.jwt, args.tenantId)
  if ('error' in verified) return fail(verified.error, verified.status)
  if (!(await installationKnown(verified.caller, args.tenantId, args.installationId))) {
    return fail('No connected repo found — connect one first.', 404)
  }
  if (!args.repo) return fail('Pick a repository first.')
  const minted = await mintInstallationTokenFor(args.installationId, creds(args.config))
  if (!minted.ok) return fail(minted.reason, 503)
  const tree = await readRepoTree({
    installationToken: minted.token,
    repoFullName: args.repo,
    ref: args.ref,
  })
  if (!tree.ok) return fail(tree.reason, 502)
  return ok({ status: 'ok', repo: args.repo, ref: args.ref, ...tree.value })
}

export async function handlePrOpen(args: {
  config: BrokerConfig
  jwt: string
  body: unknown
}): Promise<BrokerResponse> {
  const body = (args.body ?? {}) as { tenantId?: unknown; installationId?: unknown; repo?: unknown }
  const tenantId = typeof body.tenantId === 'string' ? body.tenantId.trim() : ''
  const installationId = Number(body.installationId)
  const repo = typeof body.repo === 'string' ? body.repo.trim() : ''

  const verified = await verifyTenantCaller(args.config, args.jwt, tenantId)
  if ('error' in verified) return fail(verified.error, verified.status)
  if (!canManageIntegrations(verified.role)) {
    return fail('Only the owner or an admin of this business can open the install pull request.', 403)
  }
  if (!Number.isSafeInteger(installationId) || installationId <= 0) {
    return fail('No connected repo found — connect one first.', 404)
  }
  if (!(await installationKnown(verified.caller, tenantId, installationId))) {
    return fail('No connected repo found — connect one first.', 404)
  }
  if (!repo || !repo.includes('/')) {
    return fail('Pick one of the repositories the installation can touch.')
  }

  const [drafts, profile] = await Promise.all([
    getDrafts(verified.caller, tenantId),
    getProfile(verified.caller, tenantId),
  ])
  if (!profile || !profile.businessName) {
    return fail('Set the business name before opening an install pull request.', 422)
  }
  const worker = normaliseWorkerUrl(args.config.workerUrl, tenantId)
  if (!worker.ok) return fail(worker.reason, 503)

  const minted = await mintInstallationTokenFor(installationId, creds(args.config))
  if (!minted.ok) return fail(minted.reason, 503)
  const info = await readRepoInfo({ installationToken: minted.token, repoFullName: repo })
  if (!info.ok) return fail(info.reason, 502)
  const tree = await readRepoTree({
    installationToken: minted.token,
    repoFullName: repo,
    ref: info.value.defaultBranch,
  })
  if (!tree.ok) return fail(tree.reason, 502)
  if (tree.value.truncated) {
    return fail('The repository tree is too large to inspect safely. Pick a smaller website repository.', 422)
  }

  const paths = tree.value.entries.map((entry) => entry.path)
  const target = detectPublishTarget(paths)
  if (target.ambiguous) {
    return fail(
      'More than one website package matched. Pick the repository that serves the site, or open the install PR from a single-site repository.',
      422,
    )
  }
  const root = target.root ? `${target.root}/` : ''
  const prefix = `${root}${target.dir === '.' ? '' : `${target.dir}/`}`
  const manifestPath = `${prefix}.well-known/agent.json`
  const accessPath = `${prefix}.well-known/agent-access.html`
  const packageJsonPath = `${root}package.json`
  const llmsPath = `${prefix}llms.txt`

  const readIfPresent = async (path: string): Promise<string | null> => {
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
    return fail(error instanceof Error ? error.message : 'Could not read the repository files.', 502)
  }

  const pkg = buildInstallPackageFrom({
    drafts,
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
  if (!pkg.ok) return fail(pkg.reason, 422)

  const opened = await openInstallPr({
    installationToken: minted.token,
    repoFullName: repo,
    files: pkg.value.files,
    prTitle: PR_TITLE,
    prBody: PR_BODY,
  })
  if (!opened.ok) return fail(opened.reason, 502)

  await recordPullRequest(verified.caller, tenantId, {
    repo,
    number: opened.prNumber,
    url: opened.prUrl,
    branch: opened.branch,
    installationId,
  })
  return ok({
    status: 'ok',
    pr: { repo, number: opened.prNumber, url: opened.prUrl, branch: opened.branch },
  })
}

export async function handlePrState(args: {
  config: BrokerConfig
  jwt: string
  tenantId: string
  repo: string
}): Promise<BrokerResponse> {
  const verified = await verifyTenantCaller(args.config, args.jwt, args.tenantId)
  if ('error' in verified) return fail(verified.error, verified.status)
  const record = await getPullRequest(verified.caller, args.tenantId, args.repo)
  if (!record) {
    return ok({ status: 'ok', pr: { state: 'none', reason: 'No pull request opened yet.' } })
  }
  if (!(await installationKnown(verified.caller, args.tenantId, record.installationId))) {
    return ok({
      status: 'ok',
      pr: { state: 'none', reason: 'No connected installation for this pull request.' },
    })
  }
  const minted = await mintInstallationTokenFor(record.installationId, creds(args.config))
  if (!minted.ok) return fail(minted.reason, 503)
  const state = await readPrState({
    installationToken: minted.token,
    repoFullName: record.repo,
    prNumber: record.number,
  })
  if (!state.ok) return fail(state.reason, 502)
  // The dashboard card renders the repo and PR number from this response;
  // they are hints from our own row, while state/checks/url are live GitHub.
  return ok({ status: 'ok', pr: { ...state, repo: record.repo, number: record.number } })
}

export function handleStatus(config: BrokerConfig): BrokerResponse {
  const missing = missingGithubConfig(config)
  return ok({
    status: 'ok',
    configured: missing.length === 0,
    missing,
    rev: 'github-broker-1',
    flow: [
      'Connect a repo (selected repositories, minimum scopes)',
      'We open branch agentport/install with the snippet, CLI and runtime wiring',
      'Their CI runs; they review; they merge — the merge is the signature',
      'Sync status and heartbeat land on this screen',
    ],
    pr: { state: 'none', reason: 'No GitHub App connected — no pull request exists yet.' },
  })
}

export async function handleDiag(args: { config: BrokerConfig; jwt: string }): Promise<BrokerResponse> {
  const caller = await verifyUser(args.config, args.jwt)
  if ('error' in caller) return fail(caller.error, caller.status)

  const raw = args.config.githubAppPrivateKey
  const trimmed = raw.trim()
  const lines = trimmed.split('\n')
  const candidates = candidatePrivateKeys(trimmed)
  let keyParses = false
  if (args.config.githubAppId) {
    for (const candidate of candidates) {
      try {
        createAppJwt(args.config.githubAppId, candidate)
        keyParses = true
        break
      } catch {
        // Try the next normalized candidate.
      }
    }
  }
  return ok({
    status: 'ok',
    appIdPresent: args.config.githubAppId.length > 0,
    appIdValue: args.config.githubAppId,
    keyChars: trimmed.length,
    startsWithDashes: trimmed.startsWith('-----BEGIN'),
    endsWithDashes: trimmed.trimEnd().endsWith('-----'),
    mentionsPrivateKey: trimmed.includes('PRIVATE KEY'),
    realNewlines: trimmed.split('\n').length - 1,
    literalBackslashN: trimmed.split('\\n').length - 1,
    carriageReturns: (trimmed.match(/\r/g) ?? []).length,
    firstLineLen: lines[0]?.length ?? 0,
    lineCount: lines.length,
    keyCandidates: candidates.length,
    keyParses,
  })
}

export function handleWebhook(args: {
  config: BrokerConfig
  rawBody: string
  signature: string | null
  event: string
  delivery: string
}): BrokerResponse {
  const secret = args.config.githubWebhookSecret
  if (!secret) return fail('GitHub App not configured — no webhook secret.', 503)
  const verdict = verifyWebhookSignature(secret, args.rawBody, args.signature)
  if (!verdict.ok) return fail(`Delivery refused: ${verdict.reason}.`, 401)

  if (args.event === 'ping') {
    return ok({ status: 'ok', event: 'ping', delivery: args.delivery })
  }

  let body: {
    action?: unknown
    installation?: { id?: unknown; account?: { login?: unknown } }
    repositories?: Array<{ full_name?: unknown }>
  }
  try {
    body = JSON.parse(args.rawBody) as typeof body
  } catch {
    return fail('Delivery is signed but not JSON.')
  }

  if (args.event === 'installation' && typeof body.action === 'string') {
    const id = body.installation?.id
    if (typeof id === 'number') {
      return ok({ status: 'ok', event: 'installation', action: body.action, delivery: args.delivery })
    }
  }

  if (
    args.event === 'pull_request' ||
    args.event === 'check_run' ||
    args.event === 'installation_repositories'
  ) {
    return ok({
      status: 'ok',
      event: args.event,
      action: body.action ?? null,
      delivery: args.delivery,
      note: 'Recorded for a future sync panel; no action taken.',
    })
  }

  return ok({ status: 'ok', event: args.event, delivery: args.delivery, ignored: true })
}

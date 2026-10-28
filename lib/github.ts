import { createHmac, createSign, timingSafeEqual } from 'node:crypto'
import { isSafeRepoPath } from './repo-path'

/**
 * GitHub App primitives — pure functions, no framework, no store.
 *
 * Everything here is keyed off environment the merchant owns: the App ID,
 * the private key GitHub generated once, the webhook secret, and the OAuth
 * client pair. None of it is inventable in code, and none of it may reach
 * the browser — the `NEXT_PUBLIC_` build guard refuses those outright.
 *
 * Deliberately no Octokit dependency. The calls below are five small fetches
 * with fixed shapes; a client library would buy retry ergonomics we must NOT
 * have (a retried installation-token mint is a second live token) at the
 * cost of a supply chain the merchant inherits.
 */

export type WebhookVerifyResult = { ok: true } | { ok: false; reason: string }

/**
 * Verify a GitHub webhook delivery: HMAC-SHA256 over the EXACT raw bytes,
 * expected in `x-hub-signature-256` as `sha256=<hex>`.
 *
 * Compares in constant time over equal-length buffers only — a length leak
 * tells an attacker nothing here (lengths are not secret), but a short-circuit
 * compare would tell them which byte failed, so both are refused the same way.
 */
export function verifyWebhookSignature(
  secret: string,
  rawBody: string,
  signatureHeader: string | null,
): WebhookVerifyResult {
  if (!signatureHeader) return { ok: false, reason: 'missing signature' }
  if (!signatureHeader.startsWith('sha256=')) return { ok: false, reason: 'malformed signature' }
  let presented: Buffer
  try {
    presented = Buffer.from(signatureHeader.slice('sha256='.length), 'hex')
  } catch {
    return { ok: false, reason: 'malformed signature' }
  }
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest()
  if (presented.length !== expected.length) return { ok: false, reason: 'signature mismatch' }
  if (!timingSafeEqual(presented, expected)) return { ok: false, reason: 'signature mismatch' }
  return { ok: true }
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

/**
 * Mint the App JWT: RS256, `iss` = App ID, issued 60s in the past for clock
 * skew, expiring in 10 minutes (GitHub's maximum). This authenticates AS THE
 * APP — it mints installation tokens, nothing else — and it lives ~10 minutes
 * by construction, so a logged JWT is a expired JWT.
 */
export function createAppJwt(appId: string, privateKeyPem: string, nowMs = Date.now()): string {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64url(
    JSON.stringify({
      iss: appId,
      iat: Math.floor(nowMs / 1000) - 60,
      exp: Math.floor(nowMs / 1000) + 10 * 60,
    }),
  )
  const signingInput = `${header}.${payload}`
  // createSign, not createPrivateKey + sign: the PEM stays a string and is
  // never converted into a handle anything else could retain.
  const signature = createSign('RSA-SHA256').update(signingInput).sign(privateKeyPem, 'base64url') as string
  return `${signingInput}.${signature}`
}

export type OAuthExchangeResult =
  | { ok: true; accessToken: string }
  | { ok: false; reason: string }

/**
 * Exchange the OAuth `code` from the install callback for the installer's
 * user token. Called once per install; the code is single-use and short-lived
 * by GitHub's design, so a replayed callback is refused upstream.
 */
export async function exchangeOAuthCode(opts: {
  clientId: string
  clientSecret: string
  code: string
}): Promise<OAuthExchangeResult> {
  let res: Response
  try {
    res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: opts.clientId,
        client_secret: opts.clientSecret,
        code: opts.code,
      }),
    })
  } catch {
    return { ok: false, reason: 'oauth exchange unreachable' }
  }
  let body: { access_token?: unknown; error?: unknown; error_description?: unknown }
  try {
    body = (await res.json()) as typeof body
  } catch {
    return { ok: false, reason: 'oauth exchange unreadable' }
  }
  if (typeof body.access_token === 'string' && body.access_token.length > 0) {
    return { ok: true, accessToken: body.access_token }
  }
  // The secret and the code stay out of the reason: GitHub's `error` values
  // (`bad_verification_code`, …) name the failure without naming credentials.
  return { ok: false, reason: typeof body.error === 'string' ? body.error : 'oauth exchange refused' }
}

export type InstallationTokenResult =
  | { ok: true; token: string; expiresAt: string }
  | { ok: false; reason: string }

/**
 * Server-side mint for a tenant's installation: reads the App credentials
 * from the environment (never arguments, never the browser), mints the
 * short-lived App JWT, then the hour-long installation token. The private
 * key arrives with literal `\n` in env and is restored before use — a PEM
 * that fails to parse fails closed here, not at GitHub with a confusing
 * 401.
 */export async function createInstallationToken(opts: {
  appJwt: string
  installationId: number
  permissions?: Record<string, string>
}): Promise<InstallationTokenResult> {
  let res: Response
  try {
    res = await fetch(`https://api.github.com/app/installations/${opts.installationId}/access_tokens`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${opts.appJwt}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify(opts.permissions ? { permissions: opts.permissions } : {}),
    })
  } catch {
    return { ok: false, reason: 'installation token mint unreachable' }
  }
  if (res.status === 401) return { ok: false, reason: 'app authentication refused' }
  if (res.status === 404) return { ok: false, reason: 'unknown installation' }
  if (!res.ok) return { ok: false, reason: `installation token mint refused (${res.status})` }
  let body: { token?: unknown; expires_at?: unknown }
  try {
    body = (await res.json()) as typeof body
  } catch {
    return { ok: false, reason: 'installation token unreadable' }
  }
  if (typeof body.token !== 'string' || typeof body.expires_at !== 'string') {
    return { ok: false, reason: 'installation token malformed' }
  }
  return { ok: true, token: body.token, expiresAt: body.expires_at }
}

const API = 'https://api.github.com'
const API_HEADERS = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }

export type InstallationRepo = { id: number; fullName: string; defaultBranch: string; private: boolean }

type GhResult<T> = { ok: true; value: T } | { ok: false; reason: string }
async function gh<T>(path: string, token: string, init?: RequestInit): Promise<GhResult<T>> {
  let res: Response
  try {
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: { ...API_HEADERS, Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
    })
  } catch {
    return { ok: false, reason: 'github unreachable' }
  }
  if (res.status === 401 || res.status === 403) return { ok: false, reason: 'github refused the credential' }
  if (res.status === 404) return { ok: false, reason: 'not found on GitHub' }
  if (res.status === 422) {
    const detail = await res.text().catch(() => '')
    return { ok: false, reason: detail.slice(0, 160) || 'github rejected the request' }
  }
  if (!res.ok) return { ok: false, reason: `github refused (${res.status})` }
  try {
    return { ok: true, value: (await res.json()) as T }
  } catch {
    return { ok: false, reason: 'github response unreadable' }
  }
}

type GhPage<T> = { ok: true; value: T; next: string | null } | { ok: false; reason: string }

/** Same failure mapping as `gh`, plus the Link: rel="next" path. */
async function ghPage<T>(path: string, token: string): Promise<GhPage<T>> {
  let res: Response
  try {
    res = await fetch(`${API}${path}`, {
      headers: { ...API_HEADERS, Authorization: `Bearer ${token}` },
    })
  } catch {
    return { ok: false, reason: 'github unreachable' }
  }
  if (res.status === 401 || res.status === 403) return { ok: false, reason: 'github refused the credential' }
  if (res.status === 404) return { ok: false, reason: 'not found on GitHub' }
  if (res.status === 422) {
    const detail = await res.text().catch(() => '')
    return { ok: false, reason: detail.slice(0, 160) || 'github rejected the request' }
  }
  if (!res.ok) return { ok: false, reason: `github refused (${res.status})` }
  let value: T
  try {
    value = (await res.json()) as T
  } catch {
    return { ok: false, reason: 'github response unreadable' }
  }
  return { ok: true, value, next: nextPagePath(res.headers.get('link')) }
}

function nextPagePath(link: string | null): string | null {
  if (!link) return null
  const match = link.match(/<([^>]+)>;\s*rel="next"/)
  if (!match) return null
  try {
    const url = new URL(match[1])
    if (url.origin !== API) return null
    return `${url.pathname}${url.search}`
  } catch {
    return null
  }
}

export type UserInstallation = {
  id: number
  accountLogin: string
  accountId: number | null
  accountType: string
  installedAt: string
  appId: string
}

/**
 * Installations the authorizing GitHub user can access, listed with their
 * own user token. Used to verify a named installation id and to discover a
 * code-only install. Paginated (`per_page=100` plus Link rel=next) so a
 * just-created install on page 2 is not silently missed. The token is the
 * caller's, used once, never stored.
 */
export async function listUserInstallations(userToken: string): Promise<GhResult<UserInstallation[]>> {
  const out: UserInstallation[] = []
  let path = '/user/installations?per_page=100'
  for (let page = 0; page < 20; page += 1) {
    const r = await ghPage<{
      installations?: Array<{
        id?: unknown
        account?: { login?: unknown; id?: unknown; type?: unknown }
        app_id?: unknown
        created_at?: unknown
        updated_at?: unknown
      }>
    }>(path, userToken)
    if (!r.ok) return r
    if (!Array.isArray(r.value.installations)) return { ok: false, reason: 'github response unreadable' }
    for (const item of r.value.installations) {
      if (!item || typeof item.id !== 'number' || !Number.isInteger(item.id) || item.id <= 0) continue
      const updatedAt = typeof item.updated_at === 'string' ? item.updated_at : ''
      const createdAt = typeof item.created_at === 'string' ? item.created_at : ''
      out.push({
        id: item.id,
        accountLogin: typeof item.account?.login === 'string' ? item.account.login : '',
        accountId:
          typeof item.account?.id === 'number' && Number.isSafeInteger(item.account.id) && item.account.id > 0
            ? item.account.id
            : null,
        accountType: typeof item.account?.type === 'string' ? item.account.type : '',
        installedAt: updatedAt || createdAt,
        appId: item.app_id === undefined || item.app_id === null ? '' : String(item.app_id),
      })
    }
    if (!r.next) return { ok: true, value: out }
    path = r.next
  }
  return { ok: false, reason: 'too many installations to enumerate' }
}

/**
 * Pure pick: the caller's latest installation of OUR app. Filters by App
 * ID first — /user/installations spans every app the user can access, and
 * linking another app's install would mint-fail later at best and
 * misattribute at worst. Most-recently-touched wins, so a reinstall
 * supersedes a stale row instead of resurrecting it.
 */
export function pickOurInstallation(installations: UserInstallation[], appId: string): UserInstallation | null {
  const want = (appId ?? '').trim()
  if (!want) return null
  const ours = installations.filter((i) => i.appId === want && Number.isInteger(i.id) && i.id > 0)
  if (ours.length === 0) return null
  ours.sort((a, b) => (a.installedAt < b.installedAt ? 1 : a.installedAt > b.installedAt ? -1 : 0))
  return ours[0] ?? null
}

/**
 * Does this exact installation id appear in the caller's own authorization,
 * for OUR App? A mint only proves the App can mint a token for an id; it
 * cannot prove the caller owns that install. The callback records nothing
 * until ownership is verified, so a victim's numeric id in a crafted URL
 * links nothing.
 */
export function hasOurInstallation(
  installations: UserInstallation[],
  appId: string,
  installationId: number,
): boolean {
  const want = (appId ?? '').trim()
  if (!want || !Number.isSafeInteger(installationId) || installationId <= 0) return false
  return installations.some((i) => i.id === installationId && i.appId === want)
}

export type GitHubUser = { id: number; login: string }
export type OrgMembership = { role: string; state: string }

/** The user behind a user-to-server token. Used only to prove account identity. */
export async function getAuthenticatedUser(userToken: string): Promise<GhResult<GitHubUser>> {
  const r = await gh<{ id?: unknown; login?: unknown }>('/user', userToken)
  if (!r.ok) return r
  if (typeof r.value.id !== 'number' || !Number.isSafeInteger(r.value.id) || r.value.id <= 0) {
    return { ok: false, reason: 'github user id unreadable' }
  }
  return {
    ok: true,
    value: {
      id: r.value.id,
      login: typeof r.value.login === 'string' ? r.value.login : '',
    },
  }
}

/** The caller's membership in one organization, with role and state. */
export async function getOrgMembership(userToken: string, org: string): Promise<GhResult<OrgMembership>> {
  const login = (org ?? '').trim()
  if (!login) return { ok: false, reason: 'organization login missing' }
  const r = await gh<{ role?: unknown; state?: unknown }>(
    `/user/memberships/orgs/${encodeURIComponent(login)}`,
    userToken,
  )
  if (!r.ok) return r
  return {
    ok: true,
    value: {
      role: typeof r.value.role === 'string' ? r.value.role : '',
      state: typeof r.value.state === 'string' ? r.value.state : '',
    },
  }
}

/**
 * Prove the authorizing user may bind this installation, not merely see it.
 *
 * GitHub's `/user/installations` lists installs the user can access; an org
 * member can see an org installation without being allowed to administer it.
 * For a personal account the installation's account id must equal `/user`'s
 * id. For an organization the caller must be an ACTIVE ADMIN. Without this,
 * an org member could bind the org's install to their own Agent Port tenant.
 */
export async function verifyInstallationOwnership(
  userToken: string,
  appId: string,
  installationId: number,
  listed?: UserInstallation[],
): Promise<GhResult<UserInstallation>> {
  const want = (appId ?? '').trim()
  if (!want) return { ok: false, reason: 'GitHub App ID missing' }
  if (!Number.isSafeInteger(installationId) || installationId <= 0) {
    return { ok: false, reason: 'installation id invalid' }
  }
  let installations: UserInstallation[]
  if (listed) {
    installations = listed
  } else {
    const read = await listUserInstallations(userToken)
    if (!read.ok) return read
    installations = read.value
  }
  const found = installations.find((i) => i.id === installationId && i.appId === want)
  if (!found) return { ok: false, reason: 'installation is not authorized by this GitHub user' }

  if (found.accountType === 'User') {
    const me = await getAuthenticatedUser(userToken)
    if (!me.ok) return me
    if (found.accountId === null || found.accountId !== me.value.id) {
      return { ok: false, reason: 'installation belongs to another GitHub account' }
    }
    return { ok: true, value: found }
  }

  if (found.accountType === 'Organization') {
    const membership = await getOrgMembership(userToken, found.accountLogin)
    if (!membership.ok) return { ok: false, reason: 'could not verify GitHub organization ownership' }
    if (membership.value.state !== 'active' || membership.value.role !== 'admin') {
      return { ok: false, reason: 'GitHub organization admin required' }
    }
    return { ok: true, value: found }
  }

  return { ok: false, reason: 'installation account type unknown' }
}

/**
 * Repositories the installation can touch. Names and default branches only —
 * the picker needs nothing else, and nothing else leaves GitHub.
 */
export async function listInstallationRepos(installationToken: string): Promise<GhResult<InstallationRepo[]>> {
  const r = await gh<{ repositories: Array<{ id: number; full_name: string; default_branch: string; private: boolean }> }>(
    '/installation/repositories?per_page=100',
    installationToken,
  )
  if (!r.ok) return r
  return {
    ok: true,
    value: r.value.repositories.map((repo) => ({
      id: repo.id,
      fullName: repo.full_name,
      defaultBranch: repo.default_branch,
      private: repo.private,
    })),
  }
}

export type RepoInfo = { fullName: string; defaultBranch: string }

/**
 * Read the one field the installer needs from the repo itself: the branch to
 * base a PR on. The installation token is scoped to this repo; a bad name is
 * a plain refusal, not a 500.
 */
export async function readRepoInfo(opts: {
  installationToken: string
  repoFullName: string
}): Promise<GhResult<RepoInfo>> {
  const parts = opts.repoFullName.split('/')
  if (parts.length !== 2 || parts.some((p) => p === '' || p === '.' || p === '..')) {
    return { ok: false, reason: 'repository name is not owner/name' }
  }
  const [owner, repo] = parts as [string, string]
  const r = await gh<{ full_name?: unknown; default_branch?: unknown }>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    opts.installationToken,
  )
  if (!r.ok) return r
  if (typeof r.value.full_name !== 'string' || typeof r.value.default_branch !== 'string') {
    return { ok: false, reason: 'github response unreadable' }
  }
  return { ok: true, value: { fullName: r.value.full_name, defaultBranch: r.value.default_branch } }
}

export type RepoTree = { entries: Array<{ path: string; size: number | null }>; truncated: boolean }

const TREE_ENTRY_CAP = 2000

/**
 * File inventory for mapping: recursive tree of one repo, blobs only.
 *
 * Paths + sizes, never contents — content reading is a separate, narrower
 * decision per file (route tables, manifests, workflows), because a tree
 * listing is metadata while file bodies are the merchant's source. The Map
 * flow consumes this as declared routes; live traffic still has to
 * corroborate them before anything publishes.
 *
 * Caps: truncated at 2000 entries with the flag set, so a vendored-deps
 * repo degrades to a partial inventory instead of a blown response. The
 * flag is load-bearing, not informational — a silent truncation would
 * present a partial map as complete.
 */
export async function readRepoTree(opts: {
  installationToken: string
  repoFullName: string
  ref: string
}): Promise<GhResult<RepoTree>> {
  const parts = opts.repoFullName.split('/')
  if (parts.length !== 2 || parts.some((p) => p === '' || p === '.' || p === '..')) {
    return { ok: false, reason: 'repository name is not owner/name' }
  }
  const [owner, repo] = parts as [string, string]
  if (!opts.ref || opts.ref.length > 128 || /[^A-Za-z0-9._\-/]/.test(opts.ref)) {
    return { ok: false, reason: 'ref is not a plain branch name' }
  }
  const r = await gh<{
    truncated?: boolean
    tree?: Array<{ path?: unknown; type?: unknown; size?: unknown }>
  }>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(opts.ref)}?recursive=1`,
    opts.installationToken,
  )
  if (!r.ok) return r
  if (!Array.isArray(r.value.tree)) return { ok: false, reason: 'github response unreadable' }
  const entries: RepoTree['entries'] = []
  for (const item of r.value.tree) {
    if (item?.type !== 'blob' || typeof item.path !== 'string') continue
    entries.push({
      path: item.path,
      size: typeof item.size === 'number' ? item.size : null,
    })
    if (entries.length >= TREE_ENTRY_CAP) {
      return { ok: true, value: { entries, truncated: true } }
    }
  }
  return { ok: true, value: { entries, truncated: !!r.value.truncated } }
}

/**
 * Read one small text file. The installer needs `package.json` and, when it
 * already exists, a prior generated manifest. Bodies are the merchant's source,
 * so the caller asks for a specific path — never a directory walk — and the
 * size cap refuses anything that is not a configuration file.
 */
export async function readRepoFile(opts: {
  installationToken: string
  repoFullName: string
  path: string
  ref?: string
}): Promise<GhResult<string>> {
  const parts = opts.repoFullName.split('/')
  if (parts.length !== 2 || parts.some((p) => p === '' || p === '.' || p === '..')) {
    return { ok: false, reason: 'repository name is not owner/name' }
  }
  if (!isSafeRepoPath(opts.path)) return { ok: false, reason: 'file path is not safe' }
  const [owner, repo] = parts as [string, string]
  const encodedPath = opts.path.split('/').map(encodeURIComponent).join('/')
  const query = opts.ref ? `?ref=${encodeURIComponent(opts.ref)}` : ''
  const r = await gh<{
    type?: unknown
    encoding?: unknown
    content?: unknown
    size?: unknown
  }>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}${query}`,
    opts.installationToken,
  )
  if (!r.ok) return r
  if (r.value.type !== 'file') return { ok: false, reason: 'not a regular file' }
  if (typeof r.value.size === 'number' && r.value.size > 256 * 1024) {
    return { ok: false, reason: 'file is too large to read safely' }
  }
  if (r.value.encoding !== 'base64' || typeof r.value.content !== 'string') {
    return { ok: false, reason: 'github file encoding is not base64' }
  }
  try {
    return { ok: true, value: Buffer.from(r.value.content, 'base64').toString('utf8') }
  } catch {
    return { ok: false, reason: 'github file content unreadable' }
  }
}

export type OpenPrResult =
  | { ok: true; prUrl: string; prNumber: number; branch: string }
  | { ok: false; reason: string }

export type InstallPrFile = { path: string; content: string }

/**
 * Open the install PR: branch off the default branch, commit the discovery
 * package in one commit, open the pull request. One branch name so a second
 * run updates the same PR instead of opening duplicates.
 *
 * The commit is built with the Git Trees API because the package is a folder,
 * not a single config file. `base_tree` keeps every unrelated file untouched;
 * only the paths in `files` change. Nothing here can merge the PR.
 */
export async function openInstallPr(opts: {
  installationToken: string
  repoFullName: string
  files: InstallPrFile[]
  prTitle: string
  prBody: string
  branch?: string
}): Promise<OpenPrResult> {
  const [owner, repo] = opts.repoFullName.split('/')
  if (!owner || !repo) return { ok: false, reason: 'pick a repository first' }
  if (opts.files.length === 0) return { ok: false, reason: 'install package is empty' }
  const seen = new Set<string>()
  for (const file of opts.files) {
    if (!isSafeRepoPath(file.path)) return { ok: false, reason: `file path is not safe: ${file.path}` }
    if (seen.has(file.path)) return { ok: false, reason: `duplicate file path: ${file.path}` }
    if (Buffer.byteLength(file.content, 'utf8') > 1024 * 1024) {
      return { ok: false, reason: `file is too large: ${file.path}` }
    }
    seen.add(file.path)
  }
  const branch = opts.branch ?? 'agentport/install'
  if (
    !branch ||
    branch.length > 128 ||
    branch.startsWith('/') ||
    branch.endsWith('/') ||
    branch.split('/').some((s) => s === '' || s === '.' || s === '..') ||
    /[^A-Za-z0-9._\-/]/.test(branch)
  ) {
    return { ok: false, reason: 'branch name is not safe' }
  }

  const info = await readRepoInfo({
    installationToken: opts.installationToken,
    repoFullName: opts.repoFullName,
  })
  if (!info.ok) return info
  const base = info.value.defaultBranch

  const ref = await gh<{ object: { sha: string } }>(
    `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(base)}`,
    opts.installationToken,
  )
  if (!ref.ok) return { ok: false, reason: 'could not read the default branch' }
  const baseSha = ref.value.object.sha

  // Reuse our branch when it already exists (update the PR); create otherwise.
  const existing = await gh<{ object: { sha: string } }>(
    `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`,
    opts.installationToken,
  )
  if (!existing.ok && existing.reason !== 'not found on GitHub') {
    return { ok: false, reason: existing.reason }
  }
  const branchExists = existing.ok
  const headSha = existing.ok ? existing.value.object.sha : baseSha

  const head = await gh<{ tree: { sha: string } }>(
    `/repos/${owner}/${repo}/git/commits/${headSha}`,
    opts.installationToken,
  )
  if (!head.ok) return { ok: false, reason: 'could not read the base commit' }

  const treeEntries: Array<{ path: string; mode: '100644'; type: 'blob'; sha: string }> = []
  for (const file of opts.files) {
    const blob = await gh<{ sha: string }>(`/repos/${owner}/${repo}/git/blobs`, opts.installationToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: Buffer.from(file.content, 'utf8').toString('base64'),
        encoding: 'base64',
      }),
    })
    if (!blob.ok) return { ok: false, reason: `could not write ${file.path}: ${blob.reason}` }
    treeEntries.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.value.sha })
  }

  const tree = await gh<{ sha: string }>(`/repos/${owner}/${repo}/git/trees`, opts.installationToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base_tree: head.value.tree.sha, tree: treeEntries }),
  })
  if (!tree.ok) return { ok: false, reason: `could not build the install tree: ${tree.reason}` }

  const commit = await gh<{ sha: string }>(`/repos/${owner}/${repo}/git/commits`, opts.installationToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Add Agent Port discovery package',
      tree: tree.value.sha,
      parents: [headSha],
    }),
  })
  if (!commit.ok) return { ok: false, reason: `could not create the install commit: ${commit.reason}` }

  if (branchExists) {
    const updated = await gh<{ object: { sha: string } }>(
      `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,
      opts.installationToken,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sha: commit.value.sha, force: false }),
      },
    )
    if (!updated.ok) return { ok: false, reason: `could not update the install branch: ${updated.reason}` }
  } else {
    const created = await gh<{ object: { sha: string } }>(
      `/repos/${owner}/${repo}/git/refs`,
      opts.installationToken,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.value.sha }),
      },
    )
    if (!created.ok) return { ok: false, reason: `could not create the install branch: ${created.reason}` }
  }

  const pr = await gh<{ html_url: string; number: number }>(
    `/repos/${owner}/${repo}/pulls`,
    opts.installationToken,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: opts.prTitle, body: opts.prBody, head: branch, base }),
    },
  )
  if (pr.ok) return { ok: true, prUrl: pr.value.html_url, prNumber: pr.value.number, branch }
  // A PR already open for the branch is the normal second-run outcome —
  // list open PRs and return ours instead of failing.
  const open = await gh<Array<{ html_url: string; number: number; head: { ref: string } }>>(
    `/repos/${owner}/${repo}/pulls?state=open&head=${encodeURIComponent(`${owner}:${branch}`)}`,
    opts.installationToken,
  )
  if (open.ok && open.value.length > 0) {
    return { ok: true, prUrl: open.value[0]!.html_url, prNumber: open.value[0]!.number, branch }
  }
  return { ok: false, reason: 'could not open the pull request' }
}

export type PrState =
  | { ok: true; state: 'open' | 'merged' | 'closed'; merged: boolean; checks: 'passing' | 'failing' | 'pending' | 'none'; url: string }
  | { ok: false; reason: string }

/**
 * Read PR state for the dashboard card: open/merged/closed plus a rollup of
 * check runs. Read-only by construction — GETs only, nothing here can merge,
 * approve, or comment. The merge stays the merchant's, in their repo.
 */
export async function readPrState(opts: {
  installationToken: string
  repoFullName: string
  prNumber: number
}): Promise<PrState> {
  const [owner, repo] = opts.repoFullName.split('/')
  if (!owner || !repo) return { ok: false, reason: 'pick a repository first' }
  const pr = await gh<{ state: string; merged_at: string | null; html_url: string; head: { sha: string } }>(
    `/repos/${owner}/${repo}/pulls/${opts.prNumber}`,
    opts.installationToken,
  )
  if (!pr.ok) return pr
  const checks = await gh<{ check_runs: Array<{ conclusion: string | null; status: string }> }>(
    `/repos/${owner}/${repo}/commits/${pr.value.head.sha}/check-runs`,
    opts.installationToken,
  )
  let rollup: 'passing' | 'failing' | 'pending' | 'none' = 'none'
  if (checks.ok && checks.value.check_runs.length > 0) {
    const runs = checks.value.check_runs
    rollup = runs.some((r) => r.conclusion === 'failure' || r.conclusion === 'cancelled' || r.conclusion === 'timed_out')
      ? 'failing'
      : runs.every((r) => r.conclusion === 'success')
        ? 'passing'
        : 'pending'
  }
  return {
    ok: true,
    state: pr.value.merged_at ? 'merged' : pr.value.state === 'open' ? 'open' : 'closed',
    merged: pr.value.merged_at !== null,
    checks: rollup,
    url: pr.value.html_url,
  }
}

/**
 * Normalize a pasted PEM the way dashboards mangle it: surrounding quotes
 * from shell/JSON copies, literal `\n` from single-line env fields, and
 * `\r\n` from Windows clipboards. Each variant fails createSign with the
 * same opaque decoder error, so they are all normalized here — whatever
 * remains unparseable after this is a truncated or wrong key, not a paste
 * artifact, and is refused as such.
 */
export function normalizeAppPrivateKey(v: unknown): string {
  let k = typeof v === 'string' ? v.trim() : ''
  // Quote wrapping from shell, JSON, chat, or docs — ASCII and Unicode.
  // Quote wrapping from shell, JSON, chat, or docs — matched by code
  // point so no literal Unicode lives in this source file. Backslash joins
  // the set: JSON-escaped pastes (\"...\") are wrapping, never key bytes —
  // a valid PEM never starts or ends with one.
  const isWrapQuote = (ch: string): boolean => {
    if (ch.length !== 1) return false
    const c = ch.charCodeAt(0)
    return (
      c === 0x22 ||
      c === 0x27 ||
      c === 0x60 ||
      c === 0x5c ||
      (c >= 0x2018 && c <= 0x201f) ||
      c === 0x00ab ||
      c === 0x00bb ||
      c === 0x2039 ||
      c === 0x203a
    )
  }
  while (k.length >= 2 && isWrapQuote(k.charAt(0)) && isWrapQuote(k.charAt(k.length - 1))) {
    k = k.slice(1, -1).trim()
  }
  // Invisible junk from rich-text copies (chat, docs, web UI): zero-width
  // spaces, BOM, non-breaking spaces. They survive trim and poison base64.
  k = k.replace(/[\u200B-\u200D\uFEFF\u00A0\u2028\u2029]/g, '')
  return k.replace(/\\n/g, '\n').replace(/\r\n?/g, '\n').trim()
}

/**
 * Rebuild a PEM from a copy that rich text damaged: smart quotes/dashes in
 * the armor lines, stray punctuation or whitespace inside the body. The
 * body alphabet is fixed ([A-Za-z0-9+/=]), so everything else in it is by
 * definition damage, not key material — stripping it cannot alter a valid
 * key, and whatever still fails to sign afterwards is truncated or wrong.
 */
export function extractPemArmor(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const cleaned = normalizeAppPrivateKey(v).replace(/[\u2010-\u2015\u2212]/g, '-')
  const lines = cleaned
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  const beginIx = lines.findIndex((l) => l.startsWith('-----BEGIN') && l.includes('PRIVATE KEY'))
  const endIx = lines.findIndex((l) => l.startsWith('-----END') && l.includes('PRIVATE KEY'))
  if (beginIx < 0 || endIx <= beginIx) return null
  const body = lines
    .slice(beginIx + 1, endIx)
    .join('')
    .replace(/[^A-Za-z0-9+/=]/g, '')
  if (body.length < 100) return null
  const wrapped = body.replace(/(.{64})/g, '$1\n').replace(/\n$/, '')
  return `${lines[beginIx]}\n${wrapped}\n${lines[endIx]}\n`
}

/**
 * Paste candidates, most-likely first. Some dashboards store the key
 * base64-encoded (single-line-safe); if the pasted value is not already a
 * PEM, one decode attempt runs it through the same normalizer. Each
 * candidate is tried at sign time and the first that signs wins — a value
 * none of them rescue is truncated or wrong, not merely encoded.
 */
export function candidatePrivateKeys(v: unknown): string[] {
  const direct = normalizeAppPrivateKey(v)
  const out = [direct]
  const armor = extractPemArmor(v)
  if (armor && armor !== direct) out.push(armor)
  if (!direct.includes('BEGIN') && typeof v === 'string' && /^[A-Za-z0-9+/=\s]+$/.test(v.trim()) && v.trim().length > 200) {
    try {
      const decoded = normalizeAppPrivateKey(Buffer.from(v.trim(), 'base64').toString('utf8'))
      if (decoded !== direct && !out.includes(decoded)) out.push(decoded)
      const decodedArmor = extractPemArmor(decoded)
      if (decodedArmor && !out.includes(decodedArmor)) out.push(decodedArmor)
    } catch {
      // Not decodable — direct (+armor) stay the candidates.
    }
  }
  return out
}

/**
 * Mint an installation token for a known installation.
 *
 * Credentials are explicit and required: the console and the installed
 * package hold no GitHub App key, so there is no environment fallback to
 * accidentally read. Only the broker calls this, with its own config.
 */
export async function mintInstallationTokenFor(
  installationId: number,
  credentials: { appId: string; privateKey: string },
): Promise<InstallationTokenResult> {
  if (!Number.isInteger(installationId) || installationId <= 0) {
    return { ok: false, reason: 'unknown installation' }
  }
  const appId = credentials.appId.trim()
  const rawKey = credentials.privateKey
  const privateKey = normalizeAppPrivateKey(rawKey)
  if (!appId || !privateKey) {
    return { ok: false, reason: 'GitHub App is not configured — install it first' }
  }
  let appJwt: string | null = null
  for (const candidate of candidatePrivateKeys(rawKey)) {
    try {
      appJwt = createAppJwt(appId, candidate)
      break
    } catch {
      // Next candidate; none signing means truncated or wrong key.
    }
  }
  if (!appJwt) {
    return { ok: false, reason: 'GitHub App key does not parse' }
  }
  return createInstallationToken({ appJwt, installationId })
}

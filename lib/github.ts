import { createHmac, createSign, timingSafeEqual } from 'node:crypto'

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

export type OpenPrResult =
  | { ok: true; prUrl: string; prNumber: number; branch: string }
  | { ok: false; reason: string }

/**
 * Open the install PR: branch off the default branch, commit the generated
 * install file, open the pull request. One branch name per tenant so a
 * second run updates the same PR instead of opening duplicates — the branch
 * is force-pushed only when it is ours (created here), never otherwise.
 *
 * Everything the merchant reviews is in that single file. Nothing executes
 * on merge except what their own CI runs.
 */
export async function openInstallPr(opts: {
  installationToken: string
  repoFullName: string
  filePath: string
  fileContent: string
  prTitle: string
  prBody: string
}): Promise<OpenPrResult> {
  const [owner, repo] = opts.repoFullName.split('/')
  if (!owner || !repo) return { ok: false, reason: 'pick a repository first' }
  const branch = 'agentport/install'

  const repoInfo = await gh<{ default_branch: string }>(`/repos/${owner}/${repo}`, opts.installationToken)
  if (!repoInfo.ok) return repoInfo
  const base = repoInfo.value.default_branch

  const ref = await gh<{ object: { sha: string } }>(`/repos/${owner}/${repo}/git/ref/heads/${base}`, opts.installationToken)
  if (!ref.ok) return { ok: false, reason: 'could not read the default branch' }
  const baseSha = ref.value.object.sha

  // Reuse our branch when it already exists (update the PR); create otherwise.
  const existing = await gh<{ object: { sha: string } }>(`/repos/${owner}/${repo}/git/ref/heads/${branch.replace('/', '%2F')}`, opts.installationToken)
  if (!existing.ok && existing.reason !== 'not found on GitHub') {
    return { ok: false, reason: existing.reason }
  }
  if (!existing.ok) {
    const created = await gh<{ object: { sha: string } }>(
      `/repos/${owner}/${repo}/git/refs`,
      opts.installationToken,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }),
      },
    )
    if (!created.ok) return created
  }

  // File content: fetch current blob sha when the file exists (update),
  // absent otherwise (create). Both go through the contents API so the
  // commit is one file, reviewable in one screen.
  const contentB64 = Buffer.from(opts.fileContent, 'utf8').toString('base64')
  const current = await gh<{ sha: string }>(
    `/repos/${owner}/${repo}/contents/${opts.filePath}?ref=${encodeURIComponent(branch)}`,
    opts.installationToken,
  )
  const put = await gh<{ commit: { sha: string } }>(
    `/repos/${owner}/${repo}/contents/${opts.filePath}`,
    opts.installationToken,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Govern agent access with AgentPort',
        content: contentB64,
        branch,
        ...(current.ok ? { sha: current.value.sha } : {}),
      }),
    },
  )
  if (!put.ok) return put

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
 * Mint an installation token from server environment for a known
 * installation. Refuses when the App is unconfigured or the installation
 * id is not a number — both are owner-setup problems with plain reasons,
 * never 500s.
 */
export async function mintInstallationTokenFor(installationId: number): Promise<InstallationTokenResult> {
  if (!Number.isInteger(installationId) || installationId <= 0) {
    return { ok: false, reason: 'unknown installation' }
  }
  const appId = (process.env.GITHUB_APP_ID ?? '').trim()
  const privateKey = (process.env.GITHUB_APP_PRIVATE_KEY ?? '').replace(/\\n/g, '\n').trim()
  if (!appId || !privateKey) {
    return { ok: false, reason: 'GitHub App is not configured — install it first' }
  }
  let appJwt: string
  try {
    appJwt = createAppJwt(appId, privateKey)
  } catch {
    return { ok: false, reason: 'GitHub App key does not parse' }
  }
  return createInstallationToken({ appJwt, installationId })
}

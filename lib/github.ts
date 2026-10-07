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
 * Mint an installation access token: the credential that actually opens
 * branches and pull requests. Scoped to the installation's repositories and
 * expiring in 1 hour by GitHub's design — never stored, minted per operation,
 * and never logged (a token in a log is a token in a backup).
 */
export async function createInstallationToken(opts: {
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

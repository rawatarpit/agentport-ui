/**
 * Validation for the dashboard's user-session settings.
 *
 * Pure on purpose: the API route proves the caller is an owner/admin, then
 * hands the body here. A body that cannot be normalised is refused, never
 * coerced into a wider authority. The scope strings are the same three the
 * governor and the database check constraint understand.
 */

export const SESSION_SCOPES = ['read', 'write', 'full'] as const
export type SessionScope = (typeof SESSION_SCOPES)[number]

export const SESSION_SCOPE_LABELS: Record<SessionScope, string> = {
  read: 'Read — use read capabilities only',
  write: 'Write — read plus write capabilities',
  full: 'Full — no session-side narrowing',
}

export type IdentitySettings = {
  verifyUrl: string | null
  jwksUrl: string | null
  issuer: string | null
  audience: string | null
  defaultScope: SessionScope
}

export function isSessionScope(value: unknown): value is SessionScope {
  return typeof value === 'string' && (SESSION_SCOPES as readonly string[]).includes(value)
}

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

/** A configured verifier URL must be https, or http only on loopback. */
function urlProblem(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') return `${field} must be a URL string.`
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  if (trimmed.length > 2048) return `${field} is too long.`
  if (CONTROL_CHARS.test(trimmed)) return `${field} contains invalid characters.`

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return `${field} must be a valid URL.`
  }
  if (url.protocol === 'https:') return null
  const loopback =
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '::1'
  if (url.protocol === 'http:' && loopback) return null
  return `${field} must use https (http is allowed only for localhost).`
}

function urlValue(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

function optionalClaim(value: unknown, field: string): string | null | undefined {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  if (trimmed.length > 512) return undefined
  if (CONTROL_CHARS.test(trimmed)) return undefined
  return trimmed
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; reason: string }

export function parseIdentitySettings(input: unknown): ParseResult<IdentitySettings> {
  if (typeof input !== 'object' || input === null) {
    return { ok: false, reason: 'Body must be a JSON object.' }
  }
  const body = input as Record<string, unknown>

  const verifyProblem = urlProblem(body.verifyUrl, 'Verify URL')
  if (verifyProblem) return { ok: false, reason: verifyProblem }
  const jwksProblem = urlProblem(body.jwksUrl, 'JWKS URL')
  if (jwksProblem) return { ok: false, reason: jwksProblem }

  const issuer = optionalClaim(body.issuer, 'Issuer')
  if (issuer === undefined) return { ok: false, reason: 'Issuer must be a short string.' }
  const audience = optionalClaim(body.audience, 'Audience')
  if (audience === undefined) return { ok: false, reason: 'Audience must be a short string.' }

  let defaultScope: SessionScope = 'read'
  if (body.defaultScope !== undefined && body.defaultScope !== null && body.defaultScope !== '') {
    if (!isSessionScope(body.defaultScope)) {
      return { ok: false, reason: 'Default scope must be read, write or full.' }
    }
    defaultScope = body.defaultScope
  }

  return {
    ok: true,
    value: {
      verifyUrl: urlValue(body.verifyUrl),
      jwksUrl: urlValue(body.jwksUrl),
      issuer,
      audience,
      defaultScope,
    },
  }
}

export function parseUserId(input: unknown): ParseResult<string> {
  if (typeof input !== 'string') {
    return { ok: false, reason: 'User id must be a string.' }
  }
  const trimmed = input.trim()
  if (trimmed.length === 0) return { ok: false, reason: 'User id is required.' }
  if (trimmed.length > 200) return { ok: false, reason: 'User id is too long.' }
  if (CONTROL_CHARS.test(trimmed)) {
    return { ok: false, reason: 'User id contains invalid characters.' }
  }
  return { ok: true, value: trimmed }
}

export function parseUserScope(
  input: unknown,
): ParseResult<{ userId: string; scope: SessionScope }> {
  if (typeof input !== 'object' || input === null) {
    return { ok: false, reason: 'Body must be a JSON object.' }
  }
  const body = input as Record<string, unknown>
  const user = parseUserId(body.userId)
  if (!user.ok) return user
  if (!isSessionScope(body.scope)) {
    return { ok: false, reason: 'Scope must be read, write or full.' }
  }
  return { ok: true, value: { userId: user.value, scope: body.scope } }
}

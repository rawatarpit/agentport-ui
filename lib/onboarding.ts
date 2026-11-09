/**
 * Public onboarding facts for the discovery package.
 *
 * These are published, not secret: they feed `agentport/config.json`, the
 * generated `llms.txt`, and the assistant guides. They are not policy, they do
 * not grant access, and they must never carry a token, client secret, merchant
 * API key, or connector credential.
 *
 * Validation lives here so the draft API and the installer agree on the same
 * shape. The browser is not a boundary; the API re-checks every field.
 */
export type OnboardingProfile = {
  businessDescription?: string | null
  docsUrl?: string | null
  supportUrl?: string | null
  privacyUrl?: string | null
  termsUrl?: string | null
  /** A live hosted connector only. A guide without one is a dead end. */
  connectorUrl?: string | null
  agentGuidesDir?: string | null
}

export function normaliseOptionalUrl(
  raw: string | null | undefined,
  label: string,
): { ok: true; url: string | null } | { ok: false; reason: string } {
  if (raw === null || raw === undefined || raw.trim() === '') return { ok: true, url: null }
  const value = raw.trim()
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return { ok: false, reason: `${label} is not a valid absolute URL.` }
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, reason: `${label} must be http or https.` }
  }
  if (parsed.protocol === 'http:' && !['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) {
    return { ok: false, reason: `${label} must use https outside local development.` }
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    return { ok: false, reason: `${label} must not carry credentials, a query or a fragment.` }
  }
  return { ok: true, url: parsed.toString().replace(/\/$/, '') }
}

export function validateOnboarding(
  payload: unknown,
): { ok: true; value: OnboardingProfile } | { ok: false; errors: string[] } {
  const errors: string[] = []
  const raw = (payload ?? {}) as Record<string, unknown>
  const value: OnboardingProfile = {}

  if (raw.businessDescription !== undefined) {
    if (typeof raw.businessDescription !== 'string') {
      errors.push('businessDescription must be text.')
    } else {
      const text = raw.businessDescription.trim()
      if (text.length > 280) errors.push('businessDescription must be 280 characters or fewer.')
      else value.businessDescription = text || null
    }
  }

  const urlFields = [
    ['docsUrl', 'Docs URL'],
    ['supportUrl', 'Support URL'],
    ['privacyUrl', 'Privacy URL'],
    ['termsUrl', 'Terms URL'],
    ['connectorUrl', 'Connector URL'],
  ] as const
  for (const [field, label] of urlFields) {
    if (raw[field] === undefined) continue
    if (typeof raw[field] !== 'string' && raw[field] !== null) {
      errors.push(`${field} must be a URL string.`)
      continue
    }
    const checked = normaliseOptionalUrl(raw[field] as string | null, label)
    if (!checked.ok) errors.push(checked.reason)
    else value[field] = checked.url
  }

  if (raw.agentGuidesDir !== undefined) {
    if (typeof raw.agentGuidesDir !== 'string') {
      errors.push('agentGuidesDir must be text.')
    } else {
      const dir = raw.agentGuidesDir.trim().replace(/^\/+|\/+$/g, '')
      if (dir !== '' && !/^[A-Za-z0-9._-]+$/.test(dir)) {
        errors.push('agentGuidesDir must be a single simple path segment.')
      } else {
        value.agentGuidesDir = dir || null
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, value }
}

/**
 * Pilot-request intake: validation and notification.
 *
 * The landing page is invite-only, so the form is a lead, not a signup. The
 * row is the durable record (Supabase, service-role write only); the email is
 * a convenience so a request is not missed. Email failure never fails the
 * request — the row already exists, and pretending the submission vanished
 * would be worse than a missed notification.
 *
 * No secret, card number, or credential may be persisted here. The form asks
 * for a name, an email, a company and a short note; that is the whole schema.
 */

export type PilotRequest = {
  name: string
  email: string
  company: string | null
  message: string | null
}

export type ParseResult =
  | { ok: true; value: PilotRequest }
  | { ok: false; reason: string }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Trim, bound, and normalise one submission. Rejects, never coerces. */
export function parsePilotRequest(raw: unknown): ParseResult {
  if (raw === null || typeof raw !== 'object') {
    return { ok: false, reason: 'Malformed request.' }
  }
  const r = raw as Record<string, unknown>
  const name = typeof r.name === 'string' ? r.name.trim() : ''
  const email = typeof r.email === 'string' ? r.email.trim().toLowerCase() : ''
  const company = typeof r.company === 'string' ? r.company.trim() : ''
  const message = typeof r.message === 'string' ? r.message.trim() : ''

  if (name.length < 2 || name.length > 120) {
    return { ok: false, reason: 'Please enter your name.' }
  }
  if (!EMAIL.test(email) || email.length > 254) {
    return { ok: false, reason: 'Please enter a valid email address.' }
  }
  if (company.length > 200) {
    return { ok: false, reason: 'Company name is too long.' }
  }
  if (message.length > 2000) {
    return { ok: false, reason: 'Please keep the note under 2000 characters.' }
  }

  return {
    ok: true,
    value: {
      name,
      email,
      company: company.length > 0 ? company : null,
      message: message.length > 0 ? message : null,
    },
  }
}

export type NotificationResult = 'sent' | 'not_configured' | 'failed'

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>
type NotifyDeps = {
  fetch?: FetchLike
  env?: Record<string, string | undefined>
}

/**
 * Send the request to the founder's inbox through Resend when a key is set.
 *
 * `PILOT_NOTIFY_TO` defaults to arpit@relayforge.in. A missing key is
 * `not_configured`, not an error: the Supabase row is the record of truth and
 * the caller reports success on the row, not on the mail. This function never
 * throws — a notification problem must not turn a stored request into a 500.
 */
export async function notifyPilotRequest(
  value: PilotRequest,
  deps: NotifyDeps = {},
): Promise<NotificationResult> {
  const fetchImpl = deps.fetch ?? globalThis.fetch
  const env = deps.env ?? process.env
  const key = env.RESEND_API_KEY?.trim()
  if (!key) return 'not_configured'

  const to = env.PILOT_NOTIFY_TO?.trim() || 'arpit@relayforge.in'
  const from = env.PILOT_NOTIFY_FROM?.trim() || 'AgentPort <noreply@relayforge.in>'
  const lines = [
    'New founding-pilot request',
    '',
    `Name:    ${value.name}`,
    `Email:   ${value.email}`,
    `Company: ${value.company ?? '—'}`,
    '',
    'Note:',
    value.message ?? '—',
  ]

  try {
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: value.email,
        subject: `Pilot request — ${value.company ?? value.name}`,
        text: lines.join('\n'),
      }),
    })
    return res.ok ? 'sent' : 'failed'
  } catch {
    return 'failed'
  }
}

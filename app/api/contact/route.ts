import { createAdminClient } from '@/lib/supabase/admin'
import { notifyPilotRequest, parsePilotRequest } from '@/lib/pilot-contact'
import { guardStateChange } from '@/lib/request-guard'

export const dynamic = 'force-dynamic'

/**
 * POST /api/contact — the invite-only pilot request.
 *
 * Server side only. Public visitors cannot write `pilot_requests` directly:
 * RLS is on with no anon/authenticated policies, and the insert here uses the
 * service-role client. The service role never reaches the browser — this is a
 * route handler, not a component.
 *
 * Order matters: validate, store, then notify. The row is the durable record,
 * so a mail failure returns `notified: failed` while still answering ok — the
 * request is not lost, and the caller is not told to retry a message that was
 * already stored.
 */
export async function POST(req: Request) {
  const denied = guardStateChange(req, 'contact')
  if (denied) return denied

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return Response.json({ status: 'error', reason: 'Malformed request.' }, { status: 400 })
  }

  // Honeypot: a real visitor never fills a field they cannot see. Answer ok so
  // a bot does not learn the field is a trap; write nothing.
  const record = raw as Record<string, unknown>
  if (typeof record.website2 === 'string' && record.website2.trim() !== '') {
    return Response.json({ status: 'ok' })
  }

  const parsed = parsePilotRequest(raw)
  if (!parsed.ok) {
    return Response.json({ status: 'error', reason: parsed.reason }, { status: 400 })
  }

  const value = parsed.value
  try {
    const admin = createAdminClient()
    const { error } = await admin.from('pilot_requests').insert({
      name: value.name,
      email: value.email,
      company: value.company,
      message: value.message,
      source: 'landing',
    })
    if (error) {
      console.error('pilot_requests insert failed:', error.message)
      return Response.json(
        { status: 'error', reason: 'Could not save your request. Please try again.' },
        { status: 503 },
      )
    }
  } catch (e) {
    console.error('pilot_requests insert threw:', e instanceof Error ? e.message : 'unknown')
    return Response.json(
      { status: 'error', reason: 'Could not save your request. Please try again.' },
      { status: 503 },
    )
  }

  const notified = await notifyPilotRequest(value)
  return Response.json({ status: 'ok', notified })
}

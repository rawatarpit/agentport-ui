import { createClient } from '@/lib/supabase/server'
import { guardStateChange } from '@/lib/request-guard'

export const dynamic = 'force-dynamic'

/**
 * POST /api/team — same-origin proxy to the `agentport-team` edge function.
 *
 * The edge function still makes every decision (owner/admin/viewer, no
 * self-escalation, no last-owner removal, no email disclosure). This route
 * only carries the request because the session JWT now lives in an httpOnly
 * cookie: browser code cannot read it, and it must not be handed to the page.
 */
export async function POST(req: Request) {
  const denied = guardStateChange(req, 'team')
  if (denied) return denied

  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) {
    return Response.json({ status: 'error', reason: 'Signed out — sign in again.' }, { status: 401 })
  }

  const base = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim().replace(/\/$/, '')
  if (!base) {
    return Response.json({ status: 'error', reason: 'Team service is not configured.' }, { status: 503 })
  }

  const body = await req.text()
  const upstream = await fetch(`${base}/functions/v1/agentport-team`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${session.access_token}`,
    },
    body,
  })
  const text = await upstream.text()
  return new Response(text, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
  })
}

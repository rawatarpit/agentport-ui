import { createClient } from '@/lib/supabase/server'
import { guardStateChange } from '@/lib/request-guard'

export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/reset — ask Supabase to send a recovery link.
 *
 * The redirect origin is taken from the validated same-origin request, never
 * from the body, so a caller cannot turn the recovery mail into a link to
 * another host.
 */
export async function POST(req: Request) {
  const denied = guardStateChange(req, 'auth:reset')
  if (denied) return denied

  let body: { email?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ status: 'error', reason: 'Body must be JSON.' }, { status: 400 })
  }
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  if (!email) {
    return Response.json({ status: 'error', reason: 'Email is required.' }, { status: 400 })
  }

  const origin = req.headers.get('origin') ?? new URL(req.url).origin
  const supabase = createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=${encodeURIComponent('/reset-password')}`,
  })
  if (error) {
    return Response.json({ status: 'error', reason: error.message || 'Request failed.' }, { status: 400 })
  }
  return Response.json({ status: 'ok', sent: true })
}

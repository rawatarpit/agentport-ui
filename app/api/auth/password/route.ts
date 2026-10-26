import { createClient } from '@/lib/supabase/server'
import { passwordUpdateError } from '@/lib/password-recovery'
import { guardStateChange } from '@/lib/request-guard'

export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/password — set a new password after a valid recovery link.
 *
 * The session comes from the httpOnly cookie issued by /auth/callback; the
 * browser cannot (and need not) read it. A signed-out or expired link gets 401
 * with the same specific recovery copy the screen used before.
 */
export async function POST(req: Request) {
  const denied = guardStateChange(req, 'auth:password')
  if (denied) return denied

  let body: { password?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ status: 'error', reason: 'Body must be JSON.' }, { status: 400 })
  }
  const password = typeof body.password === 'string' ? body.password : ''
  if (password.length < 8) {
    return Response.json({ status: 'error', reason: 'Use at least 8 characters.' }, { status: 400 })
  }

  const supabase = createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) {
    return Response.json(
      { status: 'error', reason: 'That recovery link has expired or was already used. Request a new one below.' },
      { status: 401 },
    )
  }
  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    return Response.json({ status: 'error', reason: passwordUpdateError(error.message) }, { status: 400 })
  }
  return Response.json({ status: 'ok' })
}

import { createClient } from '@/lib/supabase/server'
import { guardStateChange } from '@/lib/request-guard'

export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/login — password sign-in, server-side.
 *
 * Auth used to run in the browser SDK because the session cookie had to be
 * readable there. Keeping the credential exchange in a route handler lets the
 * session cookie be httpOnly (see lib/cookie-options.ts): the browser sends
 * the password once, the server hands back only a hardened cookie.
 */
export async function POST(req: Request) {
  const denied = guardStateChange(req, 'auth:login')
  if (denied) return denied

  let body: { email?: unknown; password?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ status: 'error', reason: 'Body must be JSON.' }, { status: 400 })
  }
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!email || !password) {
    return Response.json({ status: 'error', reason: 'Email and password are required.' }, { status: 400 })
  }

  const supabase = createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    return Response.json({ status: 'error', reason: error.message || 'Sign-in failed.' }, { status: 401 })
  }
  return Response.json({ status: 'ok' })
}

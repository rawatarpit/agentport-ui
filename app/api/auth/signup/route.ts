import { createClient } from '@/lib/supabase/server'
import { guardStateChange, requestOrigin } from '@/lib/request-guard'
import { sanitizeNextPath } from '@/lib/redirect'

export const dynamic = 'force-dynamic'

const SIGNUP_ERROR = 'Signup could not be completed with those details.'

/**
 * POST /api/auth/signup — create the Supabase account server-side.
 *
 * The business name rides in `options.data` where the provisioning trigger
 * reads it, exactly as before; only the transport moved. Returning whether a
 * session exists lets the page distinguish "signed in" from "check your email"
 * without asking browser JavaScript to read an httpOnly cookie.
 */
export async function POST(req: Request) {
  const denied = guardStateChange(req, 'auth:signup')
  if (denied) return denied

  let body: { email?: unknown; password?: unknown; businessName?: unknown; next?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ status: 'error', reason: 'Body must be JSON.' }, { status: 400 })
  }
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const businessName = typeof body.businessName === 'string' ? body.businessName.trim() : ''
  if (!email || !businessName) {
    return Response.json({ status: 'error', reason: 'Email and business name are required.' }, { status: 400 })
  }
  if (password.length < 12) {
    return Response.json({ status: 'error', reason: 'Use at least 12 characters.' }, { status: 400 })
  }

  const next = sanitizeNextPath(typeof body.next === 'string' ? body.next : undefined, '/setup')
  const origin = requestOrigin(req) ?? new URL(req.url).origin
  const supabase = createClient()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { business_name: businessName },
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  })
  if (error) {
    return Response.json({ status: 'error', reason: SIGNUP_ERROR }, { status: 400 })
  }
  return Response.json({ status: 'ok', session: Boolean(data.session) })
}

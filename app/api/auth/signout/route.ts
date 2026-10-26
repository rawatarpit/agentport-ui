import { createClient } from '@/lib/supabase/server'
import { guardStateChange } from '@/lib/request-guard'

export const dynamic = 'force-dynamic'

/** POST /api/auth/signout — clear the httpOnly session server-side. */
export async function POST(req: Request) {
  const denied = guardStateChange(req, 'auth:signout')
  if (denied) return denied

  const supabase = createClient()
  const { error } = await supabase.auth.signOut()
  if (error) {
    return Response.json({ status: 'error', reason: error.message || 'Could not sign out.' }, { status: 500 })
  }
  return Response.json({ status: 'ok' })
}

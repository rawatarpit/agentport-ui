import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/auth/session — signed-in state for client chrome (topbar, recovery
 * screen). The session cookie is httpOnly, so browser code asks this read-only
 * endpoint instead of trying to read it directly. No token is returned.
 */
export async function GET() {
  const supabase = createClient()
  const { data } = await supabase.auth.getUser()
  return Response.json({
    status: 'ok',
    signedIn: Boolean(data.user),
    email: data.user?.email ?? null,
  })
}

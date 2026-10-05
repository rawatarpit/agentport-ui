import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * FRONTEND.md §3 — redirect when signed out. Cheap gate, not authorisation.
 * Runs on the edge and can be bypassed; it keeps unauthenticated users out
 * of pages. Data is protected by RLS, which lives in the database and cannot
 * be skipped by a client.
 */
const PUBLIC = ['/login', '/signup', '/reset-password', '/auth/callback', '/.well-known/agent.json']

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (pairs) => {
          pairs.forEach(({ name, value, options }) => {
            req.cookies.set(name, value)
            res.cookies.set(name, value, options)
          })
        },
      },
    },
  )
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const path = req.nextUrl.pathname
  const open =
    PUBLIC.some((p) => path === p || path.startsWith(`${p}/`)) ||
    path.startsWith('/api/') ||
    path.startsWith('/_next/') ||
    path === '/favicon.ico'
  // The agent invoke path stays reachable without a dashboard session — the
  // credential it verifies is the agent's, not the merchant's.
  if (!session && !open && !path.startsWith('/.well-known/agent/invoke')) {
    return NextResponse.redirect(new URL('/login', req.url))
  }
  return res
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] }

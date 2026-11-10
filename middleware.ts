import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { hardenedCookieOptions } from '@/lib/cookie-options'
import { contentSecurityPolicyReportOnly } from '@/lib/security-headers.mjs'

/**
 * FRONTEND.md §3 — redirect when signed out. Cheap gate, not authorisation.
 * Runs on the edge and can be bypassed; it keeps unauthenticated users out
 * of pages. Data is protected by RLS, which lives in the database and cannot
 * be skipped by a client.
 */
const PUBLIC = ['/login', '/signup', '/reset-password', '/auth/callback', '/home', '/icon.svg', '/favicon.ico']

export async function middleware(req: NextRequest) {
  // Per-request nonce. Next reads it from the CSP request header below and
  // stamps it on its own inline RSC flight-data scripts, whose content is
  // page-specific and cannot be hashed. The root layout stamps it on the
  // inline theme bootstrap. This is what keeps script-src violation-free
  // without 'unsafe-inline'.
  const nonce = btoa(crypto.randomUUID())
  const csp = contentSecurityPolicyReportOnly({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    nonce,
  })

  const requestHeaders = new Headers(req.headers)
  // Next reads the nonce from the request's CSP header, so a client-supplied
  // one would otherwise win over ours. Drop anything spoofable first.
  requestHeaders.delete('content-security-policy')
  requestHeaders.delete('content-security-policy-report-only')
  requestHeaders.delete('x-nonce')
  // The app layout redirects to the workspace picker when a login has more
  // than one membership. Carry the original path in a header the layout can
  // read, so a GitHub failure reason survives that second redirect too.
  requestHeaders.set('x-agentport-path', `${req.nextUrl.pathname}${req.nextUrl.search}`)
  requestHeaders.set('x-nonce', nonce)
  // Next reads the nonce from the request's CSP header; this stays internal
  // to the render and is never sent to the browser.
  requestHeaders.set('Content-Security-Policy-Report-Only', csp)
  const res = NextResponse.next({ request: { headers: requestHeaders } })
  // The browser sees the policy on the response. Report-only until the reports
  // are reviewed; lib/security-headers.mjs documents the path to enforcement.
  res.headers.set('Content-Security-Policy-Report-Only', csp)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (pairs) => {
          pairs.forEach(({ name, value, options }) => {
            // Supabase's defaults are httpOnly false. Auth is server-side here,
            // so the session never needs to be readable by browser JavaScript;
            // harden every cookie the refresh path rewrites.
            const hardened = hardenedCookieOptions(options)
            req.cookies.set(name, value)
            res.cookies.set(name, value, hardened)
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
  // The root is the landing page for visitors and the dashboard for
  // members: unauthenticated `/` becomes `/home`, signed-in users keep `/`.
  if (!session && path === '/') {
    return NextResponse.redirect(new URL('/home', req.url))
  }
  if (!session && !open) {
    // Preserve the gated path so a GitHub failure reason (or any deep link)
    // survives the sign-in round trip instead of being dropped at /login.
    const login = new URL('/login', req.url)
    login.searchParams.set('next', `${path}${req.nextUrl.search}`)
    return NextResponse.redirect(login)
  }
  return res
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] }

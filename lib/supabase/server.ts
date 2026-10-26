import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { hardenedCookieOptions } from '@/lib/cookie-options'

/**
 * Server-side client (Server Components, Route Handlers, middleware refresh).
 * Reads the session from cookies; RLS still decides. Anon key only.
 *
 * The one service-role exception is `lib/supabase/admin.ts`, imported only by
 * the GitHub callback's post-ownership write. It must never be used for reads,
 * tenant resolution, or anything reachable before `verifyInstallationOwnership`.
 */
export function createClient() {
  const store = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (pairs) => {
          pairs.forEach(({ name, value, options }) => {
            store.set(name, value, hardenedCookieOptions(options))
          })
        },
      },
    },
  )
}

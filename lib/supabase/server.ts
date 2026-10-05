import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Server-side client (Server Components, Route Handlers, middleware refresh).
 * Reads the session from cookies; RLS still decides. Anon key only — a
 * service_role client must never exist in this repo's request path.
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
          pairs.forEach(({ name, value, options }) => store.set(name, value, options))
        },
      },
    },
  )
}

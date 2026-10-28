import { createClient } from '@supabase/supabase-js'

/**
 * Server-only Supabase client that bypasses RLS.
 *
 * Permitted use is runtime activation after the route has proven the caller
 * is an owner/admin. GitHub installation writes moved to the broker's narrow
 * database role; this client must not be used for them. The matching
 * service-role-only RPCs are the control; this client is never reachable from
 * a browser bundle or a route that has not already checked the role.
 *
 * Never import this from a Client Component, a browser bundle, or any route
 * that has not already proven the caller's role. The service-role key is
 * server-side environment only and must never be renamed `NEXT_PUBLIC_*`.
 */
export function createAdminClient() {
  const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim()
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()
  if (!url || !key) throw new Error('Supabase service role is not configured')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

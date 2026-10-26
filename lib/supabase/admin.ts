import { createClient } from '@supabase/supabase-js'

/**
 * Server-only Supabase client that bypasses RLS.
 *
 * Permitted uses are the GitHub install write (after the callback proves the
 * caller administers the installation's account) and runtime activation
 * (after the route has proven the caller is an owner/admin). The matching
 * service-role-only RPCs are the control; this client is never reachable from
 * a browser bundle or a route that has not already checked the role.
 *
 * Never import this from a Client Component, a browser bundle, or any route
 * that has not already proven installation ownership. The service-role key is
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

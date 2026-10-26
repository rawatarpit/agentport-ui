import { createClient } from '@supabase/supabase-js'

/**
 * Server-only Supabase client that bypasses RLS.
 *
 * The ONLY permitted use is the GitHub install write, after the callback has
 * exchanged the user's OAuth code and proven the caller administers the
 * installation's account. `github_installations` has no INSERT/UPDATE grant
 * for `authenticated` precisely so a tenant owner cannot claim a numeric
 * installation id directly; the matching `record_github_install` RPC is
 * service-role-only for the same reason.
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

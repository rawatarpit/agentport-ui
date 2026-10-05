import { createBrowserClient } from '@supabase/ssr'

/**
 * FRONTEND.md §3 step 1 — the one browser client, anon key.
 *
 * The anon key is public by design; RLS (not this file) decides what the
 * session may read. `service_role` must never be importable here — it is
 * not referenced, and `next.config.mjs` fails the build if anyone inlines it
 * behind a `NEXT_PUBLIC_` name.
 */
export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
}

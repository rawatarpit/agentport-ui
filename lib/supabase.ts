/**
 * Supabase presence — the seam between the RAM demo and the hosted backend.
 *
 * Reports which pieces are configured without ever holding a value: the only
 * thing a route may branch on is presence. Reads themselves stay in
 * `lib/store.ts` until the anon key + service role land and the B1 SQL
 * wrapper exists (TASKS.md §8) — a client constructed without credentials is
 * a crash, and a half-wired read is a silent fallback to fixtures.
 */

export type SupabasePresence = {
  /** Public project URL. Safe to log. */
  url: boolean
  /** RLS-gated anon key for merchant-scoped reads. */
  anonKey: boolean
  /** Bypasses RLS. Server-only; presence only, never the value. */
  serviceRole: boolean
  /** True only when URL + anon key are both set. */
  readable: boolean
}

export function supabasePresence(): SupabasePresence {
  const url = (process.env.SUPABASE_URL ?? '').trim().length > 0
  const anonKey = (process.env.SUPABASE_ANON_KEY ?? '').trim().length > 0
  const serviceRole = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim().length > 0
  return { url, anonKey, serviceRole, readable: url && anonKey }
}

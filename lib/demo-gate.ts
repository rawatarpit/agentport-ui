import { createClient } from '@/lib/supabase/server'

/**
 * Demo/production gate for the RAM-backed console routes.
 *
 * `lib/store.ts` is a single-process demo tenant. In production those routes
 * must not be reachable at all unless an operator explicitly opts in with
 * `AGENTPORT_ENABLE_DEMO`. Unauthenticated production callers are denied
 * first (401); an authenticated caller without the flag gets 404, so the
 * endpoint looks absent rather than advertising a demo surface. Development
 * and tests keep the original behaviour.
 */

export const DEMO_ENV_FLAG = 'AGENTPORT_ENABLE_DEMO'

export type DemoDenial = { status: 401 | 403 | 404; reason: string }

export function demoModeEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (env.NODE_ENV !== 'production') return true
  const value = (env[DEMO_ENV_FLAG] ?? '').trim().toLowerCase()
  return value === '1' || value === 'true' || value === 'yes' || value === 'on'
}

/**
 * Pure decision seam: routes (and tests) supply the session lookup. The
 * production gate runs before any RAM read or write, so a disabled demo
 * cannot be reached by crafting a body.
 */
export async function demoRouteDenial(deps: {
  env?: Record<string, string | undefined>
  getUserId: () => Promise<string | null>
}): Promise<DemoDenial | null> {
  const env = deps.env ?? process.env
  if (env.NODE_ENV !== 'production') return null

  let userId: string | null = null
  try {
    userId = await deps.getUserId()
  } catch {
    userId = null
  }
  if (!userId) return { status: 401, reason: 'Sign in first.' }
  if (!demoModeEnabled(env)) {
    return { status: 404, reason: 'This demo endpoint is disabled in production.' }
  }
  return null
}

/** Route-handler wrapper: resolves the session with the anon-key server client. */
export async function demoGuard(): Promise<Response | null> {
  const denial = await demoRouteDenial({
    getUserId: async () => {
      try {
        const supabase = createClient()
        const { data } = await supabase.auth.getUser()
        return data.user?.id ?? null
      } catch {
        return null
      }
    },
  })
  if (!denial) return null
  return Response.json({ status: 'error', reason: denial.reason }, { status: denial.status })
}

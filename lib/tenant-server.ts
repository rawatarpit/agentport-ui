import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { sessionCookieOptions } from '@/lib/cookie-options'
import {
  ACTIVE_TENANT_COOKIE,
  normaliseSelectedTenantId,
  resolveActiveTenant,
  type ActiveTenant,
  type MembershipRow,
} from '@/lib/tenant'

/**
 * Server-only half of tenant selection: the cookie and the session-bound
 * membership read. `lib/tenant.ts` stays pure so the decision can be tested
 * without Next or Supabase.
 */

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365

function cookieOptions() {
  return sessionCookieOptions(COOKIE_MAX_AGE)
}

export function readSelectedTenantId(): string | null {
  try {
    return normaliseSelectedTenantId(cookies().get(ACTIVE_TENANT_COOKIE)?.value)
  } catch {
    return null
  }
}

export function writeSelectedTenantId(tenantId: string): void {
  cookies().set({ name: ACTIVE_TENANT_COOKIE, value: tenantId, ...cookieOptions() })
}

export function clearSelectedTenantId(): void {
  cookies().set({
    name: ACTIVE_TENANT_COOKIE,
    value: '',
    ...cookieOptions(),
    maxAge: 0,
  })
}

export type RequestTenant = {
  supabase: ReturnType<typeof createClient>
  userId: string | null
  email: string | null
  memberships: MembershipRow[]
  selectedTenantId: string | null
  active: ActiveTenant
}

/** Read the session, memberships, and selected workspace in one place. */
export async function resolveRequestTenant(): Promise<RequestTenant> {
  const supabase = createClient()
  const { data } = await supabase.auth.getUser()
  const userId = data.user?.id ?? null
  const email = data.user?.email ?? null

  let memberships: MembershipRow[] = []
  if (userId) {
    const { data: rows } = await supabase
      .from('tenant_members')
      .select('tenant_id,role,created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
    memberships = (rows ?? []) as MembershipRow[]
  }

  const selectedTenantId = readSelectedTenantId()
  const active = resolveActiveTenant(memberships, selectedTenantId)
  return { supabase, userId, email, memberships, selectedTenantId, active }
}

/**
 * One refusal shape for API routes. Selection is a 409 because the request is
 * not forbidden — the caller must choose, then retry. A cookie naming a
 * non-member tenant is a 403, not a hint to try a different tenant.
 */
export function tenantRefusalResponse(refusal: object): Response {
  const value = refusal as { code?: string; reason?: string; status?: string }
  const code =
    value.code ??
    (value.status === 'selection_required'
      ? 'selection_required'
      : value.status === 'denied'
        ? 'no_membership'
        : undefined)
  const status =
    code === 'selection_required' ? 409 : code === 'no_membership' || code === 'invalid_selection' ? 403 : 401
  const reason =
    value.reason ??
    (code === 'selection_required'
      ? 'Your login belongs to more than one business. Choose a workspace to continue.'
      : code === 'invalid_selection'
        ? 'That workspace is not one your login belongs to. Choose a workspace again.'
        : code === 'no_membership'
          ? 'Signed in, but no business is linked to this login yet. Finish signup first.'
          : 'Sign in first.')
  return Response.json({ status: 'error', reason }, { status })
}

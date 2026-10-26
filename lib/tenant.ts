/**
 * Caller-tenant resolution for console API routes.
 *
 * The dashboard used to key everything by a constant demo tenant
 * (`resolveTenant()` in lib/store.ts). Real users arrive through Supabase Auth
 * with a trigger-minted tenant in Postgres — a RAM map keyed by a constant
 * knows nothing about them, which is exactly how a signed-in merchant got
 * "No account yet" on the connect screen. Every route that touches merchant
 * state resolves the tenant from the session, never from a constant.
 *
 * RLS returns the union of a user's memberships. The console must not guess
 * which one they meant: a single membership is unambiguous, several require
 * an explicit, server-validated selection, and none is a denial. Selection
 * lives in an httpOnly cookie set by the workspace picker; the resolver
 * re-checks that cookie against the membership rows on every call.
 *
 * The seam is callbacks, not a client: routes wire the real Supabase client
 * in a few lines, tests pass fakes with no casts and no mocks.
 */

/** httpOnly cookie holding the user's explicit workspace choice. */
export const ACTIVE_TENANT_COOKIE = 'agentport_active_tenant'

export type MembershipRow = {
  tenant_id: string
  role: string
  created_at: string
}

export type ActiveTenant =
  | { status: 'active'; tenantId: string; membership: MembershipRow }
  | { status: 'selection_required'; memberships: MembershipRow[] }
  | {
      status: 'denied'
      code: 'no_membership' | 'invalid_selection'
      memberships: MembershipRow[]
    }

/**
 * Trim and bound a cookie value before it reaches the membership check. It is
 * still untrusted: matching a row is what authorises it, not this shape.
 */
export function normaliseSelectedTenantId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  if (value.length === 0 || value.length > 128) return null
  if (!/^[A-Za-z0-9._:-]+$/.test(value)) return null
  return value
}

/**
 * Pure tenant selection. A selection the user no longer belongs to is a
 * refusal, never a reason to fall back to another membership — that fallback
 * is exactly the silent guess this replaces. Zero memberships denies, one
 * resolves, several without a selection asks the caller to choose.
 */
export function resolveActiveTenant(
  rows: MembershipRow[],
  selectedTenantId?: string | null,
): ActiveTenant {
  if (rows.length === 0) {
    return { status: 'denied', code: 'no_membership', memberships: rows }
  }

  const selected = normaliseSelectedTenantId(selectedTenantId)
  if (selected) {
    const membership = rows.find((r) => r.tenant_id === selected)
    if (!membership) {
      return { status: 'denied', code: 'invalid_selection', memberships: rows }
    }
    return { status: 'active', tenantId: selected, membership }
  }

  if (rows.length === 1) {
    return { status: 'active', tenantId: rows[0].tenant_id, membership: rows[0] }
  }

  return { status: 'selection_required', memberships: rows }
}

/**
 * Compatibility helper for callers that only need an id. It still refuses to
 * guess: multiple rows without a valid selection return null.
 */
export function pickTenant(rows: MembershipRow[], selectedTenantId?: string | null): string | null {
  const active = resolveActiveTenant(rows, selectedTenantId)
  return active.status === 'active' ? active.tenantId : null
}

export type TenantRefusal = {
  tenantId: null
  code: 'signed_out' | 'no_membership' | 'selection_required' | 'invalid_selection'
  reason: string
  selectionRequired?: true
  memberships?: MembershipRow[]
}

export type TenantResolution = { tenantId: string } | TenantRefusal

function refusal(active: Exclude<ActiveTenant, { status: 'active' }>): TenantRefusal {
  if (active.status === 'selection_required') {
    return {
      tenantId: null,
      code: 'selection_required',
      selectionRequired: true,
      reason: 'Your login belongs to more than one business. Choose a workspace to continue.',
      memberships: active.memberships,
    }
  }
  if (active.code === 'invalid_selection') {
    return {
      tenantId: null,
      code: 'invalid_selection',
      reason: 'That workspace is not one your login belongs to. Choose a workspace again.',
      memberships: active.memberships,
    }
  }
  return {
    tenantId: null,
    code: 'no_membership',
    reason: 'Signed in, but no business is linked to this login yet. Finish signup first.',
    memberships: active.memberships,
  }
}

/** Session user → their explicitly selected tenant, or a caller-safe refusal. */
export async function resolveCallerTenant(deps: {
  getUserId: () => Promise<string | null>
  listMemberships: (userId: string) => Promise<MembershipRow[]>
  selectedTenantId?: string | null
}): Promise<TenantResolution> {
  const userId = await deps.getUserId()
  if (!userId) {
    return {
      tenantId: null,
      code: 'signed_out',
      reason: 'Sign in first — this screen needs your account, not a demo.',
    }
  }
  const rows = await deps.listMemberships(userId)
  const active = resolveActiveTenant(rows, deps.selectedTenantId)
  if (active.status !== 'active') return refusal(active)
  return { tenantId: active.tenantId }
}

/**
 * Tenant plus role for gated writes. Role comes from the session (never a
 * body field): a caller who could name their own role could promote
 * themselves past the ceremony this protects.
 */
export async function resolveCallerRole(deps: {
  getUserId: () => Promise<string | null>
  listMemberships: (userId: string) => Promise<MembershipRow[]>
  getRole: (tenantId: string) => Promise<string | null>
  selectedTenantId?: string | null
}): Promise<{ tenantId: string; role: string } | TenantRefusal> {
  const t = await resolveCallerTenant(deps)
  if (t.tenantId === null) return t
  const role = await deps.getRole(t.tenantId)
  if (!role) {
    return {
      tenantId: null,
      code: 'no_membership',
      reason: 'Signed in, but your membership carries no role. Ask the business owner to re-invite you.',
    }
  }
  return { tenantId: t.tenantId, role }
}

export type CallerContext =
  | { userId: string; tenantId: string; role: string }
  | {
      userId: string | null
      tenantId: null
      role: null
      code?: 'signed_out' | 'no_membership' | 'selection_required' | 'invalid_selection'
      reason?: string
      selectionRequired?: true
      memberships?: MembershipRow[]
    }

/**
 * Session user → tenant + role in one membership read. Integration writes
 * (install, setup-consume, disconnect) require owner/admin; viewers read.
 * Role comes from the membership row the explicit selection chose — no
 * second query, no second opinion about who the caller acts as.
 */
export async function resolveCallerContext(deps: {
  getUserId: () => Promise<string | null>
  listMemberships: (userId: string) => Promise<MembershipRow[]>
  selectedTenantId?: string | null
}): Promise<CallerContext> {
  const userId = await deps.getUserId()
  if (!userId) return { userId: null, tenantId: null, role: null }

  const rows = await deps.listMemberships(userId)
  const active = resolveActiveTenant(rows, deps.selectedTenantId)
  if (active.status === 'selection_required') {
    return {
      userId,
      tenantId: null,
      role: null,
      code: 'selection_required',
      selectionRequired: true,
      reason: 'Your login belongs to more than one business. Choose a workspace to continue.',
      memberships: active.memberships,
    }
  }
  if (active.status === 'denied' && active.code === 'invalid_selection') {
    return {
      userId,
      tenantId: null,
      role: null,
      code: 'invalid_selection',
      reason: 'That workspace is not one your login belongs to. Choose a workspace again.',
      memberships: active.memberships,
    }
  }
  if (active.status !== 'active') return { userId, tenantId: null, role: null }

  const role = active.membership.role
  if (!role) {
    return {
      userId,
      tenantId: null,
      role: null,
      code: 'no_membership',
      reason: 'Signed in, but your membership carries no role. Ask the business owner to re-invite you.',
    }
  }
  return { userId, tenantId: active.tenantId, role }
}

/** Integration management is owner/admin. Viewers inspect; they never link. */
export function canManageIntegrations(role: string | null): boolean {
  return role === 'owner' || role === 'admin'
}

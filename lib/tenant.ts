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
 * The seam is two callbacks, not a client: routes wire the real Supabase
 * client in a few lines, tests pass fakes with no casts and no mocks.
 */

export type MembershipRow = {
  tenant_id: string
  role: string
  created_at: string
}

/**
 * Pure pick: which tenant the caller acts on. Oldest membership wins, so a
 * caller with several tenants gets a deterministic answer instead of
 * whichever row the database returned first. Empty means no tenant — the
 * route must say so honestly (404/409), never fall back to a demo id.
 */
export function pickTenant(rows: MembershipRow[]): string | null {
  if (rows.length === 0) return null
  let best = rows[0]
  for (const r of rows) {
    if (r.created_at < best.created_at) best = r
  }
  return best.tenant_id
}

/** Session user → their tenant id, or null with a caller-safe reason. */
export async function resolveCallerTenant(deps: {
  getUserId: () => Promise<string | null>
  listMemberships: (userId: string) => Promise<MembershipRow[]>
}): Promise<{ tenantId: string } | { tenantId: null; reason: string }> {
  const userId = await deps.getUserId()
  if (!userId) {
    return { tenantId: null, reason: 'Sign in first — this screen needs your account, not a demo.' }
  }
  const tenantId = pickTenant(await deps.listMemberships(userId))
  if (!tenantId) {
    return { tenantId: null, reason: 'Signed in, but no business is linked to this login yet. Finish signup first.' }
  }
  return { tenantId }
}

export type CallerContext =
  | { userId: string; tenantId: string; role: string }
  | { userId: string | null; tenantId: null; role: null }

/**
 * Session user → tenant + role in one membership read. Integration writes
 * (install, setup-consume, disconnect) require owner/admin; viewers read.
 * Role comes from the membership row the tenant pick already chose — no
 * second query, no second opinion about who the caller acts as.
 */
export async function resolveCallerContext(deps: {
  getUserId: () => Promise<string | null>
  listMemberships: (userId: string) => Promise<MembershipRow[]>
}): Promise<CallerContext> {
  const userId = await deps.getUserId()
  if (!userId) return { userId: null, tenantId: null, role: null }
  const rows = await deps.listMemberships(userId)
  const tenantId = pickTenant(rows)
  if (!tenantId) return { userId, tenantId: null, role: null }
  const role = rows.find((r) => r.tenant_id === tenantId)?.role ?? null
  if (!role) return { userId, tenantId: null, role: null }
  return { userId, tenantId, role }
}

/** Integration management is owner/admin. Viewers inspect; they never link. */
export function canManageIntegrations(role: string | null): boolean {
  return role === 'owner' || role === 'admin'
}

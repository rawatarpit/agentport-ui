import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  normaliseSelectedTenantId,
  pickTenant,
  resolveActiveTenant,
  resolveCallerRole,
  resolveCallerTenant,
} from '@/lib/tenant'
import type { MembershipRow } from '@/lib/tenant'

const T = (tenant_id: string, created_at: string, role = 'owner'): MembershipRow => ({
  tenant_id,
  role,
  created_at,
})

const MULTI = [T('new', '2026-10-14T00:00:00Z'), T('old', '2026-10-01T00:00:00Z')]

describe('pickTenant', () => {
  it('returns null on no memberships — never a demo fallback', () => {
    expect(pickTenant([])).toBeNull()
  })
  it('returns the single tenant without a selection', () => {
    expect(pickTenant([T('a', '2026-10-14T00:00:00Z')])).toBe('a')
  })
  it('returns null rather than guessing when multiple have no selection', () => {
    expect(pickTenant(MULTI)).toBeNull()
    expect(pickTenant([...MULTI].reverse())).toBeNull()
  })
})

describe('explicit active tenant', () => {
  it('resolves a single membership without a selection', () => {
    expect(resolveActiveTenant([T('only', '2026-10-14T00:00:00Z')])).toMatchObject({
      status: 'active',
      tenantId: 'only',
    })
  })

  it('asks for a selection when a user has two memberships and none is selected', () => {
    expect(resolveActiveTenant(MULTI)).toMatchObject({
      status: 'selection_required',
      memberships: MULTI,
    })
  })

  it('resolves the selected tenant when a user has two memberships', () => {
    expect(resolveActiveTenant(MULTI, 'new')).toMatchObject({ status: 'active', tenantId: 'new' })
    expect(resolveActiveTenant(MULTI, 'old')).toMatchObject({ status: 'active', tenantId: 'old' })
  })

  it('rejects a cookie for a tenant the user does not belong to', () => {
    expect(resolveActiveTenant(MULTI, 'foreign')).toMatchObject({
      status: 'denied',
      code: 'invalid_selection',
    })
    // Even a single membership does not make a foreign cookie acceptable:
    // the selection is refused, not silently replaced with the one row.
    expect(resolveActiveTenant([T('only', '2026-10-14T00:00:00Z')], 'foreign')).toMatchObject({
      status: 'denied',
      code: 'invalid_selection',
    })
  })

  it('denies a user with zero memberships', () => {
    expect(resolveActiveTenant([], 'anything')).toMatchObject({
      status: 'denied',
      code: 'no_membership',
    })
  })
})

describe('normaliseSelectedTenantId', () => {
  it('trims bounded cookie values and refuses blanks or unsafe shapes', () => {
    expect(normaliseSelectedTenantId('  tenant-1  ')).toBe('tenant-1')
    expect(normaliseSelectedTenantId('')).toBeNull()
    expect(normaliseSelectedTenantId('   ')).toBeNull()
    expect(normaliseSelectedTenantId('x'.repeat(129))).toBeNull()
    expect(normaliseSelectedTenantId('tenant/other')).toBeNull()
    expect(normaliseSelectedTenantId(null)).toBeNull()
  })
})

describe('resolveCallerTenant', () => {
  it('refuses without a session instead of resolving a constant', async () => {
    const r = await resolveCallerTenant({ getUserId: async () => null, listMemberships: async () => [] })
    expect(r.tenantId).toBeNull()
  })
  it('resolves the session user to their real tenant', async () => {
    const r = await resolveCallerTenant({
      getUserId: async () => 'u1',
      listMemberships: async () => [T('t-real', '2026-10-14T00:00:00Z')],
    })
    expect(r).toEqual({ tenantId: 't-real' })
  })
  it('says no business linked when the user has no membership', async () => {
    const r = await resolveCallerTenant({ getUserId: async () => 'u1', listMemberships: async () => [] })
    expect(r.tenantId).toBeNull()
  })
  it('surfaces the selection state instead of choosing between memberships', async () => {
    const r = await resolveCallerTenant({
      getUserId: async () => 'u1',
      listMemberships: async () => MULTI,
    })
    expect(r).toMatchObject({ tenantId: null, code: 'selection_required', selectionRequired: true })
  })
  it('resolves the selected tenant and refuses a foreign selection', async () => {
    const deps = (selectedTenantId: string) => ({
      getUserId: async () => 'u1',
      listMemberships: async () => MULTI,
      selectedTenantId,
    })
    expect(await resolveCallerTenant(deps('new'))).toEqual({ tenantId: 'new' })
    expect(await resolveCallerTenant(deps('foreign'))).toMatchObject({
      tenantId: null,
      code: 'invalid_selection',
    })
  })
})

describe('resolveCallerRole', () => {
  const deps = (role: string | null) => ({
    getUserId: async () => 'u1',
    listMemberships: async () => [T('t1', '2026-10-14T00:00:00Z')],
    getRole: async () => role,
  })
  it('returns tenant + role from the session, never a body field', async () => {
    expect(await resolveCallerRole(deps('owner'))).toEqual({ tenantId: 't1', role: 'owner' })
  })
  it('refuses honestly when the membership carries no role', async () => {
    const r = await resolveCallerRole(deps(null))
    expect(r.tenantId).toBeNull()
  })
})

describe('/api/me is Supabase-backed', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const src = readFileSync(join(here, '..', 'app', 'api', 'me', 'route.ts'), 'utf8')
  it('never touches the RAM merchant maps', () => {
    for (const banned of ['getMerchant', 'createMerchant', 'setWebsiteUrl', 'resolveTenant', 'DEMO_TENANT']) {
      expect(src, `must not reference ${banned}`).not.toContain(banned)
    }
  })
  it('resolves the tenant and role from the session', () => {
    expect(src).toContain('resolveCallerContext')
    expect(src).toContain('readSelectedTenantId')
    expect(src).toContain('role: t.role')
  })
})

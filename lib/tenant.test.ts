import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pickTenant, resolveCallerTenant } from '@/lib/tenant'
import type { MembershipRow } from '@/lib/tenant'

const T = (tenant_id: string, created_at: string): MembershipRow => ({ tenant_id, role: 'owner', created_at })

describe('pickTenant', () => {
  it('returns null on no memberships — never a demo fallback', () => {
    expect(pickTenant([])).toBeNull()
  })
  it('returns the single tenant', () => {
    expect(pickTenant([T('a', '2026-10-14T00:00:00Z')])).toBe('a')
  })
  it('picks the oldest membership deterministically', () => {
    const rows = [T('new', '2026-10-14T00:00:00Z'), T('old', '2026-10-01T00:00:00Z')]
    expect(pickTenant(rows)).toBe('old')
    expect(pickTenant([...rows].reverse())).toBe('old')
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
})

describe('/api/me is Supabase-backed', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const src = readFileSync(join(here, '..', 'app', 'api', 'me', 'route.ts'), 'utf8')
  it('never touches the RAM merchant maps', () => {
    for (const banned of ['getMerchant', 'createMerchant', 'setWebsiteUrl', 'resolveTenant', 'DEMO_TENANT']) {
      expect(src, `must not reference ${banned}`).not.toContain(banned)
    }
  })
  it('resolves the tenant from the session', () => {
    expect(src).toContain('resolveCallerTenant')
  })
})

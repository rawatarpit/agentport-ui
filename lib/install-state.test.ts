import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  asConsumedState,
  hashInstallState,
  installUrlFor,
  newInstallState,
  validateSetupParams,
} from '@/lib/install-state'import { canManageIntegrations, resolveCallerContext } from '@/lib/tenant'

describe('resolveCallerContext', () => {
  const rows = [
    { tenant_id: 'new', role: 'viewer', created_at: '2026-10-14T00:00:00Z' },
    { tenant_id: 'old', role: 'admin', created_at: '2026-10-01T00:00:00Z' },
  ]
  const deps = (userId: string | null) => ({
    getUserId: async () => userId,
    listMemberships: async () => rows,
  })
  it('returns oldest tenant with its role', async () => {
    expect(await resolveCallerContext(deps('u1'))).toEqual({ userId: 'u1', tenantId: 'old', role: 'admin' })
  })
  it('returns nulls when logged out or tenantless', async () => {
    expect(await resolveCallerContext(deps(null))).toEqual({ userId: null, tenantId: null, role: null })
    expect(
      await resolveCallerContext({ getUserId: async () => 'u1', listMemberships: async () => [] }),
    ).toEqual({ userId: 'u1', tenantId: null, role: null })
  })
})

describe('newInstallState', () => {
  it('issues opaque state with hash + 10-minute expiry, never the raw state stored', () => {
    const a = newInstallState(1_000_000)
    const b = newInstallState(1_000_000)
    expect(a.state.length).toBeGreaterThan(30)
    expect(a.state).not.toBe(b.state)
    expect(a.stateHash).toBe(hashInstallState(a.state))
    expect(a.stateHash).toMatch(/^[0-9a-f]{64}$/)
    expect(Date.parse(a.expiresAt) - 1_000_000).toBe(10 * 60_000)
    expect(a.stateHash).not.toContain(a.state)
  })
})

describe('installUrlFor', () => {
  it('points at the App install page carrying the exact state', () => {
    const url = installUrlFor('abc123')
    expect(url).toBe('https://github.com/apps/agentport-installer/installations/new?state=abc123')
  })
})

describe('validateSetupParams', () => {
  const good = { installationId: '123', setupAction: 'install', state: 's'.repeat(40) }
  it('accepts install and update with a positive id and bounded state', () => {
    expect(validateSetupParams(good)).toEqual({
      ok: true,
      installationId: 123,
      setupAction: 'install',
      state: 's'.repeat(40),
    })
    expect(validateSetupParams({ ...good, setupAction: 'update' }).ok).toBe(true)
  })
  it('refuses non-integer, non-positive, wrong-action, and malformed state', () => {
    expect(validateSetupParams({ ...good, installationId: 'abc' }).ok).toBe(false)
    expect(validateSetupParams({ ...good, installationId: '0' }).ok).toBe(false)
    expect(validateSetupParams({ ...good, installationId: '-5' }).ok).toBe(false)
    expect(validateSetupParams({ ...good, setupAction: 'delete' }).ok).toBe(false)
    expect(validateSetupParams({ ...good, state: '' }).ok).toBe(false)
    expect(validateSetupParams({ ...good, state: 'x'.repeat(257) }).ok).toBe(false)
    expect(validateSetupParams({ ...good, state: 42 }).ok).toBe(false)
  })
})

describe('asConsumedState', () => {
  const row = {
    tenant_id: 't1',
    initiated_by: 'u1',
    purpose: 'install',
    consumed_at: null,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
  }
  it('accepts a live row', () => {
    expect(asConsumedState(row)).toEqual({ ok: true, tenantId: 't1', initiatedBy: 'u1', purpose: 'install' })
  })
  it('refuses missing, consumed, expired, and foreign-purpose rows alike', () => {
    expect(asConsumedState(null).ok).toBe(false)
    expect(asConsumedState({ ...row, consumed_at: new Date().toISOString() }).ok).toBe(false)
    expect(asConsumedState({ ...row, expires_at: new Date(Date.now() - 1000).toISOString() }).ok).toBe(false)
    expect(asConsumedState({ ...row, purpose: 'weird' }).ok).toBe(false)
    expect(asConsumedState({ ...row, tenant_id: 7 }).ok).toBe(false)
  })
})

describe('canManageIntegrations', () => {
  it('owner/admin link, viewer and logged-out never do', () => {
    expect(canManageIntegrations('owner')).toBe(true)
    expect(canManageIntegrations('admin')).toBe(true)
    expect(canManageIntegrations('viewer')).toBe(false)
    expect(canManageIntegrations(null)).toBe(false)
    expect(canManageIntegrations('OWNER')).toBe(false)
  })
})

describe('install/setup/disconnect routes stay off RAM and gated', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const read = (rel: string) => readFileSync(join(here, '..', rel), 'utf8')
  const routes = [
    'app/api/github/install/route.ts',
    'app/api/github/setup/route.ts',
    'app/api/github/installations/[id]/route.ts',
  ]
  for (const route of routes) {
    it(`${route} resolves role from session and touches no RAM maps`, () => {
      const src = read(route)
      expect(src).toContain('resolveCallerContext')
      expect(src).toContain('canManageIntegrations')
      for (const banned of ['getInstallations(', 'recordInstallation(', 'getDraft(', 'resolveTenant(']) {
        expect(src, `${route} must not reference RAM ${banned}`).not.toContain(banned)
      }
    })
  }
})

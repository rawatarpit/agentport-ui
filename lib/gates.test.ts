import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateCapabilities, validateRules, validateSetup } from '@/lib/golive'
import { enforcingFromPush, STALE_AFTER_MS } from '@/lib/enforcing'

/**
 * Unit gates for the two things this repo must never get wrong: money math
 * validation (minor units, ordering) and the enforcing-state machine (live /
 * unknown / not-deployed). The enforcement path itself is the SDK's, tested
 * there — these cover the dashboard's half.
 */

describe('validateRules', () => {
  const good = {
    askAboveMinor: 25_000,
    neverAboveMinor: 100_000,
    bulkUnits: 20,
    alwaysAskOrders: true,
    forbidRefunds: true,
  }

  it('accepts a coherent draft', () => {
    expect(validateRules(good)).toEqual({ ok: true, value: good })
  })

  it('rejects a never line at or below the ask line', () => {
    const r = validateRules({ ...good, neverAboveMinor: 25_000 })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/neverAboveMinor/)
  })

  it('rejects fractional paise and non-positive bulk', () => {
    expect(validateRules({ ...good, askAboveMinor: 25_000.5 }).ok).toBe(false)
    expect(validateRules({ ...good, bulkUnits: 0 }).ok).toBe(false)
  })
})

describe('validateSetup', () => {
  it('enforces the same ordering rule as the rules editor', () => {
    const r = validateSetup({ ceilingMinor: 100_000, hardCeilingMinor: 25_000, alwaysAsk: true, forbidRefunds: true })
    expect(r.ok).toBe(false)
  })
})

describe('validateCapabilities', () => {
  it('accepts hiding a real field', () => {
    // `extra: []` is part of the shape since mapped capabilities landed:
    // absence of extras is explicit, not defaulted elsewhere.
    expect(validateCapabilities({ hidden: { createOrder: ['amountMinor'] } })).toEqual({
      ok: true,
      value: { hidden: { createOrder: ['amountMinor'] }, extra: [] },
    })
  })

  it('accepts a well-formed mapped extra and compiles it into the live set', () => {
    const v = validateCapabilities({
      hidden: {},
      extra: [{ name: 'getReports', method: 'GET', path: '/reports', kind: 'read' }],
    })
    expect(v.ok).toBe(true)
  })

  it('derives write-ness from the method, never from a caller-supplied kind', () => {
    const v = validateCapabilities({
      hidden: {},
      extra: [{ name: 'purgeCustomer', method: 'DELETE', path: '/customers/:id', kind: 'read' }],
    })
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.value.extra?.[0].kind).toBe('write')
  })

  it('accepts an explicit per-route unattended opt-in for a write', () => {
    const v = validateCapabilities({
      hidden: {},
      extra: [{ name: 'reindexCatalog', method: 'POST', path: '/catalog/reindex', kind: 'write', allowUnattended: true }],
    })
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.value.extra?.[0]).toMatchObject({ kind: 'write', allowUnattended: true })
  })

  it('does not let a read carry an unattended flag', () => {
    const v = validateCapabilities({
      hidden: {},
      extra: [{ name: 'getCatalog', method: 'GET', path: '/catalog', kind: 'read', allowUnattended: true }],
    })
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.value.extra?.[0].allowUnattended).toBe(false)
  })

  it('defaults every mapped route to internal and no auto-issue', () => {
    const v = validateCapabilities({
      hidden: {},
      extra: [{ name: 'getCatalog', method: 'GET', path: '/catalog', kind: 'read' }],
    })
    expect(v.ok).toBe(true)
    if (v.ok) {
      expect(v.value.extra?.[0]).toMatchObject({ dataClass: 'internal', autoIssue: false })
    }
  })

  it('accepts auto-issue only for a public read', () => {
    const ok = validateCapabilities({
      hidden: {},
      extra: [
        {
          name: 'getDocs',
          method: 'GET',
          path: '/docs',
          kind: 'read',
          dataClass: 'public',
          autoIssue: true,
        },
      ],
    })
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.value.extra?.[0]).toMatchObject({ dataClass: 'public', autoIssue: true })

    expect(
      validateCapabilities({
        hidden: {},
        extra: [
          {
            name: 'getReports',
            method: 'GET',
            path: '/reports',
            kind: 'read',
            dataClass: 'internal',
            autoIssue: true,
          },
        ],
      }).ok,
    ).toBe(false)
    expect(
      validateCapabilities({
        hidden: {},
        extra: [
          {
            name: 'publishPost',
            method: 'POST',
            path: '/posts',
            kind: 'write',
            dataClass: 'public',
            autoIssue: true,
          },
        ],
      }).ok,
    ).toBe(false)
  })

  it('refuses an unknown data class or non-boolean auto-issue', () => {
    expect(
      validateCapabilities({
        hidden: {},
        extra: [{ name: 'getCatalog', method: 'GET', path: '/catalog', dataClass: 'secret' }],
      }).ok,
    ).toBe(false)
    expect(
      validateCapabilities({
        hidden: {},
        extra: [{ name: 'getCatalog', method: 'GET', path: '/catalog', autoIssue: 'yes' }],
      }).ok,
    ).toBe(false)
  })

  it('refuses a non-boolean unattended flag', () => {
    expect(
      validateCapabilities({
        hidden: {},
        extra: [{ name: 'reindexCatalog', method: 'POST', path: '/catalog/reindex', kind: 'write', allowUnattended: 'yes' }],
      }).ok,
    ).toBe(false)
  })

  it('refuses paths the database cannot store', () => {
    expect(
      validateCapabilities({
        hidden: {},
        extra: [{ name: 'getLong', method: 'GET', path: '/' + 'a'.repeat(512), kind: 'read' }],
      }).ok,
    ).toBe(false)
  })

  it('refuses extras that collide, misname, or misshape', () => {
    expect(
      validateCapabilities({ hidden: {}, extra: [{ name: 'createOrder', method: 'GET', path: '/x', kind: 'read' }] }).ok,
    ).toBe(false)
    expect(
      validateCapabilities({ hidden: {}, extra: [{ name: 'x', method: 'GET', path: '/x', kind: 'read' }] }).ok,
    ).toBe(false)
    expect(
      validateCapabilities({
        hidden: {},
        extra: [
          { name: 'getA', method: 'GET', path: '/a', kind: 'read' },
          { name: 'getA', method: 'POST', path: '/b', kind: 'write' },
        ],
      }).ok,
    ).toBe(false)
    expect(
      validateCapabilities({ hidden: {}, extra: [{ name: 'getA', method: 'BREW', path: '/a', kind: 'read' }] }).ok,
    ).toBe(false)
  })

  it('rejects unknown capabilities and unknown fields', () => {
    expect(validateCapabilities({ hidden: { nope: ['x'] } }).ok).toBe(false)
    expect(validateCapabilities({ hidden: { createOrder: ['nope'] } }).ok).toBe(false)
  })
})

describe('enforcingFromPush', () => {
  const now = Date.parse('2026-10-05T12:00:00.000Z')

  it('is live on a fresh push', () => {
    const s = enforcingFromPush({
      digest: 'abc123',
      pushedAt: new Date(now - 60_000).toISOString(),
      now,
    })
    expect(s).toEqual({ status: 'live', digest: 'abc123', pushedAt: expect.any(String) })
  })

  it('is unknown when nothing was ever pushed', () => {
    expect(enforcingFromPush({ digest: null, pushedAt: null, now }).status).toBe('unknown')
  })

  it('is unknown — never enabled — past the stale bound', () => {
    const s = enforcingFromPush({
      digest: 'abc123',
      pushedAt: new Date(now - STALE_AFTER_MS - 1).toISOString(),
      now,
    })
    expect(s.status).toBe('unknown')
  })

  it('is unknown on an unreadable timestamp', () => {
    expect(enforcingFromPush({ digest: 'abc123', pushedAt: 'soon', now }).status).toBe('unknown')
  })
})

describe('seedDemoPush is never wired into the app', () => {
  // A seeded "live 4 minutes ago" is the fabricated panel this architecture
  // exists to prevent. The function stays for tests only; this walks the
  // real source tree and fails if any non-test file outside lib/store.ts
  // references it — so a future demo shortcut breaks the build, not a pilot.
  const here = dirname(fileURLToPath(import.meta.url))
  const roots = [join(here, '..', 'app'), join(here, '..', 'components'), join(here)]
  const offenders: string[] = []
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e)
      if (statSync(p).isDirectory()) {
        if (e === 'node_modules') continue
        walk(p)
        continue
      }
      if (!/\.(tsx?|mjs|cjs)$/.test(e)) continue
      if (p.endsWith('lib/store.ts') || /\.test\.(tsx?|mjs|cjs)$/.test(e)) continue
      const src = readFileSync(p, 'utf8')
      if (src.includes('seedDemoPush')) offenders.push(p)
    }
  }
  it('no app route or component references seedDemoPush', () => {
    for (const r of roots) walk(r)
    expect(offenders).toEqual([])
  })
})

describe('lib/store never reaches runtime code', () => {
  // The RAM maps are a test-only fallback. A route or component importing
  // them reintroduces the second source of truth that once rendered demo
  // numbers as a merchant's own. This gate walks the real tree, so the next
  // convenience import fails the build instead of a pilot.
  const here = dirname(fileURLToPath(import.meta.url))
  const roots = [join(here, '..', 'app'), join(here, '..', 'components'), join(here)]
  const offenders: string[] = []
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e)
      if (statSync(p).isDirectory()) {
        if (e === 'node_modules') continue
        walk(p)
        continue
      }
      if (!/\.(tsx?|mjs|cjs)$/.test(e)) continue
      if (p.endsWith('lib/store.ts') || /\.test\.(tsx?|mjs|cjs)$/.test(e)) continue
      const src = readFileSync(p, 'utf8')
      if (/from\s+['"](?:@\/lib\/store|\.{1,2}\/store)['"]/.test(src)) offenders.push(p)
    }
  }
  it('no app route, component or library imports the RAM store', () => {
    for (const r of roots) walk(r)
    expect(offenders).toEqual([])
  })
})

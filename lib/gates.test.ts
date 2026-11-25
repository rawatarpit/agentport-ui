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

describe('human confirmation stays read-only', () => {
  const queue = readFileSync(join(process.cwd(), 'app/(app)/approvals/page.tsx'), 'utf8')
  const confirm = readFileSync(join(process.cwd(), 'app/(app)/approvals/confirm/[requestId]/page.tsx'), 'utf8')

  it('offers no browser approve or decline action on the queue', () => {
    expect(queue).not.toMatch(/Approve and run|>\s*Decline\s*</)
    expect(queue).toContain('Review request')
    expect(queue).toContain('Opening the reference is not approval')
  })

  it('does not submit, mutate, or execute from the confirmation page', () => {
    for (const pattern of [/\bonSubmit\b/, /\bfetch\s*\(/, /\bPOST\b/, /action\s*=\s*['"]/, /approveAction/]) {
      expect(confirm).not.toMatch(pattern)
    }
    expect(confirm).toMatch(/does not\s+approve or execute/)
  })
})

describe('business card never widens its read or invents membership', () => {
  const src = readFileSync(join(process.cwd(), 'components/business-card.tsx'), 'utf8')

  it('selects only the four fields it displays', () => {
    expect(src).toContain("select('display_name,my_role,member_count,last_push_at')")
    expect(src).not.toContain("select('*')")
    expect(src).toContain('member count unknown')
    expect(src).toContain("row.my_role ?? 'unknown'")
    expect(src).not.toContain('?? 1')
    expect(src).not.toContain("?? 'member'")
  })
})

describe('placeholder identifiers never become production state', () => {
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
      if (/\.test\.(tsx?|mjs|cjs)$/.test(e)) continue
      if (p.endsWith('lib/store.ts') || p.endsWith('lib/enforcing.ts') || p.endsWith('lib/agentport.ts')) continue
      const src = readFileSync(p, 'utf8')
      if (src.includes('DEMO_CONFIG_DIGEST') || src.includes('demoEnforcing')) offenders.push(p)
    }
  }

  it('keeps the demo digest and demo enforcing state out of merchant routes', () => {
    for (const r of roots) walk(r)
    expect(offenders).toEqual([])
  })
})

describe('website assessment stays evidence, not stored truth', () => {
  const src = readFileSync(join(process.cwd(), 'components/insights/website-assessment-card.tsx'), 'utf8')

  it('says the scan is session-only and never claims a durable row', () => {
    expect(src).toContain('stays in this browser session only')
    expect(src).toContain('reloading requires a')
  })
})

describe('research answers survive the handoff into setup', () => {
  const signup = readFileSync(join(process.cwd(), 'app/(auth)/signup/page.tsx'), 'utf8')
  const report = readFileSync(join(process.cwd(), 'components/intel/report-view.tsx'), 'utf8')
  const setup = readFileSync(join(process.cwd(), 'components/setup-wizard.tsx'), 'utf8')

  for (const key of [
    'industry', 'subIndustry', 'country', 'geography', 'companyName', 'website',
    'productsServices', 'businessModel', 'customerSegment', 'setupIndustry', 'setupSector',
  ]) {
    it(`carries ${key} from preview through signup`, () => {
      expect(report).toContain(`params.set('${key}'`)
      expect(signup).toContain(`'${key}'`)
    })
  }

  it('uses the mapped setup vocabulary and saves the full snapshot once', () => {
    expect(setup).toContain("searchParams.get('setupIndustry')")
    expect(setup).toContain("searchParams.get('setupSector')")
    expect(setup).toContain("fetch('/api/research/saved-reports'")
    expect(setup).toContain('carriedStarted.current')
    expect(setup).toContain('setupIndustryValue(rawIndustry, rawSector)')
    expect(setup).toContain('setupSectorValue(rawIndustry, rawSector)')
  })

  it('never promotes a carried website into the live tenant discovery origin', () => {
    expect(setup).not.toContain("fetch('/api/me'")
    expect(setup).not.toContain('websiteUrl: website')
    expect(report).toContain('Your website is not set from the link')
  })
})

describe('sector benchmarks never expose a reversible cohort', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/analytics/sector/route.ts'), 'utf8')
  const meta = readFileSync(join(process.cwd(), 'app/api/tenant-metadata/route.ts'), 'utf8')

  it('accepts only the reviewed setup vocabulary as a cohort key', () => {
    expect(meta).toContain('SETUP_INDUSTRY_VALUES')
    expect(meta).toContain('SETUP_SECTOR_VALUES')
    expect(meta).toContain('must use the setup choices')
    expect(meta).not.toContain('under 100 characters')
  })

  it('withholds exact cohort size, median and percentile', () => {
    expect(route).toContain('sectorPercentileBand')
    expect(route).toContain('peerCount: null')
    expect(route).toContain('medianEvents: null')
    expect(route).toContain('percentile: null')
    expect(route).not.toContain('const peerCount = eventCounts.length')
    expect(route).not.toContain('medianEvents =')
  })
})

describe('unknown never renders as a green metric', () => {
  const marketing = readFileSync(join(process.cwd(), 'app/(app)/marketing-analytics/page.tsx'), 'utf8')
  const home = readFileSync(join(process.cwd(), 'app/(app)/page.tsx'), 'utf8')

  it('uses a neutral tone when executed or sector counts are unknown', () => {
    expect(marketing).toContain("tone={data.kpis.totalExecuted === null ? 'default' : 'good'}")
    expect(marketing).toContain("{c.executed ?? 'unknown'}")
    expect(marketing).toContain("{w.executed ?? 'unknown'}")
    expect(home).toContain('sectorRead.percentileBand === null')
  })
})

describe('saved report body is generated on the server', () => {
  const route = readFileSync(join(process.cwd(), 'app/api/research/saved-reports/route.ts'), 'utf8')

  it('validates the profile and ignores any client-supplied report body', () => {
    expect(route).toMatch(/parseResearchProfile/)
    expect(route).toMatch(/buildSourcedReport\(profile\)/)
    expect(route).not.toMatch(/\(body as \{ report/)
  })
})

describe('report preview is not indexable research', () => {
  it('noindexes the report and canonicalises it to the unresearched landing page', () => {
    const page = readFileSync(join(process.cwd(), 'app/(site)/intelligence/report/page.tsx'), 'utf8')
    expect(page).toMatch(/robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/)
    expect(page).toMatch(/canonical:\s*['"]\/intelligence['"]/)
  })
})

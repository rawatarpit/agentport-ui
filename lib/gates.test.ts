import { afterEach, describe, expect, it, vi } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
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
  const reader = readFileSync(join(process.cwd(), 'lib/analytics-sector-read.ts'), 'utf8')
  const meta = readFileSync(join(process.cwd(), 'app/api/tenant-metadata/route.ts'), 'utf8')

  it('accepts only the reviewed setup vocabulary as a cohort key', () => {
    expect(meta).toContain('SETUP_INDUSTRY_VALUES')
    expect(meta).toContain('SETUP_SECTOR_VALUES')
    expect(meta).toContain('must use the setup choices')
    expect(meta).not.toContain('under 100 characters')
  })

  it('withholds exact cohort size, median and percentile in the server reader', () => {
    expect(reader).toContain('sectorPercentileBand')
    expect(reader).toContain('peerCount: null')
    expect(reader).toContain('medianEvents: null')
    expect(reader).toContain('percentile: null')
    expect(reader).not.toContain('const peerCount = eventCounts.length')
    expect(reader).not.toContain('medianEvents =')
    expect(route).toContain('readSectorBenchmark(t.tenantId)')
  })

  it('never fetches a header-derived benchmark origin or sends cohort facts to the browser', () => {
    expect(reader).toContain("import 'server-only'")
    expect(reader).toContain('createAdminClient()')
    expect(reader).not.toMatch(/\bfetch\s*\(|headers\(\)|x-forwarded-host/i)
    expect(route).not.toMatch(/\bfetch\s*\(/)
  })
})

describe('unknown never renders as a green metric', () => {
  const marketing = readFileSync(join(process.cwd(), 'app/(app)/marketing-analytics/page.tsx'), 'utf8')
  const home = readFileSync(join(process.cwd(), 'app/(app)/page.tsx'), 'utf8')

  it('uses a neutral tone when executed or sector counts are unknown', () => {
    expect(marketing).toContain("tone={data.kpis.totalExecuted === null ? 'default' : 'good'}")
    expect(marketing).toContain("{c.executed ?? 'unknown'}")
    expect(marketing).toContain("{w.executed ?? 'unknown'}")
    expect(home).toContain("readSectorBenchmark(tenantId).catch(() => null)")
    expect(home).not.toContain("fetch('/api/analytics/sector')")
    expect(home).toContain("tone=\"default\"")
    expect(home).toContain('freshness is unknown until a dated producer exists')
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

describe('intelligence v2 structural guards', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const root = join(here, '..')

  it('guards NEXT_PUBLIC engine secret shape in config', () => {
    const config = readFileSync(join(root, 'next.config.mjs'), 'utf8')
    expect(config).toContain('KEY|API_KEY|CREDENTIAL|PASSWORD|PASSPHRASE')
  })

  it('keeps intelligence runtime paths free of sample fixtures', () => {
    const files = [
      'app/api/intelligence/report/route.ts',
      'lib/intelligence/engine-client.ts',
      'lib/intelligence/engine-contract.ts',
      'lib/intelligence/state-meta.ts',
      'components/intel/workflow-list.tsx',
      'components/intel/operate-links.tsx',
      'components/intel/state-strip.tsx',
      'components/intel/experience-boundary.tsx',
      'components/intel/engine-status-panel.tsx',
      'components/intel/visualisation-coverage.tsx',
      'lib/intelligence/visualisation-coverage.ts',
    ]
    for (const file of files) {
      const src = readFileSync(join(root, file), 'utf8')
      expect(src).not.toMatch(/buildSampleReport|lib\/intelligence\/sample/)
    }
  })

  it('keeps workflow and operate surfaces read-only and bounded', () => {
    const workflow = readFileSync(join(root, 'components/intel/workflow-list.tsx'), 'utf8')
    const links = readFileSync(join(root, 'components/intel/operate-links.tsx'), 'utf8')
    expect(workflow).not.toMatch(/\bfetch\s*\(|\bonSubmit\b|<form\b|onClick=\{/)
    expect(workflow).toContain('template only — not executable')
    expect(workflow).toContain('unverified capability')
    expect(workflow).toContain('Not executable without explicit merchant review and approval in the real system.')
    expect(links).not.toMatch(/\/rules|\/go-live/)
    expect(links).toContain('Opening them does not deploy, publish, approve, enable, or execute this report or any template on it.')
    expect(links).not.toMatch(/\/api\/|\/approvals\/confirm\//)
  })

  it('keeps intelligence boundary and coverage surfaces free of secrets and fixtures', () => {
    const files = [
      'components/intel/experience-boundary.tsx',
      'components/intel/engine-status-panel.tsx',
      'components/intel/state-strip.tsx',
      'components/intel/operate-links.tsx',
      'components/intel/visualisation-coverage.tsx',
      'lib/intelligence/visualisation-coverage.ts',
    ]
    for (const file of files) {
      const src = readFileSync(join(root, file), 'utf8')
      expect(src).not.toMatch(/process\.env|service_role|buildSampleReport|lib\/intelligence\/sample/)
      expect(src).not.toMatch(/\bfetch\s*\(|<button\b|<form\b|\bonSubmit\b|\bonClick\s*=/)
    }
  })

  it('keeps the engine client server-only and out of public intelligence surfaces', () => {
    const client = readFileSync(join(root, 'lib/intelligence/engine-client.ts'), 'utf8')
    expect(client).toContain("import 'server-only'")
    for (const file of [
      'app/(site)/intelligence/page.tsx',
      'app/(site)/intelligence/report/page.tsx',
      'components/intel/report-view.tsx',
      'components/intel/experience-boundary.tsx',
      'components/intel/engine-status-panel.tsx',
      'components/intel/visualisation-coverage.tsx',
    ]) {
      const src = readFileSync(join(root, file), 'utf8')
      expect(src).not.toMatch(/lib\/intelligence\/engine-client|from ['"]server-only['"]/)
    }
  })

  it('keeps hosted job vocabulary in the contract, not in rendered state', () => {
    const contract = readFileSync(join(root, 'lib/intelligence/engine-contract.ts'), 'utf8')
    const stateMeta = readFileSync(join(root, 'lib/intelligence/state-meta.ts'), 'utf8')
    const strip = readFileSync(join(root, 'components/intel/state-strip.tsx'), 'utf8')
    expect(contract).toContain('ENGINE_JOB_STATES')
    expect(contract).toContain('isEngineJobCompleted')
    for (const state of ['queued', 'claimed', 'running', 'completed', 'exhausted']) {
      expect(contract).toContain(`'${state}'`)
      expect(stateMeta).not.toContain(state)
      expect(strip).not.toContain(state)
    }
  })

  it('keeps auth routes from leaking raw auth error messages', () => {
    const signup = readFileSync(join(root, 'app/api/auth/signup/route.ts'), 'utf8')
    const login = readFileSync(join(root, 'app/api/auth/login/route.ts'), 'utf8')
    expect(signup).not.toMatch(/reason:\s*error\.message/)
    expect(login).not.toMatch(/reason:\s*error\.message/)
    expect(signup).toContain('Signup could not be completed with those details.')
    expect(login).toContain('Sign-in could not be completed with those details.')
  })
})

describe('client build refuses public engine credentials', () => {
  const configUrl = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), '..', 'next.config.mjs')).href

  type NextConfig = { webpack: (config: object, context: { isServer: boolean }) => object }

  async function clientBuild(): Promise<() => object> {
    const configModule = (await import(configUrl)) as { default: NextConfig }
    return () => configModule.default.webpack({}, { isServer: false })
  }

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('fails the build on NEXT_PUBLIC_ENGINE_API_KEY', async () => {
    vi.stubEnv('NEXT_PUBLIC_ENGINE_API_KEY', 'engine-credential')
    const build = await clientBuild()
    expect(build).toThrow(/NEXT_PUBLIC_ENGINE_API_KEY/)
    expect(build).toThrow(/ship to every visitor/)
  })

  it('fails the build on an unlisted NEXT_PUBLIC_ credential-shaped variable', async () => {
    vi.stubEnv('NEXT_PUBLIC_BROKER_CALLBACK_PASSWORD', 'hunter2')
    const build = await clientBuild()
    expect(build).toThrow(/NEXT_PUBLIC_BROKER_CALLBACK_PASSWORD/)
  })

  it('does not treat the reviewed public Supabase anon key as a secret', async () => {
    // The anon key is public project configuration, protected by RLS. A shape
    // check that rejects it would break every configured deployment's build.
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'public-anon-identifier')
    const build = await clientBuild()
    expect(build).not.toThrow()
  })
})

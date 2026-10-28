import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileLiveFrom } from '@/lib/golive'
import { buildInstallPackageFrom } from '@/lib/install-package'

const here = dirname(fileURLToPath(import.meta.url))
const read = (rel: string) => readFileSync(join(here, '..', rel), 'utf8')

describe('compileLiveFrom (durable-drafts path)', () => {
  it('refuses empty drafts — never a file from nothing', () => {
    const r = compileLiveFrom({})
    expect(r.ok).toBe(false)
  })
  it('builds a discovery package, not a policy file', () => {
    const r = buildInstallPackageFrom({
      drafts: {
        setup: { ceilingMinor: 25000, hardCeilingMinor: 100000, alwaysAsk: true, forbidRefunds: true },
        capabilities: { hidden: { createOrder: ['amountMinor'] } },
      },
      tenantId: 'tenant-1',
      business: 'Acme',
      siteUrl: 'https://acme.example',
      workerUrl: 'https://governor.agentport.dev',
      publishTarget: { dir: 'public', mode: 'direct', framework: 'next' },
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      const paths = r.value.files.map((f) => f.path)
      expect(paths).toContain('agentport/manifest.json')
      expect(paths).toContain('public/.well-known/agent.json')
      expect(paths).toContain('public/llms.txt')
      expect(paths).not.toContain('agentport.config.ts')
      expect(r.value.manifest.generatedBy).toBe('agentport')
      expect(r.value.manifest).not.toHaveProperty('emergencyKillSwitch')
    }
  })
  it('rejects invalid drafts with a reason, not a package', () => {
    const r = buildInstallPackageFrom({
      drafts: { rules: { askAboveMinor: -1 } },
      tenantId: 'tenant-1',
      business: 'Acme',
      workerUrl: 'https://governor.agentport.dev',
    })
    expect(r.ok).toBe(false)
  })
})

describe('durable-store custody guard', () => {
  const src = read('lib/durable-store.ts')
  it('never selects PII, key material, or service_role', () => {
    for (const banned of ['contact_email', 'expected_mac', 'service_role', "select('*')", 'select("*")']) {
      expect(src, `must not contain ${banned}`).not.toContain(banned)
    }
  })
  it('always scopes by tenant — every table touch carries tenant_id', () => {
    const froms = src.match(/\.from\('/g) ?? []
    const scopedEq = src.match(/\.eq\('tenant_id'/g) ?? []
    const scopedPayload = src.match(/tenant_id:/g) ?? []
    expect(froms.length).toBeGreaterThan(0)
    // Reads filter .eq('tenant_id'); upserts carry tenant_id in the row.
    expect(scopedEq.length + scopedPayload.length).toBeGreaterThanOrEqual(froms.length)
    // Every upsert names its conflict target so a retry replaces, not dupes.
    const upserts = src.match(/\.upsert\(/g) ?? []
    const conflicts = src.match(/onConflict: '/g) ?? []
    expect(conflicts.length).toEqual(upserts.length)
  })
})

describe('installation writes are broker-only', () => {
  const store = read('lib/durable-store.ts')
  const recorder = read('broker/src/install-recorder.ts')

  it('the console never writes github_installations through the session client', () => {
    expect(store).not.toContain("rpc('record_github_install'")
    expect(store).not.toMatch(/from\('github_installations'\)\s*\.(upsert|insert|update)/)
  })

  it('the console holds no service-role path for installs', () => {
    expect(store).not.toContain('createAdminClient')
  })

  it('the broker records through the schema-qualified narrow function only', () => {
    expect(recorder).toContain('agentport_broker.record_github_install')
    expect(recorder).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(recorder).not.toContain('service_role')
  })
})

describe('github + drafts routes read the database, not RAM', () => {
  const bannedImports = [
    'getInstallations',
    'recordInstallation',
    'removeInstallation',
    'getDraft',
    'putDraft',
    'getPullRequests',
    'recordPullRequest',
  ]
  const routes = [
    'app/api/github/repos/route.ts',
    'app/api/github/tree/route.ts',
    'app/api/github/pr/route.ts',
    'app/api/github/installations/route.ts',
    'app/api/github/callback/route.ts',
    'app/api/drafts/[section]/route.ts',
    'app/api/connect/route.ts',
  ]
  for (const route of routes) {
    it(`${route} imports no RAM maps`, () => {
      const src = read(route)
      // Word boundary + not-followed-by-Db: getDraftDb/recordInstallationDb
      // are the durable replacements, not the RAM maps under test.
      for (const banned of bannedImports) {
        const re = new RegExp(`\\b${banned}(?!Db)\\b`)
        expect(src, `${route} must not reference RAM ${banned}`).not.toMatch(re)
      }
    })
  }
})

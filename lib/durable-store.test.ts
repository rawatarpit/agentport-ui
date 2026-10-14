import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildInstallFileFrom, compileLiveFrom } from '@/lib/golive'

const here = dirname(fileURLToPath(import.meta.url))
const read = (rel: string) => readFileSync(join(here, '..', rel), 'utf8')

describe('compileLiveFrom (durable-drafts path)', () => {
  it('refuses empty drafts — never a file from nothing', () => {
    const r = compileLiveFrom({})
    expect(r.ok).toBe(false)
  })
  it('builds the same file shape from explicit drafts as the RAM path contract', () => {
    const r = buildInstallFileFrom({
      setup: { ceilingMinor: 25000, hardCeilingMinor: 100000, alwaysAsk: true, forbidRefunds: true },
      capabilities: { hidden: { createOrder: ['amountMinor'] } },
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.path).toBe('agentport.config.ts')
      expect(r.content).toContain('export default')
    }
  })
  it('rejects invalid drafts with a reason, not a file', () => {
    const r = buildInstallFileFrom({ rules: { askAboveMinor: -1 } })
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

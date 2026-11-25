import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  activeVersionFromRow,
  appliedConfigFromRow,
  appliedConfigToLiveRead,
  policyValuesFromApplied,
} from './publish-state'

describe('appliedConfigFromRow', () => {
  it('maps the newest applied config row to live', () => {
    expect(appliedConfigFromRow({ version: 3, created_at: '2026-11-01T10:00:00.000Z' })).toEqual({
      state: 'live',
      version: 3,
      publishedAt: '2026-11-01T10:00:00.000Z',
    })
  })

  it('keeps the applied policy body with the same applied row', () => {
    const policy = { maxOrderValue: { minor: 100 } }
    expect(appliedConfigFromRow({ version: 3, created_at: '2026-11-01T10:00:00.000Z', policy })).toEqual({
      state: 'live',
      version: 3,
      publishedAt: '2026-11-01T10:00:00.000Z',
      policy,
    })
  })

  it('keeps a live version when the policy body is unreadable', () => {
    expect(appliedConfigFromRow({ version: 3, created_at: '2026-11-01T10:00:00.000Z', policy: 'bad' })).toEqual({
      state: 'live',
      version: 3,
      publishedAt: '2026-11-01T10:00:00.000Z',
    })
  })

  it('treats no row as none — an honest empty config history', () => {
    expect(appliedConfigFromRow(null)).toEqual({ state: 'none' })
    expect(appliedConfigFromRow(undefined)).toEqual({ state: 'none' })
  })

  it('treats malformed rows as unknown, never as none or live', () => {
    expect(appliedConfigFromRow('bad')).toEqual({ state: 'unknown' })
    expect(appliedConfigFromRow({ version: 2 })).toEqual({ state: 'unknown' })
    expect(appliedConfigFromRow({ version: 2.5, created_at: '2026-11-01T10:00:00Z' })).toEqual({ state: 'unknown' })
    expect(appliedConfigFromRow({ version: 2, created_at: 'not-a-time' })).toEqual({ state: 'unknown' })
  })
})

describe('policyValuesFromApplied', () => {
  it('renders an unreadable policy as unknown values, never INR or zero', () => {
    expect(policyValuesFromApplied(undefined)).toEqual({
      ask: null,
      currency: null,
      never: null,
      forbidden: null,
      alwaysAsk: null,
      rate: null,
    })
    expect(policyValuesFromApplied({ maxOrderValue: { minor: 'bad' } }).currency).toBeNull()
  })

  it('reads only values the applied row can prove', () => {
    expect(
      policyValuesFromApplied({
        maxOrderValue: { minor: 500, currency: 'INR' },
        absoluteMaxOrderValue: { minor: 50000 },
        forbiddenCapabilities: ['refund'],
        alwaysRequireApproval: ['submitContact'],
        rateLimit: { requestsPerMinute: 10 },
      }),
    ).toEqual({
      ask: 500,
      currency: 'INR',
      never: 50000,
      forbidden: ['refund'],
      alwaysAsk: ['submitContact'],
      rate: 10,
    })
  })
})

describe('activeVersionFromRow', () => {
  it('keeps a missing or null pointer unknown instead of turning it into version zero', () => {
    expect(activeVersionFromRow(null)).toBeUndefined()
    expect(activeVersionFromRow({})).toBeUndefined()
    expect(activeVersionFromRow({ active_config_version: null })).toBeUndefined()
    expect(activeVersionFromRow({ active_config_version: '' })).toBeUndefined()
  })

  it('keeps an explicit zero and parses a valid pointer', () => {
    expect(activeVersionFromRow({ active_config_version: 0 })).toBe(0)
    expect(activeVersionFromRow({ active_config_version: '3' })).toBe(3)
    expect(activeVersionFromRow({ active_config_version: -1 })).toBeUndefined()
  })
})

describe('appliedConfigToLiveRead', () => {
  it('maps a live applied config to an artifact-shaped publish claim', () => {
    expect(appliedConfigToLiveRead({ state: 'live', version: 4, publishedAt: '2026-11-01T10:00:00.000Z' })).toEqual({
      row: { version: 4, publishedAt: '2026-11-01T10:00:00.000Z' },
      unknown: false,
      published: true,
    })
  })

  it('maps none to an honest unpublished state', () => {
    expect(appliedConfigToLiveRead({ state: 'none' })).toEqual({ row: null, unknown: false, published: false })
  })

  it('maps unknown to unknown — never false, never live', () => {
    expect(appliedConfigToLiveRead({ state: 'unknown' })).toEqual({ row: null, unknown: true, published: null })
  })
})

describe('readAppliedConfig source', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'publish-state.ts'), 'utf8')

  it('reads the applied config as admin after the caller proves membership', () => {
    expect(src).toContain('createAdminClient')
    expect(src).toContain("from('tenant_config_versions')")
    expect(src).toContain("select('version, created_at, policy')")
    expect(src).toContain('resolveRequestTenant')
    expect(src).not.toContain('policy_artifacts')
  })
})

describe('publish claim callers', () => {
  const root = dirname(dirname(fileURLToPath(import.meta.url)))

  for (const file of ['lib/go-live.ts', 'app/api/connect/route.ts']) {
    it(`${file} reads applied config, not retired artifacts`, () => {
      const src = readFileSync(join(root, file), 'utf8')
      expect(src).toContain('readAppliedConfig')
      expect(src).not.toContain('getLiveArtifact')
      expect(src).not.toContain('getLivePolicy')
    })
  }

  it('the policies page shows the applied version and never invents a currency', () => {
    const src = readFileSync(join(root, 'app/(app)/policies/page.tsx'), 'utf8')
    expect(src).toContain('readAppliedConfig')
    expect(src).toContain('Applied policy version')
    expect(src).toContain('applied.policy')
    expect(src).not.toContain('getLivePolicy')
    expect(src).not.toContain("?? 'INR'")
    expect(src).not.toContain('Currently in force')
  })

  it('the capabilities page reads the applied version instead of guessing unpublished', () => {
    const page = readFileSync(join(root, 'app/(app)/capabilities/page.tsx'), 'utf8')
    const editor = readFileSync(join(root, 'components/capabilities-editor.tsx'), 'utf8')
    expect(page).toContain('readActiveConfig')
    expect(page).toContain('appliedVersion={activeConfig?.version ?? null}')
    expect(editor).toContain('publication unknown')
    expect(editor).not.toContain('Agents currently see every field.')
  })
})

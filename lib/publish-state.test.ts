import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { appliedConfigFromRow, appliedConfigToLiveRead } from './publish-state'

describe('appliedConfigFromRow', () => {
  it('maps the newest applied config row to live', () => {
    expect(appliedConfigFromRow({ version: 3, created_at: '2026-11-01T10:00:00.000Z' })).toEqual({
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
})

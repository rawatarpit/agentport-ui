import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizePayloadSha, pushRecordToRow } from '@/lib/backend-reads'

describe('normalizePayloadSha', () => {
  it('strips a \\x prefix and lowercases', () => {
    expect(normalizePayloadSha('\\xAB12CD34EF567890')).toBe('ab12cd34ef567890')
  })
  it('accepts plain hex', () => {
    expect(normalizePayloadSha('ab12cd34ef567890')).toBe('ab12cd34ef567890')
  })
  it('refuses short, empty, and non-hex values — never a zero digest', () => {
    expect(normalizePayloadSha('')).toBeNull()
    expect(normalizePayloadSha('abc')).toBeNull()
    expect(normalizePayloadSha('not-hex-at-all!!!!!!!!')).toBeNull()
    expect(normalizePayloadSha(null)).toBeNull()
    expect(normalizePayloadSha(123)).toBeNull()
  })
})

describe('pushRecordToRow', () => {
  it('maps a good row to digest + time', () => {
    const r = pushRecordToRow({
      payload_sha256: '\\xAA11BB22CC334455',
      received_at: '2026-10-14T10:00:00.000Z',
      event_count: 7,
    })
    expect(r).toEqual({ digest: 'aa11bb22cc334455', pushedAt: '2026-10-14T10:00:00.000Z', eventCount: 7 })
  })
  it('returns null on bad digest or bad time — caller renders unknown', () => {
    expect(pushRecordToRow({ payload_sha256: 'zz', received_at: '2026-10-14T10:00:00.000Z', event_count: 1 })).toBeNull()
    expect(pushRecordToRow({ payload_sha256: 'ab12cd34ef567890', received_at: 'not-a-time', event_count: 1 })).toBeNull()
  })
})

describe('backend-reads custody guard', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const src = readFileSync(join(here, 'backend-reads.ts'), 'utf8')
  it('never selects PII, key material, or service_role on dashboard reads', () => {
    for (const banned of ['contact_email', 'expected_mac', 'service_role', 'select(\'*\')', 'select("*")']) {
      expect(src, `must not contain ${banned}`).not.toContain(banned)
    }
  })
})

import { describe, expect, it } from 'vitest'
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
    expect(validateCapabilities({ hidden: { createOrder: ['amountMinor'] } })).toEqual({
      ok: true,
      value: { hidden: { createOrder: ['amountMinor'] } },
    })
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

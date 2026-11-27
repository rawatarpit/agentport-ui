import { describe, expect, it } from 'vitest'
import type { AppliedConfigState } from '@/lib/publish-state'
import type { CheckResult } from '@/components/discovery-check'
import {
  appliedProofFromConfig,
  compareAppliedAndServed,
  engineProofState,
  outcomeFromDecision,
  servedProofFromCheckResult,
  formatProofTime,
} from './proof-state'

const tenantId = 'tenant-1'

function checkResult(overrides: Partial<Extract<CheckResult, { status: 'ok' }>> = {}): CheckResult {
  return {
    status: 'ok',
    url: 'https://governor.test/t/tenant-1/.well-known/agent.json',
    httpStatus: 200,
    manifest: {
      version: '3',
      tenantId,
      capabilityCount: 1,
      generatedAt: '2026-11-27T00:00:00Z',
    },
    ...overrides,
  }
}

describe('proof state stays honest', () => {
  it('does not claim a served manifest from an unchecked or failed check', () => {
    expect(compareAppliedAndServed({ state: 'live', version: 3, publishedAt: '2026-11-27T00:00:00Z' }, { status: 'unchecked' })).toMatchObject({ kind: 'unknown' })
    expect(
      compareAppliedAndServed(
        { state: 'live', version: 3, publishedAt: '2026-11-27T00:00:00Z' },
        { status: 'error', reason: 'governor unreachable', httpStatus: null },
      ),
    ).toMatchObject({ kind: 'unknown' })
  })

  it('compares only a tenant-bound numeric version', () => {
    const applied = { state: 'live' as const, version: 3, publishedAt: '2026-11-27T00:00:00Z' }
    expect(compareAppliedAndServed(applied, servedProofFromCheckResult(checkResult(), tenantId))).toMatchObject({ kind: 'same' })
    expect(
      compareAppliedAndServed(
        applied,
        servedProofFromCheckResult(checkResult({ manifest: { version: '7', tenantId } }), tenantId),
      ),
    ).toMatchObject({ kind: 'different' })
    expect(
      compareAppliedAndServed(
        applied,
        servedProofFromCheckResult(checkResult({ manifest: { version: '1.0', tenantId } }), tenantId),
      ),
    ).toMatchObject({ kind: 'not-comparable' })
  })

  it('converts a foreign tenant manifest into an error with no green proof', () => {
    const served = servedProofFromCheckResult(
      checkResult({ manifest: { version: '3', tenantId: 'other-tenant' } }),
      tenantId,
    )
    expect(served).toMatchObject({ status: 'error' })
    expect(compareAppliedAndServed({ state: 'live', version: 3, publishedAt: '2026-11-27T00:00:00Z' }, served)).toMatchObject({ kind: 'unknown' })
  })

  it('never derives execution from a decision', () => {
    expect(outcomeFromDecision({ decision: 'allow', result: undefined })).toBe('unknown')
    expect(outcomeFromDecision({ decision: 'allow', result: 'ok' })).toBe('executed')
    expect(outcomeFromDecision({ decision: 'allow', result: 'error' })).toBe('failed')
    expect(outcomeFromDecision({ decision: 'require_approval', result: undefined })).toBe('unknown')
    expect(outcomeFromDecision({ decision: 'deny', result: undefined })).toBe('unknown')
  })

  it('does not carry applied policy into client props', () => {
    const state: AppliedConfigState = {
      state: 'live',
      version: 3,
      publishedAt: '2026-11-27T00:00:00Z',
      policy: { askAboveMinor: 25000 },
    }
    const proof = appliedProofFromConfig(state)
    expect(proof).toEqual({ state: 'live', version: 3, publishedAt: '2026-11-27T00:00:00Z' })
    expect('policy' in proof).toBe(false)
  })

  it('maps only reviewed engine statuses and never paints ready as healthy', () => {
    expect(engineProofState({ status: 'not_configured' })).toBe('not_configured')
    expect(engineProofState({ status: 'unavailable' })).toBe('unavailable')
    expect(engineProofState({ status: 'ready' })).toBeNull()
    expect(engineProofState({ status: 'future' })).toBeNull()
  })

  it('renders an absent or invalid proof timestamp as unknown', () => {
    expect(formatProofTime(null)).toBe('unknown')
    expect(formatProofTime(undefined)).toBe('unknown')
    expect(formatProofTime('')).toBe('unknown')
    expect(formatProofTime('soon')).toBe('unknown')
  })
})

import { describe, expect, it } from 'vitest'
import type { LedgerEntry } from '@/lib/contracts'
import { confirmationView, holdsFromRows } from '@/lib/ledger-view'

const now = Date.parse('2026-10-23T12:00:00.000Z')

function entry(overrides: Partial<LedgerEntry>): LedgerEntry {
  return {
    tenantId: 't1',
    requestId: 'r1',
    at: '2026-10-23T11:00:00.000Z',
    agentId: 'agent-1',
    assurance: 'verified',
    capability: 'orders.create',
    parameters: {},
    decision: 'allow',
    reason: 'allowed',
    rule: 'default',
    detail: '',
    durationMs: 1,
    ...overrides,
  }
}

describe('holdsFromRows', () => {
  it('keeps a hold no approval row has committed', () => {
    const hold = entry({
      requestId: 'held-1',
      decision: 'require_approval',
      reason: 'approval_required',
      approval: { required: true, expiresAt: '2026-10-23T13:00:00.000Z' },
    })
    const rows = holdsFromRows([hold], now)
    expect(rows).toHaveLength(1)
    expect(rows[0].requestId).toBe('held-1')
    expect(rows[0].expiredHold).toBe(false)
  })

  it('drops a hold once a commit names it as heldRequestId', () => {
    const hold = entry({ requestId: 'held-1', decision: 'require_approval' })
    const commit = entry({
      requestId: 'approved-1',
      heldRequestId: 'held-1',
      decision: 'allow',
      reason: 'allowed',
    })
    expect(holdsFromRows([hold, commit], now)).toEqual([])
  })

  it('marks an expired hold rather than hiding it', () => {
    const hold = entry({
      requestId: 'held-1',
      decision: 'require_approval',
      approval: { required: true, expiresAt: '2026-10-23T11:30:00.000Z' },
    })
    const rows = holdsFromRows([hold], now)
    expect(rows).toHaveLength(1)
    expect(rows[0].expiredHold).toBe(true)
  })

  it('does not put a denial on the human queue', () => {
    expect(holdsFromRows([entry({ decision: 'deny', reason: 'policy_denied' })], now)).toEqual([])
  })
})

describe('confirmationView', () => {
  const hold = entry({
    requestId: 'held-1',
    decision: 'require_approval',
    reason: 'approval_required',
    approval: { required: true, expiresAt: '2026-10-23T13:00:00.000Z' },
  })
  const commit = (overrides: Partial<LedgerEntry> = {}) =>
    entry({
      requestId: 'approved-1',
      heldRequestId: 'held-1',
      decision: 'allow',
      reason: 'allowed',
      ...overrides,
    })

  it('is pending while an unexpired hold has no commit', () => {
    expect(confirmationView([hold], 'held-1', now).state).toBe('pending')
  })

  it('is expired when the hold timed out without a commit', () => {
    const expired = { ...hold, approval: { required: true, expiresAt: '2026-10-23T11:30:00.000Z' } }
    expect(confirmationView([expired], 'held-1', now).state).toBe('expired')
  })

  it('is approved when a commit exists but no result is recorded', () => {
    const view = confirmationView([hold, commit()], 'held-1', now)
    expect(view.state).toBe('approved')
    expect(view.commit?.heldRequestId).toBe('held-1')
  })

  it('is executed only when the commit carries a success result', () => {
    expect(confirmationView([hold, commit({ result: 'ok' })], 'held-1', now).state).toBe('executed')
  })

  it('is failed when the commit records an execution error', () => {
    expect(confirmationView([hold, commit({ result: 'error' })], 'held-1', now).state).toBe('failed')
  })

  it('is denied when the commit records a refusal', () => {
    expect(
      confirmationView([hold, commit({ decision: 'deny', reason: 'approval_rejected' })], 'held-1', now).state,
    ).toBe('denied')
  })

  it('is denied when a same-id refusal exists without a commit row', () => {
    const denial = entry({
      requestId: 'held-1',
      decision: 'deny',
      reason: 'approval_rejected',
    })
    const view = confirmationView([hold, denial], 'held-1', now)
    expect(view.state).toBe('denied')
    expect(view.other?.decision).toBe('deny')
  })

  it('uses the newest commit subject regardless of ledger row order', () => {
    const older = commit({ at: '2026-10-23T11:00:00.000Z', result: 'error', rowDigest: 'older' })
    const newer = commit({ at: '2026-10-23T12:00:00.000Z', result: 'error', rowDigest: 'newer' })

    for (const rows of [[hold, older, newer], [hold, newer, older]]) {
      const view = confirmationView(rows, 'held-1', now)
      expect(view.state).toBe('failed')
      expect(view.commit?.rowDigest).toBe('newer')
    }
  })

  it('is unknown with a stable subject when commits disagree', () => {
    const ok = commit({ at: '2026-10-23T11:00:00.000Z', result: 'ok', rowDigest: 'ok' })
    const denied = commit({
      at: '2026-10-23T12:00:00.000Z',
      decision: 'deny',
      reason: 'approval_rejected',
      rowDigest: 'denied',
    })

    for (const rows of [[hold, ok, denied], [hold, denied, ok]]) {
      const view = confirmationView(rows, 'held-1', now)
      expect(view.state).toBe('unknown')
      expect(view.commit?.rowDigest).toBe('denied')
    }
  })

  it('is unknown when equal-time commits disagree', () => {
    const ok = commit({ result: 'ok', rowDigest: 'ok' })
    const failed = commit({ result: 'error', rowDigest: 'failed' })

    for (const rows of [[hold, ok, failed], [hold, failed, ok]]) {
      expect(confirmationView(rows, 'held-1', now).state).toBe('unknown')
    }
  })

  it('does not let an older same-id denial hide a newer proven outcome', () => {
    const denial = entry({
      requestId: 'direct-1',
      at: '2026-10-23T10:00:00.000Z',
      decision: 'deny',
      reason: 'approval_rejected',
      rowDigest: 'older-denial',
    })
    const executed = entry({
      requestId: 'direct-1',
      at: '2026-10-23T11:00:00.000Z',
      result: 'ok',
      rowDigest: 'newer-execution',
    })

    const view = confirmationView([denial, executed], 'direct-1', now)
    expect(view.state).toBe('unknown')
    expect(view.other?.rowDigest).toBe('newer-execution')
  })

  it('is not_found with no rows', () => {
    expect(confirmationView([], 'held-1', now).state).toBe('not_found')
  })

  it('does not call an unattended allow an approval', () => {
    expect(confirmationView([entry({ requestId: 'direct-1' })], 'direct-1', now).state).toBe('unknown')
  })

  it('is not_found for a request outside the tenant projection', () => {
    expect(confirmationView([hold], 'other-tenant-request', now).state).toBe('not_found')
  })
})

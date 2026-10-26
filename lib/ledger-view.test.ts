import { describe, expect, it } from 'vitest'
import type { LedgerEntry } from '@/lib/contracts'
import { holdsFromRows } from '@/lib/ledger-view'

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

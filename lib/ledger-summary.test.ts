import { describe, expect, it } from 'vitest'
import type { LedgerEntry } from './contracts'
import {
  EMPTY_FILTER,
  agentAttribution,
  decisionLabel,
  filterEntries,
  isFiltering,
  parseLedgerFilter,
  summarise,
} from './ledger-summary'

function entry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    tenantId: 't1',
    requestId: 'req_1',
    at: '2026-11-13T05:37:58Z',
    agentId: 'public:[redacted]',
    assurance: 'unverified',
    capability: 'submitContact',
    access: 'write',
    parameters: {},
    decision: 'allow',
    reason: 'allowed',
    rule: 'default',
    detail: '',
    durationMs: 12,
    ...overrides,
  }
}

describe('parseLedgerFilter', () => {
  it('returns the empty filter for absent or unknown values', () => {
    expect(parseLedgerFilter({})).toEqual(EMPTY_FILTER)
    expect(parseLedgerFilter({ decision: 'maybe', access: 'admin' })).toEqual(EMPTY_FILTER)
  })

  it('accepts a known decision and access, including repeated params', () => {
    expect(parseLedgerFilter({ decision: 'deny', access: 'write' })).toEqual({
      query: '',
      decision: 'deny',
      access: 'write',
    })
    expect(parseLedgerFilter({ decision: ['held', 'deny'], q: ['flow-bot', 'other'] })).toEqual({
      query: 'flow-bot',
      decision: 'held',
      access: 'all',
    })
  })

  it('trims and caps the search term so the URL cannot carry an essay', () => {
    const parsed = parseLedgerFilter({ q: `  ${'x'.repeat(200)}  ` })
    expect(parsed.query).toHaveLength(120)
    expect(parsed.query.startsWith('x')).toBe(true)
  })
})

describe('isFiltering', () => {
  it('is false only for the empty filter', () => {
    expect(isFiltering(EMPTY_FILTER)).toBe(false)
    expect(isFiltering({ ...EMPTY_FILTER, query: 'bot' })).toBe(true)
    expect(isFiltering({ ...EMPTY_FILTER, decision: 'deny' })).toBe(true)
    expect(isFiltering({ ...EMPTY_FILTER, access: 'write' })).toBe(true)
  })
})

describe('summarise', () => {
  it('counts decisions, effects and declared self-service calls', () => {
    const rows = [
      entry(),
      entry({ decision: 'deny', reason: 'insufficient_scope', access: 'read' }),
      entry({ decision: 'require_approval', reason: 'approval_required', agentLabel: 'ops-bot', agentLabelSource: 'declared' }),
      entry({ decision: 'allow', access: 'read', agentLabel: 'docs-bot', agentLabelSource: 'credential' }),
    ]
    expect(summarise(rows)).toEqual({
      total: 4,
      allowed: 2,
      denied: 1,
      held: 1,
      reads: 2,
      writes: 2,
      selfService: 1,
    })
  })

  it('counts held decisions independently of later approval commits', () => {
    const rows = [
      entry({ requestId: 'hold', decision: 'require_approval', reason: 'approval_required' }),
      entry({ requestId: 'commit', decision: 'allow', heldRequestId: 'hold' }),
    ]
    expect(summarise(rows)).toMatchObject({ total: 2, held: 1, allowed: 1, denied: 0 })
  })

  it('treats an absent effect as neither read nor write', () => {
    const summary = summarise([entry({ access: undefined })])
    expect(summary.reads).toBe(0)
    expect(summary.writes).toBe(0)
    expect(summary.total).toBe(1)
  })
})

describe('filterEntries', () => {
  const rows = [
    entry({ requestId: 'req_allow', capability: 'getDocs', agentLabel: 'docs-bot', agentLabelSource: 'credential', access: 'read' }),
    entry({ requestId: 'req_deny', decision: 'deny', reason: 'insufficient_scope', rule: 'scope_ceiling', access: 'read' }),
    entry({ requestId: 'req_hold', decision: 'require_approval', reason: 'approval_required', agentLabel: 'flow-bot', agentLabelSource: 'declared', access: 'write' }),
  ]

  it('returns every row for the empty filter', () => {
    expect(filterEntries(rows, EMPTY_FILTER)).toHaveLength(3)
  })

  it('maps require_approval to the held filter', () => {
    expect(filterEntries(rows, { ...EMPTY_FILTER, decision: 'held' }).map((e) => e.requestId)).toEqual(['req_hold'])
  })

  it('filters by effect', () => {
    expect(filterEntries(rows, { ...EMPTY_FILTER, access: 'read' }).map((e) => e.requestId)).toEqual([
      'req_allow',
      'req_deny',
    ])
  })

  it('searches capability, agent label, rule, reason and request id case-insensitively', () => {
    expect(filterEntries(rows, { ...EMPTY_FILTER, query: 'DOCS' }).map((e) => e.requestId)).toEqual(['req_allow'])
    expect(filterEntries(rows, { ...EMPTY_FILTER, query: 'flow-bot' }).map((e) => e.requestId)).toEqual(['req_hold'])
    expect(filterEntries(rows, { ...EMPTY_FILTER, query: 'scope_ceiling' }).map((e) => e.requestId)).toEqual(['req_deny'])
    expect(filterEntries(rows, { ...EMPTY_FILTER, query: 'REQ_DENY' }).map((e) => e.requestId)).toEqual(['req_deny'])
  })

  it('composes search with decision and access', () => {
    expect(
      filterEntries(rows, { query: 'req_', decision: 'deny', access: 'read' }).map((e) => e.requestId),
    ).toEqual(['req_deny'])
  })

  it('returns an empty list rather than every row when nothing matches', () => {
    expect(filterEntries(rows, { ...EMPTY_FILTER, query: 'nothing-matches' })).toEqual([])
  })
})

describe('agentAttribution', () => {
  it('trusts a credential label only when the request is verified', () => {
    const a = agentAttribution(
      entry({ agentLabel: 'ops-bot', agentLabelSource: 'credential', assurance: 'verified' }),
    )
    expect(a).toMatchObject({ name: 'ops-bot', source: 'credential', chip: 'credential', trusted: true })
  })

  it('does not call an unverified credential label trusted', () => {
    const a = agentAttribution(
      entry({ agentLabel: 'ops-bot', agentLabelSource: 'credential', assurance: 'unverified' }),
    )
    expect(a).toMatchObject({ source: 'credential', trusted: false })
    expect(a.title).toContain('not verified')
  })

  it('never trusts a declared label', () => {
    const a = agentAttribution(entry({ agentLabel: 'flow-bot', agentLabelSource: 'declared' }))
    expect(a).toMatchObject({ name: 'flow-bot', source: 'declared', chip: 'declared', trusted: false })
    expect(a.title).toContain('Not verified')
  })

  it('reports an unidentified caller rather than inventing a name', () => {
    const a = agentAttribution(entry({ agentId: 'unidentified', agentLabelSource: 'none' }))
    expect(a).toMatchObject({ name: 'unidentified', source: 'none', chip: 'unidentified', trusted: false })
  })

  it('never promotes a row without a source to credential', () => {
    expect(agentAttribution(entry({ assurance: 'verified' }))).toMatchObject({
      source: 'unknown',
      chip: 'source unknown',
      trusted: false,
    })
    expect(agentAttribution(entry({ assurance: 'unverified' })).source).toBe('unknown')
  })

  it('falls back to the redacted agent id when the label is empty', () => {
    const a = agentAttribution(entry({ agentLabel: '   ', agentLabelSource: 'credential' }))
    expect(a.name).toBe('public:[redacted]')
  })
})

describe('decisionLabel', () => {
  it('uses the merchant-facing word for each decision', () => {
    expect(decisionLabel('allow')).toBe('allowed')
    expect(decisionLabel('deny')).toBe('denied')
    expect(decisionLabel('require_approval')).toBe('held')
  })
})

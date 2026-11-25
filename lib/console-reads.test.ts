import { beforeEach, describe, expect, it, vi } from 'vitest'

const { from } = vi.hoisted(() => ({ from: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ from }),
}))

import { listDecisions, listHolds, listRequestReferences } from './console-reads'

type Result = { data: unknown; error: { message: string } | null }

type Query = {
  select: (columns: string) => Query
  eq: (column: string, value: string) => Query
  order: (column: string, options: { ascending: boolean }) => Query
  limit: (count: number) => Promise<Result>
}

const FORBIDDEN_COLUMNS = ['parameters', 'detail', 'evaluated', 'error', 'amount', 'instrument', 'email']

function builder(
  result: Result,
  onSelect?: (columns: string) => void,
  onEq?: (column: string, value: string) => void,
  onOrder?: (column: string, options: { ascending: boolean }) => void,
): Query {
  const q: Query = {
    select: (columns) => {
      onSelect?.(columns)
      return q
    },
    eq: (column, value) => {
      onEq?.(column, value)
      return q
    },
    order: (column, options) => {
      onOrder?.(column, options)
      return q
    },
    limit: async () => result,
  }
  return q
}

describe('console reads', () => {
  let result: Result

  beforeEach(() => {
    result = { data: [], error: null }
    from.mockReset()
    from.mockImplementation(() => builder(result))
  })

  it('returns an empty list only when the read succeeded', async () => {
    await expect(listDecisions('tenant')).resolves.toEqual([])
    await expect(listHolds('tenant')).resolves.toEqual([])
  })

  it('throws on a failed read instead of claiming the tenant has no rows', async () => {
    result = { data: null, error: { message: 'permission denied' } }
    await expect(listDecisions('tenant')).rejects.toThrow('ledger read failed')
    await expect(listHolds('tenant')).rejects.toThrow('ledger read failed')
  })

  it('projects agent attribution and nothing outside the console boundary', async () => {
    result = {
      data: [
        {
          tenant_id: 'tenant',
          request_id: 'req_1',
          held_request_id: null,
          at: '2026-11-13T05:37:58Z',
          agent_id: 'public:[redacted]',
          agent_label: 'flow-bot',
          agent_label_source: 'declared',
          assurance: 'unverified',
          capability: 'submitContact',
          capability_registered: true,
          access: 'write',
          decision: 'allow',
          reason: 'allowed',
          rule: 'default',
          approval: null,
          result: 'ok',
          config_hash: null,
          row_digest: null,
          duration_ms: 5,
        },
      ],
      error: null,
    }
    const selected: string[] = []
    from.mockImplementation(() => builder(result, (columns) => selected.push(columns)))

    const [row] = await listDecisions('tenant')

    expect(selected[0]).toContain('agent_label')
    expect(selected[0]).toContain('agent_label_source')
    for (const forbidden of FORBIDDEN_COLUMNS) {
      expect(selected[0]).not.toContain(forbidden)
    }
    expect(row.agentLabel).toBe('flow-bot')
    expect(row.agentLabelSource).toBe('declared')
  })

  it('reads a request and its commit by tenant-scoped reference only', async () => {
    const selected: string[] = []
    const eqs: Array<[string, string]> = []
    const orders: Array<[string, { ascending: boolean }]> = []
    from.mockImplementation(() =>
      builder(
        result,
        (columns) => selected.push(columns),
        (c, v) => eqs.push([c, v]),
        (column, options) => orders.push([column, options]),
      ),
    )

    await expect(listRequestReferences('tenant', 'held-1')).resolves.toEqual([])

    expect(eqs).toEqual([
      ['tenant_id', 'tenant'],
      ['request_id', 'held-1'],
      ['tenant_id', 'tenant'],
      ['held_request_id', 'held-1'],
    ])
    expect(orders).toEqual([
      ['at', { ascending: false }],
      ['at', { ascending: false }],
    ])
    expect(from.mock.calls).toEqual([
      ['ledger_console_view'],
      ['ledger_console_view'],
    ])
    expect(selected).toHaveLength(2)
    for (const columns of selected) {
      expect(columns).toContain('tenant_id')
      expect(columns).toContain('request_id')
      expect(columns).toContain('held_request_id')
      expect(columns).toContain('at')
      for (const forbidden of FORBIDDEN_COLUMNS) {
        expect(columns).not.toContain(forbidden)
      }
    }
  })

  it('keeps a commit row even when it shares the held request id', async () => {
    const base = {
      tenant_id: 'tenant',
      at: '2026-11-13T05:37:58Z',
      agent_id: 'public:[redacted]',
      agent_label: null,
      agent_label_source: null,
      assurance: 'unverified',
      capability: 'submitContact',
      capability_registered: true,
      access: 'write',
      reason: 'allowed',
      rule: 'default',
      approval: null,
      result: 'ok',
      config_hash: null,
      row_digest: null,
      duration_ms: 5,
    }
    const hold = {
      ...base,
      request_id: 'held-1',
      held_request_id: null,
      decision: 'require_approval',
      approval: { required: true },
      result: null,
    }
    const commit = {
      ...base,
      request_id: 'held-1',
      held_request_id: 'held-1',
      decision: 'allow',
      result: 'ok',
    }
    let column = ''
    from.mockImplementation(() => {
      const q: Query = {
        select: () => q,
        eq: (c) => {
          column = c
          return q
        },
        order: () => q,
        limit: async () => ({ data: column === 'request_id' ? [hold] : [commit], error: null }),
      }
      return q
    })

    const rows = await listRequestReferences('tenant', 'held-1')

    expect(rows.map((row) => row.decision)).toEqual(['require_approval', 'allow'])
    expect(rows.map((row) => row.heldRequestId)).toEqual([undefined, 'held-1'])
  })

  it('throws when a reference read fails instead of claiming no such request', async () => {
    result = { data: null, error: { message: 'permission denied' } }
    await expect(listRequestReferences('tenant', 'held-1')).rejects.toThrow('ledger reference read failed')
  })

  it('throws rather than deciding from a full reference page', async () => {
    result = {
      data: Array.from({ length: 50 }, (_, index) => ({
        tenant_id: 'tenant',
        request_id: 'held-1',
        held_request_id: 'held-1',
        at: new Date(Date.UTC(2026, 10, 13, 5, 37, index)).toISOString(),
        agent_id: 'agent-1',
        agent_label: null,
        agent_label_source: null,
        assurance: 'verified',
        capability: 'submitContact',
        capability_registered: true,
        access: 'write',
        decision: 'allow',
        reason: 'allowed',
        rule: 'default',
        approval: null,
        result: 'ok',
        config_hash: null,
        row_digest: `digest-${index}`,
        duration_ms: 1,
      })),
      error: null,
    }

    await expect(listRequestReferences('tenant', 'held-1')).rejects.toThrow('ledger reference read incomplete')
  })


  it('leaves attribution absent when the view returns nulls', async () => {
    result = {
      data: [
        {
          tenant_id: 'tenant',
          request_id: 'req_2',
          held_request_id: null,
          at: '2026-11-13T05:37:58Z',
          agent_id: 'unidentified',
          agent_label: null,
          agent_label_source: null,
          assurance: 'unverified',
          capability: 'getDocs',
          capability_registered: true,
          access: 'read',
          decision: 'deny',
          reason: 'unauthenticated',
          rule: 'identity',
          approval: null,
          result: null,
          config_hash: null,
          row_digest: null,
          duration_ms: 0,
        },
      ],
      error: null,
    }
    const [row] = await listDecisions('tenant')
    expect(row.agentLabel).toBeUndefined()
    expect(row.agentLabelSource).toBeUndefined()
  })
})

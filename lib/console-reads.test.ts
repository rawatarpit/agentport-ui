import { beforeEach, describe, expect, it, vi } from 'vitest'

const { from } = vi.hoisted(() => ({ from: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ from }),
}))

import { listDecisions, listHolds } from './console-reads'

type Result = { data: unknown; error: { message: string } | null }

type Query = {
  select: (columns: string) => Query
  eq: (column: string, value: string) => Query
  order: (column: string, options: { ascending: boolean }) => Query
  limit: (count: number) => Promise<Result>
}

function builder(result: Result, onSelect?: (columns: string) => void): Query {
  const q: Query = {
    select: (columns) => {
      onSelect?.(columns)
      return q
    },
    eq: () => q,
    order: () => q,
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
    for (const forbidden of ['parameters', 'detail', 'evaluated', 'error']) {
      expect(selected[0]).not.toContain(forbidden)
    }
    expect(row.agentLabel).toBe('flow-bot')
    expect(row.agentLabelSource).toBe('declared')
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

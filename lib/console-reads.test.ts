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

function builder(result: Result): Query {
  const q: Query = {
    select: () => q,
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
})

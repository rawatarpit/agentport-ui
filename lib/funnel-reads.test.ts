import { describe, expect, it, vi } from 'vitest'

const { from } = vi.hoisted(() => ({ from: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ from }),
}))

import { readAcquisitionCounts } from './funnel-reads'

type Query = {
  select: (columns: string) => Query
  eq: (column: string, value: string) => Query
  then: (resolve: (result: { data: unknown; error: { message: string } | null }) => unknown) => void
}

function builder(
  result: { data: unknown; error: { message: string } | null },
  onSelect?: (columns: string) => void,
  onEq?: (column: string, value: string) => void,
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
    then: (resolve) => resolve(result),
  }
  return q
}

describe('acquisition funnel reads', () => {
  it('returns fifteen unknowns when the acquisition read fails', async () => {
    from.mockReturnValueOnce(builder({ data: null, error: { message: 'read failed' } }))

    expect(await readAcquisitionCounts('tenant')).toEqual(Array(15).fill(null))
  })

  it('counts only stored event types from the caller’s tenant', async () => {
    const selected: string[] = []
    const eqs: Array<[string, string]> = []
    from.mockReturnValueOnce(
      builder(
        {
          data: [
            { event_type: 'report_saved' },
            { event_type: 'report_saved' },
            { event_type: 'signup_started' },
            { event_type: 'unmapped' },
          ],
          error: null,
        },
        (columns) => selected.push(columns),
        (column, value) => eqs.push([column, value]),
      ),
    )

    const counts = await readAcquisitionCounts('tenant')

    expect(from).toHaveBeenCalledWith('acquisition_events')
    expect(selected).toEqual(['event_type'])
    expect(eqs).toEqual([['tenant_id', 'tenant']])
    expect(counts[0]).toBeNull()
    expect(counts[2]).toBe(2)
    expect(counts[3]).toBe(1)
    expect(counts.every((c) => c === null || Number.isFinite(c))).toBe(true)
  })
})

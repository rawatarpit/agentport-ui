import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const { from } = vi.hoisted(() => ({ from: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ from }),
}))

import { FUNNEL_EVENT_TYPES } from './funnel-event-types'
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
  it('returns one unknown per canonical event when the acquisition read fails', async () => {
    from.mockReturnValueOnce(builder({ data: null, error: { message: 'read failed' } }))

    const counts = await readAcquisitionCounts('tenant')

    expect(counts).toEqual(Array(FUNNEL_EVENT_TYPES.length).fill(null))
    expect(counts).toHaveLength(FUNNEL_EVENT_TYPES.length)
  })

  it('counts only stored event types from the caller’s tenant', async () => {
    const selected: string[] = []
    const eqs: Array<[string, string]> = []
    from.mockReturnValueOnce(
      builder(
        {
          data: [
            { event_type: 'signup_started', event_id: 'event-a' },
            { event_type: 'signup_started', event_id: 'event-b' },
            { event_type: 'report_saved', event_id: 'legacy-client-row' },
            { event_type: 'deployment_verified', event_id: 'legacy-client-row' },
            { event_type: 'unmapped', event_id: 'event-c' },
          ],
          error: null,
        },
        (columns) => selected.push(columns),
        (column, value) => eqs.push([column, value]),
      ),
    )

    const counts = await readAcquisitionCounts('tenant')

    expect(from).toHaveBeenCalledWith('acquisition_events')
    expect(selected).toEqual(['event_type, event_id'])
    expect(eqs).toEqual([['tenant_id', 'tenant']])
    expect(counts[0]).toBeNull()
    expect(counts[FUNNEL_EVENT_TYPES.indexOf('report_saved')]).toBeNull()
    expect(counts[FUNNEL_EVENT_TYPES.indexOf('deployment_verified')]).toBeNull()
    expect(counts[FUNNEL_EVENT_TYPES.indexOf('signup_started')]).toBe(2)
    expect(counts.every((c) => c === null || Number.isFinite(c))).toBe(true)
  })

  it('counts server-only milestones only when they carry the server namespace', async () => {
    from.mockReturnValueOnce(
      builder({
        data: [
          { event_type: 'configuration_applied', event_id: 'server:configuration_applied:tenant' },
          { event_type: 'configuration_applied', event_id: 'legacy-client-row' },
          { event_type: 'deployment_verified', event_id: 'server:deployment_verified:tenant' },
        ],
        error: null,
      }),
    )

    const counts = await readAcquisitionCounts('tenant')

    expect(counts[FUNNEL_EVENT_TYPES.indexOf('configuration_applied')]).toBe(1)
    expect(counts[FUNNEL_EVENT_TYPES.indexOf('deployment_verified')]).toBe(1)
  })
})

describe('funnel page renders an unheard event as unknown', () => {
  const page = readFileSync(join(process.cwd(), 'app/(app)/funnel/page.tsx'), 'utf8')

  it('maps every canonical event to a card whose null count renders unknown', () => {
    expect(page).toContain('const ACQUISITION_COPY: Record<FunnelEventType, MetricCopy> = {')
    expect(page).toContain('FUNNEL_EVENT_TYPES.map((event_type, index) => ({')
    expect(page).toContain('value: counts[index] ?? null,')
    expect(page).toContain("{card.value === null ? 'unknown' : card.value}")
  })

  it('never turns a null count into a healthy zero', () => {
    expect(page).not.toMatch(/card\.value\s*\?\?\s*0|counts\[index\]\s*\?\?\s*0/)
  })
})

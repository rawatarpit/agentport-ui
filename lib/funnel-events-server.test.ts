import { beforeEach, describe, expect, it, vi } from 'vitest'

const { from, upsert } = vi.hoisted(() => {
  const upsert = vi.fn(async () => ({ error: null as { message: string } | null }))
  const from = vi.fn(() => ({ upsert }))
  return { from, upsert }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ from }),
}))

import { trackServerEvent } from './funnel-events-server'

const event = {
  event_type: 'report_refreshed' as const,
  user_id: 'user-1',
  tenant_id: 'tenant-1',
        source_route: '/api/research/saved-reports/%5Bid%5D/refresh',
  event_id: 'refresh-1',
}

describe('server funnel tracking', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    upsert.mockResolvedValue({ error: null })
  })

  it('writes idempotently with a bounded event id', async () => {
    await trackServerEvent(event)

    expect(from).toHaveBeenCalledWith('acquisition_events')
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_id: 'server:refresh-1',
        event_type: 'report_refreshed',
        visitor_id: 'user-1',
        user_id: 'user-1',
        tenant_id: 'tenant-1',
  source_route: '/api/research/saved-reports/%5Bid%5D/refresh',
      }),
      { onConflict: 'event_id', ignoreDuplicates: true },
    )
  })

  it('does not turn an insert error into a failed merchant action', async () => {
    upsert.mockResolvedValueOnce({ error: { message: 'write failed' } })

    await expect(trackServerEvent(event)).resolves.toBeUndefined()
  })

  it('does not turn a thrown insert into a failed merchant action', async () => {
    upsert.mockRejectedValueOnce(new Error('transport failed'))

    await expect(trackServerEvent(event)).resolves.toBeUndefined()
  })
})

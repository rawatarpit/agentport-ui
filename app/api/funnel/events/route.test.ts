import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => {
  const state = { activeStatus: 'active' as 'active' | 'unauthenticated' | 'selection_required' }
  return {
    state,
    guard: vi.fn(() => null as Response | null),
    resolveTenant: vi.fn(async () => ({
      userId: state.activeStatus === 'unauthenticated' ? null : 'server-user',
      email: null as string | null,
      active: { status: state.activeStatus, tenantId: 'server-tenant' },
    })),
    upsert: vi.fn(
      async (_rows: unknown, _options?: unknown) => ({ error: null as { message: string } | null }),
    ),
  }
})

vi.mock('@/lib/request-guard', () => ({ guardStateChange: h.guard }))
vi.mock('@/lib/tenant-server', () => ({ resolveRequestTenant: h.resolveTenant }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ from: () => ({ upsert: h.upsert }) }),
}))

import { POST } from './route'

const VISITOR = '11111111-1111-4111-8111-111111111111'

function post(body: unknown): NextRequest {
  return new NextRequest('https://console.test/api/funnel/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function event(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    event_id: 'event-1',
    event_type: 'pilot_form_submitted',
    visitor_id: VISITOR,
    source_route: '/pilot',
    ...overrides,
  }
}

function storedRows(): Array<Record<string, unknown>> {
  return h.upsert.mock.calls[0]?.[0] as Array<Record<string, unknown>>
}

beforeEach(() => {
  h.state.activeStatus = 'active'
  h.guard.mockReset()
  h.guard.mockReturnValue(null)
  h.resolveTenant.mockClear()
  h.upsert.mockReset()
  h.upsert.mockResolvedValue({ error: null })
})

describe('POST /api/funnel/events', () => {
  it('guards same-origin and rate before resolving identity or writing', async () => {
    h.guard.mockReturnValueOnce(
      Response.json({ status: 'error', reason: 'Cross-origin request refused.' }, { status: 403 }),
    )
    const req = post({ events: [event()] })

    const res = await POST(req)

    expect(res.status).toBe(403)
    expect(h.guard).toHaveBeenCalledWith(req, 'funnel:events')
    expect(h.resolveTenant).not.toHaveBeenCalled()
    expect(h.upsert).not.toHaveBeenCalled()
  })

  it('rejects an unknown event type with 400 and no insert', async () => {
    const res = await POST(post({ events: [event({ event_type: 'delete_everything' })] }))
    const body = (await res.json()) as { status: string; reason: string }

    expect(res.status).toBe(400)
    expect(body.status).toBe('error')
    expect(body.reason).toMatch(/event_type/)
    expect(h.upsert).not.toHaveBeenCalled()
  })

  it('rejects a non-pathname source_route with 400 and no insert', async () => {
    const res = await POST(post({ events: [event({ source_route: '//evil.test/steal' })] }))

    expect(res.status).toBe(400)
    expect(h.upsert).not.toHaveBeenCalled()
  })

  it('rejects a reserved server event_id so client retries cannot suppress milestones', async () => {
    const res = await POST(
      post({
        events: [
          event({
            event_type: 'installation_completed',
            event_id: 'server:installation_completed:server-tenant',
          }),
        ],
      }),
    )
    const body = (await res.json()) as { reason: string }

    expect(res.status).toBe(400)
    expect(body.reason).toMatch(/client event_id/)
    expect(h.upsert).not.toHaveBeenCalled()
  })

  it('rejects a server-only milestone even with a client-shaped event_id', async () => {
    const res = await POST(
      post({
        events: [
          event({
            event_type: 'configuration_applied',
            event_id: 'client-fake-1',
          }),
        ],
      }),
    )
    const body = (await res.json()) as { reason: string }

    expect(res.status).toBe(400)
    expect(body.reason).toMatch(/server-only/)
    expect(h.upsert).not.toHaveBeenCalled()
  })

  it('stores a pathname with the server identity and ignores client context', async () => {
    const res = await POST(
      post({
        events: [
          event({
            source_route: '/pilot?email=ada%40example.test&amount=2500#form',
            metadata: { email: 'ada@example.test', amount: 2500 },
            industry: 'retail',
            geography: 'India',
            tenant_id: 'evil-tenant',
            user_id: 'evil-user',
          }),
        ],
      }),
    )

    expect(res.status).toBe(204)
    expect(h.upsert).toHaveBeenCalledTimes(1)
    expect(storedRows()[0]).toEqual({
      event_id: 'event-1',
      event_type: 'pilot_form_submitted',
      visitor_id: VISITOR,
      user_id: 'server-user',
      tenant_id: 'server-tenant',
      source_route: '/pilot',
      metadata: {},
    })
    expect(JSON.stringify(storedRows())).not.toMatch(/ada@example|retail|India|evil/)
  })

  it('does not promote body-supplied tenant or user for an anonymous caller', async () => {
    h.state.activeStatus = 'unauthenticated'

    const res = await POST(
      post({ events: [event({ tenant_id: 'evil-tenant', user_id: 'evil-user' })] }),
    )

    expect(res.status).toBe(204)
    expect(storedRows()[0]).toMatchObject({ user_id: null, tenant_id: null })
  })

  it('keeps the session user when no workspace is selected', async () => {
    h.state.activeStatus = 'selection_required'

    const res = await POST(post({ events: [event()] }))

    expect(res.status).toBe(204)
    expect(storedRows()[0]).toMatchObject({ user_id: 'server-user', tenant_id: null })
  })

  it('inserts a duplicate event_id once and ignores conflicts at the database', async () => {
    const res = await POST(
      post({
        events: [
          event(),
          event({ event_type: 'pilot_form_submission_failed', source_route: '/pilot' }),
        ],
      }),
    )

    expect(res.status).toBe(204)
    expect(storedRows()).toHaveLength(1)
    expect(h.upsert.mock.calls[0]?.[1]).toEqual({
      onConflict: 'event_id',
      ignoreDuplicates: true,
    })
  })

  it('refuses a malformed JSON body', async () => {
    const res = await POST(
      new NextRequest('https://console.test/api/funnel/events', {
        method: 'POST',
        body: 'not-json',
      }),
    )

    expect(res.status).toBe(400)
    expect(h.upsert).not.toHaveBeenCalled()
  })
})

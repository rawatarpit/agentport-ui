import { afterEach, describe, expect, it, vi } from 'vitest'
import { FUNNEL_EVENT_TYPES } from '@/lib/funnel-event-types'
import { isClientWritableFunnelEventType, SERVER_ONLY_FUNNEL_EVENT_TYPES } from '@/lib/funnel-event-types'
import {
  isBoundedIdentifier,
  isClientEventId,
  MAX_FUNNEL_EVENTS,
  normalizeSourceRoute,
  validateFunnelRequest,
} from '@/lib/funnel-route'

const server = vi.hoisted(() => ({
  upsert: vi.fn(async (_rows: unknown, _options?: unknown) => ({ error: null })),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ from: () => ({ upsert: server.upsert }) }),
}))

import { trackServerEvent } from './funnel-events-server'

const VISITOR = '11111111-1111-4111-8111-111111111111'
const identity = { userId: 'server-user', tenantId: 'server-tenant' }

function event(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    event_id: 'event-1',
    event_type: 'hero_primary_cta_clicked',
    visitor_id: VISITOR,
    source_route: '/home',
    ...overrides,
  }
}

describe('source_route sanitizer', () => {
  it('keeps the pathname and cuts query and fragment before storing', () => {
    expect(normalizeSourceRoute('/home?email=ada%40example.test&amount=10#pilot')).toBe('/home')
    expect(normalizeSourceRoute('/intelligence/report?industry=retail')).toBe('/intelligence/report')
    expect(normalizeSourceRoute('/home')).toBe('/home')
  })

  it.each([
    'https://evil.test/steal',
    'http://evil.test/steal',
    '//evil.test/steal',
    '/\\evil.test',
    'not a path',
    '/home page',
    '/home\nset-cookie: session',
    '/home\u007f',
    '/%0d%0aheader',
    '/a/../b',
  ])('refuses %s', (value) => {
    expect(normalizeSourceRoute(value)).toBeNull()
  })

  it('refuses an overlong pathname', () => {
    expect(normalizeSourceRoute(`/${'a'.repeat(300)}`)).toBeNull()
  })

  it('treats a missing route as an empty path, never as caller text', () => {
    const result = validateFunnelRequest(
      { events: [event({ source_route: undefined })] },
      identity,
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.events[0].source_route).toBe('')
  })
})

describe('bounded identifiers', () => {
  it('accepts UUIDs and the bounded deterministic ids used by callers', () => {
    expect(isBoundedIdentifier(VISITOR)).toBe(true)
    expect(isBoundedIdentifier(`signup_started:${VISITOR}`)).toBe(true)
    expect(isBoundedIdentifier('hero-1')).toBe(true)
  })

  it.each(['', 'x'.repeat(97), 'bad id', 'bad\nid', '<script>', 42, null])(
    'refuses %s',
    (value) => {
      expect(isBoundedIdentifier(value)).toBe(false)
    },
  )

  it('reserves the server milestone namespace for server writers', () => {
    expect(isClientEventId('event-1')).toBe(true)
    expect(isClientEventId('server:installation_completed:server-tenant')).toBe(false)
  })
})

describe('funnel request validation', () => {
  it('accepts every browser-writable event name', () => {
    const clientTypes = FUNNEL_EVENT_TYPES.filter(isClientWritableFunnelEventType)
    const result = validateFunnelRequest(
      {
        events: clientTypes.map((event_type, index) =>
          event({ event_id: `event-${index}`, event_type }),
        ),
      },
      identity,
    )
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.events.map((row) => row.event_type)).toEqual(clientTypes)
  })

  it('refuses every server-only milestone from a browser batch', () => {
    expect(SERVER_ONLY_FUNNEL_EVENT_TYPES.length).toBeGreaterThan(0)
    for (const event_type of SERVER_ONLY_FUNNEL_EVENT_TYPES) {
      expect(isClientWritableFunnelEventType(event_type)).toBe(false)
      const result = validateFunnelRequest({ events: [event({ event_type })] }, identity)
      expect(result.ok, `${event_type} must stay server-only`).toBe(false)
      if (!result.ok) expect(result.reason).toMatch(/server-only/)
    }
  })

  it('ignores client context and keeps the server-resolved identity', () => {
    const result = validateFunnelRequest(
      {
        events: [
          event({
            metadata: { email: 'ada@example.test', amount: 2500 },
            industry: 'retail',
            geography: 'India',
            tenant_id: 'evil-tenant',
            user_id: 'evil-user',
          }),
        ],
      },
      identity,
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.events[0]).toEqual({
      event_id: 'event-1',
      event_type: 'hero_primary_cta_clicked',
      visitor_id: VISITOR,
      user_id: 'server-user',
      tenant_id: 'server-tenant',
      source_route: '/home',
      metadata: {},
    })
    expect(JSON.stringify(result.events[0])).not.toMatch(/ada@example|retail|India|evil/)
  })

  it('refuses an unknown event type', () => {
    const result = validateFunnelRequest(
      { events: [event({ event_type: 'delete_everything' })] },
      identity,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/event_type/)
  })

  it('refuses a browser-supplied id in the reserved server namespace', () => {
    const result = validateFunnelRequest(
      {
        events: [
          event({
            event_type: 'installation_completed',
            event_id: 'server:installation_completed:server-tenant',
          }),
        ],
      },
      identity,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/client event_id/)
  })

  it('stores a repeated event_id once', () => {
    const result = validateFunnelRequest(
      {
        events: [
          event(),
          event({ event_type: 'pilot_form_submitted', source_route: '/pilot' }),
        ],
      },
      identity,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.events).toHaveLength(1)
    expect(result.events[0].event_type).toBe('hero_primary_cta_clicked')
  })

  it('bounds the batch size', () => {
    const result = validateFunnelRequest(
      {
        events: Array.from({ length: MAX_FUNNEL_EVENTS + 1 }, (_, index) =>
          event({ event_id: `event-${index}` }),
        ),
      },
      identity,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/Maximum/)
  })
})

describe('server funnel writer', () => {
  afterEach(() => {
    server.upsert.mockClear()
    vi.unstubAllGlobals()
  })

  function writtenRow(): Record<string, unknown> {
    expect(server.upsert).toHaveBeenCalledTimes(1)
    expect(server.upsert.mock.calls[0]?.[1]).toEqual({
      onConflict: 'event_id',
      ignoreDuplicates: true,
    })
    return server.upsert.mock.calls[0]?.[0] as Record<string, unknown>
  }

  it('normalizes a server source_route to a pathname before writing', async () => {
    await trackServerEvent({
      event_type: 'report_saved',
      user_id: 'server-user',
      tenant_id: 'server-tenant',
      source_route: '/api/research/saved-reports?email=ada%40example.test&amount=2500',
    })

    const row = writtenRow()
    expect(row.source_route).toBe('/api/research/saved-reports')
    expect(JSON.stringify(row)).not.toMatch(/ada@example|email|amount|2500/)
  })

  it('writes only allowlisted fields and replaces an unbounded event_id', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => '22222222-2222-4222-8222-222222222222' })

    await trackServerEvent({
      event_type: 'report_refreshed',
      user_id: 'server-user',
      tenant_id: null,
      event_id: 'bad id',
    })

    const row = writtenRow()
    expect(Object.keys(row).sort()).toEqual([
      'event_id',
      'event_type',
      'metadata',
      'source_route',
      'tenant_id',
      'user_id',
      'visitor_id',
    ])
    expect(row.event_id).toBe('server:22222222-2222-4222-8222-222222222222')
    expect(row.metadata).toEqual({})
    expect(row.tenant_id).toBeNull()
  })

  it('namespaces caller-supplied deterministic ids so browser events cannot collide', async () => {
    await trackServerEvent({
      event_type: 'installation_completed',
      user_id: 'server-user',
      tenant_id: 'server-tenant',
      event_id: 'installation_completed:server-tenant',
    })

    const row = writtenRow()
    expect(row.event_id).toBe('server:installation_completed:server-tenant')
  })
})

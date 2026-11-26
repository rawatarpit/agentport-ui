import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FUNNEL_EVENT_TYPES } from '@/lib/funnel-event-types'
import type { FunnelEvent } from '@/lib/funnel-events'

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'funnel-events.ts'), 'utf8')
const VISITOR = '11111111-1111-4111-8111-111111111111'

const REQUIRED_EVENTS = [
  'intelligence_viewed',
  'report_generated',
  'report_saved',
  'report_refreshed',
  'signup_started',
  'signup_completed',
  'assessment_started',
  'assessment_completed',
  'installation_started',
  'github_app_installed',
  'repository_connected',
  'pull_request_created',
  'configuration_applied',
  'installation_completed',
  'deployment_verified',
  'merchant_profile_completed',
  'recommendation_viewed',
  'industry_selected',
  'geography_selected',
  'signup_submitted',
  'verification_email_sent',
  'intelligence_page_viewed',
  'report_viewed',
  'integration_started',
  'integration_completed',
  'pilot_requested',
  'hero_primary_cta_clicked',
  'hero_demo_cta_clicked',
  'product_demo_interaction',
  'integration_section_viewed',
  'pilot_section_viewed',
  'pilot_form_started',
  'pilot_form_submitted',
  'pilot_form_submission_failed',
] as const

const fetchMock = vi.fn(
  async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 204 }),
)

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('canonical funnel event names', () => {
  it('carries exactly the reviewed names once in the shared allowlist', () => {
    expect(FUNNEL_EVENT_TYPES).toHaveLength(34)
    expect(new Set(FUNNEL_EVENT_TYPES).size).toBe(FUNNEL_EVENT_TYPES.length)
    expect([...FUNNEL_EVENT_TYPES].sort()).toEqual([...REQUIRED_EVENTS].sort())
  })
})

describe('client funnel event source', () => {
  it('derives source_route from the pathname only', () => {
    expect(source).toContain('window.location.pathname')
    expect(source).not.toMatch(/window\.location\.(?:search|href|hash)|location\.(?:search|href|hash)/)
  })

  it('has no free-text payload fields on the wire', () => {
    expect(source).toContain('export type FunnelEvent = { event_type: FunnelEventType }')
    expect(source).not.toMatch(/\b(?:industry|geography|metadata)\s*:/)
    expect(source).not.toMatch(/event\[['"](?:industry|geography|metadata)['"]\]/)
  })
})

describe('client tracker transport', () => {
  it('sends only bounded ids, the pathname, and allowlisted names', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => '22222222-2222-4222-8222-222222222222' })
    vi.stubGlobal('window', {
      localStorage: { getItem: () => VISITOR, setItem: vi.fn() },
      location: {
        pathname: '/home',
        search: '?email=ada%40example.test',
        hash: '#pilot',
      },
      addEventListener: vi.fn(),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { track, trackReportViewed, flushTracker } = await import('@/lib/funnel-events')
    track(
      { event_type: 'hero_primary_cta_clicked', email: 'ada@example.test' } as unknown as FunnelEvent,
      'hero-1',
    )
    trackReportViewed()
    await flushTracker()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const init = fetchMock.mock.calls[0]?.[1]
    const body = JSON.parse(String(init?.body)) as { events: Array<Record<string, unknown>> }
    expect(body.events).toHaveLength(2)
    expect(body.events[0]).toEqual({
      event_id: 'hero-1',
      event_type: 'hero_primary_cta_clicked',
      visitor_id: VISITOR,
      source_route: '/home',
    })
    expect(body.events[1].event_type).toBe('report_viewed')
    expect(JSON.stringify(body)).not.toMatch(/ada@example|email|search|hash/)
  })

  it('sends later batches after an earlier flush', async () => {
    vi.stubGlobal('crypto', { randomUUID: () => '33333333-3333-4333-8333-333333333333' })
    vi.stubGlobal('window', {
      localStorage: { getItem: () => VISITOR, setItem: vi.fn() },
      location: { pathname: '/install' },
      addEventListener: vi.fn(),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { track, flushTracker } = await import('@/lib/funnel-events')
    track({ event_type: 'installation_started' }, 'later-1')
    await flushTracker()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const init = fetchMock.mock.calls[0]?.[1]
    const body = JSON.parse(String(init?.body)) as { events: Array<Record<string, unknown>> }
    expect(body.events).toEqual([
      {
        event_id: 'later-1',
        event_type: 'installation_started',
        visitor_id: VISITOR,
        source_route: '/install',
      },
    ])
  })
})

/**
 * Acquisition funnel event tracking.
 *
 * Events are emitted from the browser at key funnel transitions
 * (intelligence preview, signup, assessment, installation). Each event is
 * sent to `/api/funnel/events` and persisted in `acquisition_events`, where
 * RLS keeps anonymous visitors' rows separate from authenticated tenants'
 * rows.
 *
 * Design rules:
 *   - Analytics never breaks the user experience: every send is fire-and-forget.
 *   - The only client-side field is an allowlisted event name. The route
 *     ignores tenant, user, and any caller-supplied context.
 *   - `source_route` is the pathname only. A query string can carry an email,
 *     an amount, or a request payload, so it never enters this queue.
 *   - Client-generated `event_id` provides idempotency: a retry inserts the
 *     same row once.
 *   - No passwords, credentials, tokens, or payment fields are ever tracked.
 */

import type { FunnelEventType } from '@/lib/funnel-event-types'

const VISITOR_ID_KEY = 'agentport_visitor_id'
const EVENTS_ENDPOINT = '/api/funnel/events'
const FLUSH_INTERVAL_MS = 30_000
const MAX_QUEUE = 50

export type FunnelEvent = { event_type: FunnelEventType }

type StoredEvent = {
  event_id: string
  event_type: FunnelEventType
  visitor_id: string
  source_route: string
}

/**
 * Generate or retrieve a stable visitor ID from localStorage.
 * Returns null when localStorage is unavailable (private mode, blocked).
 */
export function getVisitorId(): string | null {
  if (typeof window === 'undefined' || !window.localStorage) return null
  try {
    let id = window.localStorage.getItem(VISITOR_ID_KEY)
    if (!id) {
      id = crypto.randomUUID()
      window.localStorage.setItem(VISITOR_ID_KEY, id)
    }
    return id
  } catch {
    return null
  }
}

function currentRoute(): string {
  if (typeof window === 'undefined') return ''
  return window.location.pathname
}

/**
 * In-memory queue with periodic flush and page-hide flush. Events are
 * dispatched one at a time; a failed send is dropped (analytics never
 * retries, because a retry could double-count a conversion).
 */
class FunnelTracker {
  private queue: StoredEvent[] = []
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private flushing = false

  enqueue(event: StoredEvent): void {
    this.queue.push(event)
    if (this.queue.length >= MAX_QUEUE) {
      this.flush()
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), FLUSH_INTERVAL_MS)
    }
    this.schedulePageHideFlush()
  }

  private schedulePageHideFlush(): void {
    if (typeof window === 'undefined') return
    const onHide = () => this.flush()
    window.addEventListener('pagehide', onHide, { once: true })
    window.addEventListener('beforeunload', onHide, { once: true })
  }

  async flush(): Promise<void> {
    if (this.flushing || this.queue.length === 0) return
    this.flushing = true
    const batch = this.queue.splice(0, this.queue.length)
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    try {
      await sendEvents(batch)
    } finally {
      this.flushing = false
    }
  }
}

const tracker = new FunnelTracker()

async function sendEvents(events: StoredEvent[]): Promise<void> {
  if (typeof window === 'undefined') return
  try {
    await fetch(EVENTS_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ events }),
      keepalive: true,
    })
  } catch {
    // Dropped. Analytics is advisory, not critical path.
  }
}

/**
 * Record a funnel event. Safe to call from client components and event
 * handlers; failures are silent and never propagate to the caller.
 *
 * An optional `event_id` can be provided for idempotency across page reloads.
 * When omitted, a random id is generated (suitable for actions that may
 * legitimately repeat).
 */
export function track(event: FunnelEvent, eventId?: string): void {
  const visitorId = getVisitorId()
  if (!visitorId) return

  const stored: StoredEvent = {
    event_id: eventId ?? crypto.randomUUID(),
    event_type: event.event_type,
    visitor_id: visitorId,
    source_route: currentRoute(),
  }

  tracker.enqueue(stored)
}

/**
 * Report-page seam. The report renderer is owned by another surface; it can
 * call this on mount without learning how the transport works or supplying a
 * payload.
 */
export function trackReportViewed(): void {
  track({ event_type: 'report_viewed' })
}

/** Flush any queued events immediately (page-level cleanup). */
export function flushTracker(): Promise<void> {
  return tracker.flush()
}

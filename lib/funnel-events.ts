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
 *   - Client-supplied tenant IDs are never trusted: the server resolves the
 *     tenant from the session for authenticated callers.
 *   - Client-generated `event_id` provides idempotency: a retry inserts the
 *     same row once.
 *   - No passwords, credentials, tokens, or payment fields are ever tracked.
 */

const VISITOR_ID_KEY = 'agentport_visitor_id'
const EVENTS_ENDPOINT = '/api/funnel/events'
const FLUSH_INTERVAL_MS = 30_000
const MAX_QUEUE = 50

export type FunnelEvent =
  | { event_type: 'intelligence_viewed'; industry?: string; geography?: string }
  | { event_type: 'industry_selected'; industry: string }
  | { event_type: 'geography_selected'; geography: string }
  | { event_type: 'report_generated'; industry?: string; geography?: string }
  | { event_type: 'report_saved' }
  | { event_type: 'report_refreshed' }
  | { event_type: 'signup_started' }
  | { event_type: 'signup_submitted' }
  | { event_type: 'verification_email_sent' }
  | { event_type: 'signup_completed' }
  | { event_type: 'merchant_profile_completed' }
  | { event_type: 'assessment_started' }
  | { event_type: 'assessment_completed' }
  | { event_type: 'recommendation_viewed' }
  | { event_type: 'installation_started' }
  | { event_type: 'github_app_installed' }
  | { event_type: 'repository_connected' }
  | { event_type: 'pull_request_created' }
  | { event_type: 'configuration_applied' }
  | { event_type: 'installation_completed' }
  | { event_type: 'deployment_verified' }

type StoredEvent = {
  event_id: string
  event_type: string
  visitor_id: string
  user_id?: string
  industry?: string | null
  geography?: string | null
  source_route: string
  metadata: Record<string, unknown>
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

/**
 * The current page's route, used as `source_route` so events can be
 * attributed to the screen they came from.
 */
function currentRoute(): string {
  if (typeof window === 'undefined') return ''
  return window.location.pathname + window.location.search
}

/**
 * In-memory queue with periodic flush and page-hide flush. Events are
 * dispatched one at a time; a failed send is dropped (analytics never
 * retries, because a retry could double-count a conversion).
 */
class FunnelTracker {
  private queue: StoredEvent[] = []
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private flushed = false

  enqueue(event: StoredEvent): void {
    if (this.flushed) return
    this.queue.push(event)
    if (this.queue.length >= MAX_QUEUE) {
      this.flush()
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), FLUSH_INTERVAL_MS)
    }
    this.schedulePageHideFlush()
  }

  private schedulePageHideFlush(): void {
    if (typeof window === 'undefined' || this.flushed) return
    const onHide = () => this.flush()
    window.addEventListener('pagehide', onHide, { once: true })
    window.addEventListener('beforeunload', onHide, { once: true })
  }

  async flush(): Promise<void> {
    if (this.flushed || this.queue.length === 0) return
    const batch = this.queue.splice(0, this.queue.length)
    this.flushed = true
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    await sendEvents(batch)
  }
}

const tracker = new FunnelTracker()

/**
 * Send one batch of events to the ingestion endpoint. Errors are swallowed:
 * the merchant's experience must not depend on analytics reaching the server.
 */
async function sendEvents(events: StoredEvent[]): Promise<void> {
  if (typeof window === 'undefined') return
  try {
    await fetch(EVENTS_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ events }),
      // keepalive lets the request survive page navigation.
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
 * When omitted, a random id is generated (suitable for user-initiated actions
 * like assessment submission that may legitimately repeat).
 */
export function track(
  event: FunnelEvent,
  eventId?: string
): void {
  const visitorId = getVisitorId()
  if (!visitorId) return

  const stored: StoredEvent = {
    event_id: eventId ?? crypto.randomUUID(),
    event_type: event.event_type,
    visitor_id: visitorId,
    industry: 'industry' in event ? event.industry ?? null : null,
    geography: 'geography' in event ? event.geography ?? null : null,
    source_route: currentRoute(),
    metadata: {},
  }

  tracker.enqueue(stored)
}

/**
 * Flush any queued events immediately. Intended for page-level cleanup
 * (e.g. React `unmount` on a critical transition).
 */
export function flushTracker(): Promise<void> {
  return tracker.flush()
}

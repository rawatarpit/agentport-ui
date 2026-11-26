/**
 * Server-side counterpart of `track()`. Inserts directly into
 * `acquisition_events` using the session client (RLS-scoped). Used by server
 * components that cannot access `window.localStorage`.
 *
 * The identity is resolved by the caller from the session — never from a
 * browser payload. When a caller is authenticated but has no selected tenant,
 * the event is visitor-attributed only.
 */

import { createClient } from '@/lib/supabase/server'
import type { FunnelEventType } from '@/lib/funnel-event-types'
import { isBoundedIdentifier, normalizeSourceRoute, SERVER_EVENT_ID_PREFIX } from '@/lib/funnel-route'

export async function trackServerEvent(event: {
  event_type: FunnelEventType
  user_id: string | null
  tenant_id: string | null
  source_route?: string | null
  /** Deterministic id for idempotency across page reloads. */
  event_id?: string
}): Promise<void> {
  if (typeof window !== 'undefined') {
    throw new Error('trackServerEvent must not be called from the browser')
  }

  const visitorId = event.user_id ?? crypto.randomUUID()
  const suppliedId =
    event.event_id && isBoundedIdentifier(event.event_id) ? event.event_id : crypto.randomUUID()
  const namespacedId = suppliedId.startsWith(SERVER_EVENT_ID_PREFIX)
    ? suppliedId
    : `${SERVER_EVENT_ID_PREFIX}${suppliedId}`
  const eventId = isBoundedIdentifier(namespacedId)
    ? namespacedId
    : `${SERVER_EVENT_ID_PREFIX}${crypto.randomUUID()}`
  const sourceRoute = normalizeSourceRoute(event.source_route) ?? ''

  const row = {
    event_id: eventId,
    event_type: event.event_type,
    visitor_id: visitorId,
    user_id: event.user_id,
    tenant_id: event.tenant_id,
    source_route: sourceRoute,
    metadata: {},
  }

  try {
    const { error } = await createClient()
      .from('acquisition_events')
      .upsert(row, { onConflict: 'event_id', ignoreDuplicates: true })
    if (error) {
      // Telemetry is advisory: a failed insert must not change the caller's outcome.
      return
    }
  } catch {
    // Dropped by design. A retry could double-count and analytics must never
    // turn a successful merchant action into a failed response.
  }
}

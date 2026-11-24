/**
 * Server-side counterpart of `track()`. Inserts directly into
 * `acquisition_events` using the session client (RLS-scoped). Used by server
 * components that cannot access `window.localStorage`.
 *
 * The `tenant_id` must be resolved server-side from the session — never
 * accepted from the caller. When the caller is authenticated but has no
 * selected tenant, `tenant_id` is null and the event is tracked as
 * visitor-attributed only.
 */

import { createClient } from '@/lib/supabase/server'

export async function trackServerEvent(event: {
  event_type: string
  user_id: string | null
  tenant_id: string | null
  industry?: string | null
  geography?: string | null
  source_route?: string | null
  metadata?: Record<string, unknown>
  /** Optional deterministic event id for idempotency across page reloads.
   * When provided, the same event id is used on every render so upsert
   * ignoreDuplicates prevents duplicate milestone rows. When omitted, a
   * random id is generated (suitable for user-initiated actions like
   * discovery checks that may legitimately repeat). */
  event_id?: string
}): Promise<void> {
  if (typeof window !== 'undefined') {
    throw new Error('trackServerEvent must not be called from the browser')
  }

  const visitorId = event.user_id ?? crypto.randomUUID()
  const db = createClient()

  await db.from('acquisition_events').insert({
    event_id: event.event_id ?? crypto.randomUUID(),
    event_type: event.event_type,
    visitor_id: visitorId,
    user_id: event.user_id,
    tenant_id: event.tenant_id,
    industry: event.industry ?? null,
    geography: event.geography ?? null,
    source_route: event.source_route ?? '',
    metadata: event.metadata ?? {},
  })
}

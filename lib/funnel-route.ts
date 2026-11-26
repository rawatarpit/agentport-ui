/**
 * Server-side privacy boundary for funnel ingestion.
 *
 * Everything the browser sends except an allowlisted event name, bounded ids,
 * and a pathname is treated as untrusted. The client's query string is never
 * persisted: it can carry an email, an amount, or a request payload, so only
 * `window.location.pathname` is accepted and even that is re-normalised here.
 */

import { isClientWritableFunnelEventType, type FunnelEventType } from '@/lib/funnel-event-types'

export const MAX_FUNNEL_EVENTS = 50

/**
 * Deterministic server milestones live in a reserved namespace. Without it a
 * browser can submit an id that collides with `installation_completed:<tenant>`
 * and suppress the server row through the shared conflict target.
 */
export const SERVER_EVENT_ID_PREFIX = 'server:'

const MAX_ID_LENGTH = 96
const MAX_SOURCE_ROUTE_LENGTH = 256
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const BOUNDED_ID = /^[A-Za-z0-9._:-]+$/
const SAFE_PATH = /^\/[A-Za-z0-9\-._~%!$&'()*+,;=:@/]*$/
const ENCODED_CONTROL = /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i

export function isBoundedIdentifier(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_ID_LENGTH) return false
  if (CONTROL_CHARS.test(value)) return false
  return UUID_SHAPE.test(value) || BOUNDED_ID.test(value)
}

/** Browser-supplied ids may never enter the server milestone namespace. */
export function isClientEventId(value: unknown): value is string {
  return isBoundedIdentifier(value) && !value.startsWith(SERVER_EVENT_ID_PREFIX)
}

/**
 * A pathname is the only route shape we store. Query and fragment are cut
 * before validation so a URL carrying personal data cannot smuggle it into a
 * path field; an encoded newline is refused because it becomes a header-shaped
 * string after decoding.
 */
export function normalizeSourceRoute(value: unknown): string | null {
  if (typeof value !== 'string' || CONTROL_CHARS.test(value)) return null
  const path = value.split(/[?#]/, 1)[0] ?? ''
  if (path.length === 0 || path.length > MAX_SOURCE_ROUTE_LENGTH) return null
  if (!path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\')) return null
  if (!SAFE_PATH.test(path)) return null
  if (ENCODED_CONTROL.test(path)) return null
  if (path.split('/').includes('..')) return null
  return path
}

export type FunnelIdentity = {
  userId: string | null
  tenantId: string | null
}

export type StoredFunnelEvent = {
  event_id: string
  event_type: FunnelEventType
  visitor_id: string
  user_id: string | null
  tenant_id: string | null
  source_route: string
  metadata: Record<string, never>
}

export type FunnelValidation =
  | { ok: true; events: StoredFunnelEvent[] }
  | { ok: false; reason: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Validate an entire batch before any write. Client-supplied tenant, user,
 * industry, geography, and metadata are never read from the body: the identity
 * comes from the session and the remaining fields are fixed to empty values.
 */
export function validateFunnelRequest(body: unknown, identity: FunnelIdentity): FunnelValidation {
  if (!isRecord(body) || !Array.isArray(body.events)) {
    return { ok: false, reason: 'events must be a non-empty array.' }
  }
  if (body.events.length === 0) {
    return { ok: false, reason: 'events must be a non-empty array.' }
  }
  if (body.events.length > MAX_FUNNEL_EVENTS) {
    return { ok: false, reason: `Maximum ${MAX_FUNNEL_EVENTS} events per request.` }
  }

  const events: StoredFunnelEvent[] = []
  const seen = new Set<string>()

  for (const raw of body.events) {
    if (!isRecord(raw)) {
      return { ok: false, reason: 'Each event must be an object.' }
    }
    if (!isClientEventId(raw.event_id)) {
      return { ok: false, reason: 'Each event needs a bounded client event_id.' }
    }
    if (!isClientWritableFunnelEventType(raw.event_type)) {
      return { ok: false, reason: 'This event_type is server-only.' }
    }
    if (!isBoundedIdentifier(raw.visitor_id)) {
      return { ok: false, reason: 'Each event needs a bounded visitor_id.' }
    }

    const sourceRoute =
      raw.source_route === undefined || raw.source_route === null
        ? ''
        : normalizeSourceRoute(raw.source_route)
    if (sourceRoute === null) {
      return { ok: false, reason: 'source_route must be a pathname.' }
    }

    if (seen.has(raw.event_id)) continue
    seen.add(raw.event_id)
    events.push({
      event_id: raw.event_id,
      event_type: raw.event_type,
      visitor_id: raw.visitor_id,
      user_id: identity.userId,
      tenant_id: identity.tenantId,
      source_route: sourceRoute,
      metadata: {},
    })
  }

  return { ok: true, events }
}

import { NextResponse, type NextRequest } from 'next/server'
import { guardStateChange } from '@/lib/request-guard'
import { resolveRequestTenant } from '@/lib/tenant-server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type ClientEvent = {
  event_id: string
  event_type: string
  visitor_id: string
  industry?: string | null
  geography?: string | null
  source_route?: string | null
  metadata?: Record<string, unknown>
}

type RequestBody = {
  events: ClientEvent[]
}

type StoredEvent = {
  event_id: string
  event_type: string
  visitor_id: string
  user_id: string | null
  tenant_id: string | null
  industry: string | null
  geography: string | null
  source_route: string
  metadata: Record<string, unknown>
}

const MAX_METADATA_KEYS = 10
const MAX_METADATA_SIZE = 1024 // bytes

function validateMetadata(metadata: unknown): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {}
  const entries = Object.entries(metadata)
  if (entries.length > MAX_METADATA_KEYS) return null
  let size = 0
  const cleaned: Record<string, unknown> = {}
  for (const [key, value] of entries) {
    if (typeof key !== 'string' || key.length > 64) return null
    size += key.length
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    ) {
      cleaned[key] = value
      size += JSON.stringify(value).length
    } else {
      return null
    }
    if (size > MAX_METADATA_SIZE) return null
  }
  return cleaned
}

/**
 * POST /api/funnel/events — ingest acquisition funnel events.
 *
 * Anonymous visitors (no session) insert rows with visitor_id and no
 * tenant_id; authenticated callers have tenant_id resolved server-side from
 * the session — the client must not supply it. Each event carries a
 * client-generated event_id for idempotency: a retry inserts the row once.
 *
 * No passwords, credentials, tokens, or payment fields are accepted or
 * stored. Events are fire-and-forget: a failed insert is a lost data point,
 * not a user-facing error.
 */
export async function POST(req: NextRequest) {
  const limited = guardStateChange(req, 'funnel:events')
  if (limited) return limited

  const tenant = await resolveRequestTenant()
  const db = createClient()

  // Resolve the caller's identity server-side. The client never supplies
  // tenant_id or user_id.
  let userId: string | null = null
  let tenantId: string | null = null

  if (tenant.active.status === 'active') {
    userId = tenant.userId
    tenantId = tenant.active.tenantId
  }

  let body: RequestBody
  try {
    body = (await req.json()) as RequestBody
  } catch {
    return NextResponse.json(
      { status: 'error', reason: 'Send a JSON body with an events array.' },
      { status: 400 },
    )
  }

  if (!body || !Array.isArray(body.events) || body.events.length === 0) {
    return NextResponse.json(
      { status: 'error', reason: 'events must be a non-empty array.' },
      { status: 400 },
    )
  }

  if (body.events.length > 50) {
    return NextResponse.json(
      { status: 'error', reason: 'Maximum 50 events per request.' },
      { status: 400 },
    )
  }

  const events: StoredEvent[] = body.events.map((e) => {
    if (!e.event_id || typeof e.event_id !== 'string') {
      throw new Error('Each event needs a non-empty event_id.')
    }
    if (!e.event_type || typeof e.event_type !== 'string') {
      throw new Error('Each event needs a non-empty event_type.')
    }
    if (!e.visitor_id || typeof e.visitor_id !== 'string') {
      throw new Error('Each event needs a non-empty visitor_id.')
    }

    return {
      event_id: e.event_id,
      event_type: e.event_type,
      visitor_id: e.visitor_id,
      user_id: userId,
      tenant_id: tenantId,
      industry: e.industry ?? null,
      geography: e.geography ?? null,
      source_route: e.source_route ?? '',
      metadata: validateMetadata(e.metadata) ?? {},
    }
  })

  const { error } = await db
    .from('acquisition_events')
    .upsert(events, { onConflict: 'event_id', ignoreDuplicates: true })

  if (error) {
    return NextResponse.json(
      { status: 'error', reason: 'Could not record events.' },
      { status: 500 },
    )
  }

  return new NextResponse(null, { status: 204 })
}

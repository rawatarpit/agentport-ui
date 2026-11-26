import { NextResponse, type NextRequest } from 'next/server'
import { guardStateChange } from '@/lib/request-guard'
import { resolveRequestTenant } from '@/lib/tenant-server'
import { createClient } from '@/lib/supabase/server'
import { validateFunnelRequest } from '@/lib/funnel-route'

export const dynamic = 'force-dynamic'

/**
 * POST /api/funnel/events — ingest acquisition funnel events.
 *
 * The session resolves identity; the shared validator resolves everything
 * else. A retry with the same event_id is stored once, both within a batch and
 * against durable rows through the conflict target.
 */
export async function POST(req: NextRequest) {
  const limited = guardStateChange(req, 'funnel:events')
  if (limited) return limited

  const tenant = await resolveRequestTenant()
  const identity = {
    userId: tenant.userId,
    tenantId: tenant.active.status === 'active' ? tenant.active.tenantId : null,
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { status: 'error', reason: 'Send a JSON body with an events array.' },
      { status: 400 },
    )
  }

  const validated = validateFunnelRequest(body, identity)
  if (!validated.ok) {
    return NextResponse.json({ status: 'error', reason: validated.reason }, { status: 400 })
  }

  const { error } = await createClient()
    .from('acquisition_events')
    .upsert(validated.events, { onConflict: 'event_id', ignoreDuplicates: true })

  if (error) {
    return NextResponse.json(
      { status: 'error', reason: 'Could not record events.' },
      { status: 500 },
    )
  }

  return new NextResponse(null, { status: 204 })
}

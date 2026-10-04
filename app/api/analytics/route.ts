import { analyticsProjectionBytes, type AnalyticsPush } from '@agentport/sdk'
import { addCounts, hasAnalytics, recordPush, resolveTenant } from '@/lib/store'
import { enforcingFromPush } from '@/lib/enforcing'

export const dynamic = 'force-dynamic'

async function sha256Hex(text: string): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * POST /api/analytics — counts in, rows never.
 *
 * DEVELOPMENT ONLY. In production the runtime pushes to the Supabase ingest
 * edge function directly (SYSTEM.md §8) — never through a Next.js route, so
 * merchant push traffic never queues behind this app's deploys. This endpoint
 * exists so the UI is exercisable without the backend; it refuses in
 * production with the address of the real one.
 */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === 'production') {
    return Response.json(
      { status: 'error', reason: 'Analytics ingest lives in Supabase, not here. The runtime pushes to the ingest edge function directly.' },
      { status: 503 },
    )
  }
  const tenantId = resolveTenant()
  let body: { push?: unknown; configHash?: unknown; pushedAt?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ status: 'error', reason: 'Body must be JSON.' }, { status: 400 })
  }
  const push = body.push as AnalyticsPush | undefined
  if (!push || typeof push !== 'object' || !Array.isArray(push.events) || !Array.isArray(push.callerMetrics)) {
    return Response.json({ status: 'error', reason: 'Body must carry an AnalyticsPush with events and callerMetrics.' }, { status: 400 })
  }
  if (push.pushVersion !== 1 || typeof push.pushId !== 'string' || push.pushId.length === 0) {
    return Response.json({ status: 'error', reason: 'Push needs a pushId at pushVersion 1.' }, { status: 400 })
  }
  const projection = analyticsProjectionBytes(push.pushId, push.events, push.callerMetrics, push.schema)
  const digest = await sha256Hex(projection)
  if (digest !== push.payloadSha256) {
    return Response.json({ status: 'error', reason: 'Push digest does not match its bytes — refused, not stored.' }, { status: 403 })
  }

  const counted = addCounts(
    tenantId,
    push.events.map((e) => ({
      capability: e.capability,
      rule: e.policyRule ?? e.denialReason ?? e.kind,
      decision: e.kind,
      n: e.count,
    })),
  )

  let enforcing = null as ReturnType<typeof enforcingFromPush> | null
  if (typeof body.configHash === 'string' && typeof body.pushedAt === 'string') {
    recordPush(tenantId, body.configHash, body.pushedAt)
    const row = { digest: body.configHash, pushedAt: body.pushedAt }
    enforcing = enforcingFromPush(row)
  }

  return Response.json({
    status: 'ok',
    receipt: { ok: true, events: push.events.length, metrics: push.callerMetrics.length },
    totals: counted.length,
    enforcing,
    note: hasAnalytics(tenantId) ? undefined : 'First push recorded.',
  })
}

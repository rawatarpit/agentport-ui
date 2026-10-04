import { createHmac, timingSafeEqual } from 'node:crypto'
import { alreadySawPush, recordSync, resolveTenant } from '@/lib/store'
import type { SyncPayload } from '@/lib/enforcing'

export const dynamic = 'force-dynamic'

const REPLAY_WINDOW_MS = 5 * 60_000

/**
 * POST /api/sync — the runtime-side receiver for a signed policy push.
 *
 * Four gates, in order: a signing secret must exist (503, never a silent
 * accept), the HMAC over the raw body must verify (403), the timestamp must
 * be fresh (403 — a captured push replayed next week changes nothing), and
 * the push id must be new (409 on replay). The shape gate is the load-bearing
 * one: a payload carrying `emergencyKillSwitch` is refused outright, so a
 * policy swap can never re-enable what a human turned off — the same rule
 * the `SyncPayload` type states, enforced again at the boundary because
 * types do not cross the network.
 *
 * Accepted pushes are recorded as receipts. Applying them is a runtime
 * restart from the signed artifact, not something this endpoint does by
 * side effect.
 *
 * DEVELOPMENT ONLY. Production sync is backend → runtime over the artifact
 * channel (TASKS.md §9 R1); nothing pushes policy through a Next.js route.
 */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === 'production') {
    return Response.json(
      { status: 'error', reason: 'Policy sync runs backend-to-runtime over the artifact channel, not through this app.' },
      { status: 503 },
    )
  }
  const secret = process.env.AGENTPORT_SIGNING_SECRET
  if (!secret) {
    return Response.json(
      { status: 'error', reason: 'Sync receiver has no signing secret. Unsigned policy is not policy.' },
      { status: 503 },
    )
  }
  const tenantId = resolveTenant()
  const sig = req.headers.get('x-agentport-signature') ?? ''
  const ts = req.headers.get('x-agentport-timestamp') ?? ''
  const pushId = req.headers.get('x-agentport-push-id') ?? ''

  // ISO strings and epoch millis both arrive in the wild — accept either.
  const trimmed = ts.trim()
  const at = /^\d+$/.test(trimmed) ? Number(trimmed) : Date.parse(trimmed)
  if (!Number.isFinite(at) || Math.abs(Date.now() - at) > REPLAY_WINDOW_MS) {
    return Response.json({ status: 'error', reason: 'Stale or unreadable timestamp — replays change nothing here.' }, { status: 403 })
  }
  if (!pushId) {
    return Response.json({ status: 'error', reason: 'A push id is required — deduplication is how replays are caught.' }, { status: 400 })
  }
  if (alreadySawPush(tenantId, pushId)) {
    return Response.json({ status: 'error', reason: 'Push already received — replay rejected.' }, { status: 409 })
  }

  const raw = await req.text()
  const want = `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`
  const a = Buffer.from(sig)
  const b = Buffer.from(want)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return Response.json({ status: 'error', reason: 'Bad signature — recorded, not applied.' }, { status: 403 })
  }

  let body: { capabilities?: unknown; policy?: unknown; fromDigest?: unknown }
  try {
    body = JSON.parse(raw) as typeof body
  } catch {
    return Response.json({ status: 'error', reason: 'Body must be JSON.' }, { status: 400 })
  }
  if (!Array.isArray(body.capabilities) || typeof body.policy !== 'object' || body.policy === null) {
    return Response.json({ status: 'error', reason: 'Push must carry capabilities and policy.' }, { status: 400 })
  }
  if (Object.hasOwn(body.policy as object, 'emergencyKillSwitch')) {
    return Response.json(
      { status: 'error', reason: 'Push carries the kill switch — refused. Policy swaps never touch it.' },
      { status: 403 },
    )
  }
  const payload = body as SyncPayload
  const digest = createHmac('sha256', secret).update(raw).digest('hex').slice(0, 32)
  const receipt = recordSync(tenantId, pushId, digest)
  return Response.json({
    status: 'ok',
    receipt: { pushId: receipt.pushId, digest: receipt.digest, receivedAt: receipt.receivedAt },
    capabilities: payload.capabilities.length,
    note: 'Recorded. The runtime restarts from the signed artifact to apply it.',
  })
}

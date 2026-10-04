import { getLive, getMerchant, publishLive, resolveTenant } from '@/lib/store'
import { compileLive, digestFor, goliveStatus } from '@/lib/golive'

export const dynamic = 'force-dynamic'

/**
 * Go-live — publishing, without a dashboard approval gate.
 *
 * TASKS.md 4.3 is decided: the merchant is the sole authority over their own
 * money, and editing is free — **sync is the act of publishing.** There is no
 * typed confirmation here because the signature lives where the merchant
 * already exercises control: the PR merge (or the typed kill-switch flip for
 * the one control that must stay local). What this endpoint keeps is the
 * concurrency guard: `fromDigest` must match what is live (or "none" on
 * first publish), so nobody publishes over a version they never read.
 * Publishing signs the config; only the runtime heartbeat turns it live.
 */
export async function GET() {
  const tenantId = resolveTenant()
  const merchant = getMerchant(tenantId)
  return Response.json({
    status: 'ok',
    businessName: merchant?.businessName ?? null,
    ...goliveStatus(tenantId),
  })
}

export async function POST(req: Request) {
  const tenantId = resolveTenant()
  const merchant = getMerchant(tenantId)
  if (!merchant) {
    return Response.json({ status: 'error', reason: 'No account yet — POST /api/signup first.' }, { status: 409 })
  }
  let body: { fromDigest?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ status: 'error', reason: 'Body must be JSON.' }, { status: 400 })
  }
  const compiled = compileLive(tenantId)
  if (!compiled.ok) {
    return Response.json({ status: 'error', reason: compiled.reason }, { status: 422 })
  }
  const current = getLive(tenantId)
  const want = typeof body.fromDigest === 'string' ? body.fromDigest : undefined
  const have = current?.digest ?? 'none'
  if (want !== have) {
    return Response.json(
      {
        status: 'error',
        reason: 'Someone published since you read the summary. Read it again — the confirm only signs what you saw.',
      },
      { status: 409 },
    )
  }
  let digest: string
  try {
    digest = digestFor(compiled.compiled.policy, compiled.compiled.capabilities)
  } catch (e) {
    return Response.json({ status: 'error', reason: (e as Error).message }, { status: 503 })
  }
  const row = publishLive({
    tenantId,
    version: (current?.version ?? 0) + 1,
    digest,
    policy: compiled.compiled.policy as Record<string, unknown>,
    capabilities: compiled.compiled.capabilities,
    emergencyKillSwitch: current?.emergencyKillSwitch ?? false,
    confirmedBy: merchant.email,
  })
  return Response.json({ status: 'ok', version: row.version, digest: row.digest, confirmedAt: row.confirmedAt })
}

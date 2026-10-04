import { getLive, getMerchant, publishLive, resolveTenant } from '@/lib/store'
import { compileLive, digestFor, goliveStatus } from '@/lib/golive'

export const dynamic = 'force-dynamic'

/**
 * Go-live — the signature ceremony.
 *
 * GET shows the plain-language summary of what publishing would enact, next
 * to the currently live version (or an explicit null: not deployed is a
 * value, and the panel already renders it as one).
 *
 * POST publishes, and only when three things hold: the typed confirmation is
 * exactly the merchant's business name, `fromDigest` matches what is live
 * (or "none" on first publish — no silent overwrite of a publish that landed
 * since the summary was read), and a signing secret exists to sign with.
 * The kill switch rides in the live row at its default (off) and can never
 * enter a sync payload — see lib/enforcing.ts.
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
  let body: { confirm?: unknown; fromDigest?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ status: 'error', reason: 'Body must be JSON.' }, { status: 400 })
  }
  if (typeof body.confirm !== 'string' || body.confirm.trim() !== merchant.businessName) {
    return Response.json(
      { status: 'error', reason: `Type your business name ("${merchant.businessName}") to confirm — nothing publishes on a guess.` },
      { status: 403 },
    )
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

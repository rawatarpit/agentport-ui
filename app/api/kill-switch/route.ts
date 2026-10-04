import { getLive, getMerchant, publishLive, resolveTenant } from '@/lib/store'

export const dynamic = 'force-dynamic'

/**
 * POST /api/kill-switch — engage or release the emergency switch.
 *
 * Two-step by construction: flipping requires the merchant's typed business
 * name, exactly like publishing once did. Engaging takes effect in the live
 * row immediately; releasing is equally typed, because a switch that flips
 * silently in either direction is a toy. Either way the switch lives only in
 * the live config row — the sync payload cannot express it (type + boundary
 * check), so no push, update, or rollback from here can clear what it sets.
 * Runtime-local monotonicity (an engaged switch surviving restarts and
 * rollbacks on the merchant's machine) is the runtime's job, not this route's.
 */
export async function POST(req: Request) {
  const tenantId = resolveTenant()
  const merchant = getMerchant(tenantId)
  if (!merchant) {
    return Response.json({ status: 'error', reason: 'No account yet — POST /api/signup first.' }, { status: 409 })
  }
  const live = getLive(tenantId)
  if (!live) {
    return Response.json({ status: 'error', reason: 'Nothing live to stop — publish a config first.' }, { status: 409 })
  }
  let body: { engage?: unknown; confirm?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ status: 'error', reason: 'Body must be JSON.' }, { status: 400 })
  }
  if (typeof body.engage !== 'boolean') {
    return Response.json({ status: 'error', reason: 'Say whether you are engaging or releasing: {"engage": true}.' }, { status: 400 })
  }
  if (typeof body.confirm !== 'string' || body.confirm.trim() !== merchant.businessName) {
    return Response.json(
      { status: 'error', reason: `Type your business name ("${merchant.businessName}") — the switch flips on nothing less.` },
      { status: 403 },
    )
  }
  const row = publishLive({ ...live, emergencyKillSwitch: body.engage, confirmedBy: merchant.email })
  return Response.json({
    status: 'ok',
    emergencyKillSwitch: row.emergencyKillSwitch,
    version: row.version,
    digest: row.digest,
    confirmedAt: row.confirmedAt,
  })
}

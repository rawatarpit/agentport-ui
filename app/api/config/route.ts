import { getLive, resolveTenant } from '@/lib/store'

export const dynamic = 'force-dynamic'

/**
 * GET /api/config — the signed live config for this tenant's snippet.
 *
 * Same-origin demo surface: in production this answers only a snippet
 * credential, because the payload names what is forbidden and what is held —
 * useful reconnaissance for whoever can read it. No live config yet is a
 * 404 with a reason, never an empty policy that reads as "allow everything".
 */
export async function GET() {
  const tenantId = resolveTenant()
  const live = getLive(tenantId)
  if (!live) {
    return Response.json({ status: 'error', reason: 'Not deployed — publish from the rules screen first.' }, { status: 404 })
  }
  return Response.json({
    status: 'ok',
    version: live.version,
    digest: live.digest,
    policy: live.policy,
    capabilities: live.capabilities,
    emergencyKillSwitch: live.emergencyKillSwitch,
    confirmedAt: live.confirmedAt,
  })
}

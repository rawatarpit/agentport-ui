import { getLive, resolveTenant } from '@/lib/store'

export const dynamic = 'force-dynamic'

/**
 * GET /api/config — the signed live config for this tenant's snippet.
 *
 * Honestly open in this demo: there is NO snippet-credential check here, so
 * this answers anyone who asks — and the payload names what is forbidden and
 * what is held, which is useful reconnaissance. Production must gate this on
 * a snippet credential (TASKS.md 12.1.1); until then, do not mistake this
 * comment for that control. No live config yet is a 404 with a reason, never
 * an empty policy that reads as "allow everything".
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

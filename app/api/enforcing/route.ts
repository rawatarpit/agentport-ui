import { getLatestPush } from '@/lib/backend-reads'
import { enforcingFromPush } from '@/lib/enforcing'
import { resolveRequestTenant, tenantRefusalResponse } from '@/lib/tenant-server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/enforcing — liveness truth for the panel, from the backend.
 * Digest + receipt time come from the newest Supabase `push_batches` row for
 * the selected tenant. No RAM, no computed digest: empty means unknown, never
 * green, and another membership's heartbeat never stands in for this one.
 */
export async function GET() {
  const tenant = await resolveRequestTenant()
  if (tenant.active.status !== 'active') {
    return tenantRefusalResponse(tenant.active)
  }

  const push = await getLatestPush(tenant.active.tenantId)
  const state = enforcingFromPush({ digest: push?.digest ?? null, pushedAt: push?.pushedAt ?? null })
  return Response.json({ status: 'ok', enforcing: state })
}

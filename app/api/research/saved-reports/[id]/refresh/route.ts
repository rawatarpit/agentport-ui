import { NextResponse, type NextRequest } from 'next/server'
import { guardStateChange } from '@/lib/request-guard'
import {
  requiredTenantId,
  getSavedReport,
  saveReport,
} from '@/lib/research/saved-reports'
import { buildSourcedReport } from '@/lib/intelligence/research-report'
import { resolveRequestTenant } from '@/lib/tenant-server'
import { trackServerEvent } from '@/lib/funnel-events-server'

export const dynamic = 'force-dynamic'

/**
 * Refresh a saved report: regenerate from the stored profile and save a new
 * snapshot, preserving the previous one. The old row is never overwritten or
 * deleted, so the merchant can reopen the original at any time.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const limited = guardStateChange(req, 'research:saved-reports:write')
  if (limited) return limited

  const tenant = await resolveRequestTenant()
  const tenantId = await requiredTenantId()
  if (!tenantId) {
    return NextResponse.json({ error: 'No active workspace selected.' }, { status: 403 })
  }

  const row = await getSavedReport(tenantId, params.id)
  if (!row) {
    return NextResponse.json({ error: 'Saved report not found.' }, { status: 404 })
  }

  const regenerated = await buildSourcedReport(row.profile)

  const saved = await saveReport(tenantId, {
    profile: row.profile,
    report: regenerated,
  })
  if (!saved) {
    return NextResponse.json({ error: 'Could not save refreshed report.' }, { status: 500 })
  }

  // Track the refresh only after a successful save.
  await trackServerEvent({
    event_type: 'report_refreshed',
    user_id: tenant.userId,
    tenant_id: tenant.active.status === 'active' ? tenant.active.tenantId : null,
    source_route: '/api/research/saved-reports/[id]/refresh',
  })

  return NextResponse.json({ status: 'ok', savedReportId: saved.id })
}

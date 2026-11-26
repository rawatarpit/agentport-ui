import { NextResponse, type NextRequest } from 'next/server'
import { guardStateChange } from '@/lib/request-guard'
import {
  requiredTenantId,
  saveReport,
  listSavedReports,
  deleteSavedReport,
  getSavedReport,
} from '@/lib/research/saved-reports'
import { resolveRequestTenant } from '@/lib/tenant-server'
import { trackServerEvent } from '@/lib/funnel-events-server'
import { parseResearchProfile } from '@/lib/intelligence/types'
import { buildSourcedReport } from '@/lib/intelligence/research-report'

export const dynamic = 'force-dynamic'

async function jsonBody(req: NextRequest): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const tenantId = await requiredTenantId()
  if (!tenantId) return NextResponse.json({ error: 'No active workspace selected.' }, { status: 403 })

  const id = req.nextUrl.searchParams.get('id')
  if (id) {
    const row = await getSavedReport(tenantId, id)
    if (!row.ok) return NextResponse.json({ status: 'error', reason: 'Unable to load saved reports.' }, { status: 502 })
    if (!row.value) return NextResponse.json({ status: 'error', reason: 'Saved report not found.' }, { status: 404 })
    return NextResponse.json({ status: 'ok', report: row.value })
  }

  const rows = await listSavedReports(tenantId)
  if (!rows.ok) return NextResponse.json({ status: 'error', reason: 'Unable to load saved reports.' }, { status: 502 })
  return NextResponse.json({ status: 'ok', reports: rows.value.map(({ id, profile, savedAt }) => ({ id, profile, savedAt })) })
}

export async function POST(req: NextRequest) {
  const limited = guardStateChange(req, 'research:saved-reports:write')
  if (limited) return limited

  const tenantId = await requiredTenantId()
  if (!tenantId) return NextResponse.json({ error: 'No active workspace selected.' }, { status: 403 })

  const body = await jsonBody(req)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  const profile = parseResearchProfile((body as { profile?: unknown }).profile)
  if (!profile) return NextResponse.json({ error: 'A profile with an industry is required.' }, { status: 400 })

  // Never trust a client-supplied report body: its provenance labels would then
  // be as unverifiable as the figures they describe. Generate the body here,
  // using the same sourced path as Refresh, so reopening shows a real report.
  let report
  try {
    report = await buildSourcedReport(profile)
  } catch {
    return NextResponse.json({ error: 'Could not generate the report body.' }, { status: 500 })
  }

  const saved = await saveReport(tenantId, { profile, report })
  if (!saved.ok) return NextResponse.json({ status: 'error', reason: 'Unable to save the report.' }, { status: 502 })

  // Track the save only after a successful write.
  const tenant = await resolveRequestTenant()
  await trackServerEvent({
    event_type: 'report_saved',
    user_id: tenant.userId,
    tenant_id: tenant.active.status === 'active' ? tenant.active.tenantId : null,
    source_route: '/api/research/saved-reports',
  })

  return NextResponse.json({ status: 'ok', savedReportId: saved.value.id })
}

export async function DELETE(req: NextRequest) {
  const limited = guardStateChange(req, 'research:saved-reports:write')
  if (limited) return limited

  const tenantId = await requiredTenantId()
  if (!tenantId) return NextResponse.json({ error: 'No active workspace selected.' }, { status: 403 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 })

  const deleted = await deleteSavedReport(tenantId, id)
  if (!deleted.ok) return NextResponse.json({ status: 'error', reason: 'Unable to delete the report.' }, { status: 502 })
  if (!deleted.value.deleted) return NextResponse.json({ status: 'error', reason: 'No visible report to delete.' }, { status: 404 })
  return NextResponse.json({ status: 'ok' })
}

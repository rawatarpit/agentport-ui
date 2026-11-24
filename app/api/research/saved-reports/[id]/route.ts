import { NextResponse, type NextRequest } from 'next/server'
import { guardStateChange } from '@/lib/request-guard'
import { requiredTenantId, deleteSavedReport } from '@/lib/research/saved-reports'

export const dynamic = 'force-dynamic'

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const limited = guardStateChange(req, 'research:saved-reports:write')
  if (limited) return limited

  const tenantId = await requiredTenantId()
  if (!tenantId) return NextResponse.json({ error: 'No active workspace selected.' }, { status: 403 })

  const id = params.id
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 })

  const ok = await deleteSavedReport(tenantId, id)
  if (!ok) return NextResponse.json({ error: 'Could not delete the report.' }, { status: 500 })
  return NextResponse.json({ status: 'ok' })
}

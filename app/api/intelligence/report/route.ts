import { NextResponse, type NextRequest } from 'next/server'
import { guardStateChange } from '@/lib/request-guard'
import { resolveRequestTenant, tenantRefusalResponse } from '@/lib/tenant-server'
import { requestIntelligenceEngine } from '@/lib/intelligence/engine-client'

export const dynamic = 'force-dynamic'

async function requireActiveTenant() {
  const tenant = await resolveRequestTenant()
  if (tenant.active.status !== 'active') {
    return { ok: false as const, response: tenantRefusalResponse(tenant.active) }
  }
  return { ok: true as const, tenant }
}

export async function GET() {
  const auth = await requireActiveTenant()
  if (!auth.ok) return auth.response
  const unavailable = await requestIntelligenceEngine()
  return NextResponse.json({
    status: 'unavailable',
    reason: unavailable.reason,
    checkedAt: unavailable.checkedAt,
    message: unavailable.message,
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireActiveTenant()
  if (!auth.ok) return auth.response

  const limited = guardStateChange(req, 'intelligence:run')
  if (limited) return limited

  const unavailable = await requestIntelligenceEngine()
  return NextResponse.json({
    status: 'unavailable',
    reason: unavailable.reason,
    checkedAt: unavailable.checkedAt,
    message: unavailable.message,
  })
}

import { getMerchant, resolveTenant } from '@/lib/store'

export const dynamic = 'force-dynamic'

/** GET /api/me — the current merchant, or an honest 404 when nobody signed up yet. */
export async function GET() {
  const tenantId = resolveTenant()
  const merchant = getMerchant(tenantId)
  if (!merchant) {
    return Response.json(
      { status: 'error', reason: 'No account on this tenant yet — POST /api/signup first.' },
      { status: 404 },
    )
  }
  return Response.json({ status: 'ok', tenantId, merchant })
}

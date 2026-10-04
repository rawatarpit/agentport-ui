import { getMerchant, normaliseWebsiteUrl, resolveTenant, setWebsiteUrl } from '@/lib/store'
import type { Merchant } from '@/lib/store'

export const dynamic = 'force-dynamic'

/**
 * GET /api/me — the current merchant, or an honest 404 when nobody signed up yet.
 * PUT /api/me — set the merchant's public runtime URL (TASKS.md 1.2).
 *
 * The website URL is the manifest's baseUrl: the address external agents call.
 * It lives on the merchant record — never on the dashboard origin — which is
 * what un-conflates the two addresses. Until it is set, the manifest falls
 * back to this dashboard's origin and says so.
 */
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

export async function PUT(req: Request) {
  const tenantId = resolveTenant()
  const current: Merchant | null = getMerchant(tenantId)
  if (!current) {
    return Response.json({ status: 'error', reason: 'No account yet — POST /api/signup first.' }, { status: 409 })
  }
  let body: { websiteUrl?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ status: 'error', reason: 'Body must be JSON.' }, { status: 400 })
  }
  const checked = normaliseWebsiteUrl(body.websiteUrl)
  if (!checked.ok) {
    return Response.json({ status: 'error', reason: (checked as { reason: string }).reason }, { status: 422 })
  }
  const merchant = setWebsiteUrl(tenantId, (checked as { url: string }).url)
  return Response.json({ status: 'ok', tenantId, merchant })
}

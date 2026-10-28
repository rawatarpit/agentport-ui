import { brokerFetch } from '@/lib/github-broker'
import { enforceRateLimit } from '@/lib/request-guard'

export const dynamic = 'force-dynamic'

/**
 * POST /api/github/webhook — transitional proxy to the GitHub broker.
 *
 * GitHub should be pointed directly at the broker's webhook URL. This route
 * remains for cutover only: it forwards the exact raw bytes and signature
 * headers, and it holds no webhook secret. The broker verifies the HMAC and
 * refuses an unverified delivery before parsing or storing anything.
 */
export async function POST(req: Request) {
  const limited = enforceRateLimit(req, 'github:webhook')
  if (limited) return limited

  const raw = await req.text()
  if (raw.length > 1_000_000) {
    return Response.json({ status: 'error', reason: 'Delivery body too large.' }, { status: 413 })
  }
  const headers = new Headers()
  for (const name of ['content-type', 'x-hub-signature-256', 'x-github-event', 'x-github-delivery']) {
    const value = req.headers.get(name)
    if (value) headers.set(name, value)
  }
  return brokerFetch(
    req,
    '/webhook',
    { method: 'POST', body: raw, headers },
    { requireSession: false },
  )
}

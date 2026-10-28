import { brokerFetch } from '@/lib/github-broker'

export const dynamic = 'force-dynamic'

/**
 * GET /api/github — GitHub App connection state.
 *
 * The broker is the only component that knows whether the App credentials
 * exist; the console must not report a configured App it cannot use. This
 * route forwards the status request and returns the broker's missing list
 * by name, never by value.
 */
export async function GET(req: Request) {
  return brokerFetch(req, '/status', undefined, { requireSession: false })
}

import { brokerFetch } from '@/lib/github-broker'

export const dynamic = 'force-dynamic'

/**
 * GET /api/github/diag — key-shape diagnostic for the App-credential loop.
 *
 * The broker returns metadata only: length, armor markers, newline style and
 * whether a candidate actually signs. It never returns key content. Signed-in
 * callers only; the console forwards the session and no credential itself.
 */
export async function GET(req: Request) {
  return brokerFetch(req, '/diag')
}

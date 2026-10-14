import { getLatestPush } from '@/lib/backend-reads'
import { enforcingFromPush } from '@/lib/enforcing'

export const dynamic = 'force-dynamic'

/**
 * GET /api/enforcing — liveness truth for the panel, from the backend.
 * Digest + receipt time come from the newest Supabase `push_batches` row
 * via RLS. No RAM, no computed digest: empty means unknown, never green.
 */
export async function GET() {
  const push = await getLatestPush()
  const state = enforcingFromPush({ digest: push?.digest ?? null, pushedAt: push?.pushedAt ?? null })
  return Response.json({ status: 'ok', enforcing: state })
}

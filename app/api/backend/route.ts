import { supabasePresence } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/backend — what the dashboard knows about its backend.
 *
 * Presence and addresses only, never credentials and never rows. The ingest
 * endpoint is derived from the public project URL (an identifier, safe to
 * ship); the push key is provisioned by an operator elsewhere and is not
 * observable from here by design.
 */
export async function GET() {
  const sb = supabasePresence()
  const url = (process.env.SUPABASE_URL ?? '').trim().replace(/\/$/, '')
  return Response.json({
    status: 'ok',
    supabase: sb,
    ingestEndpoint: url ? `${url}/functions/v1/analytics-ingest` : null,
  })
}

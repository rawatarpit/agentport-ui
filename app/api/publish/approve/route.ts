import { guardStateChange } from '@/lib/request-guard'

export const dynamic = 'force-dynamic'

/**
 * POST /api/publish/approve — retired.
 *
 * Publishing used to record an approval and return artifact bytes for the
 * merchant's browser to sign. The dashboard now calls /api/publish/apply,
 * which writes one append-only config version and advances the runtime
 * pointer. Keeping this route alive would let a stale client mutate the
 * capability inventory outside that audited transaction, so it refuses.
 */
export async function POST(req: Request) {
  const denied = guardStateChange(req, 'publish:apply')
  if (denied) return denied
  return Response.json(
    {
      status: 'error',
      reason:
        'The artifact publish path is retired. Apply a config through /api/publish/apply; the hosted governor reads it from the database.',
    },
    { status: 410 },
  )
}

import { guardStateChange } from '@/lib/request-guard'

export const dynamic = 'force-dynamic'

/**
 * POST /api/publish/artifact — retired.
 *
 * The governor no longer verifies a merchant-signed artifact at boot; it
 * reads the applied row in tenant_config_versions. This intake path would
 * write signed policy rows and touch the runtime row outside the apply
 * transaction, so it refuses rather than pretend to publish.
 */
export async function POST(req: Request) {
  const denied = guardStateChange(req, 'publish:apply')
  if (denied) return denied
  return Response.json(
    {
      status: 'error',
      reason:
        'The artifact upload path is retired. Apply a config through /api/publish/apply; there is no artifact to sign or upload.',
    },
    { status: 410 },
  )
}

import { agent } from '@/lib/agentport'

/**
 * DISCOVER.
 *
 * Generated from the capabilities that are actually registered and the policy
 * that is actually configured, so it cannot drift from the enforcement path.
 * Cache briefly: a manifest that changes on every deploy teaches agents to
 * distrust it.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json(agent.manifest(), {
    headers: {
      'cache-control': 'public, max-age=300, stale-while-revalidate=3600',
      'access-control-allow-origin': '*',
    },
  })
}

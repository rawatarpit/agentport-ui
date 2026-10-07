import { agent } from '@/lib/agentport'
import { getMerchant, resolveTenant } from '@/lib/store'

/**
 * DISCOVER.
 *
 * Generated from the capabilities that are actually registered and the policy
 * that is actually configured, so it cannot drift from the enforcement path.
 * Cache briefly: a manifest that changes on every deploy teaches agents to
 * distrust it.
 *
 * The advertised `baseUrl` is the merchant's runtime endpoint — never this
 * dashboard's origin. Until the merchant sets it (`PUT /api/me`), the
 * manifest carries the dashboard origin and says so in `note`, because an
 * agent calling the dashboard would reach a UI, not an enforcement point.
 * (Was the live bug in README/SYSTEM: the two addresses were conflated.)
 */
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const manifest = agent.manifest() as Record<string, unknown> & { baseUrl: string; note?: string }
  const websiteUrl = getMerchant(resolveTenant())?.websiteUrl ?? null
  if (websiteUrl) {
    manifest.baseUrl = websiteUrl
  } else {
    // No dashboard-origin variable exists by design: the fallback is the
    // request's own origin, labelled, so a missing merchant URL can never
    // silently become anything else — and nothing compiled-in can go stale.
    manifest.baseUrl = new URL(req.url).origin
    manifest.note =
      'Demo manifest: baseUrl is this dashboard because no merchant runtime URL is set yet (PUT /api/me). Agents calling it reach a UI, not an enforcement point.'
  }
  return Response.json(manifest, {
    headers: {
      'cache-control': 'public, max-age=300, stale-while-revalidate=3600',
      'access-control-allow-origin': '*',
    },
  })
}

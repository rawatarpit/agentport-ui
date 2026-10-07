export const dynamic = 'force-dynamic'

/**
 * GET /api/github — GitHub App connection state.
 *
 * The App is the delivery mechanism: install on the merchant's website repo,
 * open the install branch, PR, their merge is the signature. Until the App
 * credentials exist (App ID, private key, webhook secret — all owner-minted,
 * none inventable in code), every step reports exactly what is missing and
 * what mints it. A "connect" button that cannot connect is worse than none.
 */
export async function GET() {
  const appId = (process.env.GITHUB_APP_ID ?? '').trim()
  const key = (process.env.GITHUB_APP_PRIVATE_KEY ?? '').trim()
  const webhook = (process.env.GITHUB_WEBHOOK_SECRET ?? '').trim()
  const missing = [
    !appId && 'GITHUB_APP_ID — from the App settings page after you create it',
    !key && 'GITHUB_APP_PRIVATE_KEY — generate on the App settings page, server-only',
    !webhook && 'GITHUB_WEBHOOK_SECRET — set on the App, verified on every delivery',
  ].filter(Boolean) as string[]

  return Response.json({
    status: 'ok',
    configured: missing.length === 0,
    missing,
    flow: [
      'Install the App on the website repo (selected repositories, minimum scopes)',
      'We open branch agentport/install with the snippet, CLI and runtime wiring',
      'Their CI runs; they review; they merge — the merge is the signature',
      'Sync status and heartbeat land on this screen',
    ],
    // The pull request is shown on the overview the moment one exists for
    // this tenant — review state, CI state, merge state. Until the App
    // exists there is no PR to show, and the dashboard says exactly that
    // instead of rendering an empty PR widget as if one were coming.
    pr: { state: 'none' as const, reason: 'No GitHub App connected — no pull request exists yet.' },
  })
}

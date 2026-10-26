/**
 * GitHub returns the merchant to the dashboard, never to a URL supplied by
 * the caller. The origin is fixed and the path is `/`; only the machine
 * reason and an already-validated installation id become query parameters.
 */
export const DASHBOARD_ORIGIN = 'https://agentport.relayforge.in'

export function githubReturnUrl(reason: string, installationId?: number): string {
  const url = new URL('/', DASHBOARD_ORIGIN)
  url.searchParams.set('github', reason)
  if (installationId !== undefined) {
    if (!Number.isSafeInteger(installationId) || installationId <= 0) {
      throw new Error('installation id must be a positive safe integer')
    }
    url.searchParams.set('installation_id', String(installationId))
  }
  return url.toString()
}

/**
 * Failures belong on the diagnostics surface, not the dashboard: `/` is
 * gated and a signed-out or tenant-less caller loses the reason entirely.
 * `/connect` renders the same reason next to the retry controls.
 */
export function githubFailureUrl(reason: string): string {
  const url = new URL('/connect', DASHBOARD_ORIGIN)
  url.searchParams.set('github', reason)
  return url.toString()
}

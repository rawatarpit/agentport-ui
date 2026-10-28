import { createClient } from '@/lib/supabase/server'

/**
 * Thin console → GitHub broker client.
 *
 * The console no longer holds a GitHub App private key, OAuth client secret
 * or webhook secret. It forwards the caller's Supabase access token and a
 * shared service token over TLS; the broker verifies the caller, checks
 * tenant membership, and performs every GitHub operation itself.
 *
 * The access token is never logged and never placed in a query string. A
 * broker outage is a 503 with a caller-safe reason, never a fallback to a
 * local key path.
 */
const BROKER_URL = (process.env.GITHUB_BROKER_URL ?? '').trim().replace(/\/+$/, '')
const BROKER_TOKEN = (process.env.GITHUB_BROKER_TOKEN ?? '').trim()

function refusal(reason: string, status: number): Response {
  return Response.json({ status: 'error', reason }, { status })
}

export async function brokerFetch(
  req: Request,
  path: string,
  init?: RequestInit,
  options: { requireSession?: boolean } = {},
): Promise<Response> {
  void req
  if (!BROKER_URL || !BROKER_TOKEN) {
    return refusal('GitHub broker is not configured — this is our side.', 503)
  }

  const headers = new Headers(init?.headers)
  headers.set('X-AgentPort-Broker-Token', BROKER_TOKEN)
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  if (options.requireSession !== false) {
    try {
      const supabase = createClient()
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) return refusal('Sign in first.', 401)
      const { data } = await supabase.auth.getSession()
      if (!data.session?.access_token) return refusal('Sign in first.', 401)
      headers.set('Authorization', `Bearer ${data.session.access_token}`)
    } catch {
      return refusal('Sign in first.', 401)
    }
  }

  try {
    return await fetch(`${BROKER_URL}${path}`, {
      ...init,
      headers,
      cache: 'no-store',
    })
  } catch {
    return refusal('GitHub broker is unreachable — try again in a moment.', 503)
  }
}

/**
 * Server components have no incoming Request. The session comes from cookies
 * either way; this wrapper only supplies a placeholder for the unused arg.
 */
export function brokerFetchServer(
  path: string,
  init?: RequestInit,
  options: { requireSession?: boolean } = {},
): Promise<Response> {
  return brokerFetch(new Request('https://console.internal'), path, init, options)
}

/**
 * Bounded fetch for public research providers.
 *
 * No credentials are stored here. Providers that require a key (for example
 * Companies House) remain unavailable until the exact missing env var is
 * configured; this helper never invents a key or retries silently.
 */

const RESEARCH_USER_AGENT = 'AgentPort-Research/1.0 (https://agentport.relayforge.in)';
export const RESEARCH_TIMEOUT_MS = 12000;

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/**
 * Fetch one public JSON endpoint once. Timeouts and non-JSON responses are
 * failures, not empty data: the caller renders unknown, never a healthy zero.
 */
export async function fetchJson(url: string): Promise<Json> {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': RESEARCH_USER_AGENT,
    },
    signal: AbortSignal.timeout(RESEARCH_TIMEOUT_MS),
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error(`Unexpected content type from research provider: ${contentType}`);
  }

  return res.json();
}

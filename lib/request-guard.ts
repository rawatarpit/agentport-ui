import {
  checkRateLimit,
  rateLimitKey,
  rateLimitResponse,
  type RateLimitOptions,
} from '@/lib/rate-limit'

/**
 * Every state-changing route runs this before reading the body or touching
 * the session. Two independent refusals, one shared implementation:
 *
 * 1. Same-origin. The browser supplies `Origin` on cross-site and same-origin
 *    POST/PUT/PATCH/DELETE; older clients fall back to `Referer`. A request
 *    with neither header is refused, because "no evidence of origin" is not
 *    the same thing as "same origin". This is what stops a third-party page
 *    from riding the merchant's session cookie into a mutation.
 * 2. Rate limit. Fixed-window, keyed by client IP + route bucket. The limits
 *    are named here, next to the routes they protect, so budgets are not
 *    scattered as magic numbers.
 *
 * Webhooks (/api/github/webhook) and the development sync receiver (/api/sync)
 * skip the Origin check: they authenticate the request itself with an HMAC,
 * not a cookie, and GitHub does not send a browser Origin. They still use the
 * limiter below their signature check, so a valid-delivery flood is bounded.
 */

export const RATE_LIMITS = {
  'auth:login': { limit: 10, windowMs: 15 * 60_000 },
  'auth:signup': { limit: 5, windowMs: 60 * 60_000 },
  'auth:reset': { limit: 5, windowMs: 15 * 60_000 },
  'auth:password': { limit: 10, windowMs: 15 * 60_000 },
  'auth:signout': { limit: 30, windowMs: 60_000 },
  signup: { limit: 5, windowMs: 60 * 60_000 },
  workspace: { limit: 60, windowMs: 60_000 },
  drafts: { limit: 120, windowMs: 60_000 },
  me: { limit: 60, windowMs: 60_000 },
  team: { limit: 60, windowMs: 60_000 },
  'github:install': { limit: 20, windowMs: 60_000 },
  'github:read': { limit: 120, windowMs: 60_000 },
  'github:webhook': { limit: 300, windowMs: 60_000 },
  'github:disconnect': { limit: 20, windowMs: 60_000 },
  'github:pr': { limit: 20, windowMs: 60_000 },
  golive: { limit: 30, windowMs: 60_000 },
  'kill-switch': { limit: 10, windowMs: 60_000 },
  contact: { limit: 5, windowMs: 10 * 60_000 },
  'map:crawl': { limit: 5, windowMs: 5 * 60_000 },
  'publish:approve': { limit: 30, windowMs: 60_000 },
  'publish:artifact': { limit: 30, windowMs: 60_000 },
  sync: { limit: 60, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitOptions>

export type RateLimitBucket = keyof typeof RATE_LIMITS

function requestOrigin(req: Request): string | null {
  const origin = req.headers.get('origin')
  if (origin) {
    try {
      return new URL(origin).origin
    } catch {
      return null
    }
  }
  const referer = req.headers.get('referer')
  if (referer) {
    try {
      return new URL(referer).origin
    } catch {
      return null
    }
  }
  return null
}

export function isSameOrigin(req: Request): boolean {
  const supplied = requestOrigin(req)
  if (supplied === null) return false
  return supplied === new URL(req.url).origin
}

export function crossOriginResponse(): Response {
  return Response.json(
    {
      status: 'error',
      reason: 'Cross-origin request refused — state changes must come from this console.',
    },
    { status: 403 },
  )
}

export function enforceRateLimit(req: Request, bucket: RateLimitBucket): Response | null {
  const options = RATE_LIMITS[bucket]
  const result = checkRateLimit(rateLimitKey(req, bucket), options)
  if (result.allowed) return null
  return rateLimitResponse(result, options)
}

/**
 * The one call a state-changing route makes. Returns a refusal when the
 * request must not proceed, otherwise `null`.
 */
export function guardStateChange(req: Request, bucket: RateLimitBucket): Response | null {
  if (!isSameOrigin(req)) return crossOriginResponse()
  return enforceRateLimit(req, bucket)
}

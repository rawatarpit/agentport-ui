/**
 * A small in-process fixed-window limiter.
 *
 * It is deliberately dependency-free and deliberately single-instance: the
 * counters live in the Node process's memory. On a multi-instance deployment
 * (Netlify functions, several pods) each instance counts separately, so the
 * effective budget is `limit × instances`, and a cold start resets it. That is
 * still useful as a speed bump, but it is not a global control. The production
 * upgrade is a shared store (Upstash/Redis or the platform edge rate limiter)
 * keyed by the same `ip + bucket` shape used here.
 *
 * Keys are per client IP and per route bucket, so a burst against login cannot
 * spend the workspace/draft budget. EXPIRY_MS pruning bounds memory; if a
 * hostile client rotates IPs faster than the sweep, entries are evicted oldest
 * first rather than growing without limit.
 */

export type RateLimitOptions = {
  limit: number
  windowMs: number
}

export type RateLimitResult =
  | { allowed: true; remaining: number; resetAt: number; retryAfter: 0 }
  | { allowed: false; remaining: 0; resetAt: number; retryAfter: number }

type Entry = { count: number; resetAt: number }

const MAX_ENTRIES = 10_000
const store = new Map<string, Entry>()

function prune(now: number): void {
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key)
  }
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value
    if (oldest === undefined) break
    store.delete(oldest)
  }
}

export function checkRateLimit(key: string, options: RateLimitOptions, now = Date.now()): RateLimitResult {
  if (store.size > MAX_ENTRIES) prune(now)

  const current = store.get(key)
  if (!current || current.resetAt <= now) {
    const resetAt = now + options.windowMs
    store.set(key, { count: 1, resetAt })
    return { allowed: true, remaining: Math.max(0, options.limit - 1), resetAt, retryAfter: 0 }
  }

  if (current.count >= options.limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: current.resetAt,
      retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    }
  }

  current.count += 1
  return {
    allowed: true,
    remaining: Math.max(0, options.limit - current.count),
    resetAt: current.resetAt,
    retryAfter: 0,
  }
}

/**
 * Only a header the hosting platform sets is trusted. `x-forwarded-for` and
 * `x-real-ip` are caller-controlled when the app is not behind a proxy that
 * overwrites them, so accepting them would let a client choose a fresh bucket
 * per request. Netlify sets `x-nf-client-connection-ip`; Cloudflare sets
 * `cf-connecting-ip`. With neither, every caller shares `unknown` — a tighter
 * budget, not a bypass.
 */
export function clientIp(req: Request): string {
  const platform = req.headers.get('x-nf-client-connection-ip') ?? req.headers.get('cf-connecting-ip')
  const trimmed = (platform ?? '').trim()
  return trimmed || 'unknown'
}

export function rateLimitKey(req: Request, bucket: string): string {
  return `${bucket}:${clientIp(req)}`
}

export function rateLimitResponse(
  result: Extract<RateLimitResult, { allowed: false }>,
  options: RateLimitOptions,
): Response {
  return Response.json(
    {
      status: 'error',
      reason: 'Too many requests — slow down, then try again.',
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(result.retryAfter),
        'RateLimit-Limit': String(options.limit),
        'RateLimit-Remaining': '0',
        'RateLimit-Reset': String(Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))),
      },
    },
  )
}

/** Test seam only. Production callers never need to forget their counters. */
export function resetRateLimiter(): void {
  store.clear()
}

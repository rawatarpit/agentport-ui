/**
 * Security headers, kept out of next.config.mjs so they can be unit-tested.
 *
 * The CSP ships in report-only mode. It describes the destination we want —
 * no plugins/objects, no framing, scripts only from this origin plus a
 * per-request nonce, connections only to this origin, Supabase and GitHub's
 * API.
 *
 * The policy is emitted per-request by middleware, not statically from
 * next.config. Next's App Router inlines page-specific RSC flight-data
 * <script> tags (`self.__next_f.push(...)`) that no static hash can cover, so
 * script-src must carry a per-request nonce. Next reads that nonce from the
 * request's CSP header and stamps it on its own scripts; the root layout
 * stamps it on the inline theme bootstrap. The theme script's SHA-256 hash
 * stays as a fallback for any request that arrives without a nonce.
 *
 * To move to enforcement:
 *   1. Read the reports from real traffic (browser console / report endpoint)
 *      and remove every source the app actually needs.
 *   2. Rename the header from `Content-Security-Policy-Report-Only` to
 *      `Content-Security-Policy` in middleware. Keep a report-only copy for
 *      one release so a missed inline style shows up before users do.
 *   3. Tighten style-src only after removing inline styles; Tailwind's static
 *      CSS does not need `'unsafe-inline'`, but Next can inject runtime style
 *      tags in some paths.
 */

const TWO_YEARS_SECONDS = 63_072_000

/**
 * @typedef {{ key: string, value: string }} Header
 * @typedef {{ production?: boolean, supabaseUrl?: string | null }} HeaderEnv
 */

/**
 * @param {string | null | undefined} supabaseUrl
 * @returns {string[]}
 */
function connectSources(supabaseUrl) {
  const trimmed = (supabaseUrl ?? '').trim().replace(/\/$/, '')
  if (!trimmed) {
    // The app cannot function without a Supabase URL; keep the wildcard so a
    // missing build-time env does not make the report-only policy lie.
    return ["'self'", 'https://*.supabase.co', 'wss://*.supabase.co', 'https://api.github.com']
  }
  const ws = trimmed.replace(/^https:/, 'wss:')
  return ["'self'", trimmed, ws, 'https://api.github.com']
}

/**
 * @param {{ supabaseUrl?: string | null, nonce?: string }} [options]
 * @returns {string}
 */
export function contentSecurityPolicyReportOnly(options = {}) {
  const nonce = (options.nonce ?? '').trim()
  // The hash pins the one handwritten inline script (the theme bootstrap) even
  // if a request ever arrives without a nonce. The nonce covers Next's own
  // inline flight-data scripts, whose content is page-specific. A script needs
  // to match either, and script-src never falls back to 'unsafe-inline'.
  const scriptSrc = ["'self'", "'sha256-kmKrmjXC58uPxmpVKBAs8FlkG3/c/inNl/fg0h2Q7jo='"]
  if (nonce) scriptSrc.push(`'nonce-${nonce}'`)
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "form-action 'self'",
    `script-src ${scriptSrc.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src ${connectSources(options.supabaseUrl).join(' ')}`,
    "worker-src 'self'",
    "manifest-src 'self'",
  ].join('; ')
}

/**
 * @param {HeaderEnv} [env]
 * @returns {Header[]}
 */
export function securityHeaders(env = {}) {
  const production = env.production ?? process.env.NODE_ENV === 'production'

  /** @type {Header[]} */
  const headers = [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'X-Frame-Options', value: 'DENY' },
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
    // CSP is emitted per-request by middleware so it can carry a nonce; a
    // static header here would conflict with it and report every RSC page.
  ]

  // Only pin HTTPS when this is a production build. Setting HSTS in
  // development would pin http://localhost in the developer's browser for two
  // years, which is a self-inflicted outage.
  if (production) {
    headers.push({
      key: 'Strict-Transport-Security',
      value: `max-age=${TWO_YEARS_SECONDS}; includeSubDomains; preload`,
    })
  }

  return headers
}

/**
 * @param {HeaderEnv} [env]
 * @returns {Array<{ source: string, headers: Header[] }>}
 */
export function securityHeaderGroups(env = {}) {
  return [{ source: '/:path*', headers: securityHeaders(env) }]
}

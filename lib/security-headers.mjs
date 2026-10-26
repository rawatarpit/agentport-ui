/**
 * Security headers, kept out of next.config.mjs so they can be unit-tested.
 *
 * The CSP ships in report-only mode first. It describes the destination we
 * want — no plugins/objects, no framing, scripts only from this origin,
 * connections only to this origin, Supabase and GitHub's API — while the
 * browser reports violations instead of breaking Next's inline bootstrap.
 *
 * To move to enforcement:
 *   1. Read the reports from real traffic (browser console / report endpoint)
 *      and remove every source the app actually needs.
 *   2. When script-src violations are understood, issue a per-request nonce in
 *      middleware, set it on the CSP header and on the root layout's inline
 *      theme script, and let Next apply it to its own scripts. This requires
 *      dynamic rendering; the theme script is the only handwritten one here.
 *   3. Rename the header from `Content-Security-Policy-Report-Only` to
 *      `Content-Security-Policy`. Keep a report-only copy for one release so
 *      a missed inline style shows up before users do.
 *   4. Tighten style-src only after removing inline styles; Tailwind's static
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
 * @param {{ supabaseUrl?: string | null }} [options]
 * @returns {string}
 */
export function contentSecurityPolicyReportOnly(options = {}) {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "form-action 'self'",
    "script-src 'self'",
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
  const supabaseUrl = env.supabaseUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL

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
    { key: 'Content-Security-Policy-Report-Only', value: contentSecurityPolicyReportOnly({ supabaseUrl }) },
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

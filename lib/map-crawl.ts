import { lookup } from 'node:dns/promises'

/**
 * Automated site crawl into the Map flow (Phase 2 of frontend/backend
 * mapping). Pasted CLI output got us here; this reads the merchant's own
 * site directly — same-origin only, bounded, credentialless.
 *
 * SSRF posture, stated up front because a crawl endpoint is a fetch gadget
 * until proven otherwise:
 * - Target must equal the merchant's configured website origin EXACTLY
 *   (localhost allowed in non-production dev only). No subdomains, no
 *   alternates, no explicit-URL override — an allowlist with one entry.
 * - DNS resolves first and private/loopback/link-local answers refuse
 *   (DNS-rebinding guard): the hostname check alone trusts naming, and
 *   naming lies.
 * - GET only, same-origin links only, no cookies/auth headers forwarded,
 *   no request bodies. Caps: pages, bytes, seconds (see route).
 * - Output is route inventory shaped for reconcile(): crawled pages are
 *   DECLARED, never hit — they land in "unused" honestly until capture
 *   traffic corroborates them. A crawled route presented as live traffic
 *   would be the same lie as a seeded dashboard.
 */

export type CrawlTarget =
  | { ok: true; origin: string; host: string }
  | { ok: false; reason: string }

/** The merchant's configured website URL must be a valid https origin. */
export function parseMerchantOrigin(websiteUrl: unknown): CrawlTarget {
  if (typeof websiteUrl !== 'string' || websiteUrl.trim().length === 0) {
    return { ok: false, reason: 'No merchant website URL is set — set it on the connect screen first.' }
  }
  let url: URL
  try {
    url = new URL(websiteUrl.trim())
  } catch {
    return { ok: false, reason: 'Merchant website URL is not a valid URL.' }
  }
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    return { ok: false, reason: 'Merchant website URL must be https (localhost allowed in dev only).' }
  }
  return { ok: true, origin: url.origin, host: url.hostname.toLowerCase() }
}

/** Candidate must be the merchant origin itself — nothing else is crawlable. */
export function checkTarget(candidate: unknown, merchant: { origin: string; host: string }): CrawlTarget {
  if (candidate !== undefined && candidate !== null && candidate !== '') {
    return { ok: false, reason: 'Crawl target is fixed to the merchant website origin — explicit URLs are refused.' }
  }
  return { ok: true, origin: merchant.origin, host: merchant.host }
}

function isPublicIpv4(ip: string): boolean {
  const p = ip.split('.').map(Number)
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false
  const [a, b] = p
  if (a === 10) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && b === 168) return false
  if (a === 127) return false
  if (a === 169 && b === 254) return false
  if (a === 0) return false
  return true
}

function isPublicIpv6(ip: string): boolean {
  const low = ip.toLowerCase()
  if (low === '::1') return false
  if (low.startsWith('fc') || low.startsWith('fd')) return false
  if (low.startsWith('fe80:') || low.startsWith('fe80::')) return false
  if (low === '::' || low.startsWith('::ffff:')) return false
  return true
}

/** DNS-rebinding guard: resolve first, refuse non-public answers. */
export async function checkHostResolvesPublic(
  host: string,
  resolve: (host: string) => Promise<string[]> = async (h): Promise<string[]> => {
    // dns/promises typings return LookupAddress here; the wire value carries
    // .address either way. Never assume the shape — read the field.
    const r = (await lookup(h)) as unknown as string | { address: string }
    return [typeof r === 'string' ? r : r.address]
  },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  // Localhost is only reachable via the dev exception in parseMerchantOrigin;
  // anything resolving locally in production is a rebinding, not dev.
  if (host === 'localhost' || host === '127.0.0.1') {
    if (process.env.NODE_ENV === 'production') {
      return { ok: false, reason: 'Localhost crawl refused in production.' }
    }
    return { ok: true }
  }
  let addrs: string[]
  try {
    addrs = await resolve(host)
  } catch {
    return { ok: false, reason: 'Merchant host does not resolve.' }
  }
  if (addrs.length === 0) return { ok: false, reason: 'Merchant host does not resolve.' }
  for (const ip of addrs) {
    const public_ = ip.includes(':') ? isPublicIpv6(ip) : isPublicIpv4(ip)
    if (!public_) {
      return { ok: false, reason: 'Merchant host resolves to a non-public address — refusing (DNS-rebinding guard).' }
    }
  }
  return { ok: true }
}

/** Shape crawled same-origin paths into reconcile() input: declared, never hit. */
export function shapeCrawled(paths: string[]): Array<{ method: string; path: string; provenance: string[]; liveHits: number }> {
  const seen = new Set<string>()
  const out: Array<{ method: string; path: string; provenance: string[]; liveHits: number }> = []
  for (const raw of paths) {
    if (typeof raw !== 'string') continue
    let path = raw.split('?')[0].split('#')[0].trim()
    if (!path.startsWith('/')) continue
    if (path.length > 512) continue
    // Static assets are not routes an agent would call.
    if (/\.(js|mjs|css|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|map|json|xml|txt)$/i.test(path)) continue
    if (seen.has(`GET ${path}`)) continue
    seen.add(`GET ${path}`)
    out.push({ method: 'GET', path, provenance: ['crawl'], liveHits: 0 })
    if (out.length >= 500) break
  }
  return out
}

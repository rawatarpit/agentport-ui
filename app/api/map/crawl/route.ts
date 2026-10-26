import { demoGuard } from '@/lib/demo-gate'
import { getMerchant, resolveTenant } from '@/lib/store'
import { checkHostResolvesPublic, checkTarget, parseMerchantOrigin, shapeCrawled } from '@/lib/map-crawl'
import { guardStateChange } from '@/lib/request-guard'

export const dynamic = 'force-dynamic'

// Caps: a crawl that cannot end is a self-inflicted DoS with the merchant's
// bandwidth bill attached. Small, fixed, documented.
const MAX_PAGES = 50
const MAX_BYTES = 2_000_000
const TIMEOUT_MS = 10_000
const OVERALL_MS = 45_000

/**
 * POST /api/map/crawl — crawl the merchant's own site into inventory JSON.
 *
 * No body needed (an explicit URL is refused: the target is fixed to the
 * merchant's configured website origin). Responds with `{endpoints: [...]}`
 * shaped for the Map page's reconcile step — paste-equivalent output from a
 * live source. Every refusal is specific; every bound above is fail-closed.
 */
export async function POST(req: Request) {
  const guarded = guardStateChange(req, 'map:crawl')
  if (guarded) return guarded
  const denied = await demoGuard()
  if (denied) return denied
  const started = Date.now()
  const merchant = getMerchant(resolveTenant())
  const websiteUrl = merchant?.websiteUrl ?? null
  const parsed = parseMerchantOrigin(websiteUrl)
  if (!parsed.ok) {
    return Response.json({ status: 'error', reason: parsed.reason }, { status: 409 })
  }
  const target = checkTarget(undefined, parsed)
  if (!target.ok) {
    return Response.json({ status: 'error', reason: target.reason }, { status: 400 })
  }
  const dns = await checkHostResolvesPublic(target.host)
  if (!dns.ok) {
    return Response.json({ status: 'error', reason: dns.reason }, { status: 400 })
  }

  const seen = new Set<string>(['/'])
  const queue: string[] = ['/']
  const found: string[] = []
  let bytes = 0

  const fetchPage = async (path: string): Promise<string | null> => {
    if (Date.now() - started > OVERALL_MS) return null
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    try {
      const res = await fetch(target.origin + path, {
        signal: ctrl.signal,
        redirect: 'follow',
        headers: { 'User-Agent': 'agentport-map-crawl (+inventory only, no forms submitted)' },
      })
      // Redirects are followed by fetch — verify landing origin, or a
      // same-origin link that bounces elsewhere exfiltrates the crawl.
      try {
        if (new URL(res.url).origin !== target.origin) return null
      } catch {
        return null
      }
      const contentType = res.headers.get('content-type') ?? ''
      if (!res.ok || !contentType.includes('text/html')) return null
      const text = await res.text()
      bytes += text.length
      if (bytes > MAX_BYTES) return null
      return text
    } catch {
      return null
    } finally {
      clearTimeout(timer)
    }
  }

  // Same-origin links only: the href must resolve back under the merchant
  // origin, or it is someone else's route and none of our mapping business.
  const sameOriginLinks = (html: string): string[] => {
    const out: string[] = []
    const re = /href="([^"#]+)"/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(html)) !== null) {
      try {
        const u = new URL(m[1], target.origin)
        if (u.origin === target.origin) out.push(u.pathname)
      } catch {
        continue
      }
    }
    return out
  }

  while (queue.length > 0 && found.length < MAX_PAGES) {
    if (Date.now() - started > OVERALL_MS) break
    const path = queue.shift() as string
    found.push(path)
    const html = await fetchPage(path)
    if (html === null) continue
    for (const link of sameOriginLinks(html)) {
      if (!seen.has(link) && found.length + queue.length < MAX_PAGES) {
        seen.add(link)
        queue.push(link)
      }
    }
  }

  return Response.json({
    status: 'ok',
    origin: target.origin,
    endpoints: shapeCrawled(found),
    note: 'Crawled routes are declared, never hit — reconcile against capture traffic before promoting.',
  })
}

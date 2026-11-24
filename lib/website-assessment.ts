import { request as httpRequest, type ClientRequest, type IncomingHttpHeaders, type IncomingMessage } from 'node:http'
import { request as httpsRequest, type RequestOptions } from 'node:https'
import type { FileProbe, HtmlSignals, WebsiteEvidence } from './intelligence/readiness'

/**
 * Bounded public website inspection.
 *
 * This is a fetch gadget until proven otherwise, so all network policy lives
 * here and is fail-closed:
 *
 * - https only (localhost in development only), no credentials, no explicit
 *   host override beyond the submitted URL;
 * - the caller resolves every DNS answer, refuses private ones, and hands over
 *   one validated address; the socket is pinned to it and never re-resolves;
 * - GET only, redirects are never followed, no cookies or auth headers are
 *   forwarded, and a fixed set of public paths is probed;
 * - byte-accurate per-response and total caps, plus a short timeout.
 *
 * Nothing here reads a page behind a login, submits a form, or executes
 * script. A failed probe is reported as absent/unknown, never as a pass.
 */

export const MAX_RESPONSE_BYTES = 250_000
export const MAX_TOTAL_BYTES = 1_000_000
export const ASSESSMENT_TIMEOUT_MS = 6_000

const ACCEPT = 'text/html,application/json,text/plain,*/*'
const USER_AGENT = 'AgentPort-website-assessment (public files only; no forms, no cookies)'

export type AssessmentTarget =
  | { ok: true; origin: string; host: string; url: string }
  | { ok: false; reason: string }

export type PinnedAddress = { address: string; family: 4 | 6 }

export function parseAssessmentTarget(raw: unknown): AssessmentTarget {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { ok: false, reason: 'Give the public https:// address of the website to assess.' }
  }
  const value = raw.trim()
  if (value.length > 400) return { ok: false, reason: 'That address is too long.' }
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return { ok: false, reason: 'That is not a valid URL — include https:// and a host.' }
  }
  if (url.protocol !== 'https:' && !(url.hostname === 'localhost' && process.env.NODE_ENV !== 'production')) {
    return { ok: false, reason: 'Only https:// websites can be assessed (localhost is allowed in development).' }
  }
  if (url.username || url.password) {
    return { ok: false, reason: 'Credentials in the address are not accepted.' }
  }
  if (url.port && url.port !== '443' && url.hostname !== 'localhost') {
    return { ok: false, reason: 'Non-standard ports are not assessed.' }
  }
  const path = url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '')
  return { ok: true, origin: url.origin, host: url.hostname.toLowerCase(), url: `${url.origin}${path}` }
}

function originOf(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return url.origin
  } catch {
    return null
  }
}

/**
 * The submitted address must be the merchant's own registered site. Comparing
 * origins instead of full URLs still allows probing its public paths, while a
 * credentialled or non-web URL cannot smuggle a different origin through.
 */
export function checkRegisteredOrigin(
  submitted: unknown,
  registeredWebsite: string | null | undefined,
): { ok: true; origin: string } | { ok: false; reason: string } {
  const registered = originOf(registeredWebsite)
  if (!registered) return { ok: false, reason: 'Set the workspace website before scanning.' }
  const candidate = originOf(submitted)
  if (!candidate || candidate !== registered) {
    return { ok: false, reason: 'Assessment is limited to the workspace website origin.' }
  }
  return { ok: true, origin: candidate }
}

export type BoundedPage = {
  status: number | null
  contentType: string | null
  body: string
  bytes: number
  headers: Record<string, string>
  redirected: boolean
  error: string | null
}

const EMPTY_PROBE: FileProbe = { present: false, status: null, contentType: null, bytes: 0 }

/** Pure byte accounting: never decode past the cap, so no partial character enters the body. */
export function boundedByteChunks(
  chunks: readonly Uint8Array[],
  limit: number,
): { data: Uint8Array; bytes: number; truncated: boolean } {
  const kept: Uint8Array[] = []
  let remaining = Math.max(0, limit)
  let bytes = 0
  let truncated = false
  for (const chunk of chunks) {
    if (chunk.byteLength <= remaining) {
      kept.push(chunk)
      bytes += chunk.byteLength
      remaining -= chunk.byteLength
      continue
    }
    if (remaining > 0) {
      kept.push(chunk.subarray(0, remaining))
      bytes += remaining
      remaining = 0
    }
    truncated = true
    break
  }
  const data = new Uint8Array(bytes)
  let offset = 0
  for (const chunk of kept) {
    data.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { data, bytes, truncated }
}

/** Cancel the reader as soon as the cap is reached: an upstream must not keep streaming to us. */
export async function readBoundedStream(
  body: ReadableStream<Uint8Array> | null,
  limit: number,
): Promise<{ text: string; bytes: number; truncated: boolean }> {
  if (!body || limit <= 0) return { text: '', bytes: 0, truncated: limit <= 0 }
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let seen = 0
  try {
    while (seen < limit) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      seen += value.byteLength
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  const { data, bytes, truncated } = boundedByteChunks(chunks, limit)
  return { text: new TextDecoder().decode(data), bytes, truncated }
}

function headerValue(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

function securityHeaders(get: (key: string) => string | null): Record<string, string> {
  const headers: Record<string, string> = {}
  for (const key of ['strict-transport-security', 'content-security-policy']) {
    const value = get(key)
    if (value) headers[key] = value
  }
  return headers
}

function pageFromChunks(
  status: number,
  contentType: string | null,
  headers: Record<string, string>,
  chunks: readonly Uint8Array[],
  limit: number,
): BoundedPage {
  const { data, bytes } = boundedByteChunks(chunks, limit)
  return {
    status,
    contentType,
    body: new TextDecoder().decode(data),
    bytes,
    headers,
    redirected: false,
    error: null,
  }
}

type BoundedRequest = (
  options: RequestOptions,
  callback: (response: IncomingMessage) => void,
) => ClientRequest

/**
 * A validated address is the only answer the socket may use. The lookup hook
 * replaces DNS entirely; SNI and the Host header keep the original hostname so
 * TLS still authenticates the site we intended to reach.
 */
function fetchPinned(
  parsed: URL,
  limit: number,
  budget: { remaining: number },
  empty: BoundedPage,
  pinned: PinnedAddress,
): Promise<BoundedPage> {
  return new Promise((resolve) => {
    let settled = false
    let req: ClientRequest | null = null
    const finish = (page: BoundedPage) => {
      if (settled) return
      settled = true
      budget.remaining -= page.bytes
      if (req && !req.destroyed) req.destroy()
      resolve(page)
    }
    const request: BoundedRequest = parsed.protocol === 'https:' ? httpsRequest : httpRequest
    const options: RequestOptions = {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      host: parsed.hostname,
      port: parsed.port || undefined,
      method: 'GET',
      path: `${parsed.pathname}${parsed.search}`,
      servername: parsed.hostname,
      headers: {
        host: parsed.host,
        accept: ACCEPT,
        'accept-encoding': 'identity',
        'user-agent': USER_AGENT,
      },
      // Node 26 requests DNS with `{ all: true }`; the callback must then
      // return an array. Returning a bare address makes the socket dial
      // `undefined` and misreports a healthy site as unreachable.
      lookup: (
        _hostname: string,
        options: { all?: boolean } | undefined,
        callback: (
          error: NodeJS.ErrnoException | null,
          address: string | Array<{ address: string; family: number }>,
          family?: number,
        ) => void,
      ) => {
        const entry = { address: pinned.address, family: pinned.family }
        if (options?.all) callback(null, [entry])
        else callback(null, entry.address, entry.family)
      },
      timeout: ASSESSMENT_TIMEOUT_MS,
    }
    req = request(options, (res) => {
      const status = res.statusCode
      if (status === undefined) {
        res.destroy()
        finish({ ...empty, error: 'The site could not be reached.' })
        return
      }
      if (status >= 300 && status < 400) {
        res.destroy()
        finish({
          ...empty,
          status,
          redirected: true,
          error: 'Redirect refused — submit the final https address.',
        })
        return
      }
      const contentType = headerValue(res.headers['content-type'])
      const headers = securityHeaders((key) => headerValue(res.headers[key]))
      const chunks: Uint8Array[] = []
      let seen = 0
      res.on('data', (chunk: Buffer) => {
        if (settled) return
        chunks.push(chunk)
        seen += chunk.byteLength
        if (seen >= limit) {
          res.destroy()
          finish(pageFromChunks(status, contentType, headers, chunks, limit))
        }
      })
      res.on('end', () => finish(pageFromChunks(status, contentType, headers, chunks, limit)))
      res.on('error', () => finish({ ...empty, error: 'The site could not be reached.' }))
    })
    req.on('timeout', () => {
      if (req && !req.destroyed) req.destroy()
      finish({ ...empty, error: 'The site did not answer in time.' })
    })
    req.on('error', () => finish({ ...empty, error: 'The site could not be reached.' }))
    req.end()
  })
}

/**
 * GET, no redirects, no cookies. A pinned socket never performs another lookup.
 * The address is required: an unpinned global fetch would re-resolve DNS and
 * reopen the rebinding path the caller already validated and closed.
 */
export async function fetchBounded(
  url: string,
  budget: { remaining: number },
  pinned: PinnedAddress,
): Promise<BoundedPage> {
  const empty: BoundedPage = {
    status: null,
    contentType: null,
    body: '',
    bytes: 0,
    headers: {},
    redirected: false,
    error: null,
  }
  if (budget.remaining <= 0) return { ...empty, error: 'Byte budget exhausted.' }
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { ...empty, error: 'The site could not be reached.' }
  }
  const limit = Math.min(MAX_RESPONSE_BYTES, budget.remaining)
  return fetchPinned(parsed, limit, budget, empty, pinned)
}

export type ProbeKind = keyof WebsiteEvidence['probes'] | 'any'

function contentTypeMatches(kind: ProbeKind, contentType: string | null): boolean {
  if (kind === 'any') return true
  const value = (contentType ?? '').toLowerCase().split(';')[0]?.trim() ?? ''
  if (kind === 'agentJson' || kind === 'openApi') {
    return value === 'application/json' || value.endsWith('+json')
  }
  if (kind === 'sitemapXml') {
    return value === 'application/xml' || value === 'text/xml' || value.endsWith('+xml')
  }
  return value.startsWith('text/') && !value.includes('html')
}

/**
 * A 200 from a SPA fallback is not evidence of a discovery file. Callers pass
 * the probe kind so an HTML catch-all cannot make a JSON/XML/text file appear
 * present; the observed status and content type are still reported.
 */
export function probeFromPage(page: BoundedPage, kind: ProbeKind = 'any'): FileProbe {
  const probe = {
    status: page.status,
    contentType: page.contentType,
    bytes: page.bytes,
  }
  const ok = !page.redirected && page.status !== null && page.status >= 200 && page.status < 300
  return { ...probe, present: ok && contentTypeMatches(kind, page.contentType) }
}

/** Regex-based signals: enough to describe public structure, no HTML execution. */
export function parseHtml(body: string): HtmlSignals {
  if (!body) {
    return { title: null, metaDescription: false, jsonLdBlocks: 0, schemaTypes: [], priceSignals: 0, productLinks: 0 }
  }
  const titleMatch = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = titleMatch?.[1]?.replace(/<[^>]+>/g, '').trim().slice(0, 200) ?? null
  const metaDescription = /<meta[^>]+(?:name=["']description["']|property=["']og:description["'])[^>]+content=/i.test(body)
  const jsonLd: string[] = []
  for (const match of body.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    jsonLd.push(match[1] ?? '')
  }
  const schemaTypes = new Set<string>()
  for (const block of [...jsonLd, body]) {
    for (const match of block.matchAll(/"@type"\s*:\s*"?([A-Za-z]+)/g)) {
      const value = match[1]
      if (value) schemaTypes.add(value)
    }
  }
  const priceSignals = (body.match(/(?:₹|\$|€|£)\s?\d|\b(?:price|pricing|from\s+₹|add to cart|buy now)\b/gi) ?? []).length
  const productLinks = (body.match(/href=["'][^"']*\/(?:products?|catalog|shop)(?:\/|["'])/gi) ?? []).length
  return {
    title,
    metaDescription,
    jsonLdBlocks: jsonLd.length,
    schemaTypes: [...schemaTypes].sort().slice(0, 40),
    priceSignals,
    productLinks,
  }
}

export function buildEvidence(args: {
  target: string
  fetchedAt: string
  root: BoundedPage | null
  probes: WebsiteEvidence['probes']
  note?: string | null
}): WebsiteEvidence {
  const root = args.root
  const html = parseHtml(root?.body ?? '')
  const reachable = Boolean(root && !root.redirected && root.status !== null && root.status >= 200 && root.status < 300)
  const note =
    args.note ??
    (root?.redirected
      ? 'The site redirected. Redirects are refused, so no content was inspected.'
      : root?.error ?? null)
  return {
    url: args.target,
    finalUrl: reachable && root ? args.target : null,
    fetchedAt: args.fetchedAt,
    reachable,
    status: root?.status ?? null,
    note,
    https: args.target.startsWith('https://'),
    headers: {
      hsts: Boolean(root?.headers['strict-transport-security']),
      csp: Boolean(root?.headers['content-security-policy']),
    },
    html,
    probes: args.probes,
  }
}

export function unreachableEvidence(target: string, fetchedAt: string, reason: string): WebsiteEvidence {
  return buildEvidence({
    target,
    fetchedAt,
    root: null,
    note: reason,
    probes: {
      agentJson: EMPTY_PROBE,
      llmsTxt: EMPTY_PROBE,
      llmsFullTxt: EMPTY_PROBE,
      robotsTxt: EMPTY_PROBE,
      sitemapXml: EMPTY_PROBE,
      openApi: EMPTY_PROBE,
    },
  })
}

/**
 * Frontend + backend mapping: inventory in, capability drafts out.
 *
 * The merchant's own discovery output (`agent-port discover`, `capture`,
 * `inventory`) arrives here as pasted JSON — hostile-ish input by definition,
 * since it comes from a textarea, so every function below validates and never
 * throws on shape. The three buckets are the SDK's own vocabulary
 * (CORROBORATED / USED-NEVER-DECLARED / DECLARED-NEVER-USED); this module
 * only re-derives them from looser input, it does not redefine them.
 *
 * What this deliberately does NOT do (Phase 2, stated so nobody waits for
 * it here): crawl a live URL, scan a repo tree via installation token, or
 * persist runs anywhere durable. Drafts land in the RAM store like every
 * other draft; the publish flow downstream is unchanged.
 */

export type RawEndpoint = {
  method?: unknown
  path?: unknown
  provenance?: unknown
  liveHits?: unknown
  declared?: unknown
}

export type Endpoint = {
  method: string
  path: string
  /** True when a static pass (route table, contract, discover) named it. */
  declared: boolean
  /** Live requests observed. 0 for a pure declaration. */
  hits: number
}

export type Buckets = {
  /** Declared and hit live: the safe core of the catalog. */
  corroborated: Endpoint[]
  /** Hit live, named nowhere: shadow surface — the security-relevant bucket. */
  undeclared: Endpoint[]
  /** Declared, never hit: dead surface, prune candidate. */
  unused: Endpoint[]
  /** Named nowhere, hit nowhere: noise, counted and dropped. */
  dropped: number
}

const METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'] as const

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null
}

/** Parse pasted inventory JSON into endpoints, or a structured refusal. */
export function parseInventory(
  text: string,
): { ok: true; endpoints: RawEndpoint[] } | { ok: false; reason: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'Not JSON — paste the output of `agent-port inventory` or `discover`.' }
  }
  const root = asRecord(parsed)
  const list = Array.isArray(parsed) ? parsed : root?.endpoints
  if (!Array.isArray(list)) {
    return { ok: false, reason: 'No endpoint list found — expected an array or {"endpoints": [...]}.' }
  }
  if (list.length > 5000) {
    return { ok: false, reason: `Refusing ${list.length} endpoints — cap is 5000 per paste.` }
  }
  return { ok: true, endpoints: list as RawEndpoint[] }
}

function normalizeMethod(m: unknown): string | null {
  if (typeof m !== 'string') return null
  const up = m.trim().toUpperCase()
  return (METHODS as readonly string[]).includes(up) ? up : null
}

function normalizeEndpoint(raw: RawEndpoint): Endpoint | null {
  const method = normalizeMethod(raw.method)
  if (!method) return null
  if (typeof raw.path !== 'string' || !raw.path.startsWith('/')) return null
  const path = raw.path.trim()
  if (path.length === 0 || path.length > 512) return null
  // Declared iff a static pass named it: explicit flag wins, otherwise any
  // provenance entry that is not a live-traffic marker.
  let declared = raw.declared === true
  if (raw.declared === undefined && Array.isArray(raw.provenance)) {
    declared = raw.provenance.some(
      (p) => typeof p === 'string' && !/live|traffic|capture|hit/i.test(p),
    )
  }
  const hits =
    typeof raw.liveHits === 'number' && Number.isFinite(raw.liveHits) && raw.liveHits > 0
      ? Math.floor(raw.liveHits)
      : 0
  return { method, path, declared, hits }
}

/** Split endpoints into the three buckets (+ dropped noise). Pure. */
export function reconcile(raw: RawEndpoint[]): Buckets {
  const out: Buckets = { corroborated: [], undeclared: [], unused: [], dropped: 0 }
  for (const r of raw) {
    const e = normalizeEndpoint(r)
    if (!e) {
      out.dropped += 1
      continue
    }
    if (e.declared && e.hits > 0) out.corroborated.push(e)
    else if (!e.declared && e.hits > 0) out.undeclared.push(e)
    else if (e.declared) out.unused.push(e)
    else out.dropped += 1
  }
  const byPath = (a: Endpoint, b: Endpoint) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : a.method < b.method ? -1 : 1
  out.corroborated.sort(byPath)
  out.undeclared.sort(byPath)
  out.unused.sort(byPath)
  return out
}

/** Method → access heuristic. A starting suggestion, never a decision:
 *  the merchant confirms kind per capability before anything publishes. */
export function suggestKind(method: string): 'read' | 'write' {
  return method === 'GET' || method === 'HEAD' ? 'read' : 'write'
}

/** `POST /orders/:id/items` → `postOrdersIdItems`. Stable, readable,
 *  renameable — the merchant renames in the capabilities editor. */
export function slugFor(method: string, path: string): string {
  const parts = path
    .split('/')
    .filter(Boolean)
    .map((seg) =>
      seg
        .replace(/^:/, '')
        .replace(/[^A-Za-z0-9]+/g, ' ')
        .trim()
        .split(' ')
        .map((w, i) =>
          i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
        )
        .join(''),
    )
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('')
  const base = `${method.toLowerCase()}${parts || 'Root'}`
  return base.charAt(0).toLowerCase() + base.slice(1)
}

export type CapabilityProposal = {
  key: string
  name: string
  method: string
  path: string
  kind: 'read' | 'write'
  bucket: 'corroborated' | 'undeclared' | 'unused'
}

/** One proposal per endpoint, keyed stably for checkbox state. */
export function propose(b: Buckets): CapabilityProposal[] {
  const out: CapabilityProposal[] = []
  const push = (e: Endpoint, bucket: CapabilityProposal['bucket']) =>
    out.push({
      key: `${e.method} ${e.path}`,
      name: slugFor(e.method, e.path),
      method: e.method,
      path: e.path,
      kind: suggestKind(e.method),
      bucket,
    })
  b.corroborated.forEach((e) => push(e, 'corroborated'))
  b.undeclared.forEach((e) => push(e, 'undeclared'))
  b.unused.forEach((e) => push(e, 'unused'))
  return out
}

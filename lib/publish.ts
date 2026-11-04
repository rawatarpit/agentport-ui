import { createHash, verify as verifySignature } from 'node:crypto'

/**
 * Publish ceremony helpers: one tier rule, one digest rule, shared by the
 * approve/upload/versions routes so the ceremony cannot drift between them.
 *
 * Tier by risk DIRECTION against the last published artifact, not by content
 * alone: narrowing (fewer caps, lower ceilings, more forbiddens, more
 * approvals) is light ceremony; anything that widens what agents may do is
 * typed. No baseline (first publish) is always typed — an unreviewed start
 * is the riskiest change of all. Unknown shapes fail toward ceremony, never
 * away from it.
 */

export type RiskTier = 'light' | 'typed'

type Caps = Array<{ name: string }>
type Policy = Record<string, unknown>

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const money = (p: Policy, key: string): number | null => {
  const v = p[key]
  if (typeof v !== 'object' || v === null) return null
  return num((v as Record<string, unknown>).minor)
}
const units = (p: Policy): number | null => {
  const v = p.bulkOrderThreshold
  if (typeof v !== 'object' || v === null) return null
  return num((v as Record<string, unknown>).units)
}
const strList = (p: Policy, key: string): string[] => {
  const v = p[key]
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

/**
 * kindOf resolves write-ness per capability name. Unknown names fail toward
 * typed: a capability whose kind nobody can state is not a light change.
 */
export function tierForChange(
  prev: { policy: Policy; capabilities: Caps } | null,
  next: { policy: Policy; capabilities: Caps },
  kindOf: (name: string) => 'read' | 'write' | 'unknown',
): RiskTier {
  if (!prev) return 'typed'
  const prevNames = new Set(prev.capabilities.map((c) => c.name))
  const nextNames = new Set(next.capabilities.map((c) => c.name))
  // Added capabilities: any write (or unknown) addition widens.
  for (const c of next.capabilities) {
    if (!prevNames.has(c.name) && kindOf(c.name) !== 'read') return 'typed'
  }
  // Removed capabilities narrow — always light (removal cannot widen).
  // Ceilings: any increase widens.
  for (const [get, key] of [
    [(p: Policy) => money(p, 'maxOrderValue'), 'maxOrderValue'],
    [(p: Policy) => money(p, 'absoluteMaxOrderValue'), 'absoluteMaxOrderValue'],
    [(p: Policy) => units(p), 'bulkOrderThreshold'],
  ] as const) {
    const a = get(prev.policy)
    const b = get(next.policy)
    void key
    if (a !== null && b !== null && b > a) return 'typed'
    if ((a === null) !== (b === null)) return 'typed'
  }
  // Approvals/forbiddens/restrictions: removals widen.
  for (const key of ['alwaysRequireApproval', 'forbiddenCapabilities', 'restrictedDataClasses']) {
    const a = new Set(strList(prev.policy, key))
    const b = new Set(strList(next.policy, key))
    for (const x of a) if (!b.has(x)) return 'typed'
  }
  // Rate limits: any change widens-or-unknowns (window and count interact).
  if (JSON.stringify(prev.policy.rateLimit ?? null) !== JSON.stringify(next.policy.rateLimit ?? null)) return 'typed'
  // Ceiling exemptions: granting an exemption widens (that capability skips
  // the ceilings), whatever else narrowed.
  {
    const a = new Set(strList(prev.policy, 'ceilingExempt'))
    const b = new Set(strList(next.policy, 'ceilingExempt'))
    for (const x of b) if (!a.has(x)) return 'typed'
  }
  // Unknown policy keys on either side: fail toward ceremony.
  const keys = new Set([...Object.keys(prev.policy), ...Object.keys(next.policy)])
  const known = new Set([
    'maxOrderValue',
    'absoluteMaxOrderValue',
    'bulkOrderThreshold',
    'alwaysRequireApproval',
    'forbiddenCapabilities',
    'restrictedDataClasses',
    'rateLimit',
    'ceilingExempt',
    'emergencyKillSwitch',
  ])
  for (const k of keys) if (!known.has(k)) return 'typed'
  void nextNames
  return 'light'
}

/**
 * The hosted worker routes a tenant only under `/t/<tenantId>` and refuses to
 * boot a signed artifact that advertises any other public origin. That check
 * happens after the bytes are stored, so a missing or wrong value turns a
 * successful activation into a tenant that can never serve. Reject it before
 * the artifact is written; the merchant can fix the config and re-sign without
 * an operator touching the database.
 */
export function publicBaseUrlProblem(value: unknown, tenantId: string): string | null {
  if (typeof value !== 'string' || value.trim() === '') {
    return `Envelope publicBaseUrl is required: set it to the hosted governor URL ending in /t/${tenantId}, then re-sign.`
  }
  let parsed: URL
  try {
    parsed = new URL(value.trim())
  } catch {
    return 'Envelope publicBaseUrl is not an absolute URL.'
  }
  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
    return 'Envelope publicBaseUrl must use https.'
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    return 'Envelope publicBaseUrl must not carry credentials, a query or a fragment.'
  }
  const expected = `/t/${encodeURIComponent(tenantId)}`
  if (parsed.pathname.replace(/\/+$/, '') !== expected) {
    return `Envelope publicBaseUrl must be the tenant URL ending in ${expected}; got ${parsed.pathname || '/'}. Re-sign the config with the right publicBaseUrl.`
  }
  return null
}

/**
 * Canonical bytes for a merchant-signed artifact.
 *
 * This is a deliberate copy of `stableStringify` from the SDK
 * (`agentport-sdk/src/agent.ts`). The SDK remains the author of the format;
 * this file must not grow a second one. The copy exists because the console
 * cannot import the SDK at runtime, and the alternative — verifying with a
 * different stringifier — is the exact drift the SDK comment warns about:
 * a config that verifies in one place and differs in another.
 *
 * Bump rules: if the SDK changes this function, this copy changes in the same
 * commit and the cross-package vector test in `lib/publish.test.ts` identifies
 * which one moved.
 */
export function stableStringify(value: unknown, depth = 0): string {
  if (depth > 8) return '"[truncated]"'
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v, depth + 1)).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v, depth + 1)}`)
  return `{${entries.join(',')}}`
}

export type SignedArtifact = {
  tenantId: string
  version: number
  policy: Record<string, unknown>
  capabilities: Array<{ name: string; hiddenFields?: string[]; [key: string]: unknown }>
  baseUrl?: string
  publicBaseUrl?: string
}

export function canonicalArtifactBytes(artifact: SignedArtifact): string {
  const fields: Record<string, unknown> = {
    tenantId: artifact.tenantId,
    version: artifact.version,
    policy: artifact.policy,
    capabilities: artifact.capabilities,
  }
  // Absent keys stay absent so v1 artifacts keep their original bytes.
  if (artifact.baseUrl !== undefined) fields.baseUrl = artifact.baseUrl
  if (artifact.publicBaseUrl !== undefined) fields.publicBaseUrl = artifact.publicBaseUrl
  return stableStringify(fields)
}

export type ArtifactVerifyResult = { ok: true; artifact: SignedArtifact } | { ok: false; reason: string }

/**
 * Verify the merchant's Ed25519 signature before the console stores anything.
 *
 * The runtime will verify again locally against the pinned key — that is the
 * control. This check exists so the dashboard never records an envelope the
 * worker will refuse, and so a wrong tenant/key/digest is named at upload
 * time instead of becoming a tenant that silently never serves.
 *
 * `publicKey` comes from the envelope on first publish and is pinned by the
 * activation row. This function proves the signature matches *that* key; the
 * route additionally proves that key matches the tenant's existing pin.
 */
export function verifySignedArtifact(
  envelope: { artifact: unknown; signature: unknown; publicKey: unknown },
  opts: { expectedTenantId?: string } = {},
): ArtifactVerifyResult {
  const a = envelope.artifact as Record<string, unknown> | null
  if (typeof a !== 'object' || a === null || Array.isArray(a)) {
    return { ok: false, reason: 'artifact must be an object' }
  }
  if (typeof a.tenantId !== 'string' || a.tenantId.length === 0) {
    return { ok: false, reason: 'artifact must name its tenant' }
  }
  if (!Number.isInteger(a.version) || (a.version as number) <= 0) {
    return { ok: false, reason: 'artifact version must be a positive integer' }
  }
  if (typeof a.policy !== 'object' || a.policy === null || Array.isArray(a.policy)) {
    return { ok: false, reason: 'artifact must carry a policy object' }
  }
  if (!Array.isArray(a.capabilities)) {
    return { ok: false, reason: 'artifact must carry a capabilities list' }
  }
  for (const key of ['baseUrl', 'publicBaseUrl'] as const) {
    const value = a[key]
    if (value !== undefined && (typeof value !== 'string' || value.trim() === '')) {
      return { ok: false, reason: `artifact ${key} must be a non-empty string when present` }
    }
  }
  if (Object.hasOwn(a.policy as object, 'emergencyKillSwitch')) {
    return { ok: false, reason: 'artifact carries the kill switch — refused' }
  }
  if (opts.expectedTenantId !== undefined && a.tenantId !== opts.expectedTenantId) {
    return { ok: false, reason: 'artifact is for another tenant' }
  }
  if (typeof envelope.signature !== 'string' || envelope.signature.length === 0) {
    return { ok: false, reason: 'artifact carries no signature' }
  }
  if (typeof envelope.publicKey !== 'string' || envelope.publicKey.trim() === '') {
    return { ok: false, reason: 'artifact carries no public key' }
  }

  const artifact: SignedArtifact = {
    tenantId: a.tenantId as string,
    version: a.version as number,
    policy: a.policy as Record<string, unknown>,
    capabilities: a.capabilities as SignedArtifact['capabilities'],
  }
  if (a.baseUrl !== undefined) artifact.baseUrl = a.baseUrl as string
  if (a.publicBaseUrl !== undefined) artifact.publicBaseUrl = a.publicBaseUrl as string

  let valid = false
  try {
    valid = verifySignature(
      null,
      Buffer.from(canonicalArtifactBytes(artifact), 'utf8'),
      envelope.publicKey.trim(),
      Buffer.from(envelope.signature, 'base64'),
    )
  } catch {
    return { ok: false, reason: 'signature does not verify against the envelope key' }
  }
  return valid
    ? { ok: true, artifact }
    : { ok: false, reason: 'signature does not verify against the envelope key' }
}

/** Stable digest binding an approval to exact bytes. Key order lied once. */
export function contentDigest(obj: unknown): string {
  const stable = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(stable)
    if (typeof v === 'object' && v !== null) {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, x]) => [k, stable(x)]))
    }
    return v
  }
  return createHash('sha256').update(JSON.stringify(stable(obj))).digest('hex')
}

import { createHash } from 'node:crypto'

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

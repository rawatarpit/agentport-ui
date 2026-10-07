import { createHmac } from 'node:crypto'
import type { Policy } from '@agentport/sdk'
import { getDraft, getLive, resolveTenant, type LiveCapability } from '@/lib/store'

/**
 * Drafts in, signed live config out.
 *
 * The compiler reads the three draft sections and produces the policy the SDK
 * would enforce plus the plain-language summary the merchant confirms. It
 * never evaluates anything — compiling the *configuration language* is the
 * permitted verb; answering "is this allowed?" here would be the bypass.
 */

export const KNOWN_CAPABILITIES = [
  { name: 'searchProducts', kind: 'read', fields: ['q', 'maxPriceMinor'] },
  { name: 'checkInventory', kind: 'read', fields: ['sku'] },
  { name: 'createOrder', kind: 'write', fields: ['items', 'amountMinor'] },
  { name: 'requestRefund', kind: 'write', fields: ['orderId'] },
] as const

export type RulesDraft = {
  askAboveMinor: number
  neverAboveMinor: number
  bulkUnits: number
  alwaysAskOrders: boolean
  forbidRefunds: boolean
}

export type CapabilitiesDraft = { hidden: Record<string, string[]> }

export type SetupDraft = {
  ceilingMinor: number
  hardCeilingMinor: number
  alwaysAsk: boolean
  forbidRefunds: boolean
}

const isNonNegInt = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0

export function validateRules(p: unknown): { ok: true; value: RulesDraft } | { ok: false; errors: string[] } {
  const errors: string[] = []
  const v = (p ?? {}) as Record<string, unknown>
  if (!isNonNegInt(v.askAboveMinor)) errors.push('askAboveMinor must be a whole number of paise, zero or more.')
  if (!isNonNegInt(v.neverAboveMinor)) errors.push('neverAboveMinor must be a whole number of paise, zero or more.')
  if (!Number.isInteger(v.bulkUnits) || (v.bulkUnits as number) <= 0)
    errors.push('bulkUnits must be a whole number of items greater than zero.')
  if (typeof v.alwaysAskOrders !== 'boolean') errors.push('alwaysAskOrders must be true or false.')
  if (typeof v.forbidRefunds !== 'boolean') errors.push('forbidRefunds must be true or false.')
  if (
    isNonNegInt(v.askAboveMinor) &&
    isNonNegInt(v.neverAboveMinor) &&
    (v.neverAboveMinor as number) <= (v.askAboveMinor as number)
  ) {
    errors.push('neverAboveMinor sits at or below askAboveMinor, so you would never be asked — refused first.')
  }
  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    value: {
      askAboveMinor: v.askAboveMinor as number,
      neverAboveMinor: v.neverAboveMinor as number,
      bulkUnits: v.bulkUnits as number,
      alwaysAskOrders: v.alwaysAskOrders as boolean,
      forbidRefunds: v.forbidRefunds as boolean,
    },
  }
}

export function validateCapabilities(p: unknown): { ok: true; value: CapabilitiesDraft } | { ok: false; errors: string[] } {
  const errors: string[] = []
  const v = (p ?? {}) as Record<string, unknown>
  if (typeof v.hidden !== 'object' || v.hidden === null || Array.isArray(v.hidden)) {
    return { ok: false, errors: ['hidden must be an object of capability name to field list.'] }
  }
  const hidden = v.hidden as Record<string, unknown>
  for (const [cap, fields] of Object.entries(hidden)) {
    const known = KNOWN_CAPABILITIES.find((c) => c.name === cap)
    if (!known) {
      errors.push(`Unknown capability "${cap}".`)
      continue
    }
    if (!Array.isArray(fields) || !fields.every((f) => typeof f === 'string')) {
      errors.push(`Hidden fields for "${cap}" must be a list of field names.`)
      continue
    }
    for (const f of fields as string[]) {
      if (!(known.fields as readonly string[]).includes(f)) errors.push(`"${cap}" has no field "${f}".`)
    }
  }
  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, value: { hidden: hidden as Record<string, string[]> } }
}

export function validateSetup(p: unknown): { ok: true; value: SetupDraft } | { ok: false; errors: string[] } {
  const errors: string[] = []
  const v = (p ?? {}) as Record<string, unknown>
  if (!isNonNegInt(v.ceilingMinor)) errors.push('ceilingMinor must be a whole number of paise, zero or more.')
  if (!isNonNegInt(v.hardCeilingMinor)) errors.push('hardCeilingMinor must be a whole number of paise, zero or more.')
  if (typeof v.alwaysAsk !== 'boolean') errors.push('alwaysAsk must be true or false.')
  if (typeof v.forbidRefunds !== 'boolean') errors.push('forbidRefunds must be true or false.')
  if (isNonNegInt(v.ceilingMinor) && isNonNegInt(v.hardCeilingMinor) && (v.hardCeilingMinor as number) <= (v.ceilingMinor as number)) {
    errors.push('hardCeilingMinor sits at or below ceilingMinor, so you would never be asked — refused first.')
  }
  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    value: {
      ceilingMinor: v.ceilingMinor as number,
      hardCeilingMinor: v.hardCeilingMinor as number,
      alwaysAsk: v.alwaysAsk as boolean,
      forbidRefunds: v.forbidRefunds as boolean,
    },
  }
}

const inr = (minor: number) => `₹${(minor / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

export type Compiled = {
  policy: Policy
  capabilities: LiveCapability[]
  summary: string[]
}

/** Rules draft wins; setup answers fill gaps when no rules draft exists. */
export function compileLive(tenantId: string): { ok: true; compiled: Compiled } | { ok: false; reason: string } {
  const rulesRaw = getDraft(tenantId, 'rules')?.payload
  const setupRaw = getDraft(tenantId, 'setup')?.payload
  const capsRaw = getDraft(tenantId, 'capabilities')?.payload

  let ask = 25_000
  let never = 100_000
  let bulk = 20
  let alwaysAsk = true
  let forbidRefunds = true

  if (rulesRaw) {
    const r = validateRules(rulesRaw)
    if (!r.ok) return { ok: false, reason: `Rules draft is invalid: ${r.errors[0]}` }
    ask = r.value.askAboveMinor
    never = r.value.neverAboveMinor
    bulk = r.value.bulkUnits
    alwaysAsk = r.value.alwaysAskOrders
    forbidRefunds = r.value.forbidRefunds
  } else if (setupRaw) {
    const s = validateSetup(setupRaw)
    if (!s.ok) return { ok: false, reason: `Setup answers are invalid: ${s.errors[0]}` }
    ask = s.value.ceilingMinor
    never = s.value.hardCeilingMinor
    alwaysAsk = s.value.alwaysAsk
    forbidRefunds = s.value.forbidRefunds
  } else {
    return { ok: false, reason: 'Nothing to publish yet — answer the setup questions or save a rules draft first.' }
  }

  let hidden: Record<string, string[]> = { createOrder: ['amountMinor'] }
  if (capsRaw) {
    const c = validateCapabilities(capsRaw)
    if (!c.ok) return { ok: false, reason: `Capabilities draft is invalid: ${c.errors[0]}` }
    hidden = { ...hidden, ...c.value.hidden }
  }

  const policy: Policy = {
    maxOrderValue: { minor: ask, currency: 'INR' },
    absoluteMaxOrderValue: { minor: never, currency: 'INR' },
    bulkOrderThreshold: { units: bulk },
    alwaysRequireApproval: alwaysAsk ? ['createOrder'] : [],
    forbiddenCapabilities: forbidRefunds ? ['requestRefund'] : [],
    ceilingExempt: ['searchProducts', 'checkInventory'],
    restrictedDataClasses: ['pii'],
  }
  const capabilities: LiveCapability[] = KNOWN_CAPABILITIES.map((c) => ({
    name: c.name,
    hiddenFields: hidden[c.name] ?? [],
  }))

  const summary = [
    `Orders above ${inr(ask)} wait for your approval — nothing moves until you say so.`,
    `Orders above ${inr(never)} are always refused, never held.`,
    `Baskets of more than ${bulk} items always wait for you, whatever the value.`,
    alwaysAsk ? 'Every order waits for you, even a small one.' : 'Small orders below the ask line run on their own.',
    forbidRefunds ? 'No agent may ever issue a refund — refused with a reason.' : 'Refunds follow the same ask/never lines as orders.',
    capabilities
      .filter((c) => c.hiddenFields.length > 0)
      .map((c) => `${c.name}: hidden from agents — ${c.hiddenFields.join(', ')}.`)
      .join(' ') || 'Every field is visible to agents.',
  ]
  return { ok: true, compiled: { policy, capabilities, summary } }
}

/**
 * The install file committed by the GitHub PR: the compiled drafts as a
 * reviewable `agentport.config.ts`, one file, one screen. What the merchant
 * merges is exactly what the summary described — the PR body carries the
 * same lines, so review happens once, in their repo, against branch
 * protection they built for another purpose.
 */
export function buildInstallFile(tenantId: string): { ok: true; path: string; content: string } | { ok: false; reason: string } {
  const compiled = compileLive(tenantId)
  if (!compiled.ok) return compiled
  const { policy, capabilities, summary } = compiled.compiled
  const lines = [
    '// Governed agent access — generated from your answers, reviewable here.',
    '// What you merge is what enforces: nothing here executes until this file',
    '// is on your default branch and your runtime loads it.',
    '//',
    ...summary.map((s) => `// - ${s}`),
    'export default {',
    `  policy: ${JSON.stringify(policy, null, 2).replace(/\n/g, '\n  ')},`,
    `  capabilities: ${JSON.stringify(capabilities.map((c) => c.name))},`,
    `  hiddenFields: ${JSON.stringify(Object.fromEntries(capabilities.filter((c) => c.hiddenFields.length > 0).map((c) => [c.name, c.hiddenFields])))}`,
    '} as const',
  ]
  return { ok: true, path: 'agentport.config.ts', content: `${lines.join('\n')}\n` }
}

/** Canonical bytes: sorted keys, no whitespace surprises. The digest signs these. */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`
  const keys = Object.keys(v as Record<string, unknown>).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`
}

/** HMAC-SHA256 over the canonical config. Secret is server-only, never leaves. */
export function digestFor(policy: unknown, capabilities: unknown): string {
  const secret = process.env.AGENTPORT_SIGNING_SECRET
  if (!secret) {
    throw new Error('AGENTPORT_SIGNING_SECRET is not set. Publishing signs the config — no signature, no publish.')
  }
  return createHmac('sha256', secret).update(canonical({ policy, capabilities })).digest('hex').slice(0, 32)
}

export function goliveStatus(tenantId: string = resolveTenant()) {
  const live = getLive(tenantId)
  const compiled = compileLive(tenantId)
  return {
    live: live
      ? { version: live.version, digest: live.digest, confirmedAt: live.confirmedAt }
      : null,
    draft: compiled.ok ? compiled.compiled : null,
    draftError: compiled.ok ? null : compiled.reason,
  }
}

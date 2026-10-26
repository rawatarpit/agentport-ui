import { createHmac } from 'node:crypto'
import type { Policy } from '@/lib/contracts'
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
  {
    name: 'searchProducts',
    kind: 'read',
    fields: ['q', 'maxPriceMinor'],
    description: 'Search the product catalogue.',
    dataClass: 'public',
  },
  {
    name: 'checkInventory',
    kind: 'read',
    fields: ['sku'],
    description: 'Check stock for a SKU.',
    dataClass: 'internal',
  },
  {
    name: 'createOrder',
    kind: 'write',
    fields: ['items', 'amountMinor'],
    description: 'Create an order for the represented user.',
    dataClass: 'payment',
  },
  {
    name: 'requestRefund',
    kind: 'write',
    fields: ['orderId'],
    description: 'Request a refund for an existing order.',
    dataClass: 'payment',
  },
] as const

export type RulesDraft = {
  askAboveMinor: number
  neverAboveMinor: number
  bulkUnits: number
  alwaysAskOrders: boolean
  forbidRefunds: boolean
}

export type CapabilitiesDraft = {
  hidden: Record<string, string[]>
  /**
   * Mapped extras from the Map page (lib/map.ts): capabilities discovered in
   * the merchant's own routes that are not in KNOWN_CAPABILITIES. Validated
   * below, compiled into LiveCapability beside the known ones. Additive —
   * absence changes nothing.
   */
  extra?: Array<{ name: string; method: string; path: string; kind: 'read' | 'write' }>
}

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
  // Extras are validated first so `hidden` can name them below: a hidden
  // entry for a mapped capability is legitimate, checked for shape only
  // (no known-fields table exists for a discovered route).
  const extraNames = new Set<string>()
  const extra: Array<{ name: string; method: string; path: string; kind: 'read' | 'write' }> = []
  const extraRaw = v.extra
  if (extraRaw !== undefined) {
    if (!Array.isArray(extraRaw)) {
      errors.push('extra must be a list of mapped capabilities.')
    } else {
      for (const item of extraRaw) {
        const r = (item ?? {}) as Record<string, unknown>
        if (
          typeof r.name !== 'string' ||
          !/^[A-Za-z][A-Za-z0-9_]{2,63}$/.test(r.name) ||
          typeof r.method !== 'string' ||
          !['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method) ||
          typeof r.path !== 'string' ||
          !r.path.startsWith('/') ||
          (r.kind !== 'read' && r.kind !== 'write')
        ) {
          errors.push('Each extra needs {name, method, path, kind: read|write} in valid shapes.')
          continue
        }
        if (KNOWN_CAPABILITIES.some((c) => c.name === r.name) || extraNames.has(r.name)) {
          errors.push(`Extra capability "${r.name}" collides — rename it or drop it.`)
          continue
        }
        extraNames.add(r.name)
        extra.push({ name: r.name, method: r.method, path: r.path, kind: r.kind })
      }
    }
  }
  const hidden = v.hidden as Record<string, unknown>
  for (const [cap, fields] of Object.entries(hidden)) {
    const known = KNOWN_CAPABILITIES.find((c) => c.name === cap)
    if (!known && !extraNames.has(cap)) {
      errors.push(`Unknown capability "${cap}".`)
      continue
    }
    if (!Array.isArray(fields) || !fields.every((f) => typeof f === 'string')) {
      errors.push(`Hidden fields for "${cap}" must be a list of field names.`)
      continue
    }
    if (known) {
      for (const f of fields as string[]) {
        if (!(known.fields as readonly string[]).includes(f)) errors.push(`"${cap}" has no field "${f}".`)
      }
    }
  }
  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, value: { hidden: hidden as Record<string, string[]>, extra } }
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
  return compileLiveFrom({
    rules: getDraft(tenantId, 'rules')?.payload,
    setup: getDraft(tenantId, 'setup')?.payload,
    capabilities: getDraft(tenantId, 'capabilities')?.payload,
  })
}

/**
 * Pure compile from explicit draft payloads — the durable path. RAM
 * (compileLive) and Supabase (dashboard_drafts rows) share this body, so a
 * draft means the same file whichever process answers.
 */
export function compileLiveFrom(drafts: {
  rules?: unknown
  setup?: unknown
  capabilities?: unknown
}): { ok: true; compiled: Compiled } | { ok: false; reason: string } {
  const rulesRaw = drafts.rules
  const setupRaw = drafts.setup
  const capsRaw = drafts.capabilities

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
  let extra: Array<{ name: string; method: string; path: string; kind: 'read' | 'write' }> = []
  if (capsRaw) {
    const c = validateCapabilities(capsRaw)
    if (!c.ok) return { ok: false, reason: `Capabilities draft is invalid: ${c.errors[0]}` }
    hidden = { ...hidden, ...c.value.hidden }
    extra = c.value.extra ?? []
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
  // Mapped extras join the known set here and nowhere else: one append
  // point, so a capability the Map page discovered cannot silently vanish
  // between draft and publish. Validation above guarantees names are unique
  // and non-colliding, so this concat cannot shadow or duplicate.
  const capabilities: LiveCapability[] = [
    ...KNOWN_CAPABILITIES.map((c) => ({
      name: c.name,
      hiddenFields: hidden[c.name] ?? [],
    })),
    ...extra.map((e) => ({
      name: e.name,
      hiddenFields: hidden[e.name] ?? [],
    })),
  ]

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

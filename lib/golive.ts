import type { DataClass, Policy } from '@/lib/contracts'

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
  extra?: Array<{
    name: string
    method: string
    path: string
    kind: 'read' | 'write'
    /**
     * A write may run without a human only when the merchant explicitly
     * opts in for that route. Absent means held; a read is unaffected.
     */
    allowUnattended?: boolean
    /**
     * What this route touches. Absent means `internal`: a merchant must promote
     * a route to public deliberately, because public reads can be auto-issued.
     */
    dataClass?: DataClass
    /**
     * Auto-issue is only legal for a public read. It skips the human grant, so
     * validation refuses every other combination rather than trusting the UI.
     */
    autoIssue?: boolean
  }>
}

export type ValidatedCapability = {
  name: string
  method: string
  path: string
  kind: 'read' | 'write'
  allowUnattended?: boolean
  dataClass: DataClass
  autoIssue: boolean
}

export type ValidatedCapabilities = {
  hidden: Record<string, string[]>
  extra: ValidatedCapability[]
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

export function validateCapabilities(p: unknown): { ok: true; value: ValidatedCapabilities } | { ok: false; errors: string[] } {
  const errors: string[] = []
  const v = (p ?? {}) as Record<string, unknown>
  if (typeof v.hidden !== 'object' || v.hidden === null || Array.isArray(v.hidden)) {
    return { ok: false, errors: ['hidden must be an object of capability name to field list.'] }
  }
  // Extras are validated first so `hidden` can name them below: a hidden
  // entry for a mapped capability is legitimate, checked for shape only
  // (no known-fields table exists for a discovered route).
  const extraNames = new Set<string>()
  const extra: ValidatedCapability[] = []
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
          r.path.length > 512
        ) {
          errors.push('Each extra needs {name, method, path, kind: read|write} in valid shapes.')
          continue
        }
        if (KNOWN_CAPABILITIES.some((c) => c.name === r.name) || extraNames.has(r.name)) {
          errors.push(`Extra capability "${r.name}" collides — rename it or drop it.`)
          continue
        }
        if (r.allowUnattended !== undefined && typeof r.allowUnattended !== 'boolean') {
          errors.push(`"${r.name}" needs allowUnattended to be true or false.`)
          continue
        }
        const dataClass = r.dataClass === undefined ? 'internal' : r.dataClass
        if (!['public', 'internal', 'pii', 'payment'].includes(String(dataClass))) {
          errors.push(`"${r.name}" needs dataClass public, internal, pii or payment.`)
          continue
        }
        if (r.autoIssue !== undefined && typeof r.autoIssue !== 'boolean') {
          errors.push(`"${r.name}" needs autoIssue to be true or false.`)
          continue
        }
        // The method is the authority. A caller-supplied `kind` cannot
        // downgrade DELETE/POST/PUT/PATCH to a read that runs unattended;
        // GET and HEAD are the only methods that can be read-only.
        const kind = r.method === 'GET' || r.method === 'HEAD' ? 'read' : 'write'
        const autoIssue = r.autoIssue === true
        // Auto-issue skips the human grant. It is only defensible for data the
        // business has already published. The governor enforces this too; this
        // check keeps an invalid draft from ever reaching it.
        if (autoIssue && kind !== 'read') {
          errors.push(`"${r.name}" cannot auto-issue a write.`)
          continue
        }
        if (autoIssue && dataClass !== 'public') {
          errors.push(`"${r.name}" cannot auto-issue ${String(dataClass)} data; only public reads may auto-issue.`)
          continue
        }
        extraNames.add(r.name)
        extra.push({
          name: r.name,
          method: r.method,
          path: r.path,
          kind,
          // Reads are already unattended. A write is held unless the merchant
          // made the opt-in explicit for this exact route.
          allowUnattended: kind === 'write' && r.allowUnattended === true,
          dataClass: dataClass as DataClass,
          autoIssue,
        })
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

export type LiveCapability = { name: string; hiddenFields: string[] }

export type Compiled = {
  policy: Policy
  capabilities: LiveCapability[]
  summary: string[]
}

/**
 * Pure compile from explicit draft payloads. The caller supplies the three
 * draft sections; this function never reads a store. That is what keeps the
 * publish path testable and keeps RAM-backed helpers out of runtime routes.
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
  let extra: ValidatedCapability[] = []
  if (capsRaw) {
    const c = validateCapabilities(capsRaw)
    if (!c.ok) return { ok: false, reason: `Capabilities draft is invalid: ${c.errors[0]}` }
    hidden = { ...hidden, ...c.value.hidden }
    extra = c.value.extra ?? []
  }

  // A mapped write has no entry in the known-capability rules, so a policy
  // that only named `createOrder` would let a discovered `POST /ship` run
  // unattended. Every mapped write is held until a human approves it; the
  // merchant can narrow that later, but never by omission.
  const mappedWrites = extra.filter((e) => e.kind === 'write' && !e.allowUnattended).map((e) => e.name)
  const unattendedWrites = extra.filter((e) => e.kind === 'write' && e.allowUnattended).map((e) => e.name)
  const alwaysRequireApproval = [
    ...new Set([...(alwaysAsk ? ['createOrder'] : []), ...mappedWrites]),
  ]
  const policy: Policy = {
    maxOrderValue: { minor: ask, currency: 'INR' },
    absoluteMaxOrderValue: { minor: never, currency: 'INR' },
    bulkOrderThreshold: { units: bulk },
    alwaysRequireApproval,
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

  const writeSummary: string[] = []
  if (mappedWrites.length > 0) writeSummary.push(`Mapped writes wait for you: ${mappedWrites.join(', ')}.`)
  if (unattendedWrites.length > 0) {
    writeSummary.push(
      `Mapped writes you allowed to run unattended: ${unattendedWrites.join(', ')}. Amount and bulk rules still apply.`,
    )
  }
  if (writeSummary.length === 0) writeSummary.push('No mapped write routes — every mapped capability is read-only.')
  const summary = [
    `Orders above ${inr(ask)} wait for your approval — nothing moves until you say so.`,
    `Orders above ${inr(never)} are always refused, never held.`,
    `Baskets of more than ${bulk} items always wait for you, whatever the value.`,
    alwaysAsk ? 'Every order waits for you, even a small one.' : 'Small orders below the ask line run on their own.',
    forbidRefunds ? 'No agent may ever issue a refund — refused with a reason.' : 'Refunds follow the same ask/never lines as orders.',
    ...writeSummary,
    capabilities
      .filter((c) => c.hiddenFields.length > 0)
      .map((c) => `${c.name}: hidden from agents — ${c.hiddenFields.join(', ')}.`)
      .join(' ') || 'Every field is visible to agents.',
  ]
  return { ok: true, compiled: { policy, capabilities, summary } }
}

import { AgentPort, redact, verifyToken, issueToken } from '@agentport/sdk'
import { InMemoryLedger } from '@agentport/sdk/testing'
import type { LedgerEntry, Policy } from '@agentport/sdk'

/**
 * The business's Agent Port instance.
 *
 * In production the capabilities below call the merchant's real catalogue,
 * inventory and order APIs. Here they return fixtures so the console has
 * something to show. The enforcement path is identical either way, which is the
 * point: the policy engine and the ledger do not know or care what a handler
 * talks to.
 *
 * `InMemoryLedger` is imported from `@agentport/sdk/testing` rather than the root
 * entry. It was moved off the root export deliberately, so a production
 * `InMemoryLedger` is greppable instead of accidental — see TASKS.md 2.1. This
 * app is a demonstration surface over the SDK; a real deployment passes a
 * `SqlLedger` bound to the merchant's own database.
 */

const CATALOGUE = [
  { sku: 'EX-100', name: 'Everyday Boot', priceMinor: 12_900, stock: 34 },
  { sku: 'EX-140', name: 'Chelsea Boot', priceMinor: 18_500, stock: 6 },
  { sku: 'EX-220', name: 'Waxed Lace', priceMinor: 2_400, stock: 210 },
]

/**
 * Amounts are in minor units and the field is *named* for it.
 *
 * `maxOrderValue.minor: 25_000` is ₹250.00. The field used to be called
 * `amount`, and `amount: 25_000, currency: 'INR'` reads as twenty-five thousand
 * rupees — while the value the engine compares against it arrives in a payload
 * field called `amountMinor` and is 250 paise. Both are round numbers and they are
 * 100x apart. Naming the unit in the identifier is the only fix that survives a
 * hurried config edit at midnight.
 */
/**
 * `Policy` types every field optional, because a merchant's policy is allowed to
 * omit any of them. *This* object sets all of them, so the console reads them
 * without an `?.` on every access — and the type still satisfies `Policy`, so the
 * SDK receives exactly the same object it would have before.
 */
export type ConsolePolicy = Policy &
  Required<Pick<Policy, 'maxOrderValue' | 'absoluteMaxOrderValue' | 'forbiddenCapabilities'>>

export const policy: ConsolePolicy = {
  // ₹250 — above this, a human is asked.
  maxOrderValue: { minor: 25_000, currency: 'INR' },
  // ₹1,000 — above this the request is refused outright, never queued.
  absoluteMaxOrderValue: { minor: 100_000, currency: 'INR' },
  rateLimit: { requestsPerMinute: 100, scope: 'agent' },
  forbiddenCapabilities: ['requestRefund'],
  restrictedDataClasses: ['pii'],
  bulkOrderThreshold: { units: 20 },
  alwaysRequireApproval: ['createOrder'],
  /**
   * The ceilings live on the policy, which every capability shares, so "a ceiling
   * is configured" is not a claim that *this* capability carries an order.
   * `searchProducts` and `checkInventory` are reads that move no money and must
   * not be refused for carrying no amount.
   */
  ceilingExempt: ['searchProducts', 'checkInventory'],
}

/** A hash of the config that produced a decision, so a row can be reconciled later. */
export const configHash = 'a1b2c3d4e5f6a1b2'

export const ledger = new InMemoryLedger()

/**
 * TASKS.md 12.5.2 — demo default only, never the merchant's address, and
 * never from the environment: there is no dashboard-origin variable anymore.
 *
 * The agent-facing baseUrl is a merchant setting (`websiteUrl`, set via
 * `PUT /api/me`) and the manifest route reads it per request, falling back
 * to the request's own origin with an honest note when unset. This constant
 * exists only because the constructor requires one; the manifest route
 * replaces it on every serve, and nothing else reads it.
 */
export const agent = new AgentPort({
  business: 'Example Shoes',
  baseUrl: 'http://localhost:3000',
  policy,
  ledger,
  configHash,
  // Stamped on every row. Required, and never taken from the request — this is
  // what keeps one tenant's ledger separate from another's (TASKS.md 5.7).
  tenantId: 'example-shoes',
  requestId: () => `req_${Math.random().toString(36).slice(2, 10)}`,
})

agent
  .expose({
    name: 'searchProducts',
    description: 'Search the catalogue by query, size or price band.',
    access: 'read',
    dataClass: 'public',
    input: {
      q: { type: 'string', maxLength: 200 },
      maxPriceMinor: { type: 'integer', min: 0 },
    },
    execute: (input: { q?: string; maxPriceMinor?: number }) => {
      const q = (input.q ?? '').toLowerCase()
      return CATALOGUE.filter(
        (p) =>
          (!q || p.name.toLowerCase().includes(q)) &&
          (input.maxPriceMinor === undefined || p.priceMinor <= input.maxPriceMinor),
      )
    },
  })
  .expose({
    name: 'checkInventory',
    description: 'Check stock for a SKU.',
    access: 'read',
    dataClass: 'internal',
    input: { sku: { type: 'string', required: true, maxLength: 64 } },
    execute: (input: { sku: string }) => {
      const item = CATALOGUE.find((p) => p.sku === input.sku)
      return item ? { sku: item.sku, available: item.stock > 0, stock: item.stock } : { available: false }
    },
  })
  .expose({
    name: 'createOrder',
    description: 'Create an order. Always held for human approval.',
    access: 'write',
    dataClass: 'payment',
    requiresApproval: true,
    input: {
      items: { type: 'array', maxItems: 200 },
      // Declared as the authoritative figure for this capability, so the ceiling is
      // measured against a number the merchant declared rather than one the caller
      // sent. Without this the agent chooses its own amount and chooses it small
      // — see TASKS.md 2.3.
      amountMinor: { type: 'integer', required: true, min: 0 },
    },
    /**
     * Every figure the policy measures, taken from the merchant's own catalogue
     * rather than from the payload.
     *
     * A per-request resolver, because a static `policyInput` is the same constant
     * on every request and a ceiling measured against a constant is not tracking
     * the transaction.
     *
     * `units` is here for a reason that only showed up when the gate was actually
     * run. `bulkOrderThreshold` measures units, and a figure the engine cannot
     * read does not *fail* that ceiling — it *skips* it and falls through to
     * allow, which was the worst class of bug this SDK shipped. So the engine now
     * denies with `units_unmeasurable`, and this capability refused **every**
     * legitimate order until `units` was declared here. Declaring `amountMinor`
     * alone was not enough: one unreadable figure on the policy denies the whole
     * request. The refusal was correct and the capability was wrong.
     */
    policyInputFor: (input: unknown) => {
      const items = Array.isArray((input as { items?: unknown[] })?.items)
        ? ((input as { items: unknown[] }).items ?? [])
        : []
      return {
        amountMinor: CATALOGUE.reduce((sum, p) => sum + p.priceMinor, 0),
        units: items.length,
      }
    },
    execute: (input: { items?: unknown[] }) => ({
      orderId: `ord_${Math.random().toString(36).slice(2, 8)}`,
      items: input.items?.length ?? 0,
      status: 'created',
    }),
  })
  .expose({
    name: 'requestRefund',
    description: 'Refund an order. Forbidden to external agents.',
    access: 'write',
    dataClass: 'payment',
    input: { orderId: { type: 'string', maxLength: 64 } },
    execute: () => ({ ok: true }),
  })

/**
 * Seeded history so the console is not empty on first load.
 *
 * A demonstration affordance, and the one thing in this file that would be wrong
 * in production: these rows were never decided by the engine. In a real
 * deployment they come from the durable ledger, and TASKS.md 2.1 is what replaces
 * this.
 */
const SEED: Array<Partial<LedgerEntry> & Pick<LedgerEntry, 'capability' | 'decision'>> = [
  { capability: 'searchProducts', decision: 'allow', agentId: 'gpt-shopping', rule: 'default' },
  { capability: 'checkInventory', decision: 'allow', agentId: 'gpt-shopping', rule: 'default' },
  { capability: 'createOrder', decision: 'require_approval', agentId: 'gpt-shopping', rule: 'max_order_value' },
  { capability: 'requestRefund', decision: 'deny', agentId: 'perplexity', rule: 'forbidden_capabilities' },
  { capability: 'checkInventory', decision: 'deny', agentId: 'claude-web', rule: 'rate_limit' },
  { capability: 'searchProducts', decision: 'allow', agentId: 'perplexity', rule: 'default' },
  { capability: 'createOrder', decision: 'allow', agentId: 'gpt-shopping', rule: 'human_approval' },
  { capability: 'searchProducts', decision: 'allow', agentId: 'gemini', rule: 'default' },
]

let seeded = false

export async function ensureSeeded(): Promise<void> {
  if (seeded) return
  seeded = true
  const base = Date.parse('2026-09-26T09:00:00.000Z')
  for (let i = 0; i < SEED.length; i += 1) {
    const s = SEED[i]!
    await ledger.append({
      requestId: `req_seed${i}`,
      at: new Date(base + i * 97_000).toISOString(),
      agentId: s.agentId ?? 'gpt-shopping',
      assurance: 'verified',
      capability: s.capability,
      access: s.capability.startsWith('create') || s.capability.startsWith('request') ? 'write' : 'read',
      parameters: redact({ q: 'boot' }),
      decision: s.decision,
      reason:
        s.decision === 'allow' ? 'allowed' : s.decision === 'deny' ? 'policy_denied' : 'approval_required',
      rule: s.rule ?? 'default',
      detail:
        s.decision === 'allow'
          ? 'Permitted by policy.'
          : s.rule === 'forbidden_capabilities'
            ? 'The business has forbidden external agents from calling requestRefund.'
            : 'Order is above the approval threshold.',
      approval:
        s.rule === 'human_approval'
          ? { required: true, granted: true, approvedBy: 'founder@example.com' }
          : s.decision === 'require_approval'
            ? { required: true }
            : undefined,
      result: s.decision === 'allow' ? 'ok' : undefined,
      durationMs: 18 + i * 7,
      configHash,
      tenantId: 'example-shoes',
    })
  }
}

/**
 * Credential verification.
 *
 * The SDK's `verifyToken` is the trust boundary and this function is a thin
 * wrapper over it. What it replaced deserves naming, because it looked correct:
 *
 *   const agentId = token || 'anonymous'
 *   return { agentId, scopes: ['*'], credentialId: `cred_${agentId}`, … }
 *
 * The bearer token *was* the agentId, every caller held every scope, and the
 * expiry was minted five minutes into the future on each request. `Authorization:
 * Bearer superadmin` resolved to `superadmin` holding everything, and it would
 * have passed the port's own expiry check. The comment above it correctly warned
 * never to trust an agentId from the request body — and the code trusted the
 * request header instead, which is the same field.
 *
 * `verifyToken` never throws: every failure returns `unverified` with no scopes
 * and an already-passed expiry, so a bad credential becomes a *recorded, specific
 * refusal* through the normal denial path rather than an unhandled 500 on a
 * public endpoint.
 */
export async function verifyIdentity(authorization: string | undefined) {
  const secret = process.env.AGENTPORT_SIGNING_SECRET ?? ''
  return verifyToken(authorization, secret)
}

/**
 * Mints a credential, so a developer can actually reach a 200 without a private
 * signing key of their own. Development only, and it refuses to run in
 * production — this is the SDK's own `agent-port token` command's job, and a
 * credential minted from a dashboard session cannot distinguish an employee from
 * an algorithm in the ledger, which is the failure this product exists to
 * prevent.
 */
export async function developmentToken(agentId = 'local-dev'): Promise<string> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('developmentToken() is disabled in production. Use `agent-port token`.')
  }
  const secret = process.env.AGENTPORT_SIGNING_SECRET
  if (!secret) {
    throw new Error('AGENTPORT_SIGNING_SECRET is not set. Run `agent-port secret` to mint one.')
  }
  const { token } = await issueToken(
    { agentId, scopes: ['agentport:invoke', 'catalog:read', 'orders:create'], ttlMs: 3_600_000 },
    secret,
  )
  return token
}
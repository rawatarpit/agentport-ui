import { AgentPort, InMemoryLedger, redact } from '@agentport/sdk'
import type { LedgerEntry } from '@agentport/sdk'

/**
 * The business's Agent Port instance.
 *
 * In production the capabilities below call the merchant's real catalogue,
 * inventory and order APIs. Here they return fixtures so the console has
 * something to show. The enforcement path is identical either way, which is the
 * point: the policy engine and the ledger do not know or care what a handler
 * talks to.
 */

const CATALOGUE = [
  { sku: 'EX-100', name: 'Everyday Boot', priceMinor: 12_900, stock: 34 },
  { sku: 'EX-140', name: 'Chelsea Boot', priceMinor: 18_500, stock: 6 },
  { sku: 'EX-220', name: 'Waxed Lace', priceMinor: 2_400, stock: 210 },
]

export const policy = {
  maxOrderValue: { amount: 25_000, currency: 'INR' },
  absoluteMaxOrderValue: { amount: 100_000, currency: 'INR' },
  rateLimit: { requestsPerMinute: 100, scope: 'agent' as const },
  forbiddenCapabilities: ['requestRefund'],
  restrictedDataClasses: ['pii' as const],
  bulkOrderThreshold: { units: 20 },
  alwaysRequireApproval: ['createOrder'],
}

export const ledger = new InMemoryLedger()

export const agent = new AgentPort({
  business: 'Example Shoes',
  baseUrl: process.env.NEXT_PUBLIC_AGENTPORT_BASE_URL ?? 'http://localhost:3000',
  policy,
  ledger,
  requestId: () => `req_${Math.random().toString(36).slice(2, 10)}`,
})

agent
  .expose({
    name: 'searchProducts',
    description: 'Search the catalogue by query, size or price band.',
    access: 'read',
    dataClass: 'public',
    input: { q: 'string', maxPriceMinor: 'integer' },
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
    input: { sku: 'string' },
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
    input: { items: 'array', amountMinor: 'integer' },
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
    execute: () => ({ ok: true }),
  })

/**
 * Seeded history so the console is not empty on first load. In production this
 * comes from the durable ledger instead.
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
    })
  }
}

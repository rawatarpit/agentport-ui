import type { Policy } from '@/lib/contracts'

/**
 * The console's display policy.
 *
 * This repository displays and authors; it never evaluates. These constants
 * are the well-formed policy the authoring screens (limits, publishing,
 * rules) render and compile when the merchant has not saved a draft yet.
 * Configuration data, not an engine — nothing here answers "is this
 * allowed?", deliberately. The runtime SDK is not a dependency of this
 * repository.
 */

/**
 * Amounts are in minor units and the field is *named* for it.
 *
 * `maxOrderValue.minor: 25_000` is ₹250.00. The field used to be called
 * `amount`, and `amount: 25_000, currency: 'INR'` reads as twenty-five
 * thousand rupees — while the value a ceiling compares against arrives in a
 * payload field called `amountMinor` and is 250 paise. Both are round
 * numbers and they are 100x apart. Naming the unit in the identifier is the
 * only fix that survives a hurried config edit at midnight.
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
   * Ceilings live on the policy, which every capability shares, so "a ceiling
   * is configured" is not a claim that *this* capability carries an order.
   * `searchProducts` and `checkInventory` are reads that move no money and
   * must not be refused for carrying no amount.
   */
  ceilingExempt: ['searchProducts', 'checkInventory'],
}

/** A hash of the config that produced a decision, so a row can be reconciled later. */
export const configHash = 'a1b2c3d4e5f6a1b2'

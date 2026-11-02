/**
 * The landing page's sample policy decision.
 *
 * This is a demonstration, not the governor. It exists so the page can show
 * the difference between a decision and an execution outcome without shipping
 * a second policy engine. The real decision is made by the governor from the
 * merchant's signed artifact.
 *
 * Amounts appear only as request context. The console and ledger views omit
 * them; `DEMO_CONSOLE_FIELDS` is the testable reminder. Keeping the sample
 * logic pure also means the honesty rules can be asserted in Vitest without a
 * DOM harness, which this repo does not have.
 */

export type DemoCapability =
  | 'searchProducts'
  | 'createOrder'
  | 'requestRefund'
  | 'deleteAccount'

export type DemoDecision = 'allow' | 'hold' | 'refuse'

/**
 * Deliberately no `succeeded` state. An allowed decision is not proof that the
 * downstream call worked; the execution outcome is recorded separately.
 */
export type DemoExecution =
  | 'not_yet_observed'
  | 'waiting_for_approval'
  | 'not_executed'

export type DemoRequest = {
  capability: DemoCapability
  amountInr?: number
}

export type DemoResult = {
  capability: DemoCapability
  request: string
  context: string
  policy: string
  decision: DemoDecision
  reason: string
  execution: DemoExecution
  executionNote: string
}

export const DEMO_CEILING_INR = 10_000
export const DEMO_ORDER_INR = 25_000

/**
 * The fields a console view may show for a decision. Amounts are absent by
 * design — the merchant's ledger has them, our views do not.
 */
export const DEMO_CONSOLE_FIELDS = [
  'capability',
  'agent',
  'decision',
  'reason',
  'execution',
] as const

/** Deterministic thousands separators; avoids server/client ICU drift. */
export function formatInr(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export function evaluateDemoRequest(request: DemoRequest): DemoResult {
  switch (request.capability) {
    case 'searchProducts':
      return {
        capability: 'searchProducts',
        request: 'Search the catalogue',
        context: 'No amount; no approval requirement',
        policy: 'Allowed for this sample',
        decision: 'allow',
        reason:
          'The capability is exposed and the request carries no ceiling or approval trigger.',
        execution: 'not_yet_observed',
        executionNote:
          'The decision permits the call. The downstream result is recorded separately; an allow is not proof that the operation succeeded.',
      }

    case 'createOrder': {
      const amount = request.amountInr ?? DEMO_ORDER_INR
      const overCeiling = amount > DEMO_CEILING_INR
      return {
        capability: 'createOrder',
        request: `Create an order for ₹${formatInr(amount)}`,
        context: `Amount: ₹${formatInr(amount)}`,
        policy: overCeiling
          ? `Orders above ₹${formatInr(DEMO_CEILING_INR)} require approval`
          : `Orders up to ₹${formatInr(DEMO_CEILING_INR)} are allowed`,
        decision: overCeiling ? 'hold' : 'allow',
        reason: overCeiling
          ? 'The requested amount exceeds the configured soft ceiling. The operation must not execute until the required approval is recorded.'
          : 'The requested amount is within the configured soft ceiling, so the operation may proceed.',
        execution: overCeiling ? 'waiting_for_approval' : 'not_yet_observed',
        executionNote: overCeiling
          ? 'Not executed. The request waits for approval; approval re-evaluates policy at commit.'
          : 'The decision permits the call. The downstream result is recorded separately; an allow is not proof that the operation succeeded.',
      }
    }

    case 'requestRefund':
      return {
        capability: 'requestRefund',
        request: 'Request a refund',
        context: 'Sensitive operation; a human decision is required',
        policy: 'Refunds require approval',
        decision: 'hold',
        reason:
          'A refund moves money and is treated as a sensitive operation. It waits for an authorised person to approve it.',
        execution: 'waiting_for_approval',
        executionNote:
          'Not executed. The request waits for approval; approval re-evaluates policy at commit.',
      }

    case 'deleteAccount':
      return {
        capability: 'deleteAccount',
        request: 'Delete an account',
        context: 'Destructive operation',
        policy: 'This capability is not permitted',
        decision: 'refuse',
        reason:
          'The capability is prohibited by policy. Denials are evaluated before holds, so this is never queued for approval.',
        execution: 'not_executed',
        executionNote: 'Not executed. The refusal happens before the operation runs.',
      }
  }
}

export const DEMO_SCENARIOS: readonly DemoResult[] = [
  evaluateDemoRequest({ capability: 'searchProducts' }),
  evaluateDemoRequest({ capability: 'createOrder', amountInr: DEMO_ORDER_INR }),
  evaluateDemoRequest({ capability: 'requestRefund' }),
  evaluateDemoRequest({ capability: 'deleteAccount' }),
]

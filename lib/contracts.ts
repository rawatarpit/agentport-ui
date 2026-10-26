/**
 * Structural mirrors of the AgentPort data contracts this console reads,
 * writes, and compiles.
 *
 * Why this file exists: the runtime SDK is not a dependency of this
 * repository — it is not published, and the console must build standalone
 * (Netlify builds from a clean clone; a `file:` dependency on a folder this
 * repo cannot carry is a build that cannot exist). These types are the data
 * seam between the two systems: stored ledger rows, policies, identities and
 * outcomes. The SDK remains authoritative for its own runtime types; these
 * describe the same shapes for the dashboard's halves.
 *
 * Fields are mirrored exactly — a missing member here means TypeScript
 * cannot see a column the database returns, which is the correct failure
 * mode: new columns arrive through a custody review before they arrive
 * through this file.
 */

/** Effect class of a capability. Read is safe to retry; write is not. */
export type Access = 'read' | 'write'

/** What a capability touches, used for data-minimisation policy. */
export type DataClass = 'public' | 'internal' | 'pii' | 'payment'

/** The end user an agent acts for, when it is acting for someone. */
export interface UserDelegation {
  userId: string
  scope: 'read' | 'write' | 'full'
  grantedAt: string
}

/** Verified identity of the calling agent, established before anything else. */
export interface AgentIdentity {
  agentId: string
  /**
   * Required, deliberately: the one caller most likely to omit this — the
   * one that established no identity at all — must not default to `verified`.
   */
  assurance: 'verified' | 'unverified'
  scopes: string[]
  onBehalfOf?: UserDelegation
  credentialId: string
  issuedAt: string
  expiresAt: string
}

/** Why a request was refused. Never a generic "forbidden". */
export type DenialReason =
  | 'unknown_capability'
  | 'capability_not_exposed'
  | 'unauthenticated'
  | 'identity_expired'
  | 'insufficient_scope'
  | 'delegation_insufficient'
  | 'policy_denied'
  | 'rate_limited'
  | 'approval_required'
  | 'approval_rejected'
  | 'validation_failed'
  | 'handler_error'
  | 'intent_conflict'

export type PolicyOutcome = 'allow' | 'deny' | 'require_approval'

/** A reason is either an actual refusal, or the explicit fact of permission. */
export type DecisionReason = DenialReason | 'allowed'

/**
 * One PROVE record. A ledger entry records decisions, not responses; this is
 * the difference between an audit trail and a log of model output.
 */
export interface LedgerEntry {
  tenantId: string
  requestId: string
  /** The held request this approval row committed, when this row is a commit. */
  heldRequestId?: string
  at: string
  agentId: string
  assurance: 'verified' | 'unverified'
  configHash?: string
  /** The numbers the rule was measured against, when the row carries them. */
  evaluated?: Record<string, unknown>
  intentId?: string
  onBehalfOfUserId?: string
  onBehalfOfScope?: 'read' | 'write' | 'full'
  capability: string
  capabilityRegistered?: boolean
  access?: Access
  parameters: Record<string, unknown>
  decision: PolicyOutcome
  reason: DecisionReason
  rule: string
  detail: string
  approval?: {
    required: boolean
    granted?: boolean
    approvedBy?: string
    at?: string
    expiresAt?: string
  }
  result?: 'ok' | 'error'
  error?: string
  durationMs: number
  rowDigest?: string
}

/** A request held for a human decision. Nothing has executed yet. */
export interface PendingApproval {
  requestId: string
  tenantId: string
  intentId?: string
  agentId: string
  capability: string
  input: unknown
  identity: AgentIdentity
  createdAt: string
  expiresAt: string
  reason: string
}

/**
 * What the business configures. Every field optional.
 *
 * `minor` is a whole number in the currency's minor unit — paise for INR,
 * cents for USD. The field is named for its unit because `amount: 100_000`
 * reads as one lakh rupees while the value compared against it arrives in
 * paise — 100x apart, and both look like round numbers.
 */
export interface Policy {
  maxOrderValue?: { minor: number; currency: string }
  absoluteMaxOrderValue?: { minor: number; currency: string }
  rateLimit?: { requestsPerMinute: number; scope?: 'agent' | 'capability' }
  forbiddenCapabilities?: string[]
  alwaysRequireApproval?: string[]
  ceilingExempt?: string[]
  restrictedDataClasses?: DataClass[]
  bulkOrderThreshold?: { units: number }
  emergencyKillSwitch?: boolean
}

/** The five outcomes a governed call can produce, as a discriminated union. */
export type ExecuteOutcome =
  | {
      status: 'ok'
      data: unknown
      requestId: string
      intentId?: string
      replayed?: boolean
    }
  | {
      status: 'denied'
      reason: DenialReason
      rule: string
      detail: string
      requestId: string
    }
  | {
      status: 'pending_approval'
      approval: PendingApproval
      requestId: string
    }
  | {
      status: 'error'
      message: string
      requestId: string
      intentId?: string
    }
  | {
      status: 'in_progress'
      requestId: string
      intentId: string
    }

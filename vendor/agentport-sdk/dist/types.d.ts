/**
 * Core types for Agent Port.
 *
 * The product chain this SDK implements is DISCOVER, IDENTIFY, AUTHORIZE,
 * EXECUTE, PROVE. A business exposes capabilities that map onto APIs it
 * already has; the SDK supplies identity, policy, execution and the ledger
 * around them. It never replaces the business's own code.
 */
/** Effect class of a capability. Read is safe to retry; write is not. */
export type Access = 'read' | 'write';
/** What a capability touches, used for data-minimisation policy. */
import type { InputSchema } from './validate.js';
export type DataClass = 'public' | 'internal' | 'pii' | 'payment';
/**
 * A capability the business chooses to expose. Anything not registered here
 * is unreachable by an external agent, by construction.
 */
export interface Capability<I = unknown, O = unknown> {
    /** Wire name. This is the identifier agents see and call. */
    name: string;
    /** One-line human description, surfaced in the discovery manifest. */
    description: string;
    access: Access;
    dataClass?: DataClass;
    /** Input shape. Validated before the handler ever runs. */
    input?: InputSchema;
    /**
     * Denormalised value the policy engine evaluates, e.g. order total.
     * Policy rules read this instead of re-parsing the input.
     *
     * Static, so it is the same on every request. That is right for a constant —
     * a fixed subscription charge, a published limit — and wrong for anything the
     * caller controls, because the caller can name a different key. Use
     * `policyInputFor` for a per-request figure.
     */
    policyInput?: Record<string, unknown>;
    /**
     * The merchant's own authoritative figures, computed per request.
     *
     * This is the only correct source for a money ceiling, and it exists because
     * the obvious alternative is not one. A rule that measures an amount read out
     * of the caller's payload measures what the caller said the amount was, so the
     * caller decides whether the ceiling fires. Demonstrated: a merchant
     * declaring `total` and a 100,000 ceiling, and a request carrying
     * `{ total: 500_000, amountMinor: 0 }`, passed the check while the handler
     * charged 500,000.
     *
     * Whatever this returns is authoritative: the caller's own keys are removed
     * from the measurement, so the rule reads the same number the handler will.
     * Declaring a figure therefore replaces the caller's claim *for every
     * measurement* — the one it names, and the ones it does not, since declaring
     * `total` also takes the payload's `quantity` out of a bulk threshold — and it
     * does so *even when the key you return is not one a rule reads*: under
     * `grandTotal` or `discountPct` the engine measures nothing at all and denies
     * with `amount_unmeasurable`, because the alternative is falling back to the
     * number the caller chose. Use one of `amountMinor`, `amount`, `total`,
     * `orderTotal`, `price` for an amount (minor units) or `units`, `quantity`,
     * `itemCount` for a count; `buildCapabilities` refuses a declared key outside
     * that vocabulary, at startup, naming it.
     *
     * It runs after validation, so the input it receives is already checked. It is
     * also the one piece of this path that can throw — it is the merchant's own
     * code — so a throw is caught, recorded as `policy_input_unavailable`, and
     * returned as a refusal rather than escaping to the caller.
     */
    policyInputFor?: (input: unknown) => Record<string, unknown>;
    /**
     * When true, execution is held and a PendingApproval is produced.
     * The handler must NOT have run.
     */
    requiresApproval?: boolean;
    /** The business's existing logic. Runs only after authorisation passes. */
    execute: (input: I, ctx: ExecutionContext) => Promise<O> | O;
}
/** Verified identity of the calling agent, established before anything else. */
export interface AgentIdentity {
    /** Stable agent identifier, e.g. "gpt-shopping". */
    agentId: string;
    /**
     * How this identity was established.
     *
     * `unverified` means the caller identified itself and nothing more — a
     * User-Agent string, say. It is honest only for a capability that is public
     * and read-only.
     *
     * Required, and required deliberately. This field used to be optional, and the
     * ledger read an absent value as `verified`. So the one caller most likely to
     * omit it — the one that established no identity at all — was recorded as the
     * most trustworthy caller in the system. That is the failure this SDK exists
     * to prevent, shipping by default. Required is the only version of this field
     * where omission cannot mean permission.
     *
     * Note what required does *not* buy: it does not stop a caller writing
     * `verified` by hand. Nothing in this type ever could. The value only starts
     * meaning something once it is derived from a signature instead of asserted
     * by the caller, which is what credential verification is for. Until then
     * `verified` on a hand-built object is a claim, not a fact.
     */
    assurance: 'verified' | 'unverified';
    /** Scopes this agent was granted at authorisation time. */
    scopes: string[];
    /** The end user the agent acts for, when it is acting for someone. */
    onBehalfOf?: UserDelegation;
    /** Short-lived credential identifier. The raw token is never stored. */
    credentialId: string;
    issuedAt: string;
    expiresAt: string;
}
export interface UserDelegation {
    userId: string;
    /** How the user authorised the agent. */
    scope: 'read' | 'write' | 'full';
    grantedAt: string;
}
/** Why a request was refused. Never a generic "forbidden". */
export declare const DENIAL_REASONS: readonly ["unknown_capability", "capability_not_exposed", "unauthenticated", "identity_expired", "insufficient_scope", "delegation_insufficient", "policy_denied", "rate_limited", "approval_required", "approval_rejected", "validation_failed", "handler_error", "intent_conflict"];
export type DenialReason = (typeof DENIAL_REASONS)[number];
/**
 * The three outcomes a policy may produce, as a value rather than a bare union.
 *
 * Exported as a runtime array so a consumer that has to *enumerate* them — the
 * CLI validating `--decision`, the manifest's error contract — reads this instead
 * of writing the three strings out again. A copy is a second place to forget:
 * the `SqlLedger` CHECK constraint is a third, and a decision added to the type
 * but not to the schema produces a row the engine cannot write.
 */
export declare const POLICY_OUTCOMES: readonly ["allow", "deny", "require_approval"];
export type PolicyOutcome = (typeof POLICY_OUTCOMES)[number];
/** A reason is either an actual refusal, or the explicit fact of permission. */
export declare const DECISION_REASONS: readonly ["unknown_capability", "capability_not_exposed", "unauthenticated", "identity_expired", "insufficient_scope", "delegation_insufficient", "policy_denied", "rate_limited", "approval_required", "approval_rejected", "validation_failed", "handler_error", "intent_conflict", "allowed"];
export type DecisionReason = (typeof DECISION_REASONS)[number];
/**
 * A discriminated union on `outcome`, so that handling a `deny` narrows the
 * reason to an actual DenialReason without a cast.
 */
export type PolicyDecision = {
    outcome: 'allow';
    reason: 'allowed';
    detail: string;
    rule: string;
    evaluated: Record<string, unknown>;
} | {
    outcome: 'deny' | 'require_approval';
    reason: DenialReason;
    detail: string;
    rule: string;
    evaluated: Record<string, unknown>;
};
export interface ExecutionContext {
    identity: AgentIdentity;
    requestId: string;
    capability: string;
    decision: PolicyDecision;
    /** Capabilities the identity is scoped for, for downstream checks. */
    hasScope: (scope: string) => boolean;
    logger: Logger;
}
export interface Logger {
    debug: (message: string, meta?: Record<string, unknown>) => void;
    warn: (message: string, meta?: Record<string, unknown>) => void;
}
/**
 * One PROVE record. A ledger entry records decisions, not responses; this is
 * the difference between an audit trail and a log of model output.
 */
export interface LedgerEntry {
    /**
     * The shop this row belongs to.
     *
     * Bound when the ledger is constructed and stamped on append, never taken
     * from the request. A request that could name its own tenant could write into
     * another merchant's record, and — because this table has no update path — a
     * row written under a shared default tenant cannot be reassigned later. The
     * only moment this is cheap to get right is before anything has been written.
     */
    tenantId: string;
    requestId: string;
    at: string;
    agentId: string;
    /** Required. See `AgentIdentity.assurance` on why absent must never read as verified. */
    assurance: 'verified' | 'unverified';
    /** Digest of the config version whose rules produced this decision. */
    configHash?: string;
    /**
     * The numbers the rule was measured against, and the limit it was compared
     * to. Without these, a row records that a ceiling fired but not what the
     * ceiling was or what tripped it, so a merchant holding a refusal learns that
     * it happened and nothing about why. Empty for a capability that is not
     * registered, because there were no rules to evaluate.
     */
    evaluated?: Record<string, unknown>;
    /** Absent unless the caller supplied one. See AgentRequest.intentId. */
    intentId?: string;
    /** The end user the agent acted for, if any. */
    onBehalfOfUserId?: string;
    /**
     * The authority that user delegated, enforced as a ceiling on the agent.
     *
     * Recorded beside `onBehalfOfUserId` because a row naming the user without
     * naming the authority is not evidence of anything: "the agent acted for
     * Priya" reads identically whether Priya delegated a read or a full refund.
     * A ledger exists to answer what was permitted, and a permission question
     * answered halfway is the same as not answered.
     */
    onBehalfOfScope?: 'read' | 'write' | 'full';
    /**
     * The capability the agent named, whether or not it is registered.
     * A probe for a capability that does not exist is still a decision, and it
     * is the earliest signal that an agent is guessing at the surface.
     */
    capability: string;
    /**
     * False when `capability` is not registered, in which case there is no
     * access class to report. Fabricating one would put an invented fact in an
     * audit record, so this stays undefined instead.
     */
    capabilityRegistered?: boolean;
    /** Undefined only when `capabilityRegistered` is false. */
    access?: Access;
    /** Redacted. Never store raw PII or credentials in the ledger. */
    parameters: Record<string, unknown>;
    decision: PolicyOutcome;
    reason: DecisionReason;
    rule: string;
    detail: string;
    approval?: {
        required: boolean;
        granted?: boolean;
        approvedBy?: string;
        at?: string;
    };
    result?: 'ok' | 'error';
    error?: string;
    durationMs: number;
    /**
     * Tamper-evidence for this row, stamped by the ledger at append time.
     *
     * `sha256:` plus 16 hex over the canonical serialization of the stored —
     * therefore redacted — values. It never covers itself: a digest that included
     * its own value is a claim no verifier can reproduce. A reader holding a
     * listed row recomputes it with the same function the ledger used, so a row
     * edited after the fact stops verifying.
     *
     * Optional because rows written before this field existed carry NULL rather
     * than a backfilled value — backfilling would attest to history nobody
     * measured at the time.
     */
    rowDigest?: string;
}
export interface Ledger {
    append: (entry: LedgerEntry) => Promise<void>;
    list: (filter?: LedgerFilter) => Promise<LedgerEntry[]>;
}
export interface LedgerFilter {
    agentId?: string;
    capability?: string;
    decision?: PolicyOutcome;
    since?: string;
    limit?: number;
}
/**
 * A request held for a human decision. Nothing has executed yet.
 *
 * It carries the original request, not a summary of it. An earlier version
 * stored redacted parameters and `approve()` handed them straight to the
 * handler, so a write would have executed on mutilated input; and because it
 * stored only a capability name, `approve()` had nothing to re-evaluate and
 * fabricated an `allow`. Both are why this holds the request.
 *
 * `input` here is raw, deliberately. This is operational state in the
 * merchant's own store, not the audit record; the ledger is where redaction
 * applies. A held write cannot be executed correctly from redacted input.
 */
export interface PendingApproval {
    requestId: string;
    /**
     * The shop that made the request.
     *
     * Without this a shared approval store is a cross-tenant write: shop B calls
     * `approve()` with shop A's requestId, this port resolves the capability from
     * *its own* registry, runs *its own* handler on *A's* input, and stamps the row
     * with B's tenant — so the column is honestly B's and the content is A's, and
     * A's ledger has no row saying a write happened at all. Stamping correctly is
     * not provenance; this field is the part that makes the approval mean it
     * applies to the request that was held.
     */
    tenantId: string;
    intentId?: string;
    agentId: string;
    capability: string;
    input: unknown;
    /** The verified identity that made the request, re-checked on approval. */
    identity: AgentIdentity;
    createdAt: string;
    /** A human decision made days later must not execute a stale request. */
    expiresAt: string;
    reason: string;
}
/** What the business configures. All fields optional except business. */
export interface Policy {
    /** Currency amount above which any write requires approval. */
    /**
     * `minor` is a whole number in the currency's minor unit — paise for INR,
     * cents for USD.
     *
     * The field used to be called `amount`, which is the most expensive naming
     * mistake available in a payments control. `amount: 100_000, currency: 'INR'`
     * reads as one lakh rupees; the value the engine compares against it comes
     * out of a payload field called `amountMinor` and is 90,000 *paise*. Both are
     * "amounts", both look like round numbers, and they are 100x apart. The first
     * end-to-end run of the binary hit it: a ₹900 order held for approval against
     * a ceiling written as ₹100,000.
     *
     * Naming the unit in the identifier is the only fix that survives a hurried
     * config edit at midnight. A comment does not.
     */
    maxOrderValue?: {
        minor: number;
        currency: string;
    };
    /** Hard ceiling. Requests above this are denied, never queued. */
    absoluteMaxOrderValue?: {
        minor: number;
        currency: string;
    };
    /** Per-agent, per-minute. */
    rateLimit?: {
        requestsPerMinute: number;
        scope?: 'agent' | 'capability';
    };
    /** Capability names an external agent may never call. */
    forbiddenCapabilities?: string[];
    /** Capability names that always require a human, regardless of other rules. */
    alwaysRequireApproval?: string[];
    /**
     * Capability names the order ceilings do not govern.
     *
     * `maxOrderValue` and `absoluteMaxOrderValue` are configured on the policy,
     * which is shared by every capability the port exposes — so a merchant who
     * sets one is asserting it about all of them, including the writes that move
     * no money (updating an address, writing a note). Those would otherwise be
     * refused for carrying no order amount, which is not what the merchant meant.
     *
     * The opt-out is a list of names rather than an inference from `dataClass`
     * because `dataClass` is a label the merchant chooses and nothing verifies it
     * against the query behind the capability. A ceiling gated on that label can
     * be escaped by relabelling a payment write as `pii`, so it would fail open
     * on the one case that matters. Gating on `access === 'write'` fails closed
     * instead, and costs an exemption for the innocent writes. Failing closed on
     * a wrong guess is recoverable; failing open on a money write is not.
     */
    ceilingExempt?: string[];
    /** Data classes an external agent may not read. */
    restrictedDataClasses?: DataClass[];
    /** Orders at or above this unit count require approval. */
    bulkOrderThreshold?: {
        units: number;
    };
    /** Kill switch. When true every write is denied and reads are audited only. */
    emergencyKillSwitch?: boolean;
}
export interface AgentPortOptions {
    business: string;
    /**
     * The shop this instance governs. Required, and deliberately without a
     * default.
     *
     * It is not a label. It is bound at construction, stamped on every row by
     * the ledger, and every claim, completion and release is scoped to it. Two
     * Agent Port instances sharing one `SqlExecutor` is the supported
     * multi-tenant arrangement, and the thing standing between that and shop A
     * answering a request as shop B is this field. A default would make that
     * arrangement silently wrong rather than loudly unsupported.
     */
    tenantId: string;
    /**
     * Digest of the config version whose rules produced these decisions, so a row
     * can be read against the rules that made it. Optional only because the SDK
     * has no config of its own yet; anything that loads a merchant's policy
     * should set it.
     */
    configHash?: string;
    /** Base URL the manifest is served from. */
    baseUrl: string;
    policy?: Policy;
    ledger: Ledger;
    logger?: Logger;
    /** How long a held approval stays executable. Default one hour. */
    approvalTtlMs?: number;
    /** Injectable for tests. Defaults to Date.now-based uuid. */
    requestId?: () => string;
    clock?: () => Date;
}
/** The /.well-known/agent.json document. */
export interface Manifest {
    version: '1.0';
    business: string;
    baseUrl: string;
    generatedAt: string;
    capabilities: Array<{
        name: string;
        description: string;
        access: Access;
        dataClass: DataClass;
        requiresApproval: boolean;
        input: unknown;
    }>;
    authentication: {
        scheme: 'bearer';
        header: 'Authorization';
        note: string;
    };
    policies: {
        /**
       * `minor` is a whole number in the currency's minor unit — paise for INR,
       * cents for USD.
       *
       * The field used to be called `amount`, which is the most expensive naming
       * mistake available in a payments control. `amount: 100_000, currency: 'INR'`
       * reads as one lakh rupees; the value the engine compares against it comes
       * out of a payload field called `amountMinor` and is 90,000 *paise*. Both are
       * "amounts", both look like round numbers, and they are 100x apart. The first
       * end-to-end run of the binary hit it: a ₹900 order held for approval against
       * a ceiling written as ₹100,000.
       *
       * Naming the unit in the identifier is the only fix that survives a hurried
       * config edit at midnight. A comment does not.
       */
        maxOrderValue?: {
            minor: number;
            currency: string;
        };
        absoluteMaxOrderValue?: {
            minor: number;
            currency: string;
        };
        rateLimit?: {
            requestsPerMinute: number;
            scope: 'agent' | 'capability';
        };
        requiresApproval: string[];
        forbidden: string[];
        restrictedDataClasses: DataClass[];
        bulkOrderThreshold?: {
            units: number;
        };
        /**
         * Never populated, and always `undefined`.
         *
         * This was `emergencyKillSwitch: boolean` and it was published, which made
         * the public manifest a readiness oracle — unauthenticated, so anyone could
         * learn whether a shop was currently refusing writes and time requests to
         * the window where it was not. Kept in the type as an optional field rather
         * than removed so an agent written against the old shape keeps compiling and
         * reads a documented `undefined` instead of a security-relevant `false`.
         *
         * The switch is still reported to a caller that tries, as
         * `rule: 'emergency_kill_switch'`. See `buildManifest`.
         */
        emergencyKillSwitch?: undefined;
    };
    /** Business-controlled, so an agent knows the shape without guessing. */
    errorContract: {
        reason: DenialReason;
        detail: string;
    }[];
    endpoints: {
        manifest: string;
        execute: string;
    };
}
export type ExecuteOutcome = {
    status: 'ok';
    data: unknown;
    requestId: string;
    intentId?: string;
    replayed?: boolean;
}
/**
 * `rule` is additive and load-bearing. `detail` is prose and a caller cannot
 * route on prose: an agent told "exceeds the absolute limit" in one sentence
 * and "not exposed" in another has no way to tell a ceiling it should not
 * retry from a capability that does not exist. The rule was already reaching
 * the ledger; this is the same string, given to the caller, so the refusal is
 * machine-readable on both sides of the call.
 */
 | {
    status: 'denied';
    reason: DenialReason;
    rule: string;
    detail: string;
    requestId: string;
} | {
    status: 'pending_approval';
    approval: PendingApproval;
    requestId: string;
} | {
    status: 'error';
    message: string;
    requestId: string;
    intentId?: string;
}
/**
 * The intent is claimed by another in-flight call. Not an error: the agent
 * should wait and read the stored outcome rather than starting the work.
 */
 | {
    status: 'in_progress';
    requestId: string;
    intentId: string;
};
/**
 * Idempotency store. The merchant supplies a durable one; the default is
 * process-local and is not safe for a write across restarts.
 */
export interface IdempotencyStore {
    /**
     * The shop this store is bound to, when it is bound to one.
     *
     * Optional so a custom adapter written before this is still assignable, but
     * `AgentPort` checks it when present. Two implementations of this interface
     * disagreed about whether a shop can see another's writes — `SqlIdempotencyStore`
     * scoped every statement by `tenant_id`, the in-memory one did not scope at
     * all — and the disagreement only surfaced in a deployment that shared one
     * store across ports. Declaring the binding makes that checkable instead.
     */
    readonly tenantId?: string;
    /** True when this caller claimed the intent. False when someone else owns it. */
    claim: (intentId: string, fingerprint: string, at: string) => Promise<boolean>;
    get: (intentId: string) => Promise<{
        intentId: string;
        fingerprint: string;
        status: 'in_progress' | 'complete';
        outcome?: unknown;
    } | undefined>;
    complete: (intentId: string, outcome: unknown, at: string) => Promise<void>;
    release: (intentId: string) => Promise<void>;
}
/** Shape of an inbound agent request. */
export interface AgentRequest {
    capability: string;
    input: unknown;
    identity: AgentIdentity;
    /**
     * Caller-supplied stable id for "the thing the agent is trying to do".
     *
     * `requestId` is minted per call and cannot detect a retry. An agent that
     * retries after a timeout means the same intent, and without this a retry is
     * a second write. Supply it for any capability with a side effect.
     */
    intentId?: string;
}
//# sourceMappingURL=types.d.ts.map
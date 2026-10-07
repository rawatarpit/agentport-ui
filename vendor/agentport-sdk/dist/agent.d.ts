import { stableStringify } from './ledger.js';
import type { Access, AgentIdentity, IdempotencyStore, AgentPortOptions, AgentRequest, Capability, DenialReason, ExecuteOutcome, Manifest, PendingApproval } from './types.js';
/**
 * Held approvals, keyed by requestId. In-process; swap for a durable store.
 *
 * `consume` must be atomic. It is the only thing standing between a
 * double-clicked approve button and two writes, and a get-then-mark pair races.
 */
export interface ApprovalStore {
    put: (approval: PendingApproval) => Promise<void>;
    get: (requestId: string) => Promise<PendingApproval | undefined>;
    /**
     * Marks an approval spent. False when it was already spent.
     *
     * `approvedBy` is carried through so a durable store can name the operator
     * in its own event log. Without it the queue records "approved" and the
     * only place a name appears is the ledger, which is a different record of a
     * different thing.
     */
    consume: (requestId: string, approvedBy?: string) => Promise<boolean>;
}
/**
 * Process-local, and unbounded: it retains spent approvals so a replay can be
 * reported rather than looking like a request that never existed. Fine for
 * tests and single-process pilots.
 *
 * Note what this cannot do, which is why `SqlApprovalStore` exists: it cannot
 * be shared between two processes. `serve` holds a request in its own memory,
 * so a separate `agent-port approve` invocation finds nothing waiting and
 * reports "No pending approval" for a request the merchant can plainly see
 * listed by `agent-port pending`. An approval queue that only exists inside one
 * process is not a queue a human works from.
 */
export declare class InMemoryApprovalStore implements ApprovalStore {
    private readonly items;
    private readonly spent;
    put(approval: PendingApproval): Promise<void>;
    get(requestId: string): Promise<PendingApproval | undefined>;
    consume(requestId: string): Promise<boolean>;
}
/**
 * Process-local idempotency. Same warning as the approval store above.
 *
 * The contract this store implements, which is the part that is easy to get
 * backwards: `complete` is called for an effect that happened and for nothing
 * else, so a `complete` row is the one and only replayable outcome, and a
 * handler failure calls `release` instead. Storing a failure as `complete` is
 * what made a timed-out charge replay to the agent as `status: 'ok'` with the
 * error message as its `data`, forever: the agent believed the write landed,
 * stopped retrying, and the customer was never charged. "A write retried is not
 * a second write" is true, and its converse — a write that failed is retryable
 * and is never reported as succeeded — was false.
 */
export declare class InMemoryIdempotencyStore implements IdempotencyStore {
    private readonly items;
    /**
     * Keyed on the tenant as well as the id.
     *
     * This is the store `AgentPort` uses when the caller passes none, so it is the
     * one most multi-shop deployments will actually run. Keyed on `intentId`
     * alone, shop B reusing shop A's id read A's stored outcome and returned it as
     * its own successful result — including A's order id and whatever the handler
     * returned — while writing no row of its own, and a same-id/different-input
     * collision surfaced to B as an `intent_conflict` about work B never did.
     * `SqlIdempotencyStore` scopes every statement by `tenant_id`; this had to
     * match it, or the two implementations of one interface disagreed about
     * whether a shop can see another's writes.
     */
    private key;
    readonly tenantId: string;
    constructor(tenantId: string);
    claim(intentId: string, fingerprint: string, _at: string): Promise<boolean>;
    get(intentId: string): Promise<{
        intentId: string;
        fingerprint: string;
        status: "in_progress" | "complete";
        outcome?: unknown;
    } | undefined>;
    complete(intentId: string, outcome: unknown, _at: string): Promise<void>;
    release(intentId: string): Promise<void>;
}
/**
 * Decides whether one caller's next refusal may still be written to the ledger.
 *
 * This exists because the ledger has no row cap *and* cannot grow one: it is
 * append-only with no update path, so there is no row to drop later. A refusal
 * is a durable INSERT, and the refusals that are cheapest to trigger are the
 * ones that never reach policy — no such capability, no credential, no scope, a
 * payload that does not validate. `hitRateLimit` is the *last* rule in
 * `policy.ts` and an unregistered capability is refused in `invoke()` before
 * `policy.evaluate` runs at all, so there was no control in front of any of
 * them: an unauthenticated caller could write rows to a merchant's database
 * forever, at one row per request.
 */
export interface RefusalLimiter {
    /** False when this caller's next refusal row would exceed their budget. */
    admit: (key: string, now: number) => boolean;
}
/**
 * Per-key sliding window, in process memory. Same warning as the approval store
 * and the in-memory idempotency store above it.
 */
export declare class WindowedRefusalLimiter implements RefusalLimiter {
    private readonly limit;
    private readonly windowMs;
    private readonly keyCap;
    private readonly windows;
    constructor(limit?: number, windowMs?: number, keyCap?: number);
    admit(key: string, now: number): boolean;
    /**
     * Drops the oldest keys when the table is full.
     *
     * Eviction is the safe direction, and that is the reason to evict rather than
     * refuse a new key: forgetting a caller *restores* their budget, so flooding
     * with distinct agent names cannot push a legitimate holder's window out and
     * silence it. Refusing the new key instead would make a large fleet — or one
     * prober enumerating names — a way to stop the ledger recording anyone.
     */
    private evict;
}
export declare class AgentPort {
    private readonly capabilities;
    private readonly options;
    private readonly policy;
    private readonly approvals;
    private readonly idempotency;
    private readonly refusalLimiter;
    private readonly approvalTtlMs?;
    private readonly logger;
    private readonly clock;
    private readonly newRequestId;
    constructor(options: AgentPortOptions, approvals?: ApprovalStore, idempotency?: IdempotencyStore, refusalLimiter?: RefusalLimiter);
    /**
     * Registers a capability. Anything not registered is unreachable by an
     * external agent, which is the point: exposure is an allowlist, not a filter.
     */
    expose<I, O>(capability: Capability<I, O>): this;
    /** DISCOVER. */
    manifest(): Manifest;
    /** Capability names, in manifest order. */
    names(): string[];
    /**
     * IDENTIFY, AUTHORIZE, EXECUTE, PROVE for a single call.
     *
     * Returns a discriminated outcome rather than throwing, so a transport layer
     * can map each case to the right status code without string matching.
     */
    invoke(request: AgentRequest): Promise<ExecuteOutcome>;
    /**
     * Executes a held request after a human approved it.
     *
     * This re-enters the pipeline rather than asserting an outcome. The previous
     * version fabricated an `allow`, re-derived a wildcard identity, and handed
     * the handler the *redacted* parameters — so no rule ran between the hold and
     * the write, a kill switch flipped while the human was deciding did not stop
     * it, the approval could be replayed indefinitely, and a write would have run
     * on mutilated input. All four are invariants, so all four are fixed here
     * rather than by re-checking one rule.
     *
     * The approval is single-use and consumed atomically, so a double-clicked
     * approve button cannot produce two writes.
     */
    approve(requestId: string, approvedBy: string): Promise<ExecuteOutcome>;
    /**
     * Marks an intent as having produced `outcome`, and the only caller that
     * writes `complete`. Never throws, and the swallowing is the point: it runs
     * outside the handler's `try` precisely so that a store failure cannot be
     * mistaken for a handler failure. A false `result: 'error'` row for an effect
     * that landed is unrecoverable on a table with no update path, and throwing
     * would replace a wrong-but-returned outcome with an exception out of a
     * method that promises a discriminated one.
     */
    private completeIntent;
    /**
     * Hands a claim back so the work can be retried, and the only caller of
     * `release`. Never throws: the caller is already being told the write failed,
     * and a claim that cannot be released is reported as stuck by the next retry
     * reading `in_progress` — which is a state the caller can act on, where an
     * exception is not.
     */
    private releaseIntent;
    /**
     * The refusal budget, in one place, in front of every durable refusal row.
     *
     * Returns the outcome to return instead when the budget is spent, or
     * `undefined` when the row may be written. Two call sites — `refuse()` and
     * `refusePolicyInputUnavailable()` — because a single gate with two callers
     * is a control, and two copies of the gate is the defect AGENTS.md already
     * records once for the policy-input merge.
     *
     * A refusal that cannot be written is still returned as a refusal, named as
     * one, and never recorded as something other than what it is. It is not
     * dropped: an agent told nothing would retry forever (invariant 2), and a
     * caller cannot tell a refusal it is not allowed to be told apart from one it
     * is.
     */
    private refusalBudgetSpent;
    /**
     * Returns a denial outcome and records it. PROVE covers refusals too.
     *
     * Every refusal is recorded, including the ones raised before a capability
     * has been resolved. An agent probing for a capability that does not exist is
     * exactly the behaviour a merchant needs to see, so it cannot also be the
     * one case that leaves no trace — bounded by the refusal budget below, which
     * is the only thing standing between that and an unbounded table.
     */
    private refuse;
    /**
     * The one place a policy decision is made for a request, on both the
     * authorisation and the commit path.
     *
     * It returns a union rather than throwing because the thing inside it is
     * merchant code: `policyInputFor` is a function the business writes, and a
     * function that queries a pricing service throws when the service is down.
     * `invoke()` used to call it outside a try, so that throw escaped a method
     * whose entire contract is a discriminated outcome — into a transport that
     * exists to keep such messages out of responses, carrying whatever the driver
     * said, which for a database client is frequently a connection string with a
     * password. The commit path had the identical call wrapped in 42 lines of
     * comment explaining why it must not, which is the shape of a fix applied to
     * one instance of a defect with two instances.
     *
     * So: one call, one catch, two call sites. The commit path keeps its own
     * placement for a reason unrelated to this — it evaluates *after* `consume()`
     * because the rate-limit rule mutates the engine's windows — and both paths
     * still reach `assemblePolicyInput` exactly once.
     */
    private policyAssessment;
    /**
     * Records and returns the refusal for a resolver that could not produce its
     * figures. Called by both paths, so the row and the returned outcome cannot
     * disagree about which request was refused or why.
     *
     * The driver's message goes to the merchant's own logger and to nothing else.
     * The ledger is read by people who did not make the request (invariant 6), and
     * the caller gets a fixed string naming the fault — which is also the only
     * honest one: `ECONNREFUSED` is a fact about the merchant's network, not a
     * reason to refuse an order, and it is not a thing an agent can act on.
     */
    private refusePolicyInputUnavailable;
    private identify;
    private record;
    private appendRow;
}
/**
 * The user's delegation, enforced as a **ceiling** on the agent's own scopes.
 *
 * `UserDelegation.scope` existed, was documented, and was read by nothing. An
 * agent holding `capability:orders.create` acted for a user who had delegated
 * `read`, and the order went through — the field read as a control and enforced
 * nothing, which is the shape of a capability that looks available and is not.
 *
 * **Intersection, never union.** Two authorities are in play: what the merchant
 * granted the *agent* (`identity.scopes`) and what the *user* permitted the
 * agent to do for them (`onBehalfOf.scope`). Effective authority is the lower of
 * the two. A union would let a user who delegated `full` escalate an agent the
 * merchant deliberately scoped to reads — and it would let a compromised
 * credential borrow a user's authority to widen itself.
 *
 * **Absent delegation is not a denial.** An agent acting for nobody is
 * legitimate: the merchant scoped it directly, and public read capabilities must
 * keep working without a user in the loop. The check is only about the case where
 * a delegation exists and claims to be narrower than the call — there, the claim
 * is honoured.
 *
 * One function, called from both the authorisation path and the commit path, so
 * a hold is measured against the same authority the commit is enforced with. Two
 * copies of a scope check is the same defect as the duplicated policy-input
 * merge: the hold would be measured against one authority and the commit against
 * another, and a human would approve a write the user never delegated.
 */
export declare function delegationDenial(identity: AgentIdentity, access: Access): {
    reason: DenialReason;
    detail: string;
} | undefined;
/**
 * Identifies the config version whose rules produced a decision, for
 * `AgentPortOptions.configHash` and therefore for `config_hash` on every row.
 *
 * Every deployment path that loads a merchant's config calls this. The column
 * existed and the invariant claimed it recorded which config made the decision,
 * and nothing wrote it: the two production construction sites in `server.ts` and
 * `main.ts` left it undefined, so every row the shipped binary wrote carried
 * `NULL` and a reader had no way to tell a ceiling that fired under today's
 * config from one that fired under last month's.
 *
 * Sixteen hex characters, not sixty-four, and the reason is that this is a row
 * *label* rather than a security digest: the config is not a secret, nothing is
 * verified against it, and 64 bits is far more than enough to name a version a
 * human then recognises. `stableStringify` bounds depth at 8, so two configs that
 * differ only deeper than that share a label — acceptable for a label, and the
 * bound is there to stop a hostile payload from overflowing the stack, not to
 * fingerprint a file.
 */
export declare function configDigest(config: unknown): Promise<string>;
export { stableStringify };
//# sourceMappingURL=agent.d.ts.map
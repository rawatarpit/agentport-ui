import { redact, scrubFreeText, sha256Hex, stableStringify } from './ledger.js';
import { describeIssues, validateInput } from './validate.js';
import { buildManifest } from './manifest.js';
import { POLICY_AMOUNT_KEYS, POLICY_UNIT_KEYS, PolicyEngine } from './policy.js';
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
export class InMemoryApprovalStore {
    items = new Map();
    spent = new Set();
    async put(approval) {
        this.spent.delete(approval.requestId);
        this.items.set(approval.requestId, Object.freeze({ ...approval }));
    }
    async get(requestId) {
        return this.items.get(requestId);
    }
    async consume(requestId) {
        if (this.spent.has(requestId))
            return false;
        this.spent.add(requestId);
        return true;
    }
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
export class InMemoryIdempotencyStore {
    items = new Map();
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
    key(intentId) {
        return `${this.tenantId}\u0000${intentId}`;
    }
    tenantId;
    constructor(tenantId) {
        this.tenantId = tenantId;
    }
    // `at` is accepted and ignored: the durable store stamps a column, and an
    // in-process map has no use for a timestamp. Declaring the interface here is
    // what makes that difference a compiler-checked fact rather than a comment.
    async claim(intentId, fingerprint, _at) {
        const key = this.key(intentId);
        if (this.items.has(key))
            return false;
        this.items.set(key, { intentId, fingerprint, status: 'in_progress' });
        return true;
    }
    async get(intentId) {
        return this.items.get(this.key(intentId));
    }
    async complete(intentId, outcome, _at) {
        const key = this.key(intentId);
        const existing = this.items.get(key);
        if (existing)
            this.items.set(key, { ...existing, status: 'complete', outcome });
    }
    async release(intentId) {
        const key = this.key(intentId);
        // Only an `in_progress` claim is dropped, so a release can never undo a
        // completion that already landed. The error path runs after the handler
        // threw and before anything was completed, so this is the claim being
        // handed back rather than a record being erased.
        if (this.items.get(key)?.status === 'in_progress')
            this.items.delete(key);
    }
}
const REFUSAL_WINDOW_MS = 60_000;
/**
 * High enough that a misbehaving but legitimate agent is never silently
 * de-recorded, low enough that a flood stops being a disk write flood. Chosen
 * against the number of refusals a real deployment produces, not against the
 * number a prober can: this is a bound on damage, not a throttle.
 */
const REFUSAL_LIMIT = 240;
/** The key is caller-influenced, so the table holding the keys is bounded too. */
const REFUSAL_KEY_CAP = 1_024;
/**
 * Per-key sliding window, in process memory. Same warning as the approval store
 * and the in-memory idempotency store above it.
 */
export class WindowedRefusalLimiter {
    limit;
    windowMs;
    keyCap;
    windows = new Map();
    constructor(limit = REFUSAL_LIMIT, windowMs = REFUSAL_WINDOW_MS, keyCap = REFUSAL_KEY_CAP) {
        this.limit = limit;
        this.windowMs = windowMs;
        this.keyCap = keyCap;
    }
    admit(key, now) {
        const existing = this.windows.get(key);
        if (existing === undefined || existing.resetAt <= now) {
            if (!this.windows.has(key))
                this.evict();
            this.windows.set(key, { count: 1, resetAt: now + this.windowMs });
            return true;
        }
        if (existing.count >= this.limit)
            return false;
        existing.count += 1;
        return true;
    }
    /**
     * Drops the oldest keys when the table is full.
     *
     * Eviction is the safe direction, and that is the reason to evict rather than
     * refuse a new key: forgetting a caller *restores* their budget, so flooding
     * with distinct agent names cannot push a legitimate holder's window out and
     * silence it. Refusing the new key instead would make a large fleet — or one
     * prober enumerating names — a way to stop the ledger recording anyone.
     */
    evict() {
        const cap = Math.max(1, this.keyCap);
        while (this.windows.size >= cap) {
            const oldest = this.windows.keys().next();
            if (oldest.done)
                return;
            // The deletion is the method. This loop used to read the oldest key and
            // stop there, so `size` never fell, the `while` never ended, and the
            // agent hung inside its own rate limiter — reachable by any caller that
            // presented `keyCap` distinct identities, which is a prober enumerating
            // agent names. It is a denial of service on the authorization path, and
            // it is why the suite appeared to hang: the test written to prove
            // eviction existed was the thing that hung, because eviction did not.
            this.windows.delete(oldest.value);
        }
    }
}
/**
 * The budget a refusal is charged to.
 *
 * The namespace is by assurance, and that is the whole answer to "how does
 * limiting the unauthenticated path avoid starving a legitimate credential
 * holder of its own refusal record": a verified caller's key comes from a signed
 * credential, so no unauthenticated caller can be charged to it.
 *
 * The single-bucket claim is enforced by the key, not inherited from a caller.
 * It used to depend on `verifyToken` returning `agentId: 'unidentified'` for
 * every failure, which is true of the HTTP adapter and irrelevant to every other
 * one. Nothing is shared, so there is no budget for one caller to consume on
 * another's behalf.
 *
 * **What this cannot do, stated rather than implied.** It cannot tell a verified
 * identity from a hand-built one. `assurance` is asserted by whoever calls
 * `invoke`, and AGENTS.md invariant 7 says outright that `verified` on a
 * hand-built object is a claim, not a fact. So an adapter that resolves identity
 * from a header and stamps `assurance: 'verified'` earns a `cred:<agentId>`
 * budget it can rotate one name at a time — exactly the defect this function
 * removes for unverified callers, reopened by claiming to be trusted.
 *
 * Nothing inside this package can close that, because the proof has to come from
 * a signature the SDK never sees: per invariant 9 it is the transport's job, and
 * authorisation stays local. The honest form is therefore to fail *closed* on the
 * value we cannot check — which is what the `!== 'verified'` test does — and to
 * assert the boundary in the suite rather than leave it to a comment nobody
 * re-reads. A transport that verifies its credential and passes what it proved
 * closes it properly; one that asserts it does not.
 */
function refusalBudgetKey(identity) {
    // Only a VERIFIED identity contributes a name. An unverified one is collapsed
    // to a single shared bucket, and that is the whole control: the string it
    // used to interpolate was `identity?.agentId` for every identity, so an
    // unverified caller that named a fresh agent got a fresh budget each time and
    // the "one bucket" this comment describes did not exist. The HTTP adapter is
    // accidentally safe — `verifyToken` returns `agentId: 'unidentified'` for
    // every failure — but this package is transport-agnostic, and any adapter that
    // resolves an unverified agent name (a header, a session, an API gateway)
    // hands a prober a way to make the refusal budget unbounded at one row per
    // name, which is the disk-write flood the limiter exists to bound.
    //
    // Fixed here rather than at each caller because the guarantee belongs to the
    // key function: an adapter cannot be trusted to remember it, and a control
    // that depends on every future transport getting it right is not a control.
    if (identity?.assurance !== 'verified')
        return 'anon';
    return `cred:${identity.agentId || 'unidentified'}`;
}
/**
 * The longest capability name that reaches a response or a row.
 *
 * A caller chooses this string and the body is capped at 64 KB, so before this
 * a 60,000-character name produced a 60,000-character `capability` column and a
 * 60,054-character `detail` — in the returned outcome *and* in an immutable row
 * on a table with no cap. One probe writes one enormous row, permanently, and
 * every reader of the ledger pays to parse it.
 */
const MAX_REPORTED_CAPABILITY = 200;
/**
 * Bounds the capability name a caller asked for, for reporting.
 *
 * It bounds what is *reported*, not what is *looked up*, and the direction is
 * the point: clamping before the registry lookup would be a filter deciding
 * what is reachable, which invariant 8 names as a regression. A merchant
 * registers the name; a caller may only choose how it is echoed back.
 *
 * The empty case is a placeholder rather than `''` because the ledger's own
 * `CHECK (capability <> '')` refuses an empty capability, `record()` swallows
 * the resulting error, and the probe that most looks like an attack — one that
 * named nothing — was the one that left no row.
 */
function reportedCapabilityName(raw) {
    const trimmed = raw.trim();
    if (trimmed === '')
        return '(unnamed)';
    return trimmed.length > MAX_REPORTED_CAPABILITY
        ? `${trimmed.slice(0, MAX_REPORTED_CAPABILITY)}…`
        : trimmed;
}
const noopLogger = {
    debug: () => { },
    warn: () => { },
};
/**
 * Agent Port.
 *
 * A business registers the capabilities it already has; Agent Port supplies the
 * five primitives around them: DISCOVER (manifest), IDENTIFY (verified
 * identity), AUTHORIZE (policy), EXECUTE (the business's own handler) and PROVE
 * (the ledger).
 *
 * The ordering guarantee: authorisation is decided before any handler runs, and
 * every outcome, including refusals, is recorded.
 */
/**
 * Reduces a thrown value to one bounded line.
 *
 * An error message is the least controlled input in the system: it comes from a
 * merchant's handler, a driver, or a fetch, and it can contain a stack trace, a
 * file path, a signed URL, or an entire response body. The ledger is read by
 * people who did not make the request, so what is stored is the first line and
 * nothing more. A stack trace in the ledger is both a disclosure and a lie about
 * what the SDK is for.
 */
function errorMessage(err) {
    const raw = err instanceof Error ? err.message : String(err);
    const firstLine = raw.split('\n')[0].trim();
    return firstLine.length > 200 ? firstLine.slice(0, 200) + '…' : firstLine || 'Handler failed.';
}
/**
 * Whether a deadline has passed, failing closed on anything unreadable.
 *
 * `new Date(x).getTime() <= now` is the obvious way to write this and it fails
 * open: an unparseable string yields `NaN`, and `NaN <= anything` is false. So a
 * credential whose `expiresAt` is malformed, truncated, or the empty string
 * never expires — and the worst instance is the commit-time recheck, which
 * exists precisely to stop a stale credential executing a write hours after the
 * human approved it.
 *
 * `unreadable` is reported separately from `expired` because a credential that
 * was never valid is not an expired one, and invariant 2 wants the reason a
 * reader can act on.
 */
function deadline(stamp, now) {
    const at = Date.parse(stamp);
    if (!Number.isFinite(at))
        return 'unreadable';
    return at <= now ? 'expired' : 'valid';
}
export class AgentPort {
    capabilities = new Map();
    options;
    policy;
    approvals;
    idempotency;
    refusalLimiter;
    approvalTtlMs;
    logger;
    clock;
    newRequestId;
    constructor(options, approvals = new InMemoryApprovalStore(), idempotency = new InMemoryIdempotencyStore(options.tenantId), 
    // Fourth and last, so the two stores that already had call sites keep theirs.
    // Optional and defaulted because the control must not be something a
    // merchant has to remember to switch on: a bound on durable refusal writes
    // that is absent by default is a flood. Supply a durable implementation to
    // share the budget across processes, the same reason `SqlApprovalStore`
    // exists alongside this one.
    refusalLimiter = new WindowedRefusalLimiter()) {
        // Validated at every layer that accepts one, and that redundancy is
        // deliberate. `SqlLedger` refuses an empty tenant, but the port is what
        // *stamps* the value, and with an in-memory or custom ledger the ledger's
        // guard never runs — so `tenantId: ''` would be a live, unattributable
        // tenant, with rows reading back as `''` and no error anywhere. The same
        // reasoning as the empty-`agentId` case in `record()`: `NOT NULL` admits
        // `''`, and absence is not identity.
        if (idempotency.tenantId !== undefined && idempotency.tenantId !== options.tenantId) {
            // Sharing one store across two ports used to be silently wrong rather
            // than refused: both ports claimed, completed and replayed through the
            // same rows, so one shop's intent id could return the other shop's stored
            // outcome — including the other shop's order id. Keying alone cannot
            // prevent that, because one instance can only be bound to one shop. The
            // mismatch is therefore a construction error, not a runtime surprise.
            throw new Error(`AgentPort for tenant "${options.tenantId}" was given an idempotency store bound to ` +
                `"${idempotency.tenantId}". One store serves one shop; give each port its own, or a ` +
                `store that scopes by tenant on every call.`);
        }
        if (!options.tenantId) {
            throw new Error('AgentPort requires a tenantId. An empty tenant is a shared tenant.');
        }
        this.options = options;
        this.approvals = approvals;
        this.idempotency = idempotency;
        this.refusalLimiter = refusalLimiter;
        this.approvalTtlMs = options.approvalTtlMs;
        this.policy = new PolicyEngine(options.policy ?? {}, options.clock);
        this.logger = options.logger ?? noopLogger;
        this.clock = options.clock ?? (() => new Date());
        this.newRequestId =
            options.requestId ??
                (() => `req_${this.clock().getTime().toString(36)}_${Math.random().toString(36).slice(2, 10)}`);
    }
    /**
     * Registers a capability. Anything not registered is unreachable by an
     * external agent, which is the point: exposure is an allowlist, not a filter.
     */
    expose(capability) {
        if (this.capabilities.has(capability.name))
            throw new Error(`Capability "${capability.name}" is already exposed.`);
        this.capabilities.set(capability.name, capability);
        return this;
    }
    /** DISCOVER. */
    manifest() {
        return buildManifest({
            business: this.options.business,
            baseUrl: this.options.baseUrl,
            capabilities: this.capabilities,
            policy: this.options.policy ?? {},
            now: this.clock(),
        });
    }
    /** Capability names, in manifest order. */
    names() {
        return [...this.capabilities.values()].map((c) => c.name).sort();
    }
    /**
     * IDENTIFY, AUTHORIZE, EXECUTE, PROVE for a single call.
     *
     * Returns a discriminated outcome rather than throwing, so a transport layer
     * can map each case to the right status code without string matching.
     */
    async invoke(request) {
        const requestId = this.newRequestId();
        const startedAt = Date.now();
        const identityCheck = this.identify(request.identity);
        const capability = this.capabilities.get(request.capability);
        if (!capability) {
            const known = this.names();
            // Bounded here, in the SDK, rather than in each transport: this package
            // is transport-agnostic and the next adapter inherits whatever the
            // previous one left clamped. The lookup above still used the caller's own
            // string — see `reportedCapabilityName`.
            const asked = reportedCapabilityName(request.capability);
            return this.refuse(requestId, request.identity, 'unknown_capability', `No capability named "${asked}" is registered. Available: ${known.length ? known.join(', ') : 'none'}.`, 'registration', startedAt, undefined, {}, undefined, asked);
        }
        if (identityCheck) {
            return this.refuse(requestId, request.identity, identityCheck.reason, identityCheck.detail, 'identity', startedAt, capability);
        }
        const identity = request.identity;
        const scope = `capability:${capability.name}`;
        if (!identity.scopes.includes(scope) && !identity.scopes.includes('*')) {
            return this.refuse(requestId, identity, 'insufficient_scope', `This credential is not scoped for ${scope}. It holds: ${identity.scopes.join(', ') || 'none'}.`, 'scope', startedAt, capability);
        }
        // The credential is in scope. The *user* may still have permitted less than
        // this call, and that check sits here — after "who are you", before anything
        // that reads the payload — because it is static, cheap, and cannot be moved
        // by input or policy state. Anything later would mean the handler could see
        // a request the user never delegated.
        const delegation = delegationDenial(identity, capability.access);
        if (delegation) {
            return this.refuse(requestId, identity, delegation.reason, delegation.detail, 'delegation', startedAt, capability);
        }
        // Validation runs here, after identity and scope and *before* policy, and
        // the position is the point. A payload that does not match the declared
        // shape can never be permitted, and invariant 3 says a request that can
        // never be permitted is not queued for a human — so evaluating policy first
        // would let a malformed order sit in someone's approval queue waiting for
        // a decision nobody can make correctly.
        //
        // It also sits before the handler for the reason the whole validator
        // exists: this binary holds the merchant's database credentials and turns
        // agent input into queries, so an unvalidated payload on this path is a
        // database injection rather than a type confusion.
        if (capability.input) {
            const issues = validateInput(capability.input, request.input);
            if (issues.length > 0) {
                return this.refuse(requestId, identity, 'validation_failed', `Input does not match what ${capability.name} accepts — ${describeIssues(issues)}. Nothing was executed and nothing was written.`, 'input_schema', startedAt, capability, {}, undefined, capability.name, request.intentId);
            }
        }
        // The reasoning for what a declared figure does to the caller's aliases lives
        // on `assemblePolicyInput`, which both the authorisation and the commit path
        // call. There is deliberately no merge logic left inline here to drift.
        //
        // It is called through `policyAssessment` because `policyInputFor` is
        // merchant code and can throw — a pricing service that is down, a query that
        // cannot connect. Calling it raw here let that throw escape `invoke()`, whose
        // whole contract is a discriminated outcome, carrying a driver's message —
        // routinely a connection string with a password — to a transport that exists
        // to stop exactly that, and leaving no ledger row at all for a request that
        // had already reached authorisation.
        const assessment = await this.policyAssessment(capability, request.input, identity);
        if (!assessment.ok) {
            return this.refusePolicyInputUnavailable({
                requestId,
                intentId: request.intentId,
                identity,
                capabilityName: capability.name,
                access: capability.access,
                capabilityRegistered: true,
                policyInput: {},
                parameters: request.input,
                startedAt,
            }, assessment.err);
        }
        const { policyInput, decision } = assessment;
        if (decision.outcome === 'deny') {
            return this.refuse(requestId, identity, decision.reason, decision.detail, decision.rule, startedAt, capability, policyInput, decision);
        }
        if (decision.outcome === 'require_approval') {
            const now = this.clock();
            const approval = {
                requestId,
                tenantId: this.options.tenantId,
                intentId: request.intentId,
                agentId: identity.agentId,
                capability: capability.name,
                // Raw, not redacted. This is operational state, not the audit record,
                // and a held write cannot be executed correctly from redacted input.
                // `record()` below is what redacts, on the way to the ledger.
                input: request.input,
                identity,
                createdAt: now.toISOString(),
                // Bounded. A human deciding days later must not execute a request that
                // was evaluated against policy and inventory as they were then.
                expiresAt: new Date(now.getTime() + (this.approvalTtlMs ?? 3_600_000)).toISOString(),
                reason: decision.detail,
            };
            await this.approvals.put(approval);
            await this.record({
                requestId,
                intentId: request.intentId,
                identity,
                capabilityName: capability.name,
                access: capability.access,
                capabilityRegistered: true,
                policyInput,
                decision,
                parameters: request.input,
                approval: { required: true },
                // A held request is a decision that has not yet produced a result.
                ledgerReason: 'approval_required',
                startedAt,
            });
            return { status: 'pending_approval', approval, requestId };
        }
        // Idempotency, for any capability with a side effect. Checked after
        // authorisation so a denial is still the answer an agent gets, and before
        // any effect, so the claim is a durable intent rather than a promise.
        if (request.intentId) {
            const fingerprint = await fingerprintOf(capability.name, request.input);
            const claimed = await this.idempotency.claim(request.intentId, fingerprint, this.clock().toISOString());
            if (!claimed) {
                const existing = await this.idempotency.get(request.intentId);
                if (existing && existing.fingerprint !== fingerprint) {
                    return this.refuse(requestId, identity, 'intent_conflict', `Intent "${request.intentId}" was already used for a different request. A new intent is required for different input.`, 'idempotency', startedAt, capability, policyInput, decision, 
                    // Positional, and the 10th slot is `requestedName`, not `intentId`.
                    // Passing the intent id there meant the row dropped `intentId` —
                    // the one field that makes a conflict legible — and would have put
                    // the intent id in the capability slot had `capability` been absent.
                    request.capability, request.intentId);
                }
                if (existing?.status === 'complete') {
                    // Replay of an effect that already happened. Deliberately not written
                    // to the ledger: one effect, one record. A retry is a transport event,
                    // not a decision, and a second row would double-count the write.
                    return {
                        status: 'ok',
                        data: existing.outcome,
                        requestId,
                        intentId: request.intentId,
                        replayed: true,
                    };
                }
                return { status: 'in_progress', requestId, intentId: request.intentId };
            }
        }
        // Authorised. Only now does the business's own code run.
        try {
            const data = await capability.execute(request.input, {
                identity,
                requestId,
                capability: capability.name,
                decision,
                hasScope: (s) => identity.scopes.includes(s) || identity.scopes.includes('*'),
                logger: this.logger,
            });
            await this.record({
                requestId,
                intentId: request.intentId,
                identity,
                capabilityName: capability.name,
                access: capability.access,
                capabilityRegistered: true,
                policyInput,
                decision,
                parameters: request.input,
                approval: { required: false, granted: true, approvedBy: 'policy' },
                result: 'ok',
                startedAt,
            });
            // Completed only after the ledger records the effect, so a crash between
            // the two leaves an unresolved intent rather than a silently replayable
            // one. Outside the handler's `try`, and swallowing its own failure, which
            // are the same decision: a completion that threw used to be caught by that
            // `catch` and recorded as `result: 'error'` for an effect that had already
            // happened — a false row on a table with no update path, followed by a
            // second completion that threw again, out of a method whose entire
            // contract is a discriminated outcome. The agent was told the payment
            // failed when it landed, and retried a write that must not be repeated.
            // Now the effect, its row and the completion each have exactly one
            // outcome, and a store that cannot be reached leaves the intent
            // `in_progress` — which a retry reports as such, rather than running the
            // handler a second time.
            await this.completeIntent(request.intentId, data);
            return { status: 'ok', data, requestId, intentId: request.intentId };
        }
        catch (err) {
            const message = errorMessage(err);
            await this.record({
                requestId,
                intentId: request.intentId,
                identity,
                capabilityName: capability.name,
                access: capability.access,
                capabilityRegistered: true,
                policyInput,
                decision,
                parameters: request.input,
                approval: { required: false, granted: true, approvedBy: 'policy' },
                result: 'error',
                error: message,
                startedAt,
            });
            // RELEASED, not completed. The two are not interchangeable, and this line
            // was the second instance of the bug the comment below describes.
            //
            // A `complete` row is replayed to every later caller as `status: 'ok'`
            // carrying `outcome` as its data (see the replay branch above). So
            // completing a FAILED handler with `{ error: message }` told the first
            // retry, and every one after, that the write had succeeded — with the
            // error message as the payload. An agent that timed out on a charge was
            // answered `ok`, stopped retrying, and told the customer they were billed.
            // They were not. The one thing this path must never do is answer a
            // question it cannot resolve with a lie.
            //
            // A handler that threw *may* have had a side effect before throwing, so
            // releasing lets a deliberate retry run it again. That ambiguity is real
            // and unresolvable from here: the SDK does not know the merchant's
            // transaction boundary, and an `intentId` cannot supply one it does not
            // have. What it can refuse to do is answer the question with a lie — the
            // first caller is told the write failed, so a retry is that caller's own
            // decision, and the ledger says so.
            //
            // Failing the other way is worse than ambiguous. A claim left in place
            // forever has no way out at all, since the table it lives in has no
            // update path, and a crash between claim and completion already produces
            // exactly that state. `releaseIntent` is best-effort and never throws; if
            // the store cannot be reached the intent stays `in_progress`, and a retry
            // is told `in_progress` — a state the agent can act on, rather than a
            // false `ok`.
            await this.releaseIntent(request.intentId);
            this.logger.warn('handler_error', { requestId, capability: capability.name, message });
            return { status: 'error', message, requestId, intentId: request.intentId };
        }
    }
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
    async approve(requestId, approvedBy) {
        const startedAt = Date.now();
        const approval = await this.approvals.get(requestId);
        if (!approval) {
            return {
                status: 'error',
                message: `No pending approval for ${requestId}.`,
                requestId,
            };
        }
        // The hold is namespaced to the shop that created it, and the check sits
        // here — before `consume()` and before the capability is resolved — on
        // purpose. Consuming first would let another shop destroy this pending
        // approval with a probe. Resolving first would be worse: the capability
        // would be looked up in *this* port's registry and the handler would run
        // here on the other shop's input, so the write would happen and the only
        // row describing it would carry this port's tenant.
        if (approval.tenantId !== this.options.tenantId) {
            return this.refuse(requestId, approval.identity, 'unauthenticated', `Approval ${requestId} was held for a different shop. A request is held, approved and executed by one tenant, so this is refused rather than answered.`, 'approval_tenant', this.clock().getTime(), undefined, {}, undefined, approval.capability, approval.intentId);
        }
        const capability = this.capabilities.get(approval.capability);
        if (!capability) {
            return {
                status: 'error',
                message: `Capability "${approval.capability}" is no longer exposed.`,
                requestId,
            };
        }
        // Re-apply the user's delegation before consuming, and for the same reason
        // the tenant check above runs before consuming: a commit that then refused
        // would have spent the operator's single-use approval on nothing, and the
        // caller would be left unable to retry a request that was never authorised.
        //
        // The delegation stored here is a frozen snapshot, so this cannot fire
        // today — `invoke()` already applied the ceiling and nothing can widen a
        // frozen grant. It is here so that the commit path is enforced *from* the
        // stored authority rather than merely continuing to trust the path that
        // created it, and so that adding commit-time re-resolution has one place to
        // land. A duplicated check across the two paths is the defect AGENTS.md
        // records for the policy-input merge, so there is exactly one function and
        // it is called from both.
        const delegation = delegationDenial(approval.identity, capability.access);
        if (delegation) {
            return this.refuse(requestId, approval.identity, delegation.reason, delegation.detail, 'delegation', this.clock().getTime(), capability, {}, undefined, approval.capability, approval.intentId);
        }
        // Consume before evaluating, and atomically. If this returns false the
        // approval was already spent, and the attempt is itself recorded — a replay
        // is evidence, not a no-op.
        if (!(await this.approvals.consume(requestId, approvedBy))) {
            await this.record({
                requestId,
                intentId: approval.intentId,
                identity: approval.identity,
                capabilityName: capability.name,
                access: capability.access,
                capabilityRegistered: true,
                policyInput: {},
                decision: {
                    outcome: 'deny',
                    reason: 'approval_rejected',
                    detail: `Approval for ${requestId} was already used. A held request executes at most once.`,
                    rule: 'single_use_approval',
                    evaluated: {},
                },
                parameters: approval.input,
                approval: { required: true, granted: false, approvedBy, at: this.clock().toISOString() },
                result: undefined,
                startedAt,
            });
            return {
                status: 'denied',
                reason: 'approval_rejected',
                rule: 'approval_already_consumed',
                detail: `Approval for ${requestId} was already used. A held request executes at most once.`,
                requestId,
            };
        }
        const identity = approval.identity;
        const now = this.clock();
        // A hold is a long-lived object and the world moves while it waits. The
        // credential may have expired and the approval may have outlived its own
        // usefulness.
        const heldExpiry = deadline(identity.expiresAt, now.getTime());
        if (heldExpiry !== 'valid') {
            const detail = heldExpiry === 'unreadable'
                ? `The credential that made ${requestId} has an unreadable expiry ("${identity.expiresAt}"). It cannot be shown to be current, so the request is refused rather than committed.`
                : `The credential that made ${requestId} expired at ${identity.expiresAt} while the request was held. The agent must request a new one.`;
            await this.record({
                requestId,
                intentId: approval.intentId,
                identity,
                capabilityName: capability.name,
                access: capability.access,
                capabilityRegistered: true,
                policyInput: {},
                decision: {
                    outcome: 'deny',
                    reason: 'identity_expired',
                    detail,
                    rule: 'identity_expiry',
                    evaluated: {},
                },
                parameters: approval.input,
                approval: { required: true, granted: false, approvedBy, at: now.toISOString() },
                startedAt,
            });
            return { status: 'denied', reason: 'identity_expired', rule: 'identity_expired', detail, requestId };
        }
        if (deadline(approval.expiresAt, now.getTime()) !== 'valid') {
            const detail = `This approval expired at ${approval.expiresAt}. Held requests are re-evaluated rather than executed late.`;
            await this.record({
                requestId,
                intentId: approval.intentId,
                identity,
                capabilityName: capability.name,
                access: capability.access,
                capabilityRegistered: true,
                policyInput: {},
                decision: {
                    outcome: 'deny',
                    reason: 'approval_rejected',
                    detail,
                    rule: 'approval_expiry',
                    evaluated: {},
                },
                parameters: approval.input,
                approval: { required: true, granted: false, approvedBy, at: now.toISOString() },
                startedAt,
            });
            return { status: 'denied', reason: 'approval_rejected', rule: 'approval_rejected', detail, requestId };
        }
        // Commit-time re-evaluation. This is the kill switch working: flipped while
        // the human was deciding, it stops the write here, and the refusal names the
        // rule that fired rather than reporting a generic failure.
        //
        // It is also a second, independent control, and it used not to be. The merge
        // below was inlined and differed from the one in `invoke()` — no
        // `policyInputFor`, no alias suppression — under a comment asserting the
        // difference "cannot be independently observable" because policy is frozen
        // at construction. It was observable and it was exploitable: the hold was
        // measured against the merchant's authoritative figure, and the commit was
        // measured against the caller's decoy, so a held request could be waved
        // through by a human and then charged over the ceiling. `assemblePolicyInput`
        // removes the possibility rather than fixing the instance.
        //
        // Not moved above `consume()`: rule 8 (`hitRateLimit`) mutates the engine's
        // windows, so evaluating twice charges one request two rate-limit slots.
        // Fail-closed, bounded, and recorded.
        //
        // `policyInputFor` is merchant code and it can throw — a pricing service that
        // is down, a query that cannot connect. The two call sites are one call to
        // `policyAssessment` for exactly that reason: `invoke()` used to call it raw,
        // so the same throw escaped a function whose contract is a discriminated
        // outcome, landed *after* the point where this path spends the approval, and
        // left no ledger row. `refusePolicyInputUnavailable` records it and says
        // nothing the driver said.
        const assessment = await this.policyAssessment(capability, approval.input, identity);
        if (!assessment.ok) {
            return this.refusePolicyInputUnavailable({
                requestId,
                intentId: approval.intentId,
                identity,
                capabilityName: capability.name,
                access: capability.access,
                capabilityRegistered: true,
                policyInput: {},
                parameters: approval.input,
                approval: { required: true, granted: false, approvedBy, at: now.toISOString() },
                startedAt,
            }, assessment.err);
        }
        const { policyInput, decision } = assessment;
        if (decision.outcome === 'deny') {
            const detail = `${decision.detail} (The request was held before this rule changed.)`;
            await this.record({
                requestId,
                intentId: approval.intentId,
                identity,
                capabilityName: capability.name,
                access: capability.access,
                capabilityRegistered: true,
                policyInput,
                decision: { ...decision, detail },
                parameters: approval.input,
                approval: { required: true, granted: false, approvedBy, at: now.toISOString() },
                startedAt,
            });
            this.logger.warn('approval_recheck_denied', { requestId, rule: decision.rule });
            return { status: 'denied', reason: decision.reason, rule: decision.rule, detail, requestId };
        }
        // A human approved the request, not the bypass. The recorded decision keeps
        // the human as the authority and the policy as the thing that was checked.
        const approved = {
            outcome: 'allow',
            reason: 'allowed',
            detail: `Approved by ${approvedBy}, re-checked against ${decision.rule}.`,
            rule: decision.rule,
            evaluated: decision.evaluated,
        };
        // Idempotency is re-checked here for the same reason policy is: a held write
        // may already have been executed by another path while it waited.
        if (approval.intentId) {
            const fingerprint = await fingerprintOf(capability.name, approval.input);
            const claimed = await this.idempotency.claim(approval.intentId, fingerprint, now.toISOString());
            if (!claimed) {
                const existing = await this.idempotency.get(approval.intentId);
                if (existing?.status === 'complete') {
                    // Replay of an effect that already happened — and only ever of an
                    // effect that happened, because `complete` is written on the success
                    // path alone. See `completeIntent`.
                    return {
                        status: 'ok',
                        data: existing.outcome,
                        requestId,
                        intentId: approval.intentId,
                        replayed: true,
                    };
                }
                return { status: 'in_progress', requestId, intentId: approval.intentId };
            }
        }
        try {
            // Raw input, as the agent sent it. Redaction belongs on the ledger path.
            const data = await capability.execute(approval.input, {
                identity,
                requestId,
                capability: capability.name,
                decision: approved,
                hasScope: (s) => identity.scopes.includes(s) || identity.scopes.includes('*'),
                logger: this.logger,
            });
            await this.record({
                requestId,
                intentId: approval.intentId,
                identity,
                capabilityName: capability.name,
                access: capability.access,
                capabilityRegistered: true,
                policyInput,
                decision: approved,
                parameters: approval.input,
                approval: { required: true, granted: true, approvedBy, at: now.toISOString() },
                result: 'ok',
                startedAt,
            });
            await this.completeIntent(approval.intentId, data);
            return { status: 'ok', data, requestId, intentId: approval.intentId };
        }
        catch (err) {
            const message = errorMessage(err);
            await this.record({
                requestId,
                intentId: approval.intentId,
                identity,
                capabilityName: capability.name,
                access: capability.access,
                capabilityRegistered: true,
                policyInput,
                decision: approved,
                parameters: approval.input,
                approval: { required: true, granted: true, approvedBy, at: now.toISOString() },
                result: 'error',
                error: message,
                startedAt,
            });
            // Released, exactly as on the authorisation path and for the same reasons:
            // a completed claim is replayed as a success, and a human who approved a
            // write that then failed must be able to approve a fresh attempt rather
            // than be handed a permanent, replayed `ok` for a write that never
            // happened. The approval itself is still single-use — `consume()` above is
            // not undone — so this is the *intent* becoming retryable, not the human's
            // decision being reusable.
            await this.releaseIntent(approval.intentId);
            this.logger.warn('handler_error', { requestId, capability: capability.name, message });
            return { status: 'error', message, requestId, intentId: approval.intentId };
        }
    }
    /**
     * Marks an intent as having produced `outcome`, and the only caller that
     * writes `complete`. Never throws, and the swallowing is the point: it runs
     * outside the handler's `try` precisely so that a store failure cannot be
     * mistaken for a handler failure. A false `result: 'error'` row for an effect
     * that landed is unrecoverable on a table with no update path, and throwing
     * would replace a wrong-but-returned outcome with an exception out of a
     * method that promises a discriminated one.
     */
    async completeIntent(intentId, outcome) {
        if (!intentId)
            return;
        try {
            // Redacted on the way in, not on the way out.
            //
            // This store is the second half of PROVE, not a scratch pad: it is a
            // durable table with no update path and no expiry, read by operators and
            // carried in every backup. The ledger redacts because it is read by people
            // who did not make the request, and this has the same readership and a
            // longer life.
            //
            // It became a leak when handlers could return a third-party API body. A
            // SQL handler returned `{ rows }` — the merchant's own tables, which they
            // can see anyway. An http handler returns whatever the upstream said,
            // which can carry a card token or a session cookie verbatim, and
            // `agentport_intents.outcome` was storing all of it in the clear. Found
            // by running a capability against a real API whose response carried the
            // merchant's own `authorization` echo, and reading the row back.
            await this.idempotency.complete(intentId, redact(outcome), this.clock().toISOString());
        }
        catch (err) {
            // The intent stays `in_progress`, so a retry is answered as
            // `in_progress` — the agent waits and reads the stored outcome rather than
            // running a second charge. The caller's answer stays `ok`, because the
            // effect did happen.
            this.logger.warn('intent_completion_failed', {
                intentId,
                message: errorMessage(err),
            });
        }
    }
    /**
     * Hands a claim back so the work can be retried, and the only caller of
     * `release`. Never throws: the caller is already being told the write failed,
     * and a claim that cannot be released is reported as stuck by the next retry
     * reading `in_progress` — which is a state the caller can act on, where an
     * exception is not.
     */
    async releaseIntent(intentId) {
        if (!intentId)
            return;
        try {
            await this.idempotency.release(intentId);
        }
        catch (err) {
            this.logger.warn('intent_release_failed', { intentId, message: errorMessage(err) });
        }
    }
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
    refusalBudgetSpent(requestId, capabilityName, identity) {
        if (this.refusalLimiter.admit(refusalBudgetKey(identity), this.clock().getTime()))
            return undefined;
        this.logger.warn('refusal_budget_exhausted', {
            requestId,
            capability: capabilityName,
            agentId: identity?.agentId || 'unidentified',
        });
        return {
            status: 'denied',
            reason: 'rate_limited',
            rule: 'refusal_budget_exhausted',
            detail: 'This caller has already been refused more times in the last minute than the ledger will ' +
                'record, so this refusal is not written. The refusals before it are in the ledger; the rule ' +
                'that would have answered this one is not, because a flood of refusals is a disk write flood. ' +
                'Retry once the window resets.',
            requestId,
        };
    }
    /**
     * Returns a denial outcome and records it. PROVE covers refusals too.
     *
     * Every refusal is recorded, including the ones raised before a capability
     * has been resolved. An agent probing for a capability that does not exist is
     * exactly the behaviour a merchant needs to see, so it cannot also be the
     * one case that leaves no trace — bounded by the refusal budget below, which
     * is the only thing standing between that and an unbounded table.
     */
    async refuse(requestId, identity, reason, detail, rule, startedAt, capability, policyInput = {}, decision, requestedName = 'unknown', intentId) {
        const spent = this.refusalBudgetSpent(requestId, capability?.name ?? requestedName, identity);
        if (spent)
            return spent;
        // A refusal is recorded as a refusal, whatever decision the caller passed
        // in. The decision argument exists so the rule that refused can be named,
        // and passing the whole thing through meant the one caller with a reason
        // to pass it — the idempotency conflict, where the request genuinely *was*
        // permitted by policy and then refused on a different ground — wrote
        // `decision: 'allow', reason: 'allowed', rule: 'default', detail: 'Permitted
        // by policy.'` for a request the caller had just been told was denied. The
        // ledger and the caller disagreed about a decision, on a table with no
        // update path, and the schema's contradiction CHECKs could not catch it
        // because the row is internally consistent — it just describes a different
        // event than the one that happened.
        //
        // Rebuilt from the refusal's own fields, so no call site can make the
        // outcome disagree with the reason. `evaluated` is carried through when
        // the policy engine measured something, because a refusal with no numbers
        // is a refusal nobody can reconstruct.
        const measured = decision?.evaluated ?? {};
        await this.record({
            requestId,
            intentId,
            identity,
            capabilityName: capability?.name ?? requestedName,
            access: capability?.access,
            capabilityRegistered: Boolean(capability),
            policyInput,
            decision: {
                outcome: reason === 'approval_required' ? 'require_approval' : 'deny',
                reason,
                detail,
                rule,
                evaluated: measured,
            },
            parameters: {},
            result: undefined,
            startedAt,
        });
        return { status: 'denied', reason, rule, detail, requestId };
    }
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
    async policyAssessment(capability, input, identity) {
        try {
            const policyInput = assemblePolicyInput(capability, input);
            return {
                ok: true,
                policyInput,
                // The identity, not `identity.agentId`. Both the request path and the
                // commit path call this, and the key has to be assurance-gated in one
                // place — a duplicated key derivation across those two paths is the
                // structural defect AGENTS.md records for the policy-input merge, and it
                // would be rotatable in exactly the same way if only one call site were
                // corrected.
                decision: this.policy.evaluate(capability, refusalBudgetKey(identity), policyInput),
            };
        }
        catch (err) {
            return { ok: false, err };
        }
    }
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
    async refusePolicyInputUnavailable(input, err) {
        // Budgeted like every other refusal, and it has to be: a pricing service
        // that is down makes *every* request refuse with this, so it is a
        // pre-authorisation flood source reached with a perfectly valid credential.
        // The merchant's own log gets every occurrence regardless — the budget
        // bounds the ledger, not the diagnosis.
        const spent = this.refusalBudgetSpent(input.requestId, input.capabilityName, input.identity);
        if (spent)
            return spent;
        await this.record({ ...input, decision: POLICY_INPUT_UNAVAILABLE });
        this.logger.warn('policy_input_failed', {
            requestId: input.requestId,
            capability: input.capabilityName,
            error: errorMessage(err),
        });
        return {
            status: 'denied',
            reason: POLICY_INPUT_UNAVAILABLE.reason,
            rule: POLICY_INPUT_UNAVAILABLE.rule,
            detail: POLICY_INPUT_UNAVAILABLE.detail,
            requestId: input.requestId,
        };
    }
    identify(identity) {
        if (!identity || !identity.agentId) {
            return { reason: 'unauthenticated', detail: 'No verified agent identity was presented.' };
        }
        const expiry = deadline(identity.expiresAt, this.clock().getTime());
        if (expiry === 'unreadable') {
            return {
                reason: 'unauthenticated',
                detail: `The credential expiry "${identity.expiresAt}" is not a valid timestamp. A credential that cannot be read cannot be shown to be current, so it is treated as no credential.`,
            };
        }
        if (expiry === 'expired') {
            return {
                reason: 'identity_expired',
                detail: `The credential expired at ${identity.expiresAt}. Request a new short-lived token.`,
            };
        }
        return undefined;
    }
    async record(input) {
        // Never throws. `record()` is called from inside the handler's `try`, so a
        // failure here was recorded as a handler failure and then re-thrown out of
        // `invoke()` — a side effect that had already happened, a durable row
        // saying `result: 'error'`, and an exception where the transport contract
        // promises a discriminated outcome. The agent retries, and the write
        // happens a second time, which is the exact failure the idempotency store
        // exists to prevent.
        //
        // Swallowing is a real trade, not a free win: a lost row is a lost row, and
        // the honest answer — an outcome that says the effect succeeded and the
        // record was lost — is one this package has declined to add. `ExecuteOutcome`
        // gains no variant; it is a union integrators switch exhaustively, and a new
        // refusal reason is not free either, because `reason` is frozen into
        // `CHECK (reason IN (...))` in a table created with `CREATE TABLE IF NOT
        // EXISTS` — widening the union silently breaks every deployed ledger, and
        // the resulting insert failure is swallowed by this very catch. So whether a
        // lost row should refuse the write instead is an open product question about
        // what an operator promises their own customers, not something to settle in
        // a comment. What is settled here: the failure is loud and attributable, so
        // "did we execute a write we cannot prove?" is answerable.
        try {
            await this.appendRow(input);
        }
        catch (err) {
            this.logger.warn('ledger_append_failed', {
                requestId: input.requestId,
                // Who and what, not just what failed. An operator holding only
                // `requestId` cannot reconstruct the decision, and the question this log
                // exists to answer is whether a write happened that no row describes.
                agentId: input.identity?.agentId ?? 'unidentified',
                assurance: input.identity?.assurance ?? 'unverified',
                capability: input.capabilityName,
                outcome: input.decision.outcome,
                reason: input.ledgerReason ?? input.decision.reason,
                rule: input.decision.rule,
                // Two fields, not one boolean, and this split was itself a bug once
                // already: `approval !== undefined` is true for *every* decision because
                // the record is `{required: false}` on an ordinary allow, so the single
                // flag read `true` on a routine read and could not distinguish "a human
                // approved this write" from "no human was involved" — which is the only
                // distinction that matters when the row is missing. `granted` is the one
                // that answers "did a payment happen with no record of who allowed it".
                approvalRequired: input.approval?.required === true,
                approvalGranted: input.approval?.granted === true,
                // `granted` is NOT "a human said yes": an ordinary allow records
                // `{required: false, granted: true, approvedBy: 'policy'}` because policy
                // permitted it without asking anyone. `approvedBy` is therefore the field
                // that separates a routine read from a payment a person authorised, and it
                // is the one an operator needs when reconciling against a statement.
                approvalBy: input.approval?.approvedBy ?? null,
                result: input.result ?? null,
                message: errorMessage(err),
            });
        }
    }
    async appendRow(input) {
        await this.options.ledger.append({
            tenantId: this.options.tenantId,
            requestId: input.requestId,
            at: this.clock().toISOString(),
            // `||` rather than `??`, because an empty string is just as unattributable
            // as a missing one and `agentId` is NOT NULL in the schema, so `''` sails
            // straight through the database and lands in the record as a row nobody
            // can trace. An empty name is not an identity.
            agentId: input.identity?.agentId || 'unidentified',
            // A request that arrived with no identity at all is recorded as
            // unverified. This is the fallback that used to be missing: the field was
            // optional, absent meant `verified` per the old comment, and the caller
            // least able to vouch for itself was logged as the one it could vouch
            // for. `agentId: 'unidentified'` and `assurance: 'unverified'` are the
            // same statement, and both have to be true.
            assurance: input.identity?.assurance ?? 'unverified',
            configHash: this.options.configHash,
            intentId: input.intentId,
            onBehalfOfUserId: input.identity?.onBehalfOf?.userId,
            // Stamped from the same object the ceiling above was read from, so the row
            // cannot claim an authority the evaluation did not apply.
            onBehalfOfScope: input.identity?.onBehalfOf?.scope,
            capability: input.capabilityName,
            access: input.access,
            capabilityRegistered: input.capabilityRegistered,
            parameters: redact(input.parameters),
            decision: input.decision.outcome,
            reason: input.ledgerReason ?? input.decision.reason,
            rule: input.decision.rule,
            detail: input.decision.detail,
            // The numbers that fired the rule, kept in the row. A refusal that cannot
            // be reconstructed is a refusal the merchant has to take on trust.
            evaluated: input.decision.evaluated,
            approval: input.approval,
            result: input.result,
            error: scrubFreeText(String(input.error ?? '')),
            durationMs: Math.max(0, Date.now() - input.startedAt),
        });
    }
}
/**
 * The refusal for a request whose authoritative figures could not be produced.
 *
 * One object, not one string per call site. The detail is fixed text: the
 * driver's own message is the least controlled input in the system and
 * routinely carries a connection string with a password, and this is what a
 * caller and a ledger reader see.
 */
const POLICY_INPUT_UNAVAILABLE = {
    outcome: 'deny',
    reason: 'policy_denied',
    detail: 'The capability could not report its own authoritative figures, so the policy decision could not be made. Nothing was executed. This is a fault in the capability wiring or in a service it depends on, not a refusal of the order.',
    rule: 'policy_input_unavailable',
    evaluated: {},
};
/**
 * Pulls the values policy rules read out of a request payload. Denormalising
 * here means a policy never has to understand a capability's input shape.
 *
 * The key lists are `policy.ts`'s, not copies of them: the merge in
 * `assemblePolicyInput` has to know exactly which keys constitute an amount and
 * which a unit count, and a second copy of either is a way for the merge and
 * the rules to disagree about what a figure is.
 */
function extractPolicyInput(input) {
    if (!input || typeof input !== 'object')
        return {};
    const source = input;
    const items = Array.isArray(source.items) ? source.items : [];
    const out = {};
    for (const key of [...POLICY_AMOUNT_KEYS, ...POLICY_UNIT_KEYS])
        if (source[key] !== undefined)
            out[key] = source[key];
    if (out.units === undefined && items.length) {
        out.units = items.reduce((sum, i) => sum + (typeof i.quantity === 'number' ? i.quantity : 0), 0);
    }
    return out;
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
export function delegationDenial(identity, access) {
    const delegation = identity.onBehalfOf;
    if (!delegation)
        return undefined;
    // 'read' permits reads. 'write' and 'full' both imply reads — someone who may
    // change a thing may certainly look at it — so only one pairing denies.
    if (delegation.scope !== 'read' || access !== 'write')
        return undefined;
    return {
        reason: 'delegation_insufficient',
        detail: `The credential is in scope for this capability, but ${delegation.userId} delegated ` +
            `read-only access on ${identity.credentialId}, and this is a write. The delegation is a ` +
            `ceiling on the agent, so a wider credential cannot widen it. Nothing was executed and ` +
            `nothing was written.`,
    };
}
/**
 * Assembles the policy input for a request. There is exactly one of these, and
 * both the authorisation path and the commit path call it.
 *
 * That single call site is the fix, not a tidiness preference. The commit path
 * used to inline its own merge — `extractPolicyInput` plus the static
 * `policyInput`, with no call to `policyInputFor` and no alias suppression —
 * while a comment above it explained that the line was "symmetry, not an
 * independently observable control" and could not be. It was a different merge,
 * and it was exploitable: a request held for approval was re-measured against
 * the caller's own decoy key at commit time, so a ceiling that correctly held
 * the request in `invoke()` was then bypassed by the human saying yes. The
 * comment was the more dangerous half — a later reader would have deleted the
 * merge on the strength of a false claim.
 *
 * Two rules, both load-bearing:
 *
 * 1. A figure the merchant computed per request overrides the caller's payload.
 *    `readAmount` consults `amountMinor` before `total`, and every one of those
 *    keys is caller-writable, so a merge that let the payload win measured
 *    whatever the caller sent. Measured: 500,000 charged under a 100,000
 *    `absoluteMaxOrderValue`, by sending `{ total: 500_000, amountMinor: 0 }`.
 *
 * 2. A declared figure *suppresses* the payload aliases for that measurement
 *    rather than merely outranking them, and it suppresses them whether or not
 *    the declared key is one the rules read. Outranking leaves the caller's
 *    value in the object, and any future rule that reads the object directly
 *    would read it. Suppressing unconditionally is what makes the fail-closed
 *    check in `PolicyEngine` mean anything: a resolver that returns `undefined`
 *    for a catalogue miss, or returns a figure under a name no rule reads, then
 *    leaves the measurement genuinely absent instead of quietly falling back to
 *    a number the caller chose — which is the bypass, because
 *    `amount_unmeasurable` denies and a fallback to `amountMinor: 0` does not.
 *    Measured: `policyInputKeys: ["grandTotal"]` suppressing nothing, a 500,000
 *    order passing a 100,000 ceiling, and the ledger row reading
 *    `rule: 'default'` with `evaluated.amount: 0`.
 *
 * And one that decides between them rather than merging both: **a capability
 * with a `policyInputFor` has no `policyInput`.** Spreading the static record
 * under the resolver's result meant a resolver that returned `{}` — a branch the
 * *caller* selects, by sending a sku the merchant did not special-case — left the
 * constant as the measured figure. `policyInput: { total: 100 }` beside a
 * 100,000 ceiling, a resolver that only knows a `CHEAP` sku, and a request for
 * anything else: allowed, charged 500,000, and the row reading
 * `evaluated.amount: 100`. A constant is the same number on every request, so any
 * figure it supplies is a number the transaction did not produce; a capability
 * that has a real source must not also have the constant, and dropping the static
 * one outright is what makes the combination non-load-bearing rather than a
 * configuration that silently does the wrong thing.
 */
function assemblePolicyInput(capability, input) {
    const declared = capability.policyInputFor
        ? capability.policyInputFor(input)
        : (capability.policyInput ?? {});
    const policyInput = {
        ...extractPolicyInput(input),
        ...declared,
    };
    // `declares` is what makes suppression unconditional. A capability that
    // declares a figure for *some* measurement has claimed authorship of the ones
    // it did not name too: it is not the case that an unreadable declared key
    // leaves the caller's aliases in charge. Keying suppression on whether the
    // declared key happens to be a recognised alias is what let `grandTotal` and
    // `discountPct` through, and a merchant can pick any name at all.
    const declares = capability.policyInputFor !== undefined || Object.keys(declared).length > 0;
    for (const keys of [POLICY_AMOUNT_KEYS, POLICY_UNIT_KEYS]) {
        const names = keys.some((k) => k in declared);
        if (!names && !declares)
            continue;
        for (const key of keys)
            if (!(key in declared))
                delete policyInput[key];
    }
    return policyInput;
}
/**
 * Stable digest of a request, so the same intent id reused for different work is
 * detectable rather than silently replayed.
 *
 * SHA-256 via Web Crypto rather than a hand-rolled hash: `globalThis.crypto` is
 * a platform global in Node 20 and Workers, so this costs no dependency. A
 * non-cryptographic hash would collide, and a collision replays the wrong
 * outcome, which is the failure the fingerprint exists to prevent.
 */
async function fingerprintOf(capability, input) {
    return sha256Hex(stableStringify({ capability, input }));
}
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
export async function configDigest(config) {
    return `sha256:${(await sha256Hex(stableStringify(config))).slice(0, 16)}`;
}
// Re-exported so `artifact.ts` keeps its existing import. The implementation
// lives in `ledger.ts` beside the row digest, because two canonicalisers is
// how a digest stops agreeing with the value it names.
export { stableStringify };
//# sourceMappingURL=agent.js.map
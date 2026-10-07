const allow = (rule, evaluated = {}) => ({
    outcome: 'allow',
    reason: 'allowed',
    detail: 'Permitted by policy.',
    rule,
    evaluated,
});
/** The decision shape returned for a non-allow outcome. */
function refuse(outcome, reason, detail, rule, evaluated = {}) {
    return { outcome, reason, detail, rule, evaluated };
}
/**
 * Policy evaluation.
 *
 * The order below is deliberate and load-bearing. Denials are evaluated before
 * approvals so that a request which can never be permitted is never queued for
 * a human to approve, and the kill switch is evaluated before everything so it
 * cannot be outranked by a permissive rule.
 */
export class PolicyEngine {
    policy;
    windows = new Map();
    clock;
    /**
     * Ceiling on `windows`, so a caller cannot grow the table without bound by
     * presenting distinct keys. The refusal limiter beside it in `agent.ts` hit
     * exactly this — the table is keyed on a string that is attacker-influenced
     * unless the caller gates it on assurance — and records that a missing cap on
     * the authorization path is a denial of service, not a memory detail. Same
     * eviction direction: forgetting a key restores that caller's budget rather
     * than pushing a legitimate holder's window out and silencing it.
     */
    keyCap;
    constructor(policy = {}, clock = () => new Date(), keyCap = 10_000) {
        this.policy = policy;
        this.clock = clock;
        this.keyCap = keyCap;
    }
    /** Capability names this policy will always queue for a human. */
    approvalRequired() {
        return [...new Set(this.policy.alwaysRequireApproval ?? [])];
    }
    evaluate(capability, budgetKey, policyInput) {
        const p = this.policy;
        // 1. Kill switch outranks every other rule.
        if (p.emergencyKillSwitch) {
            return refuse('deny', 'policy_denied', capability.access === 'write'
                ? 'Writes are disabled while the emergency kill switch is active.'
                : 'Reads are audit-only while the emergency kill switch is active.', 'emergency_kill_switch');
        }
        // 2. Explicit prohibition.
        if (p.forbiddenCapabilities?.includes(capability.name)) {
            return refuse('deny', 'policy_denied', `The business has forbidden external agents from calling ${capability.name}.`, 'forbidden_capabilities');
        }
        // 3. Data classification. An agent may not read a class the business
        //    restricted, regardless of whether the capability is exposed.
        if (capability.access === 'read' &&
            capability.dataClass &&
            p.restrictedDataClasses?.includes(capability.dataClass))
            return refuse('deny', 'policy_denied', `External agents may not read data classified as ${capability.dataClass}.`, 'restricted_data_classes', { dataClass: capability.dataClass });
        const amount = readAmount(policyInput);
        const units = readUnits(policyInput);
        // 3.5 A ceiling that cannot measure its own figure is not a ceiling.
        //
        // Rules 4 and 5 are guarded by `amount !== undefined`, which reads as
        // defensive but is the defect: an amount the engine cannot read does not
        // fail the ceiling, it skips it, and evaluation falls through to `allow` at
        // the end. A merchant who configured a limit and sees a request allowed
        // cannot tell that limit never ran, and the ledger row agrees — it reads
        // `rule: 'default'`, `detail: 'Permitted by policy.'`, `evaluated: {}`.
        //
        // The figure is unmeasurable in ordinary, non-malicious situations. A
        // `policyInputFor` resolver returns `undefined` for a catalogue miss. A
        // payload sends `"total": "5000"` as a string and `readAmount` will not
        // coerce it. A config-file capability gets its price from the merchant's
        // database and the caller never sends one at all. In each case the ceiling
        // was configured, the amount was unreadable, and the request was allowed.
        //
        // `deny` rather than `require_approval`: a human cannot approve an unknown
        // amount. The question put to the reviewer is "is this over the limit?" and
        // the honest answer is "I do not know what the amount is" — a rubber stamp,
        // not an authority (AGENTS.md invariant 3). The `rule` is distinct from the
        // over-limit rules so a reader can tell "you charged too much" from "we
        // could not tell what this cost", and the detail says which, because the
        // second is a wiring fault the business can fix and the first is not.
        // The ceilings are configured on the policy, which every capability shares,
        // so "a ceiling exists" is not by itself a claim that *this* capability
        // carries an order. A read, and a write that moves no money, have no amount
        // to measure and are not what the merchant was bounding. `access === 'write'`
        // is the gate rather than `dataClass === 'payment'` because the latter is a
        // merchant-chosen label nothing verifies, so gating on it can be escaped by
        // relabelling a payment write; `ceilingExempt` covers the writes that are
        // legitimately not orders. See `Policy.ceilingExempt`.
        const ceilingApplies = capability.access === 'write' && !p.ceilingExempt?.includes(capability.name);
        if (amount === undefined && ceilingApplies && (p.absoluteMaxOrderValue || p.maxOrderValue)) {
            const ceiling = p.absoluteMaxOrderValue ?? p.maxOrderValue;
            const kind = p.absoluteMaxOrderValue ? 'absolute limit' : 'approval threshold';
            return refuse('deny', 'policy_denied', `This capability is configured with an order ${kind}, but the order amount could not be established, so the ${kind} could not be checked. Nothing was executed. This is a fault in how the capability is wired, not a refusal of the order.`, 'amount_unmeasurable', { ceiling: kind, limit: ceiling?.minor, currency: ceiling?.currency, measured: false });
        }
        // Same defect in the units rule, and it is the same defect: `units !==
        // undefined` in the guard below means a bulk threshold a request cannot be
        // measured against is decorative. Fixing only the money rules leaves the
        // identical hole one rule below.
        if (units === undefined && ceilingApplies && p.bulkOrderThreshold) {
            return refuse('deny', 'policy_denied', 'This capability is configured with a bulk order threshold, but the unit count could not be established, so the threshold could not be checked. Nothing was executed. This is a fault in how the capability is wired, not a refusal of the order.', 'units_unmeasurable', {
                threshold: p.bulkOrderThreshold.units,
                measured: false,
            });
        }
        // 4. Hard ceiling denies outright. Never queued for approval.
        //
        //    Gated on `access === 'write'` and deliberately *not* on
        //    `ceilingApplies`: `ceilingExempt` waives the measurability
        //    requirement, it does not waive the ceiling, so an exempt write that
        //    does report an amount is still measured against it.
        //
        //    The `!== undefined` conjunct is kept only for narrowing. It is not
        //    what makes the rule safe — a comparison against `undefined` is false
        //    anyway. Rule 3.5 is what makes it safe.
        if (capability.access === 'write' &&
            p.absoluteMaxOrderValue &&
            amount !== undefined &&
            amount > p.absoluteMaxOrderValue.minor)
            return refuse('deny', 'policy_denied', `Order of ${amount} minor units (${p.absoluteMaxOrderValue.currency}) exceeds the absolute limit of ${p.absoluteMaxOrderValue.minor} minor units. This cannot be approved.`, 'absolute_max_order_value', { amount, limit: p.absoluteMaxOrderValue.minor, unit: 'minor' });
        // 5. Soft ceiling queues for a human.
        if (capability.access === 'write' &&
            p.maxOrderValue &&
            amount !== undefined &&
            amount > p.maxOrderValue.minor)
            return refuse('require_approval', 'approval_required', `Order of ${amount} minor units (${p.maxOrderValue.currency}) is above the ${p.maxOrderValue.minor} minor unit approval threshold.`, 'max_order_value', { amount, threshold: p.maxOrderValue.minor, unit: 'minor' });
        // 6. Bulk orders. The `units !== undefined` conjunct is kept only for
        //    narrowing; as in rules 4 and 5, a comparison against `undefined` is
        //    false, and rule 3.5 is what makes the rule safe.
        if (capability.access === 'write' && p.bulkOrderThreshold && units !== undefined && units >= p.bulkOrderThreshold.units)
            return refuse('require_approval', 'approval_required', `Order of ${units} units meets the bulk threshold of ${p.bulkOrderThreshold.units}.`, 'bulk_order_threshold', { units, threshold: p.bulkOrderThreshold.units });
        // 7. Approval declared on the capability itself, or by policy.
        if (capability.requiresApproval || p.alwaysRequireApproval?.includes(capability.name))
            return refuse('require_approval', 'approval_required', `${capability.name} requires human approval before it runs.`, capability.requiresApproval ? 'capability_requires_approval' : 'always_require_approval');
        // 8. Rate limit last, so it only ever throttles requests that would
        //    otherwise have been permitted.
        if (p.rateLimit) {
            const window = this.hitRateLimit(budgetKey, capability);
            if (window)
                return refuse('deny', 'rate_limited', `Rate limit of ${p.rateLimit.requestsPerMinute} requests/minute exceeded. Retry in ${window}s.`, 'rate_limit', { limit: p.rateLimit.requestsPerMinute, retryAfterSeconds: window });
        }
        // `allow` was the one outcome that recorded nothing. A row reading
        // `evaluated: {}` under a configured ceiling is indistinguishable from a row
        // where no ceiling was set, so a merchant holding an allow could not tell
        // whether the rule was measured and passed or — before rule 3.5 — skipped
        // entirely. The refusal paths already recorded their numbers; this closes
        // the other half of the ledger's job (AGENTS.md invariant 5).
        const evaluated = {};
        if (p.absoluteMaxOrderValue || p.maxOrderValue) {
            const ceiling = p.absoluteMaxOrderValue ?? p.maxOrderValue;
            evaluated.amount = amount;
            evaluated.limit = ceiling?.minor;
            evaluated.currency = ceiling?.currency;
        }
        if (p.bulkOrderThreshold) {
            evaluated.units = units;
            evaluated.threshold = p.bulkOrderThreshold.units;
        }
        return allow('default', evaluated);
    }
    /**
     * Sliding window per agent (or per agent+capability). Returns the number of
     * seconds until reset when the limit is hit, otherwise undefined.
     *
     * `budgetKey` is not an agent name. It is the caller's assurance-gated budget
     * key (`refusalBudgetKey`), which collapses every unverified identity to one
     * shared bucket. Keying this on `agentId` directly meant the limit was
     * rotatable: `identify()` checks only that a name is present and unexpired,
     * never `assurance`, so any transport that resolves an agent name from a
     * header or a session handed a prober a fresh window per name and the
     * configured `rateLimit` bounded nothing.
     */
    hitRateLimit(budgetKey, capability) {
        const limit = this.policy.rateLimit;
        if (!limit)
            return undefined;
        const key = limit.scope === 'capability' ? `${budgetKey}:${capability.name}` : budgetKey;
        const now = this.clock().getTime();
        const windowMs = 60_000;
        const existing = this.windows.get(key);
        if (!existing || existing.resetAt <= now) {
            // Evict before inserting a *new* key, so the table cannot exceed the cap.
            // Guarding on `!this.windows.has(key)` rather than on `!existing` is
            // load-bearing: an expired window is present but stale, and re-inserting it
            // does not grow the table. Without the guard, a caller holding any single
            // expired key could evict one unrelated key per minute indefinitely —
            // unbounded eviction pressure to *avoid* a single eviction. That is what
            // `RefusalLimiter.admit` already does; the two limiters must not diverge.
            if (!this.windows.has(key)) {
                while (this.windows.size >= Math.max(1, this.keyCap)) {
                    const oldest = this.windows.keys().next();
                    if (oldest.done)
                        break;
                    this.windows.delete(oldest.value);
                }
            }
            this.windows.set(key, { count: 1, resetAt: now + windowMs });
            return undefined;
        }
        if (existing.count >= limit.requestsPerMinute) {
            return Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
        }
        existing.count += 1;
        return undefined;
    }
}
/**
 * The keys an amount is read from, in precedence order.
 *
 * Exported because the other files have to consult exactly this list and must
 * not keep their own copy of it: `extractPolicyInput` and `assemblePolicyInput`
 * in `agent.ts` denormalise a payload into these keys and suppress them,
 * `policyInputResolver` in `capabilities.ts` refuses a declared figure this list
 * does not contain, and `doctor` in `config.ts` reports the same ones.
 *
 * Duplication is not tidiness here. A key the rules read but the merge does not
 * suppress is a bypass: the caller supplies it and `readAmount` measures it in
 * preference to the merchant's own figure. A key the merge suppresses but the
 * rules never read is the same control silently measuring nothing. Both were
 * live at once when this list existed as a second copy in two files.
 */
export const POLICY_AMOUNT_KEYS = ['amountMinor', 'amount', 'total', 'orderTotal', 'price'];
/** The keys a unit count is read from, in precedence order. See `POLICY_AMOUNT_KEYS`. */
export const POLICY_UNIT_KEYS = ['units', 'quantity', 'itemCount'];
/**
 * Whether a declared figure is one any policy rule can actually measure.
 *
 * A capability that declares `grandTotal` has declared nothing the ceiling can
 * read. That used to be caught per request — the caller's aliases survived the
 * merge and were measured instead, so a 500,000 order passed a 100,000 ceiling
 * — and is now refused at build time, which is where a merchant can act on it.
 */
export function isPolicyFigureKey(key) {
    const keys = [...POLICY_AMOUNT_KEYS, ...POLICY_UNIT_KEYS];
    return keys.includes(key);
}
/**
 * The same vocabulary, formatted for a message a merchant has to act on.
 *
 * Derived rather than written out, because a message listing keys the engine no
 * longer reads is this file's defect class one level up: it tells a merchant
 * `total` works when the build refuses it, and it disagrees with the code it is
 * generated from. Two hand-written enumerations of this list already existed.
 */
export function figureKeyVocabulary() {
    const quoted = (keys) => keys.map((k) => `"${k}"`).join(', ');
    return (`an amount as one of ${quoted(POLICY_AMOUNT_KEYS)} (in the currency's minor unit) ` +
        `and a unit count as one of ${quoted(POLICY_UNIT_KEYS)}`);
}
/** Reads a monetary amount from policy input, tolerating minor unit integers. */
function readAmount(input) {
    for (const key of POLICY_AMOUNT_KEYS) {
        const v = input[key];
        // `>= 0` is load-bearing, not tidiness. Every ceiling is a `>` comparison,
        // so a negative figure satisfies all of them at once: `-1 > 100000` is
        // false, `-1 > 50000` is false, and the bulk rule's `>=` is never reached.
        // The amount therefore reads as *measurable* — so rule 3.5 does not fire —
        // and the write executes having passed every control. Measured: a caller
        // sending `{"amountMinor": -1}` cleared a 100,000 absolute ceiling.
        // Rejecting it makes the figure unmeasurable, and 3.5 then denies, which is
        // the fail-closed outcome rather than a silent pass.
        if (typeof v === 'number' && Number.isFinite(v) && v >= 0)
            return v;
    }
    return undefined;
}
function readUnits(input) {
    for (const key of POLICY_UNIT_KEYS) {
        const v = input[key];
        // Same reasoning as `readAmount`: a negative clears a `>=` threshold.
        if (typeof v === 'number' && Number.isFinite(v) && v >= 0)
            return v;
    }
    return undefined;
}
//# sourceMappingURL=policy.js.map
import type { Capability, Policy, PolicyDecision } from './types.js';
/**
 * Policy evaluation.
 *
 * The order below is deliberate and load-bearing. Denials are evaluated before
 * approvals so that a request which can never be permitted is never queued for
 * a human to approve, and the kill switch is evaluated before everything so it
 * cannot be outranked by a permissive rule.
 */
export declare class PolicyEngine {
    private readonly policy;
    private readonly windows;
    private readonly clock;
    /**
     * Ceiling on `windows`, so a caller cannot grow the table without bound by
     * presenting distinct keys. The refusal limiter beside it in `agent.ts` hit
     * exactly this — the table is keyed on a string that is attacker-influenced
     * unless the caller gates it on assurance — and records that a missing cap on
     * the authorization path is a denial of service, not a memory detail. Same
     * eviction direction: forgetting a key restores that caller's budget rather
     * than pushing a legitimate holder's window out and silencing it.
     */
    private readonly keyCap;
    constructor(policy?: Policy, clock?: () => Date, keyCap?: number);
    /** Capability names this policy will always queue for a human. */
    approvalRequired(): string[];
    evaluate(capability: Capability, budgetKey: string, policyInput: Record<string, unknown>): PolicyDecision;
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
    private hitRateLimit;
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
export declare const POLICY_AMOUNT_KEYS: readonly ["amountMinor", "amount", "total", "orderTotal", "price"];
/** The keys a unit count is read from, in precedence order. See `POLICY_AMOUNT_KEYS`. */
export declare const POLICY_UNIT_KEYS: readonly ["units", "quantity", "itemCount"];
/**
 * Whether a declared figure is one any policy rule can actually measure.
 *
 * A capability that declares `grandTotal` has declared nothing the ceiling can
 * read. That used to be caught per request — the caller's aliases survived the
 * merge and were measured instead, so a 500,000 order passed a 100,000 ceiling
 * — and is now refused at build time, which is where a merchant can act on it.
 */
export declare function isPolicyFigureKey(key: string): boolean;
/**
 * The same vocabulary, formatted for a message a merchant has to act on.
 *
 * Derived rather than written out, because a message listing keys the engine no
 * longer reads is this file's defect class one level up: it tells a merchant
 * `total` works when the build refuses it, and it disagrees with the code it is
 * generated from. Two hand-written enumerations of this list already existed.
 */
export declare function figureKeyVocabulary(): string;
//# sourceMappingURL=policy.d.ts.map
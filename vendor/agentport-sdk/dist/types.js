/**
 * Core types for Agent Port.
 *
 * The product chain this SDK implements is DISCOVER, IDENTIFY, AUTHORIZE,
 * EXECUTE, PROVE. A business exposes capabilities that map onto APIs it
 * already has; the SDK supplies identity, policy, execution and the ledger
 * around them. It never replaces the business's own code.
 */
/** Why a request was refused. Never a generic "forbidden". */
export const DENIAL_REASONS = [
    'unknown_capability',
    'capability_not_exposed',
    'unauthenticated',
    'identity_expired',
    'insufficient_scope',
    'delegation_insufficient',
    'policy_denied',
    'rate_limited',
    'approval_required',
    'approval_rejected',
    'validation_failed',
    'handler_error',
    'intent_conflict',
];
/**
 * The three outcomes a policy may produce, as a value rather than a bare union.
 *
 * Exported as a runtime array so a consumer that has to *enumerate* them — the
 * CLI validating `--decision`, the manifest's error contract — reads this instead
 * of writing the three strings out again. A copy is a second place to forget:
 * the `SqlLedger` CHECK constraint is a third, and a decision added to the type
 * but not to the schema produces a row the engine cannot write.
 */
export const POLICY_OUTCOMES = ['allow', 'deny', 'require_approval'];
/** A reason is either an actual refusal, or the explicit fact of permission. */
export const DECISION_REASONS = [...DENIAL_REASONS, 'allowed'];
//# sourceMappingURL=types.js.map
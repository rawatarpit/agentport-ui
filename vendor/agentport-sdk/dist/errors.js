/**
 * Every error carries a machine-readable reason and a caller-safe detail.
 * A refusal must never be generic: an agent that cannot tell why it was
 * refused will either retry forever or route around the control.
 */
export class AgentPortError extends Error {
    reason;
    detail;
    status;
    constructor(reason, detail, status = 400) {
        super(`${reason}: ${detail}`);
        this.name = 'AgentPortError';
        this.reason = reason;
        this.detail = detail;
        this.status = status;
    }
}
export class UnknownCapabilityError extends AgentPortError {
    constructor(name, known) {
        super('unknown_capability', `No capability named "${name}" is registered. Available: ${known.length ? known.join(', ') : 'none'}.`, 404);
        this.name = 'UnknownCapabilityError';
    }
}
export class UnauthenticatedError extends AgentPortError {
    constructor(detail = 'A verified agent identity is required.') {
        super('unauthenticated', detail, 401);
        this.name = 'UnauthenticatedError';
    }
}
export class PolicyDeniedError extends AgentPortError {
    constructor(detail, rule) {
        super('policy_denied', detail, 403);
        this.name = 'PolicyDeniedError';
        this.rule = rule;
    }
    rule;
}
export class RateLimitedError extends AgentPortError {
    constructor(retryAfterSeconds) {
        super('rate_limited', `Rate limit exceeded. Retry after ${retryAfterSeconds}s.`, 429);
        this.name = 'RateLimitedError';
        this.retryAfterSeconds = retryAfterSeconds;
    }
    retryAfterSeconds;
}
export class ApprovalRequiredError extends AgentPortError {
    constructor(approvalId) {
        super('approval_required', `Held for human approval. Track it as ${approvalId}.`, 202);
        this.name = 'ApprovalRequiredError';
        this.approvalId = approvalId;
    }
    approvalId;
}
//# sourceMappingURL=errors.js.map
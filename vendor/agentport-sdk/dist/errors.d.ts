import type { DenialReason } from './types.js';
/**
 * Every error carries a machine-readable reason and a caller-safe detail.
 * A refusal must never be generic: an agent that cannot tell why it was
 * refused will either retry forever or route around the control.
 */
export declare class AgentPortError extends Error {
    readonly reason: DenialReason;
    readonly detail: string;
    readonly status: number;
    constructor(reason: DenialReason, detail: string, status?: number);
}
export declare class UnknownCapabilityError extends AgentPortError {
    constructor(name: string, known: string[]);
}
export declare class UnauthenticatedError extends AgentPortError {
    constructor(detail?: string);
}
export declare class PolicyDeniedError extends AgentPortError {
    constructor(detail: string, rule: string);
    readonly rule: string;
}
export declare class RateLimitedError extends AgentPortError {
    constructor(retryAfterSeconds: number);
    readonly retryAfterSeconds: number;
}
export declare class ApprovalRequiredError extends AgentPortError {
    constructor(approvalId: string);
    readonly approvalId: string;
}
//# sourceMappingURL=errors.d.ts.map
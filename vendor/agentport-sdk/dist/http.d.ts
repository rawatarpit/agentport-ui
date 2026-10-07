import type { HttpSourceFile } from './config.js';
/**
 * A failure with a machine-readable upstream status.
 *
 * Carries no response body. `agent.ts` puts `errorMessage(err)` into the ledger
 * on this path, and the ledger is read by people who did not make the request —
 * an upstream error page can contain the payload that failed, which is exactly
 * the material the redaction pass exists to keep out.
 */
export declare class HttpSourceError extends Error {
    readonly upstreamStatus?: number | undefined;
    constructor(message: string, upstreamStatus?: number | undefined);
}
/** Slot names in a template, in order, duplicates collapsed. */
export declare function slotsIn(template: string): string[];
/**
 * Resolve the frozen destination at build time.
 *
 * Throws on anything that could later name a different origin, so a bad config
 * stops the server at startup instead of reaching a customer's host on a
 * request someone happens to make three weeks later.
 */
export declare function resolveFrozenTarget(baseUrl: string, raw: string): URL;
/**
 * Substitute declared slots with encoded caller values.
 *
 * `bindings` is the existing name→dotted-path map used by SQL placeholders, so
 * one capability declares where a value comes from once, whichever source runs
 * it. An unbound slot is a build-time error rather than a request-time surprise:
 * a literal `{id}` that reached the wire is an endpoint the merchant did not
 * describe, and the 404 it provokes is indistinguishable from a bad path.
 */
export declare function fillSlots(capability: string, template: string, bindings: Record<string, string>, read: (path: string) => unknown): string;
export interface HttpCall {
    data: unknown;
    upstreamStatus: number;
}
export interface HttpExecuteOptions {
    /** Kept injectable so a test can prove the fetch is never reached. */
    fetchImpl?: typeof fetch;
    baseUrl: string;
    clock?: () => Date;
}
/**
 * Perform one upstream call.
 *
 * Returns the decoded body for the agent and the status for the ledger. A
 * non-2xx throws, because a write that returned 402 has not happened and
 * answering `ok` would tell the agent to stop retrying a transaction that never
 * committed.
 */
export declare function executeHttp(capability: string, source: HttpSourceFile, input: unknown, bindings: Record<string, string>, options: HttpExecuteOptions): Promise<HttpCall>;
//# sourceMappingURL=http.d.ts.map
/**
 * The union view — reconciling every pass into one list, and reporting where
 * they disagree.
 *
 * ## Why this exists
 *
 * Discovery produces several files and each is incomplete in a different way.
 * A route dump sees every registered route but cannot tell you which ones the
 * frontend uses, or what fields they carry. A contract sees fields but only for
 * endpoints someone documented. A capture sees what actually happened but only
 * the code paths a human happened to exercise.
 *
 * Presented as three separate files, that is three documents the merchant has to
 * reconcile by hand, and hand reconciliation is exactly where a mistake becomes
 * a capability nobody knew an agent could reach. So the passes are merged here
 * into one list, and the merge is reported three ways:
 *
 * - **corroborated** — a route or contract, and a live request. Two independent
 *   sources agreeing is the strongest evidence available here.
 * - **declared, never used** — exists in the framework or the contract, no
 *   request was seen. Might be an admin-only route, an abandoned endpoint, or
 *   simply unexercised. Notably it might be perfectly live, because capture only
 *   sees traffic someone generated.
 * - **used, never declared** — a live request to a path no route dump and no
 *   contract named. The one that matters most: this is an endpoint that exists,
 *   is reachable, and is not in anything a reviewer would read.
 *
 * ## Why `ANY` is reconciled rather than kept literal
 *
 * Next.js emits `ANY` for a route handler exporting no method this reader
 * recognises. Keyed on `method + path` verbatim, `ANY /orders/{id}` and a
 * captured `GET /orders/{id}` become two rows, and every such handler is
 * reported as never used — a false accusation derived from a parsing gap, which
 * is worse than a gap that admits it is one.
 *
 * So a declaration of `ANY` matches any observed method on that path, and the
 * row keeps the observed method with the declared provenance attached. That
 * biases the reconciliation toward reporting corroboration rather than a
 * confident falsehood. Where it is still ambiguous the row carries
 * `declaredAny: true`, so a reader can see the match was generous rather than
 * exact.
 */
import type { EndpointSnapshot, Provenance } from './discover.js';
import type { DiscoveredField } from './openapi.js';
/** A pass, and the file it came from. */
export interface InventoryInput {
    /** Path as the merchant typed it, echoed in the report so rows are traceable. */
    file: string;
    snapshot: EndpointSnapshot;
}
export interface UnionEndpoint {
    method: string;
    path: string;
    /** Every source that named this endpoint, in a stable order. */
    provenance: Provenance[];
    parameters: DiscoveredField[];
    request: DiscoveredField[];
    response: DiscoveredField[];
    /**
     * How many live requests were seen.
     *
     * `0` for a declaration. Present so a sorted list does not hide the
     * distinction between "declared" and "seen 900 times", which is the
     * difference between a route that exists and a route in production.
     */
    calls: number;
    /**
     * True when the match to a declaration was on `ANY` rather than an exact
     * method. See the module note: the reconciliation is deliberately generous,
     * and this is how a reader can tell.
     */
    declaredAny?: boolean;
    /**
     * True when the runtime pass saw this path but could not resolve it.
     *
     * A segment seen once cannot be told apart from a value in the request, so
     * the recorder replaces it with `{id}` — see `src/capture.ts`. A row that is
     * nothing but placeholders therefore says the path happened, and nothing about
     * which path. Where a declaration matches such a row exactly it is normal
     * corroboration and this stays false; it is set only when nothing matched, and
     * it exists to stop those rows being reported as undeclared endpoints.
     *
     * That distinction is the whole reason this is here. A bucket that fires for
     * every one-shot endpoint is not a bucket a reader keeps reading, and a bucket
     * nobody reads is worse than no bucket: it would hide the one genuine
     * undeclared endpoint behind a hundred rows of noise.
     */
    unresolved?: boolean;
}
export interface UnionReport {
    version: 1;
    /** Every endpoint, from any pass, merged. */
    endpoints: UnionEndpoint[];
    /** Named by a route dump or contract, and hit by a live request. */
    corroborated: UnionEndpoint[];
    /** Named but never seen. See the module note: absence of evidence, not evidence of absence. */
    declaredNotUsed: UnionEndpoint[];
    /** Seen live, named by nothing. The rows worth reading first. */
    usedNotDeclared: UnionEndpoint[];
    /**
     * Seen live, but the pass could not resolve which path it was.
     *
     * Not evidence of anything. Listed so the absence is visible instead of being
     * silently counted as corroboration or as an undeclared endpoint.
     */
    unresolved: UnionEndpoint[];
    /** `skipped` and `warnings` from every input, kept with the file that raised them. */
    skipped: {
        file: string;
        entry: string;
    }[];
    warnings: {
        file: string;
        entry: string;
    }[];
}
/**
 * Fold every input into one report.
 *
 * Pure, and imports no `node:` builtin, so it stays inside the module graph
 * `test/architecture.test.ts` walks.
 */
export declare function unionInventories(inputs: readonly InventoryInput[]): UnionReport;
/** One line per row, for a human reading a terminal. */
export declare function formatReport(report: UnionReport): string;
//# sourceMappingURL=inventory.d.ts.map
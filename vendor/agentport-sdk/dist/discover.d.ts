/**
 * Endpoint discovery — asking a framework what routes it registered, rather
 * than guessing from the code.
 *
 * ## Why route dumps and not a source scan
 *
 * The question a merchant is asking with `discover` is "what can an agent
 * reach". There are two ways to answer it and only one of them is complete.
 *
 * A source scan infers the route surface from what the code appears to do. It
 * is a guess: it misses routes assembled at runtime, it reports handlers that
 * were deleted last year, and it needs a parser for every language. Every
 * attempt to make it language-agnostic is defeated at step one, because
 * "reads the request" and "declares a URL" are syntactic facts that differ per
 * language.
 *
 * A route dump sidesteps all of it. `bin/rails routes --json` and
 * `php artisan route:list --json` emit JSON. Next.js writes its route table to
 * a file at build time. Each framework already knows its own route surface
 * exactly and will say so on request. So every adapter here is a subprocess
 * call or a file read — never a parser — and the third-party framework's own
 * output format is the contract. That is what makes this work for a language we
 * have never seen: we do not need to understand the language, only to know
 * which command to run in it.
 *
 * The cost is honest and worth stating plainly: this only covers frameworks we
 * ship an adapter for. `detected` lists the ones we recognised and could not
 * read, so a merchant is told what was skipped instead of being handed a
 * shorter list that looks complete.
 *
 * ## Why a route dump is also the safest first step
 *
 * A route table contains no request data. `rails routes` yields a verb, a path
 * pattern and a controller name; there is no field in it that could hold a
 * customer's name, because the thing that would hold one has not happened yet.
 * The runtime capture that fills in field names has no such property, which is
 * why it is the second step and not this one. Ordering is load-bearing here:
 * doing the safe-but-shallow pass first means a merchant who stops after step
 * one has disclosed only route shapes.
 *
 * ## Provenance, because completeness is not provable
 *
 * No method here can claim to have found every endpoint. A route built from a
 * runtime-computed path, or a handler behind an auth middleware we were not
 * told about, will not appear in any of them. So this module does not assert
 * completeness — it records *where each endpoint came from* and lets a human
 * reconcile. An endpoint seen once by a route dump is a declaration; an
 * endpoint seen by both a route dump and a live capture is corroborated. The
 * `only` fields at the bottom of the inventory exist so that difference is
 * visible rather than inferred.
 */
import { type DiscoveredField } from './openapi.js';
/**
 * Where an endpoint was observed.
 *
 * The `routes:` and `spec:` prefixes are declarations — something in the
 * merchant's project said the endpoint exists, without a request happening.
 * The `runtime:` prefixes are observations — a request actually arrived, and
 * these names exist because the distinction is the whole value of the union
 * view in `src/inventory.ts`.
 *
 * `source` is still absent: it belongs to the static scanner, which is not
 * written yet, and a vocabulary naming a method we have not implemented would
 * invite a reader to believe that method ran.
 */
export type Provenance = 'routes:next' | 'routes:rails' | 'routes:laravel' | 'spec:openapi' | 'runtime:capture' | 'runtime:server';
export interface DiscoveredEndpoint {
    /** Uppercased HTTP verb. `ANY` where a framework declines to narrow it. */
    method: string;
    /** Route pattern, not a URL. `/orders/:id` and never `/orders/4417`. */
    path: string;
    /** Adapters that independently reported this endpoint. */
    provenance: Provenance[];
    /**
     * Field names, from the spec reader only.
     *
     * A route dump fills these with nothing, and that asymmetry is the point: it
     * is why provenance matters. An endpoint with names here came from a declared
     * contract; an endpoint with empty arrays was inferred from a route table
     * that could not have told us. Never a value — `src/openapi.ts` drops
     * `example`, `default` and `enum` contents for exactly this reason.
     */
    parameters: DiscoveredField[];
    request: DiscoveredField[];
    response: DiscoveredField[];
    /**
     * Live requests observed, for runtime provenance only.
     *
     * Absent on declarations, and `0` when a declared endpoint is reconciled with
     * no traffic. It is the difference between a route that exists and a route in
     * production, so it is on the row rather than in a separate report.
     */
    calls?: number;
}
export interface EndpointSnapshot {
    version: 1;
    /** Adapters that ran and returned at least one endpoint. */
    observedBy: Provenance[];
    endpoints: DiscoveredEndpoint[];
    /**
     * Frameworks and files found that we have no adapter for.
     *
     * Reported rather than dropped. A merchant whose stack is not on this list
     * must be able to tell the difference between "you have no endpoints" and
     * "we could not read your framework" — the first is a finding, the second is
     * our gap, and silently returning empty would read as the first.
     */
    skipped: string[];
    /**
     * Contract problems that did not stop the read: a body in a non-JSON media
     * type, a remote `$ref`, a document declaring no `2xx`.
     *
     * These are the cases where a merchant could otherwise believe the inventory
     * is complete because no error was raised. Each one means fields were missed,
     * so each is surfaced rather than folded into a count.
     */
    warnings: string[];
}
/**
 * Injectable dependencies.
 *
 * This module is pure and imports no `node:` builtin, which keeps it inside the
 * default module graph that `test/architecture.test.ts` walks from
 * `src/index.ts`. The CLI passes real subprocess and filesystem functions; the
 * tests pass recorders. Same shape as `introspect(driver)`.
 */
export interface DiscoveryDeps {
    /** Run a command in the merchant's project. Resolves stdout; never throws on non-zero exit. */
    exec: (cmd: string, args: string[], cwd: string) => Promise<{
        stdout: string;
        code: number;
    }>;
    /** True when a path exists. A stat, not a read: a directory counts as existing. */
    exists: (path: string) => Promise<boolean>;
    readFile: (path: string) => Promise<string>;
    /** Every file beneath `dir`, recursively, as paths relative to `dir`. */
    listFiles: (dir: string) => Promise<string[]>;
}
/**
 * Merge endpoint lists, combining provenance for the same verb+path.
 *
 * Two adapters reporting `/orders/:id` is corroboration and worth recording.
 * Silently de-duplicating would discard the only evidence that two independent
 * methods agree, which is the one cheap consistency check this module offers.
 *
 * Fields are unioned rather than taken from whichever adapter ran first. A
 * route dump and a spec reporting the same endpoint is the expected case — the
 * spec names the fields and the dump corroborates the route — and preferring
 * the first would let a fieldless route dump erase a declared contract.
 */
export declare function mergeEndpoints(groups: {
    id: Provenance;
    endpoints: DiscoveredEndpoint[];
}[]): DiscoveredEndpoint[];
/**
 * Parse a JSON route table, tolerating the preamble real CLIs print.
 *
 * `bin/rails routes --json` writes a deprecation warning and a boot banner to
 * stdout before the JSON on some versions. Taking the text between the first
 * `[` or `{` and its matching last bracket is crude, and it is deliberate: a
 * strict `JSON.parse` of raw stdout turns a merchant's harmless boot banner
 * into "discovery failed", and the inventory they get would be empty with an
 * error they cannot act on.
 */
export declare function parseJsonRouteTable(stdout: string): unknown;
/**
 * Discover the endpoint surface of the project at `cwd`.
 *
 * Adapters whose detection fails are not recorded as skipped — a merchant with
 * no Rails app should not be told Rails was skipped. `skipped` means
 * "recognised and unreadable", which is a different and more actionable claim.
 */
export declare function discoverEndpoints(deps: DiscoveryDeps, cwd: string): Promise<EndpointSnapshot>;
//# sourceMappingURL=discover.d.ts.map
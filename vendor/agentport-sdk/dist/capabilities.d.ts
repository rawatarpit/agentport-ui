import type { CapabilityFile, DatabaseDescriptor } from './config.js';
import type { Capability } from './types.js';
/**
 * Where a validated payload becomes a database operation.
 *
 * The security property is structural. The merchant's SQL is trusted because
 * the merchant wrote it. The values filling it are untrusted because an agent
 * sent them. The two are kept apart by the driver binding every placeholder
 * through a parameter and there being no code path that builds a statement
 * string — so there is no statement to inject into, and no length or escaping
 * argument to get wrong.
 *
 * That is why `config.ts` rejects positional placeholders: `WHERE id = ?` can
 * only be filled by positional binding or by concatenation, and concatenation
 * is the thing this design exists to make impossible.
 */
/** Names every `:placeholder` the merchant's query actually uses. */
export declare function placeholders(query: string): Set<string>;
export interface Driver {
    /**
     * `params` is optional because a query with no placeholders is the common
     * case for a static read, and forcing `{}` at every call site is a way of
     * getting callers to stop reading the signature.
     */
    run: (query: string, params?: Record<string, unknown>) => Promise<{
        rows: unknown[];
        changes: number;
    }>;
    /**
     * The same call, synchronously, and only the policy path needs it.
     *
     * Optional, because a network driver cannot offer it — there is no synchronous
     * Postgres. `Capability.policyInputFor` is `(input) => Record<string, unknown>`
     * and not a promise, and it cannot become one without changing the contract
     * every capability is written against: policy is decided *before* the handler
     * runs, so the figure has to exist before anything is willing to await it.
     * A driver that cannot read synchronously therefore cannot resolve a declared
     * figure, and `buildCapabilities` refuses to build that capability rather than
     * quietly measuring nothing and letting the ceiling pass.
     */
    runSync?: (query: string, params?: Record<string, unknown>) => {
        rows: unknown[];
        changes: number;
    };
}
export declare function sqliteDriver(db: {
    prepare: (sql: string) => {
        all: (...p: unknown[]) => Record<string, unknown>[];
        run: (...p: unknown[]) => unknown;
    };
}): Driver;
export interface BuildOptions {
    descriptor: DatabaseDescriptor;
    driver: Driver;
    /**
     * The merchant's own origin. Required for an http source, and every frozen
     * destination is asserted equal to it. Deliberately not derived from
     * `descriptor`: the ledger is our storage and the merchant's API is theirs,
     * and a config that confused the two would send customer data to a database
     * file.
     */
    baseUrl?: string;
    /** Overridable so a test can prove the upstream is never reached. */
    fetchImpl?: typeof fetch;
}
/**
 * How a config-file capability reads one authoritative figure per request.
 *
 * A JSON file cannot hold a function, so this is the only route a merchant who
 * configures rather than codes has to a figure their own data holds instead of
 * one the caller sent.
 */
export interface PolicyInputQuery {
    /**
     * Merchant SQL, and it must return rows. The first column of the first row is
     * the figure — select exactly one, and alias it to the key it fills.
     *
     * The parameters are identifiers, never amounts. Binding `sku` is how the
     * query finds the row; the price it reads back is the merchant's. A caller can
     * ask for a larger quantity, and then the amount is larger, and the ceiling
     * fires on the number the handler will charge.
     */
    query: string;
    /** placeholder name -> dotted path into the payload, which is already validated. */
    bindings?: Record<string, string>;
}
/**
 * Turns config entries into `Capability` objects the port can expose.
 *
 * Two checks run here that the config parser cannot do, because they need the
 * whole set: a query must not reference a placeholder nobody binds (which
 * would leave a parameter unset rather than fail loudly), and a placeholder
 * that IS bound must exist in the query (which would otherwise be a silent
 * no-op in the merchant's favour — a field they think is being saved).
 */
export declare function buildCapabilities(files: CapabilityFile[], options: BuildOptions): Capability<unknown, unknown>[];
//# sourceMappingURL=capabilities.d.ts.map
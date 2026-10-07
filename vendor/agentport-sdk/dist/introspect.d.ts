import type { Driver } from './capabilities.js';
/**
 * Introspection — the half of onboarding that reads the merchant's database
 * and produces the schema the dashboard shows them.
 *
 * The whole design rests on one property: **this file must be unable to return a
 * value.** Not "does not usually return a value" — unable. A row of customer
 * data reaching our database because an introspection query was written one
 * careless word different is a breach that no amount of policy afterwards
 * undoes, and the reader of this code is the person who will eventually be
 * tempted to add `SELECT *` because a dashboard preview seemed useful.
 *
 * So the shape below has no field a row could land in. `name` and `type` are
 * strings that come from the catalog, not from user data, and the row
 * containers are built here rather than passed through from the driver.
 */
/** One column. Two fields, both from the catalog. Never a value. */
export interface SchemaColumn {
    name: string;
    type: string;
}
/** One table and its columns. */
export interface SchemaTable {
    name: string;
    columns: SchemaColumn[];
}
/**
 * What crosses to the dashboard. This is the entire payload.
 *
 * `tables` is the whole thing. There is no `rows`, no `sample`, no `preview` —
 * and the absence is deliberate, because a schema preview is the single most
 * common way a metadata-only feature turns into a data leak. If a merchant
 * needs to see what a column contains, that is a question for their own
 * database, which they already have access to and we do not need to.
 */
export interface SchemaSnapshot {
    version: 1;
    dialect: Dialect;
    serverVersion: string;
    tables: SchemaTable[];
}
export type Dialect = 'sqlite' | 'postgres' | 'mysql';
/** How a driver reports what it is. The database answers; we never guess. */
export interface DialectProbe {
    dialect: Dialect;
    serverVersion: string;
}
/**
 * Asks the database what it is, by running the one query every dialect agrees
 * to answer.
 *
 * `SELECT version()` is close to universal but its *output* is not: Postgres
 * returns `PostgreSQL 16.2 on x86_64...`, MySQL returns `8.0.36`, SQLite
 * returns `3.45.1`. So this parses prefixes rather than assuming a shape, and
 * an unrecognised string is an error rather than a default. Defaulting to
 * sqlite here would run SQLite catalog queries against a Postgres server, and
 * the failure would surface as an empty schema — which a merchant reads as "I
 * have no tables" rather than "we guessed wrong".
 */
export declare function parseVersion(raw: unknown, asked?: Dialect): DialectProbe;
/**
 * Asks the database what it is.
 *
 * Each candidate dialect is asked with its own query and the answer is parsed
 * back, rather than the dialect being assumed and then verified. The reason is
 * that a wrong assumption is not a loud failure: it produces an empty table
 * list, and a merchant reads that as "my shop has no tables" rather than "we
 * guessed wrong" — and then has no reason to distrust the rest of the output.
 *
 * So the loop only *offers* a dialect. The string the database returns is what
 * decides.
 */
export declare function probeDialect(driver: Driver): Promise<DialectProbe>;
/**
 * Produces the schema. Async, and never synchronous.
 *
 * That is not an accident of the driver interface: `Driver.runSync` exists for
 * `Capability.policyInputFor`, which must resolve before policy decides. A
 * ceiling has to be measured before a handler is willing to run. Introspection
 * is not a capability and is never measured against a ceiling, so it uses the
 * async path and a network driver that cannot do sync work is unaffected.
 */
export declare function introspect(driver: Driver): Promise<SchemaSnapshot>;
//# sourceMappingURL=introspect.d.ts.map
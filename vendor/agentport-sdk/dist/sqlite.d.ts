import type { SqlExecutor } from './sql.js';
/**
 * A `SqlExecutor` backed by a real SQLite file.
 *
 * This is the first durable ledger in the project, and the reason A1 exists:
 * until a row survives a process exit, the claim that Agent Port produces
 * evidence is a claim about a `Map`. `InMemoryLedger` is a fixture. It reports
 * from whatever is still in the heap, which is why AGENTS.md disqualifies it
 * as evidence (`A7`).
 *
 * `node:sqlite` is a Node builtin, not a dependency, so shipping this costs the
 * customer no supply chain. It is loaded with a dynamic `import()` so the
 * bundler externalises it (B3.4) and so the error, when the builtin is missing,
 * arrives at the call that needs it and names the fix — rather than as an
 * unresolvable-specifier crash at startup for a merchant who never touches
 * SQLite.
 *
 * The Node floor is now `>=22.13.0` in package.json, which this comment used to
 * contradict by claiming the package "supports Node 20". `node:sqlite` landed
 * in 22.5, so that claim was never true for this adapter either.
 */
export interface SqliteHandle {
    /** Matches `SqlExecutor`, so it can be handed straight to `SqlLedger`. */
    exec: SqlExecutor;
    /**
     * A bound-parameter driver for capability queries.
     *
     * Separate from `exec` because the two have different jobs: `exec` returns
     * rows for the ledger's own statements, and a driver is the one path that can
     * reach a merchant's tables. Exposing the raw handle instead would hand out
     * `exec`, and with it arbitrary DDL from anything holding the handle.
     */
    driver: import('./capabilities.js').Driver;
    close: () => void;
    /** The path in use, including `':memory:'`, for logs and receipts. */
    readonly path: string;
}
export interface OpenSqliteOptions {
    /**
     * A filesystem path, or `':memory:'`.
     *
     * A path the process cannot write is not caught here. It surfaces on the
     * first write, as a ledger failure, which is the shape the caller already
     * handles — and a half-open database is worse than a loud one.
     */
    path: string;
    /**
     * WAL by default. The agent process reads the ledger while a merchant's own
     * queries read it too; the default rollback journal takes a write lock for
     * the length of a read, and this is a process that must not block a shop's
     * database. `NORMAL` rather than `FULL` is a deliberate trade: it survives a
     * process crash, and can lose the last commits only on an OS crash or power
     * loss. `FULL` would fsync every append for a guarantee that is about the
     * machine, not about the agent.
     */
    wal?: boolean;
    busyTimeoutMs?: number;
}
export declare function openSqlite(options: OpenSqliteOptions): Promise<SqliteHandle>;
/**
 * Applies the ledger schema, and is safe to call on every start.
 *
 * `CREATE TABLE IF NOT EXISTS` is a no-op against an existing table, which is
 * the honest limit of what "safe to call on every start" means: this installs
 * the schema on a fresh database and leaves a migrated one alone. It cannot
 * add columns to a table that predates them, and it must not try to, because
 * `ALTER TABLE ... ADD COLUMN tenant_id TEXT NOT NULL` fails on a populated
 * SQLite table. See `MIGRATION.md`.
 */
export declare function installSqliteSchema(handle: SqliteHandle, statements?: readonly {
    id: string;
    sql: string;
    idempotent?: boolean;
}[]): Promise<void>;
//# sourceMappingURL=sqlite.d.ts.map
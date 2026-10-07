import { UNVERSIONED_CONFIG } from './ledger.js';
import type { ApprovalStore } from './agent.js';
import type { IdempotencyStore } from './types.js';
import type { Ledger, LedgerEntry, LedgerFilter, PendingApproval } from './types.js';
/**
 * The merchant's own database, reached through a function they supply.
 *
 * The SDK ships to businesses and has zero runtime dependencies by rule, so it
 * cannot hold a Postgres or D1 client. It also must not know which one it is
 * talking to. The merchant supplies `execute`, gets back rows, and the adapter
 * above it decides the dialect.
 *
 * D1/SQLite and Postgres both support `?`-style binding and
 * `ON CONFLICT DO NOTHING`, which is the common denominator this relies on. A
 * Postgres caller binds `$1` in their own adapter and changes nothing here.
 */
/**
 * `params` is optional because most calls are DDL or a statement with no
 * placeholders, and a required `[]` is noise at every one of them.
 */
export type SqlExecutor = (sql: string, params?: readonly unknown[]) => Promise<readonly Record<string, unknown>[]>;
/**
 * Re-exported from `ledger.ts`, where it lives beside the row digest that must
 * name the same value this ledger stores. Kept here so existing importers
 * (`MIGRATION.md`, the test suite) keep compiling against this module.
 */
export { UNVERSIONED_CONFIG };
export declare class SqlLedger implements Ledger {
    private readonly exec;
    private readonly table;
    private readonly tenantId;
    /**
     * `tenantId` is required and has no default. An empty-string tenant is the
     * same defect as a `'default'` one, just spelled differently, so it is
     * rejected here rather than accepted and later filtered around.
     */
    constructor(exec: SqlExecutor, options: {
        tenantId: string;
        table?: string;
    });
    append(entry: LedgerEntry): Promise<void>;
    list(filter?: LedgerFilter): Promise<LedgerEntry[]>;
}
/**
 * A claimed intent, and what it produced.
 *
 * The first caller to claim an `intentId` owns the work. Everyone who arrives
 * later — a retry, a duplicate delivery, a second agent — reads the stored
 * outcome instead of performing the effect again. Without this, a retried
 * request is a second write, because `requestId` is minted per call and knows
 * nothing about the caller's intent.
 *
 * `status: 'complete'` means an effect happened and is replayable as that same
 * effect. It is not a record that the intent was "dealt with", and a failure is
 * not `complete` — that misuse is what reported a timed-out charge to a retrying
 * agent as `status: 'ok'` with the error as its `data`, permanently. A failure
 * releases the claim, so the row is gone and the work is retryable. The only
 * permanent states here are a completed effect and a claim nobody has finished.
 */
export interface IdempotencyRecord {
    intentId: string;
    /** Stable digest of capability + input, to catch a reused id on different work. */
    fingerprint: string;
    status: 'in_progress' | 'complete';
    outcome?: unknown;
    createdAt: string;
    completedAt?: string;
}
export declare class SqlIdempotencyStore implements IdempotencyStore {
    private readonly exec;
    private readonly table;
    readonly tenantId: string;
    constructor(exec: SqlExecutor, options: {
        tenantId: string;
        table?: string;
    });
    /**
     * Claims an intent. Returns false when someone else already owns it.
     *
     * The claim is a single conditional INSERT, so two concurrent callers cannot
     * both win — which is the whole point. Checking then inserting is a race.
     *
     * Scoped to the tenant, because `intentId` is a merchant-chosen label and two
     * shops choosing the same one is ordinary. Keyed on `intent_id` alone, shop B
     * would read shop A's stored outcome and return it as if its own write had
     * happened — a successful response for work that was never performed.
     */
    claim(intentId: string, fingerprint: string, createdAt: string): Promise<boolean>;
    get(intentId: string): Promise<IdempotencyRecord | undefined>;
    /**
     * Records an effect that happened, making it the replayable outcome for this
     * intent. Called for a success and nothing else — see `IdempotencyRecord`.
     */
    complete(intentId: string, outcome: unknown, completedAt: string): Promise<void>;
    /**
     * Releases a claim so the work can be retried.
     *
     * The one UPDATE in this file is `complete`; this is a DELETE, and it is not
     * on the ledger. Called only when the effect did not happen, so a crash before
     * it or a failed handler leaves no stuck claim — and the `status = 'in_progress'`
     * predicate is what keeps it from undoing a completion that already landed.
     * That predicate is the whole reason releasing a failure is safe to do
     * automatically on the error path.
     */
    release(intentId: string): Promise<void>;
}
export interface DdlStatement {
    /** Stable name, so an adapter can apply one statement and resume after it. */
    id: string;
    sql: string;
    /**
     * Set on `ALTER TABLE ... ADD COLUMN`, which SQLite has no `IF NOT EXISTS`
     * for. Without this, the second run of an installer against an
     * already-migrated database fails on `duplicate column name` — so a merchant
     * who runs `connect` twice sees their build break rather than seeing it
     * already done.
     *
     * Opt-in and narrow: the runner ignores *only* a duplicate-column error on a
     * statement that declared itself idempotent. Anything else propagates. A
     * runner that swallowed every error would report a schema it did not install.
     */
    idempotent?: boolean;
}
/**
 * DDL for SQLite and D1, as separate statements.
 *
 * Separated because a single multi-statement string does not survive every
 * adapter: D1's binding takes one statement per call and rejects a batch, and
 * the aborting triggers contain internal semicolons, so any caller splitting on
 * `;` shreds them. Adapters walk this array instead.
 *
 * Postgres callers translate: `INTEGER PRIMARY KEY AUTOINCREMENT` becomes
 * `BIGSERIAL PRIMARY KEY`, `TEXT` stays, `AUTOINCREMENT` is dropped, and the
 * aborting triggers become a `BEFORE UPDATE OR DELETE` trigger plus a REVOKE.
 *
 * The triggers are the control. Without them the ledger is append-only only
 * because nothing in this package happens to update it, which is a convention
 * rather than a guarantee, and a merchant's own code is not bound by our
 * TypeScript types.
 *
 * The CHECK constraints are a second control, and they are the one that closes
 * a gap the trigger cannot: they stop the table from *holding* a row that
 * misstates its own outcome — `decision = 'allow'` paired with a refusal
 * reason, or the reverse. TypeScript types stop our code from writing that. They
 * do not stop a hand-written INSERT, a restored dump, or a future migration.
 */
export declare const LEDGER_DDL_STATEMENTS: readonly DdlStatement[];
/**
 * The same DDL as one string, for merchants who already run a multi-statement
 * connection. Derived rather than hand-written so the two cannot drift; the
 * test asserts this equality.
 */
/**
 * The whole schema as one script, for piping into `sqlite3`.
 *
 * Do not hand this to a driver that runs only the first statement. `node:sqlite`'s
 * `exec` prepares a single statement, so `exec(LEDGER_DDL)` creates the table and
 * silently installs **neither trigger** — the exact half-enforcement
 * `installSqliteSchema` exists to avoid, arrived at from the other direction. The
 * result is a table that is append-only by convention and reports as installed.
 *
 * Use `installSqliteSchema(handle)`, or iterate `LEDGER_DDL_STATEMENTS`. Splitting
 * on `;` by hand is also wrong: the trigger bodies contain `SELECT RAISE(ABORT, …)`
 * and a naive split closes them early.
 */
export declare const LEDGER_DDL: string;
/**
 * True when a failure means "this migration was already applied".
 *
 * Exported rather than kept private to the SQLite runner because the next
 * adapter hits the identical wall with a different wording — Postgres says
 * `column "on_behalf_of_scope" of relation "agentport_ledger" already exists`,
 * and D1 proxies SQLite. Three adapters guessing at three string matches is how
 * one of them ends up swallowing a real failure.
 *
 * Deliberately narrow. It matches a duplicate-*column* error and nothing else, so
 * a migration that genuinely cannot be applied still raises rather than being
 * reported as done — which is the failure mode a lenient runner exists to avoid.
 */
export declare function isDuplicateColumnError(err: unknown): boolean;
/** Append-only approval queue, shared by `serve` and `agent-port approve`. */
export declare const APPROVAL_DDL_STATEMENTS: readonly DdlStatement[];
/**
 * A durable, append-only approval queue.
 *
 * Two properties are load-bearing, and both come from the same place as the
 * ledger's.
 *
 * The first is that it survives a process boundary. A hold recorded by `serve`
 * has to be visible to a different `agent-port approve` process, or the human
 * in the loop does not exist.
 *
 * The second is that a decision is a row, not a column that gets overwritten.
 * `consume` needs an atomic claim or a double-clicked button writes twice, and
 * the obvious way to get one is `UPDATE ... SET consumed = 1 WHERE consumed = 0`
 * -- which mutates a row. Writing an event instead means the claim is a unique
 * insert, the table is append-only like the ledger, and a merchant reading it
 * later sees that someone tried to approve the same request twice rather than
 * finding a single row with no sign it happened.
 */
export declare class SqlApprovalStore implements ApprovalStore {
    private readonly exec;
    private readonly tenantId;
    constructor(exec: SqlExecutor, options: {
        tenantId: string;
    });
    put(approval: PendingApproval): Promise<void>;
    /**
     * The most recent hold, whether or not it has since been decided.
     *
     * Returning `undefined` for a decided request would be wrong, and it was:
     * `AgentPort.approve` distinguishes "no such request" from "already spent"
     * only by whether this returns a record, so a store that hid spent holds
     * turned a refused double-approve into `status: 'error'` — a system failure
     * to the operator, where the honest answer is a denial naming the rule.
     */
    get(requestId: string): Promise<PendingApproval | undefined>;
    consume(requestId: string, approvedBy?: string): Promise<boolean>;
    /** What is waiting on a human, oldest first. */
    listPending(limit?: number): Promise<Array<{
        requestId: string;
        capability: string;
        at: string;
        detail: string;
    }>>;
}
//# sourceMappingURL=sql.d.ts.map
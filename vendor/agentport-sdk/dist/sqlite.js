import { existsSync, writeFileSync } from 'node:fs';
import { sqliteDriver } from './capabilities.js';
import { APPROVAL_DDL_STATEMENTS, LEDGER_DDL_STATEMENTS, isDuplicateColumnError } from './sql.js';
export async function openSqlite(options) {
    let DatabaseSync;
    try {
        // Type-only reference: erased at compile time, so the SDK stays importable
        // on Node 20 where this module does not exist.
        const mod = (await import('node:sqlite'));
        DatabaseSync = mod.DatabaseSync;
    }
    catch {
        throw new Error('openSqlite needs node:sqlite, which requires Node 22.5 or newer. ' +
            'This SDK supports Node 20, so the adapter is loaded on demand: ' +
            'run on Node 22.5+, or supply your own SqlExecutor for SqlLedger. ' +
            'Nothing about the ledger contract changes — only where the rows live.');
    }
    // `node:sqlite` takes a path and no mode, so a fresh ledger was created with
    // the process umask — 0644 on a default host. The ledger is the product: it
    // holds who asked for what, which capability, which rule fired, and the
    // redacted parameters. A merchant on a shared machine, a build box, or a
    // container with a careless umask was writing that world-readable, and the
    // redaction that protects a customer does nothing for a local account that
    // can read the file directly.
    //
    // Tightened only when this call created the file. An existing ledger is left
    // alone: the mode on it is the merchant's decision, and silently re-permissioning
    // a file somebody else owns is not this function's call to make. `chmod` on a
    // file we did not create also needs the owner to be us, which is exactly the
    // case being excluded.
    const createdLedger = options.path !== ':memory:' && !existsSync(options.path);
    if (createdLedger) {
        // Created empty, with the mode, before SQLite opens it — so there is no
        // window in which the file exists at 0644.
        writeFileSync(options.path, '', { mode: 0o600 });
    }
    const db = new DatabaseSync(options.path);
    if (options.wal !== false && options.path !== ':memory:') {
        // A file-backed database only. `journal_mode=WAL` on a memory database is
        // silently ignored, and pretending otherwise would put a pragma in the
        // test path that the test path cannot honour.
        db.exec('PRAGMA journal_mode = WAL');
    }
    db.exec(`PRAGMA busy_timeout = ${options.busyTimeoutMs ?? 5_000}`);
    const exec = async (sql, params = []) => {
        // `node:sqlite` is synchronous. Wrapping it in a promise keeps the
        // `SqlExecutor` contract uniform, so a caller can swap in a Postgres or D1
        // adapter without touching `SqlLedger`, and without the wrapper being
        // mistaken for asynchrony this adapter does not have.
        return db.prepare(sql).all(...params);
    };
    return {
        exec,
        driver: sqliteDriver(db),
        close: () => db.close(),
        path: options.path,
    };
}
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
export async function installSqliteSchema(handle, 
// Composed rather than defaulted: a caller passing the merchant's own schema
// must not silently opt out of the ledger or the approval queue. Those two
// are what make a record exist, and a missing table would surface as "no
// such table" on the first write rather than as a missing argument.
statements = [
    ...LEDGER_DDL_STATEMENTS,
    ...APPROVAL_DDL_STATEMENTS,
]) {
    for (const statement of statements) {
        // One `exec` per statement rather than splitting on `;`. The DDL contains
        // trigger bodies with `SELECT RAISE(ABORT, ...)` — semicolons inside them —
        // so a naive split produces a trigger that closes early, which SQLite
        // accepts, leaving append-only half-enforced and reported as installed.
        try {
            await handle.exec(statement.sql, []);
        }
        catch (err) {
            // Only for a statement that declared itself idempotent, and only for the
            // one error that means "already done". Anything else propagates: a
            // migration that silently reported success is worse than one that fails,
            // because the merchant would believe a column exists that does not.
            const alreadyThere = statement.idempotent === true && isDuplicateColumnError(err);
            if (!alreadyThere)
                throw err;
        }
    }
}
//# sourceMappingURL=sqlite.js.map
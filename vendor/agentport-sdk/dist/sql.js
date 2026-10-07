import { DECISION_REASONS } from './types.js';
import { computeRowDigest, UNVERSIONED_CONFIG } from './ledger.js';
/**
 * Re-exported from `ledger.ts`, where it lives beside the row digest that must
 * name the same value this ledger stores. Kept here so existing importers
 * (`MIGRATION.md`, the test suite) keep compiling against this module.
 */
export { UNVERSIONED_CONFIG };
/**
 * Durable, append-only ledger backed by the merchant's own database.
 *
 * This class has no update and no delete path, and no row cap. It is append-only
 * by construction at the API surface — but a class that merely omits a method
 * is append-only by convention, and convention is not a control. Ship
 * `LEDGER_DDL` and the aborting triggers below, or grant INSERT/SELECT only.
 * The database, not this file, is what makes it append-only.
 */
/**
 * Serialises a ledger column that must bind as text.
 *
 * A missing value is refused rather than defaulted. `{}` would assert the request
 * carried no parameters, which is a different statement from "we were not told",
 * and the ledger is read by people reconciling what an agent did.
 */
function parametersJson(parameters) {
    if (parameters === undefined || parameters === null) {
        throw new Error('Ledger entry has no `parameters`. Refusing to record the row.');
    }
    return JSON.stringify(parameters);
}
export class SqlLedger {
    exec;
    table;
    tenantId;
    /**
     * `tenantId` is required and has no default. An empty-string tenant is the
     * same defect as a `'default'` one, just spelled differently, so it is
     * rejected here rather than accepted and later filtered around.
     */
    constructor(exec, options) {
        if (!options.tenantId) {
            throw new Error('SqlLedger requires a tenantId. An empty tenant is a shared tenant.');
        }
        this.exec = exec;
        this.table = options.table ?? 'agentport_ledger';
        this.tenantId = options.tenantId;
    }
    async append(entry) {
        // The entry's own tenantId is deliberately ignored. One of these objects
        // is constructed per shop; if a caller could name the tenant on the row,
        // this line would become the place a request writes into a neighbour's
        // record, and there is no update path to undo it afterwards.
        if (entry.tenantId !== this.tenantId) {
            throw new Error(`Ledger entry tenant "${entry.tenantId}" does not match ledger tenant "${this.tenantId}".`);
        }
        // Stamped at append time from the values as stored — the ledger's own
        // tenant, the redacted parameters, the sentinel config hash — so the row
        // attests to what the database holds rather than to what the caller said.
        const rowDigest = computeRowDigest(entry, this.tenantId);
        await this.exec(`INSERT INTO ${this.table}
         (tenant_id, at, request_id, intent_id, agent_id, assurance, config_hash,
          on_behalf_of_user_id, on_behalf_of_scope, capability, capability_registered,
          access, parameters, decision, reason, rule, detail, evaluated, approval,
          result, error, duration_ms, row_digest)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
            this.tenantId,
            entry.at,
            entry.requestId,
            entry.intentId ?? null,
            entry.agentId,
            entry.assurance,
            // A named sentinel, never NULL. Both production construction sites
            // (`server.ts`, `main.ts`) pass a digest, so a NULL here is a caller
            // embedding the SDK as a library without a config file to hash — which
            // is legitimate, and should not be indistinguishable from "we forgot".
            // It was: `?? null` wrote NULL, and a reader could not tell an
            // unversioned decision from a lost one, in the same column AGENTS.md
            // says records which config made the call. A greppable literal is a
            // deliberate state; NULL is a silent one.
            entry.configHash || UNVERSIONED_CONFIG,
            entry.onBehalfOfUserId ?? null,
            entry.onBehalfOfScope ?? null,
            entry.capability,
            entry.capabilityRegistered === false ? 0 : entry.capabilityRegistered === true ? 1 : null,
            entry.access ?? null,
            // `JSON.stringify(undefined)` returns `undefined`, not a string, and
            // node:sqlite rejects that with "Provided value cannot be bound to SQLite
            // parameter 13" — an error naming a column number, on the append path every
            // request takes. `parameters` is required by the type, so this only fires
            // for a JavaScript caller or a hand-built row, and it fails loudly instead
            // of writing `{}`, which would claim the request had no parameters. That
            // claim may be false, and a ledger that records something false is worse
            // than one that refuses the row.
            parametersJson(entry.parameters),
            entry.decision,
            entry.reason,
            entry.rule,
            entry.detail,
            entry.evaluated ? JSON.stringify(entry.evaluated) : null,
            entry.approval ? JSON.stringify(entry.approval) : null,
            entry.result ?? null,
            entry.error ?? null,
            entry.durationMs,
            rowDigest,
        ]);
    }
    async list(filter = {}) {
        const where = ['tenant_id = ?'];
        const params = [this.tenantId];
        if (filter.agentId) {
            where.push('agent_id = ?');
            params.push(filter.agentId);
        }
        if (filter.capability) {
            where.push('capability = ?');
            params.push(filter.capability);
        }
        if (filter.decision) {
            where.push('decision = ?');
            params.push(filter.decision);
        }
        if (filter.since) {
            where.push('at >= ?');
            params.push(filter.since);
        }
        // `seq` is the autoincrement key, not `at`: a fixed clock writes the same
        // timestamp for every entry, and ordering by it alone is unstable.
        const limit = Math.min(Math.max(filter.limit ?? 100, 1), 1_000);
        const rows = await this.exec(`SELECT * FROM ${this.table}
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         ORDER BY seq DESC
         LIMIT ${limit}`, params);
        return rows.map(hydrate);
    }
}
function hydrate(row) {
    const registered = row.capability_registered;
    return {
        tenantId: String(row.tenant_id),
        requestId: String(row.request_id),
        at: String(row.at),
        agentId: String(row.agent_id),
        assurance: row.assurance,
        // `unconfigured` is a real state, not a missing value, so it survives
        // hydration instead of being flattened back to `undefined`. Collapsing it
        // would re-create the ambiguity the sentinel exists to remove.
        configHash: row.config_hash ?? UNVERSIONED_CONFIG,
        onBehalfOfUserId: row.on_behalf_of_user_id ?? undefined,
        onBehalfOfScope: row.on_behalf_of_scope ?? undefined,
        intentId: row.intent_id ?? undefined,
        capability: String(row.capability),
        capabilityRegistered: registered === null || registered === undefined ? undefined : Boolean(registered),
        access: row.access ?? undefined,
        parameters: parseJson(row.parameters),
        decision: row.decision,
        reason: row.reason,
        rule: String(row.rule),
        detail: String(row.detail),
        evaluated: parseJson(row.evaluated),
        approval: parseJson(row.approval),
        result: row.result ?? undefined,
        error: row.error ?? undefined,
        durationMs: Number(row.duration_ms),
        // Rows written before the digest existed carry NULL, which reads back as
        // absent rather than as a digest that verifies nothing.
        rowDigest: row.row_digest ?? undefined,
    };
}
function parseJson(value) {
    if (typeof value !== 'string')
        return undefined;
    try {
        return JSON.parse(value);
    }
    catch {
        return undefined;
    }
}
export class SqlIdempotencyStore {
    exec;
    table;
    tenantId;
    constructor(exec, options) {
        if (!options.tenantId) {
            throw new Error('SqlIdempotencyStore requires a tenantId. An empty tenant is a shared tenant.');
        }
        this.exec = exec;
        this.table = options.table ?? 'agentport_intents';
        this.tenantId = options.tenantId;
    }
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
    async claim(intentId, fingerprint, createdAt) {
        const rows = await this.exec(`INSERT INTO ${this.table} (tenant_id, intent_id, fingerprint, status, created_at)
       VALUES (?,?,?,?,?)
       ON CONFLICT (tenant_id, intent_id) DO NOTHING
       RETURNING intent_id`, [this.tenantId, intentId, fingerprint, 'in_progress', createdAt]);
        return rows.length > 0;
    }
    async get(intentId) {
        const rows = await this.exec(`SELECT * FROM ${this.table} WHERE tenant_id = ? AND intent_id = ? LIMIT 1`, [this.tenantId, intentId]);
        const row = rows[0];
        if (!row)
            return undefined;
        return {
            intentId: String(row.intent_id),
            fingerprint: String(row.fingerprint),
            status: row.status,
            outcome: parseJson(row.outcome),
            createdAt: String(row.created_at),
            completedAt: row.completed_at ?? undefined,
        };
    }
    /**
     * Records an effect that happened, making it the replayable outcome for this
     * intent. Called for a success and nothing else — see `IdempotencyRecord`.
     */
    async complete(intentId, outcome, completedAt) {
        await this.exec(`UPDATE ${this.table} SET status = ?, outcome = ?, completed_at = ?
       WHERE tenant_id = ? AND intent_id = ?`, ['complete', JSON.stringify(outcome ?? null), completedAt, this.tenantId, intentId]);
    }
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
    async release(intentId) {
        await this.exec(`DELETE FROM ${this.table} WHERE tenant_id = ? AND intent_id = ? AND status = ?`, [this.tenantId, intentId, 'in_progress']);
    }
}
/**
 * The reason vocabulary as a SQL list, built from the one TypeScript source.
 *
 * Written as a CHECK rather than a comment because the previous pair of CHECKs
 * compared `reason` by string equality, and SQLite compares TEXT with BINARY
 * collation: `decision = 'deny'` with `reason = 'Allowed'` passed, because a
 * capital A is a different byte. Any reader that lowercases the reason before
 * interpreting it — the most natural thing to write — then sees `allowed` on a
 * refused row. An enumerated vocabulary closes that, and closing it by hand
 * would be a list that drifts from the union the types enforce.
 */
const REASON_LIST = DECISION_REASONS.map((r) => `'${r}'`).join(',');
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
export const LEDGER_DDL_STATEMENTS = [
    {
        id: 'ledger_table',
        sql: `CREATE TABLE IF NOT EXISTS agentport_ledger (
  seq                    INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id              TEXT    NOT NULL,
  at                     TEXT    NOT NULL,
  request_id             TEXT    NOT NULL,
  intent_id              TEXT,
  agent_id               TEXT    NOT NULL,
  assurance              TEXT    NOT NULL
                                  CHECK (assurance IN ('verified','unverified')),
  config_hash            TEXT    NOT NULL
                                  CHECK (config_hash <> ''),
  on_behalf_of_user_id   TEXT,
  capability             TEXT    NOT NULL,
  capability_registered  INTEGER,
  access                 TEXT,
  parameters             TEXT    NOT NULL,
  decision               TEXT    NOT NULL
                                  CHECK (decision IN ('allow','deny','require_approval')),
  reason                 TEXT    NOT NULL,
  rule                   TEXT    NOT NULL,
  detail                 TEXT    NOT NULL,
  evaluated              TEXT,
  approval               TEXT,
  result                 TEXT,
  error                  TEXT,
  duration_ms            INTEGER NOT NULL,
  CHECK (NOT (decision = 'allow' AND reason <> 'allowed')),
  CHECK (NOT (decision <> 'allow' AND reason = 'allowed')),
  CHECK (reason IN (${REASON_LIST})),
  CHECK (NOT (decision <> 'allow' AND result IS NOT NULL)),
  CHECK (NOT (capability_registered = 0 AND access IS NOT NULL)),
  CHECK (tenant_id <> ''),
  CHECK (agent_id <> ''),
  CHECK (capability <> ''),
  CHECK (request_id <> '')
)`,
    },
    {
        id: 'ledger_on_behalf_scope',
        // The *only* place this column is declared. Not in the `CREATE TABLE` above,
        // deliberately: a fresh install runs both statements, and a column declared
        // twice in one install fails on `duplicate column name` before it can be
        // reported as installed. So the table is created without it and every
        // database — new or existing — gets it the same way.
        //
        // `MIGRATION.md` documents this crossing. The column is nullable and the
        // CHECK admits NULL, so a row written by an older build stays readable and
        // stays truthful: it recorded no delegated authority because none was
        // enforced.
        //
        // The stronger constraint, that a row naming a user must also name an
        // authority, is deliberately NOT added. Rows migrated from before this
        // column carry a user id and a NULL scope, and they are not lying — the
        // enforcement did not exist to be recorded. Adding the constraint would
        // force a rewrite of history in a table with no update path.
        sql: `ALTER TABLE agentport_ledger ADD COLUMN on_behalf_of_scope TEXT
          CHECK (on_behalf_of_scope IS NULL
                 OR on_behalf_of_scope IN ('read','write','full'))`,
        idempotent: true,
    },
    {
        id: 'ledger_row_digest',
        // Declared here rather than in the `CREATE TABLE` above, for the reason the
        // `on_behalf_of_scope` statement gives: one statement serves a fresh install
        // and an existing database the same way, instead of a column declared twice
        // failing a fresh install on `duplicate column name`.
        //
        // Nullable because rows written before this column existed cannot be
        // recomputed by the database — and must not be backfilled by hand, since a
        // hand-written digest attests to nothing. New rows always carry one:
        // `SqlLedger.append` computes it, and the CHECK below admits NULL only so
        // history stays readable.
        sql: `ALTER TABLE agentport_ledger ADD COLUMN row_digest TEXT
          CHECK (row_digest IS NULL
                 OR (row_digest LIKE 'fnv1a:%' AND length(row_digest) = 22))`,
        idempotent: true,
    },
    {
        id: 'ledger_index_at',
        sql: 'CREATE INDEX IF NOT EXISTS agentport_ledger_at ON agentport_ledger (at)',
    },
    {
        id: 'ledger_index_agent',
        sql: 'CREATE INDEX IF NOT EXISTS agentport_ledger_agent ON agentport_ledger (agent_id)',
    },
    {
        id: 'ledger_index_intent',
        sql: 'CREATE INDEX IF NOT EXISTS agentport_ledger_intent ON agentport_ledger (intent_id)',
    },
    {
        id: 'ledger_index_tenant',
        sql: 'CREATE INDEX IF NOT EXISTS agentport_ledger_tenant ON agentport_ledger (tenant_id, at)',
    },
    {
        id: 'ledger_no_update',
        sql: `CREATE TRIGGER IF NOT EXISTS agentport_ledger_no_update
BEFORE UPDATE ON agentport_ledger
BEGIN
  SELECT RAISE(ABORT, 'agentport_ledger is append-only');
END`,
    },
    {
        id: 'ledger_no_delete',
        sql: `CREATE TRIGGER IF NOT EXISTS agentport_ledger_no_delete
BEFORE DELETE ON agentport_ledger
BEGIN
  SELECT RAISE(ABORT, 'agentport_ledger is append-only');
END`,
    },
    {
        id: 'intents_table',
        // Composite key: an intent id is only unique within a shop. Keyed on
        // intent_id alone, shop B reusing shop A's id reads A's stored outcome and
        // silently skips work the merchant asked for.
        sql: `CREATE TABLE IF NOT EXISTS agentport_intents (
  tenant_id    TEXT    NOT NULL,
  intent_id    TEXT    NOT NULL,
  fingerprint  TEXT    NOT NULL,
  status       TEXT    NOT NULL,
  outcome      TEXT,
  created_at   TEXT    NOT NULL,
  completed_at TEXT,
  PRIMARY KEY (tenant_id, intent_id),
  CHECK (tenant_id <> ''),
  CHECK (intent_id <> '')
)`,
    },
];
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
export const LEDGER_DDL = LEDGER_DDL_STATEMENTS.map((s) => s.sql).join(';\n\n') + ';\n';
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
export function isDuplicateColumnError(err) {
    const message = err?.message ?? '';
    return /duplicate column name|already exists/i.test(message);
}
/**
 * Whether a driver error is a unique-constraint violation.
 *
 * This exists because a bare `catch { return false }` around the approval claim
 * is a lie with a permanent record behind it. `consume` returning `false` means
 * "already spent" to `AgentPort.approve`, which writes `deny /
 * approval_rejected` into a table with no update path. A busy database, a
 * read-only file, a full disk — none of those are a spent approval, and all of
 * them arrive as an `ERR_SQLITE_ERROR` indistinguishable by `code`.
 *
 * Only `errcode 2067` (SQLITE_CONSTRAINT_UNIQUE) is a double-click. Everything
 * else propagates, so the operator gets a storage failure they can act on
 * rather than an instruction to stop clicking a button they clicked once.
 *
 * Seam: this matches the SQLite extended code. A Postgres or D1 executor
 * surfaces the same violation as SQLSTATE 23505, and its adapter overrides
 * this rather than having each call site learn a second dialect.
 */
/** `JSON.stringify` that cannot throw on a cyclic or absurdly deep payload. */
function safeStringify(value) {
    try {
        return JSON.stringify(value) ?? 'null';
    }
    catch {
        // Reached from `put()` with caller-supplied input, on the one path in this
        // file that runs outside a `try`. A stack overflow here would escape
        // `invoke()` and take the request down.
        return JSON.stringify({
            requestId: value?.requestId ?? 'unknown',
            truncated: true,
        });
    }
}
function isUniqueViolation(err) {
    const errcode = err?.errcode;
    if (typeof errcode === 'number')
        return errcode === 2067;
    const message = err instanceof Error ? err.message : String(err);
    return message.startsWith('UNIQUE constraint failed');
}
/** Append-only approval queue, shared by `serve` and `agent-port approve`. */
export const APPROVAL_DDL_STATEMENTS = [
    {
        id: 'approvals_table',
        sql: `CREATE TABLE IF NOT EXISTS agentport_approvals (
     seq                INTEGER PRIMARY KEY AUTOINCREMENT,
     tenant_id          TEXT NOT NULL,
     request_id         TEXT NOT NULL,
     event              TEXT NOT NULL CHECK (event IN ('held','approved','rejected')),
     agent_id           TEXT,
     capability         TEXT,
     approved_by        TEXT,
     payload            TEXT,
     at                 TEXT NOT NULL
   )`,
    },
    {
        id: 'approvals_index',
        sql: `CREATE INDEX IF NOT EXISTS agentport_approvals_request
     ON agentport_approvals (tenant_id, request_id, seq)`,
    },
    {
        // The atomic claim, enforced by the storage rather than by a read followed
        // by a write. A get-then-insert pair races: two approves can both read
        // "still pending" and both write. The unique index makes the second insert
        // fail, and `consume` turns that failure into `false`.
        //
        // Partial on `event IN ('approved','rejected')` because a request may be
        // held more than once across its lifetime, and each hold needs its own
        // decision, while any single hold may be decided only once.
        id: 'approvals_once',
        sql: `CREATE UNIQUE INDEX IF NOT EXISTS agentport_approvals_once
     ON agentport_approvals (tenant_id, request_id, event)
     WHERE event IN ('approved','rejected')`,
    },
];
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
export class SqlApprovalStore {
    exec;
    tenantId;
    constructor(exec, options) {
        if (options.tenantId === '') {
            // `SqlLedger` and `SqlIdempotencyStore` both refuse this, and the reason
            // is not tidiness: `tenant_id = ''` matches a real column, so every row
            // would be written under an attribution that is present but names nobody.
            throw new Error('SqlApprovalStore requires a tenantId. An empty string is a value, not an absence, and it ' +
                'would scope this queue to rows that belong to no shop.');
        }
        this.exec = exec;
        this.tenantId = options.tenantId;
    }
    async put(approval) {
        await this.exec(`INSERT INTO agentport_approvals
         (tenant_id, request_id, event, agent_id, capability, payload, at)
       VALUES (?, ?, 'held', ?, ?, ?, ?)`, [
            this.tenantId,
            approval.requestId,
            approval.agentId,
            approval.capability,
            safeStringify(approval),
            new Date().toISOString(),
        ]);
    }
    /**
     * The most recent hold, whether or not it has since been decided.
     *
     * Returning `undefined` for a decided request would be wrong, and it was:
     * `AgentPort.approve` distinguishes "no such request" from "already spent"
     * only by whether this returns a record, so a store that hid spent holds
     * turned a refused double-approve into `status: 'error'` — a system failure
     * to the operator, where the honest answer is a denial naming the rule.
     */
    async get(requestId) {
        const rows = await this.exec(`SELECT event, payload FROM agentport_approvals
        WHERE tenant_id = ? AND request_id = ? AND event = 'held'
        ORDER BY seq DESC LIMIT 1`, [this.tenantId, requestId]);
        if (rows.length === 0)
            return undefined;
        // A hand-written row, a restored dump, or an executor that already parsed
        // it. `JSON.parse` throwing here escapes `approve()` and turns a queue
        // lookup into a 500 with a driver message, which is the outcome the
        // discriminated `ExecuteOutcome` union exists to prevent.
        return parseJson(rows[0].payload);
    }
    async consume(requestId, approvedBy = 'policy') {
        const pending = await this.get(requestId);
        if (!pending)
            return false;
        try {
            await this.exec(`INSERT INTO agentport_approvals
           (tenant_id, request_id, event, agent_id, capability, approved_by, at)
         VALUES (?, ?, 'approved', ?, ?, ?, ?)`, [
                this.tenantId,
                requestId,
                pending.agentId,
                pending.capability,
                approvedBy,
                new Date().toISOString(),
            ]);
            return true;
        }
        catch (err) {
            if (isUniqueViolation(err))
                return false;
            throw err;
        }
    }
    /** What is waiting on a human, oldest first. */
    async listPending(limit = 50) {
        const rows = await this.exec(`SELECT h.request_id, h.capability, h.at, h.payload
         FROM agentport_approvals h
        WHERE h.tenant_id = ? AND h.event = 'held'
          AND NOT EXISTS (
            SELECT 1 FROM agentport_approvals d
             WHERE d.tenant_id = h.tenant_id AND d.request_id = h.request_id
               AND d.event IN ('approved', 'rejected')
          )
        ORDER BY h.at ASC
        LIMIT ?`, [this.tenantId, limit]);
        return rows.map((r) => {
            const payload = (parseJson(r.payload) ?? {});
            return {
                requestId: String(r.request_id),
                capability: String(r.capability),
                at: String(r.at),
                detail: payload.reason ?? '',
            };
        });
    }
}
//# sourceMappingURL=sql.js.map
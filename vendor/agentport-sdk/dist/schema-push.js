import { analyticsProjectionBytes, serializeAnalyticsPush } from './analytics.js';
/**
 * Schema upload — the local half of `binary: introspect → sign → push`.
 *
 * This is a separate module from `analytics.ts` on purpose. Analytics are load
 * bearing for every merchant on every request; schema is uploaded once, at
 * onboarding, by one merchant. If a schema push has a bug, an analytics flush
 * must not be the thing that breaks with it — so the two share the transport
 * (a push key, a sink, `payloadSha256`) and nothing else.
 *
 * What is on the wire is the same shape as `src/introspect.ts` produces, plus
 * nothing. The snapshot has no field a row value could occupy, which is the
 * property that makes this upload safe, and that property is enforced by the
 * *type* rather than by validation at send time: `SchemaSnapshot` has no
 * `rows`, so there is nothing to validate away.
 */
const SCHEMA_PUSH_VERSION = 1;
/**
 * Bounds on names, matching the receiver.
 *
 * These are not decoration. Every bound here is also a bound on what a
 * compromised or buggy binary can write into our database, and the receiver
 * enforces the same numbers independently — this side exists so a merchant gets
 * a clear error naming their own data, rather than a 400 quoting a rule they
 * have never heard of. Two implementations of one limit will disagree
 * eventually; that disagreement is the alarm, not the problem.
 */
export const MAX_TABLE_NAME = 128;
export const MAX_COLUMN_NAME = 128;
export const MAX_TYPE_NAME = 128;
/** A shop with more tables than this has something other than a shop database. */
export const MAX_TABLES = 2_000;
export const MAX_COLUMNS_PER_TABLE = 2_000;
/**
 * Table and column names are *not* held to the capability-name rule
 * (`^[a-zA-Z][a-zA-Z0-9_]{0,63}$`).
 *
 * Capability names are ours — we mint them, we enforce the convention, and the
 * closed shape keeps them safe as identifiers. Schema names are the merchant's
 * and they are not ours to constrain: `Customer Order History`, `2024_sales`,
 * and `order-items` are ordinary table names in ordinary databases, and
 * refusing to report them would leave the dashboard showing a merchant a
 * database that is not theirs.
 *
 * So these are bounded for size and printable, and otherwise passed through. The
 * column is `text`, never interpolated into a statement, and the receiver
 * parameterises every write — so a name containing a quote is a string that
 * round-trips, not an injection. That is a different safety property from the
 * capability rule, chosen on purpose.
 */
const SAFE_NAME = /^[\x20-\x7e]+$/;
/** Refusals this module originates. Every one means no request was made. */
export const LOCAL_SCHEMA_FAILURES = ['invalid_push_id', 'schema_invalid', 'sink_threw'];
/**
 * The exact bytes `payloadSha256` is the SHA-256 of, and the exact bytes a sink
 * must put on the wire.
 *
 * These are re-exports of `analytics.ts`, not second implementations. The
 * analytics receiver already verifies the digest against its own reconstruction
 * of the body; a schema push verified against a *different* function's bytes
 * would be a proof of nothing. `AGENTS.md` records the same defect once already,
 * in `approve()`: a policy-input merge duplicated across two paths, each half
 * looking right, and the bypass invisible in either. One envelope, one
 * serialiser, one digest definition — enforced here by import rather than by a
 * comment asking nobody to keep them in step.
 */
export const schemaProjectionBytes = (pushId, schema) => analyticsProjectionBytes(pushId, [], [], schema);
export const serializeSchemaPush = (push) => serializeAnalyticsPush({
    pushId: push.pushId,
    pushVersion: push.pushVersion,
    payloadSha256: push.payloadSha256,
    events: [],
    callerMetrics: [],
    schema: push.schema,
});
function hex(bytes) {
    return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function sha256Hex(text) {
    return hex(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}
const PUSH_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/**
 * Validates the snapshot before it becomes a request.
 *
 * The important part is what this cannot check: whether a column named
 * `password` or `card_number` is one the merchant wants shown. That is the
 * dashboard's job and the merchant's decision — we report the schema, they
 * choose the exposure. This function's whole responsibility is that what we
 * report is well-formed and inside the receiver's limits.
 */
export function validateSnapshot(schema) {
    if (schema === null || typeof schema !== 'object')
        return { ok: false, detail: 'schema is not an object' };
    if (schema.version !== 1) {
        return { ok: false, detail: `unsupported schema version ${String(schema.version)}` };
    }
    if (!Array.isArray(schema.tables))
        return { ok: false, detail: 'schema.tables is not an array' };
    if (schema.tables.length > MAX_TABLES) {
        return {
            ok: false,
            detail: `${schema.tables.length} tables exceeds the ${MAX_TABLES} this receiver accepts`,
        };
    }
    for (const table of schema.tables) {
        if (typeof table.name !== 'string' || table.name.length === 0 || table.name.length > MAX_TABLE_NAME) {
            return { ok: false, detail: `table name must be 1-${MAX_TABLE_NAME} characters` };
        }
        if (!SAFE_NAME.test(table.name)) {
            return { ok: false, detail: `table name "${table.name}" contains a character a name may not carry` };
        }
        if (!Array.isArray(table.columns)) {
            return { ok: false, detail: `table "${table.name}" has no column array` };
        }
        if (table.columns.length > MAX_COLUMNS_PER_TABLE) {
            return {
                ok: false,
                detail: `table "${table.name}" has ${table.columns.length} columns, over the ${MAX_COLUMNS_PER_TABLE} accepted`,
            };
        }
        for (const column of table.columns) {
            if (typeof column.name !== 'string' ||
                column.name.length === 0 ||
                column.name.length > MAX_COLUMN_NAME) {
                return {
                    ok: false,
                    detail: `column name in "${table.name}" must be 1-${MAX_COLUMN_NAME} characters`,
                };
            }
            if (!SAFE_NAME.test(column.name)) {
                return {
                    ok: false,
                    detail: `column name "${column.name}" contains a character a name may not carry`,
                };
            }
            // An empty type is real — SQLite permits `CREATE TABLE t (id)` — and is
            // reported as empty rather than dropped. Refusing it would hide a column
            // from the merchant's own dashboard because their database was loose about
            // a type, which is a worse answer than a blank one.
            if (typeof column.type !== 'string' || column.type.length > MAX_TYPE_NAME) {
                return { ok: false, detail: `column "${column.name}" in "${table.name}" has an unusable type` };
            }
        }
    }
    return { ok: true };
}
/**
 * Builds the push, stamps it, and hands it to the sink.
 *
 * The order is the whole security property, and it is the same one
 * `upgrade.ts` uses: build, hash, verify the hash matches what will be sent,
 * and only then let anything leave. A digest computed from a projection that
 * differs by one key order from the body means the merchant's proof of what we
 * received verifies against bytes we never sent.
 */
export async function pushSchema(options) {
    const { sink, schema } = options;
    const newPushId = options.newPushId ?? (() => globalThis.crypto.randomUUID());
    const checked = validateSnapshot(schema);
    if (!checked.ok)
        return { ok: false, reason: 'schema_invalid', status: 0, detail: checked.detail };
    const pushId = newPushId().toLowerCase();
    if (!PUSH_ID.test(pushId)) {
        return { ok: false, reason: 'invalid_push_id', status: 0 };
    }
    const digest = await sha256Hex(schemaProjectionBytes(pushId, schema));
    const push = {
        pushId,
        pushVersion: SCHEMA_PUSH_VERSION,
        payloadSha256: digest,
        events: [],
        callerMetrics: [],
        schema,
    };
    let result;
    try {
        result = await sink.send(push);
    }
    catch (err) {
        // A sink is merchant-supplied code, and analytics.ts already established
        // that what it returns lands somewhere it must not be trusted. Same rule.
        return { ok: false, reason: 'sink_threw', status: 0, detail: String(err) };
    }
    if (result === null || typeof result !== 'object' || typeof result.ok !== 'boolean') {
        return { ok: false, reason: 'sink_threw', status: 0, detail: 'the sink did not return a result' };
    }
    return result;
}
/**
 * The `fetch` sink. Global `fetch`, no import, no dependency — which is what
 * keeps this inside the default entry point's graph.
 *
 * Constructed with a throw, for the same reason as the analytics sink: a
 * missing endpoint has to fail at startup rather than silently not upload, or
 * a merchant completes onboarding believing the dashboard knows their schema
 * when it does not.
 */
export function createFetchSchemaSink(options) {
    const endpoint = assertEndpoint(options.endpoint);
    const pushKey = assertPushKey(options.pushKey);
    const timeoutMs = options.timeoutMs ?? 5_000;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
        throw new Error('createFetchSchemaSink: timeoutMs must be a positive whole number of milliseconds. A ' +
            'budget that never expires is the request that hangs the upload forever.');
    }
    const doFetch = options.fetchImpl ?? globalThis.fetch;
    if (typeof doFetch !== 'function') {
        throw new Error('createFetchSchemaSink: no fetch implementation is available.');
    }
    return {
        send: async (push) => {
            const body = serializeSchemaPush(push);
            const controller = new AbortController();
            let timedOut = false;
            const timer = setTimeout(() => {
                timedOut = true;
                controller.abort();
            }, timeoutMs);
            try {
                const response = await doFetch(endpoint, {
                    method: 'POST',
                    headers: {
                        // The push key goes here and nowhere else: not in the body, not in a
                        // query string, not in a log line. It is a bearer credential, and
                        // the tenant it names travels inside its MAC — there is no tenant
                        // field in this body to overwrite.
                        authorization: `Bearer ${pushKey}`,
                        'content-type': 'application/json',
                        accept: 'application/json',
                    },
                    body,
                    signal: controller.signal,
                });
                const parsed = await response.json().catch(() => null);
                if (!response.ok) {
                    return {
                        ok: false,
                        reason: 'http_error',
                        status: response.status,
                        detail: errorDetail(parsed),
                    };
                }
                if (parsed === null || typeof parsed !== 'object') {
                    return { ok: false, reason: 'transport_error', status: response.status };
                }
                const record = parsed;
                return {
                    ok: true,
                    pushId: push.pushId,
                    tablesWritten: countOf(record.tablesWritten),
                    columnsWritten: countOf(record.columnsWritten),
                };
            }
            catch {
                return { ok: false, reason: timedOut ? 'timeout' : 'transport_error', status: 0 };
            }
            finally {
                clearTimeout(timer);
            }
        },
    };
}
function countOf(value) {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}
/** Fixed caller-safe strings only. A receiver message is not echoed to a log. */
function errorDetail(parsed) {
    if (parsed === null || typeof parsed !== 'object')
        return undefined;
    const reason = parsed.reason;
    return typeof reason === 'string' && reason.length > 0 && reason.length <= 64 ? reason : undefined;
}
function assertEndpoint(endpoint) {
    if (typeof endpoint !== 'string' || endpoint === '') {
        throw new Error('createFetchSchemaSink: an endpoint is required. There is no default.');
    }
    let url;
    try {
        url = new URL(endpoint);
    }
    catch {
        throw new Error(`createFetchSchemaSink: "${endpoint}" is not a URL.`);
    }
    const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '::1';
    if (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) {
        throw new Error('createFetchSchemaSink: the endpoint must be https, or http on a loopback address. A schema ' +
            'upload in cleartext over a network is readable by whoever is on it.');
    }
    return url.toString();
}
function assertPushKey(pushKey) {
    if (typeof pushKey !== 'string' || pushKey === '') {
        throw new Error('createFetchSchemaSink: a push key is required. It is issued per tenant and presented as a ' +
            'bearer credential; there is no default.');
    }
    if (pushKey.length > 512) {
        throw new Error('createFetchSchemaSink: the push key is longer than the receiver accepts.');
    }
    for (let i = 0; i < pushKey.length; i += 1) {
        const code = pushKey.charCodeAt(i);
        if (code < 0x21 || code > 0x7e) {
            throw new Error('createFetchSchemaSink: the push key contains a character no credential may contain.');
        }
    }
    if (!pushKey.startsWith('apk1.')) {
        throw new Error('createFetchSchemaSink: that is not a push key. Push keys begin with "apk1." and are issued ' +
            'per tenant. A Supabase service_role or anon key is not a push key, and sending one here ' +
            'would hand a full-bypass credential to a public ingest endpoint.');
    }
    return pushKey;
}
//# sourceMappingURL=schema-push.js.map
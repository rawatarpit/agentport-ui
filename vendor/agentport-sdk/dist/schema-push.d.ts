import type { SchemaSnapshot } from './introspect.js';
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
export declare const MAX_TABLE_NAME = 128;
export declare const MAX_COLUMN_NAME = 128;
export declare const MAX_TYPE_NAME = 128;
/** A shop with more tables than this has something other than a shop database. */
export declare const MAX_TABLES = 2000;
export declare const MAX_COLUMNS_PER_TABLE = 2000;
/** One push. The six keys the receiver's `BODY_KEYS` names. */
export interface SchemaPush {
    pushId: string;
    pushVersion: 1;
    /** 64 lowercase hex, over the bytes with this field absent. */
    payloadSha256: string;
    events: [];
    callerMetrics: [];
    schema: SchemaSnapshot;
}
/** Refusals this module originates. Every one means no request was made. */
export declare const LOCAL_SCHEMA_FAILURES: readonly ["invalid_push_id", "schema_invalid", "sink_threw"];
export type LocalSchemaFailure = (typeof LOCAL_SCHEMA_FAILURES)[number];
export interface SchemaSendOk {
    ok: true;
    pushId: string;
    /** The receiver's counts. Never an echo of what we sent. */
    tablesWritten: number;
    columnsWritten: number;
}
export interface SchemaSendFailure {
    ok: false;
    reason: LocalSchemaFailure | 'http_error' | 'transport_error' | 'timeout';
    status: number;
    detail?: string;
}
export type SchemaSendResult = SchemaSendOk | SchemaSendFailure;
export interface SchemaSink {
    send: (push: SchemaPush) => Promise<SchemaSendResult>;
}
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
export declare const schemaProjectionBytes: (pushId: string, schema: SchemaSnapshot) => string;
export declare const serializeSchemaPush: (push: SchemaPush) => string;
/**
 * Validates the snapshot before it becomes a request.
 *
 * The important part is what this cannot check: whether a column named
 * `password` or `card_number` is one the merchant wants shown. That is the
 * dashboard's job and the merchant's decision — we report the schema, they
 * choose the exposure. This function's whole responsibility is that what we
 * report is well-formed and inside the receiver's limits.
 */
export declare function validateSnapshot(schema: SchemaSnapshot): {
    ok: true;
} | {
    ok: false;
    detail: string;
};
export interface SchemaFlushOptions {
    sink: SchemaSink;
    schema: SchemaSnapshot;
    /** Defaults to `crypto.randomUUID`. Injected so a push id is reproducible in a test. */
    newPushId?: () => string;
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
export declare function pushSchema(options: SchemaFlushOptions): Promise<SchemaSendResult>;
export interface FetchSchemaSinkOptions {
    /** Absolute `https:` URL, or `http:` on a loopback host. Anything else throws. */
    endpoint: string;
    /** The per-tenant push key. Presented as a bearer credential, never logged. */
    pushKey: string;
    fetchImpl?: typeof globalThis.fetch;
    timeoutMs?: number;
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
export declare function createFetchSchemaSink(options: FetchSchemaSinkOptions): SchemaSink;
//# sourceMappingURL=schema-push.d.ts.map
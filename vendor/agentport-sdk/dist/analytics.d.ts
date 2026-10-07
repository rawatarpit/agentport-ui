/**
 * Optional, opt-in analytics — the sender half of BUILD-PLAN K2.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS IS: a projection, not a pipeline, and not a transport.
 * ---------------------------------------------------------------------------
 * Everything here reduces to integers. A hundred requests that were all denied
 * for the same reason on the same capability become one row with `count: 100`.
 * There is no per-request event, no output row, no parameter, no agent id and
 * no user id anywhere in the wire type, and that is not a policy applied at
 * send time — it is the shape of the type, so a caller cannot build one.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS HERE AND NOT IN `agent.ts`.
 * ---------------------------------------------------------------------------
 * Two reasons, one load-bearing.
 *
 * The first is that nothing in the enforcement path may be able to reach it.
 * AGENTS.md invariant 1 is that authorisation precedes execution, and the
 * strongest version of that rule is structural: there is no call from
 * `evaluate()`, `invoke()` or `approve()` into this file, so no value returned
 * here can be read by a rule, and no failure here can stop a handler. A module
 * that *could* be imported by `policy.ts` is one refactor away from a policy
 * that fails open when the analytics host is down.
 *
 * The second is that the aggregation is a decision about what a merchant is
 * willing to disclose, and it belongs where the merchant wired it, not inside
 * a method they did not ask to have side effects.
 *
 * ---------------------------------------------------------------------------
 * THE WIRE CONTRACT IS NOT OURS.
 * ---------------------------------------------------------------------------
 * Every constant in this file that has a number in it is copied from
 * `supabase/functions/analytics-ingest/index.ts`, and every vocabulary is
 * copied from there or from `src/types.ts`. The receiver refuses an unlisted
 * key, a bad capability name, a count outside its range and a `denied` row
 * that does not name its cause — so this module validates the same things
 * before the bytes leave the machine, because a push the receiver refuses is a
 * push that takes down every other count in the batch with it. The receiver is
 * the authority on what it accepts; this file is a courtesy that keeps one bad
 * row from costing a merchant the whole window.
 *
 * What it deliberately does not do is re-declare the receiver's *refusal*
 * vocabulary. A closed list of error codes here is a contract the receiver does
 * not keep, and a patch release over there would start producing reasons this
 * type calls impossible — the same argument the receiver makes for `policyRule`.
 *
 * ---------------------------------------------------------------------------
 * FAILURE: LOSE THE COUNT, NOT THE REQUEST.
 * ---------------------------------------------------------------------------
 * `record()` is synchronous, in-memory and cannot fail. `flush()` is explicit,
 * asynchronous, and returns a result rather than throwing. A network error, a
 * 500, a timeout, a body this module cannot parse and a sink that throws are
 * all a `{ ok: false }` value. The counts in flight are dropped, not retried,
 * and the drop is counted and reported in the result — because a count that
 * silently vanished is how a merchant concludes their opt-in is working.
 *
 * No retry, deliberately. The receiver rate-limits to ten pushes a minute per
 * tenant, and a client that retries a failing analytics host is how a
 * merchant's own outage spends the push budget that every other count in the
 * window needs. Its own refusal text says the quiet part out: losing a push
 * costs a merchant nothing they cannot rebuild from their own ledger.
 *
 * No queue, no spool, no timer. A durable spool would be a second ledger, and
 * this package has no filesystem in its default graph. A timer would be a
 * network call on a schedule the merchant did not write down.
 *
 * ---------------------------------------------------------------------------
 * DEFAULT OFF.
 * ---------------------------------------------------------------------------
 * A recorder with no sink sends nothing, and says so: its flush result is
 * `disabled`, which is a different statement from `accepted`. The only thing
 * in this file that can make a request is `createFetchAnalyticsSink`, and it
 * refuses to be constructed without an explicit endpoint and an explicit push
 * key — a missing endpoint has to be a throw at startup, never a silent
 * downgrade to "no analytics" after the merchant believes it is on.
 *
 * ---------------------------------------------------------------------------
 * A CAPABILITY NAME IS SENT. HERE IS WHY, AND WHAT BOUNDS IT.
 * ---------------------------------------------------------------------------
 * It has to be. The receiver stores `capability_id`, a surrogate, and resolves
 * the name to it in a transaction against an operator-provisioned catalogue; a
 * push with no name cannot be attributed to anything and is refused. So the
 * name is part of the wire contract, not a nicety.
 *
 * It is also a merchant-defined string that could be anything, which is the
 * part worth being careful about. Three controls, and the first is the one that
 * actually matters:
 *
 * 1. **`capabilityNames` is an allowlist.** The receiver answers an
 *    unprovisioned name by failing the *whole* push with `unknown_capability`,
 *    so an agent that invents capability names — which it can, since a denial
 *    for an unregistered name is recorded under the name the agent asked for —
 *    can stop a merchant's analytics entirely. Listing the names you have
 *    agreed to share (usually `port.names()`) turns that from a push failure
 *    into a dropped cell, counted and reported. An allowlist rather than a
 *    deny-list, for the reason exposure is one.
 * 2. **The name is validated against `CAP_NAME` locally** before it reaches the
 *    sink: the same `^[a-zA-Z][a-zA-Z0-9_]{0,63}$` the SDK's own config
 *    parser and the schema's CHECK use. A capability named after a customer's
 *    email address cannot be sent, and the cell is dropped instead.
 * 3. **Cells are bounded**, so an agent minting names cannot grow this map
 *    without limit. See `record`.
 */
import type { AgentIdentity, DenialReason, ExecuteOutcome, LedgerEntry } from './types.js';
import type { SchemaSnapshot } from './introspect.js';
/**
 * `EVENT_KINDS` in the edge function, and `analytics_events_kind_vocabulary` in
 * the schema. Six, closed, and the same six in both places.
 */
export declare const ANALYTICS_EVENT_KINDS: readonly ["asked", "denied", "held", "approved", "executed", "empty_result"];
export type AnalyticsEventKind = (typeof ANALYTICS_EVENT_KINDS)[number];
/**
 * What a merchant may say about one event.
 *
 * There is no field here that can hold a payload, a result, an error message,
 * an agent id or a user id, and that is the exfiltration control: the type
 * refuses it rather than a filter scrubbing it later.
 */
export interface AnalyticsEventInput {
    /** Must match `CAP_NAME` and, if configured, be on the shared allowlist. */
    capability: string;
    kind: AnalyticsEventKind;
    /**
     * How the caller was identified. Never anything else — a value a caller
     * asserts about itself is at best as good as the credential behind it, and
     * the schema's vocabulary has exactly these two (AGENTS.md invariant 7).
     */
    assurance: AgentIdentity['assurance'];
    /** Defaults to 1. Must be a whole number in `[1, 1_000_000]`. */
    count?: number;
    /** Defaults to now. Anything unparseable is refused rather than sent as-is. */
    occurredAt?: string;
    /** Required if and only if `kind` is `denied`. */
    denialReason?: DenialReason;
    /** Required if and only if `kind` is `denied`. Matched against `POLICY_RULE`. */
    policyRule?: string;
}
/** One capability's distinct-caller set sizes for one window. */
export interface AnalyticsCallerMetricInput {
    capability: string;
    windowStart: string;
    windowEnd: string;
    /** Exactly one of these two. A set size is not additive and is never summed. */
    verifiedCallers?: number;
    unverifiedCallers?: number;
}
/** One aggregated row on the wire. No field here is derived from a payload or a result. */
export interface AnalyticsPushEvent {
    capability: string;
    kind: AnalyticsEventKind;
    assurance: AgentIdentity['assurance'];
    count: number;
    occurredAt: string;
    denialReason?: DenialReason;
    policyRule?: string;
}
/** One caller-metric row on the wire. */
export interface AnalyticsPushMetric {
    capability: string;
    windowStart: string;
    windowEnd: string;
    verifiedCallers?: number;
    unverifiedCallers?: number;
}
/**
 * One push. Exactly the six keys the receiver's `BODY_KEYS` names — an
 * unlisted key is a refusal there, not something it ignores.
 *
 * `schema` is what makes this the one envelope rather than two protocols.
 * A schema push carries `events: []`, and the receiver refuses a push that has
 * neither events nor a schema — so the two are alternatives inside one body,
 * hashed by one function and authenticated by one MAC. Two protocols would mean
 * two digest definitions, and a merchant's proof of what left their machine
 * would verify against whichever one we happened to write twice.
 *
 * It is optional on the type so an analytics push is byte-identical to what it
 * always was. A merchant's reconciliation script must not start failing
 * because a field they have never heard of joined the body.
 */
export interface AnalyticsPush {
    pushId: string;
    pushVersion: 1;
    /** 64 lowercase hex. The receipt that lets a merchant prove what left their machine. */
    payloadSha256: string;
    events: AnalyticsPushEvent[];
    callerMetrics: AnalyticsPushMetric[];
    /**
     * Table and column names from the merchant's database. Names only — `SchemaSnapshot`
     * has no field a row value could occupy, which is what makes this disclosure safe.
     * Optional: an analytics-only push omits it entirely.
     */
    schema?: SchemaSnapshot;
}
/** The receiver's 200 body. Its counts are what the *database* counted, never an echo of ours. */
export interface AnalyticsReceipt {
    ok: true;
    pushId: string;
    replay: boolean;
    eventsWritten: number;
    callerMetricsWritten: number;
}
/**
 * A refusal, or a push that never got one.
 *
 * `reason` is the receiver's own enumeration, passed through unchanged, plus
 * this module's local reasons. It is a plain `string` and not a union of the
 * receiver's reasons on purpose: re-declaring that list here is a contract this
 * package does not keep, and the first time it drifts every caller of the typed
 * version sees an `unknown_capability` it cannot represent.
 *
 * `status` is 0 when no HTTP status was received, which is how a caller tells
 * "the receiver said no" from "the network did not answer".
 */
export type AnalyticsSendResult = AnalyticsReceipt | {
    ok: false;
    reason: string;
    status: number;
    retryAfterSeconds?: number;
};
/**
 * Where a push goes.
 *
 * This is the seam that keeps the package transport-agnostic. Everything
 * above it is projection and policy about disclosure; everything below it is
 * HTTP, and a merchant who wants a different transport supplies a different
 * implementation of this one interface without the SDK growing a dependency.
 */
export interface AnalyticsSink {
    send: (push: AnalyticsPush) => Promise<AnalyticsSendResult>;
}
/** Reasons this module originates. Every one of them means no request was made. */
export declare const LOCAL_ANALYTICS_FAILURES: readonly ["disabled", "empty", "invalid_push_id", "sink_threw", "sink_malformed"];
export type LocalAnalyticsFailure = (typeof LOCAL_ANALYTICS_FAILURES)[number];
/** A successful push, and the numbers only the sender can know. */
export interface AnalyticsFlushOk {
    ok: true;
    pushId: string;
    replay: boolean;
    eventsWritten: number;
    callerMetricsWritten: number;
    /** The digest that was sent, so a merchant's own reconciliation can name it. */
    payloadSha256: string;
    /** Bytes on the wire, for the same reason. */
    bytes: number;
    /**
     * Recorded outcomes this recorder has dropped since construction, counted as
     * outcomes rather than as cells. A cell is a projection artefact; the merchant
     * who lost telemetry lost requests, and `100` is a number they can reconcile
     * against their own access log in a way `1` cannot. Monotonic.
     */
    dropped: number;
    /**
     * Caller-metric rows dropped, kept apart from `dropped` because a set size and
     * an outcome count are not the same unit and one total standing in for both is
     * a number that means nothing.
     */
    droppedCallerMetrics: number;
}
export interface AnalyticsFlushFailure {
    ok: false;
    reason: string;
    status: number;
    dropped: number;
    droppedCallerMetrics: number;
    retryAfterSeconds?: number;
}
export type AnalyticsFlushResult = AnalyticsFlushOk | AnalyticsFlushFailure;
/** What a merchant may say about the request an outcome belongs to. */
export interface AnalyticsOutcomeContext {
    /**
     * The capability the merchant asked for. Not the outcome's own copy of a
     * name: for a request naming a capability that does not exist, that string
     * is the agent's, and it is checked against the allowlist like any other.
     */
    capability: string;
    assurance: AgentIdentity['assurance'];
    occurredAt?: string;
}
/**
 * The exact bytes `payloadSha256` is the SHA-256 of: the push with the digest
 * field absent, and every other byte the sink will send.
 */
export declare function analyticsProjectionBytes(pushId: string, events: readonly AnalyticsPushEvent[], callerMetrics: readonly AnalyticsPushMetric[], schema?: SchemaSnapshot): string;
/** The exact bytes a sink must put on the wire. */
export declare function serializeAnalyticsPush(push: AnalyticsPush): string;
export interface FetchAnalyticsSinkOptions {
    /** Absolute `https:` URL, or `http:` on a loopback host. Anything else throws. */
    endpoint: string;
    /** The per-tenant push key, presented as a bearer credential. Never logged, never stored. */
    pushKey: string;
    /** Injected for tests. Defaults to the platform `fetch`. */
    fetchImpl?: typeof globalThis.fetch;
    /** Whole-request budget. Default 5 s, the receiver's own transport budget. */
    timeoutMs?: number;
}
/**
 * The `fetch` sink. Global `fetch`, no import, no dependency — which is what
 * keeps this inside the default entry point's graph and out of `node:`.
 *
 * The configuration is validated here, at construction, and throws. A missing
 * endpoint must be a startup failure, because the alternative is a merchant who
 * believes analytics is on discovering months later that it has not been, and
 * every one of those months was a consent decision they did not know they made.
 */
export declare function createFetchAnalyticsSink(options: FetchAnalyticsSinkOptions): AnalyticsSink;
export interface AnalyticsRecorderOptions {
    /**
     * Omitted means a no-op sink whose flush result is `disabled`. There is no
     * default that reaches the network, and there never will be.
     */
    sink?: AnalyticsSink;
    /** Defaults to `Date.now`. Injected so a window is reproducible in a test. */
    clock?: () => Date;
    /** Defaults to `crypto.randomUUID`. Injected so a receipt is reproducible in a test. */
    newPushId?: () => string;
    /**
     * The capability names this merchant has agreed to share, usually
     * `port.names()`.
     *
     * An allowlist, because a denial for a capability that does not exist is
     * recorded under the name the *agent* asked for, and the receiver's answer to
     * an unprovisioned name is to fail the whole push. Without this, an agent that
     * invents names can stop a merchant's analytics rather than just adding noise
     * to it. Omitted means every valid name is eligible, which is the merchant's
     * decision to make and the sink's existence is the opt-in either way.
     */
    capabilityNames?: readonly string[];
    /**
     * Events per push, and the window's own ceiling, because they are the same
     * number: a push carries the whole window, so anything larger would be memory
     * this module has no reason to hold and the receiver would refuse.
     *
     * Default and ceiling 500, the receiver's `MAX_EVENTS`. Lowering it is how a
     * merchant bounds a request; the cells above the bound are dropped and
     * counted, never spilled to a later push.
     */
    maxEventsPerPush?: number;
    /** Caller-metric rows per push and window. Default and ceiling 200, the receiver's `MAX_METRICS`. */
    maxCallerMetricsPerPush?: number;
}
/**
 * Counts outcomes and turns them into pushes.
 *
 * Never called from the enforcement path, never awaited by one, and incapable
 * of throwing into one: `record()` is a map write, and `flush()` catches
 * everything a sink can do.
 */
export declare class AnalyticsRecorder {
    private readonly sink;
    private readonly clock;
    private readonly newPushId;
    private readonly shared;
    private readonly maxEvents;
    private readonly maxMetrics;
    private readonly cells;
    private readonly metrics;
    private droppedEvents;
    private droppedMetrics;
    constructor(options?: AnalyticsRecorderOptions);
    /**
     * What is waiting to be pushed. `events` is the number of distinct cells, not
     * the sum of their counts, because a cell is what a push spends; `dropped` is
     * the opposite, counted in outcomes, because that is the unit the merchant lost.
     */
    pending(): {
        events: number;
        callerMetrics: number;
        dropped: number;
        droppedCallerMetrics: number;
    };
    /**
     * Records one event into its cell, creating the cell on first sight.
     *
     * Silent about a dropped cell by design: this runs on the merchant's request
     * path, and a function that reported failures there would be a function
     * somebody would put in an `if`. The count of what was lost is in `pending()`
     * and in the flush result, which is where a merchant actually reads it.
     */
    record(event: AnalyticsEventInput): void;
    /**
     * Records the outcome of one request, as at most one count.
     *
     * Exactly one event per request, never two. An "asked" alongside a "denied"
     * would let the receiver's charts double-count a refusal, and the receiver
     * has no way to know which pairing the sender intended.
     *
     * The mapping, and the two entries that need their reasoning:
     *
     * | outcome            | kind            |
     * |--------------------|-----------------|
     * | `ok`, empty result | `empty_result`  |
     * | `ok`               | `executed`      |
     * | `denied`           | `denied`        |
     * | `pending_approval` | `held`          |
     * | `error`            | `executed`      |
     * | `in_progress`      | `asked`         |
     *
     * `error` counts as `executed` because the handler ran and may have had an
     * effect before it threw — that ambiguity is the reason the idempotency store
     * completes a failed intent rather than releasing it. Counting it as a denial
     * would understate writes to the merchant looking at the chart, and the
     * vocabulary is closed, so there is no honest third option but to say so here.
     *
     * The only thing read out of a handler's result is whether it is null or
     * undefined. That is a shape test, not a value: the value is never stored,
     * counted, hashed or sent, and a test asserts that none of a handler's output
     * reaches the wire.
     */
    recordOutcome(outcome: ExecuteOutcome, context: AnalyticsOutcomeContext): void;
    /**
     * Records one capability's distinct-caller set sizes for a window.
     *
     * Two nullable columns and exactly one present, which is the receiver's
     * `bad_assurance_split` and the schema's `analytics_caller_metrics_assurance_split`:
     * the shape in which a row cannot say "47 callers" without saying which kind.
     * Both or neither is dropped here rather than sent, because the receiver would
     * fail the whole push over a metric the merchant could have had right.
     *
     * Recording the same capability, window and assurance class twice keeps the
     * larger set size. A set size is not additive, so summing two measurements of
     * one window would answer a question nobody asked, and last-write-wins would
     * make the number depend on flush order — which is the property that makes a
     * count a fact. The class is in the key because the receiver holds one row per
     * class, and a key without it would drop one of them.
     */
    recordCallerMetric(metric: AnalyticsCallerMetricInput): void;
    /**
     * Sends what is waiting, if anything, and clears the window.
     *
     * The window is cleared on every path, including the failures. Retaining a
     * failed push's cells would merge two windows into one aggregate and make
     * `occurredAt` a lie about when the events happened; the counts are lost, and
     * the loss is in `dropped`, which is reported rather than merely counted.
     */
    flush(): Promise<AnalyticsFlushResult>;
    private push;
    /**
     * Validates one event into the exact row that will go on the wire, or `null`
     * when it is not representable.
     *
     * The checks are the receiver's, run here so a bad row costs one cell rather
     * than the batch. Nothing is sanitised: a value that is not the right shape is
     * refused, because a sanitised value is a value whose meaning depends on a
     * filter somebody has to maintain forever.
     */
    private cellFor;
    private shareable;
}
export interface DistinctCallers {
    verified: number;
    unverified: number;
}
/**
 * Two integers from a list of ledger rows: how many distinct agents called, and
 * how many of them were verified.
 *
 * The agent ids are read here and go no further. A set *size* is what the
 * receiver's `caller_metrics` table stores and the only thing it will accept;
 * the members of the set are the merchant's, and the difference between a
 * size and a list is the whole reason this column is not a PII incident.
 *
 * The two classes are never summed. A set size is not additive, which is why
 * the schema refuses a row carrying both.
 */
export declare function distinctCallers(entries: ReadonlyArray<Pick<LedgerEntry, 'agentId' | 'assurance'>>): DistinctCallers;
/**
 * The caller-metric rows for one capability and window, from a set size.
 *
 * **One row per assurance class, and it returns an array because that is the
 * shape the receiver accepts.** Its `bad_assurance_split` refuses a row carrying
 * both counts and its `counts_positive` check refuses a zero, so a window with
 * verified and unverified callers is two rows, and a window with neither is no
 * row at all. A single-row helper here would build the one shape that fails the
 * whole push — taking every other count in the batch down with it — which is
 * the failure this function exists to make unpossible.
 */
export declare function callerMetrics(capability: string, window: {
    start: string;
    end: string;
}, counts: DistinctCallers): AnalyticsCallerMetricInput[];
//# sourceMappingURL=analytics.d.ts.map
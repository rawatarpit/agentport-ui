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
import { DENIAL_REASONS } from './types.js';
// ---------------------------------------------------------------------------
// 1. The receiver's vocabulary, and its bounds
// ---------------------------------------------------------------------------
/**
 * `EVENT_KINDS` in the edge function, and `analytics_events_kind_vocabulary` in
 * the schema. Six, closed, and the same six in both places.
 */
export const ANALYTICS_EVENT_KINDS = [
    'asked',
    'denied',
    'held',
    'approved',
    'executed',
    'empty_result',
];
const KIND_SET = new Set(ANALYTICS_EVENT_KINDS);
const DENIAL_REASON_SET = new Set(DENIAL_REASONS);
const ASSURANCE_SET = new Set(['verified', 'unverified']);
/**
 * `POLICY_RULE` in the edge function. The one accepted field the receiver
 * bounds by format rather than by enumeration, because the SDK's rule names are
 * inline literals in `policy.ts` with nothing declaring them. A rule that fails
 * this drops its cell here rather than failing the push there, which is the
 * difference between losing one count and losing the window.
 */
const POLICY_RULE = /^[a-z][a-z0-9_]{0,63}$/;
/** `CAP_NAME`: `src/config.ts`, `capability_names_name_format`, and the edge function. */
const CAPABILITY_NAME = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;
/** `UUID` in the edge function. The receiver lowercases it and keys a receipt on it. */
const PUSH_ID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
/** `MAX_EVENTS`. A merchant with 40 capabilities and 6 kinds is under 250. */
const MAX_EVENTS = 500;
/** `MAX_METRICS`. One per capability per window. */
const MAX_METRICS = 200;
/** `MAX_COUNT`. A per-cell ceiling, so a number a merchant inflates never becomes a chart. */
const MAX_COUNT = 1_000_000;
// The receiver's own ceiling for a set size, and the same number as
// `analytics_caller_metrics_counts_positive` leaves room for.
const MAX_CALLER_COUNT = 1_000_000;
/** `SUPPORTED_PUSH_VERSIONS`. One. A projection this receiver cannot read is refused, not guessed at. */
const PUSH_VERSION = 1;
/** The receiver's own 5 s transport budget, from the functions README's bounds table. */
const DEFAULT_TIMEOUT_MS = 5_000;
/** Reasons this module originates. Every one of them means no request was made. */
export const LOCAL_ANALYTICS_FAILURES = [
    'disabled',
    'empty',
    'invalid_push_id',
    'sink_threw',
    'sink_malformed',
];
// ---------------------------------------------------------------------------
// 3. Serialisation — one definition, two callers
// ---------------------------------------------------------------------------
/**
 * The body, in the receiver's key order, with the digest slot optionally absent.
 *
 * One function so the bytes that are hashed and the bytes that are sent cannot
 * drift: a merchant reconciling a receipt recomputes with
 * `analyticsProjectionBytes` and gets a byte-identical string. `digest: null`
 * is the definition of what the digest covers, and it is the only workable
 * definition — the digest cannot cover itself.
 */
function pushBody(pushId, digest, events, callerMetrics, schema) {
    const ordered = { pushId, pushVersion: PUSH_VERSION };
    if (digest !== null)
        ordered['payloadSha256'] = digest;
    ordered['events'] = events;
    ordered['callerMetrics'] = callerMetrics;
    // Absent rather than null. `null` is a value the receiver would have to
    // distinguish from "not sent", and a second meaning for one key is how a
    // push starts being read two ways.
    if (schema !== undefined)
        ordered['schema'] = schema;
    return JSON.stringify(ordered);
}
/**
 * The exact bytes `payloadSha256` is the SHA-256 of: the push with the digest
 * field absent, and every other byte the sink will send.
 */
export function analyticsProjectionBytes(pushId, events, callerMetrics, schema) {
    return pushBody(pushId, null, events, callerMetrics, schema);
}
/** The exact bytes a sink must put on the wire. */
export function serializeAnalyticsPush(push) {
    return pushBody(push.pushId, push.payloadSha256, push.events, push.callerMetrics, push.schema);
}
function hex(bytes) {
    return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function sha256Hex(text) {
    return hex(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
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
export function createFetchAnalyticsSink(options) {
    const endpoint = assertEndpoint(options.endpoint);
    const pushKey = assertPushKey(options.pushKey);
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
        throw new Error('createFetchAnalyticsSink: timeoutMs must be a positive whole number of milliseconds. ' +
            'A budget that never expires is the request that hangs the flush forever.');
    }
    const doFetch = options.fetchImpl ?? globalThis.fetch;
    if (typeof doFetch !== 'function') {
        throw new Error('createFetchAnalyticsSink: no fetch implementation. Pass one as `fetchImpl`, or run on a ' +
            'runtime that has it. This package will not add a dependency to get one.');
    }
    return {
        async send(push) {
            const body = serializeAnalyticsPush(push);
            // A flag, not an inspection of the caught value. The caught value is
            // upstream text carrying a URL and a cause, and `agent.ts` already has
            // the note on why that text is not the thing to branch on.
            let timedOut = false;
            const controller = new AbortController();
            const timer = setTimeout(() => {
                timedOut = true;
                controller.abort();
            }, timeoutMs);
            let response;
            try {
                response = await doFetch(endpoint, {
                    method: 'POST',
                    headers: {
                        // The push key goes here and nowhere else: not in the body, not in a
                        // query string, not in a log line. It is a bearer credential and the
                        // receiver's own README says so.
                        authorization: `Bearer ${pushKey}`,
                        'content-type': 'application/json',
                        accept: 'application/json',
                    },
                    body,
                    signal: controller.signal,
                });
            }
            catch {
                return { ok: false, reason: timedOut ? 'timeout' : 'transport_error', status: 0 };
            }
            finally {
                clearTimeout(timer);
            }
            const parsed = await response.json().catch(() => null);
            if (!response.ok) {
                return { ok: false, ...refusalOf(parsed, response), ...retryAfterOf(response) };
            }
            return asSendResult(parsed) ?? { ok: false, reason: 'malformed_response', status: response.status };
        },
    };
}
/**
 * A refusal, read off the receiver's own body.
 *
 * `detail` is not taken. It is a literal from the receiver's own table — nothing
 * the caller sent is ever reflected into it — so keeping it would be harmless
 * and adding it to a log would be a paragraph of English that a machine cannot
 * route on. `reason` is the part a caller acts on (invariant 2).
 */
function refusalOf(parsed, response) {
    const reason = isRecord(parsed) && typeof parsed['reason'] === 'string' ? parsed['reason'] : '';
    return { reason: reason === '' ? `http_${response.status}` : reason, status: response.status };
}
function retryAfterOf(response) {
    const header = response.headers.get('retry-after');
    if (header === null)
        return {};
    const seconds = Number(header);
    if (!Number.isSafeInteger(seconds) || seconds < 0)
        return {};
    return { retryAfterSeconds: seconds };
}
/**
 * A send result, read field by field against the closed shape in
 * `AnalyticsSendResult`, or `null` when it is not one.
 *
 * One reader, two callers: the fetch sink for the 200 body, and the recorder for
 * whatever a merchant's own sink returned. A sink is merchant code on the same
 * footing as a `policyInputFor`, and reading its return value through the same
 * validation is what stops a sink that answers `undefined` from becoming a
 * `TypeError` inside a `flush()` a merchant was told cannot throw.
 *
 * A malformed result is a failure, not a partial success. A number this module
 * reports and the number the database counted must never come from two different
 * readings of one response, which is the same reason the receiver refuses to
 * trust its own RPC output without a check.
 */
function asSendResult(parsed) {
    if (!isRecord(parsed))
        return null;
    if (parsed['ok'] === true) {
        const pushId = parsed['pushId'];
        const replay = parsed['replay'];
        const eventsWritten = parsed['eventsWritten'];
        const callerMetricsWritten = parsed['callerMetricsWritten'];
        if (typeof pushId !== 'string')
            return null;
        if (typeof replay !== 'boolean')
            return null;
        if (!wholeNumberIn(eventsWritten, 0, MAX_EVENTS))
            return null;
        if (!wholeNumberIn(callerMetricsWritten, 0, MAX_METRICS))
            return null;
        return { ok: true, pushId, replay, eventsWritten, callerMetricsWritten };
    }
    if (parsed['ok'] === false) {
        const reason = parsed['reason'];
        const status = parsed['status'];
        if (typeof reason !== 'string' || reason === '')
            return null;
        if (!wholeNumberIn(status, 0, 599))
            return null;
        const retryAfterSeconds = parsed['retryAfterSeconds'];
        if (retryAfterSeconds === undefined)
            return { ok: false, reason, status };
        if (!wholeNumberIn(retryAfterSeconds, 0, 86_400))
            return null;
        return { ok: false, reason, status, retryAfterSeconds };
    }
    return null;
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function wholeNumberIn(value, min, max) {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}
/**
 * The endpoint, refused rather than coerced.
 *
 * `http:` is allowed on a loopback host and nowhere else, because the push key
 * is a bearer credential and sending it in the clear to a remote host is not a
 * configuration mistake — it is a credential on a wire anyone can read. A
 * merchant developing against a local mock is not the case this rule is about.
 */
function assertEndpoint(endpoint) {
    if (typeof endpoint !== 'string' || endpoint.trim() === '') {
        throw new Error('createFetchAnalyticsSink: an explicit endpoint is required. Analytics is off unless a ' +
            'merchant names a URL and a push key, so there is no default to fall back to.');
    }
    let parsed;
    try {
        parsed = new URL(endpoint);
    }
    catch {
        throw new Error('createFetchAnalyticsSink: the endpoint is not an absolute URL. It must be a full URL, ' +
            'because the receiver is a server and a relative path resolves against nothing here.');
    }
    if (parsed.protocol === 'https:')
        return parsed.toString();
    if (parsed.protocol === 'http:' && LOOPBACK.has(parsed.hostname))
        return parsed.toString();
    throw new Error('createFetchAnalyticsSink: the endpoint must be https, or http on a loopback host for local ' +
        'development. The push key is a bearer credential and http sends it in the clear.');
}
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
/**
 * A sanity check on the push key, not a re-implementation of it.
 *
 * The format is the receiver's, and this deliberately does not parse it: a copy
 * of their token grammar here is a second definition that drifts, and a drift
 * would refuse a perfectly valid key. What this catches is the mistake the
 * receiver's own docs warn about at length — pasting a Supabase `service_role`
 * or anon key into this field — plus control characters, which are a log
 * injection primitive in any system that ever prints a credential.
 *
 * The key is never echoed. The error names the shape, not the value.
 */
function assertPushKey(pushKey) {
    if (typeof pushKey !== 'string' || pushKey === '') {
        throw new Error('createFetchAnalyticsSink: a push key is required. It is issued per tenant and presented as ' +
            'a bearer credential; there is no default.');
    }
    if (pushKey.length > 512) {
        throw new Error('createFetchAnalyticsSink: the push key is longer than the receiver accepts.');
    }
    for (let i = 0; i < pushKey.length; i += 1) {
        const code = pushKey.charCodeAt(i);
        if (code < 0x21 || code > 0x7e) {
            throw new Error('createFetchAnalyticsSink: the push key contains a character no credential may contain.');
        }
    }
    if (!pushKey.startsWith('apk1.')) {
        throw new Error('createFetchAnalyticsSink: that is not a push key. Push keys begin with "apk1." and are ' +
            'issued per tenant. A Supabase service_role or anon key is not a push key, and sending ' +
            'one here would hand a full-bypass credential to a public ingest endpoint.');
    }
    return pushKey;
}
/**
 * Counts outcomes and turns them into pushes.
 *
 * Never called from the enforcement path, never awaited by one, and incapable
 * of throwing into one: `record()` is a map write, and `flush()` catches
 * everything a sink can do.
 */
export class AnalyticsRecorder {
    sink;
    clock;
    newPushId;
    shared;
    maxEvents;
    maxMetrics;
    cells = new Map();
    metrics = new Map();
    droppedEvents = 0;
    droppedMetrics = 0;
    constructor(options = {}) {
        this.sink = options.sink ?? disabledSink();
        this.clock = options.clock ?? (() => new Date());
        this.newPushId = options.newPushId ?? (() => globalThis.crypto.randomUUID());
        this.shared = options.capabilityNames === undefined ? null : new Set(options.capabilityNames);
        this.maxEvents = boundedPositive(options.maxEventsPerPush, MAX_EVENTS, 'maxEventsPerPush');
        this.maxMetrics = boundedPositive(options.maxCallerMetricsPerPush, MAX_METRICS, 'maxCallerMetricsPerPush');
    }
    /**
     * What is waiting to be pushed. `events` is the number of distinct cells, not
     * the sum of their counts, because a cell is what a push spends; `dropped` is
     * the opposite, counted in outcomes, because that is the unit the merchant lost.
     */
    pending() {
        return {
            events: this.cells.size,
            callerMetrics: this.metrics.size,
            dropped: this.droppedEvents,
            droppedCallerMetrics: this.droppedMetrics,
        };
    }
    /**
     * Records one event into its cell, creating the cell on first sight.
     *
     * Silent about a dropped cell by design: this runs on the merchant's request
     * path, and a function that reported failures there would be a function
     * somebody would put in an `if`. The count of what was lost is in `pending()`
     * and in the flush result, which is where a merchant actually reads it.
     */
    record(event) {
        const cell = this.cellFor(event);
        if (cell === null) {
            // Counted even though nothing was stored. A cell that is not representable
            // is a count the merchant will never see, and a recorder that dropped it
            // silently would be indistinguishable from one that never received it.
            this.droppedEvents += wholeNumberIn(event.count, 1, MAX_COUNT) ? event.count : 1;
            return;
        }
        const key = cellKey(cell);
        const existing = this.cells.get(key);
        if (existing === undefined) {
            // The ceiling that keeps this map a function of the merchant's own
            // surface rather than of what an agent chooses to type. An agent can mint
            // capability names, and a name that is not on the allowlist is dropped
            // before it gets here — so this bound is the second line, for the
            // merchant who chose not to configure one. New cells are refused rather
            // than the oldest evicted: eviction would silently discard a count that
            // was real, and this is a counter, not a cache. Nothing waits for the next
            // flush either — a window that spilled would be a queue, and a queue is a
            // durability claim this module does not make.
            if (this.cells.size >= this.maxEvents) {
                this.droppedEvents += cell.count;
                return;
            }
            this.cells.set(key, cell);
            return;
        }
        const total = existing.count + cell.count;
        if (total <= MAX_COUNT) {
            existing.count = total;
            return;
        }
        // Clamped, and the excess counted as dropped. Reporting a number the
        // merchant's own data does not support is the one failure mode a count
        // cannot have: the chart would be a fabrication with a receipt attached.
        existing.count = MAX_COUNT;
        this.droppedEvents += total - MAX_COUNT;
    }
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
    recordOutcome(outcome, context) {
        if (outcome.status === 'ok') {
            this.record({
                capability: context.capability,
                kind: outcome.data === null || outcome.data === undefined ? 'empty_result' : 'executed',
                assurance: context.assurance,
                occurredAt: context.occurredAt,
            });
            return;
        }
        if (outcome.status === 'denied') {
            this.record({
                capability: context.capability,
                kind: 'denied',
                assurance: context.assurance,
                occurredAt: context.occurredAt,
                denialReason: outcome.reason,
                policyRule: outcome.rule,
            });
            return;
        }
        if (outcome.status === 'pending_approval') {
            this.record({
                capability: context.capability,
                kind: 'held',
                assurance: context.assurance,
                occurredAt: context.occurredAt,
            });
            return;
        }
        if (outcome.status === 'error') {
            // `message` is deliberately not read. It is the least controlled input in
            // the system: a handler's own words, which `agent.ts` already reduces to
            // one line before it reaches anywhere.
            this.record({
                capability: context.capability,
                kind: 'executed',
                assurance: context.assurance,
                occurredAt: context.occurredAt,
            });
            return;
        }
        this.record({
            capability: context.capability,
            kind: 'asked',
            assurance: context.assurance,
            occurredAt: context.occurredAt,
        });
    }
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
    recordCallerMetric(metric) {
        const windowStart = this.shareable(metric.capability) ? instant(metric.windowStart) : null;
        const windowEnd = windowStart === null ? null : instant(metric.windowEnd);
        if (windowStart === null || windowEnd === null || !(windowStart < windowEnd)) {
            this.droppedMetrics += 1;
            return;
        }
        const verified = metric.verifiedCallers;
        const unverified = metric.unverifiedCallers;
        const hasVerified = wholeNumberIn(verified, 1, MAX_CALLER_COUNT);
        const hasUnverified = wholeNumberIn(unverified, 1, MAX_CALLER_COUNT);
        // The receiver's `bad_assurance_split`: both or neither is a row that cannot
        // say how many callers there were without also saying which kind.
        if (hasVerified === hasUnverified) {
            this.droppedMetrics += 1;
            return;
        }
        const row = { capability: metric.capability, windowStart, windowEnd };
        // The check above proved exactly one of these is a number in range, so
        // assigning both is the same statement twice and at most one can be set.
        if (hasVerified)
            row.verifiedCallers = verified;
        if (hasUnverified)
            row.unverifiedCallers = unverified;
        const key = metricKey(metric.capability, windowStart, windowEnd, row);
        const existing = this.metrics.get(key);
        if (existing !== undefined) {
            this.metrics.set(key, largerCallerCount(existing, row));
            return;
        }
        if (this.metrics.size >= this.maxMetrics) {
            this.droppedMetrics += 1;
            return;
        }
        this.metrics.set(key, row);
    }
    /**
     * Sends what is waiting, if anything, and clears the window.
     *
     * The window is cleared on every path, including the failures. Retaining a
     * failed push's cells would merge two windows into one aggregate and make
     * `occurredAt` a lie about when the events happened; the counts are lost, and
     * the loss is in `dropped`, which is reported rather than merely counted.
     */
    async flush() {
        const result = await this.push();
        const dropped = this.droppedEvents;
        const droppedCallerMetrics = this.droppedMetrics;
        if (result.ok)
            return { ...result, dropped, droppedCallerMetrics };
        return { ...result, dropped, droppedCallerMetrics };
    }
    async push() {
        if (this.cells.size === 0 && this.metrics.size === 0) {
            return { ok: false, reason: 'empty', status: 0 };
        }
        // The whole window, with no remainder. A push is bounded by the same number
        // the window is, so a slice here could only ever be dead code — and a
        // remainder that waited for the next flush would be a queue, which is a
        // durability claim this module does not make. A merchant who wants the
        // counts out sooner flushes sooner.
        const events = [...this.cells.values()];
        const callerMetrics = [...this.metrics.values()];
        this.cells.clear();
        this.metrics.clear();
        const lost = totalCounted(events);
        const pushId = this.newPushId();
        if (!PUSH_ID.test(pushId)) {
            // A push id the receiver will refuse is a receipt nobody can reconcile,
            // so the counts go with it rather than sitting in a queue forever.
            this.droppedEvents += lost;
            this.droppedMetrics += callerMetrics.length;
            return { ok: false, reason: 'invalid_push_id', status: 0 };
        }
        const digest = await sha256Hex(analyticsProjectionBytes(pushId, events, callerMetrics));
        const push = {
            pushId: pushId.toLowerCase(),
            pushVersion: PUSH_VERSION,
            payloadSha256: digest,
            events,
            callerMetrics,
        };
        let sent;
        try {
            // Read through the same validator the fetch sink's response goes through.
            // A sink is merchant code, and `policyInputFor` already proved that what a
            // merchant-supplied function returns lands in a place it must not: a sink
            // answering `undefined` would be a `TypeError` in a `flush()` that was
            // documented as incapable of throwing.
            sent = asSendResult(await this.sink.send(push)) ?? {
                ok: false,
                reason: 'sink_malformed',
                status: 0,
            };
        }
        catch {
            this.droppedEvents += lost;
            this.droppedMetrics += callerMetrics.length;
            return { ok: false, reason: 'sink_threw', status: 0 };
        }
        if (!sent.ok) {
            // Everything drained here is gone: not accepted, and not retained for
            // later. Counting it is what makes `dropped` mean "outcomes this recorder
            // will never send" rather than "cells this recorder could not represent",
            // which is the only reading a merchant can act on.
            this.droppedEvents += lost;
            this.droppedMetrics += callerMetrics.length;
            return sent;
        }
        // On success the receiver's counts are the authority and are reported as
        // they arrived. A shortfall against the rows we sent is *not* added to
        // `dropped`: which rows it skipped is not in the response, so any number
        // here would be a guess about which requests the merchant lost telemetry
        // for. The receipt is the reconciliation point; `dropped` is for losses this
        // module can point at.
        return {
            ok: true,
            pushId: sent.pushId,
            replay: sent.replay,
            eventsWritten: sent.eventsWritten,
            callerMetricsWritten: sent.callerMetricsWritten,
            payloadSha256: digest,
            bytes: serializeAnalyticsPush(push).length,
        };
    }
    /**
     * Validates one event into the exact row that will go on the wire, or `null`
     * when it is not representable.
     *
     * The checks are the receiver's, run here so a bad row costs one cell rather
     * than the batch. Nothing is sanitised: a value that is not the right shape is
     * refused, because a sanitised value is a value whose meaning depends on a
     * filter somebody has to maintain forever.
     */
    cellFor(event) {
        if (typeof event?.capability !== 'string' || !this.shareable(event.capability))
            return null;
        if (!KIND_SET.has(event.kind))
            return null;
        if (!ASSURANCE_SET.has(event.assurance))
            return null;
        const count = event.count === undefined ? 1 : event.count;
        if (!wholeNumberIn(count, 1, MAX_COUNT))
            return null;
        const at = instant(event.occurredAt ?? this.clock().toISOString());
        if (at === null)
            return null;
        // `analytics_events_denial_shape`, mirrored: a `denied` row that does not
        // name its cause has lost the only thing a refusal has, and a non-denial
        // carrying a reason is a chart that counts a refusal that did not happen.
        const wantsCause = event.kind === 'denied';
        const hasCause = typeof event.denialReason === 'string' &&
            DENIAL_REASON_SET.has(event.denialReason) &&
            typeof event.policyRule === 'string' &&
            POLICY_RULE.test(event.policyRule);
        if (wantsCause !== hasCause)
            return null;
        const cell = {
            capability: event.capability,
            kind: event.kind,
            assurance: event.assurance,
            count,
            occurredAt: at,
        };
        if (wantsCause) {
            cell.denialReason = event.denialReason;
            cell.policyRule = event.policyRule;
        }
        return cell;
    }
    shareable(capability) {
        if (!CAPABILITY_NAME.test(capability))
            return false;
        return this.shared === null || this.shared.has(capability);
    }
}
/**
 * The cell identity. Every field that makes two events distinct rows is in it,
 * because two events differing only in a field that is not in the key would be
 * counted as one — and a `denied` with `rate_limited` folded into a `denied`
 * with `max_order_value` is a chart that cannot answer a question.
 */
function cellKey(cell) {
    return [
        cell.capability,
        cell.kind,
        cell.assurance,
        cell.denialReason ?? '',
        cell.policyRule ?? '',
    ].join(' ');
}
/**
 * The outcomes a set of cells stands for.
 *
 * Summing `count` is what makes `dropped` a number the merchant can compare
 * against their own access log. A cell count would be a number about this
 * module's internals, and the two differ by six orders of magnitude on a busy
 * afternoon.
 */
function totalCounted(events) {
    let total = 0;
    for (const event of events)
        total += event.count;
    return total;
}
/**
 * The metric identity: capability, window, and assurance class.
 *
 * The class is in the key because the receiver's `analytics_caller_metrics`
 * holds one row per class and the split is the reason that table exists — a key
 * without it would make the second class of a window overwrite the first.
 */
function metricKey(capability, windowStart, windowEnd, row) {
    const assurance = row.verifiedCallers === undefined ? 'unverified' : 'verified';
    return [capability, windowStart, windowEnd, assurance].join('\u0000');
}
/**
 * The larger of two set sizes for the same capability, window and class.
 *
 * Never the sum: a distinct count is not additive, and a receiver holding both
 * rows would store both, so any reader who added them would double-count one
 * population.
 */
function largerCallerCount(a, b) {
    if (a.verifiedCallers !== undefined && b.verifiedCallers !== undefined) {
        return b.verifiedCallers > a.verifiedCallers ? b : a;
    }
    if (a.unverifiedCallers !== undefined && b.unverifiedCallers !== undefined) {
        return b.unverifiedCallers > a.unverifiedCallers ? b : a;
    }
    // Unreachable: the key carries the class, so two rows reaching here agree.
    return a;
}
/** A timestamp normalised to the ISO form the receiver stores, or refused. */
function instant(value) {
    if (typeof value !== 'string')
        return null;
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed))
        return null;
    return new Date(parsed).toISOString();
}
function boundedPositive(value, fallback, name) {
    if (value === undefined)
        return fallback;
    if (!Number.isSafeInteger(value) || value <= 0 || value > fallback) {
        throw new Error(`AnalyticsRecorder: ${name} must be a whole number in [1, ${fallback}]. The upper bound is ` +
            "the receiver's own; sending more rows than it accepts fails the whole push.");
    }
    return value;
}
/**
 * The default sink, and the only thing in this file that knows analytics can be
 * off.
 *
 * It returns `disabled` rather than a success, so a merchant who wired a
 * recorder and forgot a sink sees why in the result instead of a chart that
 * never moves and a receipt that says everything was fine.
 */
function disabledSink() {
    return {
        async send() {
            return { ok: false, reason: 'disabled', status: 0 };
        },
    };
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
export function distinctCallers(entries) {
    const verified = new Set();
    const unverified = new Set();
    for (const entry of entries) {
        // The same statement as `agent.ts` writes into a row for a request with no
        // identity: an empty name is not an identity, and counting it as a distinct
        // caller is counting a bucket that never existed.
        if (typeof entry.agentId !== 'string' || entry.agentId === '')
            continue;
        if (entry.assurance === 'verified')
            verified.add(entry.agentId);
        else if (entry.assurance === 'unverified')
            unverified.add(entry.agentId);
    }
    return { verified: verified.size, unverified: unverified.size };
}
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
export function callerMetrics(capability, window, counts) {
    const rows = [];
    if (counts.verified > 0) {
        rows.push({
            capability,
            windowStart: window.start,
            windowEnd: window.end,
            verifiedCallers: counts.verified,
        });
    }
    if (counts.unverified > 0) {
        rows.push({
            capability,
            windowStart: window.start,
            windowEnd: window.end,
            unverifiedCallers: counts.unverified,
        });
    }
    return rows;
}
//# sourceMappingURL=analytics.js.map
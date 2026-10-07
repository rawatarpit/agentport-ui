/**
 * Runtime call recorder — what the website actually calls.
 *
 * ## Why this module records shapes and not traffic
 *
 * A route dump and a contract both describe an API. Neither can tell you which
 * endpoints the frontend *reaches*, because the call has to happen first. So
 * the third pass observes requests as they leave — and this is the pass where
 * the privacy question stops being hypothetical, because a captured request
 * body is a real customer's real data.
 *
 * So: field names, never field values. A body of `{"amount":50000,"email":
 * "jane@doe.com"}` contributes `amount` and `email` and nothing else. That is
 * the same posture as `schema_push`, for the same reason — the useful artifact
 * is the contract, and the contract does not need a customer in it.
 *
 * ## The path problem, and why frequency is the answer
 *
 * `/orders/4417` and `/orders/black-friday-deal` are the same endpoint, and the
 * difference between a route name and a customer's slug is not visible in
 * either one. Every heuristic that tries to guess from the segment fails on
 * real data: `/customers/jane-smith` is lowercase, hyphenated and
 * word-shaped, so any rule for "looks like a slug" also matches
 * `/order-items`, and any rule that keeps it writes a customer's name to disk.
 *
 * So the recorder does not guess from the segment. It decides from repetition:
 * a segment is a route name only if it appears in the same position across
 * more than one observed call, and anything seen once is `{id}`. `orders`
 * recurs, so it survives. `jane-smith` appears once, so it becomes `{id}` and
 * the name never reaches the file. Numeric ids, UUIDs and long opaque tokens are
 * `{id}` immediately and never enter the frequency table at all.
 *
 * This is why the recorder is stateful and why `observe` is called per request.
 * There is no single-call answer; there is only a converged one.
 *
 * ## Requests carrying credentials are not recorded
 *
 * An authenticated request would contribute the most useful inventory — the
 * calls the app actually makes in production shape. It is also the one holding
 * a bearer token, a session cookie, and a body containing whatever the customer
 * typed. Recording it means holding someone's live credential briefly so we can
 * leak it later, which is not a trade worth making for inventory completeness.
 *
 * So a request carrying `Authorization` or `Cookie` is forwarded and not
 * recorded. The cost is real and stated in the inventory: those endpoints stay
 * invisible until a contract or a route dump names them. The mitigation is the
 * other two passes, which is the reason the ordering is route dump → contract →
 * capture rather than capture first.
 *
 * ## Origin policy
 *
 * This recorder is going to sit on loopback and be pointed at by the merchant's
 * frontend, which makes it a relay on the merchant's machine. Any page the
 * merchant visits can issue a cross-origin request to `127.0.0.1`, and a
 * browser will not stop the request just because it cannot read the response.
 *
 * A request that names an `Origin` we were not told to allow is refused, not
 * recorded-and-forwarded — refusing is the only version of this that is not an
 * open relay. A request with *no* `Origin` is allowed, because that is
 * non-browser traffic on the merchant's own machine, which is not the threat
 * being modelled.
 */
export interface CaptureRequest {
    method: string;
    /** Raw path with query string, e.g. `/orders/4417/items?status=open`. */
    target: string;
    /** Header names lowercased by the caller. Values are never recorded. */
    headers: Record<string, string>;
    /** Raw request body, if any. */
    body?: string | undefined;
}
export interface CapturedCall {
    method: string;
    /** Path with non-recurring segments replaced by `{id}`. */
    pattern: string;
    /** Query parameter names, never values. */
    parameters: string[];
    /** Top-level body field names, never values. */
    body: string[];
    /** How many times this exact call was seen. */
    calls: number;
}
export interface RecorderOptions {
    /**
     * Origins permitted to make recorded requests.
     *
     * Empty means no browser origin is permitted, which is the right default: a
     * merchant must name their own site. A wildcard is not accepted, because
     * "allow any page in the browser to use this relay" is the failure this
     * policy exists to prevent.
     */
    allowOrigins?: readonly string[];
    /**
     * Observations before a segment in the same position counts as a route name.
     *
     * Two means "seen twice". One would make every segment dynamic; a higher value
     * is safer still but leaves real routes templated away, which understates the
     * surface. Two is the smallest value at which a single call cannot mint a
     * route name.
     */
    staticThreshold?: number;
    /**
     * Hard cap on distinct segment-position entries, to bound memory.
     *
     * The cap has a cost, and it is the safe direction. Once reached, a segment
     * that has not been seen before stays `{id}` forever, so a genuinely new
     * route name cannot resolve from this pass alone. That under-approximates the
     * surface rather than over-approximating it, which is the only acceptable way
     * to fail here: the route-dump and spec passes still name the real routes,
     * whereas a guess at this point could put a slug on disk.
     */
    maxSegments?: number;
    /**
     * Distinct raw paths retained in memory. Above this, further distinct paths
     * are forwarded but not recorded, and the loss is reported.
     */
    maxPaths?: number;
}
export type Refusal = 'origin_not_allowed';
export interface Observation {
    decision: 'record' | 'forward_only' | 'refuse';
    /**
     * Why a request was forwarded without being recorded. Present only for
     * `forward_only`.
     */
    skipped?: 'credentials' | 'path_cap';
    /** Present only for `refuse`. */
    refusal?: Refusal;
    /** The merged call, when `decision` is `record`. */
    call?: CapturedCall;
}
export declare class CallRecorder {
    private readonly allowOrigins;
    private readonly threshold;
    private readonly maxSegments;
    private readonly maxPaths;
    /** Observations dropped because they named a path past `maxPaths`. */
    private overflow;
    /**
     * position -> segment -> times seen in that position.
     *
     * Per position, not global. `/v1/orders` and `/v1/items` share position 1, so
     * a global tally would let one of them make the other's slot look settled.
     * Per-position counting means a segment is a route name only in the places it
     * actually repeats, which is what keeps `orders` literal while `items` in the
     * same slot stays `{id}`.
     */
    private readonly positions;
    /** Raw observations, keyed by a pattern-independent identity. */
    private readonly seen;
    private credentialSkips;
    constructor(options: RecorderOptions);
    /**
     * Classify one request.
     *
     * Order matters and is the security order: origin first, because a refused
     * request must not have reached the recorder's state at all; then credentials,
     * because a request carrying a token must never contribute a segment to the
     * frequency table even though it is forwarded.
     */
    observe(request: CaptureRequest): Observation;
    /** Total distinct segments held across all positions. */
    private segmentCount;
    /** Resolve one raw observation into its current pattern and fields. */
    private derive;
    /**
     * The accumulated inventory, sorted so two runs can be diffed.
     *
     * `calls` is the one number here that describes customers rather than
     * endpoints — how often each endpoint was hit. It is reported separately from
     * the shape so a merchant can have the shape without it.
     */
    inventory(): CapturedCall[];
    /**
     * How many requests were forwarded without being recorded.
     *
     * Reported rather than omitted, because an inventory that silently excludes
     * the authenticated calls is indistinguishable from an inventory of an app
     * that makes no authenticated calls — and the second is a finding, the first
     * is our policy. A merchant seeing a large number here knows the shape list is
     * a floor, not a ceiling.
     */
    /**
     * Whether this origin is permitted.
     *
     * Exposed so the relay has one definition of the rule rather than two. The
     * relay needs the answer before it reads a body and before it answers a
     * preflight, both of which happen before `observe`; re-deriving the policy in
     * the transport is how a refused origin quietly becomes a permitted one.
     */
    allowsOrigin(origin: string): boolean;
    overflowCount(): number;
    /**
     * How many requests were forwarded without being recorded.
     *
     * Reported rather than omitted, because an inventory that silently excludes
     * the authenticated calls is indistinguishable from an inventory of an app
     * that makes no authenticated calls — and the second is a finding, the first
     * is our policy. A merchant seeing a large number here knows the shape list is
     * a floor, not a ceiling.
     */
    credentialSkipped(): number;
}
//# sourceMappingURL=capture.d.ts.map
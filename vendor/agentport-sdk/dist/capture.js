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
const DEFAULT_MAX_SEGMENTS = 5000;
/**
 * Distinct raw paths held in memory.
 *
 * Separate from `maxSegments`, which bounds the *frequency* table. That
 * distinction was a real leak: 5000 requests to `/orders/1 … /orders/5000` grew
 * the frequency table by one entry and the raw-path map by 5000, so the cap
 * that looked like a memory bound bounded almost nothing. Those entries are also
 * per-customer URLs, so an unbounded map is a retention problem as much as a
 * denial-of-service one — the output collapses them to `/orders/{id}` while
 * every customer identifier sits in memory for the length of the session.
 *
 * The cap is generous because a real app has far fewer distinct paths than
 * requests. Past it, an observation is dropped rather than counted into an
 * invented bucket, and `overflowCount()` reports the loss — a capture that
 * quietly undercounts is worse than one that says it stopped.
 */
const DEFAULT_MAX_PATHS = 10_000;
/** A segment that is certainly not a route name, decided without repetition. */
function isOpaqueToken(segment) {
    if (/^\d+$/.test(segment))
        return true;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment))
        return true;
    // Prefixed ids are the norm in commerce: ord_4417, sk_live_abc, cus_9f2a.
    if (/^[a-z]{2,8}_\w{4,}$/i.test(segment))
        return true;
    // A long opaque run is a token, not a word. Short words are left to the
    // frequency rule so `/orders` and `/items` are not templated away.
    if (segment.length >= 24 && !segment.includes('-'))
        return true;
    return false;
}
/**
 * Decide whether a segment is a route name.
 *
 * The frequency table is the whole mechanism: a value seen at least
 * `staticThreshold` times in one position is a route name, and anything else is
 * `{id}`. Nothing here inspects the segment's spelling, because spelling is
 * what carries the customer data.
 */
function isStatic(tally, segment, threshold) {
    if (isOpaqueToken(segment))
        return false;
    return (tally?.get(segment) ?? 0) >= threshold;
}
function splitTarget(target) {
    const [rawPath = '', rawQuery = ''] = target.split('?', 2);
    const path = rawPath === '' ? '/' : rawPath;
    const query = rawQuery === '' ? [] : rawQuery.split('&').filter((p) => p !== '').map((p) => decodeURIComponent(p.split('=', 1)[0] ?? ''));
    return { path, query };
}
/**
 * Top-level field names of a JSON body.
 *
 * Values are never read. A body that is not JSON contributes no names and is
 * not an error — form posts and file uploads are legitimate traffic, and
 * refusing the whole call because the body was not parseable would hide real
 * endpoints from the inventory.
 */
function bodyFieldNames(raw) {
    if (raw === undefined || raw === '')
        return [];
    try {
        const parsed = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
            return [];
        return Object.keys(parsed).sort();
    }
    catch {
        return [];
    }
}
export class CallRecorder {
    allowOrigins;
    threshold;
    maxSegments;
    maxPaths;
    /** Observations dropped because they named a path past `maxPaths`. */
    overflow = 0;
    /**
     * position -> segment -> times seen in that position.
     *
     * Per position, not global. `/v1/orders` and `/v1/items` share position 1, so
     * a global tally would let one of them make the other's slot look settled.
     * Per-position counting means a segment is a route name only in the places it
     * actually repeats, which is what keeps `orders` literal while `items` in the
     * same slot stays `{id}`.
     */
    positions = new Map();
    /** Raw observations, keyed by a pattern-independent identity. */
    seen = new Map();
    credentialSkips = 0;
    constructor(options) {
        // Defaulted here rather than at each call site. An empty allowlist is the
        // safe direction: nothing is permitted until a caller names it, so a hook
        // constructed with no options records server calls and refuses browser
        // origins instead of the reverse.
        this.allowOrigins = new Set(options.allowOrigins ?? []);
        // Floor of 2 is enforced rather than trusted. `staticThreshold: 1` would
        // make every segment dynamic, turning `/api/orders` into `/api/{id}` and
        // reporting a route table that describes no route.
        this.threshold = Math.max(2, options.staticThreshold ?? 2);
        this.maxSegments = options.maxSegments ?? DEFAULT_MAX_SEGMENTS;
        this.maxPaths = Math.max(1, options.maxPaths ?? DEFAULT_MAX_PATHS);
    }
    /**
     * Classify one request.
     *
     * Order matters and is the security order: origin first, because a refused
     * request must not have reached the recorder's state at all; then credentials,
     * because a request carrying a token must never contribute a segment to the
     * frequency table even though it is forwarded.
     */
    observe(request) {
        const origin = request.headers['origin'];
        if (origin !== undefined && !this.allowOrigins.has(origin)) {
            return { decision: 'refuse', refusal: 'origin_not_allowed' };
        }
        const hasCredentials = request.headers['authorization'] !== undefined ||
            request.headers['cookie'] !== undefined ||
            request.headers['proxy-authorization'] !== undefined;
        if (hasCredentials) {
            this.credentialSkips += 1;
            return { decision: 'forward_only', skipped: 'credentials' };
        }
        const { path, query } = splitTarget(request.target);
        const segments = path.split('/').filter((s) => s !== '');
        // Count first, then decide — but the decision is deferred to `inventory()`.
        // Deciding here would freeze the pattern at the moment of first sight and a
        // segment could never graduate from `{id}` to a route name, which is the
        // whole convergence the frequency rule exists to provide.
        for (const [index, segment] of segments.entries()) {
            if (isOpaqueToken(segment))
                continue;
            let tally = this.positions.get(index);
            if (tally === undefined) {
                if (this.segmentCount() >= this.maxSegments)
                    continue;
                tally = new Map();
                this.positions.set(index, tally);
            }
            // The cap has to cover a *new* segment in an existing position too. Only
            // guarding new positions leaves the table unbounded: an attacker probing
            // distinct values in position 1 grows one tally without ever adding a
            // position, which is the unbounded path this cap exists to close.
            if (!tally.has(segment) && this.segmentCount() >= this.maxSegments)
                continue;
            tally.set(segment, (tally.get(segment) ?? 0) + 1);
        }
        const method = request.method.toUpperCase();
        const body = bodyFieldNames(request.body);
        // Identity is the raw path, so two calls to `/orders/1` and `/orders/2`
        // land on one entry and the count is right.
        const key = `${method} ${path}`;
        const existing = this.seen.get(key);
        if (existing === undefined && this.seen.size >= this.maxPaths) {
            // Dropped, not folded into a synthetic bucket: inventing a path to hold
            // the count would put a route in an inventory that has no such route.
            this.overflow += 1;
            return { decision: 'forward_only', skipped: 'path_cap' };
        }
        if (existing !== undefined) {
            existing.calls += 1;
            // Union rather than replace: two calls to one endpoint can send different
            // optional fields, and the inventory should show the union.
            existing.parameters = [...new Set([...existing.parameters, ...query])].sort();
            existing.body = [...new Set([...existing.body, ...body])].sort();
        }
        else {
            this.seen.set(key, { method, path, parameters: query.sort(), body, calls: 1 });
        }
        return { decision: 'record', call: this.derive(key) };
    }
    /** Total distinct segments held across all positions. */
    segmentCount() {
        let total = 0;
        for (const tally of this.positions.values())
            total += tally.size;
        return total;
    }
    /** Resolve one raw observation into its current pattern and fields. */
    derive(key) {
        const raw = this.seen.get(key);
        if (raw === undefined)
            throw new Error(`no observation for ${key}`);
        const segments = raw.path.split('/').filter((s) => s !== '');
        const pattern = segments
            .map((segment, index) => (isStatic(this.positions.get(index), segment, this.threshold) ? segment : '{id}'))
            .join('/');
        return {
            method: raw.method,
            pattern: pattern === '' ? '/' : `/${pattern}`,
            parameters: [...raw.parameters].sort(),
            body: [...raw.body].sort(),
            calls: raw.calls,
        };
    }
    /**
     * The accumulated inventory, sorted so two runs can be diffed.
     *
     * `calls` is the one number here that describes customers rather than
     * endpoints — how often each endpoint was hit. It is reported separately from
     * the shape so a merchant can have the shape without it.
     */
    inventory() {
        // Group by the *derived* pattern, not by the raw path. Raw paths are
        // per-customer URLs — `/orders/4417` and `/orders/4418` are two keys and one
        // endpoint, and emitting one row per URL would both inflate the count and
        // write a customer identifier per row.
        const merged = new Map();
        for (const key of this.seen.keys()) {
            const call = this.derive(key);
            const id = `${call.method} ${call.pattern}`;
            const existing = merged.get(id);
            if (existing === undefined) {
                merged.set(id, call);
                continue;
            }
            existing.calls += call.calls;
            existing.parameters = [...new Set([...existing.parameters, ...call.parameters])].sort();
            existing.body = [...new Set([...existing.body, ...call.body])].sort();
        }
        return [...merged.values()].sort((a, b) => a.pattern === b.pattern ? a.method.localeCompare(b.method) : a.pattern.localeCompare(b.pattern));
    }
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
    allowsOrigin(origin) {
        return this.allowOrigins.has(origin);
    }
    overflowCount() {
        return this.overflow;
    }
    /**
     * How many requests were forwarded without being recorded.
     *
     * Reported rather than omitted, because an inventory that silently excludes
     * the authenticated calls is indistinguishable from an inventory of an app
     * that makes no authenticated calls — and the second is a finding, the first
     * is our policy. A merchant seeing a large number here knows the shape list is
     * a floor, not a ceiling.
     */
    credentialSkipped() {
        return this.credentialSkips;
    }
}
//# sourceMappingURL=capture.js.map
/**
 * The capture listener — a loopback relay that watches what the merchant's
 * frontend calls and records the shape of it.
 *
 * ## What this is
 *
 * The merchant points their frontend's base URL here, clicks through their app,
 * and this writes down which endpoints were reached, with what field names. It
 * forwards everything upstream untouched, so their app behaves normally while
 * they use it.
 *
 * ## The three rules that make it safe
 *
 * 1. **Loopback only, refused explicitly.** This is a relay holding whatever
 *    requests the merchant's app makes. Enforced inside `startCaptureServer`
 *    rather than in flag parsing, because a check that lives in the caller can
 *    be bypassed by the next caller, and a check that cannot be bypassed is the
 *    only one worth having here.
 *
 * 2. **The upstream is frozen at startup.** No caller — browser, script, or
 *    anything else — can name a destination. A forwarder that takes a
 *    caller-supplied URL is an SSRF gadget no amount of policy on the recording
 *    side repairs.
 *
 * 3. **Recording is separate from forwarding, and both are bounded.** The body
 *    is buffered only to read field names from it, never to log it, and only up
 *    to a cap. Responses are streamed rather than buffered, so a file download
 *    or a streaming response is not held in memory by a merchant watching a
 *    demo. Nothing about a response is ever written to the inventory.
 *
 * ## No retry
 *
 * A failure upstream is reported to the caller as a failure and passed on
 * exactly once. A relay that retried would turn a transient network blip into a
 * second charge, and the merchant's app — which does have retry logic of its
 * own — is the component that should decide whether a write is re-attempted.
 */
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { CallRecorder } from './capture.js';
import { resolveTarget, TargetRejected } from './target.js';
/** Headers that describe one hop and must not be forwarded onward. */
const HOP_BY_HOP = new Set([
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'proxy-connection',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
]);
const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);
/**
 * Read a body, bounded twice.
 *
 * `inspectCap` bounds what we read *field names from*. `hardCap` bounds what we
 * are willing to relay, and past it we refuse with 413 rather than forwarding a
 * truncated body.
 *
 * The distinction is the whole point, and getting it wrong corrupts the
 * merchant's request. An earlier version skipped buffering anything over the cap
 * and forwarded the empty remainder: the upstream received `content-length: 0`
 * for a real 211-byte charge. Not knowing a field name costs an inventory entry;
 * silently emptying a write costs a customer's payment.
 *
 * Bytes are kept as a Buffer and relayed as-is, because a `utf8` round-trip
 * would corrupt a binary upload on its way past.
 */
async function readBody(request, inspectCap, hardCap) {
    const chunks = [];
    let size = 0;
    let overCap = false;
    for await (const chunk of request) {
        const buffer = chunk;
        size += buffer.length;
        if (size > hardCap)
            throw new BodyTooLarge();
        chunks.push(buffer);
        if (size > inspectCap)
            overCap = true;
    }
    const bytes = Buffer.concat(chunks);
    return { bytes, body: bytes.toString('utf8'), overCap };
}
/** Signals the hard relay cap, which is answered with 413 rather than truncated. */
class BodyTooLarge extends Error {
}
/**
 * CORS headers for a response going back to a named origin.
 *
 * `Vary: Origin` is not optional. Without it a cache shared between two runs, or
 * between the relay and the merchant's own API, can hand one origin a response
 * carrying another origin's `Access-Control-Allow-Origin` — which is a
 * credentialed read of one tenant's data by another's page.
 *
 * The specific origin is echoed rather than `*` because `*` is invalid alongside
 * `Access-Control-Allow-Credentials`, and credentialed requests are forwarded.
 */
function corsHeaders(origin) {
    if (origin === undefined)
        return { vary: 'Origin' };
    return {
        'access-control-allow-origin': origin,
        'access-control-allow-credentials': 'true',
        vary: 'Origin',
    };
}
function lowercased(request) {
    const out = {};
    for (const [name, value] of Object.entries(request.headers)) {
        if (typeof value === 'string')
            out[name.toLowerCase()] = value;
        // An array-valued header is not a single credential and is not recorded
        // anyway; names are what the recorder inspects, so a string is enough.
    }
    return out;
}
export async function startCaptureServer(options) {
    const host = options.host ?? '127.0.0.1';
    if (!LOOPBACK.has(host)) {
        throw new Error(`capture refuses to bind ${host}: it must be a loopback address (127.0.0.1, ::1, localhost)`);
    }
    // Frozen once. Every request below joins onto this, and nothing a caller
    // sends can change it.
    const base = new URL(options.upstream);
    if (base.protocol !== 'http:' && base.protocol !== 'https:') {
        throw new Error(`capture upstream must be http or https, not ${base.protocol}`);
    }
    const basePath = base.pathname.replace(/\/+$/, '');
    // The rule itself stays in the recorder; the transport asks it rather than
    // keeping a second copy. Origins are compared as exact strings — an origin is
    // scheme+host+port and the browser is the authority on it, so a near-miss is a
    // refusal, which is the direction that cannot leak. `null`, which a sandboxed
    // iframe or a `file://` page sends, is refused unless named.
    const isOriginAllowed = (origin) => options.recorder.allowsOrigin(origin);
    const timeoutMs = options.timeoutMs ?? 15_000;
    const maxBodyBytes = options.maxBodyBytes ?? 1024 * 1024;
    const maxRelayBytes = options.maxRelayBytes ?? 8 * 1024 * 1024;
    let refusedCount = 0;
    const server = createServer((request, response) => {
        void handle(request, response).catch(() => {
            // Nothing here may throw past this point: an unhandled rejection in a
            // relay leaves the merchant's request hanging with no response at all.
            if (!response.headersSent)
                response.writeHead(502);
            response.end();
        });
    });
    async function handle(request, response) {
        const headers = lowercased(request);
        const origin = headers['origin'];
        // CORS, and the reason this relay was unusable from a browser without it.
        //
        // A merchant's frontend calls its own API on its own origin. Pointing its
        // base URL at 127.0.0.1:8478 turns every one of those calls cross-origin,
        // so the browser applies CORS — and the merchant's real API has no CORS
        // headers, because it never needed any: it was same-origin. The relay
        // shipped with none either, so the documented workflow failed at the first
        // request with a CORS error, and `curl` smoke tests could not see it
        // because curl enforces no CORS.
        //
        // The headers are emitted only for an origin the merchant named, so this
        // does not make the relay readable by any page on the internet. Preflight is
        // answered here rather than forwarded, for the same reason the upstream has
        // no handler for it, and because recording it would put a spurious OPTIONS
        // row against every endpoint in the inventory.
        if (origin !== undefined && !isOriginAllowed(origin)) {
            refusedCount += 1;
            response.writeHead(403, { 'content-type': 'application/json' });
            response.end(JSON.stringify({ error: 'origin_not_allowed' }));
            return;
        }
        if (request.method === 'OPTIONS' && headers['access-control-request-method'] !== undefined) {
            response.writeHead(204, {
                ...corsHeaders(origin),
                'access-control-allow-methods': headers['access-control-request-method'] ?? 'GET, POST, PUT, PATCH, DELETE',
                'access-control-allow-headers': headers['access-control-request-headers'] ?? 'content-type',
                'access-control-max-age': '600',
            });
            response.end();
            return;
        }
        let read;
        try {
            read = await readBody(request, maxBodyBytes, maxRelayBytes);
        }
        catch (err) {
            if (!(err instanceof BodyTooLarge))
                throw err;
            // Refused rather than truncated. A partial body would be a corrupt write.
            response.writeHead(413, { 'content-type': 'application/json', ...corsHeaders(origin) });
            response.end(JSON.stringify({ error: 'body_too_large' }));
            return;
        }
        const { bytes, body, overCap } = read;
        const captured = {
            method: request.method ?? 'GET',
            target: request.url ?? '/',
            headers,
            body: overCap ? undefined : body,
        };
        const decision = options.recorder.observe(captured);
        if (decision.decision === 'refuse') {
            refusedCount += 1;
            // Refused, not forwarded. See rule 2 in the module comment.
            response.writeHead(403, { 'content-type': 'application/json' });
            response.end(JSON.stringify({ error: 'origin_not_allowed' }));
            return;
        }
        let target;
        try {
            target = resolveTarget(base, basePath, captured.target);
        }
        catch (err) {
            // A target that could name any host but the configured upstream is not a
            // request this relay will make. It is refused with 400 and named, so a
            // caller sending one learns the shape was wrong rather than retrying it
            // against every variant.
            if (!(err instanceof TargetRejected))
                throw err;
            response.writeHead(400, { 'content-type': 'application/json', ...corsHeaders(origin) });
            response.end(JSON.stringify({ error: 'bad_target' }));
            return;
        }
        const forward = {};
        for (const [name, value] of Object.entries(headers)) {
            if (HOP_BY_HOP.has(name))
                continue;
            if (name === 'host')
                continue;
            // Identity encoding keeps the response headers we pass through truthful.
            // Forwarding the client's `accept-encoding` and then rewriting
            // `content-encoding` after fetch decompresses is how a relay corrupts a
            // response body, and this is cheaper than getting that right.
            if (name === 'accept-encoding')
                continue;
            forward[name] = value;
        }
        const hasBody = captured.method !== 'GET' && captured.method !== 'HEAD' && bytes.length > 0;
        // The original `content-length` is dropped along with the body being
        // re-encoded: forwarding a stale length against a re-serialised body is how
        // a relay truncates a request it means to preserve.
        delete forward['content-length'];
        let upstream;
        try {
            upstream = await fetch(target, {
                method: captured.method,
                headers: forward,
                body: hasBody ? bytes : undefined,
                redirect: 'manual',
                signal: AbortSignal.timeout(timeoutMs),
            });
        }
        catch {
            // Reported as a failure and not retried. See the module comment.
            response.writeHead(502, { 'content-type': 'application/json' });
            response.end(JSON.stringify({ error: 'upstream_unavailable' }));
            return;
        }
        const headersOut = { ...corsHeaders(origin) };
        upstream.headers.forEach((value, name) => {
            if (!HOP_BY_HOP.has(name.toLowerCase()) && name.toLowerCase() !== 'content-length') {
                headersOut[name] = value;
            }
        });
        // Written after the upstream headers so the relay's own CORS answer cannot
        // be overwritten by a header the merchant's API happens to set.
        Object.assign(headersOut, corsHeaders(origin));
        response.writeHead(upstream.status, headersOut);
        if (upstream.body === null) {
            response.end();
            return;
        }
        // Streamed, never buffered. A file download passes through without being
        // held in memory, and nothing from the response reaches the recorder.
        Readable.fromWeb(upstream.body).pipe(response);
    }
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(options.port ?? 0, host, () => {
            server.removeListener('error', reject);
            resolve();
        });
    });
    const address = server.address();
    return {
        url: `http://${host}:${address.port}`,
        port: address.port,
        close: () => new Promise((resolve) => {
            server.closeAllConnections();
            server.close(() => resolve());
        }),
        refused: () => refusedCount,
    };
}
//# sourceMappingURL=capture-server.js.map
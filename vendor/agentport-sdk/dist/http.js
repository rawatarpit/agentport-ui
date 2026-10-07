import { resolveTarget, TargetRejected } from './target.js';
/**
 * Calling the merchant's own API on the agent's behalf.
 *
 * Everything security-relevant in this file is one rule: **the destination is
 * decided at build time and the caller supplies values only.** A caller that can
 * name a URL can reach every service the merchant's runtime can reach, which on
 * a cloud host includes the metadata endpoint. So the URL is parsed once, its
 * origin is asserted equal to the configured base, and the per-request path only
 * ever produces a target on that same origin.
 *
 * Three further properties are enforced here rather than left to review:
 *
 * - **Redirects are not followed.** A frozen destination is not a control if the
 *   upstream can answer `302 Location: <anything>`; the second hop is chosen by
 *   the server we trusted with the first. `redirect: 'manual'` hands the 3xx
 *   back so the agent can retry an explicit path.
 * - **Slot values are encoded and refused when they are path traversal.** `..`
 *   survives `encodeURIComponent`, and `/admin/{id}` with `id: '..'` is `/admin`
 *   — same origin, wrong endpoint, and a slot the merchant never described.
 * - **The response is capped.** An upstream that streams forever must not be able
 *   to exhaust the merchant's memory on the path that is supposed to be bounded.
 */
/** 1 MiB. A capability response larger than this is a bug upstream. */
const DEFAULT_MAX_RESPONSE_BYTES = 1_048_576;
/** Long enough for a slow third party, short enough that a wedge is visible. */
const DEFAULT_TIMEOUT_MS = 15_000;
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
/**
 * A failure with a machine-readable upstream status.
 *
 * Carries no response body. `agent.ts` puts `errorMessage(err)` into the ledger
 * on this path, and the ledger is read by people who did not make the request —
 * an upstream error page can contain the payload that failed, which is exactly
 * the material the redaction pass exists to keep out.
 */
export class HttpSourceError extends Error {
    upstreamStatus;
    constructor(message, upstreamStatus) {
        super(message);
        this.upstreamStatus = upstreamStatus;
        this.name = 'HttpSourceError';
    }
}
const SLOT = /\{([A-Za-z][A-Za-z0-9_]{0,63})\}/g;
/** Slot names in a template, in order, duplicates collapsed. */
export function slotsIn(template) {
    return [...template.matchAll(SLOT)].map((m) => m[1]);
}
/** Values that survive encoding and still walk the path. */
function isTraversal(value) {
    return value === '.' || value === '..' || value.split('/').some((p) => p === '..');
}
/**
 * Resolve the frozen destination at build time.
 *
 * Throws on anything that could later name a different origin, so a bad config
 * stops the server at startup instead of reaching a customer's host on a
 * request someone happens to make three weeks later.
 */
export function resolveFrozenTarget(baseUrl, raw) {
    let base;
    try {
        base = new URL(baseUrl);
    }
    catch {
        throw new Error(`baseUrl is not a URL: ${baseUrl}`);
    }
    if (raw.startsWith('/')) {
        // Delegated to the same hardened resolver the capture relay uses, including
        // its origin-equality assertion. One implementation of "this target cannot
        // name another host", not two.
        return resolveTarget(base, '', raw);
    }
    let parsed;
    try {
        parsed = new URL(raw);
    }
    catch {
        throw new Error(`source.url is not a URL: ${raw}`);
    }
    if (parsed.origin !== base.origin) {
        throw new Error(`source.url points at ${parsed.origin} but baseUrl is ${base.origin}. ` +
            `A capability may only reach its own merchant's API.`);
    }
    if (raw.includes('?') || raw.includes('#')) {
        throw new Error('source.url must not carry a query or fragment; use source.query instead.');
    }
    return parsed;
}
/**
 * Substitute declared slots with encoded caller values.
 *
 * `bindings` is the existing name→dotted-path map used by SQL placeholders, so
 * one capability declares where a value comes from once, whichever source runs
 * it. An unbound slot is a build-time error rather than a request-time surprise:
 * a literal `{id}` that reached the wire is an endpoint the merchant did not
 * describe, and the 404 it provokes is indistinguishable from a bad path.
 */
export function fillSlots(capability, template, bindings, read) {
    const missing = new Set();
    const filled = template.replace(SLOT, (_match, name) => {
        const path = bindings[name];
        if (path === undefined) {
            missing.add(name);
            return '';
        }
        const value = read(path);
        if (value === undefined || value === null) {
            missing.add(name);
            return '';
        }
        if (typeof value === 'object') {
            // An array or object in a path segment is a merchant's mistake in the
            // binding, and `String(value)` would put `[object Object]` in their URL.
            throw new Error(`Capability "${capability}" slot {${name}} read ${path}, which is not a scalar.`);
        }
        const text = typeof value === 'string' ? value : String(value);
        if (isTraversal(text)) {
            throw new Error(`Capability "${capability}" slot {${name}} received a path segment that traverses. ` +
                `A slot may not name a different path.`);
        }
        return encodeURIComponent(text);
    });
    if (missing.size > 0) {
        throw new Error(`Capability "${capability}" needed {${[...missing].join('}, {')}} and the payload did not carry it.`);
    }
    return filled;
}
/**
 * Perform one upstream call.
 *
 * Returns the decoded body for the agent and the status for the ledger. A
 * non-2xx throws, because a write that returned 402 has not happened and
 * answering `ok` would tell the agent to stop retrying a transaction that never
 * committed.
 */
export async function executeHttp(capability, source, input, bindings, options) {
    const method = source.method ?? (source.json === false ? 'GET' : 'POST');
    const readField = readPath(input);
    // Slots are filled in the RAW string, before it is parsed. The first version
    // filled `target.pathname` instead, and `URL` had already percent-encoded the
    // braces: `{id}` was `%7Bid%7D`, so the template matched nothing, every slot
    // silently went out literal, and `/v1/orders/{id}` addressed a path no
    // merchant described. It failed closed for a real order lookup (404) and open
    // for every traversal test, because nothing was being checked at all.
    const target = resolveFrozenTarget(options.baseUrl, fillSlots(capability, source.url, bindings, readField));
    const headers = { accept: 'application/json' };
    for (const [name, value] of Object.entries(source.headers ?? {})) {
        // CRLF here is a response-splitting primitive aimed at whatever sits behind
        // the merchant's API. It is cheap to refuse and never legitimate in a header
        // a merchant writes by hand.
        if (/[\r\n]/.test(name) || /[\r\n]/.test(value)) {
            throw new Error(`Capability "${capability}" declares a header containing a line break.`);
        }
        headers[name] = value;
    }
    const queryNames = source.query ?? [];
    if (queryNames.length > 0) {
        const search = new URLSearchParams();
        for (const name of queryNames) {
            const value = readField(name);
            if (value === undefined || value === null || typeof value === 'object')
                continue;
            search.append(name, String(value));
        }
        const rendered = search.toString();
        if (rendered)
            target.search = `?${rendered}`;
    }
    const carryBody = source.json ?? BODY_METHODS.has(method);
    const payload = carryBody ? JSON.stringify(input ?? {}) : undefined;
    if (payload !== undefined)
        headers['content-type'] = 'application/json';
    const doFetch = options.fetchImpl ?? fetch;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), source.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    let response;
    try {
        response = await doFetch(target.toString(), {
            method,
            headers,
            body: payload,
            signal: controller.signal,
            // Never followed. See the module comment: the second hop is chosen by the
            // upstream, so following it makes the frozen destination decorative.
            redirect: 'manual',
        });
    }
    catch (err) {
        if (controller.signal.aborted) {
            throw new HttpSourceError('upstream call timed out');
        }
        if (err instanceof TargetRejected)
            throw err;
        throw new HttpSourceError(`upstream call failed: ${describe(err)}`);
    }
    finally {
        clearTimeout(timeout);
    }
    const status = response.status;
    if (status < 200 || status >= 300) {
        if (status >= 300 && status < 400) {
            throw new HttpSourceError(`upstream answered ${status} redirect, which is not followed. ` +
                `Call the redirected path explicitly.`, status);
        }
        throw new HttpSourceError(`upstream answered ${status}`, status);
    }
    const cap = source.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    const raw = await readCapped(response, cap, capability);
    return { data: decode(raw, response.headers.get('content-type') ?? ''), upstreamStatus: status };
}
/**
 * Read at most `cap` bytes, then stop reading the body.
 *
 * A hard stop rather than a truncation: a truncated JSON body would parse into a
 * wrong answer, and a caller told a partial document is complete is worse off
 * than one told the response was too large.
 */
async function readCapped(response, cap, capability) {
    const body = response.body;
    if (!body)
        return '';
    const reader = body.getReader();
    const chunks = [];
    let total = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done)
                break;
            if (!value)
                continue;
            total += value.byteLength;
            if (total > cap) {
                throw new HttpSourceError(`Capability "${capability}" received a response larger than ${cap} bytes.`);
            }
            chunks.push(value);
        }
    }
    finally {
        // Cancelled so the socket is released even when the cap threw.
        await reader.cancel().catch(() => undefined);
    }
    return new TextDecoder().decode(concat(chunks, total));
}
function concat(chunks, total) {
    const out = new Uint8Array(total);
    let at = 0;
    for (const chunk of chunks) {
        out.set(chunk, at);
        at += chunk.byteLength;
    }
    return out;
}
function decode(raw, contentType) {
    if (raw === '')
        return null;
    if (!contentType.includes('json'))
        return raw;
    try {
        return JSON.parse(raw);
    }
    catch {
        // Declared JSON and not JSON is the upstream's problem, not a reason to
        // throw away a response the agent can still read as text.
        return raw;
    }
}
/** Dotted path into the payload, matching the binding convention used by SQL. */
function readPath(input) {
    return (path) => {
        let cursor = input;
        for (const segment of path.split('.')) {
            if (typeof cursor !== 'object' || cursor === null)
                return undefined;
            cursor = cursor[segment];
        }
        return cursor;
    };
}
/** No stack, no upstream internals — an agent must not be able to read our host. */
function describe(err) {
    if (err instanceof Error) {
        const cause = err.cause;
        if (cause && typeof cause.code === 'string')
            return cause.code;
        return err.name;
    }
    return 'unknown error';
}
//# sourceMappingURL=http.js.map
/**
 * The server-side fetch hook — capturing what never reaches a browser.
 *
 * ## Why this exists
 *
 * `capture` observes requests leaving the browser. For a Next.js app that is a
 * minority of the traffic. Server Components and Server Actions execute in
 * Node, so their fetches never pass a proxy on the merchant's machine, never
 * carry a browser `Origin`, and never appear in a capture session no matter how
 * thoroughly the merchant clicks through the site.
 *
 * That gap is not a rounding error. In an App Router codebase the majority of
 * data fetching happens on the server, so a browser-only capture reports an
 * inventory that is confidently incomplete — and the endpoints it missed are
 * usually the ones calling internal services with a service token.
 *
 * The hook is a `fetch` wrapper, installed with `node --import`. It is the only
 * interception point that works for every server-side HTTP client in Node,
 * because `undici`'s `fetch` is the global one: route handlers, server
 * components, `fetch` in a server action, and libraries built on it.
 *
 * ## What it deliberately does not do
 *
 * It is not a proxy. It does not sit between the merchant's code and the
 * network, does not rewrite a URL, does not add a hop and does not retry. It
 * calls the real `fetch` with the arguments it was given and observes the call.
 *
 * That is a stronger position than the relay takes. A proxy has to be trusted
 * with the destination and must exist on the request path, so a bug in it
 * breaks the merchant's app. A wrapper cannot redirect the request, so the
 * worst it can do is record too much or crash the call — and a crash is
 * contained below, because a monitoring tool that takes down the app it
 * monitors has produced a denial of service in the name of observability.
 */
import { CallRecorder } from './capture.js';
/**
 * A fetch that records the call and then gets out of the way.
 *
 * Order matters. The request is observed *before* the real call, so a request
 * that fails or times out is still inventoried — an endpoint that exists but is
 * broken is exactly the one a merchant does not know about, because nothing
 * ever came back to tell them. Observing after the response would omit it and
 * report a clean run.
 */
export function instrumentFetch(recorder, realFetch) {
    return async (input, init) => {
        try {
            const url = toUrl(input);
            if (url !== null) {
                recorder.observe({
                    // The Request's own method wins over `init`. `fetch(req)` is the
                    // common shape in server code, and reading only `init` records every
                    // one of them as GET — so a write shows up in the inventory as a read,
                    // which is the direction of error that hides a capability.
                    method: methodOf(input, init),
                    // Path and query only. A server-side fetch is frequently absolute —
                    // `https://internal.ledger/v1/entries/4417` — so the origin is dropped
                    // here even though it is not a secret, because a path segment read
                    // from the merchant's own service name tells a reader of the file
                    // which internal system is in use, and that is the same category of
                    // reconnaissance the browser path refuses.
                    target: url.pathname + url.search,
                    headers: headersOf(input, init),
                    body: await bodyOf(input, init),
                });
            }
        }
        catch {
            // A URL this cannot parse, or an init shape we do not recognise. The call
            // still goes through — recording is not allowed to become a reason a
            // request fails, because that is a control that breaks the app instead of
            // describing it.
        }
        return realFetch(input, init);
    };
}
/**
 * Install on `globalThis.fetch`, idempotently.
 *
 * Idempotent because a Next.js dev server reloads modules on every edit, and a
 * wrapper stacking on itself would double-count every call and make the counts
 * in the inventory a function of how many times the merchant saved a file.
 */
export function installFetchHook(options = {}) {
    const recorder = new CallRecorder(options);
    const scope = globalThis;
    const previous = scope.fetch;
    const realFetch = options.fetchImpl ?? previous;
    if (typeof realFetch !== 'function') {
        throw new Error('no global fetch to wrap. This hook needs Node 18 or later.');
    }
    if (scope.__agentPortHook === MARK) {
        // Already installed in this process. Return the existing recorder rather
        // than wrapping again, so counts stay truthful across a reload.
        const existing = scope.__agentPortRecorder;
        if (existing !== undefined)
            return { recorder: existing, uninstall: () => { } };
    }
    const wrapped = instrumentFetch(recorder, realFetch);
    scope.fetch = wrapped;
    scope.__agentPortHook = MARK;
    scope.__agentPortRecorder = recorder;
    return {
        recorder,
        uninstall: () => {
            if (scope.fetch === wrapped)
                scope.fetch = previous;
            if (scope.__agentPortHook === MARK)
                scope.__agentPortHook = undefined;
        },
    };
}
const MARK = Symbol.for('agentport.fetchHook');
function toUrl(input) {
    try {
        if (typeof input === 'string')
            return new URL(input);
        if (input instanceof URL)
            return input;
        // A Request carries its own method, headers and body; reading them is how a
        // `fetch(new Request(...))` call gets recorded correctly.
        const request = input;
        if (typeof request.url === 'string')
            return new URL(request.url);
    }
    catch {
        return null;
    }
    return null;
}
/**
 * The method, from the Request or from `init`.
 *
 * Both are read because `fetch(new Request(url, { method: 'POST' }))` carries
 * its method on the Request and leaves `init` undefined.
 */
function methodOf(input, init) {
    if (typeof init === 'object' && init !== null) {
        const method = init.method;
        if (typeof method === 'string')
            return method.toUpperCase();
    }
    if (input instanceof Request && typeof input.method === 'string')
        return input.method.toUpperCase();
    return 'GET';
}
/**
 * Top-level body field names, from a *clone*.
 *
 * Reading `request.text()` directly would consume the stream and leave the real
 * fetch with an empty body — turning an observer into a data-destroying bug. A
 * `Request` can also arrive already disturbed, in which case `clone()` throws;
 * that is caught and the body simply goes unrecorded rather than breaking the
 * call.
 */
async function bodyOf(input, init) {
    if (input instanceof Request) {
        if (input.method.toUpperCase() === 'GET' || input.method.toUpperCase() === 'HEAD')
            return '';
        try {
            return await input.clone().text();
        }
        catch {
            // A Request can arrive already disturbed, in which case `clone()` throws.
            return '';
        }
    }
    // `fetch(url, { body })` is the other common shape, and reading only a Request
    // input meant the most ordinary server-side write recorded no field names at
    // all — the writes, which are the ones worth knowing the shape of, came out
    // blank and looked like endpoints that take no arguments.
    if (typeof init !== 'object' || init === null)
        return '';
    const body = init.body;
    // Only non-consumable bodies. A ReadableStream, FormData or URLSearchParams is
    // a one-shot stream, and reading it here would leave the real fetch with an
    // empty body — an observer that destroys the request it is watching.
    if (typeof body === 'string')
        return body;
    if (body instanceof URLSearchParams)
        return body.toString();
    if (typeof Uint8Array !== 'undefined' && body instanceof Uint8Array) {
        return new TextDecoder().decode(body);
    }
    return '';
}
/**
 * Headers from either shape `fetch` accepts.
 *
 * `Headers` and a plain object both appear in server code, and a `Headers`
 * instance iterates rather than enumerating, so reading it as an object yields
 * nothing and the credential check silently sees an empty header set — which
 * would record requests carrying an `Authorization` header, exactly the thing
 * this module exists to avoid.
 */
function headersOf(input, init) {
    // A Request's own headers merge with `init`, with `init` winning, matching
    // how fetch itself combines them.
    if (input instanceof Request) {
        const out = {};
        input.headers.forEach((value, name) => {
            out[String(name).toLowerCase()] = String(value);
        });
        return { ...out, ...readHeaders(init?.headers) };
    }
    return readHeaders(typeof init === 'object' && init !== null ? init.headers : undefined);
}
function readHeaders(raw) {
    const out = {};
    if (raw === undefined || raw === null)
        return out;
    if (typeof raw.forEach === 'function' && !Array.isArray(raw)) {
        ;
        raw.forEach((value, name) => {
            out[String(name).toLowerCase()] = String(value);
        });
        return out;
    }
    if (Array.isArray(raw)) {
        for (const pair of raw) {
            if (Array.isArray(pair) && pair.length >= 2) {
                out[String(pair[0]).toLowerCase()] = String(pair[1]);
            }
        }
        return out;
    }
    for (const [name, value] of Object.entries(raw)) {
        if (typeof value === 'string')
            out[name.toLowerCase()] = value;
    }
    return out;
}
/**
 * Shape the recorder's output as an inventory the union view can read.
 *
 * `runtime:server` is a distinct provenance from `runtime:capture` on purpose.
 * A server-side request is a different trust boundary — it carries service
 * credentials and is not user-initiated — so a merchant reconciling the two
 * needs to be able to tell which rows came from where.
 */
export function toSnapshot(recorder) {
    const provenance = 'runtime:server';
    const skipped = recorder.credentialSkipped();
    const overflow = recorder.overflowCount();
    return {
        version: 1,
        observedBy: [provenance],
        endpoints: recorder.inventory().map((call) => ({
            method: call.method,
            path: call.pattern,
            provenance: [provenance],
            parameters: call.parameters.map((name) => ({ name, type: '' })),
            request: call.body.map((name) => ({ name, type: '' })),
            response: [],
            calls: call.calls,
        })),
        skipped: [],
        warnings: [
            ...(skipped === 0
                ? []
                : [
                    `${skipped} server-side request(s) carried a credential and were NOT recorded. Server calls usually carry a service token, so an internal endpoint may be absent here; a route dump or contract still names it.`,
                ]),
            ...(overflow === 0
                ? []
                : [
                    `${overflow} request(s) named a path past this capture's retention cap and were NOT recorded. Raise it with maxPaths if the app really has that many distinct paths.`,
                ]),
        ],
    };
}
//# sourceMappingURL=fetch-hook.js.map
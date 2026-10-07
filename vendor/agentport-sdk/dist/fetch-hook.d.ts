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
import { CallRecorder, type RecorderOptions } from './capture.js';
import type { EndpointSnapshot } from './discover.js';
/**
 * The global `fetch` signature, taken from the platform rather than restated.
 *
 * A hand-written `(input: unknown, init?: unknown) => ...` is contravariantly
 * incompatible with the real `fetch`, so every caller would need a cast and the
 * cast would be where a signature drift hides. Deriving it means the compiler
 * checks this hook against the actual API it replaces.
 */
export type FetchLike = typeof fetch;
export interface HookOptions extends RecorderOptions {
    /** Real `fetch`, injected so tests do not need to patch a global. */
    fetchImpl?: FetchLike;
}
/**
 * A fetch that records the call and then gets out of the way.
 *
 * Order matters. The request is observed *before* the real call, so a request
 * that fails or times out is still inventoried — an endpoint that exists but is
 * broken is exactly the one a merchant does not know about, because nothing
 * ever came back to tell them. Observing after the response would omit it and
 * report a clean run.
 */
export declare function instrumentFetch(recorder: CallRecorder, realFetch: FetchLike): FetchLike;
/**
 * Install on `globalThis.fetch`, idempotently.
 *
 * Idempotent because a Next.js dev server reloads modules on every edit, and a
 * wrapper stacking on itself would double-count every call and make the counts
 * in the inventory a function of how many times the merchant saved a file.
 */
export declare function installFetchHook(options?: HookOptions): {
    recorder: CallRecorder;
    uninstall: () => void;
};
declare global {
    var __agentPortHook: symbol | undefined;
    var __agentPortRecorder: CallRecorder | undefined;
}
/**
 * Shape the recorder's output as an inventory the union view can read.
 *
 * `runtime:server` is a distinct provenance from `runtime:capture` on purpose.
 * A server-side request is a different trust boundary — it carries service
 * credentials and is not user-initiated — so a merchant reconciling the two
 * needs to be able to tell which rows came from where.
 */
export declare function toSnapshot(recorder: CallRecorder): EndpointSnapshot;
//# sourceMappingURL=fetch-hook.d.ts.map
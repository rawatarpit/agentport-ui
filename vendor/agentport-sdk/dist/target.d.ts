/**
 * Endpoint trust, as a separate function.
 *
 * ## Why this exists
 *
 * `startCaptureServer` promised a frozen upstream and did not deliver one. It
 * built the destination with `new URL(target, base)`, and WHATWG URL resolution
 * treats a leading `//` as a protocol-relative authority. So a request line of
 *
 *     GET //169.254.169.254/latest/meta-data/ HTTP/1.1
 *
 * made the relay fetch a host the merchant never named — reproduced against a
 * real socket, returning the body of a service bound to loopback that the relay
 * was never configured to reach. The string `//evil` looks like a path. It is
 * an authority.
 *
 * Two checks, and the second is the one that matters.
 *
 * The first rejects obviously-hostile shapes before parsing: a target that is
 * not origin-form, or that carries a backslash, control character or space.
 * WHATWG URL has a long list of normalisation quirks — backslashes become
 * forward slashes, tabs and newlines are stripped from anywhere in the string —
 * and enumerating them in a guard is a losing game. Anyone adding a case here
 * will miss one, and the miss is an open relay.
 *
 * The second therefore asserts the *invariant* instead of the syntax: after
 * resolution, the destination's origin must equal the configured upstream's.
 * That holds regardless of which parsing quirk produced it, because the thing
 * being protected is "the destination is the upstream I was given", not "the
 * string looked like a path". This function is the only place a destination is
 * built, so the check cannot be forgotten by a second call site.
 */
export declare class TargetRejected extends Error {
    readonly reason: string;
    constructor(reason: string);
}
/**
 * Resolve one request target against the frozen upstream.
 *
 * @throws TargetRejected if the target could name any host but `upstream`.
 */
export declare function resolveTarget(upstream: URL, basePath: string, rawTarget: string): URL;
//# sourceMappingURL=target.d.ts.map
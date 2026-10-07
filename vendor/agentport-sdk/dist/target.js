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
export class TargetRejected extends Error {
    reason;
    constructor(reason) {
        super(reason);
        this.reason = reason;
        this.name = 'TargetRejected';
    }
}
/** Characters that must never appear in a request target. */
const FORBIDDEN = /[\u0000-\u0020\u007f\\]/;
/**
 * Resolve one request target against the frozen upstream.
 *
 * @throws TargetRejected if the target could name any host but `upstream`.
 */
export function resolveTarget(upstream, basePath, rawTarget) {
    if (rawTarget === '')
        throw new TargetRejected('empty request target');
    if (FORBIDDEN.test(rawTarget))
        throw new TargetRejected('request target contains a forbidden character');
    // Origin-form only: exactly one leading slash. `//host` is an authority, and
    // `/\host` becomes one after WHATWG normalises the backslash — which is why
    // the backslash is rejected above as well as here.
    if (!rawTarget.startsWith('/') || rawTarget.startsWith('//')) {
        throw new TargetRejected('request target is not origin-form');
    }
    const resolved = new URL(`${basePath}${rawTarget}`, upstream);
    // The invariant. Everything above is an optimisation for a clear message;
    // this is the control.
    if (resolved.origin !== upstream.origin) {
        throw new TargetRejected(`request target resolved to ${resolved.origin}, not the configured upstream`);
    }
    return resolved;
}
//# sourceMappingURL=target.js.map
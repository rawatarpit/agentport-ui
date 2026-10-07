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
import { CallRecorder } from './capture.js';
export interface CaptureServerOptions {
    /** Frozen upstream base URL. Resolved and validated once, at startup. */
    upstream: string;
    recorder: CallRecorder;
    /** Bind address. Must be loopback; see rule 1. */
    host?: string;
    port?: number;
    /** Upstream deadline. A forwarded request is abandoned after this, not retried. */
    timeoutMs?: number;
    /** Largest body whose field names are read. Above this, forwarded unrecorded. */
    maxBodyBytes?: number;
    /** Largest body relayed at all. Above this the request is refused with 413. */
    maxRelayBytes?: number;
}
export interface RunningCapture {
    /** The loopback URL to point the frontend's base URL at. */
    url: string;
    port: number;
    close: () => Promise<void>;
    /** Requests refused for a disallowed origin. */
    refused: () => number;
}
export declare function startCaptureServer(options: CaptureServerOptions): Promise<RunningCapture>;
//# sourceMappingURL=capture-server.d.ts.map
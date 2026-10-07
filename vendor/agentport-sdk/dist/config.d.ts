import { validateInput, type InputSchema } from './validate.js';
import type { PolicyInputQuery } from './capabilities.js';
import type { Policy, DataClass, Access } from './types.js';
/**
 * The merchant's configuration file.
 *
 * One JSON file, read once at startup, never written by the binary. A config
 * the program can rewrite is a config the program can be made to rewrite, and
 * the local file is the only place the rules live — the whole design is that our
 * servers are not consulted on a request, so a file that some other party can
 * alter silently would reintroduce exactly the dependency the architecture
 * removes.
 *
 * `doctor()` exists because a typo in a payment ceiling is a silent fail-open.
 * The binary refuses to start on a config that does not validate, rather than
 * starting with a rule the merchant believes is set.
 */
export interface DatabaseDescriptor {
    /** `sqlite` is the only driver shipped; the interface is open for a second. */
    driver: 'sqlite';
    path: string;
    /** Recorded in the ledger. Never the password. */
    user?: string;
}
export interface CapabilityFile {
    name: string;
    description: string;
    access: Access;
    dataClass?: DataClass;
    requiresApproval?: boolean;
    /** The declared payload shape. Enforced before policy evaluation. */
    input?: InputSchema;
    /**
     * The merchant's SQL. `:name` placeholders only.
     *
     * The query is merchant-authored and trusted; the values that fill it are
     * agent-supplied and untrusted. Those two facts never mix — see
     * `capabilities.ts`, where the only route from input to statement is a
     * declared binding.
     */
    query?: string;
    /** placeholder name -> dotted path into the payload. */
    bindings?: Record<string, string>;
    /**
     * The authoritative value for policy rules, when the payload cannot be
     * trusted to carry it. Static, so the same on every request — fine for a
     * constant, not a per-transaction figure, and a ceiling measured against a
     * constant cannot fail.
     */
    policyInput?: Record<string, unknown>;
    /**
     * The authoritative figures for policy rules, read per request from the
     * merchant's own database.
     *
     * A config file is JSON and cannot hold a function, so the file cannot supply
     * the `policyInputFor` a coded capability would use. This is the same control
     * expressed the only way JSON can express it: which figure, and the query that
     * produces it. `buildCapabilities` turns each entry into a per-request read
     * and refuses to build the capability if a declared key has no query, if the
     * query is not a read, or if the driver cannot read synchronously.
     */
    policyInputQueries?: Record<string, PolicyInputQuery>;
    /**
     * The figures this capability reports to the policy engine, e.g. `['total']`.
     *
     * Enforced, which is the whole reason it exists. `buildCapabilities` refuses
     * to start unless every key here is one the policy engine can actually read,
     * is produced by a `policyInputQueries` entry, and is named by every entry
     * there — so a declaration cannot be decorative: either it resolves to a
     * number the ceiling is measured against, or the server does not come up.
     * The key is not a field name to invent: it must be one of `amountMinor`,
     * `amount`, `total`, `orderTotal`, `price`, `units`, `quantity`, `itemCount`.
     * `grandTotal` used to pass every check and measure nothing.
     * `policyInputQueries` needs no `policyInputFor` in the file, and
     * `policyInputFor` is not a field a JSON file can hold; `parseConfig` says so
     * if one is written.
     */
    policyInputKeys?: string[];
    /** Extra checks the merchant wants before a write. */
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    /**
     * Where the work happens. Omitted means the merchant's SQL; `kind: 'http'`
     * calls their API instead.
     *
     * `policyInput` and `policyInputQueries` are refused on an http source, and
     * `parseConfig` says so. For a SQL capability the authoritative figure comes
     * from the merchant's own database, which is why `policyInput` exists there.
     * For an http capability there is no such read: the figure that will be
     * charged is the one in the body we are about to send, so the payload the
     * caller supplied is not merely the input to the decision, it *is* the
     * decision's subject. A static `policyInput` would silently replace it with a
     * constant, and the ceiling would be measured against the wrong number while
     * the correct one went on the wire.
     */
    source?: HttpSourceFile;
}
/**
 * A capability that calls the merchant's own HTTP API instead of their database.
 *
 * The URL is declared here and nowhere else. The agent fills named slots and
 * supplies declared payload fields; it can never name a destination, a method,
 * or a header. That is the whole difference between this and an SSRF gadget, and
 * it is why the URL is frozen at build time rather than resolved per request.
 */
export interface HttpSourceFile {
    kind: 'http';
    /**
     * Absolute URL, or a path resolved against `baseUrl`.
     *
     * Path or absolute only, and either way the origin must equal `baseUrl`'s.
     * A capability cannot point at a third party; a merchant with several
     * services is a merchant with several `baseUrl` values behind their own
     * routing.
     */
    url: string;
    /** Defaults by method: anything but GET/DELETE carries a body. */
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    /**
     * Payload keys promoted to the query string. Names are declared; only values
     * come from the caller. A caller who could choose the names could add
     * `?admin=true`.
     */
    query?: string[];
    /**
     * Static headers, including any credential. Values are the merchant's and
     * cannot reference the payload: a caller-controlled header value is header
     * injection, and there is no slot syntax that makes it safe.
     */
    headers?: Record<string, string>;
    /** Send the input as a JSON body. Defaults true for methods that carry one. */
    json?: boolean;
    /** Ceiling on the response body read into memory. Default 1 MiB. */
    maxResponseBytes?: number;
    /** Wall-clock ceiling on the upstream call. Default 15s, no longer. */
    timeoutMs?: number;
}
export interface AgentPortAnalyticsFile {
    /**
     * Absolute `https:` URL of the hosted ingest endpoint.
     *
     * Declared per deployment rather than defaulted to a hostname baked into the
     * SDK. A default would make "am I sending aggregates somewhere?" unanswerable
     * from the config, and the answer is a consent question a merchant has to be
     * able to give deliberately.
     */
    endpoint: string;
    /**
     * Name of the environment variable holding the per-tenant push key.
     *
     * A *name*, never the key. The key is a credential, and a config file is a
     * file people paste into issues; the value belongs in the environment beside
     * `AGENTPORT_SIGNING_SECRET`, which is already required to stay there.
     */
    pushKeyEnv?: string;
    /** Seconds between flushes. Default and ceiling 900; a tighter loop is refused. */
    flushIntervalSec?: number;
}
export interface AgentPortFile {
    business: string;
    tenantId: string;
    baseUrl: string;
    database?: DatabaseDescriptor;
    capabilities?: CapabilityFile[];
    policy?: Policy;
    /**
     * Absent means analytics is off, and that is a decision rather than a default:
     * nothing is sent anywhere unless this block names an endpoint.
     */
    analytics?: AgentPortAnalyticsFile;
    /**
     * Absent means the file IS the policy, enforced as written. Present means the
     * file names a merchant-signed artifact that is fetched, verified locally
     * against the merchant's public key, and enforced instead — see
     * `src/artifact-load.ts`. The key is public, so living in the config is safe;
     * the private half is never named here, never read here, and never leaves
     * the machine that signs.
     */
    artifact?: AgentPortArtifactFile;
}
/**
 * How the runtime finds and trusts the signed policy artifact.
 *
 * Exactly one of `url` (the distribution endpoint) or `file` (a local signed
 * envelope, for air-gapped runs). `publicKeyFile` holds the merchant's PUBLIC
 * key PEM — verification needs nothing else, and specifically never a shared
 * secret. `cachePath` is the offline fallback; unset means no cache, so an
 * outage with no valid artifact fails closed at startup.
 */
export interface AgentPortArtifactFile {
    url?: string;
    file?: string;
    publicKeyFile: string;
    cachePath?: string;
    /** Reject artifacts at or below this version — rollback protection. */
    minVersionExclusive?: number;
}
export declare class ConfigError extends Error {
    readonly problems: string[];
    constructor(problems: string[]);
}
/**
 * Checks a parsed config and returns the typed shape, or throws with every
 * problem listed at once. A merchant fixing a file one error per run is a
 * merchant who gives up on the fourth.
 */
export declare function parseConfig(raw: unknown): AgentPortFile;
/**
 * Runtime self-check, beyond shape.
 *
 * Shape is not correctness: a config can parse perfectly and still be a
 * money control that does nothing. The two that matter are a payment ceiling
 * that no amount will ever reach, and a policy field naming a capability that
 * does not exist — the second is a rule the merchant believes is set and is
 * not, which is the same silence as a typo in a ceiling.
 *
 * `env` is required and undefaulted. `process` is a Node global that throws
 * without `nodejs_compat`, so reading it from inside this module made a
 * module that is otherwise pure fail to load in a Worker-shaped environment.
 * The caller supplies the environment it is actually running in, which is
 * also what makes the AGENTPORT_DB_PASSWORD note testable at all.
 */
export interface DoctorReport {
    /** A control the merchant believes is set and is not. `serve` refuses these. */
    errors: string[];
    /** Worth knowing, safe to start. */
    notes: string[];
}
export declare function doctor(config: AgentPortFile, env: Record<string, string | undefined>): DoctorReport;
export { validateInput };
/**
 * Separates the notes that mean a control is missing from the ones that are
 * merely informative.
 *
 * The distinction is the whole point. `doctor` printing "the ceiling will not
 * fire" and then starting anyway is worse than not printing it, because a
 * merchant who reads the output and sees the server come up concludes the
 * ceiling is fine. These are the ones that must stop a start.
 */
export declare function doctorErrors(config: AgentPortFile, env: Record<string, string | undefined>): string[];
/**
 * Thrown by `startAgent` before the listener binds, carrying the reasons this
 * configuration cannot be served as written.
 *
 * Two classes reach here and they are not the same thing, so the message does not
 * claim they are: `parseConfig` shape problems (a mistyped `description`) and
 * `doctor`'s unenforceable-control findings. Invariant 2 asks for specificity
 * from a refusal, and telling an operator who fat-fingered a config that their
 * *control* cannot enforce is the kind of confident wrong answer that costs an
 * afternoon. Each entry still names its own specific fault in `problems`.
 *
 * Exported so `main.ts` can print the problems and exit with its own wording,
 * instead of the library throwing a bare `Error` that reads like a crash.
 */
export declare class UnenforceableConfigError extends Error {
    readonly problems: string[];
    constructor(problems: string[]);
}
//# sourceMappingURL=config.d.ts.map
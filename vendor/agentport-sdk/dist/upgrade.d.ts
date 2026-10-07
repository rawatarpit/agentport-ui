/**
 * Self-update verification, installation, and the first-run secret policy.
 *
 * Three things in here are decisions rather than code, and they are the reason
 * the file exists:
 *
 * 1. **The order is a control, so it is a control, so it is testable.**
 *    Signature, then checksum, then replace, then — only after the bytes on
 *    disk have been re-hashed — the new binary is executed once to prove it
 *    starts. A checksum is not a trust decision: a compromised release host
 *    serves a *valid* checksum of a *malicious* binary, which is why the
 *    signature is checked first and why both are checked before any byte is
 *    written over a working binary.
 *
 * 2. **The ledger has no update path, so version skew is a data-loss bug.**
 *    An older build pointed at a newer schema writes rows the newer build
 *    cannot read, and `agentport_ledger` cannot be repaired. Every update is
 *    therefore refused unless the ledger shape on both sides is the same one
 *    this binary speaks.
 *
 * 3. **A secret is not ours to keep.** The first-run path generates a signing
 *    secret and prompts for a database password, and writes neither to disk
 *    unless the operator explicitly asked for that exact file to be written.
 *
 * Purity: `verifyUpdate` reads no clock, opens no socket, spawns nothing, and
 * touches no file. The transport (`downloadUpdate`) and the OS operations
 * (`applyUpdate`) are separate exports so the part with the interesting failure
 * modes can be tested offline, in this repository, with no network.
 *
 * Zero runtime dependencies: cosign and the platform signing tools are
 * external binaries invoked with `execFile` and a fixed argument list. There is
 * no `child_process` shell string anywhere in this file, so a manifest field
 * can never become an argument.
 */
/**
 * The ledger shape this build writes.
 *
 * Hand-maintained on purpose. `LEDGER_DDL_STATEMENTS` has no version marker and
 * the table has no update path, so a merchant's file on disk may have been
 * created by any past build and there is nothing at runtime to read a version
 * out of. The number is bumped in the same commit that changes the DDL, and
 * that commit is a migration: see MIGRATION.md. The update path treats a
 * crossing as a hard stop, which is the whole reason this constant is
 * separate from the version.
 */
export declare const LEDGER_SCHEMA_VERSION = 2;
/**
 * Compiled-in trust anchors.
 *
 * These are deliberately constants and not configuration. A merchant cannot
 * repoint them, because a merchant who can name the signing identity can sign
 * their own updates, at which point the channel proves nothing. A merchant who
 * needs an update channel pointed elsewhere is running our software from
 * somewhere we do not control.
 *
 * `scripts/release-check.mjs` imports these from the *built* module rather than
 * duplicating them, so the pipeline and the binary can never disagree about
 * which identity counts as us.
 */
export declare const RELEASE_CERTIFICATE_IDENTITY = "https://github.com/agentport/agentport-sdk/.github/workflows/release.yml@refs/tags/v*";
export declare const RELEASE_OIDC_ISSUER = "https://token.actions.githubusercontent.com";
export declare const RELEASE_MANIFEST_ORIGIN = "https://updates.agentport.dev";
/**
 * Version of this build. `+source` means "not stamped": a release engineer
 * stamps the real version with `node scripts/stamp-version.mjs <v>`, which
 * rewrites the build metadata here in `dist/upgrade.js` *before* the binary is
 * bundled and signed.
 *
 * Nothing in the build did this on its own, and the constant is load-bearing:
 * it is the `currentVersion` every downgrade check is measured against, and
 * what `agent-port --version` prints. A shipped build that still said
 * `+source` would report itself as whatever it was compiled from, forever —
 * so `agent-port upgrade` would tell a merchant on 0.4.0 that they were
 * current at 0.1.0, and a republish of any version above the stamp would pass
 * as an upgrade. `verifyUpdate` also takes its floor from the recorded state as
 * a second source, but that is a backstop, not a substitute for stamping.
 */
export declare const BINARY_VERSION = "0.1.0+source";
/** The vocabulary of everything this module can refuse. No generic failure. */
export declare const UPDATE_REFUSALS: readonly ["manifest_malformed", "platform_mismatch", "insecure_url", "same_origin", "payload_too_small", "payload_too_large", "signature_missing", "keyed_bundle", "signature_invalid", "checksum_mismatch", "not_newer", "downgrade", "rollback", "schema_change", "schema_downgrade", "state_unreadable", "manual_approval_required", "installer_not_self_applicable", "target_unusable", "read_failed", "write_failed", "health_check_failed", "rollback_failed"];
export type UpdateRefusal = (typeof UPDATE_REFUSALS)[number];
/** One manifest entry, for one platform. Not a channel of platforms. */
export interface UpdateManifest {
    version: string;
    platform: string;
    /** HTTPS only, and never the origin the manifest itself came from. */
    url: string;
    /** Lowercase hex SHA-256 of the artifact bytes at `url`. */
    sha256: string;
    /** A Sigstore bundle. Keyed bundles are refused — see B5.5. */
    sig: unknown;
    /** The ledger shape this build writes. Compared before install, not after. */
    ledgerSchemaVersion: number;
    releasedAt: string;
    /** `binary` is self-appliable. `installer` is handed to the OS. */
    artifact: 'binary' | 'installer';
    channel: 'stable' | 'beta';
}
/** The trust decision, delegated so the tests can drive it with a real crypto signature. */
export interface SignatureVerdict {
    ok: boolean;
    /** Present when `ok`. What cosign proved, for the operator's log. */
    identity?: string;
    issuer?: string;
    /** Present when not `ok`. Operator-facing: already stripped of paths. */
    reason?: string;
    /** Whether the verifier is a genuine external check or an unconditional pass. */
    trusted: boolean;
}
export interface VerifyInput {
    payload: Uint8Array;
    bundle: unknown;
    /** Where those exact bytes already are on disk. Optional: cosign needs a file. */
    payloadPath?: string;
    version: string;
    platform: string;
    certificateIdentity: string;
    oidcIssuer: string;
}
export interface SignatureVerifier {
    /** Named in every refusal, so a log says which check actually ran. */
    readonly id: string;
    verify: (input: VerifyInput) => Promise<SignatureVerdict>;
}
export type VerificationStep = 'manifest_shape' | 'payload_size' | 'platform' | 'origin' | 'signature' | 'checksum' | 'version' | 'schema' | 'channel';
export type UpdateChannel = 'patch' | 'minor' | 'major';
export interface UpdateVerdict {
    status: 'up_to_date' | 'available' | 'refused';
    reason?: UpdateRefusal;
    detail: string;
    manifest?: UpdateManifest;
    channel?: UpdateChannel;
    /** True only when a patch, stable, and not crossing the ledger schema. */
    automatic: boolean;
    /** Why a human is required, when one is. */
    blockedBy: 'channel' | 'schema_change' | 'installer' | null;
    /** Every gate that ran, in the order it ran. See `verifyUpdate`. */
    steps: VerificationStep[];
}
/** The rollback and schema record, kept beside the binary. Never in the ledger. */
export interface UpdateState {
    ledgerSchemaVersion: number;
    lastVersion?: string;
    lastReleasedAt?: string;
    lastSha256?: string;
    lastInstalledAt?: string;
}
export declare const UPDATE_STATE_SUFFIX = ".agentport-update-state.json";
export declare function updateStatePath(targetPath: string): string;
/**
 * Longest build this tool will accept. Refused *after* the signature check, so
 * a too-large manifest is a cosmetic failure rather than a DoS on a hostile
 * host, and refused before the checksum so a hostile host cannot make us hash
 * an unbounded buffer. The downloader applies the same bound while streaming.
 */
export declare const MAX_UPDATE_BYTES: number;
/** Below this the artifact is a stub, a redirect body, or a truncated transfer. */
export declare const MIN_UPDATE_BYTES = 64;
/** A manifest entry with an embedded bundle is kilobytes. Anything larger is a hostile host. */
export declare const MAX_MANIFEST_BYTES: number;
/**
 * Total order over versions.
 *
 * A prerelease sorts *below* its own release (`1.2.0-rc.1` < `1.2.0`), which is
 * what makes "never install a prerelease automatically" fall out of the
 * comparison instead of being a second rule to forget.
 *
 * Build metadata is ignored, as the specification requires: `1.2.0+a` and
 * `1.2.0+b` are the same release, and treating them as different would let a
 * republish masquerade as an upgrade. An unparseable version is *not* treated
 * as new — it sorts as older than everything, so a malformed manifest can
 * never install itself.
 */
export declare function compareVersions(a: string, b: string): number;
/** Which bump a candidate represents, or null if it is not a forward move. */
export declare function classifyChannel(from: string, to: string): UpdateChannel | null;
/**
 * Is this a Sigstore bundle from a keyless signer?
 *
 * B5.5 is "no long-lived signing key in CI to steal", and a binary that will
 * accept one is a binary whose release host can be held forever by whoever
 * steals it. So a bundle carrying a key is not a weaker path to allow, it is a
 * different product.
 *
 * Deliberately not re-implementing the DSSE binding here. cosign checks that
 * the signature covers these exact bytes; a JavaScript re-implementation would
 * be a second, weaker verifier that could disagree with the first, and two
 * verifiers is the same mistake as two enforcement surfaces. What this function
 * asserts is the *shape* — a keyless bundle is present — and cosign asserts
 * the binding.
 */
export declare function classifyBundle(bundle: unknown): 'keyless' | 'keyed' | 'unrecognised';
/** In-memory digest. Web Crypto, so this half of the file needs no Node crypto. */
export declare function sha256(bytes: Uint8Array): Promise<string>;
/**
 * File digest, streamed. Separate from `sha256` above only because a 110MB SEA
 * binary should not be held in memory twice; `test/upgrade.test.ts` asserts the
 * two agree, so the duplication cannot drift into a real difference.
 */
export declare function sha256File(path: string): Promise<string>;
/**
 * Shape-check a manifest, with no context applied.
 *
 * Everything here is a property of the document. Platform, origin and version
 * are checked later, by `verifyUpdate`, because they are decisions about
 * *this* machine and belong in the order that is under test.
 */
export declare function parseManifest(raw: unknown): {
    ok: true;
    manifest: UpdateManifest;
} | {
    ok: false;
    reason: UpdateRefusal;
    detail: string;
};
export interface VerifyOptions {
    currentVersion: string;
    platform: string;
    /** The origin the manifest was fetched from. The artifact may not share it. */
    manifestOrigin: string;
    verifier: SignatureVerifier;
    state?: UpdateState;
    /** The ledger shape this binary speaks. Defaults to `LEDGER_SCHEMA_VERSION`. */
    ledgerSchemaVersion?: number;
    /**
     * Where `payload` already is on disk, when the caller downloaded it there.
     *
     * cosign verifies a file, not a buffer. Passing the path means the bytes
     * that are signed are the bytes that will be installed — and the installer
     * re-hashes the staged copy anyway, so a temporary file swapped between the
     * two does not survive the round trip.
     */
    payloadPath?: string;
}
/**
 * The whole update decision, in the order it is taken.
 *
 * `steps` is returned so the ordering is assertable rather than merely
 * documented: a test can prove the signature ran before the checksum by
 * offering a payload that is *both* unsigned and corrupted, and the refusal
 * must name the signature. If someone swaps those two lines, that test fails.
 */
export declare function verifyUpdate(raw: unknown, payload: Uint8Array, options: VerifyOptions): Promise<UpdateVerdict>;
/**
 * The real verifier: cosign, keyless, identity and issuer pinned in code.
 *
 * A bundled `cosign` is invoked as `cosign verify-blob` with an argument list
 * built here and no shell, so nothing in a manifest can become a flag: there is
 * no `spawn` with string interpolation anywhere in this file, and the URL, the
 * version and the platform are not passed to the process at all — the artifact
 * is passed, as bytes, which is the only thing the signature is about.
 *
 * `--insecure-ignore-tlog` is not set, because its absence is what makes a
 * keyless signature verifiable by anyone: cosign checks the certificate against
 * Fulcio's root, the issuer, the workflow ref, and the Rekor inclusion proof.
 */
export declare function cosignVerifier(options?: {
    binary?: string;
    timeoutMs?: number;
}): SignatureVerifier;
export declare function parseUpdateState(raw: string | null): {
    ok: true;
    state: UpdateState;
} | {
    ok: false;
    detail: string;
};
export declare function readUpdateState(targetPath: string): Promise<{
    ok: true;
    state: UpdateState;
} | {
    ok: false;
    detail: string;
}>;
/**
 * Delete the state file, which is what `--reset-state` is for.
 *
 * It exists because `parseUpdateState` fails closed on a corrupt file, and
 * that refusal names this command as the way out. A refusal that tells a
 * merchant to run a command which does not exist is a dead end: the file is
 * unfixable by hand, the updater will not proceed, and the only thing left is
 * to reinstall. So the escape hatch has to be real, and it has to be a
 * deliberate human act — nothing calls this on its own.
 *
 * What it costs, stated: after a reset the anti-rollback floor is whatever
 * `BINARY_VERSION` says, with no second source. Whoever resets is accepting
 * that the machine may be offered something older than what it was running.
 * The binary does not get replaced here; only the record of what it was.
 */
export declare function clearUpdateState(targetPath: string): Promise<{
    removed: boolean;
    path: string;
}>;
export declare function writeUpdateState(targetPath: string, state: UpdateState): Promise<void>;
export type HealthCheck = (installedPath: string) => Promise<{
    ok: boolean;
    detail: string;
}>;
export interface UpdateSource {
    kind: 'bytes';
    bytes: Uint8Array;
}
export interface UpdateSourceFile {
    kind: 'file';
    path: string;
    /** Expected digest, so a source we did not download is not installed on trust. */
    sha256: string;
}
export type UpdateSourceInput = UpdateSource | UpdateSourceFile;
export interface ApplyOptions {
    targetPath: string;
    /** `manual` is set only because a human ran `agent-port upgrade`. */
    mode: 'automatic' | 'manual';
    /** Required to install a build that changes the ledger schema, and never automatic. */
    acceptSchemaChange?: boolean;
    /** The ledger shape this binary writes. Defaults to `LEDGER_SCHEMA_VERSION`. */
    ledgerSchemaVersion?: number;
    /** Recorded in the result only. Never used to decide anything. */
    fromVersion?: string;
    source: UpdateSourceInput;
    healthCheck?: HealthCheck;
    /** Default true. The previous binary is what makes rollback possible at all. */
    keepBackup?: boolean;
    installedAt?: string;
}
export type ApplyOutcome = {
    status: 'applied';
    from: string;
    to: string;
    path: string;
    backup: string | null;
    health: 'passed' | 'skipped';
    state: UpdateState;
} | {
    status: 'rolled_back';
    reason: UpdateRefusal;
    detail: string;
    path: string;
    failedCopy: string | null;
} | ApplyRefusal;
export interface ApplyRefusal {
    status: 'refused';
    reason: UpdateRefusal;
    detail: string;
}
/**
 * Install a verified update, atomically, with rollback.
 *
 * The swap is `rename` within one directory, which POSIX guarantees is atomic
 * and which Windows guarantees only when the target is not a running image —
 * hence the explicit refusal below rather than a fallback that unlinks first.
 * An unlink-then-rename "fallback" would create exactly the half-written binary
 * this function exists to prevent, so it is not implemented.
 *
 * Nothing here throws. Every outcome is a value, because the caller is a CLI
 * and an uncaught rejection prints a stack trace to whatever is watching.
 */
export declare function applyUpdate(verdict: UpdateVerdict, options: ApplyOptions): Promise<ApplyOutcome>;
export interface PendingUpgrade {
    from?: string;
    to: string;
    sha256: string;
    target: string;
    backup: string;
}
/**
 * Finish, or undo, an upgrade that a power cut interrupted.
 *
 * The marker distinguishes the two cases that look identical from the outside:
 * a new binary that hashes to the offered digest (the swap happened, the
 * cleanup did not) and one that does not (the swap never completed). Guessing
 * wrong in the first case rolls a good release back; guessing wrong in the
 * second leaves a half-written binary in place. So it is decided by hash.
 */
export declare function recoverPendingUpgrade(targetPath: string): Promise<{
    status: 'clean';
} | {
    status: 'completed';
    version: string;
} | {
    status: 'rolled_back';
    version: string;
    detail: string;
} | {
    status: 'failed';
    detail: string;
}>;
/**
 * Prove a freshly installed binary starts, by running it once.
 *
 * This is the only place in the product that executes a downloaded artifact,
 * and it is reachable only after: a Sigstore signature verified against a
 * pinned identity, a checksum match, and a *second* hash of the file at the
 * installed path. That last one is what makes this safe — the bytes being
 * executed are the bytes that were verified, not the bytes a temp file held a
 * moment ago.
 *
 * The environment is stripped to what a version print needs. A check that hands
 * the new binary the merchant's signing secret and database password has no
 * business existing.
 */
export declare function versionHealthCheck(options?: {
    timeoutMs?: number;
    env?: Record<string, string | undefined>;
}): HealthCheck;
export interface DownloadResult {
    path: string;
    bytes: number;
    sha256: string;
    /** Clean up the temp file and the directory it was made in. */
    dispose: () => Promise<void>;
}
export declare class DownloadError extends Error {
    readonly reason: 'unreachable' | 'status' | 'too_large' | 'empty' | 'timeout';
    constructor(reason: 'unreachable' | 'status' | 'too_large' | 'empty' | 'timeout', message: string);
}
/**
 * Fetch the manifest from a pinned origin.
 *
 * The origin is a constant in this file, and a redirect to anywhere else is
 * refused. A redirect is the cheapest way to turn "served from our host" into
 * "served from wherever the host's DNS pointed this time", and the whole
 * different-origin property of B6.1 depends on this call not following one.
 */
export declare function downloadManifest(options?: {
    origin?: string;
    path?: string;
    timeoutMs?: number;
}): Promise<UpdateManifest>;
/**
 * Download the artifact into a private temporary directory.
 *
 * Two properties this must have or the verification above is theatre:
 * the bytes are streamed to a `mkdtemp` directory at mode 0700, and the digest
 * is computed *as they arrive* — so a body that is longer than the manifest
 * claims is refused at the ceiling rather than after filling a disk.
 *
 * The caller must pass the returned `path` to both the verifier and the
 * installer, and the installer re-hashes what it staged, so a swap of the
 * temporary file between the two does not get past the signature.
 */
export declare function downloadArtifact(url: string, expected?: {
    maxBytes?: number;
    timeoutMs?: number;
}): Promise<DownloadResult>;
/**
 * The release target name for this machine, as `process.platform` + `process.arch`.
 *
 * `win32` is mapped to `win`, and that mapping is the whole reason this is a
 * function rather than string concatenation. `process.platform` is `win32`, but
 * every release artifact, manifest filename and download URL spells the target
 * `win-x64` (`scripts/release-config.json`, `scripts/sea.mjs`, `BUILD-PLAN.md`).
 * A Windows merchant therefore asked for `win32-x64.json` from a channel that
 * only ever publishes `win-x64.json`, and every Windows update failed on
 * `platform_mismatch` while the test suite passed — the test supplied
 * `'win-x64'` by hand and so never ran the lookup a real machine performs.
 *
 * The release spelling is canonical: the artifact is named once, at build time,
 * and every later reference has to agree with it.
 */
export declare function platformKey(platform?: string, arch?: string): string;
export type SecretName = 'AGENTPORT_SIGNING_SECRET' | 'AGENTPORT_DB_PASSWORD';
export interface SecretConsent {
    /** The operator typed, or ticked, "put this in a file". */
    saveSigningSecret?: boolean;
    /** Never offered. Present only so the refusal is a decision and not an omission. */
    saveDbPassword?: false;
}
export interface FirstRunRequest {
    consent: SecretConsent;
    /** Whether an OS keychain integration is available. Absent means: do not. */
    keychain?: {
        available: boolean;
        service: string;
        account: string;
    };
    envPath?: string;
}
export type FirstRunPlan = {
    action: 'print_secret';
    name: SecretName;
    value: string;
    persisted: false;
} | {
    action: 'prompt';
    name: SecretName;
    hint: string;
    persisted: false;
} | {
    action: 'store_in_keychain';
    name: SecretName;
    service: string;
    account: string;
    persisted: true;
} | {
    action: 'write_env_file';
    path: string;
    entries: {
        name: SecretName;
        value: string;
    }[];
    mode: 0o600;
    persisted: true;
} | {
    action: 'refuse';
    name: SecretName;
    detail: string;
    persisted: false;
};
/**
 * Decide what happens to each secret before anything is generated or asked for.
 *
 * Pure, and the only place the policy lives. The caller does the prompting and
 * the writing; if a future path writes a secret, it has to go around this, and
 * this is the function a test points at.
 */
export declare function planFirstRun(request: FirstRunRequest): FirstRunPlan[];
/** A value to fill a `plan` entry in with. Never cached, never logged. */
export declare function generateSigningSecret(bytes?: number): string;
/** What `agent-port doctor` and the CLI print, so the pins are visible in a log. */
export declare function describeUpdatePolicy(): {
    currentVersion: string;
    ledgerSchemaVersion: number;
    manifestOrigin: string;
    certificateIdentity: string;
    oidcIssuer: string;
    channel: string;
};
//# sourceMappingURL=upgrade.d.ts.map
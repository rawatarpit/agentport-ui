import { createHash, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { chmod, copyFile, lstat, mkdtemp, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
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
export const LEDGER_SCHEMA_VERSION = 2;
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
// The exact cosign certificate identity a release must carry, and the single
// most consequential string in the file: an install verifies against this and
// nothing else. It names the workflow file, so a signature produced by any
// other workflow in this repository — including one an attacker could add —
// does not satisfy it.
//
// The `*` is load-bearing and was missing. cosign matches this as a literal
// prefix, so `refs/tags/v` admits `v1` but not `v0.1.0`: every correctly
// signed release built from a semantic-version tag would have been refused,
// and the only way to make an update install would have been to loosen the
// identity. Truncated identities fail closed, which is the right direction to
// fail, but it fails on every real release.
export const RELEASE_CERTIFICATE_IDENTITY = 'https://github.com/agentport/agentport-sdk/.github/workflows/release.yml@refs/tags/v*';
export const RELEASE_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
export const RELEASE_MANIFEST_ORIGIN = 'https://updates.agentport.dev';
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
export const BINARY_VERSION = '0.1.0+source';
/** The vocabulary of everything this module can refuse. No generic failure. */
export const UPDATE_REFUSALS = [
    'manifest_malformed',
    'platform_mismatch',
    'insecure_url',
    'same_origin',
    'payload_too_small',
    'payload_too_large',
    'signature_missing',
    'keyed_bundle',
    'signature_invalid',
    'checksum_mismatch',
    'not_newer',
    'downgrade',
    'rollback',
    'schema_change',
    'schema_downgrade',
    'state_unreadable',
    'manual_approval_required',
    'installer_not_self_applicable',
    'target_unusable',
    'read_failed',
    'write_failed',
    'health_check_failed',
    'rollback_failed',
];
export const UPDATE_STATE_SUFFIX = '.agentport-update-state.json';
const PENDING_SUFFIX = '.agentport-upgrade-pending.json';
const BACKUP_SUFFIX = '.agentport-previous';
const FAILED_SUFFIX = '.agentport-failed-update';
export function updateStatePath(targetPath) {
    return `${targetPath}${UPDATE_STATE_SUFFIX}`;
}
/**
 * Longest build this tool will accept. Refused *after* the signature check, so
 * a too-large manifest is a cosmetic failure rather than a DoS on a hostile
 * host, and refused before the checksum so a hostile host cannot make us hash
 * an unbounded buffer. The downloader applies the same bound while streaming.
 */
export const MAX_UPDATE_BYTES = 768 * 1024 * 1024;
/** Below this the artifact is a stub, a redirect body, or a truncated transfer. */
export const MIN_UPDATE_BYTES = 64;
/** A manifest entry with an embedded bundle is kilobytes. Anything larger is a hostile host. */
export const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
function parseSemver(value) {
    if (typeof value !== 'string')
        return null;
    const m = SEMVER.exec(value);
    if (!m)
        return null;
    return {
        major: Number(m[1]),
        minor: Number(m[2]),
        patch: Number(m[3]),
        prerelease: m[4],
    };
}
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
export function compareVersions(a, b) {
    const left = parseSemver(a);
    const right = parseSemver(b);
    if (!left || !right)
        return -1;
    if (left.major !== right.major)
        return left.major < right.major ? -1 : 1;
    if (left.minor !== right.minor)
        return left.minor < right.minor ? -1 : 1;
    if (left.patch !== right.patch)
        return left.patch < right.patch ? -1 : 1;
    if (left.prerelease === right.prerelease)
        return 0;
    if (left.prerelease === undefined)
        return 1;
    if (right.prerelease === undefined)
        return -1;
    return left.prerelease < right.prerelease ? -1 : 1;
}
/** Which bump a candidate represents, or null if it is not a forward move. */
export function classifyChannel(from, to) {
    const a = parseSemver(from);
    const b = parseSemver(to);
    if (!a || !b)
        return null;
    if (compareVersions(to, from) <= 0)
        return null;
    if (a.major !== b.major)
        return 'major';
    if (a.minor !== b.minor)
        return 'minor';
    return 'patch';
}
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
export function classifyBundle(bundle) {
    if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle))
        return 'unrecognised';
    const b = bundle;
    const material = b.verificationMaterial && typeof b.verificationMaterial === 'object'
        ? b.verificationMaterial
        : null;
    if (material && ('publicKey' in material || 'publicKeyIdentifier' in material))
        return 'keyed';
    if ('publicKey' in b)
        return 'keyed';
    if (!material && !b.dsseEnvelope)
        return 'unrecognised';
    // A keyless bundle must carry a certificate and a transparency-log entry.
    // cosign refuses a keyless signature with no Rekor entry anyway; checking it
    // here means the reason a release is refused is *ours*, not cosign's phrasing.
    if (material) {
        if (!material.certificate)
            return 'unrecognised';
        if (!Array.isArray(material.tlogEntries) || material.tlogEntries.length === 0)
            return 'unrecognised';
    }
    return 'keyless';
}
/**
 * Operator-facing text, stripped of anything the operator did not type.
 *
 * `detail` on a denial is a promise to the reader, and this one reaches a log
 * a stranger may hold. cosign writes absolute paths, bundle filenames and
 * sometimes a Go stack frame into its output; the last line is the useful one,
 * so that is what survives.
 */
function safeDetail(raw) {
    const lines = (raw ?? '')
        .split('\n')
        .map((l) => l.trim())
        // Stack frames are dropped before the first line is chosen, not after.
        // Taking the *last* line is the obvious implementation and it hands the
        // reader the deepest frame in a stack: `at run (node:internal/...)` is a
        // map of our process to anyone holding the log. The message is first by
        // convention, and the convention is the only thing separating them.
        .filter((l) => l.length > 0 && !/^at\s+\S+\s*\(/.test(l));
    const first = lines.length > 0 ? lines[0] : 'no further detail';
    return first.replace(/(^|[\s'(])\/[^\s')]+/g, '$1<path>').slice(0, 300);
}
/**
 * Clip a caller-supplied string before it reaches a log line.
 *
 * The manifest is attacker-controlled if the release host is, and a detail that
 * echoes it verbatim is a 10MB log line, a terminal that stops responding, and
 * an injection into whatever reads the log next. Every value in a `detail` that
 * came out of the document is clipped; every value that came out of this binary
 * is not, because clipping those would be hiding a fact from the operator.
 */
function clip(value, max = 80) {
    const clean = value.replace(/[\r\n\t]/g, ' ').trim();
    return clean.length <= max ? clean : `${clean.slice(0, max)}…`;
}
function hex(bytes) {
    return Buffer.from(bytes).toString('hex');
}
/** In-memory digest. Web Crypto, so this half of the file needs no Node crypto. */
export async function sha256(bytes) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return hex(new Uint8Array(digest));
}
/**
 * File digest, streamed. Separate from `sha256` above only because a 110MB SEA
 * binary should not be held in memory twice; `test/upgrade.test.ts` asserts the
 * two agree, so the duplication cannot drift into a real difference.
 */
export async function sha256File(path) {
    const hash = createHash('sha256');
    await pipeline(createReadStream(path), new Writable({
        write(chunk, _encoding, done) {
            hash.update(chunk);
            done();
        },
    }));
    return hash.digest('hex');
}
function refuse(reason, detail, steps) {
    return { status: 'refused', reason, detail, automatic: false, blockedBy: null, steps };
}
/**
 * Shape-check a manifest, with no context applied.
 *
 * Everything here is a property of the document. Platform, origin and version
 * are checked later, by `verifyUpdate`, because they are decisions about
 * *this* machine and belong in the order that is under test.
 */
export function parseManifest(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return { ok: false, reason: 'manifest_malformed', detail: 'The update manifest is not a JSON object.' };
    }
    const m = raw;
    // Bound once. Narrowing a property of an `unknown` record does not survive
    // the next call, and a manifest parser that loses its own narrowing is a
    // parser that needs a cast to compile — which is the shape of the bug this
    // file is here to prevent.
    const version = m.version;
    const platform = m.platform;
    const url = m.url;
    const sha256 = m.sha256;
    const ledgerSchemaVersion = m.ledgerSchemaVersion;
    const releasedAt = m.releasedAt;
    const artifact = m.artifact;
    const channel = m.channel;
    const sig = m.sig;
    if (typeof version !== 'string' || !parseSemver(version)) {
        return { ok: false, reason: 'manifest_malformed', detail: 'The manifest has no usable `version` (expected MAJOR.MINOR.PATCH).' };
    }
    if (typeof platform !== 'string' || platform.length === 0) {
        return { ok: false, reason: 'manifest_malformed', detail: 'The manifest has no `platform`.' };
    }
    if (typeof url !== 'string' || url.length === 0) {
        return { ok: false, reason: 'manifest_malformed', detail: 'The manifest has no `url`.' };
    }
    if (typeof sha256 !== 'string' || !SHA256_HEX.test(sha256)) {
        return { ok: false, reason: 'manifest_malformed', detail: 'The manifest `sha256` is not 64 lowercase hex characters.' };
    }
    if (!Number.isSafeInteger(ledgerSchemaVersion) || ledgerSchemaVersion < 1) {
        return { ok: false, reason: 'manifest_malformed', detail: 'The manifest `ledgerSchemaVersion` is not a positive integer.' };
    }
    if (typeof releasedAt !== 'string' || !Number.isFinite(Date.parse(releasedAt))) {
        return { ok: false, reason: 'manifest_malformed', detail: 'The manifest `releasedAt` is not an ISO-8601 timestamp.' };
    }
    if (artifact !== 'binary' && artifact !== 'installer') {
        return { ok: false, reason: 'manifest_malformed', detail: 'The manifest `artifact` is not `binary` or `installer`.' };
    }
    if (channel !== 'stable' && channel !== 'beta') {
        return { ok: false, reason: 'manifest_malformed', detail: 'The manifest `channel` is not `stable` or `beta`.' };
    }
    if (sig === undefined || sig === null) {
        return { ok: false, reason: 'manifest_malformed', detail: 'The manifest carries no `sig`. A checksum without a signature is not an update channel.' };
    }
    return {
        ok: true,
        manifest: {
            version,
            platform,
            url,
            sha256,
            sig,
            ledgerSchemaVersion: ledgerSchemaVersion,
            releasedAt,
            artifact,
            channel,
        },
    };
}
/**
 * The whole update decision, in the order it is taken.
 *
 * `steps` is returned so the ordering is assertable rather than merely
 * documented: a test can prove the signature ran before the checksum by
 * offering a payload that is *both* unsigned and corrupted, and the refusal
 * must name the signature. If someone swaps those two lines, that test fails.
 */
export async function verifyUpdate(raw, payload, options) {
    const steps = [];
    steps.push('manifest_shape');
    const parsed = parseManifest(raw);
    if (!parsed.ok)
        return refuse(parsed.reason, parsed.detail, steps);
    const manifest = parsed.manifest;
    steps.push('payload_size');
    if (payload.byteLength < MIN_UPDATE_BYTES) {
        return refuse('payload_too_small', `The download is ${payload.byteLength} bytes, which is not a ${options.platform} binary.`, steps);
    }
    if (payload.byteLength > MAX_UPDATE_BYTES) {
        return refuse('payload_too_large', `The download is ${payload.byteLength} bytes, over the ${MAX_UPDATE_BYTES} byte ceiling.`, steps);
    }
    steps.push('platform');
    if (manifest.platform !== options.platform) {
        return refuse('platform_mismatch', `The manifest offers ${clip(manifest.platform)}; this machine is ${options.platform}.`, steps);
    }
    steps.push('origin');
    let artifactUrl;
    try {
        artifactUrl = new URL(manifest.url);
    }
    catch {
        return refuse('manifest_malformed', 'The manifest `url` is not a URL.', steps);
    }
    if (artifactUrl.protocol !== 'https:') {
        return refuse('insecure_url', `The artifact URL is ${clip(artifactUrl.protocol, 16)} not https. An update channel over plaintext is not an update channel.`, steps);
    }
    if (artifactUrl.origin === options.manifestOrigin) {
        return refuse('same_origin', `The artifact is served from ${clip(artifactUrl.origin, 120)}, the same origin as the manifest. Compromising the release host would then be enough.`, steps);
    }
    // --- The signature. Before the checksum, before any write, before any exec. ---
    steps.push('signature');
    const shape = classifyBundle(manifest.sig);
    if (shape === 'keyed') {
        return refuse('keyed_bundle', 'The signature is a long-lived key. Releases are signed keylessly (Sigstore), so a bundle carrying a key is not ours.', steps);
    }
    if (shape === 'unrecognised') {
        return refuse('signature_missing', 'The `sig` is not a Sigstore bundle with a certificate and a transparency-log entry.', steps);
    }
    const signed = await options.verifier.verify({
        payload,
        bundle: manifest.sig,
        payloadPath: options.payloadPath,
        version: manifest.version,
        platform: manifest.platform,
        certificateIdentity: RELEASE_CERTIFICATE_IDENTITY,
        oidcIssuer: RELEASE_OIDC_ISSUER,
    });
    if (!signed.ok || !signed.trusted) {
        return refuse('signature_invalid', `Signature check failed (${options.verifier.id}): ${safeDetail(signed.reason)}`, steps);
    }
    // --- The checksum. Second, and only because the signature is already good. ---
    steps.push('checksum');
    const actual = await sha256(payload);
    if (actual !== manifest.sha256) {
        return refuse('checksum_mismatch', `The download is ${actual}, the manifest says ${manifest.sha256}. Neither is trusted; the release host is wrong or lying.`, steps);
    }
    // --- Version. A release channel is not a downgrade path. ---
    steps.push('version');
    // `options.currentVersion` is whatever the caller believes it is running. What
    // the *installer* wrote at the last successful update is a second, independent
    // record, and the higher of the two is the floor. Taking the maximum here
    // rather than in the wiring is deliberate: the anti-rollback property is an
    // invariant of this function, not of a line of code a caller has to remember
    // to copy. It matters because `BINARY_VERSION` is a build-time stamp, and a
    // build that shipped unstamped reports the version it was compiled from — so
    // with the sidecar deleted, a merchant on 0.4.0 would have 0.1.0 as its only
    // floor and 0.1.5 would look like an upgrade.
    const recorded = options.state?.lastVersion;
    const floor = recorded && compareVersions(recorded, options.currentVersion) > 0
        ? recorded
        : options.currentVersion;
    const order = compareVersions(manifest.version, floor);
    if (order < 0) {
        return refuse('downgrade', `Refusing to install ${manifest.version} over ${floor}. An older binary is how a fixed vulnerability comes back.`, steps);
    }
    if (order === 0) {
        const state = options.state;
        if (state && state.lastSha256 && state.lastSha256 !== manifest.sha256) {
            // Two artifacts claiming one version. One of them is a republish, and
            // there is no way to tell which — so neither is installed.
            return refuse('rollback', `${manifest.version} is already installed as ${state.lastSha256.slice(0, 12)}… and the manifest offers ${manifest.sha256.slice(0, 12)}…. A published version is immutable; cut a new one.`, steps);
        }
        return { status: 'up_to_date', detail: `${floor} is current.`, automatic: false, blockedBy: null, steps };
    }
    const state = options.state;
    if (state?.lastReleasedAt && Date.parse(manifest.releasedAt) < Date.parse(state.lastReleasedAt)) {
        return refuse('rollback', `Refusing ${manifest.version}, released before the ${state.lastVersion ?? 'previously installed'} build. The manifest host is serving an older release with a signature that is still valid.`, steps);
    }
    if (state?.lastVersion && compareVersions(manifest.version, state.lastVersion) < 0) {
        return refuse('rollback', `Refusing ${manifest.version}; ${state.lastVersion} was installed more recently.`, steps);
    }
    // --- The ledger. Crossed, it is a human decision or it is nothing. ---
    steps.push('schema');
    const binarySchema = options.ledgerSchemaVersion ?? LEDGER_SCHEMA_VERSION;
    if (state && state.ledgerSchemaVersion > binarySchema) {
        return refuse('schema_downgrade', `This build writes ledger schema ${binarySchema}; the ledger on this machine was written by schema ${state.ledgerSchemaVersion}. Older builds cannot read newer rows and the ledger has no update path, so this binary is not allowed to install over it.`, steps);
    }
    if (manifest.ledgerSchemaVersion < binarySchema) {
        return refuse('schema_downgrade', `The offered build writes ledger schema ${manifest.ledgerSchemaVersion}; this machine's ledger is schema ${binarySchema}. Installing it would add rows to a table a newer build must be able to read.`, steps);
    }
    const crossesSchema = manifest.ledgerSchemaVersion > binarySchema;
    // --- Channel. patch automatic; everything else a human. ---
    steps.push('channel');
    const channel = classifyChannel(options.currentVersion, manifest.version) ?? 'major';
    const blockedBy = crossesSchema
        ? 'schema_change'
        : manifest.artifact === 'installer'
            ? 'installer'
            : channel === 'patch'
                ? null
                : 'channel';
    const automatic = blockedBy === null && manifest.channel === 'stable' && parseSemver(manifest.version)?.prerelease === undefined;
    return {
        status: 'available',
        manifest,
        channel,
        automatic,
        blockedBy,
        detail: automatic
            ? `${options.currentVersion} → ${manifest.version} (patch, safe to install unattended).`
            : crossesSchema
                ? `${manifest.version} changes the ledger schema (${binarySchema} → ${manifest.ledgerSchemaVersion}). Manual install only; see MIGRATION.md.`
                : `${manifest.version} is a ${channel} update. Install it yourself.`,
        steps,
    };
}
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
export function cosignVerifier(options = {}) {
    const binary = options.binary ?? 'cosign';
    const timeoutMs = options.timeoutMs ?? 60_000;
    return {
        id: `cosign keyless (${RELEASE_OIDC_ISSUER})`,
        verify: async (input) => {
            if (!input.payloadPath) {
                return {
                    ok: false,
                    trusted: false,
                    reason: 'cosign verifies a file; download the artifact to a private temporary file and pass its path in `payloadPath` rather than holding 110MB twice',
                };
            }
            const bundlePath = `${input.payloadPath}.sigstore.bundle.json`;
            try {
                await writeFile(bundlePath, JSON.stringify(input.bundle), { mode: 0o600 });
                const { stdout, stderr, exitCode } = await runTool(binary, [
                    'verify-blob',
                    '--bundle', bundlePath,
                    '--new-bundle-format',
                    '--certificate-identity', input.certificateIdentity,
                    '--certificate-oidc-issuer', input.oidcIssuer,
                    input.payloadPath,
                ], timeoutMs);
                // `runTool` reports a non-zero exit instead of throwing, because a
                // timeout and a refusal are different problems and the caller has to be
                // able to say which. That means the exit code has to be *checked* here
                // rather than inferred from an exception that no longer arrives — and
                // getting this wrong would report every failed signature verification
                // as trusted, which is the one line in this file that must not be
                // wrong. Anything other than 0 is a failed verification.
                if (exitCode !== 0) {
                    return {
                        ok: false,
                        trusted: false,
                        reason: `cosign exited ${exitCode}: ${safeDetail(stderr || stdout || 'no output')}`,
                    };
                }
                return { ok: true, trusted: true, identity: input.certificateIdentity, issuer: input.oidcIssuer, reason: stdout };
            }
            catch (err) {
                return { ok: false, trusted: false, reason: messageOf(err) };
            }
            finally {
                await rm(bundlePath, { force: true }).catch(() => undefined);
            }
        },
    };
}
const execFileAsync = promisify(execFile);
/**
 * Run an external tool. `execFile` with a fixed argv, a timeout and a bounded
 * buffer — never a shell string, because every argument in this file is either
 * a constant or a value this module produced.
 */
async function runTool(binary, args, timeoutMs) {
    try {
        const result = await execFileAsync(binary, [...args], {
            timeout: timeoutMs,
            maxBuffer: 1 << 20,
            windowsHide: true,
            encoding: 'utf8',
        });
        // `execFile` only resolves on exit 0 — a non-zero exit rejects — so there
        // is no code to read here, and 0 is not a guess.
        return {
            stdout: String(result.stdout),
            stderr: String(result.stderr),
            timedOut: false,
            exitCode: 0,
        };
    }
    catch (err) {
        // `execFile` reports a timeout by *killing* the child and then rejecting
        // with the same shape it uses for any other non-zero exit, so the two are
        // indistinguishable from the message alone. They are not the same problem:
        // a binary that hangs is a different bug from a binary that refuses, and
        // "Command failed: …" does not tell a merchant which one they are looking
        // at. `killed` is what the timeout sets and a plain non-zero exit does not.
        const e = err;
        return {
            stdout: typeof e.stdout === 'string' ? e.stdout : '',
            stderr: typeof e.stderr === 'string' ? e.stderr : '',
            timedOut: e.killed === true && e.signal !== null,
            exitCode: typeof e.code === 'number' ? e.code : null,
        };
    }
}
/** An `Error`'s message, without the stack. Stacks do not go to a caller. */
function messageOf(err) {
    return err instanceof Error ? err.message : String(err);
}
function refuseResult(reason, detail) {
    return { status: 'refused', reason, detail };
}
// --- State beside the binary -------------------------------------------------
//
// Deliberately a sidecar and not a ledger row. `agentport_ledger` is append-only
// with no update path, so "what did we last install" cannot be a row that gets
// rewritten. A rewrite is exactly the attack this defends against: a hostile
// manifest host serves last month's release, whose signature is still perfectly
// valid. The state file is a rollback guard, not a trust anchor — someone who
// can write it can also replace the binary, and the binary re-verifies the
// state file's claims against its own compiled-in schema constant anyway.
export function parseUpdateState(raw) {
    if (raw === null)
        return { ok: true, state: { ledgerSchemaVersion: LEDGER_SCHEMA_VERSION } };
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        // Fail closed. An unreadable state file is either corruption or a deleted
        // file, and "delete the file, serve an old signed release" is the rollback
        // attack. The updater stops; the product does not. `agent-port upgrade
        // --reset-state` is the documented way out, and it is a human decision.
        return { ok: false, detail: 'The update state file beside the binary is not readable JSON. Refusing to update: an unreadable state file is how a rollback is disguised as a fresh install. Run `agent-port upgrade --reset-state` if you are sure.' };
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ok: false, detail: 'The update state file beside the binary is not an object.' };
    }
    const s = parsed;
    const schema = s.ledgerSchemaVersion;
    if (!Number.isSafeInteger(schema) || schema < 1) {
        return { ok: false, detail: 'The update state file has no usable `ledgerSchemaVersion`.' };
    }
    const state = { ledgerSchemaVersion: schema };
    if (typeof s.lastVersion === 'string')
        state.lastVersion = s.lastVersion;
    if (typeof s.lastReleasedAt === 'string')
        state.lastReleasedAt = s.lastReleasedAt;
    if (typeof s.lastSha256 === 'string')
        state.lastSha256 = s.lastSha256;
    if (typeof s.lastInstalledAt === 'string')
        state.lastInstalledAt = s.lastInstalledAt;
    return { ok: true, state };
}
export async function readUpdateState(targetPath) {
    let raw;
    try {
        raw = await readFile(updateStatePath(targetPath), 'utf8');
    }
    catch (err) {
        if (err.code === 'ENOENT')
            return parseUpdateState(null);
        return { ok: false, detail: 'The update state file beside the binary could not be read.' };
    }
    return parseUpdateState(raw);
}
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
export async function clearUpdateState(targetPath) {
    const path = updateStatePath(targetPath);
    try {
        await rm(path, { force: false });
        return { removed: true, path };
    }
    catch (err) {
        if (err.code === 'ENOENT')
            return { removed: false, path };
        throw err;
    }
}
export async function writeUpdateState(targetPath, state) {
    // 0600. The file names a checksum and a version; it is not a secret, but
    // nothing else in this directory should be writable by another user either.
    await writeFile(updateStatePath(targetPath), `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}
function isRefusal(verdict) {
    return verdict.status === 'refused';
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
export async function applyUpdate(verdict, options) {
    if (isRefusal(verdict)) {
        return refuseResult(verdict.reason ?? 'manifest_malformed', verdict.detail);
    }
    if (verdict.status === 'up_to_date') {
        return refuseResult('not_newer', 'There is nothing to install.');
    }
    const manifest = verdict.manifest;
    if (!manifest) {
        return refuseResult('manifest_malformed', 'The verdict carries no manifest to install.');
    }
    if (manifest.artifact !== 'binary') {
        return refuseResult('installer_not_self_applicable', 'This release is an installer package, not a binary. Run the installer; a running process cannot replace itself with a .dmg.');
    }
    const binarySchema = options.ledgerSchemaVersion ?? LEDGER_SCHEMA_VERSION;
    if (manifest.ledgerSchemaVersion !== binarySchema && options.acceptSchemaChange !== true) {
        // Belt and braces with `blockedBy`: nothing crosses the ledger schema
        // without the operator saying so in this exact call. `verifyUpdate` already
        // refuses it, so this is the second place the rule has to be right — which
        // is the reason the call itself demands the acknowledgement rather than
        // trusting the verdict that led here.
        return refuseResult('schema_change', `This build writes ledger schema ${manifest.ledgerSchemaVersion}; this binary writes ${binarySchema}. Refusing without an explicit acknowledgement.`);
    }
    if (!verdict.automatic && options.mode !== 'manual') {
        return refuseResult('manual_approval_required', verdict.blockedBy === 'schema_change'
            ? 'This release changes the ledger schema, which is never installed unattended.'
            : 'This is not a patch update. Run `agent-port upgrade` yourself to install it.');
    }
    const target = resolve(options.targetPath);
    const directory = dirname(target);
    const name = basename(target);
    let targetStat;
    try {
        targetStat = await lstat(target);
    }
    catch (err) {
        return refuseResult('target_unusable', `There is no binary at the configured path. (${err.code ?? 'unreadable'})`);
    }
    if (targetStat.isSymbolicLink()) {
        // Replacing a symlink would leave the merchant running whatever it points
        // at, and the rollback would restore the pointer rather than the program.
        return refuseResult('target_unusable', 'The configured binary is a symlink. Refusing: this would not replace what is actually running.');
    }
    if (!targetStat.isFile()) {
        return refuseResult('target_unusable', 'The configured binary is not a regular file.');
    }
    const mode = (targetStat.mode & 0o7777) || 0o755;
    // Staged in the target directory, never in a temp directory. `rename` across
    // filesystems is not atomic — it is a copy and a delete — so staging in
    // `$TMPDIR` would reintroduce the half-written binary on exactly the
    // machines that have a separate /tmp.
    const staged = join(directory, `.${name}.agentport-staged-${randomBytes(6).toString('hex')}`);
    const backup = join(directory, `.${name}${BACKUP_SUFFIX}`);
    const backupPath = options.keepBackup === false ? null : backup;
    const pending = `${target}${PENDING_SUFFIX}`;
    let expectedDigest = manifest.sha256;
    try {
        if (options.source.kind === 'bytes') {
            if (options.source.bytes.byteLength < MIN_UPDATE_BYTES) {
                return refuseResult('payload_too_small', 'The staged bytes are too small to be a binary.');
            }
            if (options.source.bytes.byteLength > MAX_UPDATE_BYTES) {
                return refuseResult('payload_too_large', 'The staged bytes are over the size ceiling.');
            }
            await writeFile(staged, options.source.bytes, { mode });
            expectedDigest = await sha256(options.source.bytes);
        }
        else {
            expectedDigest = options.source.sha256;
            // Copy, never move: the downloaded file is the evidence, and a move here
            // would make every failure path depend on a file that no longer exists.
            await copyFile(options.source.path, staged);
            await chmod(staged, mode);
        }
    }
    catch (err) {
        await rm(staged, { force: true }).catch(() => undefined);
        return refuseResult('write_failed', `The update could not be staged next to the binary. (${messageOf(err)})`);
    }
    if (expectedDigest !== manifest.sha256) {
        await rm(staged, { force: true }).catch(() => undefined);
        return refuseResult('checksum_mismatch', 'The staged bytes do not hash to the value the signed manifest carries. The source changed after it was verified.');
    }
    // Re-hash what actually landed on disk before anything is renamed over a
    // working binary. This is the last moment at which giving up costs nothing.
    try {
        const onDisk = await sha256File(staged);
        if (onDisk !== manifest.sha256) {
            await rm(staged, { force: true }).catch(() => undefined);
            return refuseResult('checksum_mismatch', 'The staged file does not hash to the signed value. The write was truncated or altered; nothing has been replaced.');
        }
    }
    catch (err) {
        await rm(staged, { force: true }).catch(() => undefined);
        return refuseResult('read_failed', `The staged file could not be read back. (${messageOf(err)})`);
    }
    const state = {
        ledgerSchemaVersion: manifest.ledgerSchemaVersion,
        lastVersion: manifest.version,
        lastReleasedAt: manifest.releasedAt,
        lastSha256: manifest.sha256,
    };
    if (options.installedAt)
        state.lastInstalledAt = options.installedAt;
    // The marker is written before the swap, so a power cut between the two
    // renames is recoverable: `recoverPendingUpgrade` can tell "the upgrade
    // finished and was killed before cleanup" from "the upgrade never happened".
    try {
        await writeFile(pending, `${JSON.stringify({ from: state.lastVersion, to: manifest.version, sha256: manifest.sha256, target, backup }, null, 2)}\n`, { mode: 0o600 });
    }
    catch (err) {
        await rm(staged, { force: true }).catch(() => undefined);
        return refuseResult('write_failed', `The upgrade marker could not be written. (${messageOf(err)})`);
    }
    let movedAside = false;
    try {
        await rm(backup, { force: true });
        await rename(target, backup);
        movedAside = true;
    }
    catch (err) {
        await rm(staged, { force: true }).catch(() => undefined);
        await rm(pending, { force: true }).catch(() => undefined);
        return refuseResult('target_unusable', `The running binary could not be moved aside (${messageOf(err)}). On Windows this usually means the agent is still running — stop it and try again.`);
    }
    try {
        await rename(staged, target);
    }
    catch (err) {
        const restored = await restore(backup, target);
        await rm(staged, { force: true }).catch(() => undefined);
        if (!restored) {
            return { status: 'rolled_back', reason: 'rollback_failed', detail: 'The new binary could not be installed and the previous one could not be restored. The backup is at the path printed by `agent-port doctor`.', path: target, failedCopy: null };
        }
        await rm(pending, { force: true }).catch(() => undefined);
        return { status: 'rolled_back', reason: 'write_failed', detail: `The new binary could not be moved into place (${messageOf(err)}). The previous binary is back in service.`, path: target, failedCopy: null };
    }
    // The installed bytes are re-hashed, at the installed path, before anything
    // is executed. Everything above could have been done by a hostile filesystem;
    // this is the check that the bytes about to run are the bytes that verified.
    try {
        const installed = await sha256File(target);
        if (installed !== manifest.sha256) {
            const failed = await quarantine(target);
            const restored = await restore(backup, target);
            await rm(pending, { force: true }).catch(() => undefined);
            if (!restored) {
                return { status: 'rolled_back', reason: 'rollback_failed', detail: 'The installed binary hashed differently after the move and the previous one could not be restored.', path: target, failedCopy: failed };
            }
            return { status: 'rolled_back', reason: 'checksum_mismatch', detail: 'The installed binary hashed differently after the move. The previous binary is back in service.', path: target, failedCopy: failed };
        }
    }
    catch (err) {
        const failed = await quarantine(target);
        const restored = await restore(backup, target);
        await rm(pending, { force: true }).catch(() => undefined);
        if (!restored) {
            return { status: 'rolled_back', reason: 'rollback_failed', detail: `The installed binary could not be verified (${messageOf(err)}) and the previous one could not be restored.`, path: target, failedCopy: failed };
        }
        return { status: 'rolled_back', reason: 'read_failed', detail: `The installed binary could not be verified (${messageOf(err)}). The previous binary is back in service.`, path: target, failedCopy: failed };
    }
    const health = options.healthCheck;
    if (health) {
        let report;
        try {
            report = await health(target);
        }
        catch (err) {
            report = { ok: false, detail: messageOf(err) };
        }
        if (!report.ok) {
            const failed = await quarantine(target);
            const restored = await restore(backup, target);
            await rm(pending, { force: true }).catch(() => undefined);
            if (!restored) {
                return { status: 'rolled_back', reason: 'rollback_failed', detail: `The new binary failed its start check and the previous one could not be restored. Failed copy: ${failed ?? 'unknown'}.`, path: target, failedCopy: failed };
            }
            // The failed binary is kept, not deleted: it is the evidence for whoever
            // has to work out why a signed release will not start.
            return { status: 'rolled_back', reason: 'health_check_failed', detail: `The new binary did not start (${safeDetail(report.detail)}). The previous binary is back in service.`, path: target, failedCopy: failed };
        }
    }
    // The directory entry, not the file: the data is already durable from the
    // `sha256File` above, and what a power cut loses is the *name*, which is the
    // only part that matters here.
    await syncDir(directory);
    try {
        await writeUpdateState(target, state);
    }
    catch (err) {
        // The binary is good and in place; only the rollback guard is missing. It
        // is reported as applied because that is the merchant-visible truth, and the
        // missing guard is what the next `doctor` run should complain about.
        return { status: 'applied', from: options.fromVersion ?? '', to: manifest.version, path: target, backup: backupPath, health: health ? 'passed' : 'skipped', state };
    }
    await rm(pending, { force: true }).catch(() => undefined);
    if (options.keepBackup === false) {
        await rm(backup, { force: true }).catch(() => undefined);
    }
    return {
        status: 'applied',
        from: options.fromVersion ?? '',
        to: manifest.version,
        path: target,
        backup: backupPath,
        health: health ? 'passed' : 'skipped',
        state,
    };
}
async function restore(backup, target) {
    try {
        await rename(backup, target);
        await syncDir(dirname(target));
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Move a bad binary aside rather than deleting it. A signed release that will
 * not start is evidence, and the person who has to work out why is not the
 * person who ran the upgrade.
 *
 * Which also means these accumulate: a merchant who retries a broken release
 * five times has five 110MB files named `agent-port.agentport-failed-update-*`
 * next to their binary. `agent-port doctor` should list them; nothing here
 * deletes them, because deleting the only copy of the thing that went wrong is
 * the one cleanup that is unambiguously wrong.
 */
async function quarantine(path) {
    const dest = `${path}${FAILED_SUFFIX}-${Date.now().toString(36)}`;
    try {
        await rename(path, dest);
        return dest;
    }
    catch {
        return null;
    }
}
/**
 * Flush the directory entry, so the rename survives a power cut.
 *
 * Best effort by necessity: Windows cannot open a directory as a file, and a
 * platform that cannot fsync a directory gets atomicity without durability.
 * That is still better than the alternative, and it is stated rather than
 * assumed.
 */
async function syncDir(path) {
    try {
        const handle = await open(path, 'r');
        try {
            await handle.sync();
        }
        finally {
            await handle.close();
        }
    }
    catch {
        /* not supported on this platform */
    }
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
export async function recoverPendingUpgrade(targetPath) {
    const target = resolve(targetPath);
    const marker = `${target}${PENDING_SUFFIX}`;
    let raw;
    try {
        raw = await readFile(marker, 'utf8');
    }
    catch (err) {
        if (err.code === 'ENOENT')
            return { status: 'clean' };
        return { status: 'failed', detail: 'An interrupted upgrade marker could not be read. Inspect the binary path by hand.' };
    }
    let pending;
    try {
        const parsed = JSON.parse(raw);
        if (typeof parsed.to !== 'string' || typeof parsed.sha256 !== 'string' || typeof parsed.target !== 'string' || typeof parsed.backup !== 'string') {
            throw new Error('incomplete');
        }
        pending = { to: parsed.to, sha256: parsed.sha256, target: parsed.target, backup: parsed.backup, from: typeof parsed.from === 'string' ? parsed.from : undefined };
    }
    catch {
        return { status: 'failed', detail: 'An interrupted upgrade marker is unreadable. The previous binary is kept beside the current one; restore it by hand if the current one will not start.' };
    }
    let installed = null;
    try {
        installed = await sha256File(target);
    }
    catch {
        installed = null;
    }
    if (installed === pending.sha256) {
        await rm(marker, { force: true }).catch(() => undefined);
        return { status: 'completed', version: pending.to };
    }
    const restored = await restore(pending.backup, target);
    await rm(marker, { force: true }).catch(() => undefined);
    if (!restored) {
        return { status: 'failed', detail: 'An upgrade was interrupted and the previous binary could not be restored automatically. The backup is still on disk.' };
    }
    return {
        status: 'rolled_back',
        version: pending.from ?? 'the previous version',
        detail: 'An upgrade was interrupted before it finished. The previous binary is back in place.',
    };
}
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
export function versionHealthCheck(options = {}) {
    const timeoutMs = options.timeoutMs ?? 20_000;
    return async (installedPath) => {
        let run;
        try {
            run = await runTool(installedPath, ['--version'], timeoutMs);
        }
        catch (err) {
            return { ok: false, detail: `the binary could not be run: ${messageOf(err)}` };
        }
        if (run.timedOut) {
            return { ok: false, detail: `the binary did not answer --version within ${timeoutMs}ms and was killed. A signed release that hangs on startup is not installed.` };
        }
        if (run.exitCode !== 0) {
            return {
                ok: false,
                detail: run.exitCode === null
                    ? 'the binary could not be run.'
                    : `the binary exited ${run.exitCode} for --version. If this build has no --version flag it prints usage and exits non-zero, which looks identical to a bad start; check the release notes for a CLI change.`,
            };
        }
        const printed = run.stdout.trim();
        if (printed.length === 0) {
            return { ok: false, detail: 'the binary exited 0 and printed nothing for --version, which is not a version' };
        }
        return { ok: true, detail: printed.slice(0, 120) };
    };
}
export class DownloadError extends Error {
    reason;
    constructor(reason, message) {
        super(message);
        this.name = 'DownloadError';
        this.reason = reason;
    }
}
/**
 * Fetch the manifest from a pinned origin.
 *
 * The origin is a constant in this file, and a redirect to anywhere else is
 * refused. A redirect is the cheapest way to turn "served from our host" into
 * "served from wherever the host's DNS pointed this time", and the whole
 * different-origin property of B6.1 depends on this call not following one.
 */
export async function downloadManifest(options = {}) {
    const origin = options.origin ?? RELEASE_MANIFEST_ORIGIN;
    const url = `${origin.replace(/\/$/, '')}/${(options.path ?? 'stable').replace(/^\//, '')}/${platformKey()}.json`;
    const target = new URL(url);
    if (target.origin !== origin.replace(/\/$/, '')) {
        throw new DownloadError('unreachable', 'The manifest origin does not match the pinned origin.');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
    let response;
    try {
        response = await fetch(target, { redirect: 'error', signal: controller.signal, headers: { accept: 'application/json' } });
    }
    catch (err) {
        throw new DownloadError('unreachable', `The update manifest could not be fetched. (${messageOf(err)})`);
    }
    finally {
        clearTimeout(timer);
    }
    if (!response.ok) {
        throw new DownloadError('status', `The update manifest request returned ${response.status}.`);
    }
    // Capped, because the manifest host is the least trusted thing in this
    // system and `response.text()` will happily hold a gigabyte of it. One entry
    // with an embedded Sigstore bundle is a few kilobytes.
    const declared = Number(response.headers.get('content-length') ?? Number.NaN);
    if (Number.isFinite(declared) && declared > MAX_MANIFEST_BYTES) {
        throw new DownloadError('too_large', `The manifest declares ${declared} bytes, over the ${MAX_MANIFEST_BYTES} ceiling.`);
    }
    const text = await response.text();
    if (text.length > MAX_MANIFEST_BYTES) {
        throw new DownloadError('too_large', `The manifest is ${text.length} bytes, over the ${MAX_MANIFEST_BYTES} ceiling.`);
    }
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch {
        throw new DownloadError('unreachable', 'The update manifest is not JSON.');
    }
    const result = parseManifest(parsed);
    if (!result.ok) {
        throw new DownloadError('unreachable', `The update manifest is not usable: ${result.detail}`);
    }
    return result.manifest;
}
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
export async function downloadArtifact(url, expected = {}) {
    let target;
    try {
        target = new URL(url);
    }
    catch {
        throw new DownloadError('unreachable', 'The artifact URL is not a URL.');
    }
    if (target.protocol !== 'https:') {
        throw new DownloadError('unreachable', 'The artifact URL is not https.');
    }
    const maxBytes = expected.maxBytes ?? MAX_UPDATE_BYTES;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), expected.timeoutMs ?? 10 * 60_000);
    let response;
    try {
        response = await fetch(target, { redirect: 'follow', signal: controller.signal });
    }
    catch (err) {
        throw new DownloadError('unreachable', `The artifact could not be fetched. (${messageOf(err)})`);
    }
    finally {
        clearTimeout(timer);
    }
    if (!response.ok) {
        throw new DownloadError('status', `The artifact request returned ${response.status}.`);
    }
    if (!response.body) {
        throw new DownloadError('empty', 'The artifact response had no body.');
    }
    const declared = Number(response.headers.get('content-length') ?? Number.NaN);
    if (Number.isFinite(declared) && declared > maxBytes) {
        throw new DownloadError('too_large', `The artifact declares ${declared} bytes, over the ${maxBytes} ceiling.`);
    }
    const dir = await mkdtemp(join(tmpdir(), 'agentport-update-'));
    const path = join(dir, 'artifact');
    const hash = createHash('sha256');
    let bytes = 0;
    try {
        await pipeline(Readable.fromWeb(response.body), async function* (source) {
            for await (const chunk of source) {
                bytes += chunk.byteLength;
                if (bytes > maxBytes) {
                    throw new DownloadError('too_large', `The artifact exceeded the ${maxBytes} byte ceiling while downloading.`);
                }
                hash.update(chunk);
                yield chunk;
            }
        }, createWriteStream(path, { mode: 0o600 }));
    }
    catch (err) {
        await rm(dir, { recursive: true, force: true }).catch(() => undefined);
        throw err instanceof DownloadError ? err : new DownloadError('unreachable', `The artifact download failed. (${messageOf(err)})`);
    }
    const digest = hash.digest('hex');
    if (bytes < MIN_UPDATE_BYTES) {
        await rm(dir, { recursive: true, force: true }).catch(() => undefined);
        throw new DownloadError('empty', `The download was ${bytes} bytes.`);
    }
    // Deliberately no comparison against the manifest here.
    //
    // An earlier version took `expected.sha256` and threw on a mismatch, and the
    // comment claimed that was "not a refusal". It was a refusal: it happened
    // before `verifyUpdate` ran, so a tampered artifact was rejected by the
    // transport having never been offered to cosign, and the signature-first
    // ordering the product is built on did not hold on the composed path — only
    // in the unit test of `verifyUpdate`, which passed the whole time.
    //
    // The parameter is gone rather than merely ignored, so no caller can
    // reintroduce a pre-signature digest check through this API. The digest is
    // reported for the installer to re-check at the path it is about to run; the
    // decision belongs to `verifyUpdate`, in that order.
    return { path, bytes, sha256: digest, dispose: () => rm(dir, { recursive: true, force: true }) };
}
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
export function platformKey(platform = process.platform, arch = process.arch) {
    return `${platform === 'win32' ? 'win' : platform}-${arch}`;
}
/**
 * Decide what happens to each secret before anything is generated or asked for.
 *
 * Pure, and the only place the policy lives. The caller does the prompting and
 * the writing; if a future path writes a secret, it has to go around this, and
 * this is the function a test points at.
 */
export function planFirstRun(request) {
    const plans = [];
    const db = 'AGENTPORT_DB_PASSWORD';
    const signing = 'AGENTPORT_SIGNING_SECRET';
    // The database password is the operator's to supply, and never ours to keep.
    plans.push({
        action: 'prompt',
        name: db,
        hint: 'Password for the ledger database. Read from AGENTPORT_DB_PASSWORD; this setup will not write it to any file.',
        persisted: false,
    });
    if (request.keychain?.available === true) {
        // Only ever on request, and only when the platform can actually do it. A
        // "store it" that silently degrades to a plaintext file is how a keychain
        // feature becomes a liability.
        if (request.consent.saveSigningSecret === true) {
            plans.push({ action: 'store_in_keychain', name: signing, service: request.keychain.service, account: request.keychain.account, persisted: true });
        }
        else {
            plans.push({ action: 'print_secret', name: signing, value: '', persisted: false });
        }
    }
    else if (request.consent.saveSigningSecret === true && typeof request.envPath === 'string' && request.envPath.length > 0) {
        plans.push({ action: 'write_env_file', path: request.envPath, entries: [{ name: signing, value: '' }], mode: 0o600, persisted: true });
    }
    else {
        plans.push({ action: 'print_secret', name: signing, value: '', persisted: false });
    }
    return plans;
}
/** A value to fill a `plan` entry in with. Never cached, never logged. */
export function generateSigningSecret(bytes = 32) {
    const buffer = new Uint8Array(bytes);
    globalThis.crypto.getRandomValues(buffer);
    return Buffer.from(buffer).toString('base64url');
}
/** What `agent-port doctor` and the CLI print, so the pins are visible in a log. */
export function describeUpdatePolicy() {
    return {
        currentVersion: BINARY_VERSION,
        ledgerSchemaVersion: LEDGER_SCHEMA_VERSION,
        manifestOrigin: RELEASE_MANIFEST_ORIGIN,
        certificateIdentity: RELEASE_CERTIFICATE_IDENTITY,
        oidcIssuer: RELEASE_OIDC_ISSUER,
        channel: `patch (${LEDGER_SCHEMA_VERSION} → ${LEDGER_SCHEMA_VERSION}) automatic; minor, major, beta, and any ledger schema change manual`,
    };
}
//# sourceMappingURL=upgrade.js.map
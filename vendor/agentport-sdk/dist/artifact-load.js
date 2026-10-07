import { dirname } from 'node:path';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { verifyArtifact } from './artifact.js';
/**
 * Fail-closed, with specific reasons. The message names the source and the
 * verification reason, never key material and never the raw bytes: a PEM or a
 * payload in an error string is a PEM or a payload in a log.
 */
export class ArtifactLoadError extends Error {
    reason;
    constructor(reason, message) {
        super(message);
        this.reason = reason;
    }
}
/** Bounded fetch: a runtime that waits on the host forever is down with it. */
const FETCH_TIMEOUT_MS = 10_000;
/** Refused bodies are still attacker-influenced; bound what is buffered. */
const MAX_ARTIFACT_BYTES = 256 * 1024;
async function readSourceBytes(source) {
    if ('file' in source) {
        let raw;
        try {
            raw = readFileSync(source.file, 'utf8');
        }
        catch (err) {
            throw new ArtifactLoadError('unreachable', `cannot read the policy artifact at ${source.file}: ${err.message}`);
        }
        if (raw.length > MAX_ARTIFACT_BYTES) {
            throw new ArtifactLoadError('oversize', `the policy artifact at ${source.file} exceeds the ${MAX_ARTIFACT_BYTES}-byte ceiling and was refused unread.`);
        }
        return raw;
    }
    let res;
    try {
        res = await fetch(source.url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    }
    catch (err) {
        throw new ArtifactLoadError('unreachable', `cannot reach the policy artifact at ${source.url}: ${err.message}`);
    }
    if (!res.ok) {
        throw new ArtifactLoadError('unreachable', `the policy artifact endpoint answered HTTP ${res.status} for ${source.url}.`);
    }
    const text = await res.text();
    if (text.length > MAX_ARTIFACT_BYTES) {
        throw new ArtifactLoadError('oversize', `the policy artifact at ${source.url} exceeds the ${MAX_ARTIFACT_BYTES}-byte ceiling and was refused unread.`);
    }
    return text;
}
function parseEnvelope(raw, where) {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (err) {
        throw new ArtifactLoadError('malformed', `the policy artifact from ${where} is not JSON: ${err.message}`);
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new ArtifactLoadError('malformed', `the policy artifact from ${where} is not an object.`);
    }
    return parsed;
}
/**
 * The version watermark beside the cache: `<cachePath>.version`, holding the
 * highest accepted artifact version as a bare integer.
 *
 * A sidecar rather than a field inside the cached envelope, because the cache
 * holds the exact signed bytes and anything added to them breaks the
 * signature. Missing or corrupt watermark means no ratchet yet (older build,
 * hand-placed cache): accept-then-record rather than refuse, or a corrupt
 * sidecar bricks offline startup — availability first, then the ratchet holds
 * from the next accept on. A local writer who can forge the sidecar already
 * owns the box; this stops the network, not the disk.
 */
function watermarkPath(cachePath) {
    return `${cachePath}.version`;
}
function readVersionWatermark(cachePath) {
    try {
        const raw = readFileSync(watermarkPath(cachePath), 'utf8').trim();
        if (/^[1-9][0-9]*$/.test(raw))
            return Number.parseInt(raw, 10);
    }
    catch {
        // Absent or unreadable: no watermark yet. Falls through to undefined.
    }
    return undefined;
}
function writeVersionWatermark(cachePath, version) {
    try {
        const path = watermarkPath(cachePath);
        writeFileSync(path, `${version}\n`, { mode: 0o600 });
        chmodSync(path, 0o600);
    }
    catch (err) {
        // Same posture as the cache itself: loud, not fatal. A missing watermark
        // weakens the freeze defense until the next accept, and the operator
        // should know the defense is down.
        process.stderr.write(`agent-port: could not write the artifact version watermark at ${watermarkPath(cachePath)}: ${err.message}. ` +
            `The cache holds the bytes but the version ratchet is not recorded.\n`);
    }
}
function writeCache(cachePath, bytes) {
    // Best effort, and best effort is stated rather than silent: a cache that
    // cannot be written is an offline outage waiting for its moment, and the
    // runtime currently enforcing a verified artifact is the place that knows.
    try {
        mkdirSync(dirname(cachePath), { recursive: true });
        writeFileSync(cachePath, bytes, { mode: 0o600 });
        // Unconditional, because `mode` only applies on create: a cache left by
        // an older build, an admin copy, or a restored backup keeps whatever
        // permissions it arrived with, and it holds the last-valid policy bytes
        // (SF-5). Same writeFile+chmod pairing main.ts uses for keys.
        chmodSync(cachePath, 0o600);
    }
    catch (err) {
        process.stderr.write(`agent-port: could not write the artifact cache at ${cachePath}: ${err.message}. ` +
            `Serving the verified artifact, but an outage now has nothing to fall back to.\n`);
    }
}
/**
 * Fetch (or read) a signed artifact, verify it locally, cache the last-valid
 * bytes, and fall back to the cache offline.
 *
 * The fresh bytes are verified first and the cache only answers when they
 * fail — never the other way round, because a cache consulted first is a
 * rollback the network cannot repair. The cached bytes are verified with the
 * same key and the same freshness policy before they are trusted.
 */
export async function loadVerifiedArtifact(source, opts) {
    const where = 'url' in source ? source.url : source.file;
    const verifyOpts = {
        ...(opts.expectedTenantId ? { expectedTenantId: opts.expectedTenantId } : {}),
        ...(opts.minVersionExclusive !== undefined ? { minVersionExclusive: opts.minVersionExclusive } : {}),
    };
    let freshFailure;
    try {
        const bytes = await readSourceBytes(source);
        const signed = parseEnvelope(bytes, where);
        const verdict = verifyArtifact(signed, opts.publicKeyPem, verifyOpts);
        if (!verdict.ok) {
            // The reason comes from the verifier's closed vocabulary, not from the
            // bytes: a hostile payload must not get to choose the log line.
            throw new ArtifactLoadError('unverified', `the policy artifact from ${where} was refused: ${verdict.reason}.`);
        }
        // Version ratchet (H3). A distributor serving an older-but-validly-signed
        // artifact passes verification — the signature is genuine — so without a
        // watermark the cache walks backwards and ceilings move back with it. The
        // sidecar records the highest version this runtime has accepted; anything
        // at or below it is refused as stale before the cache is touched, so a
        // freeze cannot overwrite newer bytes with older ones.
        if (opts.cachePath !== undefined) {
            const lastSeen = readVersionWatermark(opts.cachePath);
            if (lastSeen !== undefined && verdict.artifact.version <= lastSeen) {
                // Freeze, not failure — so this throws INTO the offline path below
                // rather than past it. The bytes are genuine but older than what this
                // runtime already accepted; the cache keeps the newer policy
                // enforced, which is strictly safer than refusing to start over a
                // freeze the cache already defeats. Loud, because a freeze that
                // serves silently is invisible until someone diffs versions by hand:
                // the operator must know the distributor is stuck.
                process.stderr.write(`agent-port: FREEZE: the policy artifact from ${where} is v${verdict.artifact.version}, ` +
                    `at or below the last-accepted v${lastSeen}. The distributor is serving stale signed bytes; ` +
                    `the v${lastSeen} cache stands if present, otherwise startup refuses.\n`);
                throw new ArtifactLoadError('stale_version', `the policy artifact from ${where} is v${verdict.artifact.version}, at or below the last-accepted v${lastSeen}. ` +
                    `A distributor serving older signed bytes is a freeze, not an update; the cache keeps v${lastSeen}.`);
            }
            writeCache(opts.cachePath, bytes);
            writeVersionWatermark(opts.cachePath, verdict.artifact.version);
        }
        return {
            artifact: verdict.artifact,
            version: verdict.artifact.version,
            tenantId: verdict.artifact.tenantId,
            fromCache: false,
        };
    }
    catch (err) {
        if (err instanceof ArtifactLoadError) {
            freshFailure = err;
        }
        else {
            freshFailure = new ArtifactLoadError('unreachable', `the policy artifact from ${where} could not be loaded: ${err.message}`);
        }
    }
    // Offline path: the cache answers only if it verifies under the same key
    // and the same freshness policy. A cache that fails either check is not a
    // fallback, it is a second refusal, and the error says both.
    if (opts.cachePath !== undefined && existsSync(opts.cachePath)) {
        try {
            const cached = readFileSync(opts.cachePath, 'utf8');
            const signed = parseEnvelope(cached, opts.cachePath);
            const verdict = verifyArtifact(signed, opts.publicKeyPem, verifyOpts);
            if (!verdict.ok) {
                throw new ArtifactLoadError('cached_unverified', `no valid policy artifact from ${where} (${freshFailure.reason}), and the cache at ${opts.cachePath} was refused: ${verdict.reason}. Refusing to start without a verified policy.`);
            }
            return {
                artifact: verdict.artifact,
                version: verdict.artifact.version,
                tenantId: verdict.artifact.tenantId,
                fromCache: true,
            };
        }
        catch (err) {
            if (err instanceof ArtifactLoadError)
                throw err;
            throw new ArtifactLoadError('cached_unreadable', `no valid policy artifact from ${where} (${freshFailure.reason}), and the cache at ${opts.cachePath} could not be read: ${err.message}. Refusing to start without a verified policy.`);
        }
    }
    throw new ArtifactLoadError(freshFailure.reason, `${freshFailure.message} There is no cached artifact to fall back to. Refusing to start without a verified policy.`);
}
/**
 * The `serve`/`approve` policy resolution: local config unless the config
 * names a signed artifact, in which case the verified artifact.
 *
 * Returns undefined when the config names no artifact — the runtime then
 * enforces the file, exactly as before, and nothing about this function asks
 * the network. Throws `ArtifactLoadError` on total failure (no valid artifact
 * AND no cache), which is the specific fatal the serve path reports.
 *
 * The locally engaged kill switch survives the merge in one direction only:
 * artifact policy wins on every field it carries, and a local
 * `emergencyKillSwitch: true` is re-asserted over it. The artifact type cannot
 * carry the switch, so this merge can only ever keep an engaged switch
 * engaged — but the merge is written explicitly rather than trusted to the
 * type, because types do not cross the network and a future field must not
 * silently gain the power to clear it.
 */
export async function loadArtifactPolicy(config) {
    const block = config.artifact;
    if (block === undefined)
        return undefined;
    let publicKeyPem;
    try {
        publicKeyPem = readFileSync(block.publicKeyFile, 'utf8');
    }
    catch (err) {
        throw new ArtifactLoadError('unreachable', `cannot read the merchant public key at ${block.publicKeyFile}: ${err.message}. ` +
            `There is no verified policy. Refusing to start without a verified policy.`);
    }
    const source = block.url !== undefined ? { url: block.url } : { file: block.file };
    const loaded = await loadVerifiedArtifact(source, {
        expectedTenantId: config.tenantId,
        publicKeyPem,
        ...(optsOf(block)),
        ...(block.cachePath !== undefined ? { cachePath: block.cachePath } : {}),
    });
    // One merge, called by every path that enforces an artifact — serve and
    // approve share it, because two merges is how the commit path once enforced
    // a different policy from the request path.
    let policy = loaded.artifact.policy;
    if (config.policy?.emergencyKillSwitch === true && policy.emergencyKillSwitch !== true) {
        policy = { ...policy, emergencyKillSwitch: true };
    }
    return { policy, version: loaded.version, tenantId: loaded.tenantId };
}
function optsOf(block) {
    return block.minVersionExclusive !== undefined ? { minVersionExclusive: block.minVersionExclusive } : {};
}
//# sourceMappingURL=artifact-load.js.map
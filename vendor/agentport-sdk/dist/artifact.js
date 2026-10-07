import { generateKeyPairSync, sign, verify } from 'node:crypto';
import { stableStringify } from './agent.js';
/** Issued once per tenant at provision. The private half leaves our hands. */
export function generateMerchantKeypair() {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    return {
        publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    };
}
/**
 * The bytes under signature: tenant-bound (no cross-tenant replay),
 * versioned (stale versions are rejectable), kill-switch-free by
 * construction — and verified again at verify time, because types do not
 * cross the network.
 */
export function canonicalArtifactBytes(artifact) {
    return stableStringify({
        tenantId: artifact.tenantId,
        version: artifact.version,
        policy: artifact.policy,
        capabilities: artifact.capabilities,
    });
}
export function signArtifact(artifact, privateKeyPem) {
    const bytes = canonicalArtifactBytes(artifact);
    // Ed25519 signs the message directly (PureEdDSA) — the digest parameter is
    // null, not a hash name. Passing one is ERR_CRYPTO_UNSUPPORTED_OPERATION,
    // which a test in test/artifact.test.ts pins by round-tripping.
    const signature = sign(null, Buffer.from(bytes, 'utf8'), privateKeyPem).toString('base64');
    return { signature, bytes };
}
/**
 * Verify a merchant-signed artifact. Pure: no I/O, no network, no clock —
 * the caller supplies the freshness policy, because "stale" is the
 * runtime's decision (offline cache keeps enforcing the last valid one).
 */
export function verifyArtifact(signed, publicKeyPem, opts = {}) {
    const a = signed.artifact;
    if (typeof a !== 'object' || a === null || Array.isArray(a)) {
        return { ok: false, reason: 'artifact must be an object' };
    }
    if (typeof a.tenantId !== 'string' || a.tenantId.length === 0) {
        return { ok: false, reason: 'artifact must name its tenant' };
    }
    if (!Number.isInteger(a.version) || a.version <= 0) {
        return { ok: false, reason: 'artifact version must be a positive integer' };
    }
    if (typeof a.policy !== 'object' || a.policy === null || Array.isArray(a.policy)) {
        return { ok: false, reason: 'artifact must carry a policy object' };
    }
    if (!Array.isArray(a.capabilities)) {
        return { ok: false, reason: 'artifact must carry a capabilities list' };
    }
    // 12.3.7 — excluded from the artifact TYPE, enforced again here because
    // types do not cross the network. A payload that can re-enable what a
    // human turned off is refused, not cleaned.
    if (Object.hasOwn(a.policy, 'emergencyKillSwitch')) {
        return { ok: false, reason: 'artifact carries the kill switch — refused' };
    }
    if (opts.expectedTenantId !== undefined && a.tenantId !== opts.expectedTenantId) {
        return { ok: false, reason: 'artifact is for another tenant' };
    }
    if (opts.minVersionExclusive !== undefined && a.version <= opts.minVersionExclusive) {
        return { ok: false, reason: 'artifact version is stale' };
    }
    if (typeof signed.signature !== 'string' || signed.signature.length === 0) {
        return { ok: false, reason: 'artifact carries no signature' };
    }
    const artifact = {
        tenantId: a.tenantId,
        version: a.version,
        policy: a.policy,
        capabilities: a.capabilities,
    };
    const bytes = canonicalArtifactBytes(artifact);
    let valid = false;
    try {
        valid = verify(null, Buffer.from(bytes, 'utf8'), publicKeyPem, Buffer.from(signed.signature, 'base64'));
    }
    catch {
        return { ok: false, reason: 'signature does not verify' };
    }
    if (!valid)
        return { ok: false, reason: 'signature does not verify' };
    return { ok: true, artifact };
}
//# sourceMappingURL=artifact.js.map
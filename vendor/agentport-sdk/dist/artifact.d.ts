/**
 * The config artifact channel (TASKS.md R1, UI TASKS.md 12.3).
 *
 * Backend publishes, runtime fetches, runtime verifies LOCALLY with the
 * merchant's PUBLIC key — never a shared secret, and never our HMAC. If the
 * key saying "the merchant authorised this" were ours, we could author a
 * no-ceiling rule the runtime would faithfully enforce, writing a valid
 * append-only row for a decision nobody authorised. Undetectable, every
 * column consistent. A public key cannot sign anything, which is the whole
 * reason this is merchant Ed25519 keypairs and not a shared secret.
 *
 * This module is the crypto primitive only: keypair issuance, canonical
 * bytes, sign, verify. It decides nothing about transport (B7), caching and
 * offline behaviour (R4/R6 live in the runtime load path), or the dashboard
 * publish flow — those consume this, and each has its own review.
 *
 * Canonical bytes reuse `stableStringify` from the enforcement core rather
 * than a second implementation, because two canonicalisers is how a config
 * verifies in one place and differs in another.
 */
export interface PolicyArtifact {
    tenantId: string;
    version: number;
    policy: Record<string, unknown>;
    capabilities: Array<{
        name: string;
    }>;
}
export interface MerchantKeypair {
    publicKeyPem: string;
    privateKeyPem: string;
}
export interface ArtifactSignature {
    /** base64 Ed25519 signature over the canonical artifact bytes. */
    signature: string;
    /** The exact bytes that were signed — the verifier recomputes, never trusts. */
    bytes: string;
}
/** Issued once per tenant at provision. The private half leaves our hands. */
export declare function generateMerchantKeypair(): MerchantKeypair;
/**
 * The bytes under signature: tenant-bound (no cross-tenant replay),
 * versioned (stale versions are rejectable), kill-switch-free by
 * construction — and verified again at verify time, because types do not
 * cross the network.
 */
export declare function canonicalArtifactBytes(artifact: PolicyArtifact): string;
export declare function signArtifact(artifact: PolicyArtifact, privateKeyPem: string): ArtifactSignature;
export type ArtifactVerifyOptions = {
    /** Reject artifacts for any other tenant — cross-tenant replay. */
    expectedTenantId?: string;
    /** Reject versions at or below the running one — rollback/stale. */
    minVersionExclusive?: number;
};
export type ArtifactVerifyResult = {
    ok: true;
    artifact: PolicyArtifact;
} | {
    ok: false;
    reason: string;
};
/**
 * Verify a merchant-signed artifact. Pure: no I/O, no network, no clock —
 * the caller supplies the freshness policy, because "stale" is the
 * runtime's decision (offline cache keeps enforcing the last valid one).
 */
export declare function verifyArtifact(signed: {
    artifact: unknown;
    signature: unknown;
}, publicKeyPem: string, opts?: ArtifactVerifyOptions): ArtifactVerifyResult;
//# sourceMappingURL=artifact.d.ts.map
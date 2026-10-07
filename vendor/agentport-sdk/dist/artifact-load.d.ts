import { type PolicyArtifact } from './artifact.js';
import type { AgentPortFile, AgentPortArtifactFile } from './config.js';
import type { Policy } from './types.js';
/**
 * The runtime load path for merchant-signed policy artifacts (R1/R3/R4, UI 12.3).
 *
 * This module lives behind `./node`, not the default entry: it reads files and
 * fetches over the network, and `test/architecture.test.ts` fails if the
 * default graph reaches a `node:` builtin. The fetch itself uses the platform
 * `fetch`, not an import, so the only Node surface here is the filesystem.
 *
 * Three properties, each load-bearing:
 *
 * 1. **Verification is local.** The bytes are checked here, against the
 *    merchant's PUBLIC key, with `verifyArtifact` from `artifact.ts`. The
 *    distribution endpoint is never consulted for "is this valid" — it only
 *    stores bytes. A runtime that asked the host whether to enforce would hand
 *    the host a veto over every request, which is the dependency invariant 9
 *    forbids.
 *
 * 2. **Offline keeps enforcing.** The last VALID artifact is cached to disk on
 *    every success, and a fetch or verification failure falls back to it. An
 *    unreachable host degrades to the previous policy, never to no policy and
 *    never to an unverified one. When there is no cache either, the load fails
 *    closed: `startAgent` refuses to start rather than serving under nothing.
 *
 * 3. **The kill switch is never in the artifact.** `PolicyArtifact` has no
 *    field for it and `verifyArtifact` refuses a payload that carries one, so
 *    there is nothing here to clear a locally engaged kill switch with — and
 *    `loadArtifactPolicy` re-asserts a locally engaged switch over the artifact
 *    policy anyway, because the absence of a field is not a control, the merge
 *    is. Do not add kill-switch handling here; the refusal is the handling.
 */
/** Where the signed bytes come from. Exactly one of the two. */
export type ArtifactSource = {
    url: string;
} | {
    file: string;
};
export interface LoadVerifiedArtifactOptions {
    /** Reject artifacts for any other tenant — cross-tenant replay. */
    expectedTenantId: string;
    /** The merchant's PUBLIC key. Verification needs nothing else. */
    publicKeyPem: string;
    /** Reject versions at or below the running one — rollback/stale. */
    minVersionExclusive?: number;
    /** Last-valid bytes land here on success and are read from here offline. */
    cachePath?: string;
}
export interface LoadedArtifact {
    artifact: PolicyArtifact;
    version: number;
    tenantId: string;
    /** True when the network/file source failed and the cache answered. */
    fromCache: boolean;
}
/**
 * Fail-closed, with specific reasons. The message names the source and the
 * verification reason, never key material and never the raw bytes: a PEM or a
 * payload in an error string is a PEM or a payload in a log.
 */
export declare class ArtifactLoadError extends Error {
    readonly reason: string;
    constructor(reason: string, message: string);
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
export declare function loadVerifiedArtifact(source: ArtifactSource, opts: LoadVerifiedArtifactOptions): Promise<LoadedArtifact>;
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
export declare function loadArtifactPolicy(config: Pick<AgentPortFile, 'tenantId' | 'policy'> & {
    artifact?: AgentPortArtifactFile;
}): Promise<{
    policy: Policy;
    version: number;
    tenantId: string;
} | undefined>;
//# sourceMappingURL=artifact-load.d.ts.map
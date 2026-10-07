import type { Capability, Manifest, Policy } from './types.js';
/**
 * Builds the /.well-known/agent.json document (DISCOVER).
 *
 * The manifest is generated from what is actually registered and configured,
 * never hand-maintained, so it cannot drift from the enforcement path. An agent
 * reads this to learn what exists, what it needs to authenticate with, and
 * which actions will be held for a human.
 */
export declare function buildManifest(options: {
    business: string;
    baseUrl: string;
    capabilities: Map<string, Capability>;
    policy: Policy;
    now: Date;
}): Manifest;
//# sourceMappingURL=manifest.d.ts.map
// Everything in this SDK that needs a Node.js runtime.
//
// This entry point exists so the default entry (`@agentport/sdk`) can be
// imported in a runtime with no `node:` builtins at all. The split is not
// cosmetic: `test/architecture.test.ts` walks the real module graph from
// `index.ts` and fails if it reaches `node:http`, `node:sqlite` or `node:fs`.
// A claim about portability that no test enforces is a claim a merchant finds
// out about themselves.
//
// The Node surface is named here rather than deleted. Every function below
// still works exactly as it did when it was exported from the root; only the
// import path moved.
export { startAgent } from './server.js';
export { openSqlite, installSqliteSchema } from './sqlite.js';
export { loadConfig } from './config-file.js';
export { canonicalArtifactBytes, generateMerchantKeypair, signArtifact, verifyArtifact, } from './artifact.js';
// The runtime load path: fetch-or-file, local verification against the
// merchant key, last-valid cache, offline fallback. Behind `./node` because it
// reads files — `test/architecture.test.ts` fails if the default entry reaches
// `node:fs`, and this module does.
export { loadVerifiedArtifact, loadArtifactPolicy, ArtifactLoadError } from './artifact-load.js';
//# sourceMappingURL=node.js.map
import { type AgentPortFile } from './config.js';
/**
 * Reading the merchant's config file. The only `node:fs` in the SDK.
 *
 * Split out of `config.ts` so the validation and policy-shaped types can be
 * reached in an environment with no filesystem at all: `process` and `node:fs`
 * are Node globals, and a module that mentions either is a module that cannot
 * load where Node is not present. This file is the seam — everything above it is
 * pure, this is the one place the file is touched.
 */
export declare function loadConfig(path: string): AgentPortFile;
//# sourceMappingURL=config-file.d.ts.map
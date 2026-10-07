import { readFileSync, existsSync } from 'node:fs';
import { parseConfig, ConfigError } from './config.js';
/**
 * Reading the merchant's config file. The only `node:fs` in the SDK.
 *
 * Split out of `config.ts` so the validation and policy-shaped types can be
 * reached in an environment with no filesystem at all: `process` and `node:fs`
 * are Node globals, and a module that mentions either is a module that cannot
 * load where Node is not present. This file is the seam — everything above it is
 * pure, this is the one place the file is touched.
 */
export function loadConfig(path) {
    if (!existsSync(path)) {
        throw new ConfigError([
            `No config at ${path}. Run \`agent-port init\` to write one, or pass --config.`,
        ]);
    }
    let raw;
    try {
        raw = JSON.parse(readFileSync(path, 'utf8'));
    }
    catch (err) {
        throw new ConfigError([`${path} is not valid JSON: ${err.message}`]);
    }
    return parseConfig(raw);
}
//# sourceMappingURL=config-file.js.map
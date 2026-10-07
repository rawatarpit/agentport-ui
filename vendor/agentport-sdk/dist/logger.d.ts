/**
 * The stderr logger the shipped CLI and server construct.
 *
 * `AgentPort` accepts a `Logger` and falls back to `noopLogger`. That fallback is
 * right for a library — an embedder should not have its process stderr written to
 * without asking — and it was wrong for the two entry points a merchant actually
 * installs. Neither `main.ts` nor `server.ts` passed a logger, so `ledger_append_failed`
 * fired into a sink that discards everything. The log line carrying
 * `approvalGranted: true` and `approvedBy` is the only record that a write
 * executed with no row describing it, and in the shipped binary it did not exist.
 *
 * This exists to close that. It is deliberately not clever: one line per event,
 * JSON for the metadata, stderr, no buffering and no async I/O — a logger that can
 * fail to write is not a logger, and one that queues is a logger that can be made
 * to grow without bound.
 */
import type { Logger } from './types.js';
export interface StderrLoggerOptions {
    /** `warn` is the default: these lines are the ones an operator must see. */
    level?: 'debug' | 'warn';
    /** Overridable sink. Defaults to the process stderr stream. */
    write?: (line: string) => void;
    /** Overridable so tests and operators see a real timestamp in tests. */
    now?: () => Date;
}
export declare function createStderrLogger(options?: StderrLoggerOptions): Logger;
//# sourceMappingURL=logger.d.ts.map
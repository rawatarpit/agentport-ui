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
/** Metadata beyond this is dropped; a log line that lists 400 keys is unreadable. */
const MAX_KEYS = 32;
/** A single value beyond this is clipped, with the original length kept. */
const MAX_VALUE_CHARS = 200;
/** Array elements beyond this are dropped and counted. */
const MAX_ARRAY = 10;
/**
 * The whole line. The clip markers count toward it, and the final line is
 * truncated regardless, because an operator-supplied field can be arbitrarily
 * large and a 10MB log line is an outage of its own.
 */
const MAX_LINE_CHARS = 8_192;
/**
 * Control characters, DEL, the C1 range, and the two Unicode line terminators.
 *
 * The line terminators matter specifically because `JSON.stringify` emits U+2028
 * and U+2029 raw: they are legal in a JSON string and they terminate a line in
 * several log viewers. C0 alone would leave a value able to forge the next log
 * entry, which is the reason this is a shared control rather than one applied
 * only to `approvalBy`.
 */
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g;
/** Escape rather than strip, so the operator can see what was in the value. */
function sanitiseString(value) {
    const clipped = value.length > MAX_VALUE_CHARS
        ? `${value.slice(0, MAX_VALUE_CHARS)}[+${value.length - MAX_VALUE_CHARS} chars]`
        : value;
    return clipped.replace(CONTROL_CHARS, (c) => `\\u${(c.codePointAt(0) ?? 0).toString(16).padStart(4, '0')}`);
}
/**
 * Bounded, control-free rendering of arbitrary metadata.
 *
 * Recursion is cut at a depth a metadata bag does not need, because a caller
 * passing a response body would otherwise turn one log line into a serialisation
 * failure — and a logger that throws is a logger that takes down the request it
 * was trying to describe.
 */
function sanitiseValue(value, depth) {
    if (typeof value === 'string')
        return sanitiseString(value);
    if (typeof value === 'number')
        return Number.isFinite(value) ? value : String(value);
    if (typeof value === 'boolean' || value === null || value === undefined)
        return value;
    if (depth <= 0)
        return '[depth]';
    if (Array.isArray(value)) {
        const kept = value.slice(0, MAX_ARRAY).map((v) => sanitiseValue(v, depth - 1));
        if (value.length > MAX_ARRAY)
            kept.push(`[+${value.length - MAX_ARRAY} items]`);
        return kept;
    }
    if (typeof value === 'object') {
        const all = Object.entries(value);
        const entries = all.slice(0, MAX_KEYS);
        const out = {};
        for (const [k, v] of entries)
            out[sanitiseString(k)] = sanitiseValue(v, depth - 1);
        // The array case above counts what it drops and the depth case names itself.
        // The key cap did not, and that is the one that bites: a failure log whose
        // metadata quietly stops at 32 fields is indistinguishable from one that had 32.
        // The dropped fields are usually the interesting ones — they are past the first
        // 32 keys of whatever the caller passed.
        if (all.length > MAX_KEYS)
            out['[dropped]'] = `${all.length - MAX_KEYS} keys`;
        return out;
    }
    // A function, symbol, or bigint. Stringifying these is where `JSON.stringify`
    // throws on a cycle's cousin — an undefined-safe fallback is the whole point.
    return `[${typeof value}]`;
}
/**
 * Resolves the process stderr without importing `node:process`.
 *
 * `test/architecture.test.ts` fails the build if the default module graph reaches
 * a `node:` builtin, and that rule has never been relaxed for convenience. The
 * global is the only way to write here, which is also why this throws rather than
 * degrading: a caller who asked for stderr logging and has no stderr has a
 * misconfiguration, and the codebase's existing answer to a misconfiguration at
 * startup is `UnenforceableConfigError` — fail loudly before serving, not silently
 * after.
 */
function resolveSink(override) {
    if (override)
        return override;
    const stream = globalThis.process?.stderr;
    if (stream && typeof stream.write === 'function') {
        return (line) => {
            ;
            stream.write(`${line}\n`);
        };
    }
    throw new Error('createStderrLogger: no writable stderr. This build runs in a shape without ' +
        'process.stderr, which means it is not the CLI or the server — pass an ' +
        'explicit `write` so failures stay observable.');
}
export function createStderrLogger(options = {}) {
    const write = resolveSink(options.write);
    const level = options.level ?? 'warn';
    const now = options.now ?? (() => new Date());
    const emit = (severity, message, meta) => {
        if (severity === 'debug' && level !== 'debug')
            return;
        let payload = '';
        if (meta) {
            try {
                payload = ` ${JSON.stringify(sanitiseValue(meta, 3))}`;
            }
            catch {
                // A logger that throws takes down the request it was describing. The
                // event name and severity are the part that must survive.
                payload = ' {"meta":"[unserialisable]"}';
            }
        }
        const line = `agentport ${severity} ${sanitiseString(message)}${payload}`;
        const out = line.length > MAX_LINE_CHARS ? `${line.slice(0, MAX_LINE_CHARS)}[+truncated]` : line;
        try {
            write(out);
        }
        catch {
            // The write itself, not just the serialisation. `record()` calls this after a
            // failed append and outside its own try/catch, so a sink that throws turns
            // "the append failed and was logged" into "the append failed and the agent
            // got an exception" — the same missing row, now with the diagnostic thrown
            // away too. There is nowhere better for this to go, and a logger that takes
            // down the request it was describing is worse than one that loses a line.
        }
    };
    return {
        debug: (message, meta) => emit('debug', message, meta),
        warn: (message, meta) => emit('warn', message, meta),
    };
}
//# sourceMappingURL=logger.js.map
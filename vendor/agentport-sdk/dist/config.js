import { validateInput } from './validate.js';
import { figureKeyVocabulary, isPolicyFigureKey } from './policy.js';
export class ConfigError extends Error {
    problems;
    constructor(problems) {
        super(`agent-port config is not usable:\n  - ${problems.join('\n  - ')}`);
        this.problems = problems;
    }
}
const CAP_NAME = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;
const ACCESS = ['read', 'write'];
const DATA_CLASSES = ['public', 'internal', 'pii', 'payment'];
/**
 * Checks a parsed config and returns the typed shape, or throws with every
 * problem listed at once. A merchant fixing a file one error per run is a
 * merchant who gives up on the fourth.
 */
export function parseConfig(raw) {
    const problems = [];
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        throw new ConfigError(['The file must contain a JSON object.']);
    }
    const cfg = raw;
    for (const key of ['business', 'tenantId', 'baseUrl']) {
        const value = cfg[key];
        if (typeof value !== 'string' || value.trim() === '') {
            problems.push(`\`${key}\` is required and must be a non-empty string.`);
        }
    }
    if (typeof cfg.baseUrl === 'string' && cfg.baseUrl.trim() !== '') {
        try {
            const parsed = new URL(cfg.baseUrl);
            if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
                problems.push('`baseUrl` must be https. The manifest is published as a public identity.');
            }
        }
        catch {
            problems.push('`baseUrl` is not a valid URL.');
        }
    }
    if (cfg.tenantId !== undefined && typeof cfg.tenantId === 'string') {
        if (cfg.tenantId !== cfg.tenantId.trim() || cfg.tenantId === '') {
            problems.push('`tenantId` must be non-empty with no surrounding whitespace. An empty tenant is a shared tenant.');
        }
    }
    if (cfg.database !== undefined) {
        const db = cfg.database;
        if (db.driver !== 'sqlite') {
            problems.push('`database.driver` must be `sqlite`. It is the only driver that ships without a dependency.');
        }
        if (typeof db.path !== 'string' || db.path.trim() === '') {
            problems.push('`database.path` is required — the ledger has to live somewhere on this machine.');
        }
        if (db.password !== undefined) {
            // The one thing that must never be in this file: a config is synced,
            // shared, and pasted into support threads, and the password is the
            // thing that must not travel. Rejecting it here is louder than
            // documenting it, because the failure mode is a database compromise.
            problems.push('`database.password` must not be in the config file. The binary reads AGENTPORT_DB_PASSWORD from the environment.');
        }
    }
    const names = new Set();
    if (cfg.capabilities !== undefined) {
        if (!Array.isArray(cfg.capabilities)) {
            problems.push('`capabilities` must be a list.');
        }
        else {
            cfg.capabilities.forEach((raw2, i) => {
                const where = `capabilities[${i}]`;
                if (typeof raw2 !== 'object' || raw2 === null) {
                    problems.push(`${where} must be an object.`);
                    return;
                }
                const c = raw2;
                const name = c.name;
                if (typeof name !== 'string' || !CAP_NAME.test(name)) {
                    problems.push(`${where}.name must match ${CAP_NAME}.`);
                }
                else if (names.has(name)) {
                    // Silently dropping a duplicate would register the first and quietly
                    // run the wrong handler, so a collision is refused the way `expose()`
                    // refuses one.
                    problems.push(`${where}.name "${name}" is already used by an earlier capability.`);
                }
                else {
                    names.add(name);
                }
                if (typeof c.description !== 'string' || c.description.trim() === '') {
                    // Not cosmetic. An agent reads this to decide whether to call the
                    // capability at all, so an empty one is a capability nobody finds.
                    problems.push(`${where}.description is required. An agent reads it to decide whether to call this.`);
                }
                if (typeof c.access !== 'string' || !ACCESS.includes(c.access)) {
                    problems.push(`${where}.access must be "read" or "write".`);
                }
                if (c.dataClass !== undefined && !DATA_CLASSES.includes(c.dataClass)) {
                    problems.push(`${where}.dataClass must be one of ${DATA_CLASSES.join(', ')}.`);
                }
                if (c.access === 'write' && c.dataClass === undefined) {
                    // The one pairing that is always a mistake: a write with no declared
                    // data class cannot be redacted against, cannot be restricted by
                    // policy, and cannot be reasoned about by a reviewer.
                    problems.push(`${where} is a write with no \`dataClass\`. A write must declare what kind of data it touches.`);
                }
                if (c.access === 'write' && c.dataClass === 'payment' && c.requiresApproval !== true) {
                    problems.push(`${where} is a payment write without \`requiresApproval: true\`. Every capability that moves money must be able to queue a human.`);
                }
                // A write with no source at all gets a stub handler that returns a
                // value, so the agent receives 200 and the ledger records
                // `result: 'ok'` for a payment that never moved. PROVE attests to an
                // effect that did not occur, which is the one thing this table exists to
                // make impossible. A read is allowed to be a documentation-only entry.
                //
                // `source.kind: 'http'` satisfies this. It was written before the http
                // source existed and so refused every write that called the merchant's
                // API — which is the write a merchant most wants, and the refusal named
                // `query`, sending the reader after a field the config does not use.
                const hasSource = c.query !== undefined || c.source?.kind === 'http';
                if (c.access === 'write' && !hasSource) {
                    problems.push(`${where} is a write with neither a \`query\` nor an http \`source\`. It would answer ok and be ` +
                        'recorded as a successful write without doing anything.');
                }
                if (c.input !== undefined && (typeof c.input !== 'object' || c.input === null || Array.isArray(c.input))) {
                    problems.push(`${where}.input must be a schema object mapping field names to a type.`);
                }
                if (c.query !== undefined) {
                    if (typeof c.query !== 'string' || c.query.trim() === '') {
                        problems.push(`${where}.query must be a non-empty string.`);
                    }
                    else if (c.query.includes('?') || c.query.includes('$1')) {
                        // Positional placeholders cannot be bound by name, and a query
                        // that mixes them is how a value gets concatenated instead.
                        problems.push(`${where}.query uses a positional placeholder. Use \`:name\` and declare it in \`bindings\` so every value is bound.`);
                    }
                }
                if (c.bindings !== undefined && (typeof c.bindings !== 'object' || c.bindings === null || Array.isArray(c.bindings))) {
                    problems.push(`${where}.bindings must map a placeholder name to a dotted path in the payload.`);
                }
                // The declared figure and the query that produces it are two fields, so
                // they can disagree. Every way they can disagree is a figure the engine
                // will not measure, or one the file does not account for — and the file
                // is the only place a config-file merchant can see the difference.
                if (c.source !== undefined) {
                    const src = c.source;
                    if (src.kind !== 'http') {
                        problems.push(`${where}.source.kind must be "http"; it is the only source that exists.`);
                    }
                    else {
                        if (typeof src.url !== 'string' || src.url.trim() === '') {
                            problems.push(`${where}.source.url is required and must be a URL or a path. The destination is ` +
                                `declared here because the caller is not allowed to name one.`);
                        }
                        else if (src.url.startsWith('/')) {
                            if (src.url.startsWith('//')) {
                                problems.push(`${where}.source.url starts with "//", which is a host rather than a path. ` +
                                    `Use a single leading slash.`);
                            }
                        }
                        else if (/[\u0000-\u0020\u007f\\]/.test(src.url)) {
                            problems.push(`${where}.source.url contains a character that cannot appear in a URL.`);
                        }
                        if (src.method !== undefined && !['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(src.method)) {
                            problems.push(`${where}.source.method must be one of GET, POST, PUT, PATCH, DELETE.`);
                        }
                        if (src.query !== undefined && (!Array.isArray(src.query) || src.query.some((q) => typeof q !== 'string' || q === ''))) {
                            problems.push(`${where}.source.query must be a list of payload key names to put in the query string.`);
                        }
                        if (src.headers !== undefined) {
                            if (typeof src.headers !== 'object' || src.headers === null || Array.isArray(src.headers)) {
                                problems.push(`${where}.source.headers must be an object of header name to value.`);
                            }
                            else {
                                for (const [name, value] of Object.entries(src.headers)) {
                                    if (typeof value !== 'string') {
                                        problems.push(`${where}.source.headers.${name} must be a string; header values cannot come from the payload.`);
                                    }
                                    else if (/[\r\n]/.test(name) || /[\r\n]/.test(value)) {
                                        problems.push(`${where}.source.headers.${name} contains a line break.`);
                                    }
                                }
                            }
                        }
                        for (const [field, limit] of [['maxResponseBytes', 1], ['timeoutMs', 1]]) {
                            const value = src[field];
                            if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < limit)) {
                                problems.push(`${where}.source.${field} must be a number of at least ${limit}.`);
                            }
                        }
                        // Duplicated from `buildHttpCapability` on purpose. `parseConfig` is
                        // what `doctor` and `init` run, so a merchant sees the reason before
                        // they ever start a server; the builder refuses again because code
                        // can call `expose()` without a config file at all.
                        if (c.policyInput !== undefined) {
                            problems.push(`${where} declares policyInput, which an http source cannot use. The figure that will be ` +
                                `charged is the one in the request body, so a declared constant would be what the ceiling ` +
                                `measures while the real value goes on the wire.`);
                        }
                        if (c.policyInputQueries !== undefined) {
                            problems.push(`${where} declares policyInputQueries, which an http source cannot use: there is no ` +
                                `database read that makes a declared figure authoritative over the body being sent.`);
                        }
                    }
                }
                if (c.policyInputFor !== undefined) {
                    // Previously a type escape in `doctor` read this field off a
                    // `CapabilityFile` that cannot have it, on a config that came from
                    // JSON and therefore cannot have had one either. It was always
                    // `undefined`; saying so out loud is the same information with a
                    // compiler check behind it.
                    problems.push(`${where}.policyInputFor cannot be set in a config file: JSON cannot hold a function. Declare ` +
                        '`policyInputKeys` with the `policyInputQueries` that produces each figure, or expose this ' +
                        'capability in code with `AgentPort.expose()`.');
                }
                const declaredKeys = [];
                if (c.policyInputKeys !== undefined) {
                    if (!Array.isArray(c.policyInputKeys) ||
                        c.policyInputKeys.length === 0 ||
                        c.policyInputKeys.some((k) => typeof k !== 'string' || k.trim() === '')) {
                        problems.push(`${where}.policyInputKeys must be a non-empty list of key names.`);
                    }
                    else {
                        declaredKeys.push(...c.policyInputKeys);
                        if (new Set(declaredKeys).size !== declaredKeys.length) {
                            problems.push(`${where}.policyInputKeys names the same key twice.`);
                        }
                    }
                }
                const producedKeys = [];
                if (c.policyInputQueries !== undefined) {
                    if (typeof c.policyInputQueries !== 'object' || c.policyInputQueries === null || Array.isArray(c.policyInputQueries)) {
                        problems.push(`${where}.policyInputQueries must map a key to a \`{ query, bindings }\` object.`);
                    }
                    else {
                        for (const [key, spec] of Object.entries(c.policyInputQueries)) {
                            producedKeys.push(key);
                            const where2 = `${where}.policyInputQueries.${key}`;
                            if (typeof spec !== 'object' || spec === null || Array.isArray(spec)) {
                                problems.push(`${where2} must be a \`{ query, bindings }\` object.`);
                                continue;
                            }
                            const s = spec;
                            if (typeof s.query !== 'string' || s.query.trim() === '') {
                                problems.push(`${where2}.query is required.`);
                            }
                            else if (s.query.includes('?') || s.query.includes('$1')) {
                                problems.push(`${where2}.query uses a positional placeholder. Use \`:name\` with a binding, for the same ` +
                                    'reason the capability query does.');
                            }
                            if (s.bindings !== undefined && (typeof s.bindings !== 'object' || s.bindings === null || Array.isArray(s.bindings))) {
                                problems.push(`${where2}.bindings must map a placeholder name to a dotted path in the payload.`);
                            }
                        }
                    }
                }
                if (declaredKeys.length > 0 || producedKeys.length > 0) {
                    const unproduced = declaredKeys.filter((k) => !producedKeys.includes(k));
                    const undeclared = producedKeys.filter((k) => !declaredKeys.includes(k));
                    if (unproduced.length > 0) {
                        problems.push(`${where} declares policyInputKeys [${unproduced.join(', ')}] with no policyInputQueries entry ` +
                            'producing them. A declared figure nothing reads is a ceiling with nothing to measure.');
                    }
                    if (undeclared.length > 0) {
                        problems.push(`${where} has policyInputQueries for [${undeclared.join(', ')}], which policyInputKeys does not ` +
                            'declare. The policy engine measures whatever these return.');
                    }
                }
            });
        }
    }
    if (cfg.policy !== undefined) {
        if (typeof cfg.policy !== 'object' || cfg.policy === null || Array.isArray(cfg.policy)) {
            problems.push('`policy` must be an object.');
        }
        else {
            const p = cfg.policy;
            for (const key of ['maxOrderValue', 'absoluteMaxOrderValue']) {
                const v = p[key];
                if (v === undefined)
                    continue;
                if (v === null || typeof v !== 'object' || Array.isArray(v)) {
                    // `"maxOrderValue": null` used to reach `v.minor` and throw a TypeError
                    // out of the parser, so the operator saw `agent-port: ` and a blank
                    // line instead of the field that was wrong.
                    problems.push(`\`policy.${key}\` must be an object with \`minor\` and \`currency\`.`);
                    continue;
                }
                if (typeof v.minor !== 'number' || !Number.isFinite(v.minor) || v.minor <= 0) {
                    problems.push(`\`policy.${key}.minor\` must be a positive whole number in the currency's minor unit ` +
                        `(paise for INR, cents for USD). A field called \`amount\` is not accepted: it cannot be ` +
                        `distinguished from the payload's minor-unit value, and the two are commonly 100x apart.`);
                }
                else if (!Number.isSafeInteger(v.minor)) {
                    // `Number.isInteger` accepts 1e308, a ceiling no order can exceed --
                    // a control that is set, reads as set, and never fires.
                    problems.push(`\`policy.${key}.minor\` must be a whole number of minor units small enough to compare against (Number.isSafeInteger).`);
                }
                if (typeof v.currency !== 'string' || v.currency.length !== 3) {
                    problems.push(`\`policy.${key}.currency\` must be a three-letter code.`);
                }
                // A hard ceiling below the soft one makes the soft one unreachable,
                // which reads to a merchant as "approval is configured" when it can
                // never fire.
                if (key === 'maxOrderValue') {
                    const hard = p.absoluteMaxOrderValue;
                    if (hard && typeof hard.minor === 'number' && typeof v.minor === 'number' && v.minor > hard.minor) {
                        problems.push('`policy.maxOrderValue` is above `absoluteMaxOrderValue`, so approval can never be reached.');
                    }
                }
            }
            if (p.emergencyKillSwitch !== undefined && typeof p.emergencyKillSwitch !== 'boolean') {
                problems.push('`policy.emergencyKillSwitch` must be true or false.');
            }
            // These two were never validated, which made a control that is absent
            // look like one that is set: `{ requestsPerMinute: null }` fell back to
            // the default, `0` locked a capability out entirely, and a string
            // `requestsPerMinute: "10"` never matched and never fired.
            if (p.rateLimit !== undefined) {
                const rl = p.rateLimit;
                if (rl === null || typeof rl !== 'object' || Array.isArray(rl)) {
                    problems.push('`policy.rateLimit` must be an object with `requestsPerMinute`.');
                }
                else {
                    if (!Number.isSafeInteger(rl.requestsPerMinute) || rl.requestsPerMinute < 1) {
                        problems.push('`policy.rateLimit.requestsPerMinute` must be a whole number of at least 1. A missing ' +
                            'or malformed value is a rate limit that is not there.');
                    }
                    if (rl.scope !== undefined && rl.scope !== 'agent' && rl.scope !== 'capability') {
                        problems.push('`policy.rateLimit.scope` must be `agent` or `capability`.');
                    }
                }
            }
            if (p.bulkOrderThreshold !== undefined) {
                const bt = p.bulkOrderThreshold;
                if (bt === null || typeof bt !== 'object' || Array.isArray(bt)) {
                    problems.push('`policy.bulkOrderThreshold` must be an object with `units`.');
                }
                else if (!Number.isSafeInteger(bt.units) || bt.units < 1) {
                    problems.push('`policy.bulkOrderThreshold.units` must be a whole number of at least 1.');
                }
            }
        }
    }
    // The signed-artifact source. Validated as a source, not as a policy: the
    // policy inside the artifact is verified by signature at startup, not by
    // shape here — shape-checking bytes the merchant signed would second-guess
    // the authority this block exists to name.
    if (cfg.artifact !== undefined) {
        const a = cfg.artifact;
        if (a === null || typeof a !== 'object' || Array.isArray(a)) {
            problems.push('`artifact` must be an object naming where the signed policy comes from.');
        }
        else {
            // Exactly one source. A config naming both would leave the runtime to
            // choose, and a choice between two authorities is a control that answers
            // differently depending on who asks first.
            const hasUrl = typeof a.url === 'string' && a.url !== '';
            const hasFile = typeof a.file === 'string' && a.file !== '';
            if (hasUrl === hasFile) {
                problems.push('`artifact` needs exactly one of `url` or `file` — the distribution endpoint, or a local signed envelope.');
            }
            if (a.url !== undefined && (typeof a.url !== 'string' || a.url === '')) {
                problems.push('`artifact.url` must be a non-empty URL string.');
            }
            if (a.file !== undefined && (typeof a.file !== 'string' || a.file === '')) {
                problems.push('`artifact.file` must be a non-empty path string.');
            }
            if (typeof a.publicKeyFile !== 'string' || a.publicKeyFile === '') {
                problems.push('`artifact.publicKeyFile` is required — the merchant PUBLIC key the artifact is verified against.');
            }
            if (a.cachePath !== undefined && (typeof a.cachePath !== 'string' || a.cachePath === '')) {
                problems.push('`artifact.cachePath` must be a non-empty path string.');
            }
            if (a.minVersionExclusive !== undefined &&
                (!Number.isSafeInteger(a.minVersionExclusive) || a.minVersionExclusive < 0)) {
                problems.push('`artifact.minVersionExclusive` must be a whole number of at least 0.');
            }
        }
    }
    if (problems.length > 0)
        throw new ConfigError(problems);
    return cfg;
}
export function doctor(config, env) {
    const notes = [];
    const errors = [];
    const names = new Set((config.capabilities ?? []).map((c) => c.name));
    if (!config.database) {
        notes.push('No `database` block: the agent will not start, and nothing will be recorded.');
    }
    // Only for a driver that authenticates. The bundled `sqlite` ledger is
    // protected by the file mode on the database, and `serve` does not read a
    // password for it — this note used to fire for every merchant and told them
    // the binary would refuse to start when it would not. A `doctor` note that
    // reports a failure that does not happen trains a merchant to ignore `doctor`,
    // which is the one tool that tells them the truth about their own config.
    if (config.database && config.database.driver !== 'sqlite' && !env.AGENTPORT_DB_PASSWORD) {
        notes.push(`AGENTPORT_DB_PASSWORD is not set. The ${config.database.driver} driver authenticates, so the binary will refuse to start.`);
    }
    const p = config.policy ?? {};
    const always = p.alwaysRequireApproval ?? [];
    for (const name of always) {
        if (!names.has(name)) {
            errors.push(`policy.alwaysRequireApproval names "${name}", which is not a registered capability. An approval rule that cannot match anything is not a rule.`);
        }
    }
    for (const name of p.forbiddenCapabilities ?? []) {
        if (!names.has(name)) {
            errors.push(`policy.forbiddenCapabilities names "${name}", which is not a registered capability. A forbidden list entry that cannot match is not a control.`);
        }
    }
    // The third name list, and the one most worth checking: a typo here does not
    // add a rule, it *removes* one. `ceilingExempt` is the only way a write says
    // "this is not an order", so `createorder` instead of `createOrder` leaves the
    // write governed by a ceiling it cannot measure, and every request to it is
    // denied. The engine fails closed, so the symptom appears — but as a denial
    // on a request rather than as a config fault, which is the harder report to
    // act on.
    for (const name of p.ceilingExempt ?? []) {
        if (!names.has(name)) {
            errors.push(`policy.ceilingExempt names "${name}", which is not a registered capability. A misspelled exemption ` +
                'does not exempt anything: the write stays governed by the order ceiling.');
        }
    }
    // A declared figure no rule can read. `buildCapabilities` refuses to build it
    // whatever the policy says, so this is an error rather than a note: a report
    // that disagrees with the code that refuses to start is a report telling the
    // merchant to fix something that is already fixed, and a note here is what the
    // old message was — `discountPct` named as an example of a key that "produces
    // no measurement, and the engine then denies". It did not deny. It measured
    // `amountMinor: 0` from the caller's payload, and the row said
    // `rule: 'default'`.
    for (const c of config.capabilities ?? []) {
        const unreadable = (c.policyInputKeys ?? []).filter((k) => !isPolicyFigureKey(k));
        if (unreadable.length > 0) {
            errors.push(`"${c.name}" declares policyInputKeys [${unreadable.join(', ')}], which the policy engine has no rule to ` +
                `read. A declared figure that measures nothing is a ceiling measuring the caller's payload. Declare ` +
                `${figureKeyVocabulary()}. \`buildCapabilities\` refuses to build this capability, and the engine denies ` +
                'the write with `amount_unmeasurable`.');
        }
    }
    // A hard ceiling nothing can reach is not an error, but a merchant who set a
    // soft ceiling is entitled to know it can never fire.
    if (p.maxOrderValue && p.absoluteMaxOrderValue) {
        if (p.maxOrderValue.minor > p.absoluteMaxOrderValue.minor) {
            errors.push('maxOrderValue is above absoluteMaxOrderValue: no request can ever be held for approval, so the approval queue stays empty.');
        }
    }
    // A money ceiling is only a ceiling if something the caller does not control
    // is measured. The amount in the request payload *is* caller-controlled, so a
    // capability whose only amount source is a payload key has a decorative
    // ceiling: the rule fires on the number the caller chose to send, and a
    // caller who wants a charge to pass sends a small one. Measured: a 500,000
    // charge under a 100,000 `absoluteMaxOrderValue`, no error.
    //
    // The gate below is the same one the engine uses, word for word:
    // `access === 'write' && !ceilingExempt.includes(name) && a ceiling is
    // configured`. `doctor` used to gate on `dataClass === 'payment'`, which the
    // engine deliberately does not — that label is chosen by the merchant and
    // nothing verifies it against the query, so a gate on it is escapable by
    // relabelling, and a control that disagrees with the engine is a control that
    // advises the merchant to configure something that is not enforced. It used
    // to ignore `ceilingExempt` too, so a write the merchant had explicitly said
    // was not an order was reported as an unprotected payment write.
    //
    // And it used to accept a declared `policyInputKeys` as an authoritative
    // source, which was a report that the SDK read a field it never read.
    const hasCeiling = Boolean(p.maxOrderValue || p.absoluteMaxOrderValue);
    const exempt = new Set(p.ceilingExempt ?? []);
    for (const c of config.capabilities ?? []) {
        if (!hasCeiling || c.access !== 'write' || exempt.has(c.name))
            continue;
        // Declared *and* produced. The declaration alone is not the control: the
        // query is. Checking both here means `doctor` and `buildCapabilities` agree
        // about which capabilities have a real figure, including on a hand-built
        // config that never went through `parseConfig`.
        const produced = new Set(Object.keys(c.policyInputQueries ?? {}));
        const unproduced = (c.policyInputKeys ?? []).filter((k) => !produced.has(k));
        if (unproduced.length > 0) {
            errors.push(`"${c.name}" declares policyInputKeys [${unproduced.join(', ')}] and no policyInputQueries entry ` +
                'produces them, so the ceiling has no figure to measure. `buildCapabilities` refuses to start on ' +
                'this, and the engine denies every write with rule `amount_unmeasurable`.');
            continue;
        }
        if (produced.size > 0)
            continue;
        // An http source is the exception, and the reason is not that it is safer —
        // it is that the caller's figure IS the figure charged. The engine reads
        // `amountMinor` out of the payload, and the payload is serialised verbatim
        // into the request body, so there is no gap between what the ceiling
        // measured and what the wire carries. That is exactly the mismatch this
        // control warns about for SQL, and it cannot arise here.
        //
        // Before this exception, `doctor` told an http merchant to add
        // `policyInputKeys` + `policyInputQueries` — which `parseConfig` refuses on
        // an http source. Two checks in the same binary, each correct alone,
        // together leaving a merchant with instructions that cannot be followed.
        if (c.source?.kind === 'http')
            continue;
        if (c.policyInput !== undefined) {
            errors.push(`"${c.name}" has an order ceiling configured and its only declared figure is the static ` +
                '`policyInput`, which is the same on every request. A ceiling measured against a constant cannot ' +
                'fail, so it reports a clean start and never refuses anything. Read the figure per request with ' +
                '`policyInputKeys` + `policyInputQueries`, or list this write in `policy.ceilingExempt` if it is ' +
                'not an order.');
            continue;
        }
        errors.push(`"${c.name}" is a write with an order ceiling configured and no authoritative figure behind it. The ` +
            'only amount the policy engine can see is one the caller sent in the payload, so either the write is ' +
            'refused outright (rule `amount_unmeasurable`, when the caller sends no amount at all) or the ceiling ' +
            'measures the caller\'s claim and a small `amountMinor` passes a limit the handler then exceeds. ' +
            'Declare the figure your own data holds with `policyInputKeys` + `policyInputQueries`, or add ' +
            `"${c.name}" to \`policy.ceilingExempt\` if this write is not an order.`);
    }
    if (config.capabilities?.some((c) => c.policyInputKeys !== undefined)) {
        notes.push('A capability declares `policyInputKeys`. `buildCapabilities` turns each declared key into a read of ' +
            'your own database and refuses to start if a key has no query, if that query is not a read, if the ' +
            'driver cannot read synchronously, or if the key is not one the policy engine can read. Whatever the ' +
            'query returns is authoritative: it suppresses the payload aliases for every measurement, including ' +
            'the ones the declaration does not name, so a payload `amountMinor` cannot decide a ceiling a declared ' +
            'figure is already measuring. It must therefore be the figure the handler will actually charge — not a ' +
            're-read of the request, and not a constant. When the resolver ' +
            'cannot produce one, the engine denies the write with `amount_unmeasurable` rather than falling back to ' +
            'the number the caller sent.');
    }
    return { errors, notes };
}
export { validateInput };
/**
 * Separates the notes that mean a control is missing from the ones that are
 * merely informative.
 *
 * The distinction is the whole point. `doctor` printing "the ceiling will not
 * fire" and then starting anyway is worse than not printing it, because a
 * merchant who reads the output and sees the server come up concludes the
 * ceiling is fine. These are the ones that must stop a start.
 */
export function doctorErrors(config, env) {
    try {
        parseConfig(config);
    }
    catch (err) {
        return err instanceof ConfigError ? err.problems : [String(err)];
    }
    return doctor(config, env).errors;
}
/**
 * Thrown by `startAgent` before the listener binds, carrying the reasons this
 * configuration cannot be served as written.
 *
 * Two classes reach here and they are not the same thing, so the message does not
 * claim they are: `parseConfig` shape problems (a mistyped `description`) and
 * `doctor`'s unenforceable-control findings. Invariant 2 asks for specificity
 * from a refusal, and telling an operator who fat-fingered a config that their
 * *control* cannot enforce is the kind of confident wrong answer that costs an
 * afternoon. Each entry still names its own specific fault in `problems`.
 *
 * Exported so `main.ts` can print the problems and exit with its own wording,
 * instead of the library throwing a bare `Error` that reads like a crash.
 */
export class UnenforceableConfigError extends Error {
    problems;
    constructor(problems) {
        super(`refusing to serve: this configuration cannot be served as written.\n${problems
            .map((p) => `  - ${p}`)
            .join('\n')}`);
        this.problems = problems;
        this.name = 'UnenforceableConfigError';
    }
}
//# sourceMappingURL=config.js.map
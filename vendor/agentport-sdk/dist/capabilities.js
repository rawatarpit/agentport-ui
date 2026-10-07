import { bindParameters } from './validate.js';
import { figureKeyVocabulary, isPolicyFigureKey } from './policy.js';
import { executeHttp, resolveFrozenTarget, slotsIn } from './http.js';
/**
 * Where a validated payload becomes a database operation.
 *
 * The security property is structural. The merchant's SQL is trusted because
 * the merchant wrote it. The values filling it are untrusted because an agent
 * sent them. The two are kept apart by the driver binding every placeholder
 * through a parameter and there being no code path that builds a statement
 * string — so there is no statement to inject into, and no length or escaping
 * argument to get wrong.
 *
 * That is why `config.ts` rejects positional placeholders: `WHERE id = ?` can
 * only be filled by positional binding or by concatenation, and concatenation
 * is the thing this design exists to make impossible.
 */
/** Names every `:placeholder` the merchant's query actually uses. */
export function placeholders(query) {
    const found = new Set();
    // `:name`, with two things excluded first: quoted literals, so a status of
    // `'pending:review'` is not read as a parameter, and a second colon, so the
    // Postgres cast in `total::int` is not read as a parameter named `int`.
    //
    // Both are startup errors, not silent bugs — `buildCapabilities` refuses a
    // query with a placeholder it has no binding for — but a merchant writing a
    // perfectly ordinary query should not be told it is malformed.
    // Blanked rather than removed, so offsets — and therefore the match index —
    // still line up with the original if anything ever wants to report one.
    const scannable = query
        .replace(/'(?:[^']|'')*'/g, "''")
        .replace(/"(?:[^"]|"")*"/g, '""')
        .replace(/--[^\n]*/g, (m) => ' '.repeat(m.length));
    for (const match of scannable.matchAll(/(?<![:\w]):([A-Za-z_][A-Za-z0-9_]*)/g)) {
        found.add(match[1]);
    }
    return found;
}
/** `node:sqlite`, so the shipped binary needs no database dependency. */
/**
 * Decides whether a statement returns rows, which is the only thing that tells
 * us whether to read or to write.
 *
 * The naive version matched `WITH` anywhere before a `SELECT`, which also
 * matches `WITH n(a) AS (SELECT 1) INSERT INTO orders ...` — a write that
 * `node:sqlite` executes perfectly happily through `.all()` and that then
 * reports `changes: 0`. So a statement is read only if its *last* top-level
 * keyword is a reading one. A `WITH` that ends in an `INSERT` is a write.
 */
function returnsRows(query) {
    // Strip comments so a leading `-- note` cannot hide the verb.
    const sql = query
        .replace(/--[^\n]*/g, ' ')
        .replace(/\/\*[^]*?\*\//g, ' ')
        .replace(/'(?:[^']|'')*'/g, "''")
        .replace(/"(?:[^"]|"")*"/g, '""')
        .trim();
    if (/^\s*(?:SELECT|PRAGMA|EXPLAIN)\b/i.test(sql))
        return true;
    if (!/^\s*WITH\b/i.test(sql))
        return false;
    // Walk the statement once, tracking parenthesis depth, and take the verb that
    // appears last at depth zero. Depth is what separates `WITH n(a) AS (SELECT
    // 1) INSERT` — the `SELECT` is inside, the `INSERT` is not — from a genuine
    // `WITH ... SELECT`.
    let depth = 0;
    let lastVerb = '';
    for (const match of sql.matchAll(/\b(SELECT|INSERT|UPDATE|DELETE|REPLACE|VALUES)\b|[()]/g)) {
        if (match[0] === '(') {
            depth += 1;
            continue;
        }
        if (match[0] === ')') {
            depth -= 1;
            continue;
        }
        if (depth <= 0)
            lastVerb = (match[1] ?? '').toUpperCase();
    }
    return lastVerb === 'SELECT' || lastVerb === 'VALUES';
}
export function sqliteDriver(db) {
    // One body, two wrappers. `node:sqlite` is synchronous underneath — the async
    // `run` exists so the same interface can be satisfied by a network database,
    // which is exactly why `runSync` is available here and not there.
    const statement = (query, params) => {
        const bound = params ?? {};
        // `node:sqlite` accepts an object for named parameters, which is the
        // binding path. No statement is ever assembled from `params`.
        // `as never` on the handle: `sqliteDriver` accepts the structural subset
        // of `node:sqlite` it uses, and the SDK's own types are the ones that
        // would drag the builtin into every consumer's type graph.
        const handle = db;
        const prepared = handle.prepare(query);
        if (returnsRows(query)) {
            return { rows: prepared.all(bound), changes: 0 };
        }
        // `changes` is how a merchant answers "did the write land?", and it was
        // wrong in both directions: `.all()` on an INSERT returns no rows, so a
        // successful order reported 0 changes, while a SELECT reported one
        // "change" per row it happened to return. A number that is wrong about
        // the thing it exists to answer is worse than no number.
        const result = prepared.run(bound);
        return { rows: [], changes: Number(result.changes) };
    };
    return {
        run: async (query, params) => statement(query, params),
        runSync: statement,
    };
}
/**
 * Turns a capability's declared `policyInputKeys` into the per-request
 * authoritative figures the policy engine reads. Returns undefined when the
 * capability declares none, which is the ordinary case and leaves the engine
 * reading the payload exactly as before.
 *
 * This is the whole of the config-file answer to "where does the number come
 * from", and it is deliberately the *only* one. `BuildOptions` used to carry a
 * `policyInputFor` that nothing read, so a merchant who wired one in code got a
 * field that looked like a control and was not — and the field is gone rather
 * than reimplemented, because a static record is the same on every request and a
 * ceiling measured against a constant cannot fail. The figure has to be read
 * from the merchant's own data per request, and the merchant's own data is the
 * only thing in a config-file deployment that holds it.
 *
 * Every failure here is a startup failure. A declared key that resolves to
 * nothing would otherwise leave the engine measuring nothing, and the engine
 * answers that with `amount_unmeasurable` on every single write — fail-closed,
 * and useless: a merchant cannot ship a ceiling at all. Better to refuse to
 * build and say which declaration is not real.
 */
function policyInputResolver(file, driver) {
    const declared = file.policyInputKeys;
    if (declared === undefined)
        return undefined;
    const listed = (Array.isArray(declared) ? declared : []).filter((k) => typeof k === 'string' && k.trim() !== '');
    // The degenerate cases are refused rather than tolerated. An empty
    // declaration suppresses nothing, so the payload aliases stay live and the
    // ceiling goes back to measuring the caller's number while the file still
    // reads as though it declared a figure.
    if (listed.length === 0 || listed.length !== declared.length) {
        throw new Error(`Capability "${file.name}" has a policyInputKeys that is not a list of key names. ` +
            `An empty or malformed declaration resolves no figure, which leaves the ceiling measuring the caller's payload.`);
    }
    if (new Set(listed).size !== listed.length) {
        throw new Error(`Capability "${file.name}" declares the same policyInputKey twice. One key cannot be resolved from two queries.`);
    }
    // A declared figure the policy engine has no rule to read. This is the check
    // that makes the fail-closed merge defensible rather than merely quiet:
    // without it, a merchant naming their own column — `grandTotal`, say, or
    // `discountPct` — declared something the engine cannot measure, the caller's
    // `amountMinor` survived the merge, and a 500,000 order passed a 100,000
    // ceiling with the row reading `rule: 'default'`. The engine now refuses that
    // request per-call (`amount_unmeasurable`), which is right and 3am; refusing
    // to build is what the merchant can act on, and the name of the offending key
    // is in the message because the merchant chose it.
    //
    // Every alias the rules consult is a valid declaration, and that is the whole
    // vocabulary: the key is not a field name to be invented, it is the name one of
    // the policy rules reads.
    for (const key of listed) {
        if (!isPolicyFigureKey(key)) {
            throw new Error(`Capability "${file.name}" declares policyInputKeys ["${key}"], and the policy engine reads no such ` +
                `figure. Declare ${figureKeyVocabulary()}. A key the rules do not read measures nothing, and whatever ` +
                'the caller sends in the payload is measured instead.');
        }
    }
    const sources = file.policyInputQueries ?? {};
    for (const key of Object.keys(sources)) {
        if (!listed.includes(key)) {
            // The mirror image of a missing query, and the same defect: a figure the
            // engine will read and the declaration does not account for. The engine
            // would measure it while the merchant's file says they declared something
            // else, which is the declaration lying rather than the figure.
            throw new Error(`Capability "${file.name}" has a policyInputQueries entry for "${key}", which is not in ` +
                `policyInputKeys. Either declare it or remove the query: the engine measures whatever this returns.`);
        }
    }
    // The declaration is checked before the environment, so a merchant with a
    // broken query and a network driver is told what is wrong with the query. The
    // reverse order reports the same config differently depending on the driver,
    // which is the property that makes a build error hard to act on.
    const specs = listed.map((key) => {
        const spec = sources[key];
        if (spec === undefined) {
            throw new Error(`Capability "${file.name}" declares policyInputKeys ["${key}"] but no policyInputQueries entry ` +
                `produces it. A declared figure nothing resolves leaves the ceiling with nothing to measure.`);
        }
        const query = spec.query;
        if (typeof query !== 'string' || query.trim() === '') {
            throw new Error(`Capability "${file.name}" has an empty policyInputQueries.${key}.query.`);
        }
        if (!returnsRows(query)) {
            // Structural, and the reason is the path this runs on: the figure is
            // resolved during authorisation, so a resolver that wrote would be a side
            // effect of *deciding* whether the request may happen. Nothing in the
            // request asked for it, and the ledger row that would describe it does
            // not exist.
            throw new Error(`Capability "${file.name}" has a policyInputQueries.${key} that does not return rows. ` +
                `It runs while the request is being authorised, before anything is permitted, so it may only read.`);
        }
        // The same two checks the handler query gets, for the same two reasons: an
        // unbound placeholder is a parameter left unset, and a binding the query
        // never uses is a value the merchant believes is being looked up.
        const used = placeholders(query);
        const bound = new Set(Object.keys(spec.bindings ?? {}));
        for (const name of used) {
            if (!bound.has(name)) {
                throw new Error(`Capability "${file.name}" has :${name} in policyInputQueries.${key} but no binding for it.`);
            }
        }
        for (const name of bound) {
            if (!used.has(name)) {
                throw new Error(`Capability "${file.name}" binds ${name} for policyInputQueries.${key}, which its query never uses.`);
            }
        }
        return { key, query, used, bindings: spec.bindings ?? {} };
    });
    const runSync = driver.runSync;
    if (runSync === undefined) {
        // Refused rather than degraded. The alternative — build the capability and
        // measure nothing — is the exact shape of the bug this replaces: a declared
        // figure that is never read, which the engine then compensates for by
        // denying every write.
        throw new Error(`Capability "${file.name}" declares policyInputKeys, but this driver has no synchronous read ` +
            `(\`runSync\`). Policy is decided before the handler runs and \`policyInputFor\` is synchronous, ` +
            `so a figure that needs an await cannot be read in time. Use a driver with \`runSync\`, or expose ` +
            `this capability in code with \`AgentPort.expose()\`.`);
    }
    const read = ({ key, query, used, bindings }, input) => {
        const params = bindParameters(bindings, input);
        // A payload that does not carry what the query needs leaves the figure
        // unmeasurable, which is the same answer as a query that matched no row.
        // Both are the caller's problem to notice, and neither may reach the
        // ceiling as a number.
        for (const name of used)
            if (!(name in params))
                return undefined;
        try {
            const { rows } = runSync(query, params);
            const row = rows[0];
            if (row === undefined || typeof row !== 'object' || row === null)
                return undefined;
            // First column of the first row, which is why the query has to select
            // exactly one. A number is a figure; `NULL` from an aggregate over no
            // rows, a TEXT column, and a missing row are all unmeasurable, and
            // unmeasurable denies.
            const value = Object.values(row)[0];
            return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
        }
        catch {
            // Swallowed on purpose, and it is the *inner* of two guards rather than
            // the only one. This one turns a query that cannot run into "no figure",
            // which the engine answers with `amount_unmeasurable` and a row saying the
            // ceiling could not be checked. The outer one is `policyAssessment` in
            // `agent.ts`, which catches a throw that escapes the resolver itself and
            // answers it with `policy_input_unavailable`. They are separate because
            // they answer separate questions — a query that failed, and a wiring that
            // is down — and neither may carry the driver's own message out, which is
            // also the message most likely to hold a connection string.
            return undefined;
        }
    };
    return (input) => {
        const out = {};
        for (const spec of specs)
            out[spec.key] = read(spec, input);
        return out;
    };
}
/**
 * Turns config entries into `Capability` objects the port can expose.
 *
 * Two checks run here that the config parser cannot do, because they need the
 * whole set: a query must not reference a placeholder nobody binds (which
 * would leave a parameter unset rather than fail loudly), and a placeholder
 * that IS bound must exist in the query (which would otherwise be a silent
 * no-op in the merchant's favour — a field they think is being saved).
 */
export function buildCapabilities(files, options) {
    const out = [];
    for (const file of files) {
        // Before `policyInputResolver`, deliberately: for an HTTP source the whole
        // policy-input machinery is refused rather than resolved. There is no
        // database read that could make a declared figure authoritative over the
        // body about to be sent, so accepting one would only mean measuring the
        // ceiling against a constant while the real number went on the wire.
        if (file.source?.kind === 'http') {
            out.push(buildHttpCapability(file, options));
            continue;
        }
        // Built before the query branch so a documentation entry can declare a
        // figure too, and refused on the same terms. A capability is not exempt
        // from having a real number because it also has a query.
        const policyInputFor = policyInputResolver(file, options.driver);
        if (!file.query) {
            // A capability with no query is a documentation entry, which is
            // legitimate — a merchant may describe something they answer by hand.
            out.push({
                name: file.name,
                description: file.description,
                access: file.access,
                dataClass: file.dataClass,
                requiresApproval: file.requiresApproval,
                input: file.input,
                policyInput: file.policyInput,
                policyInputFor,
                execute: () => ({ status: 'not_implemented', capability: file.name }),
            });
            continue;
        }
        // Captured into a local: the narrowing of `file.query` does not survive
        // into the closure, and a `?.` here would quietly run `undefined` as SQL.
        const query = file.query;
        const used = placeholders(query);
        const bound = new Set(Object.keys(file.bindings ?? {}));
        for (const name of used) {
            if (!bound.has(name)) {
                throw new Error(`Capability "${file.name}" has :${name} in its query but no binding for it. ` +
                    `An unbound placeholder would be left unset rather than refused.`);
            }
        }
        for (const name of bound) {
            if (!used.has(name)) {
                throw new Error(`Capability "${file.name}" binds ${name}, which its query never uses. ` +
                    `That value will be dropped, and the merchant will believe it was saved.`);
            }
        }
        out.push({
            name: file.name,
            description: file.description,
            access: file.access,
            dataClass: file.dataClass,
            requiresApproval: file.requiresApproval,
            input: file.input,
            policyInput: file.policyInput,
            // Present only when the file declared the keys, and identical on the
            // authorisation and commit paths because both of them go through
            // `assemblePolicyInput` in `agent.ts`. There is no second merge here, and
            // there must never be one: a held request that was measured against the
            // merchant's figure and then re-measured against the caller's decoy on
            // approval is the bug that note is about.
            policyInputFor,
            execute: async (input) => {
                // Reads only what the binding map names. An unbound key has no route
                // to a placeholder, so a payload carrying `'; DROP TABLE orders; --`
                // is not a statement, it is a value the query never asks for.
                const params = bindParameters(file.bindings ?? {}, input);
                for (const name of used) {
                    if (!(name in params)) {
                        throw new Error(`Capability "${file.name}" needed :${name} and the payload did not carry it.`);
                    }
                }
                const { rows, changes } = await options.driver.run(query, params);
                return { rows, changes };
            },
        });
    }
    return out;
}
/**
 * Build a capability that calls the merchant's API.
 *
 * The refusals are the substance here. Each one closes a configuration that
 * looks reasonable, starts cleanly, and then charges or exposes the wrong thing
 * on a request nobody has made yet.
 */
function buildHttpCapability(file, options) {
    const source = file.source;
    if (!source || source.kind !== 'http')
        throw new Error('unreachable');
    if (file.query) {
        throw new Error(`Capability "${file.name}" declares both a query and an http source. ` +
            `Only one source can run; the other would be silently ignored.`);
    }
    // The load-bearing refusal. See the note on `CapabilityFile.source`: for SQL
    // the authoritative figure comes from the merchant's database, but for an
    // http call the figure charged is the one in the body we send. A static
    // policyInput would be measured against a constant and the real number would
    // still be transmitted.
    if (file.policyInput) {
        throw new Error(`Capability "${file.name}" declares policyInput, which an http source cannot use. ` +
            `The figure that will be charged is the one in the request body, and a declared ` +
            `constant would be what the ceiling measures while the real value goes on the wire.`);
    }
    if (file.policyInputQueries) {
        throw new Error(`Capability "${file.name}" declares policyInputQueries, which an http source cannot use. ` +
            `There is no database read that makes a declared figure authoritative over the body.`);
    }
    if (!options.baseUrl) {
        throw new Error(`Capability "${file.name}" is an http source but no baseUrl was provided.`);
    }
    const bindings = file.bindings ?? {};
    // Throws here rather than on a request: a URL that could name another host is
    // a configuration defect, and the cost of finding it is one business call.
    const frozen = resolveFrozenTarget(options.baseUrl, source.url);
    // A slot with no binding is refused at startup for the same reason. Left to
    // the request it is a literal `{id}` on the wire, and a 404 from a path the
    // merchant never described reads as a bug in their API.
    for (const name of slotsIn(source.url)) {
        if (!(name in bindings)) {
            throw new Error(`Capability "${file.name}" has {${name}} in source.url but no binding for it. ` +
                `Declare \`bindings: { ${name}: '<field>' }\` or the slot will be sent literally.`);
        }
    }
    for (const name of Object.keys(bindings)) {
        if (!slotsIn(source.url).includes(name)) {
            throw new Error(`Capability "${file.name}" binds ${name}, which source.url does not reference. ` +
                `That value will be dropped, and the merchant will believe it was sent.`);
        }
    }
    const method = source.method ?? (source.json === false ? 'GET' : 'POST');
    if (file.method && file.method !== method) {
        throw new Error(`Capability "${file.name}" declares method ${file.method} but source.method is ${method}.`);
    }
    if (file.access === 'write' && (method === 'GET' || method === 'DELETE')) {
        // Not refused outright — a merchant may genuinely cancel a booking with a
        // DELETE — but a write declared as a read is the kind of thing that makes
        // the access field stop meaning anything, and the access field is what the
        // ceiling scoping keys on.
        if (source.json === false && (source.query ?? []).length > 0) {
            throw new Error(`Capability "${file.name}" is a write but sends no body and only query parameters. ` +
                `Confirm the method, or the write will carry no figure for a ceiling to measure.`);
        }
    }
    return {
        name: file.name,
        description: file.description,
        access: file.access,
        dataClass: file.dataClass,
        requiresApproval: file.requiresApproval,
        input: file.input,
        // No `policyInput` and no `policyInputFor`: the policy engine reads the
        // caller's payload, which for this source is byte-for-byte the request body.
        // What the ceiling measures is what goes on the wire — which is the property
        // the SQL source has to work to arrange, and this one gets by construction.
        execute: async (input) => {
            const { data, upstreamStatus } = await executeHttp(file.name, source, input, bindings, {
                baseUrl: options.baseUrl,
                fetchImpl: options.fetchImpl,
            });
            // Surface the status for a caller that has to branch on it. The response
            // body goes back to the agent; the ledger records the outcome, not the
            // payload, and redaction never sees this.
            return { data, status: upstreamStatus, url: `${frozen.origin}${frozen.pathname}` };
        },
    };
}
//# sourceMappingURL=capabilities.js.map
/**
 * The union view — reconciling every pass into one list, and reporting where
 * they disagree.
 *
 * ## Why this exists
 *
 * Discovery produces several files and each is incomplete in a different way.
 * A route dump sees every registered route but cannot tell you which ones the
 * frontend uses, or what fields they carry. A contract sees fields but only for
 * endpoints someone documented. A capture sees what actually happened but only
 * the code paths a human happened to exercise.
 *
 * Presented as three separate files, that is three documents the merchant has to
 * reconcile by hand, and hand reconciliation is exactly where a mistake becomes
 * a capability nobody knew an agent could reach. So the passes are merged here
 * into one list, and the merge is reported three ways:
 *
 * - **corroborated** — a route or contract, and a live request. Two independent
 *   sources agreeing is the strongest evidence available here.
 * - **declared, never used** — exists in the framework or the contract, no
 *   request was seen. Might be an admin-only route, an abandoned endpoint, or
 *   simply unexercised. Notably it might be perfectly live, because capture only
 *   sees traffic someone generated.
 * - **used, never declared** — a live request to a path no route dump and no
 *   contract named. The one that matters most: this is an endpoint that exists,
 *   is reachable, and is not in anything a reviewer would read.
 *
 * ## Why `ANY` is reconciled rather than kept literal
 *
 * Next.js emits `ANY` for a route handler exporting no method this reader
 * recognises. Keyed on `method + path` verbatim, `ANY /orders/{id}` and a
 * captured `GET /orders/{id}` become two rows, and every such handler is
 * reported as never used — a false accusation derived from a parsing gap, which
 * is worse than a gap that admits it is one.
 *
 * So a declaration of `ANY` matches any observed method on that path, and the
 * row keeps the observed method with the declared provenance attached. That
 * biases the reconciliation toward reporting corroboration rather than a
 * confident falsehood. Where it is still ambiguous the row carries
 * `declaredAny: true`, so a reader can see the match was generous rather than
 * exact.
 */
const DECLARATIONS = new Set([
    'routes:next',
    'routes:rails',
    'routes:laravel',
    'spec:openapi',
]);
/** Sort provenance so the strongest evidence leads and output is byte-stable. */
function ordered(provenance) {
    const rank = (p) => {
        if (p.startsWith('spec:'))
            return 0;
        if (p.startsWith('routes:'))
            return 1;
        return 2;
    };
    return [...provenance].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}
/**
 * Union fields by name, preferring the declared type.
 *
 * A runtime capture knows a field was sent but not what it was, and records
 * `type: ''`. A contract knows the type. Merging naively would let whichever
 * source sorted last overwrite a real type with an empty one, so a non-empty
 * type always wins.
 */
function unionFields(groups) {
    const byName = new Map();
    for (const group of groups) {
        for (const field of group) {
            const existing = byName.get(field.name);
            if (existing === undefined) {
                byName.set(field.name, { ...field });
            }
            else if (existing.type === '' && field.type !== '') {
                byName.set(field.name, { ...field });
            }
        }
    }
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}
/**
 * Fold every input into one report.
 *
 * Pure, and imports no `node:` builtin, so it stays inside the module graph
 * `test/architecture.test.ts` walks.
 */
export function unionInventories(inputs) {
    const endpoints = [];
    const skipped = [];
    const warnings = [];
    for (const input of inputs) {
        for (const entry of input.snapshot.skipped)
            skipped.push({ file: input.file, entry });
        for (const entry of input.snapshot.warnings)
            warnings.push({ file: input.file, entry });
    }
    // Declared and observed are reconciled rather than concatenated, because the
    // reconciliation is the output. Grouping by path first is what lets a single
    // observed method be matched against several declarations.
    const declaredByPath = new Map();
    const observedByPath = new Map();
    for (const input of inputs) {
        for (const endpoint of input.snapshot.endpoints) {
            const observed = endpoint.provenance.some((p) => !DECLARATIONS.has(p));
            const bucket = observed ? observedByPath : declaredByPath;
            const list = bucket.get(endpoint.path);
            if (list === undefined)
                bucket.set(endpoint.path, [endpoint]);
            else
                list.push(endpoint);
        }
    }
    const paths = new Set([...declaredByPath.keys(), ...observedByPath.keys()]);
    for (const path of [...paths].sort()) {
        const declared = declaredByPath.get(path) ?? [];
        const observed = observedByPath.get(path) ?? [];
        const anyDeclaration = declared.find((d) => d.method === 'ANY');
        for (const call of observed) {
            // Every declaration of this method, not just the first. Taking one and
            // discarding the rest loses provenance that was genuinely gathered — two
            // route dumps naming one path would render as one, which is the merge
            // silently discarding evidence it was asked to reconcile.
            // An observed path that is entirely placeholders, like `/{id}/{id}`, is
            // what a path seen once looks like. Checked before matching so it can be
            // reconciled against an identical declared route — `/{id}/{id}` from a
            // real dynamic path does correspond to a declared `/orders/{id}`.
            const placeholdersOnly = call.path
                .split('/')
                .filter((s) => s !== '')
                .every((s) => s === '{id}');
            const matches = declared.filter((d) => d.method === call.method);
            const anyDeclaration = declared.find((d) => d.method === 'ANY');
            const match = matches.length > 0 ? matches[0] : anyDeclaration;
            const provenance = new Set(call.provenance);
            const parameters = [call.parameters];
            const request = [call.request];
            const response = [call.response];
            for (const m of matches) {
                for (const p of m.provenance)
                    provenance.add(p);
                // Declared fields lead, so a declared type beats a runtime `''`.
                parameters.unshift(m.parameters);
                request.unshift(m.request);
                response.unshift(m.response);
            }
            if (anyDeclaration !== undefined && match !== undefined) {
                for (const p of anyDeclaration.provenance)
                    provenance.add(p);
                parameters.unshift(anyDeclaration.parameters);
                request.unshift(anyDeclaration.request);
                response.unshift(anyDeclaration.response);
            }
            endpoints.push({
                method: call.method,
                path,
                provenance: ordered(provenance),
                parameters: unionFields(parameters),
                request: unionFields(request),
                response: unionFields(response),
                calls: call.calls ?? 0,
                // Set only when the match was generous, so it cannot be mistaken for an
                // exact method agreement.
                ...(match !== undefined && match.method !== call.method ? { declaredAny: true } : {}),
                // Unresolved only when nothing declared it. A declared `/orders/{id}`
                // matching an observed `/{id}/{id}` is real corroboration, not a gap.
                ...(match === undefined && placeholdersOnly ? { unresolved: true } : {}),
            });
        }
        // Declarations no observed method matched, merged with each other first. Two
        // route dumps describing one route are one row with two provenances, not two
        // rows — and a duplicated route reads as two endpoints an agent could reach.
        const unclaimed = new Map();
        for (const d of declared) {
            const claimed = observed.some((o) => o.method === d.method || d.method === 'ANY');
            if (claimed)
                continue;
            const list = unclaimed.get(d.method);
            if (list === undefined)
                unclaimed.set(d.method, [d]);
            else
                list.push(d);
        }
        for (const [method, group] of unclaimed) {
            const provenance = new Set();
            for (const d of group)
                for (const p of d.provenance)
                    provenance.add(p);
            endpoints.push({
                method,
                path,
                provenance: ordered(provenance),
                parameters: unionFields(group.map((d) => d.parameters)),
                request: unionFields(group.map((d) => d.request)),
                response: unionFields(group.map((d) => d.response)),
                calls: 0,
            });
        }
    }
    const corroborated = [];
    const declaredNotUsed = [];
    const usedNotDeclared = [];
    const unresolved = [];
    for (const endpoint of endpoints) {
        if (endpoint.calls === 0) {
            declaredNotUsed.push(endpoint);
            continue;
        }
        const declared = endpoint.provenance.some((p) => DECLARATIONS.has(p));
        if (endpoint.unresolved === true)
            unresolved.push(endpoint);
        else if (declared)
            corroborated.push(endpoint);
        else
            usedNotDeclared.push(endpoint);
    }
    const byMethodThenPath = (a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method);
    for (const list of [endpoints, corroborated, declaredNotUsed, usedNotDeclared, unresolved]) {
        list.sort(byMethodThenPath);
    }
    return {
        version: 1,
        endpoints,
        corroborated,
        declaredNotUsed,
        usedNotDeclared,
        unresolved,
        skipped,
        warnings,
    };
}
/** One line per row, for a human reading a terminal. */
export function formatReport(report) {
    const lines = [];
    const row = (e) => `  ${e.method.padEnd(7)} ${e.path.padEnd(38)} ${String(e.calls).padStart(5)}  ${e.provenance.join(', ')}${e.declaredAny === true ? '  (matched on ANY)' : ''}`;
    const section = (title, rows, note) => {
        lines.push(`${title} (${rows.length})`);
        if (rows.length === 0)
            lines.push('  none');
        else
            for (const e of rows)
                lines.push(row(e));
        lines.push(`  ${note}`, '');
    };
    section('CORROBORATED — named and used', report.corroborated, 'a route or contract and a live request agree');
    section('USED, NEVER DECLARED — live requests nothing named', report.usedNotDeclared, 'check these first: reachable, and in nothing a reviewer would read');
    section('UNRESOLVED — seen, but the path could not be read', report.unresolved, 'a path seen once is indistinguishable from a value in it; check the route dump for these');
    section('DECLARED, NEVER USED — named, no request seen', report.declaredNotUsed, 'may be admin-only or abandoned; capture only sees traffic someone generated');
    return lines.join('\n');
}
//# sourceMappingURL=inventory.js.map
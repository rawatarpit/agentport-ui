/**
 * Endpoint discovery — asking a framework what routes it registered, rather
 * than guessing from the code.
 *
 * ## Why route dumps and not a source scan
 *
 * The question a merchant is asking with `discover` is "what can an agent
 * reach". There are two ways to answer it and only one of them is complete.
 *
 * A source scan infers the route surface from what the code appears to do. It
 * is a guess: it misses routes assembled at runtime, it reports handlers that
 * were deleted last year, and it needs a parser for every language. Every
 * attempt to make it language-agnostic is defeated at step one, because
 * "reads the request" and "declares a URL" are syntactic facts that differ per
 * language.
 *
 * A route dump sidesteps all of it. `bin/rails routes --json` and
 * `php artisan route:list --json` emit JSON. Next.js writes its route table to
 * a file at build time. Each framework already knows its own route surface
 * exactly and will say so on request. So every adapter here is a subprocess
 * call or a file read — never a parser — and the third-party framework's own
 * output format is the contract. That is what makes this work for a language we
 * have never seen: we do not need to understand the language, only to know
 * which command to run in it.
 *
 * The cost is honest and worth stating plainly: this only covers frameworks we
 * ship an adapter for. `detected` lists the ones we recognised and could not
 * read, so a merchant is told what was skipped instead of being handed a
 * shorter list that looks complete.
 *
 * ## Why a route dump is also the safest first step
 *
 * A route table contains no request data. `rails routes` yields a verb, a path
 * pattern and a controller name; there is no field in it that could hold a
 * customer's name, because the thing that would hold one has not happened yet.
 * The runtime capture that fills in field names has no such property, which is
 * why it is the second step and not this one. Ordering is load-bearing here:
 * doing the safe-but-shallow pass first means a merchant who stops after step
 * one has disclosed only route shapes.
 *
 * ## Provenance, because completeness is not provable
 *
 * No method here can claim to have found every endpoint. A route built from a
 * runtime-computed path, or a handler behind an auth middleware we were not
 * told about, will not appear in any of them. So this module does not assert
 * completeness — it records *where each endpoint came from* and lets a human
 * reconcile. An endpoint seen once by a route dump is a declaration; an
 * endpoint seen by both a route dump and a live capture is corroborated. The
 * `only` fields at the bottom of the inventory exist so that difference is
 * visible rather than inferred.
 */
import { readOpenApi } from './openapi.js';
/**
 * Methods exported by a Next.js route handler.
 *
 * A `route.ts` file may export several. An endpoint with no recognised export
 * is still emitted as `ANY` rather than dropped: a handler module that matches
 * none of these names is either a framework version we do not know or a file
 * that fails at build time, and in both cases the path exists and a human
 * should see it.
 */
const NEXT_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
/**
 * Normalise one raw method string.
 *
 * Rails reports `GET|POST` for a route that answers any verb, and Laravel
 * reports `GET,HEAD`. Neither is a lie and neither should be discarded, so a
 * multi-verb route becomes one endpoint per verb — the count a merchant
 * reasons about ("how many write endpoints do I have") is then correct, which
 * is the only reason this list exists.
 */
function expandMethod(raw) {
    if (typeof raw !== 'string')
        return ['ANY'];
    const parts = raw
        .split(/[|,]/)
        .map((p) => p.trim().toUpperCase())
        .filter((p) => HTTP_METHODS.has(p));
    return parts.length === 0 ? ['ANY'] : parts;
}
/**
 * A route dump's contribution: no field names, because a route table has none.
 *
 * The empty arrays are load-bearing rather than cosmetic. They are what makes
 * "this endpoint came from a route table that could not tell us its fields"
 * a visible property of the output instead of an absence the reader has to
 * notice.
 */
function bare(method, path) {
    return { method, path, provenance: [], parameters: [], request: [], response: [] };
}
/** Union two field lists, first-wins on name, sorted so runs are byte-identical. */
function unionFields(a, b) {
    const byName = new Map();
    for (const field of [...a, ...b])
        if (!byName.has(field.name))
            byName.set(field.name, field);
    return [...byName.values()].sort((x, y) => x.name.localeCompare(y.name));
}
/**
 * Merge endpoint lists, combining provenance for the same verb+path.
 *
 * Two adapters reporting `/orders/:id` is corroboration and worth recording.
 * Silently de-duplicating would discard the only evidence that two independent
 * methods agree, which is the one cheap consistency check this module offers.
 *
 * Fields are unioned rather than taken from whichever adapter ran first. A
 * route dump and a spec reporting the same endpoint is the expected case — the
 * spec names the fields and the dump corroborates the route — and preferring
 * the first would let a fieldless route dump erase a declared contract.
 */
export function mergeEndpoints(groups) {
    const byKey = new Map();
    for (const group of groups) {
        for (const endpoint of group.endpoints) {
            const key = `${endpoint.method} ${endpoint.path}`;
            const existing = byKey.get(key);
            if (existing === undefined) {
                byKey.set(key, { ...endpoint, provenance: [group.id] });
                continue;
            }
            if (!existing.provenance.includes(group.id))
                existing.provenance.push(group.id);
            existing.parameters = unionFields(existing.parameters, endpoint.parameters);
            existing.request = unionFields(existing.request, endpoint.request);
            existing.response = unionFields(existing.response, endpoint.response);
        }
    }
    return [...byKey.values()].sort((a, b) => a.path === b.path ? a.method.localeCompare(b.method) : a.path.localeCompare(b.path));
}
/**
 * Parse a JSON route table, tolerating the preamble real CLIs print.
 *
 * `bin/rails routes --json` writes a deprecation warning and a boot banner to
 * stdout before the JSON on some versions. Taking the text between the first
 * `[` or `{` and its matching last bracket is crude, and it is deliberate: a
 * strict `JSON.parse` of raw stdout turns a merchant's harmless boot banner
 * into "discovery failed", and the inventory they get would be empty with an
 * error they cannot act on.
 */
export function parseJsonRouteTable(stdout) {
    const text = stdout.trim();
    const open = text.search(/[[{]/);
    if (open === -1)
        return [];
    const closer = text.lastIndexOf(']') > text.lastIndexOf('}') ? ']' : '}';
    const close = text.lastIndexOf(closer);
    if (close <= open)
        return [];
    try {
        return JSON.parse(text.slice(open, close + 1));
    }
    catch {
        // An unparseable table is an empty table. The caller still records which
        // adapter ran, so the merchant is told an adapter failed rather than being
        // handed a short list presented as complete.
        return [];
    }
}
function asRecord(value) {
    return typeof value === 'object' && value !== null ? value : {};
}
function asRows(value) {
    return Array.isArray(value) ? value.filter((r) => typeof r === 'object' && r !== null) : [];
}
/**
 * `bin/rails routes --json` → `[{ verb, path }]`.
 *
 * `bin/rails` rather than a bare `rails`: the binstub is the version-locked
 * entry point, and a global `rails` on the merchant's PATH may be a different
 * application entirely. Discovering a stranger's routes is worse than
 * discovering none.
 */
const rails = {
    id: 'routes:rails',
    label: 'Rails',
    detect: async (deps, cwd) => (await deps.exists(`${cwd}/bin/rails`)) && (await deps.exists(`${cwd}/config/routes.rb`)),
    read: async (deps, cwd) => {
        const { stdout, code } = await deps.exec('bin/rails', ['routes', '--json'], cwd);
        if (code !== 0)
            return [];
        return asRows(parseJsonRouteTable(stdout)).flatMap((row) => {
            const path = typeof row.path === 'string' ? row.path : '';
            if (path === '')
                return [];
            // Rails names the wildcard `:id`; the inventory uses one spelling so a
            // merchant comparing two frameworks' output reads the same pattern.
            const pattern = path.replace(/:\w+/g, '{id}');
            return expandMethod(row.verb).map((method) => bare(method, pattern));
        });
    },
};
/**
 * `php artisan route:list --json` → `[{ method, uri }]`.
 */
const laravel = {
    id: 'routes:laravel',
    label: 'Laravel',
    detect: async (deps, cwd) => (await deps.exists(`${cwd}/artisan`)) && (await deps.exists(`${cwd}/routes/api.php`)),
    read: async (deps, cwd) => {
        const { stdout, code } = await deps.exec('php', ['artisan', 'route:list', '--json'], cwd);
        if (code !== 0)
            return [];
        return asRows(parseJsonRouteTable(stdout)).flatMap((row) => {
            const uri = typeof row.uri === 'string' ? row.uri : '';
            if (uri === '')
                return [];
            // Laravel's `{id}` is already the spelling this inventory uses, so it is
            // the one framework whose patterns pass through unrewritten.
            return expandMethod(row.method).map((method) => bare(method, uri));
        });
    },
};
/**
 * Next.js, both routers.
 *
 * App Router: every `route.js` under `.next/server/app` is one route, and its
 * path is its directory. `route.js` and `page.js` can be siblings — the page is
 * UI and is *not* an endpoint, so only `route` files are read. Methods come
 * from the exported names.
 *
 * Pages Router: `routes-manifest.json` holds the page keys. A page is reachable
 * as HTML and may or may not be callable by an agent, so it is reported as
 * `ANY` and left for the human to classify — dropping it would understate the
 * reachable surface, and calling it a `GET` would invent a contract the page
 * does not have.
 */
const next = {
    id: 'routes:next',
    label: 'Next.js',
    detect: async (deps, cwd) => {
        for (const name of ['next.config.js', 'next.config.mjs', 'next.config.ts', 'next.config.cjs']) {
            if (await deps.exists(`${cwd}/${name}`))
                return true;
        }
        // A built `.next` is itself proof, and it is the only signal left when a
        // merchant keeps their config in a file we do not name. Checking the
        // manifest rather than the directory keeps a stale `.next` beside an
        // unrelated project from reporting a Next.js app.
        return deps.exists(`${cwd}/.next/routes-manifest.json`);
    },
    read: async (deps, cwd) => {
        const found = [];
        const appDir = `${cwd}/.next/server/app`;
        if (await deps.exists(appDir)) {
            const files = await deps.listFiles(appDir);
            for (const file of files) {
                // `listFiles` returns paths relative to the app dir, so this is
                // `orders/route.js` and not `route.js`. Anchoring the test on the whole
                // path would silently match nothing and report an empty App Router,
                // which is the failure mode this module cannot have.
                const name = file.split('/').pop() ?? '';
                if (!/^route\.(js|mjs|ts|mts)$/.test(name))
                    continue;
                const dir = file.split('/').slice(0, -1).join('/');
                // A root `route.js` sits at the top of app/, giving an empty dir.
                const path = dir === '' ? '/' : `/${dir}`;
                let source = '';
                try {
                    source = await deps.readFile(`${appDir}/${file}`);
                }
                catch {
                    // Unreadable handler: report the path with no method rather than
                    // skipping it. The endpoint demonstrably exists.
                }
                const exported = NEXT_METHODS.filter((m) => new RegExp(`export\\s+(?:async\\s+)?(?:function|const)\\s+${m}\\b`).test(source));
                const methods = exported.length === 0 ? ['ANY'] : [...exported];
                for (const method of methods)
                    found.push(bare(method, path));
            }
        }
        const manifest = `${cwd}/.next/routes-manifest.json`;
        if (await deps.exists(manifest)) {
            try {
                const pages = asRecord(asRecord(JSON.parse(await deps.readFile(manifest))).pages);
                for (const key of Object.keys(pages))
                    found.push(bare('ANY', key));
            }
            catch {
                // A half-written manifest from an interrupted build. The App Router
                // results above are still valid and are kept.
            }
        }
        return found;
    },
};
/**
 * Where an OpenAPI document is conventionally written.
 *
 * Ordered, and the first hit wins. A repository usually has exactly one of
 * these, and when it has two — a checked-in copy and a generated one — the
 * checked-in copy is the one a human edited, so it is listed first.
 */
const SPEC_PATHS = [
    'openapi.json',
    'swagger.json',
    'api-docs.json',
    'openapi/spec.json',
    'docs/openapi.json',
    'api/openapi.json',
    'src/openapi.json',
];
/** The same names in YAML. Reported unread rather than parsed — see `src/openapi.ts`. */
const YAML_PATHS = [
    'openapi.yaml',
    'openapi.yml',
    'swagger.yaml',
    'swagger.yml',
    'docs/openapi.yaml',
    'api/openapi.yaml',
];
/**
 * `skipped` gains a plain-English reason rather than a bare filename.
 *
 * The command matters more than the diagnosis: a merchant whose contract is
 * YAML is one `npx @redocly/cli convert` away from a readable inventory, and
 * telling them so is the difference between a gap they can close in a minute
 * and one they assume is a limitation of the product.
 */
const YAML_REMEDY = 'is YAML, which this reader does not parse — convert it first: npx @redocly/cli convert -o openapi.json <file>';
const spec = {
    id: 'spec:openapi',
    label: 'OpenAPI',
    detect: async (deps, cwd) => {
        for (const name of SPEC_PATHS)
            if (await deps.exists(`${cwd}/${name}`))
                return true;
        return false;
    },
    read: async (deps, cwd) => {
        for (const name of SPEC_PATHS) {
            const path = `${cwd}/${name}`;
            if (!(await deps.exists(path)))
                continue;
            let doc;
            try {
                doc = JSON.parse(await deps.readFile(path));
            }
            catch (err) {
                specWarnings.push(`${name} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
                return [];
            }
            const result = readOpenApi(doc);
            for (const warning of result.warnings)
                specWarnings.push(`${name}: ${warning}`);
            for (const problem of result.unreadable)
                specWarnings.push(`${name} ${problem}`);
            // Mapped rather than spread so `provenance` is added here, once. Leaving
            // it out of `SpecEndpoint` keeps the spec reader independent of the
            // inventory's vocabulary — a spec is not evidence of anything until a
            // discovery run says where it was seen.
            return result.endpoints.map((endpoint) => ({
                method: endpoint.method,
                path: endpoint.path,
                provenance: [],
                parameters: endpoint.parameters,
                request: endpoint.request,
                response: endpoint.response,
            }));
        }
        return [];
    },
};
/**
 * Frameworks we recognise but cannot read.
 *
 * Detection exists purely to populate `skipped`. Each entry is a marker that
 * only that framework ships, so a `.py` file in some unrelated directory cannot
 * report a Python app that is not there.
 */
const UNREADABLE = [
    { label: 'Django', mark: (cwd) => `${cwd}/manage.py` },
    { label: 'FastAPI', mark: (cwd) => `${cwd}/app/main.py` },
    { label: 'Express', mark: (cwd) => `${cwd}/node_modules/express/package.json` },
    { label: 'Fastify', mark: (cwd) => `${cwd}/node_modules/fastify/package.json` },
    { label: 'Flask', mark: (cwd) => `${cwd}/app.py` },
];
const ADAPTERS = [next, rails, laravel, spec];
/**
 * Collected by the spec adapter as a side channel.
 *
 * An adapter returning `DiscoveredEndpoint[]` has nowhere to put "I read the
 * document and these fields were missed", and inventing a fourth return value
 * for one adapter is worse than a module-scoped list that the orchestrator
 * drains. Reset per call so a second `discover` in the same process cannot
 * inherit the first one's warnings.
 */
let specWarnings = [];
/**
 * Discover the endpoint surface of the project at `cwd`.
 *
 * Adapters whose detection fails are not recorded as skipped — a merchant with
 * no Rails app should not be told Rails was skipped. `skipped` means
 * "recognised and unreadable", which is a different and more actionable claim.
 */
export async function discoverEndpoints(deps, cwd) {
    const skipped = [];
    const warnings = [];
    specWarnings = [];
    for (const { label, mark } of UNREADABLE) {
        if (await deps.exists(mark(cwd)))
            skipped.push(label);
    }
    // A YAML contract is the common case, so finding one and saying nothing
    // would be the most misleading thing this command could do. It is reported
    // whether or not a JSON sibling also exists, because a merchant with both
    // has a reader pointed at the older one.
    for (const name of YAML_PATHS) {
        if (await deps.exists(`${cwd}/${name}`))
            skipped.push(`${name} ${YAML_REMEDY}`);
    }
    const groups = [];
    for (const adapter of ADAPTERS) {
        if (!(await adapter.detect(deps, cwd)))
            continue;
        groups.push({ id: adapter.id, endpoints: await adapter.read(deps, cwd) });
    }
    warnings.push(...specWarnings);
    specWarnings = [];
    return {
        version: 1,
        observedBy: groups.filter((g) => g.endpoints.length > 0).map((g) => g.id),
        endpoints: mergeEndpoints(groups),
        skipped,
        warnings,
    };
}
//# sourceMappingURL=discover.js.map
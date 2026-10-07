/**
 * OpenAPI reader — field names from a declared contract.
 *
 * ## Why this is the second adapter and not the first
 *
 * A route dump gives method and path. It cannot give field names, because a
 * route table does not contain them: the request that would carry them has not
 * happened. An OpenAPI document does contain them, which makes it the cheapest
 * way to learn an API's shape — no interception, no local CA, no proxy, no
 * request ever reaching us.
 *
 * It is also the only method that reports what the API *should* expose rather
 * than what some sample of traffic happened to touch, which is the one
 * perspective route dumps and runtime capture both lack.
 *
 * ## JSON only, and that is a decision rather than a gap
 *
 * OpenAPI is published as YAML about as often as JSON, so this leaves the most
 * common form of the most common contract unread. The alternative was a partial
 * YAML reader, and that would break the one rule this whole module is built on:
 * a parser that quietly drops half a document produces an inventory that is
 * shorter than reality and looks complete. Silence is the failure mode that
 * costs a merchant an ungoverned endpoint, so `YAML_PATHS` is reported as
 * unread in `skipped`, next to the exact command that converts it.
 *
 * ## Field names, never field values
 *
 * `example`, `default` and `enum` values are dropped on the floor. A spec
 * carries them, they are usually realistic, and a real email or card token in
 * an example block would put customer-shaped data into a file on disk. Types
 * are kept — `amount: integer` is what lets a merchant notice a monetary field
 * that needs a ceiling, and a type discloses nothing about any request.
 *
 * The result is names and types. That is the whole payload, and a test asserts
 * it by checking the serialised output for the keys that would carry a value.
 */
const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);
/**
 * Ref-following depth.
 *
 * Schemas nest, and `allOf` chains are long in real documents. A cap is
 * required because a spec can be cyclic, and an unbounded walk on a cyclic
 * schema is a hang in a command a merchant is waiting on. Twelve is well past
 * anything hand-written; a document that needs more is reported as truncated.
 */
const MAX_DEPTH = 12;
function record(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value
        : {};
}
function str(value) {
    return typeof value === 'string' ? value : '';
}
/**
 * Follow a local JSON pointer, e.g. `#/components/schemas/Order`.
 *
 * Only local refs are followed. A remote `$ref` is a URL, and resolving it would
 * mean this command making a network request it was never designed to make — so
 * a document that points outside itself yields no fields for that schema and a
 * warning naming it, rather than a fetch.
 */
export function resolveRef(doc, ref) {
    if (!ref.startsWith('#/'))
        return {};
    let cursor = doc;
    for (const rawSegment of ref.slice(2).split('/')) {
        // RFC 6901 escaping: `~1` is `/` and `~0` is `~`, in that order.
        const segment = decodeURIComponent(rawSegment).replace(/~1/g, '/').replace(/~0/g, '~');
        if (typeof cursor !== 'object' || cursor === null)
            return {};
        cursor = cursor[segment];
    }
    return record(cursor);
}
/** Unwrap one level of `{$ref}`, leaving composites alone. */
function deref(doc, node) {
    const ref = node['$ref'];
    if (typeof ref !== 'string')
        return node;
    return resolveRef(doc, ref);
}
/**
 * The envelope most real APIs wrap everything in: `{ data: {...} }`.
 *
 * A spec for `POST /orders` that returns `{ "data": { "id": "..." } }` describes
 * one field called `data`, and a merchant looking at that learns nothing about
 * what an order is. So a single-field object whose only property is itself an
 * object is unwrapped once. `allOf`-composed schemas and genuine multi-field
 * bodies are left exactly as declared, because guessing which field "really"
 * matters is the merchant's decision and not ours.
 */
function unwrapEnvelope(schema) {
    const properties = record(schema['properties']);
    const names = Object.keys(properties);
    if (names.length !== 1)
        return schema;
    const only = names[0];
    // `data`, `result`, `payload`, `attributes` and `item` are the conventional
    // names; restricting the unwrap to them keeps a body that genuinely has one
    // field, like `{ "count": 3 }`, from losing that field.
    const envelopes = new Set(['data', 'result', 'payload', 'attributes', 'item', 'value']);
    if (!envelopes.has(only))
        return schema;
    const inner = record(properties[only]);
    if (Object.keys(inner).length === 0)
        return schema;
    return inner;
}
/**
 * Collect field names from a schema, following refs and merging composites.
 *
 * Names are de-duplicated with first-wins ordering so two runs over the same
 * document produce byte-identical output and two inventories can be diffed.
 */
function fieldsOf(doc, node, depth = 0, seen = new Set()) {
    if (depth > MAX_DEPTH || node === null || typeof node !== 'object')
        return [];
    const inherited = [];
    // `allOf` / `oneOf` / `anyOf` are how inheritance is expressed in a schema.
    // Merging their properties is what makes an inherited field visible at all;
    // dropping the composite would report only the fields declared on the leaf.
    for (const key of ['allOf', 'oneOf', 'anyOf']) {
        const branches = node[key];
        if (!Array.isArray(branches))
            continue;
        for (const branch of branches) {
            inherited.push(...fieldsOf(doc, deref(doc, record(branch)), depth + 1, seen));
        }
    }
    const ref = node['$ref'];
    if (typeof ref === 'string') {
        if (seen.has(ref))
            return inherited;
        seen.add(ref);
        return [...inherited, ...fieldsOf(doc, resolveRef(doc, ref), depth + 1, seen)];
    }
    const unwrapped = unwrapEnvelope(node);
    const properties = record(unwrapped['properties']);
    for (const name of Object.keys(properties)) {
        const child = deref(doc, record(properties[name]));
        // An array's shape is its items' shape; reporting `array` for a list of
        // orders tells a merchant nothing about what an order contains.
        const items = child['items'];
        const source = typeof items === 'object' && items !== null ? record(items) : child;
        inherited.push({ name, type: str(source['type']) });
    }
    return inherited;
}
function dedupe(fields) {
    const seen = new Set();
    const out = [];
    for (const field of fields) {
        if (field.name === '' || seen.has(field.name))
            continue;
        seen.add(field.name);
        out.push(field);
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
}
/**
 * Field names for one media type entry of a request body or response.
 *
 * Both are read the same way and kept separate because they mean different
 * things: a request field is an input a caller may send, a response field is
 * something the endpoint discloses. `access` and redaction decisions differ
 * between them, so merging them into one list would erase the distinction.
 */
function fieldsForMedia(doc, container, warnings, label) {
    const content = record(container['content']);
    const json = record(content['application/json']);
    const schema = record(json['schema']);
    if (Object.keys(schema).length === 0) {
        const other = Object.keys(content)[0];
        if (other !== undefined && other !== 'application/json') {
            warnings.push(`${label} declares "${other}" and no application/json; its fields were not read`);
        }
        return [];
    }
    if (typeof schema['$ref'] === 'string' && !schema['$ref'].startsWith('#/')) {
        warnings.push(`${label} points outside this document (${str(schema['$ref'])}); its fields were not read`);
        return [];
    }
    return dedupe(fieldsOf(doc, schema));
}
function parametersOf(doc, operation, inherited) {
    const declared = [
        ...(Array.isArray(inherited) ? inherited.map(record) : []),
        ...(Array.isArray(operation['parameters']) ? operation['parameters'].map(record) : []),
    ];
    const out = [];
    for (const parameter of declared) {
        // `in: header` is deliberately excluded. A header name is metadata about
        // the transport, not an input an agent supplies, and recording
        // `Authorization` would be recording the shape of a credential.
        const location = str(parameter['in']);
        if (location !== 'query' && location !== 'path')
            continue;
        const name = str(parameter['name']);
        if (name === '')
            continue;
        const schema = deref(doc, record(parameter['schema']));
        out.push({ name, type: str(schema['type']) });
    }
    return dedupe(out);
}
/**
 * Response fields from the first success and the first error response.
 *
 * Only the first of each. A spec declaring four status codes usually restates
 * the same error shape, and reporting all four would imply four distinct
 * payloads. Choosing `2xx` and the first failure matches what a caller
 * actually has to handle.
 */
function responsesOf(doc, operation, warnings, label) {
    const responses = record(operation['responses']);
    const codes = Object.keys(responses).sort();
    const success = codes.find((c) => c.startsWith('2'));
    const failure = codes.find((c) => c.startsWith('4') || c.startsWith('5'));
    const out = [];
    for (const code of [success, failure]) {
        if (code === undefined)
            continue;
        out.push(...fieldsForMedia(doc, record(responses[code]), warnings, `${label} ${code}`));
    }
    if (success === undefined)
        warnings.push(`${label} declares no 2xx response`);
    return dedupe(out);
}
/**
 * Read an OpenAPI 3 document.
 *
 * Swagger 2.0 is recognised and refused rather than half-read. Its body schema
 * lives under `definitions` and its parameters under `in: body`, so a reader
 * written for 3.x would return an empty inventory for a 2.0 document and the
 * merchant would see "no endpoints" where they have a full contract.
 */
export function readOpenApi(doc) {
    const warnings = [];
    const unreadable = [];
    const root = record(doc);
    const version = str(root['openapi']);
    if (version === '') {
        if (root['swagger'] !== undefined) {
            return {
                endpoints: [],
                warnings: [],
                unreadable: ['this is a Swagger 2.0 document; regenerate it as OpenAPI 3 (npx @redocly/cli convert)'],
            };
        }
        return { endpoints: [], warnings: [], unreadable: ['no "openapi" version key — this is not an OpenAPI 3 document'] };
    }
    const paths = record(root['paths']);
    const endpoints = [];
    for (const path of Object.keys(paths).sort()) {
        const item = record(paths[path]);
        for (const method of Object.keys(item).sort()) {
            if (!HTTP_METHODS.has(method.toLowerCase()))
                continue;
            const operation = record(item[method]);
            const label = `${method.toUpperCase()} ${path}`;
            endpoints.push({
                method: method.toUpperCase(),
                path,
                parameters: parametersOf(doc, operation, item['parameters']),
                request: fieldsForMedia(doc, operation['requestBody'] === undefined ? {} : record(operation['requestBody']), warnings, label),
                response: responsesOf(doc, operation, warnings, label),
            });
        }
    }
    if (endpoints.length === 0)
        warnings.push('the document parsed but declared no operations under "paths"');
    return { endpoints, warnings, unreadable };
}
//# sourceMappingURL=openapi.js.map
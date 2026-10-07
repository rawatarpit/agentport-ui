/**
 * Input validation and parameter binding.
 *
 * This exists because of a specific decision: the binary holds the merchant's
 * database credentials and turns agent input into queries. Before that, a
 * capability was a callback, and unvalidated input was a B-class defect with a
 * small surface — a malformed payload reaching a handler. It is no longer
 * small. There is no code path here that concatenates agent input into SQL;
 * the only route from input to database is a bound parameter chosen by a
 * query template the merchant wrote.
 *
 * Two independent controls, and the order matters:
 *
 *   1. `validateInput` — the payload is the shape the capability declared. Runs
 *      *before* policy evaluation, so a malformed request can never be queued
 *      for a human. Invariant 3 says a request that can never be permitted is
 *      not asked for approval; a payload that does not parse is such a request.
 *
 *   2. `bindParameters` — the values that reach the query are selected by name
 *      from a declared binding map. An unbound key cannot reach the database
 *      because there is no path from it to a placeholder.
 *
 * No dependencies, per the working rules. A schema library is a supply-chain
 * decision every customer inherits, and the subset needed here is small.
 */
/** Depth cap. Bounds recursion on a hostile payload before the stack does. */
const MAX_DEPTH = 8;
/** Keys per object. A payload this wide is an attack, not an order. */
const MAX_KEYS = 200;
/** Elements per array, for the same reason. */
const MAX_ITEMS = 1_000;
/** Characters per string, so a caller cannot allocate unbounded memory. */
const MAX_STRING = 64_000;
/**
 * Joins a path segment, with no leading dot at the root.
 *
 * The first version built paths by interpolation in two places and they
 * disagreed: the object branch stripped the leading dot for a missing required
 * key while the recursive call did not, so one payload produced both `sku` and
 * `.qty`. A caller cannot build a field reference from a set of paths that do
 * not agree on whether they are absolute or relative, and a refusal is only
 * useful if the path in it can be pasted somewhere.
 */
function joinPath(base, key) {
    return base ? `${base}.${key}` : key;
}
function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/**
 * Checks a payload against a declared schema.
 *
 * Returns every issue found rather than the first. A caller that fixed one
 * field at a time against a single-issue validator would need a round trip per
 * mistake, and an agent — unlike a human with a debugger — has no debugger.
 */
export function validateInput(schema, input) {
    const issues = [];
    // A declared object is a contract about the *whole* payload, so an
    // undeclared key is a refusal, not a shrug. Silently dropping an unknown
    // field is how an agent ends up believing it set something it did not — it
    // sends `isAdmin: true`, gets a success, and infers the call worked.
    //
    // The schema is the property map of an implicit root object: the top level of
    // a payload is always an object, and a schema that declared otherwise would
    // be describing a request the port cannot have received.
    check({ type: 'object', properties: schema }, input, '', 0, issues);
    return issues;
}
function check(spec, value, path, depth, issues) {
    if (depth > MAX_DEPTH) {
        issues.push({ path, message: `Nested deeper than ${MAX_DEPTH} levels.` });
        return;
    }
    const at = path || 'input';
    switch (spec.type) {
        case 'string': {
            if (typeof value !== 'string') {
                issues.push({ path: at, message: `Expected a string, received ${describe(value)}.` });
                return;
            }
            if (spec.required !== false && value.length === 0) {
                issues.push({ path: at, message: 'Required, but empty.' });
            }
            if (spec.maxLength !== undefined && value.length > spec.maxLength) {
                issues.push({ path: at, message: `Longer than the permitted ${spec.maxLength} characters.` });
            }
            if (spec.enum && !spec.enum.includes(value)) {
                issues.push({
                    path: at,
                    message: `Must be one of ${spec.enum.map((v) => JSON.stringify(v)).join(', ')}.`,
                });
            }
            if (spec.pattern !== undefined && !safeTest(spec.pattern, value)) {
                issues.push({ path: at, message: `Does not match the required format ${spec.pattern}.` });
            }
            return;
        }
        case 'number':
        case 'integer': {
            // `typeof NaN === 'number'` and `NaN > x` is false, so a naive range
            // check passes NaN straight through into a money column. That is the
            // whole reason this branch does not share the string shape.
            if (typeof value !== 'number' || !Number.isFinite(value)) {
                issues.push({ path: at, message: `Expected a finite number, received ${describe(value)}.` });
                return;
            }
            if (spec.type === 'integer' && !Number.isInteger(value)) {
                issues.push({ path: at, message: 'Expected a whole number.' });
            }
            if (spec.min !== undefined && value < spec.min) {
                issues.push({ path: at, message: `Below the permitted minimum of ${spec.min}.` });
            }
            if (spec.max !== undefined && value > spec.max) {
                issues.push({ path: at, message: `Above the permitted maximum of ${spec.max}.` });
            }
            return;
        }
        case 'boolean': {
            if (typeof value !== 'boolean') {
                issues.push({ path: at, message: `Expected true or false, received ${describe(value)}.` });
            }
            return;
        }
        case 'array': {
            if (!Array.isArray(value)) {
                issues.push({ path: at, message: `Expected a list, received ${describe(value)}.` });
                return;
            }
            if (value.length > MAX_ITEMS) {
                issues.push({ path: at, message: `More than the permitted ${MAX_ITEMS} items.` });
                return;
            }
            if (spec.maxItems !== undefined && value.length > spec.maxItems) {
                issues.push({ path: at, message: `More than the permitted ${spec.maxItems} items.` });
            }
            if (spec.items) {
                value.forEach((item, i) => check(spec.items, item, `${at}[${i}]`, depth + 1, issues));
            }
            return;
        }
        case 'object': {
            if (!isPlainObject(value)) {
                issues.push({ path: at, message: `Expected an object, received ${describe(value)}.` });
                return;
            }
            const keys = Object.keys(value);
            if (keys.length > MAX_KEYS) {
                issues.push({ path: at, message: `More than the permitted ${MAX_KEYS} fields.` });
                return;
            }
            const properties = spec.properties ?? {};
            for (const key of keys) {
                // Own-property lookup, and the reason is not pedantry. `properties` is a
                // schema object literal, so a plain `properties[key]` resolves through
                // `Object.prototype`: `toString`, `constructor`, `valueOf`,
                // `hasOwnProperty` and five others are functions, they are truthy, and
                // the key reads as declared. `child.type` is then `undefined`, matches
                // no case in the switch below, and returns having reported nothing — so
                // `{"sku":"A1","toString":"x"}` validated clean and the undeclared key
                // reached the merchant's handler and their ledger, while `isAdmin` was
                // correctly refused. That is invariant 8 at the input layer: exposure is
                // an allowlist, and the allowlist had a hole shaped like the prototype.
                if (!Object.hasOwn(properties, key)) {
                    if (spec.additionalProperties !== true) {
                        issues.push({
                            path: joinPath(path, key),
                            message: 'Not a field this capability accepts. It will not be used.',
                        });
                    }
                    continue;
                }
                const child = properties[key];
                // Read through a descriptor rather than `value[key]`. A body parser or
                // ORM layer that materialises accessors would otherwise hand us a getter
                // that throws, and it would escape `invoke()` as a raw throw — the same
                // class of bug `safeTest` below already exists to contain. An accessor is
                // refused rather than invoked: a value we cannot read without calling
                // caller-supplied code is not a value we can validate.
                const descriptor = Object.getOwnPropertyDescriptor(value, key);
                if (descriptor !== undefined && !('value' in descriptor)) {
                    issues.push({
                        path: joinPath(path, key),
                        message: 'Not a plain value, so it cannot be checked. It will not be used.',
                    });
                    continue;
                }
                check(child, descriptor !== undefined ? descriptor.value : undefined, joinPath(path, key), depth + 1, issues);
            }
            // A required key absent entirely is a different failure from one present
            // and wrong, and the caller fixes them differently.
            for (const [key, child] of Object.entries(properties)) {
                // `Object.hasOwn`, not `key in value`: a schema field named `toString`
                // would otherwise be reported as present in an object that never sent it,
                // and the missing required field would never be named.
                if (child.required === true && !Object.hasOwn(value, key)) {
                    issues.push({ path: joinPath(path, key), message: 'Required, but absent.' });
                }
            }
            return;
        }
    }
}
/** Describes a value for an error message without echoing it. */
function describe(value) {
    if (value === null)
        return 'null';
    if (value === undefined)
        return 'nothing';
    if (Array.isArray(value))
        return 'a list';
    if (typeof value === 'string')
        return 'a string';
    if (typeof value === 'number')
        return Number.isFinite(value) ? 'a number' : `the number ${value}`;
    return `a ${typeof value}`;
}
/**
 * Runs a merchant-supplied pattern without letting a bad one throw.
 *
 * The pattern comes from the merchant's own config, so it is not attacker
 * input — but a config typo like `(` would otherwise turn every request into a
 * thrown `SyntaxError` escaping `invoke()`, which is the failure mode the
 * handler `try` block was added to stop.
 */
function safeTest(pattern, value) {
    try {
        return new RegExp(pattern).test(value);
    }
    catch {
        return false;
    }
}
/**
 * Selects the values a query is allowed to use, by name.
 *
 * The security property is structural rather than a check that can be skipped:
 * a key absent from `bindings` has no route to a placeholder, so no amount of
 * input shape can put it in the statement. `extractPolicyInput` performs the
 * same read for the same reason — one selected read, not a general walk.
 */
export function bindParameters(bindings, input) {
    const source = isPlainObject(input) ? input : {};
    const out = {};
    for (const [name, path] of Object.entries(bindings)) {
        const value = readPath(source, path);
        if (value !== undefined)
            out[name] = value;
    }
    return out;
}
/** Reads `a.b.c` from a payload. Returns undefined for a missing or non-object hop. */
function readPath(source, path) {
    let cursor = source;
    for (const segment of path.split('.')) {
        if (!isPlainObject(cursor))
            return undefined;
        cursor = cursor[segment];
    }
    return cursor;
}
/** Renders issues as one caller-safe line, naming each field that was wrong. */
export function describeIssues(issues) {
    const shown = issues.slice(0, 5);
    const body = shown.map((i) => `${i.path}: ${i.message}`).join('; ');
    return issues.length > shown.length
        ? `${body}; and ${issues.length - shown.length} more.`
        : body;
}
//# sourceMappingURL=validate.js.map
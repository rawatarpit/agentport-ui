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
export type FieldType = 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array';
export interface FieldSpec {
    type: FieldType;
    required?: boolean;
    /** Strings: reject longer. */
    maxLength?: number;
    /** Numbers: inclusive bounds. Also rejects NaN and ±Infinity. */
    min?: number;
    max?: number;
    /** Strings: must match. Useful to keep a SKU to a SKU's alphabet. */
    pattern?: string;
    /** Strings: must be one of these. The cheapest way to stop a typo'd enum. */
    enum?: readonly string[];
    /** Objects: their fields. */
    properties?: Record<string, FieldSpec>;
    /** Objects: refuse keys not declared here. Default true — see below. */
    additionalProperties?: boolean;
    /** Arrays: the element spec. */
    items?: FieldSpec;
    /** Arrays: refuse longer. */
    maxItems?: number;
}
/** A capability's declared input. Keys are the top-level field names. */
export type InputSchema = Record<string, FieldSpec>;
/** One thing wrong with a payload, located precisely enough to act on. */
export interface ValidationIssue {
    /** Dotted path, `items[0].sku`, so a caller can point at the field. */
    path: string;
    message: string;
}
/**
 * Checks a payload against a declared schema.
 *
 * Returns every issue found rather than the first. A caller that fixed one
 * field at a time against a single-issue validator would need a round trip per
 * mistake, and an agent — unlike a human with a debugger — has no debugger.
 */
export declare function validateInput(schema: InputSchema, input: unknown): ValidationIssue[];
/**
 * Selects the values a query is allowed to use, by name.
 *
 * The security property is structural rather than a check that can be skipped:
 * a key absent from `bindings` has no route to a placeholder, so no amount of
 * input shape can put it in the statement. `extractPolicyInput` performs the
 * same read for the same reason — one selected read, not a general walk.
 */
export declare function bindParameters(bindings: Record<string, string>, input: unknown): Record<string, unknown>;
/** Renders issues as one caller-safe line, naming each field that was wrong. */
export declare function describeIssues(issues: ValidationIssue[]): string;
//# sourceMappingURL=validate.d.ts.map
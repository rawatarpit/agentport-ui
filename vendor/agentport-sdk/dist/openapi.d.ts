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
export interface DiscoveredField {
    name: string;
    /** Declared type, or `''` when the schema did not say. Never inferred from a value. */
    type: string;
}
export interface SpecEndpoint {
    method: string;
    path: string;
    /** Query and path parameter names, in that order as declared. */
    parameters: DiscoveredField[];
    /** Request body field names, unwrapped through `$ref`, `allOf` and one envelope. */
    request: DiscoveredField[];
    /** Response body field names for the first 2xx and the first 4xx/5xx declared. */
    response: DiscoveredField[];
}
export interface SpecReadResult {
    endpoints: SpecEndpoint[];
    /** Contract problems worth a human's attention, reported rather than hidden. */
    warnings: string[];
    /** Non-empty when the document was not readable as OpenAPI. */
    unreadable: string[];
}
/**
 * Follow a local JSON pointer, e.g. `#/components/schemas/Order`.
 *
 * Only local refs are followed. A remote `$ref` is a URL, and resolving it would
 * mean this command making a network request it was never designed to make — so
 * a document that points outside itself yields no fields for that schema and a
 * warning naming it, rather than a fetch.
 */
export declare function resolveRef(doc: unknown, ref: string): Record<string, unknown>;
/**
 * Read an OpenAPI 3 document.
 *
 * Swagger 2.0 is recognised and refused rather than half-read. Its body schema
 * lives under `definitions` and its parameters under `in: body`, so a reader
 * written for 3.x would return an empty inventory for a 2.0 document and the
 * merchant would see "no endpoints" where they have a full contract.
 */
export declare function readOpenApi(doc: unknown): SpecReadResult;
//# sourceMappingURL=openapi.d.ts.map
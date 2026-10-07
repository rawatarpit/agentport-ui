/**
 * Append-only in-memory ledger.
 *
 * Entries are immutable once written and there is no update or delete path by
 * design: an audit trail that can be edited is not an audit trail. Swap in a
 * durable implementation via the Ledger interface when you need one.
 */
export class InMemoryLedger {
    entries = [];
    cap;
    constructor(options = {}) {
        this.cap = options.maxEntries ?? 10_000;
    }
    async append(entry) {
        // Stamped here, not trusted from the caller. A digest over a caller-chosen
        // value would attest to whatever the caller claimed; recomputing from the
        // values as stored makes re-appending a listed row stable, since the digest
        // never covers itself.
        //
        // Synchronous by requirement, not by preference. `computeRowDigest` must
        // not yield to the event loop: an await here lets a concurrent same-intent
        // caller observe `in_progress` while the winner is still recording, and
        // the write-safety test that pins one-effect-every-caller-answered goes
        // red. See the note on `sha256Hex`.
        const rowDigest = computeRowDigest(entry, entry.tenantId);
        this.entries.push(Object.freeze({ ...entry, rowDigest }));
        if (this.entries.length > this.cap)
            this.entries.shift();
    }
    async list(filter = {}) {
        const limit = filter.limit ?? 100;
        return this.entries
            .filter((e) => {
            if (filter.agentId && e.agentId !== filter.agentId)
                return false;
            if (filter.capability && e.capability !== filter.capability)
                return false;
            if (filter.decision && e.decision !== filter.decision)
                return false;
            if (filter.since && e.at < filter.since)
                return false;
            return true;
        })
            .slice(-limit)
            .reverse();
    }
}
/**
 * What `config_hash` holds when the embedder had no config file to digest.
 *
 * Spelled as a literal rather than NULL so a merchant querying their own
 * ledger can find these rows with `WHERE config_hash = 'unconfigured'` and
 * learn that the SDK was embedded directly, instead of having to guess whether
 * an empty cell means an old row, a lost digest, or an absent one.
 *
 * Lives here rather than in `sql.ts` because the row digest below must name
 * the same value the durable ledger stores, and `ledger.ts` cannot import it
 * back out of `sql.ts` without a runtime cycle (`agent.ts` sits between them).
 */
export const UNVERSIONED_CONFIG = 'unconfigured';
/**
 * Key order must not change the digest, so two structurally equal requests
 * match.
 *
 * The depth guard is not defensive padding. This is the same unbounded payload
 * that broke `redact`, reached from `fingerprintOf` — and here it is worse,
 * because `approve()` calls `consume()` *before* it computes the fingerprint.
 * A deep payload therefore spent the operator's approval and then died, so the
 * retry was refused as a double-click and nothing named who had approved it.
 *
 * Eight matches the depth `validateInput` already enforces on declared fields,
 * and an undeclared subtree is cut at the same depth a declared one would be —
 * so this cannot accept a request that validation would have refused, only
 * refuse to describe the part validation never looks at.
 *
 * The single canonicaliser in this package. `artifact.ts`, the request
 * fingerprint and the row digest below all share it, because two
 * canonicalisers is how a config and its digest stop agreeing with each other.
 */
export function stableStringify(value, depth = 0) {
    if (depth > 8)
        return '"[truncated]"';
    if (value === null || typeof value !== 'object')
        return JSON.stringify(value) ?? 'null';
    if (Array.isArray(value))
        return `[${value.map((v) => stableStringify(v, depth + 1)).join(',')}]`;
    const entries = Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v, depth + 1)}`);
    return `{${entries.join(',')}}`;
}
/**
 * SHA-256 hex without a dependency.
 *
 * `globalThis.crypto` is a platform global in Node 20 and Workers, so this
 * costs no supply chain. Used for fingerprints and config digests, where the
 * caller can afford a turn of the event loop.
 *
 * Deliberately NOT used for the row digest below. `crypto.subtle.digest` is
 * async-only, and an await inside the append path yields to the event loop —
 * which is how three concurrent same-intent callers stop converging: the
 * winner suspends mid-claim, the losers observe `in_progress`, and a test
 * that pins one-effect-every-caller-answered goes red. Reproducible, not
 * theoretical. The row digest must be computed synchronously.
 */
export async function sha256Hex(text) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
/**
 * FNV-1a, 64-bit, synchronous, dependency-free.
 *
 * This names rows; it does not authenticate them. Sixty-four bits is far more
 * than enough for a label a human recognises, and an attacker who can write
 * ledger rows can already do worse than collide one. The Supabase projection
 * carries its own database-computed digest over its own columns — the two are
 * domain-local labels and are not comparable across systems, because the
 * serializations differ. Do not "upgrade" this to an async hash without
 * reading the note on `sha256Hex` above.
 */
export function fnv1a64Hex(text) {
    let hash = 0xcbf29ce484222325n;
    const bytes = new TextEncoder().encode(text);
    for (const byte of bytes) {
        hash ^= BigInt(byte);
        hash = BigInt.asUintN(64, hash * 0x100000001b3n);
    }
    return hash.toString(16).padStart(16, '0');
}
/**
 * Tamper-evidence for one ledger row, computed at append time.
 *
 * The input mirrors the stored columns exactly — the ledger's own tenant, the
 * `unconfigured` sentinel for a missing config hash, `?? null` for every
 * absent optional, the `0/1/null` normalisation of the registration flag — so
 * a reader holding a listed row can recompute it. JSON columns are represented
 * by the values they parse back to, for the same reason: the verifier has
 * objects, not the bound strings.
 *
 * The digest never covers itself. A digest-of-self is a claim no verifier can
 * reproduce, and it is also what makes re-appending a listed row stable rather
 * than divergent.
 *
 * `fnv1a:` plus sixteen hex characters. Synchronous FNV-1a, not SHA-256: the
 * digest is computed inside the append path, where an await yields the event
 * loop and breaks same-intent convergence (see `sha256Hex` and `append`
 * above). Sixteen hex characters for the reason `configDigest` gives: this
 * names a row a human then recognises; nothing is verified against it
 * cryptographically, and 64 bits is far more than enough for a label.
 */
export function computeRowDigest(entry, tenantId) {
    const stored = {
        tenant_id: tenantId,
        at: entry.at,
        request_id: entry.requestId,
        intent_id: entry.intentId ?? null,
        agent_id: entry.agentId,
        assurance: entry.assurance,
        config_hash: entry.configHash || UNVERSIONED_CONFIG,
        on_behalf_of_user_id: entry.onBehalfOfUserId ?? null,
        on_behalf_of_scope: entry.onBehalfOfScope ?? null,
        capability: entry.capability,
        capability_registered: entry.capabilityRegistered === false ? 0 : entry.capabilityRegistered === true ? 1 : null,
        access: entry.access ?? null,
        parameters: entry.parameters,
        decision: entry.decision,
        reason: entry.reason,
        rule: entry.rule,
        detail: entry.detail,
        evaluated: entry.evaluated ?? null,
        approval: entry.approval ?? null,
        result: entry.result ?? null,
        error: entry.error ?? null,
    };
    return `fnv1a:${fnv1a64Hex(stableStringify(stored))}`;
}
// NOTE on what is deliberately absent from the digest above: `durationMs`.
//
// Duration is telemetry, not a decision fact. Covering it makes two identical
// decisions at different speeds digest differently, so a merchant cannot use
// the digest to recognise "the same decision" — and the analytics
// sink-independence test goes red, because two runs of the same decisions
// with different timings must produce identical ledgers. Timing belongs in the
// row (it is there, `duration_ms`); it must not name it.
/**
 * Removes anything that must never reach a durable store.
 *
 * Redaction is not optional. A ledger is read by people who did not make the
 * request, so it is the last place raw PII, credentials or card data should
 * appear.
 */
export function redact(input, depth = 0) {
    if (depth > 4)
        return { truncated: true };
    if (!input || typeof input !== 'object')
        return { value: typeof input === 'string' ? input.slice(0, 120) : input };
    // A top-level array must be scrubbed, not returned whole. It previously fell
    // into the `value` branch above, so a capability taking a bare array wrote
    // every line item to the ledger unredacted. Reachable in normal use: a
    // line item carries an email or a card token, and the array is the payload.
    if (Array.isArray(input))
        return { value: scrub(input, depth + 1) };
    const out = {};
    for (const [key, value] of Object.entries(input)) {
        if (isSensitiveKey(key)) {
            out[key] = '[redacted]';
            continue;
        }
        // Value-shape control, because the key is not ours to choose once a handler
        // can return a third-party API body. A credential echoed under an
        // unanticipated name is the case both of these exist for.
        if (typeof value === 'string' && looksLikeCredential(value)) {
            out[key] = '[redacted]';
            continue;
        }
        out[key] = scrub(value, depth);
    }
    return out;
}
/**
 * Redacts a single value, recursing into both objects and arrays.
 *
 * Arrays matter here: an order payload is a list of line items, and a line item
 * can carry an email or a card token. An earlier version passed arrays through
 * untouched, so `items: [{ email }]` reached the ledger in the clear.
 */
function scrub(value, depth) {
    if (depth > 4)
        return '[truncated]';
    if (Array.isArray(value))
        return value.map((v) => scrub(v, depth + 1));
    // `depth + 1`, not `depth`. Passing it through made the guard above advance
    // only through arrays, so a chain of plain objects recursed without bound
    // and blew the stack at a few thousand levels — inside the 64 KB body cap.
    //
    // That was not a crash the agent saw. `record()` catches a failed append and
    // logs it, so the handler had already run: a write landed in the merchant's
    // database and the ledger recorded nothing at all. The one control that
    // makes every other claim checkable was optional, and it failed silently in
    // the exact case an attacker chooses.
    if (value && typeof value === 'object')
        return redact(value, depth + 1);
    return typeof value === 'string' ? value.slice(0, 120) : value;
}
/**
 * Redacts a bare run of 13-19 digits anywhere in a string.
 *
 * Key-based redaction cannot reach this, and the gap is not theoretical: a
 * handler that throws `charge declined for card 4111111111111111` puts a live
 * card number in the ledger, because the value is a sentence and the key is
 * `error`. The ledger is read by people who did not make the request.
 *
 * A 12-or-more-digit run and the email shape are what handlers most often echo
 * back. Both over-redact in free text -- a 16-digit order id, a 22-digit
 * tracking number, a support address -- and that is the intended trade: an
 * operator debugging a failed call loses a digit run or an address and reads the
 * exact value in `parameters` instead, while the alternative is a card number
 * and a customer's email in a table with no update path. Declared fields under a
 * declared key are unaffected, because this runs on the scalar path only, so
 * the `parameters` behaviour and the two directions of invariant 6 stay exactly
 * as they were tested.
 */
export function scrubFreeText(value) {
    return value
        .replace(/\b\d{12,}\b/g, '[redacted-number]')
        .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[redacted-email]');
}
const SENSITIVE = [
    'password',
    'token',
    'secret',
    'apikey',
    'api_key',
    'authorization',
    // Added after an end-to-end run stored an upstream's echo of the merchant's
    // own `Authorization` header under a key called `auth`. The vocabulary is
    // consulted on key names, and a credential under an unanticipated name is
    // invisible to it — which is why `looksLikeCredential` below also matches on
    // the *shape* of the value. Neither control is sufficient alone.
    'auth',
    'bearer',
    'session',
    'cookie',
    'card',
    'cvv',
    'cvc',
    'ssn',
    'pan',
    'accountnumber',
    'account_number',
    'email',
    'phone',
    'address',
    'dob',
    'pin',
    // The payment-instrument and one-time-credential classes the list above did not
    // name. The gap was reachable in normal use, by the same argument that made the
    // top-level array a real leak: an order payload carries a card token, so a
    // refund payload carries an IBAN and a one-time passcode. Neither
    // `looksLikeCredential` (which wants `Bearer x` or a three-segment token over
    // 40 characters) nor `scrubFreeText` (applied only to the error string, never
    // to `parameters`) caught `GB33BUKB20201555555555` or `482913`.
    'iban',
    'bic',
    // `swift` itself, and this entry is the second half of a fix. It was removed
    // entirely because a token match redacted `swiftDelivery` and `carrierSwift`,
    // and Swift is also a courier name — the same defect as `pan` inside "com-pan-y",
    // in a field a shipping ledger exists to hold.
    //
    // Removing it fixed that and opened a worse hole. A bare `swift` field, an
    // upper-case `SWIFT`, and every compound a payments payload actually uses —
    // `beneficiarySwift`, `payeeSwift`, `remittanceSwift` — match no entry in this
    // list, because none of them contains `swiftcode` or `bankswift`. The bank code
    // is the common meaning of the word in the payloads this reaches, and the
    // under-redaction was silent: nothing in the ledger said a value had been
    // missed.
    //
    // So `swift` is in the vocabulary, and `COURIER_TERMS` below is what protects the
    // courier. The discriminator is the rest of the key, not the token itself: a key
    // naming a delivery business keeps its value, and a key naming a bank loses it.
    'swift',
    'swiftcode',
    'bankswift',
    // `routingnumber` rather than a bare `routing`, for the reason `company` and
    // `shipping` are load-bearing above: a delivery merchant records routing as
    // business data and must keep it. `account` is excluded for the same reason —
    // `accountId` is an ordinary attribution field, which is why the list already
    // scopes to `accountnumber` instead.
    'routingnumber',
    'sortcode',
    'otp',
    'passcode',
    'passphrase',
    'verificationcode',
    // `signature` is the debatable one and is included deliberately. It can be a
    // payment-API signing secret, and per AGENTS.md the preference is "a control
    // with recoverable false positives over one with silent false negatives": a
    // redacted `signatureStatus` is visibly redacted and the merchant can rename
    // the field, whereas a leaked signing key is invisible from the ledger. Both
    // directions of invariant 6 are asserted in the test suite.
    'signature',
];
/**
 * Credential shapes, matched on the value because the key cannot be relied on.
 *
 * Key-name redaction is a convention the merchant's own code follows. It is not
 * a control over an arbitrary third-party response body, and since handlers may
 * return one verbatim, a value that is unmistakably a credential is redacted
 * whatever it is called. `auth` in the vocabulary is the same lesson from the
 * other direction: a credential under an unanticipated name is invisible to a
 * key check alone.
 *
 * Deliberately narrow. `Bearer x`, `Basic x`, and three-dot JWTs, because a
 * loose pattern would redact ordinary business data — and a ledger that
 * redacts everything is a ledger that proves nothing.
 */
function looksLikeCredential(value) {
    if (/^(bearer|basic)\s+\S{8,}$/i.test(value))
        return true;
    // A JWT is three base64url segments. Three segments is not proof, so this is
    // only reached for a value long enough to be a real one.
    return value.length > 40 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);
}
/**
 * Terms that make `swift` a courier rather than a bank code.
 *
 * This is the whole price of putting `swift` in the vocabulary. Swift the
 * transportation company is a real counterparty in a merchant's shipping ledger, and
 * redacting `swiftDelivery` is the same over-redaction as taking out `company` or
 * `shipping`.
 *
 * Deliberately narrow: delivery, courier, carrier, dispatch, tracking, parcel,
 * shipment, logistics, and the carrier's own name. A general "is this a shipping
 * word" check would have been easier and worse — it would exempt
 * `beneficiarySwiftAddress` in a payload that happens to mention a delivery date,
 * trading a silent under-redaction for a tidier rule.
 *
 * The asymmetry is deliberate and follows invariant 6's preference for recoverable
 * false positives: a key carrying *both* a bank term and a courier term is treated
 * as a courier and kept. Over-redacting it is visible and the merchant can rename
 * the field; under-redacting it is invisible, and that is the failure this whole
 * vocabulary exists to prevent.
 */
const COURIER_TERMS = new Set([
    'delivery',
    'deliveries',
    'courier',
    'carrier',
    'carriers',
    'dispatch',
    'tracking',
    'parcel',
    'shipment',
    'shipments',
    'shipping',
    'logistics',
    'freight',
    'transit',
]);
/**
 * Matches on whole key names and on word tokens, never on bare substrings.
 *
 * Substring matching looked like it worked and was quietly destructive: `pan`
 * lives inside "com-pan-y" and `pin` inside "ship-pin-g", so a merchant's
 * `company` and `shipping` fields were both redacted in a ledger built for
 * merchants. Token matching still catches `customerEmail` and `cardToken`,
 * which is the case that actually matters.
 *
 * Separators are stripped before the whole-name comparison, so a compact entry
 * such as `swiftcode` also covers `swift_code` and `swiftCode`. That is why the
 * vocabulary does not carry a `_` twin for every entry: two spellings that
 * normalise to the same string are one control, and listing both invites a
 * later edit that deletes the one that works.
 */
function isSensitiveKey(key) {
    const normalised = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (SENSITIVE.some((s) => normalised === s.replace(/[^a-z0-9]/g, '')))
        return true;
    // Acronym runs stay intact. Splitting before *every* capital shattered an
    // all-caps word into single letters — `SWIFT` became s,w,i,f,t — so the token
    // match silently missed it. Only a bare `SWIFT` was still caught, by the
    // whole-name test above, and that test needs the normalised key to *equal* an
    // entry: `beneficiary_bank_SWIFT` reduces to `beneficiarybankswift` and matched
    // nothing, while `beneficiaryIBAN` and `payerSWIFT` leaked outright. Every
    // payment API writes these fields in caps, so the leak was on the common path,
    // not an edge case. `[A-Z]+(?![a-z])` keeps an acronym together and still
    // splits `swiftDelivery` at the camel boundary.
    const tokens = (key.match(/[A-Z]+(?![a-z])|[A-Z][a-z0-9]*|[a-z0-9]+/g) ?? []).map((t) => t.toLowerCase());
    const sensitive = tokens.filter((t) => SENSITIVE.includes(t));
    if (sensitive.length === 0)
        return false;
    // `swift` is the one entry whose meaning is decided by its neighbours, so it is
    // resolved here rather than in the vocabulary. The exemption requires `swift` to
    // be the *only* sensitive token in the key: a courier key is not sensitive, but
    // `cardTokenSwiftDelivery` carries a card token as well and must not be let
    // through on the strength of the word "delivery". Reading the token list as a
    // conjunct here is what the earlier comment claimed and the code did not do.
    if (sensitive.length === 1 && sensitive[0] === 'swift' && tokens.some((t) => COURIER_TERMS.has(t))) {
        return false;
    }
    return true;
}
//# sourceMappingURL=ledger.js.map
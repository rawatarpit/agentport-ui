import type { Ledger, LedgerEntry, LedgerFilter } from './types.js';
/**
 * Append-only in-memory ledger.
 *
 * Entries are immutable once written and there is no update or delete path by
 * design: an audit trail that can be edited is not an audit trail. Swap in a
 * durable implementation via the Ledger interface when you need one.
 */
export declare class InMemoryLedger implements Ledger {
    private readonly entries;
    private readonly cap;
    constructor(options?: {
        maxEntries?: number;
    });
    append(entry: LedgerEntry): Promise<void>;
    list(filter?: LedgerFilter): Promise<LedgerEntry[]>;
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
export declare const UNVERSIONED_CONFIG = "unconfigured";
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
export declare function stableStringify(value: unknown, depth?: number): string;
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
export declare function sha256Hex(text: string): Promise<string>;
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
export declare function fnv1a64Hex(text: string): string;
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
export declare function computeRowDigest(entry: LedgerEntry, tenantId: string): string;
/**
 * Removes anything that must never reach a durable store.
 *
 * Redaction is not optional. A ledger is read by people who did not make the
 * request, so it is the last place raw PII, credentials or card data should
 * appear.
 */
export declare function redact(input: unknown, depth?: number): Record<string, unknown>;
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
export declare function scrubFreeText(value: string): string;
//# sourceMappingURL=ledger.d.ts.map
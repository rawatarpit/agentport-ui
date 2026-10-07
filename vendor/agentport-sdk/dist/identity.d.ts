/**
 * Local credential issuing and verification.
 *
 * The trust rule is that an agent is never trusted for being an agent: trust
 * comes from a credential the business issued, with named scopes, that expires.
 * A `User-Agent` header is not that, and neither is the presence of a token.
 *
 * Tokens are HMAC-signed over their own claims and signed with a secret the
 * merchant holds in their environment. There is no server to call, because the
 * merchant's machine is the whole trust boundary — which also means there is no
 * signing service for us to run, and no dependency to add.
 *
 * Deliberately unsigned-by-default: a token whose signature does not verify is
 * refused rather than downgraded, and an unreadable expiry is treated as no
 * credential. Both are the same fail-closed rule the SDK applies everywhere.
 *
 * The HMAC comes from `globalThis.crypto.subtle` and not from `node:crypto`, so
 * that a signature made on a merchant's Node process can be checked in a
 * runtime with no Node builtins at all — a Worker, a browser extension, an
 * edge function. That is a packaging claim the rest of the module graph has to
 * earn, and this module used to be the reason it could not be made. The cost is
 * that `sign` and `verify` are Promises, so `issueToken` and `verifyToken` are
 * too; a missing `await` at a call site is a caller that believes it holds a
 * credential and holds a Promise instead, which is the one failure shape a
 * type checker cannot be relied on to catch at a call site it did not write.
 *
 * The token format is byte-for-byte what it was: base64url(claims) + '.' +
 * base64url(HMAC-SHA256(secret, claims)), and `cred_` + 12 hex characters for
 * the default credential id. Nothing about the wire format moved, because
 * credentials have already been issued to a pilot merchant and a signature
 * they cannot verify is a credential that silently stops working. `subtle.sign`
 * and `createHmac(...).digest()` compute the same HMAC over the same bytes, and
 * the regression test in `test/architecture.test.ts` pins a token minted by the
 * old `node:crypto` code so that stays true rather than being assumed.
 */
/** Re-exported rather than redeclared. This file used to carry its own copy of
 * `AgentIdentity`, used nowhere and not exported from the entry point — a third
 * version of the same type alongside the one in `types.ts` and the one above.
 * It had already diverged by missing `onBehalfOf`, which is exactly how a field
 * ends up written by one path and unreadable by another. Keeping the name
 * resolves any deep import to the canonical declaration instead of a copy that
 * can drift again.
 */
import type { UserDelegation } from './types.js';
export type { AgentIdentity, UserDelegation } from './types.js';
export interface IssuedToken {
    token: string;
    expiresAt: string;
}
/**
 * Mints a token for an agent. Run by the merchant's own tooling, or by the
 * binary's `token` command — never by us.
 */
export declare function issueToken(options: {
    agentId: string;
    scopes: string[];
    ttlMs?: number;
    credentialId?: string;
    /**
     * The user's consent, when the agent acts for one.
     *
     * Signed, and that is the whole point. Held as a free-floating object on
     * `AgentIdentity` this would be an assertion the caller makes about itself —
     * the same weakness `assurance` has — and it fails *open* on absence, so
     * anyone who can influence how an identity is built needs only to drop the
     * field rather than forge it. Inside the signed payload, removing the claim
     * invalidates the signature. It is therefore omitted entirely when absent,
     * so a token minted without one is byte-identical to before.
     */
    onBehalfOf?: UserDelegation;
}, secret: string, now?: Date): Promise<IssuedToken>;
export interface VerifiedAgent {
    agentId: string;
    assurance: 'verified' | 'unverified';
    scopes: string[];
    /**
     * The signed consent this agent holds, when it acts for a user.
     *
     * Optional, and its absence is not a permission: it means the token carried
     * no delegation claim, which is the ordinary case for an agent the merchant
     * scoped directly. What matters is that it arrives from *inside the signed
     * payload*, so an agent cannot drop the claim to escape the ceiling in
     * `delegationDenial` — removing it invalidates the signature, which is the
     * whole difference between this and a caller-asserted field.
     */
    onBehalfOf?: UserDelegation;
    credentialId: string;
    issuedAt: string;
    expiresAt: string;
    /**
     * Why a credential was refused, for the merchant's own log.
     *
     * It was passed to every branch of this function and then dropped, which read
     * as though the reason were recorded somewhere. It was not. It belongs to the
     * operator, never to the caller: a response saying "your signature was
     * malformed" tells an attacker which part of their forgery was wrong.
     */
    reason?: string;
}
/**
 * Verifies a bearer token.
 *
 * Every failure path returns an *unverified* identity with no scopes and an
 * already-passed expiry, rather than throwing. That shape is deliberate: the
 * port then refuses the request through the normal denial path, so a bad
 * credential produces a recorded, specific refusal instead of an unhandled
 * error on a public endpoint. It also cannot be escalated by editing the
 * claims, because `assurance` is only ever `verified` after the signature
 * compares equal.
 */
export declare function verifyToken(authorization: string | undefined, secret: string, now?: Date): Promise<VerifiedAgent>;
//# sourceMappingURL=identity.d.ts.map
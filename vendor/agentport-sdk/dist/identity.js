const SEP = '.';
const encoder = new TextEncoder();
const decoder = new TextDecoder();
/**
 * SHA-256's HMAC block size. WebCrypto rejects a zero-length raw key with a
 * `DataError`, where `createHmac('sha256', '')` quietly padded one. HMAC pads
 * any key shorter than the block with zeros, so an empty secret and a 64-byte
 * zero secret are the same key — and substituting the second for the first is
 * what keeps an unset `AGENTPORT_SIGNING_SECRET` a refusal rather than a throw
 * out of a function that promises never to throw.
 */
const SHA256_BLOCK_BYTES = 64;
function b64urlEncode(bytes) {
    // Built a character at a time rather than with `String.fromCharCode(...bytes)`:
    // the spread is an argument list, and this is the kind of helper that gets
    // pointed at a buffer an order of magnitude larger than the MAC.
    let binary = '';
    for (let i = 0; i < bytes.length; i++)
        binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
/** Throws on a string that is not base64url; every caller turns that into a refusal. */
function b64urlDecode(text) {
    const standard = text.replace(/-/g, '+').replace(/_/g, '/');
    const padded = standard.padEnd(standard.length + ((4 - (standard.length % 4)) % 4), '=');
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++)
        bytes[i] = binary.charCodeAt(i);
    return bytes;
}
/**
 * The merchant's signing secret as a WebCrypto key.
 *
 * Not cached. A memo keyed on the secret would be the signing key sitting in a
 * process-wide Map for the life of the process, and the cost of the import is
 * one HMAC key schedule on a path that is already doing a body read.
 */
async function signingKey(secret) {
    const material = encoder.encode(secret);
    return globalThis.crypto.subtle.importKey('raw', material.length === 0 ? new Uint8Array(SHA256_BLOCK_BYTES) : material, { name: 'HMAC', hash: 'SHA-256' }, 
    // Not extractable: this is the merchant's signing secret in key form and
    // nothing in the SDK has a reason to read the bits back out.
    false, ['sign', 'verify']);
}
async function sign(payload, key) {
    const mac = new Uint8Array(await globalThis.crypto.subtle.sign('HMAC', key, encoder.encode(payload)));
    return b64urlEncode(mac);
}
/**
 * Mints a token for an agent. Run by the merchant's own tooling, or by the
 * binary's `token` command — never by us.
 */
export async function issueToken(options, secret, now = new Date()) {
    const expiresAt = new Date(now.getTime() + (options.ttlMs ?? 3_600_000)).toISOString();
    const claims = b64urlEncode(encoder.encode(JSON.stringify({
        agentId: options.agentId,
        scopes: options.scopes,
        credentialId: options.credentialId ?? newCredentialId(),
        issuedAt: now.toISOString(),
        expiresAt,
        ...(options.onBehalfOf ? { onBehalfOf: options.onBehalfOf } : {}),
    })));
    const signature = await sign(claims, await signingKey(secret));
    return { token: `${claims}${SEP}${signature}`, expiresAt };
}
/**
 * Reads the signed delegation claim, or `undefined` when there was none.
 *
 * A claim that is *present but malformed* fails closed by throwing, because
 * `verifyToken` turns that into `unverified` — the same treatment this function
 * already gives a bad signature or an unreadable expiry. An agent whose consent
 * cannot be read is not an agent acting with consent, and quietly dropping the
 * claim would authorise the write it was supposed to constrain.
 */
function readDelegation(parsed) {
    const raw = parsed.onBehalfOf;
    if (raw === undefined || raw === null)
        return undefined;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw new Error('malformed delegation');
    const claim = raw;
    const scope = claim.scope;
    if (scope !== 'read' && scope !== 'write' && scope !== 'full')
        throw new Error('unknown delegation scope');
    const userId = claim.userId;
    if (typeof userId !== 'string' || userId === '')
        throw new Error('malformed delegation user');
    const grantedAt = claim.grantedAt;
    if (typeof grantedAt !== 'string' || !Number.isFinite(Date.parse(grantedAt))) {
        throw new Error('malformed delegation timestamp');
    }
    // A narrowing copy rather than the parsed object, so no extra field from the
    // token — `grantedAt` is spelled by the interface and nothing else — survives
    // into the identity the policy engine reads.
    return { userId, scope, grantedAt };
}
/** `cred_` plus 12 hex characters, unchanged, from the same Web Crypto global as the MAC. */
function newCredentialId() {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(6));
    let hex = '';
    for (let i = 0; i < bytes.length; i++)
        hex += bytes[i].toString(16).padStart(2, '0');
    return `cred_${hex}`;
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
export async function verifyToken(authorization, secret, now = new Date()) {
    const unverified = (reason) => ({
        reason,
        agentId: 'unidentified',
        assurance: 'unverified',
        scopes: [],
        credentialId: 'none',
        issuedAt: now.toISOString(),
        // Already expired, so the port's own expiry check refuses it and the
        // refusal names the credential rather than the request.
        expiresAt: '1970-01-01T00:00:00.000Z',
    });
    if (!authorization)
        return unverified('no token');
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : authorization.trim();
    const parts = token.split(SEP);
    if (parts.length !== 2)
        return unverified('malformed');
    const [claims, signature] = parts;
    // `atob` throws on a string that is not base64url where `Buffer.from(x,
    // 'base64url')` was merely lenient. A token that cannot be decoded cannot
    // have been signed by anyone, so it is the same refusal, and the promise
    // that this function does not throw survives the change of decoder.
    let presented;
    try {
        presented = b64urlDecode(signature);
    }
    catch {
        return unverified('bad signature');
    }
    // `subtle.verify` rather than computing the expected MAC and comparing it
    // here. It makes the length decision internally and hands back a boolean, so
    // no length or prefix branch survives into code a caller can measure — and it
    // removes a defect the previous comparison had, which checked the *string*
    // length and then handed `timingSafeEqual` the *bytes*: a 43-character
    // signature containing one multi-byte character passed the guard and threw
    // ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH out of a function documented never to
    // throw. On an unauthenticated endpoint that is a 500 instead of a 403, and
    // the throw landed before the refusal was recorded, so the probe left no
    // ledger row at all.
    const valid = await globalThis.crypto.subtle.verify('HMAC', await signingKey(secret), presented, encoder.encode(claims));
    if (!valid)
        return unverified('bad signature');
    let parsed;
    try {
        parsed = JSON.parse(decoder.decode(b64urlDecode(claims)));
    }
    catch {
        return unverified('unreadable claims');
    }
    // The same fail-closed rule as the SDK's own expiry handling: an unparseable
    // timestamp is not a current credential. `new Date(x).getTime() <= now` is
    // false for NaN, so a truncated timestamp would otherwise never expire.
    // `JSON.parse('null')` is `null`, and `typeof null === 'object'`, so a signed
    // null payload reached the property read and threw — breaking the documented
    // promise that every failure path returns an unverified identity.
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        return unverified('unreadable claims');
    const expiresAt = typeof parsed.expiresAt === 'string' ? parsed.expiresAt : '';
    const at = Date.parse(expiresAt);
    if (!Number.isFinite(at))
        return unverified('unreadable expiry');
    if (at <= now.getTime())
        return unverified('expired');
    // Read before the identity is assembled, so a delegation the policy engine
    // later relies on is either validated here or never reaches it.
    let onBehalfOf;
    try {
        onBehalfOf = readDelegation(parsed);
    }
    catch {
        return unverified('bad delegation');
    }
    return {
        agentId: String(parsed.agentId ?? ''),
        assurance: 'verified',
        scopes: Array.isArray(parsed.scopes) ? parsed.scopes.map(String) : [],
        credentialId: String(parsed.credentialId ?? 'unknown'),
        issuedAt: String(parsed.issuedAt ?? ''),
        expiresAt,
        ...(onBehalfOf ? { onBehalfOf } : {}),
    };
}
//# sourceMappingURL=identity.js.map
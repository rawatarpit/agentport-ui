/**
 * Normalise a merchant website URL or refuse it with a reason.
 *
 * Pure and runtime-free: `/api/me` owns the write, but every caller that
 * needs the same refusal uses this one rule. Keeping it out of `lib/store`
 * matters because `store` is a test-only RAM fallback; a route importing it
 * for one string helper would drag the whole demo surface back into runtime.
 */
export function normaliseWebsiteUrl(v: unknown): { ok: true; url: string } | { ok: false; reason: string } {
  if (typeof v !== 'string' || v.trim().length === 0) {
    return { ok: false, reason: 'Give the public https:// address of your website.' }
  }
  let u: URL
  try {
    u = new URL(v.trim())
  } catch {
    return { ok: false, reason: 'That is not a URL — it needs a scheme and a host, e.g. https://shop.example.' }
  }
  if (u.protocol !== 'https:' && u.hostname !== 'localhost') {
    return { ok: false, reason: 'The runtime endpoint must be https:// (localhost allowed for development only).' }
  }
  return { ok: true, url: u.toString().replace(/\/$/, '') }
}

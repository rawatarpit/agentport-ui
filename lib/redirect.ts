/**
 * Same-origin redirects only.
 *
 * `next` arrives in a URL, so it is attacker-controlled. Accept a path that
 * begins with exactly one slash and cannot escape the origin through the
 * parser tricks browsers normalise: protocol-relative `//host`, backslashes
 * (`\\host` and `/%5c%5chost`), and encoded separators (`/%2f%2fhost`). A
 * decoded value that starts with `//` or a backslash is refused; anything
 * that is not a relative path falls back to the caller's safe landing page.
 */

export const DEFAULT_NEXT_PATH = '/home'

export function sanitizeNextPath(raw: unknown, fallback = DEFAULT_NEXT_PATH): string {
  if (typeof raw !== 'string') return fallback
  const value = raw.trim()
  if (value.length === 0 || value.length > 2048) return fallback
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return fallback

  // Decode until stable (bounded) so `%2f`/`%5c` cannot hide a separator from
  // the checks below. A malformed escape is not a path we can reason about.
  let decoded = value
  for (let i = 0; i < 3; i += 1) {
    let next: string
    try {
      next = decodeURIComponent(decoded)
    } catch {
      return fallback
    }
    if (next === decoded) break
    decoded = next
  }

  if (/[\u0000-\u001f\u007f\\]/.test(decoded)) return fallback
  if (!decoded.startsWith('/')) return fallback
  if (decoded.startsWith('//')) return fallback
  if (decoded.charAt(1) === '/' || decoded.charAt(1) === '\\') return fallback

  return value
}

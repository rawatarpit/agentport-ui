/**
 * Path rules for anything the installer commits.
 *
 * The PR is generated server-side from merchant-owned repo metadata, but the
 * paths still cross a trust boundary: a tree entry or a future caller must not
 * be able to make the App write outside the repository. Keep this pure and
 * shared by the GitHub client and the package builder.
 */
export function isSafeRepoPath(path: string): boolean {
  if (typeof path !== 'string') return false
  if (path.length === 0 || path.length > 240) return false
  if (path.startsWith('/') || path.endsWith('/')) return false
  if (path.includes('\\') || path.includes('\0')) return false
  const segments = path.split('/')
  if (segments.some((s) => s.length === 0 || s === '.' || s === '..')) return false
  if (segments[0] === '.git') return false
  return true
}

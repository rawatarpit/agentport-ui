/**
 * Canonical bytes for a merchant-signed artifact.
 *
 * This is a deliberate copy of `stableStringify` from the SDK
 * (`agentport-sdk/src/agent.ts`). The SDK remains the author of the format;
 * this file must not grow a second one. It lives outside `lib/publish.ts`
 * because the browser signs the same bytes the server verifies, and importing
 * the verifier would drag `node:crypto` into the client bundle.
 *
 * Bump rules: if the SDK changes this function, this copy changes in the same
 * commit and the cross-package vector test in `lib/publish.test.ts` identifies
 * which one moved.
 */
export function stableStringify(value: unknown, depth = 0): string {
  if (depth > 8) return '"[truncated]"'
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v, depth + 1)).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v, depth + 1)}`)
  return `{${entries.join(',')}}`
}

export type SignedArtifact = {
  tenantId: string
  version: number
  policy: Record<string, unknown>
  capabilities: Array<{ name: string; hiddenFields?: string[]; [key: string]: unknown }>
  baseUrl?: string
  publicBaseUrl?: string
}

export function canonicalArtifactBytes(artifact: SignedArtifact): string {
  const fields: Record<string, unknown> = {
    tenantId: artifact.tenantId,
    version: artifact.version,
    policy: artifact.policy,
    capabilities: artifact.capabilities,
  }
  // Absent keys stay absent so v1 artifacts keep their original bytes.
  if (artifact.baseUrl !== undefined) fields.baseUrl = artifact.baseUrl
  if (artifact.publicBaseUrl !== undefined) fields.publicBaseUrl = artifact.publicBaseUrl
  return stableStringify(fields)
}

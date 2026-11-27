import type { AppliedConfigState } from '@/lib/publish-state'
import type { CheckResult } from '@/components/discovery-check'
import type { EngineBackendStatus } from '@/lib/intelligence/engine-contract'
import type { IntelligenceState } from '@/lib/intelligence/state-meta'

export type AppliedProof =
  | { state: 'unknown' }
  | { state: 'none' }
  | { state: 'live'; version: number; publishedAt: string }

export type ServedProof =
  | { status: 'unchecked' }
  | { status: 'error'; reason: string; httpStatus: number | null }
  | {
      status: 'ok'
      httpStatus: number
      version: string | null
      tenantId: string
      capabilityCount: number | null
      generatedAt: string | null
    }

export type ProofVerdict = { kind: 'unknown' | 'not-comparable' | 'different' | 'same'; reason: string }

/** Strip policy before it crosses into a client component. */
export function appliedProofFromConfig(config: AppliedConfigState): AppliedProof {
  if (config.state === 'live') {
    return { state: 'live', version: config.version, publishedAt: config.publishedAt }
  }
  return { state: config.state }
}

export function servedProofFromCheckResult(result: CheckResult | null, expectedTenantId: string): ServedProof {
  if (result === null) return { status: 'unchecked' }
  if (result.status === 'error') {
    return { status: 'error', reason: result.reason, httpStatus: result.httpStatus }
  }
  const manifest =
    typeof result.manifest === 'object' && result.manifest !== null
      ? (result.manifest as Record<string, unknown>)
      : null
  if (manifest?.tenantId !== expectedTenantId) {
    return {
      status: 'error',
      reason: 'The served manifest did not prove this workspace. Nothing is served for this tenant.',
      httpStatus: result.httpStatus,
    }
  }
  const capabilities = Array.isArray(manifest.capabilities) ? manifest.capabilities.length : null
  const capabilityCount = Array.isArray(manifest.capabilityCount)
    ? null
    : typeof manifest.capabilityCount === 'number'
      ? manifest.capabilityCount
      : capabilities
  return {
    status: 'ok',
    httpStatus: result.httpStatus,
    version: typeof manifest.version === 'string' ? manifest.version : null,
    tenantId: expectedTenantId,
    capabilityCount,
    generatedAt: typeof manifest.generatedAt === 'string' ? manifest.generatedAt : null,
  }
}

function verdict(kind: ProofVerdict['kind'], reason: string): ProofVerdict {
  return { kind, reason }
}

/** Applied config and served manifest are separate facts; only numeric versions compare. */
export function compareAppliedAndServed(applied: AppliedProof, served: ServedProof): ProofVerdict {
  if (applied.state === 'unknown') return verdict('unknown', 'The applied config could not be read. Unknown, not none.')
  if (served.status === 'unchecked') return verdict('unknown', 'The served manifest has not been checked.')
  if (served.status === 'error') return verdict('unknown', served.reason)
  if (applied.state === 'none') {
    return verdict('different', 'No config is applied for this workspace, but the governor answered a manifest.')
  }
  if (!/^\d+$/.test(served.version ?? '')) {
    return { kind: 'not-comparable', reason: 'The served version label is not comparable to an applied version.' }
  }
  const servedVersion = Number(served.version)
  if (servedVersion === applied.version) {
    return verdict('same', 'The served version label equals the applied version. This is a point-in-time observation, not proof a capability ran.')
  }
  return verdict('different', 'The served version label differs from the applied version.')
}

/** Only the ledger's `result` can speak about execution; a decision never can. */
export function outcomeFromDecision(row: { decision: string; result?: string | null }): 'executed' | 'failed' | 'unknown' {
  if (row.result === 'ok') return 'executed'
  if (row.result === 'error') return 'failed'
  return 'unknown'
}

/** Only reviewed statuses may become a rendered state. `ready` is deliberately absent. */
export function engineProofState(status: { status: unknown }): IntelligenceState | null {
  if (status.status === 'not_configured' || status.status === 'unavailable') {
    return status.status satisfies EngineBackendStatus
  }
  return null
}

export function formatProofTime(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return 'unknown'
  return `${new Date(value).toISOString().replace('T', ' ').slice(0, 16)} UTC`
}

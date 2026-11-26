/**
 * Typed skeleton for a future external Intelligence Engine.
 *
 * Console-only: this defines the contract the UI can read, but no live Engine
 * is connected here. Unknown stays unknown; no fixtures, no raw upstream JSON.
 */

import type { Confidence, Provenance, ReportDataMode, ReportSection, ResearchProfile, ResearchSource } from './types'

export type EngineRunState = 'unresearched' | 'illustrative' | 'sourced' | 'unavailable' | 'not_configured' | 'partial' | 'failed'

/**
 * Authoritative hosted job states. Contract vocabulary only: no console route,
 * progress bar, or rendered status uses these yet. A queued or running job is
 * not a completed report.
 */
export const ENGINE_JOB_STATES = ['queued', 'claimed', 'running', 'completed', 'failed', 'exhausted'] as const
export type EngineJobState = (typeof ENGINE_JOB_STATES)[number]

export function isEngineJobCompleted(state: EngineJobState): boolean {
  return state === 'completed'
}

export type EngineBackendStatus = 'unavailable' | 'not_configured' | 'ready'

export type EngineClaim = {
  id: string
  claim: string
  provenance: Provenance
  confidence: Confidence
  sourceIds: string[]
  tenantId: string | null
  shared: boolean
  note: string | null
}

export type EngineSource = ResearchSource & {
  provenance: Provenance
  confidence: Confidence
  tenantId: string | null
  shared: boolean
}

export type EngineSection = ReportSection & {
  state: EngineRunState
  claims: EngineClaim[]
}

export type EngineReportEnvelope = {
  status: 'ok'
  state: Exclude<EngineRunState, 'unavailable' | 'not_configured' | 'failed'>
  profile: ResearchProfile
  sections: EngineSection[]
  sources: EngineSource[]
  generatedAt: string
  dataMode: ReportDataMode
}

export type EngineUnavailable = {
  status: 'unavailable'
  reason: 'not_configured' | 'not_contacted' | 'upstream_unavailable'
  checkedAt: string
  message: string
}

export type EngineResult = EngineReportEnvelope | EngineUnavailable

export type EngineStatus = {
  status: EngineBackendStatus
  reason: 'not_configured' | 'not_contacted' | 'ready' | 'upstream_unavailable'
  checkedAt: string
  message: string
}

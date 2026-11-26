import 'server-only'

import type { EngineStatus, EngineUnavailable } from './engine-contract'

const UNAVAILABLE_MESSAGE = 'No intelligence engine is connected. Results remain unknown.'

function nowIso(): string {
  return new Date().toISOString()
}

function engineConfigured(): boolean {
  const baseUrl = process.env.INTELLIGENCE_ENGINE_URL ?? process.env.AGENTPORT_INTELLIGENCE_ENGINE_URL
  return typeof baseUrl === 'string' && baseUrl.trim().length > 0
}

export function getIntelligenceEngineStatus(): EngineStatus {
  if (!engineConfigured()) {
    return {
      status: 'not_configured',
      reason: 'not_configured',
      checkedAt: nowIso(),
      message: UNAVAILABLE_MESSAGE,
    }
  }
  return {
    status: 'unavailable',
    reason: 'not_contacted',
    checkedAt: nowIso(),
    message: 'The intelligence engine is configured, but this console does not issue engine requests. Results remain unknown.',
  }
}

export async function requestIntelligenceEngine(): Promise<EngineUnavailable> {
  const status = getIntelligenceEngineStatus()
  return {
    status: 'unavailable',
    reason: status.reason === 'not_configured' ? 'not_configured' : 'not_contacted',
    checkedAt: status.checkedAt,
    message: status.message,
  }
}

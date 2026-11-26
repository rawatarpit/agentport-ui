import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
vi.mock('server-only', () => ({}))

import { getIntelligenceEngineStatus, requestIntelligenceEngine } from './engine-client'

const here = dirname(fileURLToPath(import.meta.url))
const client = readFileSync(join(here, 'engine-client.ts'), 'utf8')
const contract = readFileSync(join(here, 'engine-contract.ts'), 'utf8')

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('intelligence engine skeleton', () => {
  it('reports not_configured when no engine URL is set', () => {
    vi.stubEnv('INTELLIGENCE_ENGINE_URL', '')
    vi.stubEnv('AGENTPORT_INTELLIGENCE_ENGINE_URL', '')
    const status = getIntelligenceEngineStatus()
    expect(status.status).toBe('not_configured')
    expect(status.reason).toBe('not_configured')
    expect(status.message).toContain('Results remain unknown.')
    expect(status.checkedAt).toMatch(/^\d{4}-\d\d-\d\dT/)
  })

  it('reports not_contacted — never ready — when a URL is configured', () => {
    vi.stubEnv('INTELLIGENCE_ENGINE_URL', 'https://engine.internal')
    vi.stubEnv('AGENTPORT_INTELLIGENCE_ENGINE_URL', '')
    const status = getIntelligenceEngineStatus()
    expect(status.status).toBe('unavailable')
    expect(status.reason).toBe('not_contacted')
    expect(status.message).toContain('does not issue engine requests')
    expect(status).not.toMatchObject({ status: 'ready' })
  })

  it('returns only the unavailable shape without echoing the engine URL or secrets', async () => {
    vi.stubEnv('INTELLIGENCE_ENGINE_URL', 'https://engine.internal/?token=super-secret')
    vi.stubEnv('INTELLIGENCE_ENGINE_KEY', 'engine-key-value')
    const result = await requestIntelligenceEngine()
    expect(Object.keys(result).sort()).toEqual(['checkedAt', 'message', 'reason', 'status'])
    expect(result.status).toBe('unavailable')
    expect(result.reason).toBe('not_contacted')
    const body = JSON.stringify(result)
    for (const leak of ['engine.internal', 'super-secret', 'INTELLIGENCE_ENGINE_KEY', 'engine-key-value']) {
      expect(body).not.toContain(leak)
    }
  })

  it('never reads a credential from the environment', () => {
    expect(client).not.toMatch(/process\.env\.[A-Z_]*(KEY|TOKEN|SECRET|CREDENTIAL)/)
    expect(client).toContain('INTELLIGENCE_ENGINE_URL')
  })

  it('contains no fixtures, invented claims or ok report envelope in the runtime path', () => {
    for (const src of [client, contract]) {
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      expect(code).not.toMatch(/buildSampleReport|lib\/intelligence\/sample|fixture|sample report/i)
    }
    expect(client).not.toMatch(/status:\s*'ok'|dataMode:\s*'sourced'|sections:\s*\[/)
  })
})

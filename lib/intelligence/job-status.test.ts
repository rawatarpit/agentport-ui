import { describe, expect, it } from 'vitest'
import { ENGINE_JOB_STATES, isEngineJobCompleted } from './engine-contract'

describe('hosted intelligence job vocabulary is contract-only', () => {
  it('uses exactly the authoritative hosted states', () => {
    expect([...ENGINE_JOB_STATES]).toEqual([
      'queued',
      'claimed',
      'running',
      'completed',
      'failed',
      'exhausted',
    ])
  })

  it('treats only completed as a completed job', () => {
    for (const state of ENGINE_JOB_STATES) {
      expect(isEngineJobCompleted(state)).toBe(state === 'completed')
    }
  })

  it('never lets an accepted job read as a finished report', () => {
    expect(isEngineJobCompleted('queued')).toBe(false)
    expect(isEngineJobCompleted('claimed')).toBe(false)
    expect(isEngineJobCompleted('running')).toBe(false)
    expect(isEngineJobCompleted('failed')).toBe(false)
    expect(isEngineJobCompleted('exhausted')).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { buildPilotMetrics } from '@/lib/pilot-metrics'

const NOW = Date.parse('2026-10-16T12:00:00Z')

describe('buildPilotMetrics', () => {
  it('reports all-unknown for a fresh tenant — never zeros', () => {
    const m = buildPilotMetrics({ tenantCreatedAt: '2026-10-16T10:00:00Z', installs: [], prs: [], lastPushAt: null, nowMs: NOW })
    expect(m.installedAt).toBeNull()
    expect(m.firstPrAt).toBeNull()
    expect(m.firstProofAt).toBeNull()
    expect(m.staleHours).toBeNull()
    expect(m.tenantCreatedAt).toBe('2026-10-16T10:00:00Z')
  })
  it('picks oldest-first across installs and PRs', () => {
    const m = buildPilotMetrics({
      tenantCreatedAt: '2026-10-01T00:00:00Z',
      installs: [
        { installationId: 2, accountLogin: 'b', receivedAt: '2026-10-03T00:00:00Z' },
        { installationId: 1, accountLogin: 'a', receivedAt: '2026-10-02T00:00:00Z' },
      ],
      prs: [{ repo: 'a/b', number: 7, url: 'https://x/7', recordedAt: '2026-10-04T00:00:00Z' }],
      lastPushAt: '2026-10-16T10:00:00Z',
      nowMs: NOW,
    })
    expect(m.installedAt).toBe('2026-10-02T00:00:00Z')
    expect(m.firstPrAt).toBe('2026-10-04T00:00:00Z')
    expect(m.firstProofAt).toBe('2026-10-16T10:00:00Z')
    expect(m.staleHours).toBeCloseTo(2, 5)
  })
  it('never reports negative staleness for a future-dated push', () => {
    const m = buildPilotMetrics({
      tenantCreatedAt: null,
      installs: [],
      prs: [],
      lastPushAt: '2026-10-16T13:00:00Z',
      nowMs: NOW,
    })
    expect(m.staleHours).toBe(0)
  })
})

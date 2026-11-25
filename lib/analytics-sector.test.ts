import { describe, expect, it } from 'vitest'
import { MIN_SECTOR_COHORT, sectorPercentileBand } from './analytics-sector'

describe('sector benchmark disclosure', () => {
  it('does not expose a band for a small cohort', () => {
    expect(sectorPercentileBand(5, [1, 2])).toBeNull()
    expect(sectorPercentileBand(5, Array(MIN_SECTOR_COHORT - 1).fill(1))).toBeNull()
  })

  it('does not expose a band without the caller’s own count', () => {
    expect(sectorPercentileBand(null, Array(MIN_SECTOR_COHORT).fill(1))).toBeNull()
  })

  it('returns only a coarse band for a large cohort', () => {
    const counts = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    expect(sectorPercentileBand(10, counts)).toBe('top 25%')
    expect(sectorPercentileBand(6, counts)).toBe('top half')
    expect(sectorPercentileBand(4, counts)).toBe('lower half')
    expect(sectorPercentileBand(1, counts)).toBe('bottom 25%')
  })
})

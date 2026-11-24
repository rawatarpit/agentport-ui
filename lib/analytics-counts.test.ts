import { describe, expect, it } from 'vitest'
import { sumNullableCounts } from './analytics-counts'

describe('sumNullableCounts', () => {
  it('returns null for an empty window — no rows is not a zero', () => {
    expect(sumNullableCounts([])).toBeNull()
  })

  it('sums a fully observed window', () => {
    expect(sumNullableCounts([3, 0, 7])).toBe(10)
  })

  it('returns null for an all-null window', () => {
    expect(sumNullableCounts([null, null, null])).toBeNull()
  })

  it('returns null when any contributing value is unknown', () => {
    expect(sumNullableCounts([3, null, 7])).toBeNull()
  })

  it('refuses non-finite values instead of coercing them to zero', () => {
    expect(sumNullableCounts([3, Number.NaN])).toBeNull()
    expect(sumNullableCounts([Number.POSITIVE_INFINITY, 1])).toBeNull()
  })
})

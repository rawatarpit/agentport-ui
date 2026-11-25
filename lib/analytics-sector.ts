/**
 * Sector benchmarks are aggregates over a cross-tenant service-role read.
 *
 * The read is only safe if the cohort is coarse: exact medians, exact cohort
 * sizes and caller-controlled sector strings let one merchant engineer a
 * two-tenant cohort and solve for another tenant's count. This module keeps the
 * threshold and the banding in one place so the route cannot quietly widen the
 * disclosure again.
 */
export const MIN_SECTOR_COHORT = 10

export type SectorPercentileBand = 'top 25%' | 'top half' | 'lower half' | 'bottom 25%'

/**
 * A coarse band, never an exact percentile. `null` means unknown — not a
 * healthy middle band — when the cohort is too small or the caller has no
 * event count of its own.
 */
export function sectorPercentileBand(myEvents: number | null, counts: number[]): SectorPercentileBand | null {
  if (myEvents === null || !Number.isFinite(myEvents) || counts.length < MIN_SECTOR_COHORT) return null
  const belowOrEqual = counts.filter((c) => c <= myEvents).length
  const percentile = (belowOrEqual / counts.length) * 100
  if (percentile >= 75) return 'top 25%'
  if (percentile >= 50) return 'top half'
  if (percentile >= 25) return 'lower half'
  return 'bottom 25%'
}

/**
 * An absent count is not a zero. An aggregate over a window stays null until
 * every contributing value is a finite number, so a partial or unreadable
 * window can never be rendered as a healthy total.
 */
export function sumNullableCounts(values: Array<number | null>): number | null {
  if (values.length === 0) return null
  let total = 0
  for (const value of values) {
    if (value === null || !Number.isFinite(value)) return null
    total += value
  }
  return total
}

/**
 * Pilot metrics from rows, never from inference.
 *
 * The plan's metrics (time-to-first-proof, installs reaching merged PR,
 * stale/unknown hours) are answered here per caller tenant. Every field is
 * either a timestamp taken from a stored row or null with a label — a
 * metric the rows cannot prove renders as unknown, not as zero. Zero
 * installs is a fact (rows exist, none match); unknown push recency is an
 * absence (no row says anything).
 */

export type PilotPr = { repo: string; number: number; url: string; recordedAt: string }

export type PilotMetrics = {
  tenantCreatedAt: string | null
  /** First recorded install, or null when the App was never linked. */
  installedAt: string | null
  installs: Array<{ installationId: number; accountLogin: string; receivedAt: string }>
  /** First recorded install PR, or null when none opened. Merge state is read live at PR time, not stored. */
  firstPrAt: string | null
  prs: PilotPr[]
  /** First proof-stream evidence (runtime push recency), or null until a push lands. */
  firstProofAt: string | null
  /** Hours since the last push, or null when no push ever landed (unknown, not zero). */
  staleHours: number | null
}

export function buildPilotMetrics(input: {
  tenantCreatedAt: string | null
  installs: Array<{ installationId: number; accountLogin: string; receivedAt: string }>
  prs: PilotPr[]
  lastPushAt: string | null
  nowMs?: number
}): PilotMetrics {
  const oldest = (xs: string[]): string | null =>
    xs.length === 0 ? null : xs.reduce((a, b) => (a < b ? a : b))
  const nowMs = input.nowMs ?? Date.now()
  const staleHours =
    input.lastPushAt === null ? null : Math.max(0, (nowMs - Date.parse(input.lastPushAt)) / 3_600_000)
  return {
    tenantCreatedAt: input.tenantCreatedAt,
    installedAt: oldest(input.installs.map((i) => i.receivedAt)),
    installs: input.installs,
    firstPrAt: oldest(input.prs.map((p) => p.recordedAt)),
    prs: input.prs,
    firstProofAt: input.lastPushAt,
    staleHours,
  }
}

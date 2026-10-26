import type { LedgerEntry } from '@/lib/contracts'

/**
 * Pure hold projection for the approvals screen.
 *
 * A hosted approval writes a second ledger row whose `heldRequestId` names the
 * request it committed. The queue is therefore "require_approval rows with no
 * commit naming them", not "every require_approval row" — the latter would keep
 * showing a hold after a human had already decided it.
 *
 * Expired holds stay listed with the marker. Filtering them would report
 * "nothing waiting" while the ledger still carries an unexecuted hold; a silent
 * queue is worse than a stale one.
 */
export function holdsFromRows(
  rows: LedgerEntry[],
  now = Date.now(),
): Array<LedgerEntry & { expiredHold: boolean }> {
  const committed = new Set(
    rows.map((e) => e.heldRequestId).filter((id): id is string => typeof id === 'string' && id.length > 0),
  )
  return rows
    .filter((e) => e.decision === 'require_approval' && !committed.has(e.requestId))
    .map((e) => {
      const expiresAt = e.approval?.expiresAt
      return {
        ...e,
        expiredHold: typeof expiresAt === 'string' && Number.isFinite(Date.parse(expiresAt)) && Date.parse(expiresAt) < now,
      }
    })
}

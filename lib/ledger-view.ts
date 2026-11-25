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
export function isExpiredHold(entry: LedgerEntry, now = Date.now()): boolean {
  const expiresAt = entry.approval?.expiresAt
  return typeof expiresAt === 'string' && Number.isFinite(Date.parse(expiresAt)) && Date.parse(expiresAt) < now
}

export function holdsFromRows(
  rows: LedgerEntry[],
  now = Date.now(),
): Array<LedgerEntry & { expiredHold: boolean }> {
  const committed = new Set(
    rows.map((e) => e.heldRequestId).filter((id): id is string => typeof id === 'string' && id.length > 0),
  )
  return rows
    .filter((e) => e.decision === 'require_approval' && !committed.has(e.requestId))
    .map((e) => ({ ...e, expiredHold: isExpiredHold(e, now) }))
}

/**
 * States a merchant can truthfully be told about a confirmation request.
 *
 * `approved` means a hosted commit row exists; it does NOT mean the write ran.
 * `executed` requires a success result on that commit row. The console never
 * infers either from a browser flag, a page view, or the passage of time.
 */
export type ConfirmationState =
  | 'not_found'
  | 'pending'
  | 'expired'
  | 'approved'
  | 'executed'
  | 'failed'
  | 'denied'
  | 'unknown'

export type ConfirmationView = {
  state: ConfirmationState
  hold?: LedgerEntry
  commit?: LedgerEntry
  other?: LedgerEntry
}

function compareText(a: string, b: string): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

function newestRow(rows: LedgerEntry[]): LedgerEntry | undefined {
  const time = (row: LedgerEntry): number => {
    const parsed = Date.parse(row.at)
    return Number.isFinite(parsed) ? parsed : 0
  }
  // Two RLS reads are flattened, so caller order cannot decide which row speaks.
  // Equal timestamps still need a stable representative; otherwise the same
  // ledger could render different subjects on different reloads.
  return [...rows].sort((a, b) => {
    const byTime = time(b) - time(a)
    if (byTime !== 0) return byTime
    return (
      compareText(a.rowDigest ?? '', b.rowDigest ?? '') ||
      compareText(a.requestId, b.requestId) ||
      compareText(a.decision, b.decision) ||
      compareText(a.result ?? '', b.result ?? '')
    )
  })[0]
}

function unanimousState(states: ConfirmationState[]): ConfirmationState {
  const first = states[0]
  if (!first) return 'unknown'
  return states.every((state) => state === first) ? first : 'unknown'
}

/**
 * Project one request from the ledger projection read under the caller's RLS.
 *
 * A commit is identified only by its `heldRequestId`, never by timing. A deny
 * with the same request id is a decision, not a hold; a commit with a result is
 * an outcome, not another approval. A missing row is `not_found` so the caller
 * can 404 without leaking another tenant's request.
 */
export function confirmationView(
  rows: LedgerEntry[],
  requestId: string,
  now = Date.now(),
): ConfirmationView {
  const hold = newestRow(rows.filter((e) => e.requestId === requestId && e.decision === 'require_approval'))
  const commits = rows.filter((e) => e.heldRequestId === requestId)
  const commit = newestRow(commits)
  const sameIdRows = rows.filter((e) => e.requestId === requestId && e.decision !== 'require_approval')
  const other = newestRow(sameIdRows)

  const outcome = (row: LedgerEntry, isCommit: boolean): ConfirmationState => {
    if (row.decision === 'deny' || row.reason === 'approval_rejected') return 'denied'
    if (row.result === 'ok') return 'executed'
    if (row.result === 'error') return 'failed'
    // A commit row without a result proves a hosted decision was recorded.
    // A bare allow row does not: it may be an unattended call, not an approval.
    return isCommit ? 'approved' : 'unknown'
  }

  if (hold && !commit) {
    // A denial recorded under the same request id is still a decision. Showing
    // "pending" beside it would keep asking the merchant to act after a hosted
    // refusal was already written.
    const sameIdDenial = newestRow(
      sameIdRows.filter((e) => e.decision === 'deny' || e.reason === 'approval_rejected'),
    )
    if (sameIdDenial) return { state: 'denied', hold, other: sameIdDenial }
    return { state: isExpiredHold(hold, now) ? 'expired' : 'pending', hold }
  }
  if (commit) {
    // A held request should have one hosted commit. If the ledger carries two
    // disagreeing outcomes, choosing one would be a false claim; keep a stable
    // subject for display but render the state as unknown.
    return { state: unanimousState(commits.map((row) => outcome(row, true))), hold, commit }
  }
  if (other) {
    return {
      state: unanimousState(sameIdRows.map((row) => outcome(row, false))),
      other,
    }
  }
  return { state: 'not_found' }
}

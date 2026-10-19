import { createClient } from '@/lib/supabase/server'
import type { LedgerEntry } from '@/lib/contracts'

/**
 * Durable reads for the console's own decision rows (TASKS.md 12.2, 2.4).
 *
 * Server Components only: reads go through the session client (anon key +
 * cookies), so RLS scopes every row to the merchant's own tenants. No
 * service role, no key material, nothing to leak — a read path with nothing
 * to steal is a read path that cannot be turned into a write path.
 *
 * Fidelity note, stated where the reader renders it rather than buried in a
 * doc: console rows carry coarser attribution than merchant-ledger rows
 * (no measured figures, no detail prose, no parameters — the data-class
 * boundary). Fields the row cannot know are ABSENT (`evaluated` undefined
 * renders '—'), never fabricated. A dashboard that invents figures to fill
 * its own columns is decorating.
 */

type ConsoleRow = {
  tenant_id: string
  request_id: string
  decided_at: string
  agent_id: string
  assurance: 'verified' | 'unverified'
  capability: string
  decision: 'allow' | 'deny' | 'require_approval'
  reason: string
  rule: string
  approval: { required: boolean; granted?: boolean; approvedBy?: string } | null
  result: 'ok' | 'error' | null
  config_hash: string | null
  row_digest: string | null
  duration_ms: number | null
}

function toEntry(r: ConsoleRow): LedgerEntry {
  return {
    tenantId: r.tenant_id,
    requestId: r.request_id,
    at: r.decided_at,
    agentId: r.agent_id,
    assurance: r.assurance,
    capability: r.capability,
    // Unregistered-capability denials carry no access class: the row records
    // the name the agent actually asked for (like the SDK ledger does) and
    // reports no class rather than inventing one. Pinned to these two
    // DENIAL_REASONS (SDK src/types.ts) — a future unregistered-reason would
    // misreport true until this line learns it, so grep this comment when
    // that union grows (N2).
    capabilityRegistered: r.reason === 'unknown_capability' || r.reason === 'capability_not_exposed' ? false : true,
    access: undefined,
    // Absent, not empty: the page renders '—' for missing figures, which is
    // the honest answer for rows that never carried them.
    evaluated: undefined,
    parameters: {},
    decision: r.decision,
    reason: r.reason as LedgerEntry['reason'],
    rule: r.rule,
    detail: '',
    approval: r.approval ?? undefined,
    result: r.result ?? undefined,
    configHash: r.config_hash ?? undefined,
    rowDigest: r.row_digest ?? undefined,
    durationMs: r.duration_ms ?? 0,
  }
}

/** Newest first, member-scoped by RLS. Never throws: callers render failed. */
export async function listDecisions(limit = 200): Promise<LedgerEntry[]> {
  const db = createClient()
  const { data, error } = await db
    .from('console_decisions')
    .select(
      'tenant_id, request_id, decided_at, agent_id, assurance, capability, decision, reason, rule, approval, result, config_hash, row_digest, duration_ms',
    )
    .order('decided_at', { ascending: false })
    .limit(limit)
  if (error || !data) return []
  return (data as ConsoleRow[]).map(toEntry)
}

/** Holds: decided require_approval with no grant recorded. Commits happen
 *  merchant-side (CLI), so a granted flag here would be attestation of
 *  nothing — the queue is require_approval rows, period.
 *
 *  Expired holds stay listed with an `expiredHold` marker rather than being
 *  filtered (N1): the row truthfully has not executed, the buttons are
 *  inert with the merchant-side-commit explanation either way, and the CLI
 *  enforces expiry at commit. Filtering them would report "nothing waiting"
 *  while rows disagree — a silent queue is worse than a stale one. */
export async function listHolds(limit = 200): Promise<Array<LedgerEntry & { expiredHold: boolean }>> {
  const now = Date.now()
  const rows = await listDecisions(limit)
  return rows
    .filter((e) => e.decision === 'require_approval')
    .map((e) => {
      const expiresAt = (e.approval as { expiresAt?: unknown } | undefined)?.expiresAt
      return {
        ...e,
        expiredHold: typeof expiresAt === 'string' && Number.isFinite(Date.parse(expiresAt)) && Date.parse(expiresAt) < now,
      }
    })
}

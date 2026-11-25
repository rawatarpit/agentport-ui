import { createClient } from '@/lib/supabase/server'
import type { LedgerEntry } from '@/lib/contracts'
import { holdsFromRows } from '@/lib/ledger-view'

/**
 * Durable reads for the hosted ledger's console projection (TASKS.md 12.2, 2.4).
 *
 * Server Components only: reads go through the session client (anon key +
 * cookies), so RLS scopes every row to the merchant's own tenants. No
 * service role, no key material, nothing to leak — a read path with nothing
 * to steal is a read path that cannot be turned into a write path.
 *
 * Why a view and not `ledger_entries`: the proof table carries redacted
 * parameters, detail prose and evaluated figures. The console boundary is
 * narrower, and `ledger_console_view` is that projection at the database, not
 * a promise that every future `select` remembers. Fields the view does not
 * carry are ABSENT (`evaluated` undefined renders '—'), never fabricated.
 */

/** The exact privacy projection. Selection is the custody boundary. */
const CONSOLE_COLUMNS =
  'tenant_id, request_id, held_request_id, at, agent_id, agent_label, agent_label_source, assurance, capability, capability_registered, access, decision, reason, rule, approval, result, config_hash, row_digest, duration_ms'

const REQUEST_REFERENCE_LIMIT = 50

type ConsoleRow = {
  tenant_id: string
  request_id: string
  held_request_id: string | null
  at: string
  agent_id: string
  agent_label: string | null
  agent_label_source: 'declared' | 'credential' | 'none' | null
  assurance: 'verified' | 'unverified'
  capability: string
  capability_registered: boolean | null
  access: 'read' | 'write' | null
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
    // The approval commit names the held request it ran. The queue uses this
    // link to stop showing a hold once a commit exists; the link is recorded
    // in the ledger, never inferred from timing.
    heldRequestId: r.held_request_id ?? undefined,
    at: r.at,
    agentId: r.agent_id,
    agentLabel: r.agent_label ?? undefined,
    agentLabelSource: r.agent_label_source ?? undefined,
    assurance: r.assurance,
    capability: r.capability,
    capabilityRegistered: r.capability_registered ?? undefined,
    access: r.access ?? undefined,
    // Absent, not empty: the view deliberately omits the figures, and the page
    // renders '—' rather than inventing a measurement.
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

/**
 * Newest first for one explicit tenant.
 *
 * A read failure throws; it never returns `[]`. An empty array is a claim
 * that the tenant has no rows, and a dashboard that renders a failed RLS
 * read as "no activity" is exactly the healthy-zero lie these views exist
 * to prevent. Callers catch and render `unknown`.
 */
export async function listDecisions(tenantId: string, limit = 200): Promise<LedgerEntry[]> {
  const db = createClient()
  const { data, error } = await db
    .from('ledger_console_view')
    .select(CONSOLE_COLUMNS)
    .eq('tenant_id', tenantId)
    .order('at', { ascending: false })
    .limit(limit)
  if (error) throw new Error('ledger read failed')
  return ((data ?? []) as ConsoleRow[]).map(toEntry)
}

/** Holds: require_approval rows with no later approval commit naming them. */
export async function listHolds(tenantId: string, limit = 200): Promise<Array<LedgerEntry & { expiredHold: boolean }>> {
  const rows = await listDecisions(tenantId, limit)
  return holdsFromRows(rows)
}

/**
 * Every projection row that can speak about one request: the hold itself, the
 * hosted commit that names it, and a denial recorded under the same id.
 *
 * Two explicit equality reads under the caller's RLS, not a wider scan: a
 * tenant cannot see another tenant's request through either key. A failed read
 * throws so the confirmation page renders unknown, never "no such request".
 */
export async function listRequestReferences(tenantId: string, requestId: string): Promise<LedgerEntry[]> {
  const db = createClient()
  const keys = [
    { column: 'request_id', value: requestId },
    { column: 'held_request_id', value: requestId },
  ] as const
  const results = await Promise.all(
    keys.map(async ({ column, value }) => {
      const { data, error } = await db
        .from('ledger_console_view')
        .select(CONSOLE_COLUMNS)
        .eq('tenant_id', tenantId)
        .eq(column, value)
        .order('at', { ascending: false })
        .limit(REQUEST_REFERENCE_LIMIT)
      if (error) throw new Error('ledger reference read failed')
      const rows = (data ?? []) as ConsoleRow[]
      // A full page may hide an older disagreeing commit. A definite state
      // from partial evidence would be a lie, so the page renders unknown.
      if (rows.length === REQUEST_REFERENCE_LIMIT) throw new Error('ledger reference read incomplete')
      return rows.map(toEntry)
    }),
  )
  // Do not dedupe by request id: a hosted commit can be recorded under the
  // same request id as the hold it decided. confirmationView identifies the
  // decision by heldRequestId, so both rows must reach it.
  return results.flat()
}

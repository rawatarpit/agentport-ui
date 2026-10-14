import { createHmac } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import type { AgentIdentity, ExecuteOutcome } from '@agentport/sdk'

/**
 * Durable decision rows for the console's own agent surface (TASKS.md 12.2).
 *
 * Server-only: imports node:crypto and reads server env. Never imported by a
 * client component — the key it signs with must never reach a browser, and
 * the NEXT_PUBLIC build guard is the backstop, not the plan.
 *
 * What this is and is not, stated once because the shape invites confusion:
 * the merchant's own SqlLedger remains the system of record with full rule
 * fidelity (measured figures, exact rule names). These rows are the
 * dashboard's durable *view*: identity, capability, outcome in the closed
 * vocabulary, approval state, digests. Route-level outcomes do not carry
 * the measured figures or the precise rule — `ok` has no reason field at
 * all — so this module records coarse-but-honest attribution
 * (`allowed`/`default`) rather than inventing precision. A dashboard that
 * renders invented figures is decorating, not reporting.
 *
 * What this module never sends, stated so a future "helpful" field goes red
 * in review rather than shipping silently: parameters, evaluated figures,
 * detail prose (amounts and request data never reach this backend — the
 * absence of a `redact` import is the control), approval input (raw PII),
 * and anything resembling a second trust path.
 */

export type ConsoleDecisionRow = {
  duration_ms: number
  request_id: string
  agent_id: string
  assurance: 'verified' | 'unverified'
  capability: string
  decision: 'allow' | 'deny' | 'require_approval'
  reason: string
  rule: string
  approval: Record<string, unknown> | null
  result: string | null
  config_hash: string
}

/** UUID v4 shape. The door enforces existence; this enforces shape early. */
export function isUuidTenant(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  )
}

/**
 * The append credential: hex HMAC-SHA256 over the exact bytes
 * `console-append-v1|<tenant-uuid>` with the tenant's server key.
 *
 * Tenant-bound, not row-bound, deliberately (see the 15900 header): proving
 * key possession + tenant binding is the whole job; row integrity travels
 * the same TLS and is attested afterwards by the generated row_digest.
 * Deterministic and side-effect-free so tests pin it byte-for-byte.
 */
export function consoleMac(tenantId: string, keyHex: string): string {
  return createHmac('sha256', Buffer.from(keyHex, 'hex'))
    .update(`console-append-v1|${tenantId}`, 'utf8')
    .digest('hex')
}

export type MappedRow = { skip: true; reason: string } | { skip: false; row: ConsoleDecisionRow }

/**
 * Map an SDK outcome to a door row. Returns skip (never throws) for outcomes
 * that are not decisions.
 *
 * `in_progress` is transport, not a decision: a retry is a transport event,
 * and the codebase's own ledger refuses to double-count one. Recording it
 * would manufacture decisions out of retries.
 *
 * No parameters, no evaluated figures, no detail prose — by design, not by
 * omission. Parameters are request data, evaluated figures ARE amounts, and
 * detail strings embed amounts ("Order of 500,000 minor units…"), and none
 * of those may reach this backend (dashboard_runtime_integration.md §7).
 * Redaction does not save this: a redacted amount is still an amount. So
 * there is nothing to redact and no `redact()` import — the absence of the
 * import is the control. `input` is not even accepted: a field that cannot
 * be passed cannot leak.
 *
 * `approval` is rebuilt as `{required: true}` (+ `expiresAt` when the hold
 * carries one), never passed through: the held approval object contains the
 * RAW input, and passing it through would put caller PII in a durable row.
 * Commits happen merchant-side (CLI), so `granted` never appears here — a
 * granted flag this route did not witness would be attestation of nothing.
 *
 * Route-level attribution is coarse by construction: `ok` outcomes carry no
 * reason or rule, while `denied` outcomes carry the exact refusal. `pending`
 * carries the queue state. The merchant's own SqlLedger keeps full
 * fidelity; this table is the dashboard's durable view.
 *
 * What this module never sends, stated so a future "helpful" field goes
 * red in review rather than shipping silently: parameters, evaluated
 * figures, detail prose (amounts and request data never reach this
 * backend — the absence of a `redact` import is the control), approval
 * input (raw PII), and anything resembling a second trust path.
 */
export function buildDecisionRow(opts: {
  tenantId: string
  identity: Pick<AgentIdentity, 'agentId' | 'assurance'>
  capability: string
  outcome: ExecuteOutcome
  configHash: string
  durationMs: number
}): MappedRow {
  const { identity, capability, outcome, configHash, durationMs } = opts
  const base = {
    request_id: outcome.requestId,
    // `||`, not `??`: an empty-string agentId passes `??` through, fails the
    // door's `<> ''` check, and the row is silently lost (warn-only). An
    // unattributed row must read as unidentified, not vanish (F7).
    agent_id: identity.agentId || 'unidentified',
    assurance: identity.assurance ?? 'unverified',
    capability,
    config_hash: configHash,
    // Measured wall time from the route. Telemetry, excluded from the digest
    // by the database — identical decisions at different speeds must digest
    // identically, or cross-run comparison breaks.
    // Total sanitizer (S6b): NaN/Infinity/fractions/negatives all collapse
    // to a safe integer. Math.max alone is NOT total — Math.max(0, NaN) is
    // NaN, which serialises to JSON null and would make the row depend on
    // the door's COALESCE instead of this line.
    duration_ms: Number.isFinite(durationMs) ? Math.max(0, Math.floor(durationMs)) : 0,
  } as const

  switch (outcome.status) {
    case 'ok':
      return {
        skip: false,
        row: {
          ...base,
          decision: 'allow',
          reason: 'allowed',
          rule: 'default',
          approval: null,
          result: 'ok',
        },
      }
    case 'denied':
      return {
        skip: false,
        row: {
          ...base,
          decision: 'deny',
          reason: outcome.reason,
          rule: outcome.rule,
          approval: null,
          result: null,
        },
      }
    case 'pending_approval': {
      const approval: Record<string, unknown> = { required: true }
      const expiresAt = (outcome.approval as { expiresAt?: unknown }).expiresAt
      if (typeof expiresAt === 'string') approval.expiresAt = expiresAt
      return {
        skip: false,
        row: {
          ...base,
          // Queue-side label, not a policy rule name: the outcome carries no
          // structured reason, only human-readable detail — which is itself
          // free text and stays out. `held_for_approval` cannot collide with
          // a rule name because it describes queue state.
          decision: 'require_approval',
          reason: 'approval_required',
          rule: 'held_for_approval',
          approval,
          result: null,
        },
      }
    }
    case 'error':
      return {
        skip: false,
        row: {
          ...base,
          decision: 'allow',
          reason: 'handler_error',
          rule: 'handler',
          approval: null,
          result: 'error',
        },
      }
    case 'in_progress':
      return { skip: true, reason: 'transport, not a decision' }
    default:
      // S2: exhaustive today, open tomorrow. A future 6th ExecuteOutcome
      // variant must skip loudly, never return undefined into the route —
      // an undefined map result throws after invoke() but before the agent
      // response, turning a working decision into a 500. Unknown outcomes
      // are transport-unknown, not decisions.
      return { skip: true, reason: 'unknown outcome status' }
  }
}

export type AppendResult = { ok: true } | { ok: false; reason: string }

/**
 * Append one row through the door. Never throws into the request path:
 * failures return `{ok: false}` for the warn log, and the agent response
 * stands regardless — the pinned trade (effect runs, loss is loud and
 * attributable). A throwing append would turn every ledger outage into an
 * agent outage, which is the dependency the architecture forbids.
 */
export async function appendDecision(
  tenantId: string,
  row: ConsoleDecisionRow,
  deps: {
    url?: string
    anonKey?: string
    consoleKey?: string
    warn?: (event: string, meta: Record<string, unknown>) => void
  } = {},
): Promise<AppendResult> {
  const url = deps.url ?? process.env.SUPABASE_URL ?? ''
  const anonKey = deps.anonKey ?? process.env.SUPABASE_ANON_KEY ?? ''
  const consoleKey = deps.consoleKey ?? process.env.AGENTPORT_CONSOLE_HMAC ?? ''
  const warn =
    deps.warn ??
    ((event: string, meta: Record<string, unknown>) => console.warn(`[agentport] ${event}`, meta))
  if (!url || !anonKey || !consoleKey) {
    warn('console_append_skipped', {
      requestId: row.request_id,
      reason: 'SUPABASE_URL, SUPABASE_ANON_KEY or AGENTPORT_CONSOLE_HMAC is not set. Rows are lost, not queued.',
    })
    return { ok: false, reason: 'unconfigured' }
  }
  try {
    // Anon key, never service role: the door is SECURITY DEFINER and does
    // its own HMAC check, so this client needs no privilege beyond reaching
    // the RPC. A service-role client here would bypass every check the door
    // exists to enforce.
    const db = createClient(url, anonKey, { auth: { persistSession: false } })
    const mac = consoleMac(tenantId, consoleKey)
    const { error } = await db.rpc('agentport_console_append', {
      p_tenant: tenantId,
      p_row: row,
      p_mac: mac,
    })
    if (error) {
      warn('console_append_failed', { requestId: row.request_id, message: error.message })
      return { ok: false, reason: error.message }
    }
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    warn('console_append_failed', { requestId: row.request_id, message })
    return { ok: false, reason: message }
  }
}

import { agent, configHash, verifyIdentity } from '@/lib/agentport'
import { appendDecision, buildDecisionRow, isUuidTenant } from '@/lib/console-append'
import { resolveTenant } from '@/lib/store'

/**
 * EXECUTE.
 *
 * Each outcome maps to its own status code. A refusal is 403 with a
 * machine-readable reason, never a 500 and never a bare "forbidden": an agent that
 * cannot tell why it was refused will either retry forever or route around the
 * control.
 */
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  // Measured, not fabricated: the durable row carries how long the decision
  // took on this host. A zero here would read as instant; an absent value is
  // a type error — so the route times what it did.
  const startedAt = Date.now()
  let body: { capability?: string; input?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ status: 'error', message: 'Body must be JSON.' }, { status: 400 })
  }

  if (!body.capability) {
    return Response.json({ status: 'error', message: 'A capability name is required.' }, { status: 400 })
  }

  /**
   * Trust comes from a credential the merchant issued, never from the request.
   *
   * `verifyToken` returns an `unverified` identity with no scopes and a
   * already-passed expiry when the signature does not verify, so handing that
   * straight to `invoke` makes a bad credential produce a *recorded refusal*
   * with a named reason, rather than a 500 and no ledger row.
   *
   * The verification reason is logged and never returned: a response saying
   * "your signature was malformed" tells an attacker which part of their forgery
   * was wrong.
   */
  const identity = await verifyIdentity(req.headers.get('authorization') ?? undefined)
  if (identity.reason) {
    console.warn(`[agentport] credential refused: ${identity.reason}`)
  }

  const outcome = await agent.invoke({
    capability: body.capability,
    input: body.input ?? {},
    identity,
  })

  // Durable decision row (TASKS.md 12.2). Best-effort by requirement, never
  // load-bearing: the agent response below stands however the append goes —
  // the pinned trade (effect runs, loss is loud and attributable). A throwing
  // append would turn every Supabase outage into an agent outage, which is
  // the dependency the architecture forbids. Failures land in the warn log
  // with the request id, which is the operator's handle on the gap.
  //
  // The tenant must be a real uuid: the door keys rows to tenants, and the
  // demo constant is not one. Unset AGENTPORT_TENANT skips durable storage
  // with a warning rather than writing unattributable rows.
  const tenantId = resolveTenant()
  if (isUuidTenant(tenantId)) {
    const mapped = buildDecisionRow({
      tenantId,
      identity,
      capability: body.capability,
      outcome,
      configHash,
      durationMs: Date.now() - startedAt,
    })
    if (!mapped.skip) {
      // Fire-and-forget, deliberately (S3): appendDecision never throws and
      // never alters the outcome object, so awaiting it would tax every agent
      // response with a Supabase round-trip for zero content gain. The loss
      // trade is unchanged — failures land in the warn log with the request
      // id, whether awaited or not.
      void appendDecision(tenantId, mapped.row)
    }
  } else {
    console.warn('[agentport] console_append_skipped', {
      requestId: outcome.requestId,
      reason: 'AGENTPORT_TENANT is not a tenant uuid. Rows are lost, not queued.',
    })
  }

  switch (outcome.status) {
    case 'ok':
      return Response.json(outcome, { status: 200 })
    case 'pending_approval':
      return Response.json(outcome, { status: 202 })
    case 'denied':
      return Response.json(outcome, { status: 403 })
    case 'error':
      return Response.json(outcome, { status: 502 })
    case 'in_progress':
      // Reachable the day this route accepts intentId: a concurrent retry
      // reports the claim state rather than deciding. 409, never 500 — the
      // work is underway elsewhere, which is a conflict with the caller's
      // expectation, not a server failure.
      return Response.json(outcome, { status: 409 })
    default:
      // Exhaustive today, open tomorrow (S2's mapper default has a twin
      // here): an unknown future outcome must not fall off the switch into
      // an undefined response. 502 names a downstream failure the route
      // cannot describe, with the request id for the warn log.
      return Response.json(
        { status: 'error', message: 'Unrecognized outcome status.', requestId: outcome.requestId },
        { status: 502 },
      )
  }
}
import { agent, verifyIdentity } from '@/lib/agentport'

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

  switch (outcome.status) {
    case 'ok':
      return Response.json(outcome, { status: 200 })
    case 'pending_approval':
      return Response.json(outcome, { status: 202 })
    case 'denied':
      return Response.json(outcome, { status: 403 })
    case 'error':
      return Response.json(outcome, { status: 502 })
  }
}
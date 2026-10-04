import { issueToken } from '@agentport/sdk'
import { agent, verifyIdentity } from '@/lib/agentport'

export const dynamic = 'force-dynamic'

/**
 * POST /api/test-event — one governed round trip, shown (TASKS.md 6.5).
 *
 * DEVELOPMENT ONLY. Mints a short-lived dev credential, fires a read through
 * the real invoke path, and returns what the engine said. Production refuses:
 * a test credential minted from a dashboard session cannot distinguish an
 * employee from an algorithm in the ledger, which is the failure this product
 * exists to prevent — `agent-port token` is the production path.
 */
export async function POST() {
  if (process.env.NODE_ENV === 'production') {
    return Response.json(
      { status: 'error', reason: 'Test events are development-only. Mint a credential with `agent-port token`.' },
      { status: 503 },
    )
  }
  // Scoped for exactly this read — the engine checks `capability:<name>`,
  // and a test credential holding `*` would prove nothing about scoping.
  const secret = process.env.AGENTPORT_SIGNING_SECRET
  if (!secret) {
    return Response.json({ status: 'error', reason: 'AGENTPORT_SIGNING_SECRET is not set.' }, { status: 503 })
  }
  let token: string
  try {
    ;({ token } = await issueToken(
      { agentId: 'dashboard-test', scopes: ['capability:checkInventory'], ttlMs: 60_000 },
      secret,
    ))
  } catch (e) {
    return Response.json({ status: 'error', reason: (e as Error).message }, { status: 503 })
  }
  const identity = await verifyIdentity(`Bearer ${token}`)
  const outcome = await agent.invoke({ capability: 'checkInventory', input: { sku: 'EX-140' }, identity })
  return Response.json({
    status: 'ok',
    roundTrip: {
      capability: 'checkInventory',
      outcome: outcome.status,
      reason: outcome.status === 'denied' ? outcome.reason : undefined,
    },
  })
}

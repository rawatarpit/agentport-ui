import { agent } from '@/lib/agentport'
import type { AgentIdentity } from '@agentport/sdk'

/**
 * EXECUTE.
 *
 * Each outcome maps to its own status code. A refusal is 403 with a
 * machine-readable reason, never a 500 and never a bare "forbidden": an agent
 * that cannot tell why it was refused will either retry forever or route
 * around the control.
 */
export const dynamic = 'force-dynamic'

/**
 * Stands in for real credential verification. In production this validates a
 * short-lived scoped token issued by the business and resolves it to an
 * AgentIdentity. It must never trust an agentId supplied in the request body.
 */
async function verifyIdentity(req: Request): Promise<AgentIdentity> {
  const header = req.headers.get('authorization') ?? ''
  const token = header.replace(/^Bearer\s+/i, '').trim()
  const agentId = token || 'anonymous'
  return {
    agentId,
    scopes: ['*'],
    credentialId: `cred_${agentId}`,
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
  }
}

export async function POST(req: Request) {
  let body: { capability?: string; input?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ status: 'error', message: 'Body must be JSON.' }, { status: 400 })
  }

  if (!body.capability) {
    return Response.json(
      { status: 'error', message: 'A capability name is required.' },
      { status: 400 },
    )
  }

  const outcome = await agent.invoke({
    capability: body.capability,
    input: body.input ?? {},
    identity: await verifyIdentity(req),
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

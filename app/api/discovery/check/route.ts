import { normaliseWorkerUrl } from '@/lib/install-package'
import { resolveRequestTenant, tenantRefusalResponse } from '@/lib/tenant-server'
import { trackServerEvent } from '@/lib/funnel-events-server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/discovery/check
 *
 * The browser cannot fetch the governor cross-origin (and should not be given
 * an open proxy). This route builds the canonical URL from the signed-in
 * tenant and the server-only worker origin, then asks the governor for the
 * manifest it would serve to an agent.
 *
 * A 200 here is the only proof that the published artifact reached a worker
 * that is actually serving this tenant. The stored artifact alone is not.
 */
export async function GET() {
  const tenant = await resolveRequestTenant()
  if (tenant.active.status !== 'active') return tenantRefusalResponse(tenant.active)

  const worker = normaliseWorkerUrl(process.env.AGENTPORT_WORKER_URL ?? '', tenant.active.tenantId)
  if (!worker.ok) {
    return Response.json({ status: 'error', reason: worker.reason, url: null, httpStatus: null })
  }

  const url = `${worker.url}/.well-known/agent.json`
  try {
    const res = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
      headers: { accept: 'application/json' },
    })
    const text = await res.text()
    if (!res.ok) {
      return Response.json({
        status: 'error',
        reason:
          res.status === 502
            ? 'The hosted governor returned 502 for this tenant. It is not serving a runtime yet.'
            : `The hosted governor answered ${res.status}.`,
        url,
        httpStatus: res.status,
      })
    }

    let manifest: unknown
    try {
      manifest = JSON.parse(text)
    } catch {
      return Response.json({
        status: 'error',
        reason: 'The governor answered 200 but the body is not JSON.',
        url,
        httpStatus: res.status,
      })
    }

    const served =
      typeof manifest === 'object' && manifest !== null
        ? (manifest as Record<string, unknown>)
        : null
    const servedTenantId = served?.tenantId

    // The route is the authority for the tenant binding. Returning a foreign
    // manifest with status:'ok' would let a client paint another tenant's
    // business as this tenant's serving proof; suppress the body as well as
    // the telemetry event.
    if (servedTenantId !== tenant.active.tenantId) {
      return Response.json({
        status: 'error',
        reason: 'The served manifest belongs to another workspace. Nothing is proved for this tenant.',
        url,
        httpStatus: res.status,
      })
    }

    await trackServerEvent({
      event_type: 'deployment_verified',
      user_id: tenant.userId,
      tenant_id: tenant.active.tenantId,
      source_route: '/api/discovery/check',
      event_id: `deployment_verified:${tenant.active.tenantId}`,
    })

    // Allowlist the facts the console may display. A manifest may contain
    // business prose or policy detail; neither is needed to prove that this
    // tenant's governor answered.
    const manifestFacts = {
      version: typeof served?.version === 'string' ? served.version : null,
      tenantId: tenant.active.tenantId,
      // An absent capability list is unknown, not an empty list. A healthy
      // zero here would contradict the purpose of this route.
      capabilityCount: Array.isArray(served?.capabilities) ? served.capabilities.length : null,
      generatedAt: typeof served?.generatedAt === 'string' ? served.generatedAt : null,
    }

    return Response.json({ status: 'ok', url, httpStatus: res.status, manifest: manifestFacts })
  } catch (error) {
    const reason =
      error instanceof Error && error.name === 'TimeoutError'
        ? 'The hosted governor did not answer within 8 seconds.'
        : 'The hosted governor is unreachable from the console.'
    return Response.json({ status: 'error', reason, url, httpStatus: null })
  }
}

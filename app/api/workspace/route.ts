import {
  clearSelectedTenantId,
  resolveRequestTenant,
  tenantRefusalResponse,
  writeSelectedTenantId,
} from '@/lib/tenant-server'
import { normaliseSelectedTenantId } from '@/lib/tenant'
import { guardStateChange } from '@/lib/request-guard'

export const dynamic = 'force-dynamic'

type Workspace = {
  tenantId: string
  role: string
  displayName: string | null
}

async function workspaces(tenant: Awaited<ReturnType<typeof resolveRequestTenant>>): Promise<Workspace[]> {
  const { supabase, memberships } = tenant
  if (memberships.length === 0) return []

  const ids = memberships.map((m) => m.tenant_id)
  const { data } = await supabase.from('tenants').select('tenant_id,display_name').in('tenant_id', ids)
  const names = new Map<string, string>(
    ((data ?? []) as Array<{ tenant_id: string; display_name: string | null }>).map((r) => [
      r.tenant_id,
      r.display_name ?? '',
    ]),
  )

  return memberships.map((m) => ({
    tenantId: m.tenant_id,
    role: m.role,
    displayName: names.get(m.tenant_id) || null,
  }))
}

/**
 * GET /api/workspace — the caller's memberships and current selection.
 *
 * Reads are the caller's own rows through RLS; no service role, no tenant id
 * accepted from the query string.
 */
export async function GET() {
  const tenant = await resolveRequestTenant()
  if (!tenant.userId) {
    return Response.json({ status: 'error', reason: 'Sign in first.' }, { status: 401 })
  }
  if (tenant.memberships.length === 0) {
    return Response.json(
      {
        status: 'error',
        reason: 'Signed in, but no business is linked to this login yet. Finish signup first.',
      },
      { status: 403 },
    )
  }

  return Response.json({
    status: 'ok',
    tenantId: tenant.active.status === 'active' ? tenant.active.tenantId : null,
    selectionRequired: tenant.active.status !== 'active',
    selectionValid: tenant.active.status !== 'denied' || tenant.active.code !== 'invalid_selection',
    workspaces: await workspaces(tenant),
  })
}

/**
 * POST /api/workspace — set the active workspace.
 *
 * The tenant id is client-supplied here by design, so it is checked against
 * the session's membership rows before the httpOnly cookie is written. An id
 * the user does not belong to is refused and leaves the previous selection
 * untouched.
 */
export async function POST(req: Request) {
  const guarded = guardStateChange(req, 'workspace')
  if (guarded) return guarded
  const tenant = await resolveRequestTenant()
  if (!tenant.userId) {
    return Response.json({ status: 'error', reason: 'Sign in first.' }, { status: 401 })
  }

  let body: { tenantId?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ status: 'error', reason: 'Body must be JSON.' }, { status: 400 })
  }
  const tenantId = normaliseSelectedTenantId(body.tenantId)
  if (!tenantId) {
    return Response.json(
      { status: 'error', reason: 'Choose a workspace — tenantId is required.' },
      { status: 400 },
    )
  }

  const membership = tenant.memberships.find((m) => m.tenant_id === tenantId)
  if (!membership) {
    return tenantRefusalResponse({
      code: 'invalid_selection',
      reason: 'That workspace is not one your login belongs to. Nothing was changed.',
    })
  }

  writeSelectedTenantId(tenantId)
  return Response.json({ status: 'ok', tenantId, role: membership.role })
}

/** DELETE /api/workspace — clear the selection; the next read asks again. */
export async function DELETE(req: Request) {
  const guarded = guardStateChange(req, 'workspace')
  if (guarded) return guarded
  const tenant = await resolveRequestTenant()
  if (!tenant.userId) {
    return Response.json({ status: 'error', reason: 'Sign in first.' }, { status: 401 })
  }
  clearSelectedTenantId()
  return Response.json({ status: 'ok', tenantId: null })
}

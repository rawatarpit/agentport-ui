import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { guardStateChange } from '@/lib/request-guard'
import { resolveCallerRole } from '@/lib/tenant'
import { readSelectedTenantId, tenantRefusalResponse } from '@/lib/tenant-server'
import { parseIdentitySettings, parseUserScope, parseUserId } from '@/lib/identity-settings'

export const dynamic = 'force-dynamic'

async function caller() {
  const supabase = createClient()
  const { data } = await supabase.auth.getUser()
  const t = await resolveCallerRole({
    getUserId: async () => data.user?.id ?? null,
    selectedTenantId: readSelectedTenantId(),
    listMemberships: async (userId: string) => {
      const { data: rows } = await supabase
        .from('tenant_members')
        .select('tenant_id,role,created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
      return (rows ?? []) as Array<{ tenant_id: string; role: string; created_at: string }>
    },
    getRole: async (tenantId: string) => {
      const { data: role } = await supabase.rpc('agentport_tenant_role', { target_tenant: tenantId })
      return typeof role === 'string' ? role : null
    },
  })
  return { t, userId: data.user?.id ?? null }
}

/**
 * GET /api/identity — the tenant's user-session configuration.
 *
 * Members may read what the business has configured; only owners/admins get
 * `canEdit` (the POST enforces it independently, so the UI flag is a courtesy,
 * never the control).
 */
export async function GET() {
  const { t } = await caller()
  if (t.tenantId === null) return tenantRefusalResponse(t)

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('agentport_tenant_runtime_detail_v2', {
    p_tenant_id: t.tenantId,
  })
  if (error) {
    console.error('identity config read failed', error)
    return Response.json(
      { status: 'error', reason: 'Could not read the identity configuration. Retry.' },
      { status: 502 },
    )
  }

  const detail = (data ?? {}) as { identity?: unknown }
  return Response.json({
    status: 'ok',
    identity: detail.identity ?? null,
    canEdit: t.role === 'owner' || t.role === 'admin',
  })
}

/**
 * POST /api/identity — owner/admin writes.
 *
 * The caller's role comes from the session, never the body. The route then uses
 * the service role because the setters are service_role-only, the same pattern
 * as the publish path: prove the human, then perform the narrow write. Every
 * setter bumps the tenant revision, so the governor reloads on its next poll
 * and drops in-memory sessions (a change of authority invalidates them).
 */
export async function POST(req: Request) {
  const guarded = guardStateChange(req, 'identity:write')
  if (guarded) return guarded

  const { t, userId } = await caller()
  if (t.tenantId === null) return tenantRefusalResponse(t)
  if (t.role !== 'owner' && t.role !== 'admin') {
    return Response.json(
      { status: 'error', reason: 'Only the owner or an admin can change user-session settings.' },
      { status: 403 },
    )
  }

  let body: Record<string, unknown>
  try {
    const parsed = await req.json()
    if (typeof parsed !== 'object' || parsed === null) throw new Error('not an object')
    body = parsed as Record<string, unknown>
  } catch {
    return Response.json({ status: 'error', reason: 'Body must be JSON.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const action = body.action

  if (action === 'set_identity') {
    const parsed = parseIdentitySettings(body)
    if (!parsed.ok) return Response.json({ status: 'error', reason: parsed.reason }, { status: 422 })
    const value = parsed.value
    const { error } = await admin.rpc('agentport_set_tenant_identity', {
      p_tenant_id: t.tenantId,
      p_verify_url: value.verifyUrl,
      p_jwks_url: value.jwksUrl,
      p_issuer: value.issuer,
      p_audience: value.audience,
      p_default_scope: value.defaultScope,
      p_actor: userId,
    })
    if (error) {
      console.error('identity set failed', error)
      return Response.json(
        { status: 'error', reason: 'Could not save the identity configuration. Retry.' },
        { status: 502 },
      )
    }
    return Response.json({ status: 'ok' })
  }

  if (action === 'set_user_scope') {
    const parsed = parseUserScope(body)
    if (!parsed.ok) return Response.json({ status: 'error', reason: parsed.reason }, { status: 422 })
    const { error } = await admin.rpc('agentport_set_user_scope', {
      p_tenant_id: t.tenantId,
      p_user_id: parsed.value.userId,
      p_scope: parsed.value.scope,
      p_actor: userId,
    })
    if (error) {
      console.error('user scope set failed', error)
      return Response.json(
        { status: 'error', reason: 'Could not save that user scope. Retry.' },
        { status: 502 },
      )
    }
    return Response.json({ status: 'ok' })
  }

  if (action === 'clear_user_scope') {
    const parsed = parseUserId(body.userId)
    if (!parsed.ok) return Response.json({ status: 'error', reason: parsed.reason }, { status: 422 })
    const { error } = await admin.rpc('agentport_clear_user_scope', {
      p_tenant_id: t.tenantId,
      p_user_id: parsed.value,
      p_actor: userId,
    })
    if (error) {
      console.error('user scope clear failed', error)
      return Response.json(
        { status: 'error', reason: 'Could not remove that user scope. Retry.' },
        { status: 502 },
      )
    }
    return Response.json({ status: 'ok' })
  }

  return Response.json({ status: 'error', reason: 'Unknown action.' }, { status: 400 })
}

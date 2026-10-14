import { createClient } from '@/lib/supabase/server'
import { normaliseWebsiteUrl } from '@/lib/store'
import { resolveCallerTenant } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

/**
 * GET /api/me — the current merchant, or an honest 404 when the session has
 * no linked business.
 * PUT /api/me — set the merchant's public runtime URL (TASKS.md 1.2).
 *
 * The website URL is the manifest's baseUrl: the address external agents call.
 * It lives on the merchant's `tenants` row (`website_url`, null until set) —
 * never on the dashboard origin — which is what un-conflates the two
 * addresses. Until it is set, the manifest falls back to this dashboard's
 * origin and says so.
 *
 * Tenant comes from the session (auth user → tenant_members), never from a
 * constant. The single-process RAM maps in lib/store.ts know nothing about
 * Supabase users; reading the merchant from them is exactly how a signed-in
 * merchant once got "No account yet". The write is RLS-gated to owner/admin
 * of the row's own tenant, and a column trigger rejects anything but
 * website_url on this path — see migration 20261014000000.
 */
async function callerTenantId() {
  const supabase = createClient()
  const t = await resolveCallerTenant({
    getUserId: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
    listMemberships: async (userId: string) => {
      const { data } = await supabase
        .from('tenant_members')
        .select('tenant_id,role,created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
      return (data ?? []) as Array<{ tenant_id: string; role: string; created_at: string }>
    },
  })
  return { supabase, t }
}

export async function GET() {
  const { supabase, t } = await callerTenantId()
  if (t.tenantId === null) {
    return Response.json({ status: 'error', reason: t.reason }, { status: 404 })
  }
  const { data: tenant } = await supabase
    .from('tenants')
    .select('tenant_id,display_name,contact_email,website_url,created_at')
    .eq('tenant_id', t.tenantId)
    .maybeSingle()
  if (!tenant) {
    return Response.json(
      { status: 'error', reason: 'Signed in, but your business record is unreachable. Sign out and back in, then retry.' },
      { status: 404 },
    )
  }
  return Response.json({
    status: 'ok',
    tenantId: t.tenantId,
    merchant: {
      id: tenant.tenant_id as string,
      email: tenant.contact_email as string,
      businessName: tenant.display_name as string,
      websiteUrl: (tenant.website_url as string | null) ?? null,
      createdAt: tenant.created_at as string,
    },
  })
}

export async function PUT(req: Request) {
  const { supabase, t } = await callerTenantId()
  if (t.tenantId === null) {
    return Response.json({ status: 'error', reason: t.reason }, { status: 409 })
  }
  let body: { websiteUrl?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ status: 'error', reason: 'Body must be JSON.' }, { status: 400 })
  }
  const checked = normaliseWebsiteUrl(body.websiteUrl)
  if (!checked.ok) {
    return Response.json({ status: 'error', reason: (checked as { reason: string }).reason }, { status: 422 })
  }
  const url = (checked as { url: string }).url
  // RLS admits owner/admin of this tenant only; the column trigger rejects
  // anything but website_url. Zero rows back means not permitted (RLS makes
  // other tenants' rows invisible rather than erroring), never silent success.
  const { data, error } = await supabase
    .from('tenants')
    .update({ website_url: url })
    .eq('tenant_id', t.tenantId)
    .select('website_url')
  if (error || !data || data.length === 0) {
    return Response.json(
      { status: 'error', reason: 'Only the owner or an admin of this business can set the site address.' },
      { status: 403 },
    )
  }
  const me = supabase
  const { data: tenant } = await me
    .from('tenants')
    .select('tenant_id,display_name,contact_email,website_url,created_at')
    .eq('tenant_id', t.tenantId)
    .maybeSingle()
  return Response.json({
    status: 'ok',
    tenantId: t.tenantId,
    merchant: tenant
      ? {
          id: tenant.tenant_id as string,
          email: tenant.contact_email as string,
          businessName: tenant.display_name as string,
          websiteUrl: (tenant.website_url as string | null) ?? null,
          createdAt: tenant.created_at as string,
        }
      : { id: t.tenantId, websiteUrl: url },
  })
}

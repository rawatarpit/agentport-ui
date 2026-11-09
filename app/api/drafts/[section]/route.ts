import { getDraftDb, putDraftDb, type DraftSection } from '@/lib/durable-store'
import { guardStateChange } from '@/lib/request-guard'
import { validateCapabilities, validateRules, validateSetup } from '@/lib/golive'
import { validateOnboarding } from '@/lib/onboarding'
import { resolveCallerTenant, resolveCallerRole, canManageIntegrations, type TenantRefusal } from '@/lib/tenant'
import { readSelectedTenantId, tenantRefusalResponse } from '@/lib/tenant-server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const SECTIONS: DraftSection[] = ['setup', 'capabilities', 'rules', 'onboarding']

function check(section: DraftSection, payload: unknown): string[] | null {
  const r =
    section === 'rules'
      ? validateRules(payload)
      : section === 'capabilities'
        ? validateCapabilities(payload)
        : section === 'onboarding'
          ? validateOnboarding(payload)
          : validateSetup(payload)
  return r.ok ? null : r.errors
}

async function callerTenant(): Promise<Awaited<ReturnType<typeof resolveCallerTenant>>> {
  try {
    const supabase = createClient()
    const { data } = await supabase.auth.getUser()
    const t = await resolveCallerTenant({
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
    })
    return t
  } catch {
    return { tenantId: null, code: 'signed_out', reason: 'Sign in first — drafts belong to your business.' }
  }
}

async function callerRole(): Promise<{ tenantId: string; role: string } | TenantRefusal> {
  try {
    const supabase = createClient()
    const { data } = await supabase.auth.getUser()
    return await resolveCallerRole({
      getUserId: async () => data.user?.id ?? null,
      selectedTenantId: readSelectedTenantId(),
      getRole: async (tenantId: string) => {
        const { data: rows } = await supabase
          .from('tenant_members')
          .select('role')
          .eq('user_id', data.user?.id ?? null)
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: true })
          .limit(1)
        return (rows?.[0] as { role?: string } | undefined)?.role ?? null
      },
      listMemberships: async (userId: string) => {
        const { data: rows } = await supabase
          .from('tenant_members')
          .select('tenant_id,role,created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: true })
        return (rows ?? []) as Array<{ tenant_id: string; role: string; created_at: string }>
      },
    })
  } catch {
    return { tenantId: null, code: 'signed_out', reason: 'Sign in first — drafts belong to your business.' }
  }
}

/**
 * Drafts — per tenant in Supabase, validated at save time.
 *
 * GET returns the saved draft or an explicit null (never a 404 that reads as
 * broken). PUT validates with the same rules the editors enforce, so a bad
 * draft cannot be smuggled past the UI — the API is the second wall, not the
 * first. Saving never deploys; only the publish ceremony (approve, sign, upload) changes what is live.
 * Logged-out callers get 401, never the demo tenant's rows.
 */
export async function GET(_req: Request, { params }: { params: { section: string } }) {
  const section = params.section as DraftSection
  if (!SECTIONS.includes(section)) {
    return Response.json({ status: 'error', reason: `Unknown section "${params.section}".` }, { status: 400 })
  }
  const t = await callerTenant()
  if (t.tenantId === null) return tenantRefusalResponse(t)
  const draft = await getDraftDb(t.tenantId, section)
  return Response.json({ status: 'ok', section, draft: draft?.payload ?? null, updatedAt: draft?.updatedAt ?? null })
}

export async function PUT(req: Request, { params }: { params: { section: string } }) {
  const guarded = guardStateChange(req, 'drafts')
  if (guarded) return guarded
  const section = params.section as DraftSection
  if (!SECTIONS.includes(section)) {
    return Response.json({ status: 'error', reason: `Unknown section "${params.section}".` }, { status: 400 })
  }
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ status: 'error', reason: 'Body must be JSON.' }, { status: 400 })
  }
  const errors = check(section, (body as { payload?: unknown })?.payload ?? body)
  if (errors) {
    return Response.json({ status: 'error', reason: 'Draft rejected.', errors }, { status: 422 })
  }
  const t = await callerRole()
  if (t.tenantId === null) return tenantRefusalResponse(t)
  if (!canManageIntegrations(t.role)) {
    return Response.json(
      { status: 'error', reason: 'Only the owner or an admin of this business can save drafts.' },
      { status: 403 },
    )
  }
  const payload = ((body as { payload?: unknown })?.payload ?? body) as unknown
  const draft = await putDraftDb(t.tenantId, section, payload)
  if (!draft) {
    return Response.json({ status: 'error', reason: 'Draft could not be saved — try again.' }, { status: 503 })
  }
  return Response.json({ status: 'ok', section, updatedAt: draft.updatedAt })
}

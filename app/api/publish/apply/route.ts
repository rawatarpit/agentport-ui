import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { compileLiveFrom, KNOWN_CAPABILITIES, validateCapabilities } from '@/lib/golive'
import type { DataClass } from '@/lib/contracts'
import { getDraftDb } from '@/lib/durable-store'
import { contentDigest, tierForChange } from '@/lib/publish'
import { guardStateChange } from '@/lib/request-guard'
import { resolveCallerRole } from '@/lib/tenant'
import { readSelectedTenantId, tenantRefusalResponse } from '@/lib/tenant-server'

export const dynamic = 'force-dynamic'

type Caps = Array<{ name: string }>
type ConfigCap = {
  name: string
  method: string
  path: string
  kind: 'read' | 'write'
  dataClass: DataClass
  requiresApproval: boolean
  autoIssue: boolean
}
type ConfigCaps = ConfigCap[]
type Policy = Record<string, unknown>

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
  return { supabase, t, email: data.user?.email ?? null }
}

const knownKind = (name: string): 'read' | 'write' | 'unknown' =>
  (KNOWN_CAPABILITIES.find((c) => c.name === name)?.kind as 'read' | 'write' | undefined) ?? 'unknown'

/**
 * POST /api/publish/apply — the database is the publish target.
 *
 * Owner/admin only (role from the session, never the body). Compiles the
 * current drafts — or re-presents a stored config for rollback — tiers the
 * change against the active config, runs the matching ceremony (click vs typed
 * business name), then one authenticated RPC writes the version, the capability
 * inventory, and the runtime pointer in a single transaction.
 *
 * There is no artifact and no browser signing. The hosted governor reads the
 * applied row on its next registry poll. See PRODUCT.md §Publishing model for
 * the trust trade this deliberately makes.
 */
export async function POST(req: Request) {
  const guarded = guardStateChange(req, 'publish:apply')
  if (guarded) return guarded
  const { supabase, t, email } = await caller()
  if (t.tenantId === null) {
    return tenantRefusalResponse(t)
  }
  if (t.role !== 'owner' && t.role !== 'admin') {
    return Response.json({ status: 'error', reason: 'Only the owner or an admin can apply a config.' }, { status: 403 })
  }
  const tenantId = t.tenantId
  let body: { confirm?: unknown; fromVersion?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ status: 'error', reason: 'Body must be JSON.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const [{ data: tenantRow }, { data: latestRows, error: latestError }] = await Promise.all([
    supabase.from('tenants').select('display_name,website_url').eq('tenant_id', tenantId).maybeSingle(),
    admin
      .from('tenant_config_versions')
      .select('version,policy,capabilities')
      .eq('tenant_id', tenantId)
      .order('version', { ascending: false })
      .limit(1),
  ])
  if (latestError) {
    console.error('active config read failed', latestError)
    return Response.json({ status: 'error', reason: 'Could not read the active config. Retry.' }, { status: 502 })
  }
  const latest = (latestRows ?? [])[0] as
    | { version: number; policy: Policy; capabilities: ConfigCaps }
    | undefined

  // Content: a stored version (rollback) or the current drafts. One compiler.
  let policy: Policy
  let caps: ConfigCaps
  if (body.fromVersion !== undefined) {
    const v = Number(body.fromVersion)
    if (!Number.isInteger(v) || v <= 0) {
      return Response.json({ status: 'error', reason: 'fromVersion must be an applied version number.' }, { status: 400 })
    }
    const { data: row, error } = await admin
      .from('tenant_config_versions')
      .select('policy,capabilities')
      .eq('tenant_id', tenantId)
      .eq('version', v)
      .maybeSingle()
    if (error) {
      console.error('config version read failed', error)
      return Response.json({ status: 'error', reason: 'Could not read that version. Retry.' }, { status: 502 })
    }
    const stored = row as { policy?: unknown; capabilities?: unknown } | null
    if (!stored || typeof stored.policy !== 'object' || stored.policy === null || !Array.isArray(stored.capabilities)) {
      return Response.json({ status: 'error', reason: `Version ${v} is not on record for this business.` }, { status: 404 })
    }
    policy = stored.policy as Policy
    caps = stored.capabilities as ConfigCaps
  } else {
    const [rules, setup, capabilities] = await Promise.all([
      getDraftDb(tenantId, 'rules'),
      getDraftDb(tenantId, 'setup'),
      getDraftDb(tenantId, 'capabilities'),
    ])
    const compiled = compileLiveFrom({ rules: rules?.payload, setup: setup?.payload, capabilities: capabilities?.payload })
    if (!compiled.ok) {
      return Response.json({ status: 'error', reason: compiled.reason }, { status: 422 })
    }
    policy = compiled.compiled.policy as unknown as Policy
    // Apply the route-backed capabilities, not the discovery catalogue. The
    // known names have no merchant route in this draft, so naming them would
    // give the governor an allowlist entry with no execution blueprint.
    const mapped = capabilities?.payload !== undefined ? validateCapabilities(capabilities.payload) : null
    const extras = mapped?.ok ? mapped.value.extra ?? [] : []
    if (extras.length === 0) {
      return Response.json(
        {
          status: 'error',
          reason:
            'No routes are mapped — map at least one route on the go-live page before publishing. The catalogue alone is discovery, not a runtime.',
        },
        { status: 422 },
      )
    }
    caps = extras.map((e) => ({
      name: e.name,
      method: e.method,
      path: e.path,
      kind: e.kind,
      dataClass: e.dataClass,
      // A write is held unless the merchant explicitly allowed this exact
      // route to run unattended. Reads never need approval.
      requiresApproval: e.kind === 'write' && e.allowUnattended !== true,
      autoIssue: e.autoIssue,
    }))
  }

  const prev = latest ? { policy: latest.policy, capabilities: latest.capabilities as Caps } : null
  const nextVersion = (latest?.version ?? 0) + 1
  const kinds = new Map(caps.map((c) => [c.name, c.kind]))
  const kindOf = (name: string): 'read' | 'write' | 'unknown' => kinds.get(name) ?? knownKind(name)
  const tier = tierForChange(prev, { policy, capabilities: caps as Caps }, kindOf)

  // Digest binds the policy and capability set, not the transport origin:
  // a later baseUrl change must not invalidate an applied config's audit row.
  const digest = contentDigest({ tenantId, version: nextVersion, policy, capabilities: caps })
  const configHash = contentDigest({ policy, capabilities: caps })

  const websiteUrl =
    typeof tenantRow?.website_url === 'string' && tenantRow.website_url.trim() !== ''
      ? tenantRow.website_url.trim()
      : null
  if (websiteUrl === null) {
    return Response.json(
      { status: 'error', reason: 'Set the business website URL before publishing — the runtime needs an upstream origin.' },
      { status: 422 },
    )
  }

  // Ceremony: typed needs the business name spelled out (blast radius =
  // kill-switch-class); light needs an explicit true (never a default).
  if (tier === 'typed') {
    const name = (tenantRow?.display_name as string | undefined) ?? ''
    if (typeof body.confirm !== 'string' || body.confirm.trim() !== name || name === '') {
      return Response.json(
        {
          status: 'error',
          reason: `This change widens what agents may do — type your business name ("${name}") to apply version ${nextVersion}.`,
          tier,
          version: nextVersion,
        },
        { status: 403 },
      )
    }
  } else if (!(body.confirm === true || (typeof body.confirm === 'string' && /^(yes|y)$/i.test(body.confirm.trim())))) {
    return Response.json(
      { status: 'error', reason: `Confirm with {"confirm": true} to apply narrowing version ${nextVersion}.`, tier, version: nextVersion },
      { status: 403 },
    )
  }

  // One transaction: version row, inventory, runtime pointer. The function is
  // security definer with its own owner/admin check; this route's role read is
  // the UX gate, not the authority.
  const { data: applied, error } = await supabase.rpc('agentport_apply_tenant_config', {
    p_tenant_id: tenantId,
    p_policy: policy,
    p_capabilities: caps,
    p_digest: digest,
    p_config_hash: configHash,
    p_risk_tier: tier,
    p_base_url: websiteUrl,
    p_admin_name: email ?? (tenantRow?.display_name as string | undefined) ?? 'owner',
  })
  if (error) {
    console.error('apply config RPC failed', error)
    const code = (error as { code?: string }).code
    if (code === '42501') {
      return Response.json({ status: 'error', reason: 'Only the owner or an admin can apply a config.' }, { status: 403 })
    }
    if (code === '23505') {
      return Response.json(
        { status: 'error', reason: 'Another apply won the version race — reload versions and apply the next one.' },
        { status: 409 },
      )
    }
    if (code === '22023' || code === '23514') {
      return Response.json(
        { status: 'error', reason: 'The apply payload was rejected by the database. Reload and try again.' },
        { status: 422 },
      )
    }
    return Response.json(
      { status: 'error', reason: 'Could not apply the config. Retry; if it persists, contact support.' },
      { status: 500 },
    )
  }

  const version = typeof applied === 'number' ? applied : nextVersion
  return Response.json({
    status: 'ok',
    tenantId,
    version,
    tier,
    digest,
    next: `Applied version ${version}. The hosted governor reads it on its next registry poll.`,
  })
}

import { createClient } from '@/lib/supabase/server'
import { compileLiveFrom, KNOWN_CAPABILITIES, validateCapabilities } from '@/lib/golive'
import { getDraftDb } from '@/lib/durable-store'
import { contentDigest, tierForChange } from '@/lib/publish'
import { guardStateChange } from '@/lib/request-guard'
import { resolveCallerRole } from '@/lib/tenant'
import { readSelectedTenantId, tenantRefusalResponse } from '@/lib/tenant-server'

export const dynamic = 'force-dynamic'

type Caps = Array<{ name: string }>
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
  return { supabase, t }
}

const knownKind = (name: string): 'read' | 'write' | 'unknown' =>
  (KNOWN_CAPABILITIES.find((c) => c.name === name)?.kind as 'read' | 'write' | undefined) ?? 'unknown'

/**
 * POST /api/publish/approve — the ceremony before bytes.
 *
 * Owner/admin only (role from the session, never the body). Compiles current
 * drafts — or re-presents a stored version for rollback — tiers the change
 * against the last published artifact, runs the matching ceremony (click vs
 * typed business name), and records the approval row bound to the exact
 * content digest. Nothing is distributed here: the merchant signs with
 * `agent-port publish --key` (private key never leaves their machine) and
 * the envelope arrives through /api/publish/artifact, which demands this
 * approval first.
 */
export async function POST(req: Request) {
  const guarded = guardStateChange(req, 'publish:approve')
  if (guarded) return guarded
  const { supabase, t } = await caller()
  if (t.tenantId === null) {
    return tenantRefusalResponse(t)
  }
  if (t.role !== 'owner' && t.role !== 'admin') {
    return Response.json({ status: 'error', reason: 'Only the owner or an admin can approve a publish.' }, { status: 403 })
  }
  const tenantId = t.tenantId
  let body: { confirm?: unknown; fromVersion?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ status: 'error', reason: 'Body must be JSON.' }, { status: 400 })
  }
  const { data: tenantRow } = await supabase
    .from('tenants')
    .select('display_name')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  // Content: stored version (rollback) or current drafts. One compiler.
  let policy: Policy
  let caps: Caps
  let kindOf = knownKind
  if (body.fromVersion !== undefined) {
    const v = Number(body.fromVersion)
    if (!Number.isInteger(v) || v <= 0) {
      return Response.json({ status: 'error', reason: 'fromVersion must be a published version number.' }, { status: 400 })
    }
    const { data: row } = await supabase
      .from('policy_artifacts')
      .select('artifact')
      .eq('tenant_id', tenantId)
      .eq('version', v)
      .maybeSingle()
    const art = (row?.artifact ?? null) as { policy?: unknown; capabilities?: unknown } | null
    if (!art || typeof art.policy !== 'object' || art.policy === null || !Array.isArray(art.capabilities)) {
      return Response.json({ status: 'error', reason: `Version ${v} is not on record for this business.` }, { status: 404 })
    }
    policy = art.policy as Policy
    caps = (art.capabilities as Array<{ name?: unknown }>)
      .filter((c): c is { name: string } => typeof c?.name === 'string')
      .map((c) => ({ name: c.name }))
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
    // Approve the route-backed capabilities, not the discovery catalogue.
    // The known semantic names (searchProducts, createOrder, …) are
    // advertised for discovery but have no merchant route in this draft, so
    // the runtime cannot execute them. Including them here would make the
    // approved digest disagree with the signed artifact, which carries only
    // the routes the merchant actually exposes.
    const mapped = capabilities?.payload !== undefined ? validateCapabilities(capabilities.payload) : null
    const extras = mapped?.ok ? mapped.value.extra ?? [] : []
    caps = extras.map((e) => ({ name: e.name }))
    // Persist the execution descriptors the hosted worker needs. The signed
    // artifact names capabilities; this inventory supplies method/path/kind.
    // Doing it before the approval row means an approval cannot exist without
    // the descriptors the runtime will require at activation.
    const inventory = extras.map((e) => ({
      tenant_id: tenantId,
      name: e.name,
      method: e.method,
      path: e.path,
      kind: e.kind,
      origin: 'mapped' as const,
    }))
    if (inventory.length > 0) {
      const { error: inventoryError } = await supabase
        .from('agent_capabilities')
        .upsert(inventory, { onConflict: 'tenant_id,name' })
      if (inventoryError) {
        return Response.json(
          { status: 'error', reason: `Could not record the capability inventory: ${inventoryError.message}` },
          { status: 500 },
        )
      }
    }
    // Extra kinds for tiering (unknown kinds fail toward typed ceremony).
    const extraKinds = new Map<string, 'read' | 'write'>()
    for (const e of extras) extraKinds.set(e.name, e.kind)
    kindOf = (name: string) => extraKinds.get(name) ?? knownKind(name)
  }

  // Baseline: latest published artifact (none = first publish = typed).
  const { data: latest } = await supabase
    .from('policy_artifacts')
    .select('version, artifact')
    .eq('tenant_id', tenantId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle()
  const prev =
    latest && typeof latest.version === 'number'
      ? {
          policy: ((latest.artifact as { policy?: unknown })?.policy ?? {}) as Policy,
          capabilities: (Array.isArray((latest.artifact as { capabilities?: unknown })?.capabilities)
            ? (latest.artifact as { capabilities: Array<{ name?: unknown }> }).capabilities
            : []
          )
            .filter((c): c is { name: string } => typeof c?.name === 'string')
            .map((c) => ({ name: c.name })),
        }
      : null
  const version = (typeof latest?.version === 'number' ? latest.version : 0) + 1

  const tier = tierForChange(prev, { policy, capabilities: caps }, kindOf)
  // The approval binds the policy and capability set, not the transport
  // origin. `baseUrl` is validated against the registered website at upload
  // time, and the runtime reads the origin from the activation row, so
  // including it here would make an envelope without a signed baseUrl fail
  // to match the approval it was issued for.
  const digest = contentDigest({ tenantId, version, policy, capabilities: caps })

  // Ceremony: typed needs the business name spelled out (blast radius =
  // kill-switch-class); light needs an explicit true (never a default).
  if (tier === 'typed') {
    const name = (tenantRow?.display_name as string | undefined) ?? ''
    if (typeof body.confirm !== 'string' || body.confirm.trim() !== name || name === '') {
      return Response.json(
        {
          status: 'error',
          reason: `This change widens what agents may do — type your business name ("${name}") to approve version ${version}.`,
          tier,
          version,
        },
        { status: 403 },
      )
    }
  } else if (!(body.confirm === true || (typeof body.confirm === 'string' && /^(yes|y)$/i.test(body.confirm.trim())))) {
    return Response.json(
      { status: 'error', reason: `Confirm with {"confirm": true} to approve narrowing version ${version}.`, tier, version },
      { status: 403 },
    )
  }

  const { error } = await supabase.from('publish_approvals').insert({
    tenant_id: tenantId,
    version,
    approver_role: t.role,
    risk_tier: tier,
    digest,
  })
  if (error) {
    return Response.json(
      { status: 'error', reason: 'Version already approved — reload versions and approve the next one.' },
      { status: 409 },
    )
  }
  return Response.json({
    status: 'ok',
    tenantId,
    version,
    tier,
    digest,
    next: `Sign exactly these bytes: agent-port publish --key merchant-private.pem --public-key merchant-public.pem --version ${version} (key never leaves your machine), then upload the envelope.`,
  })
}

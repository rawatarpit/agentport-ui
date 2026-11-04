import { createClient } from '@/lib/supabase/server'
import { compileLiveFrom, KNOWN_CAPABILITIES, validateCapabilities } from '@/lib/golive'
import { getDraftDb } from '@/lib/durable-store'
import { normaliseWorkerUrl } from '@/lib/install-package'
import { contentDigest, tierForChange } from '@/lib/publish'
import type { SignedArtifact } from '@/lib/artifact-canonical'
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
 * content digest. Nothing is distributed here: the response carries the
 * artifact those bytes describe, the browser signs it with a key generated
 * on that device, and the envelope arrives through /api/publish/artifact,
 * which demands this approval first. The private key never reaches this
 * server.
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
    .select('display_name,website_url')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  // Content: stored version (rollback) or current drafts. One compiler.
  let policy: Policy
  let caps: Caps
  let inventory: Array<{ tenant_id: string; name: string; method: string; path: string; kind: 'read' | 'write'; origin: 'mapped' }> = []
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
    caps = extras.map((e) => ({ name: e.name }))
    // The execution descriptors the hosted worker needs. The signed artifact
    // names capabilities; this inventory supplies method/path/kind. It is
    // written after the ceremony below, so a mistyped confirmation does not
    // leave descriptors behind.
    inventory = extras.map((e) => ({
      tenant_id: tenantId,
      name: e.name,
      method: e.method,
      path: e.path,
      kind: e.kind,
      origin: 'mapped' as const,
    }))
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
  // origin. The artifact returned to the browser also carries baseUrl and
  // publicBaseUrl because they are signed bytes; the digest deliberately
  // excludes them, so a later origin change does not invalidate the policy
  // approval. Upload still checks baseUrl against the registered website.
  const digest = contentDigest({ tenantId, version, policy, capabilities: caps })

  // Automatic publishing signs in the merchant's browser, so the artifact it
  // signs must be complete before the approval is recorded. The upstream
  // origin and the worker's tenant URL are server-owned values; a missing one
  // is a named refusal now, not an approval that can never be uploaded.
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
  const worker = normaliseWorkerUrl(process.env.AGENTPORT_WORKER_URL ?? '', tenantId)
  if (!worker.ok) {
    return Response.json(
      { status: 'error', reason: `Automatic publishing needs the hosted governor URL. ${worker.reason}` },
      { status: 422 },
    )
  }
  const artifact: SignedArtifact = {
    tenantId,
    version,
    policy,
    capabilities: caps,
    baseUrl: websiteUrl,
    publicBaseUrl: worker.url,
  }

  // An approval is durable even when its upload never completed. If the
  // content digest still matches, return the same artifact for signing
  // instead of trying to insert the same version again (which would be a
  // permanent 409 for a merchant who reloaded after a network failure).
  // A mismatched digest is a different change; it must not reuse the
  // ceremony that approved other bytes.
  const { data: existingApproval, error: existingApprovalError } = await supabase
    .from('publish_approvals')
    .select('digest,risk_tier')
    .eq('tenant_id', tenantId)
    .eq('version', version)
    .maybeSingle()
  if (existingApprovalError) {
    console.error('existing publish approval read failed', existingApprovalError)
    return Response.json(
      { status: 'error', reason: 'Could not read the existing approval. Retry; if it persists, contact support.' },
      { status: 502 },
    )
  }
  if (existingApproval) {
    if (existingApproval.digest !== digest) {
      return Response.json(
        {
          status: 'error',
          reason: `Version ${version} was already approved for different bytes and was never uploaded. Restore that content or ask support to discard the approval before publishing a new version.`,
          version,
        },
        { status: 409 },
      )
    }
    return Response.json({
      status: 'ok',
      tenantId,
      version,
      tier: typeof existingApproval.risk_tier === 'string' ? existingApproval.risk_tier : tier,
      digest,
      artifact,
      reused: true,
      next: `Version ${version} is already approved. This browser will sign and upload the exact bytes now.`,
    })
  }

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

  // One transaction: the approval row and the capability inventory commit
  // together or not at all. A two-step write could leave descriptors that no
  // approval covers after a failure between them — the exact drift this RPC
  // exists to remove. The function is security invoker; publish_approvals RLS
  // still requires owner/admin and approved_by = auth.uid().
  const { error } = await supabase.rpc('agentport_record_publish_approval', {
    p_tenant_id: tenantId,
    p_version: version,
    p_risk_tier: tier,
    p_digest: digest,
    p_inventory: inventory.length > 0 ? inventory : null,
  })
  if (error) {
    console.error('publish approval RPC failed', error)
    const code = (error as { code?: string }).code
    if (code === '23505') {
      return Response.json(
        { status: 'error', reason: 'Version already approved — reload versions and approve the next one.' },
        { status: 409 },
      )
    }
    if (code === '42501') {
      return Response.json(
        { status: 'error', reason: 'Only the owner or an admin can approve a publish.' },
        { status: 403 },
      )
    }
    if (code === '22023') {
      return Response.json(
        { status: 'error', reason: 'The approval payload was rejected by the database. Reload and try again.' },
        { status: 422 },
      )
    }
    return Response.json(
      { status: 'error', reason: 'Could not record the approval. Retry; if it persists, contact support.' },
      { status: 500 },
    )
  }
  return Response.json({
    status: 'ok',
    tenantId,
    version,
    tier,
    digest,
    artifact,
    next: `Approved version ${version}. This browser will sign and upload the exact bytes now.`,
  })
}

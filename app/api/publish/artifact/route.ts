import { createClient } from '@/lib/supabase/server'
import { contentDigest } from '@/lib/publish'
import { guardStateChange } from '@/lib/request-guard'
import { resolveCallerRole } from '@/lib/tenant'
import { readSelectedTenantId, tenantRefusalResponse } from '@/lib/tenant-server'

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
  return { supabase, t }
}

/**
 * POST /api/publish/artifact — intake for a merchant-signed envelope.
 *
 * Owner/admin only. Accepts exactly what `agent-port publish --key`
 * produced: {artifact: {tenantId, version, policy, capabilities},
 * signature}. Refused unless: the tenant matches the session, the version
 * is a positive integer, policy/capabilities have the right shapes, a
 * signature is present, no kill-switch field rides along (defense in depth
 * behind the type + boundary proofs), and an approval row already covers
 * this (tenant, version) — the ceremony must precede the bytes, and the
 * recorded digest must equal these bytes, or the approval covered
 * something else. Cryptographic verification stays runtime-side
 * (verifyArtifact, local merchant key); a row this route accepts but the
 * runtime cannot verify is refused there, loudly, and never enforces.
 */
export async function POST(req: Request) {
  const guarded = guardStateChange(req, 'publish:artifact')
  if (guarded) return guarded
  const { supabase, t } = await caller()
  if (t.tenantId === null) {
    return tenantRefusalResponse(t)
  }
  if (t.role !== 'owner' && t.role !== 'admin') {
    return Response.json({ status: 'error', reason: 'Only the owner or an admin can upload a signed envelope.' }, { status: 403 })
  }
  const tenantId = t.tenantId
  let body: { artifact?: unknown; signature?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ status: 'error', reason: 'Body must be JSON.' }, { status: 400 })
  }
  const art = (body.artifact ?? null) as
    | {
        tenantId?: unknown
        version?: unknown
        policy?: unknown
        capabilities?: unknown
        baseUrl?: unknown
        publicBaseUrl?: unknown
      }
    | null
  const sig = typeof body.signature === 'string' ? body.signature.trim() : ''
  if (!art || typeof art !== 'object') {
    return Response.json({ status: 'error', reason: 'Envelope must carry {artifact, signature} from `agent-port publish`.' }, { status: 400 })
  }
  if (art.tenantId !== tenantId) {
    return Response.json({ status: 'error', reason: 'Envelope names a different business than this login.' }, { status: 403 })
  }
  const version = Number(art.version)
  if (!Number.isInteger(version) || version <= 0) {
    return Response.json({ status: 'error', reason: 'Envelope version must be a positive whole number.' }, { status: 400 })
  }
  if (typeof art.policy !== 'object' || art.policy === null || Array.isArray(art.policy)) {
    return Response.json({ status: 'error', reason: 'Envelope policy must be an object.' }, { status: 400 })
  }
  if (
    !Array.isArray(art.capabilities) ||
    art.capabilities.some((c) => typeof (c as { name?: unknown })?.name !== 'string')
  ) {
    return Response.json({ status: 'error', reason: 'Envelope capabilities must be [{name}].' }, { status: 400 })
  }
  for (const key of ['baseUrl', 'publicBaseUrl'] as const) {
    const value = art[key]
    if (value !== undefined && (typeof value !== 'string' || value.trim() === '')) {
      return Response.json({ status: 'error', reason: `Envelope ${key} must be a non-empty string when present.` }, { status: 400 })
    }
  }
  if (sig === '') {
    return Response.json({ status: 'error', reason: 'Envelope carries no signature — sign it with your merchant key first.' }, { status: 400 })
  }
  if ((art.policy as Record<string, unknown>).emergencyKillSwitch !== undefined) {
    return Response.json(
      { status: 'error', reason: 'Envelope carries a kill-switch field. No publish path transports it — remove it and re-sign.' },
      { status: 400 },
    )
  }
  const policy = art.policy as Record<string, unknown>
  const caps = (art.capabilities as Array<{ name: string }>).map((c) => ({ name: c.name }))
  const { data: tenantRow } = await supabase
    .from('tenants')
    .select('website_url')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  const signedBaseUrl = typeof art.baseUrl === 'string' ? art.baseUrl : undefined
  const websiteUrl =
    typeof tenantRow?.website_url === 'string' && tenantRow.website_url.trim() !== ''
      ? tenantRow.website_url
      : undefined
  if (signedBaseUrl !== undefined && websiteUrl !== undefined && signedBaseUrl !== websiteUrl) {
    return Response.json(
      { status: 'error', reason: 'Envelope baseUrl does not match the website registered for this business.' },
      { status: 409 },
    )
  }
  const digest = contentDigest({
    tenantId,
    version,
    policy,
    capabilities: caps,
    ...(signedBaseUrl !== undefined ? { baseUrl: signedBaseUrl } : {}),
  })
  const { data: approval } = await supabase
    .from('publish_approvals')
    .select('digest')
    .eq('tenant_id', tenantId)
    .eq('version', version)
    .maybeSingle()
  if (!approval) {
    return Response.json(
      { status: 'error', reason: `Version ${version} has no approval on record — approve it first, then upload.` },
      { status: 409 },
    )
  }
  if ((approval.digest as string) !== digest) {
    return Response.json(
      { status: 'error', reason: `These bytes are not what version ${version}'s approval covered — re-approve the exact content, then upload.` },
      { status: 409 },
    )
  }
  const { error } = await supabase.from('policy_artifacts').insert({
    tenant_id: tenantId,
    version,
    artifact: {
      tenantId,
      version,
      policy,
      capabilities: caps,
      ...(signedBaseUrl !== undefined ? { baseUrl: signedBaseUrl } : {}),
      ...(typeof art.publicBaseUrl === 'string' ? { publicBaseUrl: art.publicBaseUrl } : {}),
    },
    signature: sig,
  })
  if (error) {
    return Response.json(
      { status: 'error', reason: `Version ${version} is already stored — approve the next version for new content.` },
      { status: 409 },
    )
  }
  return Response.json({ status: 'ok', tenantId, version, digest })
}

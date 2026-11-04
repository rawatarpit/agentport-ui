import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { contentDigest, publicBaseUrlProblem, verifySignedArtifact } from '@/lib/publish'
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
  return { supabase, t, user: data.user }
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
 * something else. The signature is verified here against the envelope key
 * AND the key is checked against the tenant's pin, so the console never
 * stores an envelope the worker will refuse. The worker still verifies
 * locally against the pinned key — that remains the control; this is the
 * early, named refusal.
 */
export async function POST(req: Request) {
  const guarded = guardStateChange(req, 'publish:artifact')
  if (guarded) return guarded
  const { supabase, t, user } = await caller()
  if (t.tenantId === null) {
    return tenantRefusalResponse(t)
  }
  if (t.role !== 'owner' && t.role !== 'admin') {
    return Response.json({ status: 'error', reason: 'Only the owner or an admin can upload a signed envelope.' }, { status: 403 })
  }
  const tenantId = t.tenantId
  let body: { artifact?: unknown; signature?: unknown; publicKey?: unknown }
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
  const publicKey = typeof body.publicKey === 'string' ? body.publicKey.trim() : ''
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
  const publicBaseUrlIssue = publicBaseUrlProblem(art.publicBaseUrl, tenantId)
  if (publicBaseUrlIssue !== null) {
    return Response.json({ status: 'error', reason: publicBaseUrlIssue }, { status: 422 })
  }
  if (sig === '') {
    return Response.json({ status: 'error', reason: 'Envelope carries no signature — sign it with your merchant key first.' }, { status: 400 })
  }
  // The runtime pins the key the envelope names. Without it the worker cannot
  // verify the artifact, so accepting the bytes would only create a tenant
  // that can never boot. `agent-port publish` always includes this field.
  if (!publicKey.startsWith('-----BEGIN PUBLIC KEY-----')) {
    return Response.json(
      {
        status: 'error',
        reason:
          'Envelope carries no publicKey — re-run agent-port publish (it includes the public half automatically) and upload that envelope.',
      },
      { status: 400 },
    )
  }
  if ((art.policy as Record<string, unknown>).emergencyKillSwitch !== undefined) {
    return Response.json(
      { status: 'error', reason: 'Envelope carries a kill-switch field. No publish path transports it — remove it and re-sign.' },
      { status: 400 },
    )
  }
  const policy = art.policy as Record<string, unknown>
  const caps = (art.capabilities as Array<{ name: string }>).map((c) => ({ name: c.name }))
  const signedBaseUrl = typeof art.baseUrl === 'string' ? art.baseUrl : undefined
  const signedPublicBaseUrl = typeof art.publicBaseUrl === 'string' ? art.publicBaseUrl : undefined
  const signedArtifact = {
    tenantId,
    version,
    policy,
    capabilities: caps,
    ...(signedBaseUrl !== undefined ? { baseUrl: signedBaseUrl } : {}),
    ...(signedPublicBaseUrl !== undefined ? { publicBaseUrl: signedPublicBaseUrl } : {}),
  }
  const verified = verifySignedArtifact({ artifact: signedArtifact, signature: sig, publicKey }, { expectedTenantId: tenantId })
  if (!verified.ok) {
    return Response.json(
      { status: 'error', reason: `Envelope signature did not verify: ${verified.reason}. Re-run agent-port publish and upload that envelope.` },
      { status: 400 },
    )
  }
  // The envelope's public key is not self-registering after first activation.
  // Check the pin before the bytes are stored so a wrong key is a named 409,
  // not a stored artifact plus a failed activation.
  const { data: runtimeRow, error: runtimeReadError } = await createAdminClient()
    .from('tenant_runtime')
    .select('policy_public_key_pem')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (runtimeReadError) {
    console.error('runtime key pin read failed', runtimeReadError)
    return Response.json(
      { status: 'error', reason: 'Could not read the runtime key pin. Retry; if it persists, contact support.' },
      { status: 502 },
    )
  }
  const pinnedKey = typeof runtimeRow?.policy_public_key_pem === 'string' ? runtimeRow.policy_public_key_pem.trim() : ''
  if (pinnedKey !== '' && pinnedKey !== publicKey) {
    return Response.json(
      {
        status: 'error',
        reason:
          'This business already has a different pinned publishing key. Key rotation is an operator ceremony — publish with the pinned key, or ask support to rotate it.',
      },
      { status: 409 },
    )
  }
  const { data: tenantRow } = await supabase
    .from('tenants')
    .select('website_url')
    .eq('tenant_id', tenantId)
    .maybeSingle()
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
  const runtimeBaseUrl = signedBaseUrl ?? websiteUrl
  if (runtimeBaseUrl === undefined) {
    return Response.json(
      { status: 'error', reason: 'Set the business website URL before publishing — the runtime needs an upstream origin.' },
      { status: 422 },
    )
  }
  // Match the approval digest: policy + capability set, not the origin.
  // The origin is checked against the registered website above and the
  // worker reads it from the activation row.
  const digest = contentDigest({ tenantId, version, policy, capabilities: caps })
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
  // The worker only serves a capability that the signed artifact names AND
  // that has an execution blueprint in the dashboard inventory. Activating a
  // tenant whose artifact names an unmapped capability would park it, so
  // refuse here rather than report a success that never serves.
  const { data: inventoryRows, error: inventoryError } = await createAdminClient()
    .from('agent_capabilities')
    .select('name')
    .eq('tenant_id', tenantId)
  if (inventoryError) {
    // Raw PostgREST text names relations and constraints. Keep it in the
    // server log; the browser gets a fixed sentence.
    console.error('capability inventory read failed', inventoryError)
    return Response.json(
      { status: 'error', reason: 'Could not read the capability inventory. Retry; if it persists, contact support.' },
      { status: 502 },
    )
  }
  const mappedNames = new Set((inventoryRows ?? []).map((row) => row.name as string))
  const missing = caps.map((c) => c.name).filter((name) => !mappedNames.has(name))
  if (missing.length > 0) {
    return Response.json(
      {
        status: 'error',
        reason: `The signed artifact names capabilities with no execution blueprint in this workspace: ${missing.join(', ')}. Map them on the Map screen, or remove them from the signed config and publish again.`,
      },
      { status: 422 },
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
      ...(signedPublicBaseUrl !== undefined ? { publicBaseUrl: signedPublicBaseUrl } : {}),
    },
    signature: sig,
  })
  if (error) {
    return Response.json(
      { status: 'error', reason: `Version ${version} is already stored — approve the next version for new content.` },
      { status: 409 },
    )
  }

  // Activate the runtime in the same request. The worker polls the registry,
  // verifies this signed artifact locally, and begins serving `/t/<tenant>`.
  // A failure here leaves the artifact stored but not servable; retrying the
  // activation is safe and idempotent.
  const adminName = (user?.email ?? 'operator').slice(0, 120)
  const { data: revision, error: activateError } = await createAdminClient().rpc(
    'agentport_activate_tenant_runtime',
    {
      p_tenant_id: tenantId,
      p_admin_name: adminName,
      p_policy_public_key_pem: publicKey,
      p_base_url: runtimeBaseUrl,
    },
  )
  if (activateError) {
    console.error('runtime activation failed', activateError)
    // The table trigger is the last line of defense against key replacement.
    // A race can reach it after the route's pin read, so name it rather than
    // reporting a generic activation failure.
    const pinnedRefusal = typeof activateError.message === 'string' && activateError.message.includes('pinned')
    return Response.json(
      {
        status: 'error',
        reason: pinnedRefusal
          ? `Artifact v${version} is stored, but its public key does not match this business's pinned key. Key rotation is an operator ceremony.`
          : `Artifact v${version} is stored, but runtime activation failed. Retry; if it persists, contact support.`,
        tenantId,
        version,
        digest,
        activated: false,
      },
      { status: pinnedRefusal ? 409 : 502 },
    )
  }
  return Response.json({ status: 'ok', tenantId, version, digest, activated: true, revision })
}

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

/**
 * Durable console state (installs, drafts, PR records).
 *
 * Replaces the lib/store.ts RAM maps for exactly these three areas — the
 * ones whose loss breaks onboarding ("installed but says connect") and PR
 * opening ("nothing to publish yet" on a fresh process). Every read and
 * every write except the verified install write goes through the session
 * client, so RLS scopes rows to the caller's own tenants; every function
 * takes an explicit tenantId AND filters on it, so a permissive policy can
 * never leak another tenant's row into this one.
 *
 * Custody: explicit column lists, ids/names/payloads/timestamps only — no
 * amounts, no PII, no tokens, no key material. Saving a draft never
 * deploys; opening a PR never merges.
 *
 * Writes to `github_installations` are the one exception to the session
 * client: `authenticated` has no INSERT/UPDATE grant, because a tenant owner
 * must not be able to claim an arbitrary GitHub installation id. Only the
 * callback, after `verifyInstallationOwnership`, calls the service-role-only
 * `record_github_install` RPC through `createAdminClient`.
 */

export type DbInstallation = {
  installationId: number
  accountLogin: string
  installerLogin: string | null
  receivedAt: string
}

export type DbDraft = {
  section: 'setup' | 'capabilities' | 'rules'
  payload: unknown
  updatedAt: string
}

export type DbTenantProfile = { businessName: string; websiteUrl: string | null }

/**
 * The two merchant facts the discovery package needs: a display name and the
 * site origin. No policy, no secret, no worker credential. The hosted worker
 * URL is environment configuration, deliberately not copied into a tenant row
 * that the browser can read.
 */
export async function getTenantProfileDb(tenantId: string): Promise<DbTenantProfile | null> {
  try {
    const db = createClient()
    const { data, error } = await db
      .from('tenants')
      .select('display_name, website_url')
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (error || !data) return null
    const row = data as { display_name: string | null; website_url: string | null }
    return {
      businessName: (row.display_name ?? '').trim(),
      websiteUrl: row.website_url?.trim() || null,
    }
  } catch {
    return null
  }
}

export type DbPullRequest = {
  repo: string
  number: number
  url: string
  branch: string
  installationId: number
  recordedAt: string
}

/** Installs linked to one tenant, oldest first. Empty = honest empty. */
export async function getInstallationsDb(tenantId: string): Promise<DbInstallation[]> {
  try {
    const db = createClient()
    const { data, error } = await db
      .from('github_installations')
      .select('installation_id, account_login, installer_login, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true })
    if (error || !data) return []
    return (data as Array<{ installation_id: number; account_login: string; installer_login: string | null; created_at: string }>)
      .filter((r) => Number.isInteger(r.installation_id))
      .map((r) => ({
        installationId: r.installation_id,
        accountLogin: r.account_login ?? '',
        installerLogin: r.installer_login,
        receivedAt: r.created_at,
      }))
  } catch {
    return []
  }
}

export type RecordInstallationResult = 'ok' | 'attached' | 'error'

/**
 * Link (or relabel) an installation after the callback proved ownership.
 * `attached` means the numeric id is already linked to a different tenant;
 * the unique index refuses the transfer and the merchant gets a specific
 * reason instead of an impossible retry.
 */
export async function recordInstallationDb(
  tenantId: string,
  inst: { installationId: number; accountLogin: string; installerLogin: string | null },
): Promise<RecordInstallationResult> {
  try {
    if (!Number.isInteger(inst.installationId) || inst.installationId <= 0) return 'error'
    const db = createAdminClient()
    const { error } = await db.rpc('record_github_install', {
      p_tenant_id: tenantId,
      p_installation_id: inst.installationId,
      p_account_login: inst.accountLogin ?? '',
      p_installer_login: inst.installerLogin,
    })
    if (!error) return 'ok'
    if (error.code === '23505') return 'attached'
    return 'error'
  } catch {
    return 'error'
  }
}

export async function installationKnownDb(tenantId: string, installationId: number): Promise<boolean> {
  if (!Number.isInteger(installationId) || installationId <= 0) return false
  const rows = await getInstallationsDb(tenantId)
  return rows.some((r) => r.installationId === installationId)
}

/** One draft section, or null. Null renders as unanswered, never as zero. */
export async function getDraftDb(tenantId: string, section: DbDraft['section']): Promise<DbDraft | null> {
  try {
    const db = createClient()
    const { data, error } = await db
      .from('dashboard_drafts')
      .select('payload, updated_at')
      .eq('tenant_id', tenantId)
      .eq('section', section)
      .maybeSingle()
    if (error || !data) return null
    const r = data as { payload: unknown; updated_at: string }
    return { section, payload: r.payload, updatedAt: r.updated_at }
  } catch {
    return null
  }
}

/** Sections with a saved draft — drives connect steps 4/5. */
export async function listDraftSections(tenantId: string): Promise<Set<string>> {
  try {
    const db = createClient()
    const { data, error } = await db.from('dashboard_drafts').select('section').eq('tenant_id', tenantId)
    if (error || !data) return new Set()
    return new Set((data as Array<{ section: string }>).map((r) => r.section))
  } catch {
    return new Set()
  }
}

/** Validated upstream; this writes what it is given. Saving never deploys. */
export async function putDraftDb(
  tenantId: string,
  section: DbDraft['section'],
  payload: unknown,
): Promise<{ updatedAt: string } | null> {
  try {
    const updatedAt = new Date().toISOString()
    const db = createClient()
    const { error } = await db.from('dashboard_drafts').upsert(
      { tenant_id: tenantId, section, payload, updated_at: updatedAt },
      { onConflict: 'tenant_id,section' },
    )
    if (error) return null
    return { updatedAt }
  } catch {
    return null
  }
}

/** Install PR hints for one tenant. Authority stays GitHub (read live). */export async function getPullRequestsDb(tenantId: string): Promise<DbPullRequest[]> {
  try {
    const db = createClient()
    const { data, error } = await db
      .from('install_pull_requests')
      .select('repo, pr_number, pr_url, branch, installation_id, recorded_at')
      .eq('tenant_id', tenantId)
      .order('recorded_at', { ascending: false })
    if (error || !data) return []
    return (
      data as Array<{
        repo: string
        pr_number: number
        pr_url: string
        branch: string
        installation_id: number
        recorded_at: string
      }>
    ).map((r) => ({
      repo: r.repo,
      number: r.pr_number,
      url: r.pr_url,
      branch: r.branch,
      installationId: r.installation_id,
      recordedAt: r.recorded_at,
    }))
  } catch {
    return []
  }
}

/** Re-running replaces the row (same branch, same PR), never appends. */
export async function recordPullRequestDb(
  tenantId: string,
  pr: { repo: string; number: number; url: string; branch: string; installationId: number },
): Promise<boolean> {
  try {
    if (!pr.repo || !pr.repo.includes('/') || !Number.isInteger(pr.number)) return false
    const db = createClient()
    const { error } = await db.from('install_pull_requests').upsert(
      {
        tenant_id: tenantId,
        repo: pr.repo,
        pr_number: pr.number,
        pr_url: pr.url,
        branch: pr.branch,
        installation_id: pr.installationId,
        recorded_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id,repo' },
    )
    return !error
  } catch {
    return false
  }
}

export type ConsumedInstallState = {
  tenantId: string
  initiatedBy: string
  purpose: 'install' | 'oauth'
}

/** Issue a one-time install state. The raw state is never stored. */
export async function insertInstallState(args: {
  stateHash: string
  tenantId: string
  initiatedBy: string
  purpose: 'install' | 'oauth'
  expiresAt: string
}): Promise<boolean> {
  try {
    const db = createClient()
    const { error } = await db.from('github_install_states').insert({
      state_hash: args.stateHash,
      tenant_id: args.tenantId,
      initiated_by: args.initiatedBy,
      purpose: args.purpose,
      expires_at: args.expiresAt,
    })
    return !error
  } catch {
    return false
  }
}

/**
 * Atomically consume a state: exactly one UPDATE wins (consumed_at IS NULL
 * AND expires_at > now()), returning the bound tenant + initiator. Zero
 * rows back means missing, expired, or already replayed — all refuse the
 * same way, with no oracle distinguishing them.
 */
export async function consumeInstallState(stateHash: string): Promise<ConsumedInstallState | null> {
  try {
    if (!/^[0-9a-f]{64}$/.test(stateHash)) return null
    const db = createClient()
    const { data, error } = await db
      .from('github_install_states')
      .update({ consumed_at: new Date().toISOString() })
      .eq('state_hash', stateHash)
      .is('consumed_at', null)
      .gt('expires_at', new Date().toISOString())
      .select('tenant_id, initiated_by, purpose')
    if (error || !data || data.length !== 1) return null
    const row = data[0] as { tenant_id: string; initiated_by: string; purpose: string }
    if (row.purpose !== 'install' && row.purpose !== 'oauth') return null
    return { tenantId: row.tenant_id, initiatedBy: row.initiated_by, purpose: row.purpose }
  } catch {
    return null
  }
}

/** Disconnect: delete the tenant's own install row. RLS scopes the blast. */
export async function deleteInstallationDb(tenantId: string, installationId: number): Promise<boolean> {
  try {
    if (!Number.isInteger(installationId) || installationId <= 0) return false
    const db = createClient()
    const { error, count } = await db
      .from('github_installations')
      .delete({ count: 'exact' })
      .eq('tenant_id', tenantId)
      .eq('installation_id', installationId)
    if (error) return false
    return (count ?? 0) > 0
  } catch {
    return false
  }
}

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Caller identity is proven by Supabase Auth, never by a body field.
 *
 * The broker receives the caller's access token from the console over TLS,
 * verifies it with Supabase Auth, then reads tenant membership through the
 * caller's own JWT so RLS applies. The broker's database role cannot read
 * these tables at all.
 */
export type Caller = { userId: string; client: SupabaseClient }

export type CallerRefusal = { error: string; status: 401 | 403 }

export type TenantCaller = { caller: Caller; role: string }

export async function verifyUser(
  config: { supabaseUrl: string; supabaseAnonKey: string },
  jwt: string,
): Promise<Caller | CallerRefusal> {
  if (!jwt) return { error: 'Sign in first.', status: 401 }
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    return { error: 'Session verification is not configured.', status: 401 }
  }
  const client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  try {
    const { data, error } = await client.auth.getUser(jwt)
    if (error || !data.user) return { error: 'Sign in first.', status: 401 }
    return { userId: data.user.id, client }
  } catch {
    return { error: 'Sign in first.', status: 401 }
  }
}

export async function roleFor(caller: Caller, tenantId: string): Promise<string | null> {
  try {
    const { data, error } = await caller.client
      .from('tenant_members')
      .select('role')
      .eq('user_id', caller.userId)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (error || !data) return null
    const row = data as { role?: unknown }
    return typeof row.role === 'string' ? row.role : null
  } catch {
    return null
  }
}

/** Verify the caller is a member of this exact tenant and return their role. */
export async function verifyTenantCaller(
  config: { supabaseUrl: string; supabaseAnonKey: string },
  jwt: string,
  tenantId: string,
): Promise<TenantCaller | CallerRefusal> {
  if (!tenantId) return { error: 'Choose a workspace first.', status: 403 }
  const caller = await verifyUser(config, jwt)
  if ('error' in caller) return caller
  const role = await roleFor(caller, tenantId)
  if (!role) return { error: 'You are not a member of this business.', status: 403 }
  return { caller, role }
}

export async function installationKnown(
  caller: Caller,
  tenantId: string,
  installationId: number,
): Promise<boolean> {
  if (!Number.isSafeInteger(installationId) || installationId <= 0) return false
  try {
    const { data, error } = await caller.client
      .from('github_installations')
      .select('installation_id')
      .eq('tenant_id', tenantId)
      .eq('installation_id', installationId)
      .maybeSingle()
    return !error && !!data
  } catch {
    return false
  }
}

export type InstallationRow = {
  installationId: number
  accountLogin: string
  installerLogin: string | null
  receivedAt: string
}

export async function listInstallations(caller: Caller, tenantId: string): Promise<InstallationRow[]> {
  try {
    const { data, error } = await caller.client
      .from('github_installations')
      .select('installation_id, account_login, installer_login, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true })
    if (error || !data) return []
    return (data as Array<{
      installation_id: number
      account_login: string | null
      installer_login: string | null
      created_at: string
    }>)
      .filter((row) => Number.isSafeInteger(row.installation_id))
      .map((row) => ({
        installationId: row.installation_id,
        accountLogin: row.account_login ?? '',
        installerLogin: row.installer_login,
        receivedAt: row.created_at,
      }))
  } catch {
    return []
  }
}

export type Drafts = { rules?: unknown; setup?: unknown; capabilities?: unknown }

export async function getDrafts(caller: Caller, tenantId: string): Promise<Drafts> {
  try {
    const { data, error } = await caller.client
      .from('dashboard_drafts')
      .select('section,payload')
      .eq('tenant_id', tenantId)
    if (error || !data) return {}
    const drafts: Drafts = {}
    for (const row of data as Array<{ section: string; payload: unknown }>) {
      if (row.section === 'rules' || row.section === 'setup' || row.section === 'capabilities') {
        drafts[row.section] = row.payload
      }
    }
    return drafts
  } catch {
    return {}
  }
}

export type TenantProfile = { businessName: string; websiteUrl: string | null }

export async function getProfile(caller: Caller, tenantId: string): Promise<TenantProfile | null> {
  try {
    const { data, error } = await caller.client
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

export type PullRequestRow = {
  repo: string
  number: number
  url: string
  branch: string
  installationId: number
}

export async function getPullRequest(
  caller: Caller,
  tenantId: string,
  repo: string,
): Promise<PullRequestRow | null> {
  try {
    const { data, error } = await caller.client
      .from('install_pull_requests')
      .select('repo, pr_number, pr_url, branch, installation_id')
      .eq('tenant_id', tenantId)
      .eq('repo', repo)
      .maybeSingle()
    if (error || !data) return null
    const row = data as {
      repo: string
      pr_number: number
      pr_url: string
      branch: string
      installation_id: number
    }
    return {
      repo: row.repo,
      number: row.pr_number,
      url: row.pr_url,
      branch: row.branch,
      installationId: row.installation_id,
    }
  } catch {
    return null
  }
}

/** PR rows are hints, not authority; GitHub is read live for state. */
export async function recordPullRequest(
  caller: Caller,
  tenantId: string,
  pr: PullRequestRow,
): Promise<boolean> {
  try {
    const { error } = await caller.client.from('install_pull_requests').upsert(
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

import { getHome, getLatestPush, getLiveArtifact, hasAnalyticsEvents } from '@/lib/backend-reads'
import { getInstallationsDb, getPullRequestsDb, installationKnownDb, listDraftSections } from '@/lib/durable-store'
import { mintInstallationTokenFor, readPrState } from '@/lib/github'
import { resolveRequestTenant, tenantRefusalResponse } from '@/lib/tenant-server'

import { enforceRateLimit } from '@/lib/request-guard'

export const dynamic = 'force-dynamic'

type Step = { n: string; title: string; body: string; state: 'missing' | 'done'; href?: string }

/**
 * GET /api/connect — the front door as computed state, from the backend.
 *
 * Liveness truth (steps 1, 7, 8, 6-display) comes from Supabase via RLS:
 * session → tenant_members → v_tenant_home / push_batches /
 * analytics_events / policy_artifacts. Installs, drafts, and PR hints come
 * from the durable console tables. No RAM anywhere on this path — an
 * unreadable backend renders `missing`/unknown, never a green guess.
 */
export async function GET(req: Request) {
  const limited = enforceRateLimit(req, 'github:read')
  if (limited) return limited

  const tenant = await resolveRequestTenant()
  const sessionEmail = tenant.email
  if (tenant.userId && tenant.active.status === 'selection_required') {
    return tenantRefusalResponse(tenant.active)
  }
  if (tenant.userId && tenant.active.status === 'denied') {
    return tenantRefusalResponse(tenant.active)
  }
  const tenantId = tenant.active.status === 'active' ? tenant.active.tenantId : null

  // Logged-out callers get honest missing everywhere: no session means no
  // tenant, and no demo id is ever reported as theirs. Every read below is
  // filtered by the selected tenant; RLS alone returns the union.
  const home = tenantId ? await getHome(tenantId) : null
  const push = tenantId ? await getLatestPush(tenantId) : null
  const analytics = tenantId ? await hasAnalyticsEvents(tenantId) : false
  const artifact = tenantId ? await getLiveArtifact(tenantId) : null

  const sections = tenantId ? await listDraftSections(tenantId) : new Set<string>()
  const setup = sections.has('setup')
  const caps = sections.has('capabilities')
  const rules = sections.has('rules')
  const setupReady = setup || rules
  const liveVersion = artifact?.version ?? null
  const installations = tenantId ? await getInstallationsDb(tenantId) : []
  const prs = tenantId ? await getPullRequestsDb(tenantId) : []

  // The checklist must match the dashboard: a revoked install is not
  // "connected", and a PR row is not "merged" until GitHub says so.
  let installed = false
  for (const inst of installations) {
    const minted = await mintInstallationTokenFor(inst.installationId)
    if (minted.ok) {
      installed = true
      break
    }
  }
  let merged = false
  for (const pr of prs) {
    if (!tenantId || !(await installationKnownDb(tenantId, pr.installationId))) continue
    const minted = await mintInstallationTokenFor(pr.installationId)
    if (!minted.ok) continue
    const state = await readPrState({ installationToken: minted.token, repoFullName: pr.repo, prNumber: pr.number })
    if (state.ok && state.merged) {
      merged = true
      break
    }
  }

  const account = sessionEmail
    ? { done: true as const, body: `Signed in as ${sessionEmail}.` }
    : home
      ? { done: true as const, body: `Signed in as ${home.display_name}.` }
      : { done: false as const, body: 'An account with us — email and password. GitHub comes later, for your repo, not your identity.' }

  const steps: Step[] = [
    {
      n: '1',
      title: 'Create your account',
      body: account.body,
      state: account.done ? 'done' : 'missing',
    },
    {
      n: '2',
      title: 'Set your starter rules',
      body: 'Four plain questions. The install package is generated from these answers — nothing is live yet.',
      state: setupReady ? 'done' : 'missing',
      href: '/setup',
    },
    {
      n: '3',
      title: 'Pick capabilities and set rules',
      body: 'What agents may see, what waits for you, what is always no. Drafts until you publish.',
      state: caps && rules ? 'done' : 'missing',
      href: '/rules',
    },
    {
      n: '4',
      title: 'Connect GitHub and choose your website repo',
      body: installed
        ? 'GitHub is connected for this business — pick repositories below and open the install pull request.'
        : 'Your website’s code lives on GitHub: install the App and pick the repo. We never see your password.',
      state: installed ? 'done' : 'missing',
    },
    {
      n: '5',
      title: 'Open the install pull request',
      body: prs.length > 0
        ? `${prs.length} pull request${prs.length === 1 ? '' : 's'} opened — review on GitHub.`
        : 'Adds `agentport/` and the discovery files your site serves. It is not a runtime, SDK, or binary.',
      state: prs.length > 0 ? 'done' : 'missing',
    },
    {
      n: '6',
      title: 'Review and merge the pull request',
      body: prs.length > 0
        ? 'Review it on GitHub. You merge; your normal CI/CD deploys it. We cannot merge into a protected branch.'
        : 'The merge is your signature — nothing here can merge for you.',
      state: merged ? 'done' : 'missing',
    },
    {
      n: '7',
      title: 'Go live — publish',
      body: liveVersion !== null
        ? `Published as version ${liveVersion}. Your site picks it up from here.`
        : 'Review the plain-language summary and publish — the hosted governor enforces it.',
      state: liveVersion !== null ? 'done' : 'missing',
      href: '/rules',
    },
    {
      n: '8',
      title: 'Watch it work',
      body: push
        ? 'Your site is checking in — the overview shows what it enforces right now.'
        : 'Until your site first checks in, live screens honestly say unknown.',
      state: push ? 'done' : 'missing',
    },
    {
      n: '9',
      title: 'Come back for the numbers',
      body: analytics
        ? 'Counts flowing — by capability and by rule, never amounts, never rows.'
        : 'Counts by capability and rule land here once your site reports them.',
      state: analytics ? 'done' : 'missing',
      href: '/analytics',
    },
  ]
  return Response.json({ status: 'ok', tenantId, steps })
}

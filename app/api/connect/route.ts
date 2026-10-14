import { getDraft, getInstallations, getPullRequests, resolveTenant } from '@/lib/store'
import { getHome, getLatestPush, getLiveArtifact, hasAnalyticsEvents } from '@/lib/backend-reads'
import { resolveCallerTenant } from '@/lib/tenant'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type Step = { n: string; title: string; body: string; state: 'missing' | 'done'; href?: string }

/**
 * GET /api/connect — the front door as computed state, from the backend.
 *
 * Liveness truth (steps 1, 7, 8, 6-display) comes from Supabase via RLS:
 * session → tenant_members → v_tenant_home / push_batches /
 * analytics_events / policy_artifacts. No RAM fallback — an unreadable
 * backend renders `missing`/unknown, never a green guess.
 *
 * Drafts + installs + PR records still read RAM maps (no durable tables
 * exist yet — SDK repo owns the DB). Liveness steps (1, 7, 8) and the live
 * version (6) read only the backend: no RAM fallback — an unreadable
 * backend renders `missing`/unknown, never a green guess. Step 6 stays
 * `missing` until a durable artifact row exists.
 */
export async function GET() {
  const supabase = createClient()
  let tenantId: string | null = null
  let sessionEmail: string | null = null
  try {
    const { data } = await supabase.auth.getUser()
    sessionEmail = data.user?.email ?? null
    const t = await resolveCallerTenant({
      getUserId: async () => data.user?.id ?? null,
      listMemberships: async (userId: string) => {
        const { data: rows } = await supabase
          .from('tenant_members')
          .select('tenant_id,role,created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: true })
        return (rows ?? []) as Array<{ tenant_id: string; role: string; created_at: string }>
      },
    })
    tenantId = t.tenantId
  } catch {
    tenantId = null
  }

  // RAM key must stay a string: pre-migration call sites key drafts/installs
  // by the demo constant when no session exists. Nothing here treats it as
  // proof — backend steps below override it wherever a table exists.
  const ramKey = tenantId ?? resolveTenant()
  const home = await getHome()
  const push = tenantId ? await getLatestPush(tenantId) : await getLatestPush()
  const analytics = tenantId ? await hasAnalyticsEvents(tenantId) : false
  const artifact = tenantId ? await getLiveArtifact(tenantId) : null

  const setup = getDraft(ramKey, 'setup')
  const caps = getDraft(ramKey, 'capabilities')
  const rules = getDraft(ramKey, 'rules')
  const liveVersion = artifact?.version ?? null
  const installed = getInstallations(ramKey).length > 0
  const prs = getPullRequests(ramKey)

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
      title: 'Connect your website',
      body: installed
        ? 'App installed — pick repositories and open the pull request below.'
        : 'Your website’s code lives on GitHub, so connecting happens there: connect your repo and we deliver the governed runtime to your site. We never see your password. Everything after this reads live data.',
      state: installed ? 'done' : 'missing',
    },
    {
      n: '3',
      title: 'Review the pull request — the signature',
      body: prs.length > 0
        ? `${prs.length} pull request${prs.length === 1 ? '' : 's'} opened — review on GitHub. You merge. We cannot merge into a protected branch.`
        : 'We open a branch that adds the governed runtime. You merge. We cannot merge into a protected branch.',
      state: prs.length > 0 ? 'done' : 'missing',
    },
    {
      n: '4',
      title: 'Answer four questions',
      body: 'Done here, in plain words. Four answers become a typed policy you can review — against your real site, not a blank slate.',
      state: setup ? 'done' : 'missing',
      href: '/setup',
    },
    {
      n: '5',
      title: 'Pick capabilities and set rules',
      body: 'What agents may see, what waits for you, what is always no. Drafts until you publish.',
      state: caps && rules ? 'done' : 'missing',
      href: '/rules',
    },
    {
      n: '6',
      title: 'Go live — publish',
      body: liveVersion !== null
        ? `Published as version ${liveVersion}. Your site picks it up from here.`
        : 'Review the plain-language summary and publish — the signature lives in your merge, not in a button.',
      state: liveVersion !== null ? 'done' : 'missing',
      href: '/rules',
    },
    {
      n: '7',
      title: 'Watch it work',
      body: push
        ? 'Your site is checking in — the overview shows what it enforces right now.'
        : 'Until your site first checks in, live screens honestly say unknown.',
      state: push ? 'done' : 'missing',
    },
    {
      n: '8',
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

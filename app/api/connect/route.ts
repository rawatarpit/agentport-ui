import { getDraft, getLive, getMerchant, hasAnalytics, hasSync, resolveTenant } from '@/lib/store'

export const dynamic = 'force-dynamic'

type Step = { n: string; title: string; body: string; state: 'missing' | 'done'; href?: string }

/**
 * GET /api/connect — the front door as computed state, not constants.
 *
 * Order is the product decision: GitHub comes second, right after the
 * account, because every screen after connection reads live data — while
 * configuring blind means answering questions about a business the
 * dashboard cannot see yet. Every step reports what the store can prove.
 * GitHub steps stay `missing` until real App credentials exist — code was
 * never the blocker there, and this endpoint must not imply otherwise.
 */
export async function GET() {
  const tenantId = resolveTenant()
  const merchant = getMerchant(tenantId)
  const setup = getDraft(tenantId, 'setup')
  const caps = getDraft(tenantId, 'capabilities')
  const rules = getDraft(tenantId, 'rules')
  const live = getLive(tenantId)

  // Real users sign in with Supabase Auth; the demo record is the fallback.
  // Step 1 is done for whoever actually has an account, not whoever has a row.
  let sessionEmail: string | null = null
  try {
    const { createClient } = await import('@/lib/supabase/server')
    const {
      data: { session },
    } = await createClient().auth.getSession()
    sessionEmail = session?.user.email ?? null
  } catch {
    // No session available — demo record below decides.
  }
  const account = sessionEmail
    ? { done: true as const, body: `Signed in as ${sessionEmail}.` }
    : merchant
      ? { done: true as const, body: `Signed up as ${merchant.businessName} (${merchant.email}).` }
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
      title: 'Install the App on your website repo',
      body: 'Two clicks, you pick the repo — we never see your password. Everything after this reads live data from your site.',
      state: 'missing',
    },
    {
      n: '3',
      title: 'Review the pull request — the signature',
      body: 'We open a branch that adds the governed runtime. You merge. We cannot merge into a protected branch.',
      state: 'missing',
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
      body: live
        ? `Published as version ${live.version}. Your site picks it up from here.`
        : 'Review the plain-language summary and publish — the signature lives in your merge, not in a button.',
      state: live ? 'done' : 'missing',
      href: '/rules',
    },
    {
      n: '7',
      title: 'Watch it work',
      body: hasSync(tenantId)
        ? 'Your site is checking in — the overview shows what it enforces right now.'
        : 'Until your site first checks in, live screens honestly say unknown.',
      state: hasSync(tenantId) ? 'done' : 'missing',
    },
    {
      n: '8',
      title: 'Come back for the numbers',
      body: hasAnalytics(tenantId)
        ? 'Counts flowing — by capability and by rule, never amounts, never rows.'
        : 'Counts by capability and rule land here once your site reports them.',
      state: hasAnalytics(tenantId) ? 'done' : 'missing',
      href: '/analytics',
    },
  ]
  return Response.json({ status: 'ok', tenantId, steps })
}

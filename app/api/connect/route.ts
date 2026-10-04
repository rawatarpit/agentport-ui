import { getDraft, getLive, getMerchant, hasAnalytics, hasSync, resolveTenant } from '@/lib/store'

export const dynamic = 'force-dynamic'

type Step = { n: string; title: string; body: string; state: 'missing' | 'done'; href?: string }

/**
 * GET /api/connect — the front door as computed state, not constants.
 *
 * Every step reports what the store can prove. GitHub steps stay `missing`
 * until real App credentials exist — code was never the blocker there, and
 * this endpoint must not imply otherwise. The day the App lands, only the
 * github/review steps change; the shape stays the same.
 */
export async function GET() {
  const tenantId = resolveTenant()
  const merchant = getMerchant(tenantId)
  const setup = getDraft(tenantId, 'setup')
  const caps = getDraft(tenantId, 'capabilities')
  const rules = getDraft(tenantId, 'rules')
  const live = getLive(tenantId)

  const steps: Step[] = [
    {
      n: '1',
      title: 'Create your account',
      body: merchant
        ? `Signed up as ${merchant.businessName} (${merchant.email}). Magic-link sign-in arrives with Supabase Auth.`
        : 'An account with us — email only, no password to hold. GitHub comes later, for your repo, not your identity.',
      state: merchant ? 'done' : 'missing',
    },
    {
      n: '2',
      title: 'Answer four questions',
      body: 'Done here. Four answers become a typed policy you can review.',
      state: setup ? 'done' : 'missing',
      href: '/setup',
    },
    {
      n: '3',
      title: 'Pick capabilities and set rules',
      body: 'What agents may see, what waits for you, what is always no. Drafts until go-live.',
      state: caps && rules ? 'done' : 'missing',
      href: '/rules',
    },
    {
      n: '4',
      title: 'Install the App on your website repo',
      body: 'Analysis runs in your workflow — names and types only. Never your rows, never your database credentials.',
      state: 'missing',
    },
    {
      n: '5',
      title: 'Review the pull request — the signature',
      body: 'We open a branch with the snippet, CLI and runtime wiring. You merge. We cannot merge into a protected branch.',
      state: 'missing',
    },
    {
      n: '6',
      title: 'Go live — typed confirmation',
      body: live
        ? `Live at version ${live.version}, digest ${live.digest.slice(0, 12)}. Republishing needs a fresh read and a fresh confirm.`
        : 'Review the plain-language summary, type your business name, and the config is signed.',
      state: live ? 'done' : 'missing',
      href: '/rules',
    },
    {
      n: '7',
      title: 'Sync and heartbeat',
      body: hasSync(tenantId)
        ? 'Signed pushes landing; the enforcing panel reads the runtime heartbeat.'
        : 'Signed payload, distinct credential, replay protection. Until the first heartbeat, the panel says unknown.',
      state: hasSync(tenantId) ? 'done' : 'missing',
    },
    {
      n: '8',
      title: 'Come back for analytics',
      body: hasAnalytics(tenantId)
        ? 'Counts flowing — by capability and by rule, never rows.'
        : 'Counts by capability and rule land here once the runtime pushes them.',
      state: hasAnalytics(tenantId) ? 'done' : 'missing',
      href: '/analytics',
    },
  ]
  return Response.json({ status: 'ok', tenantId, steps })
}

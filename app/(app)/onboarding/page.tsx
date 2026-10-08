import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Post-login router: tenant first, then GitHub, then configuration.
 *
 * Order is the product decision: connect comes BEFORE configure, because
 * every screen after connection reads live data — heartbeat, denials,
 * analytics — while configuring blind means answering questions about a
 * business the dashboard cannot see yet. `v_tenant_home` returns one row
 * for a member, nothing for a stranger. Never a dashboard with an empty
 * tenant — that reads as broken.
 */
export default async function OnboardingPage() {
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) redirect('/login')
  const { data, error } = await supabase.from('v_tenant_home').select('*').maybeSingle()
  if (error || !data) redirect('/setup')
  const github =
    (process.env.GITHUB_APP_ID ?? '').trim().length > 0 &&
    (process.env.GITHUB_APP_PRIVATE_KEY ?? '').trim().length > 0
  if (!github) redirect('/connect')
  redirect('/capabilities')
}

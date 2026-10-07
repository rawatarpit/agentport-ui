import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Post-login router: tenant first, then GitHub, then configuration.
 *
 * `v_tenant_home` returns one row for a member, nothing for a stranger —
 * no tenant means setup started nowhere, so `/setup`. A tenant whose
 * GitHub App is not connected goes to `/connect`: onboarding IS connect
 * GitHub → pull request shown here → they merge. Only a connected tenant
 * lands on `/capabilities`. Never a dashboard with an empty tenant — that
 * reads as broken.
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

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Post-login router (FRONTEND.md §2): does a tenant exist?
 * `v_tenant_home` returns one row for a member, nothing for a stranger.
 * Tenant → capabilities; no tenant → setup. Never a dashboard with an
 * empty tenant — that reads as broken.
 */
export default async function OnboardingPage() {
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) redirect('/login')
  const { data, error } = await supabase.from('v_tenant_home').select('*').maybeSingle()
  if (error || !data) redirect('/setup')
  redirect('/capabilities')
}

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { sanitizeNextPath } from '@/lib/redirect'

export const dynamic = 'force-dynamic'

/** Exchanges the email-confirmation / recovery code, then lands on the sanitised `next` path. */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const next = sanitizeNextPath(url.searchParams.get('next'))
  if (code) {
    const supabase = createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      // A recovery link that expired or was already used belongs back on the
      // set-password screen with a specific reason, never a silent bounce to
      // sign-in where the merchant cannot tell what went wrong.
      if (next.startsWith('/reset-password')) {
        redirect('/reset-password?error=expired')
      }
      redirect('/login?error=confirmation')
    }
  }
  redirect(next)
}

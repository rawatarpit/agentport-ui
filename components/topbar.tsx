'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ThemeToggle } from '@/components/theme-toggle'

/**
 * Slim topbar: who is signed in, theme, way out. Visible on every screen
 * including mobile — the toggle and sign-out lived in the sidebar footer,
 * which requires scrolling precisely when you need them fastest.
 */
export function Topbar() {
  const [email, setEmail] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    let live = true
    createClient()
      .auth.getSession()
      .then(({ data }) => {
        if (live) setEmail(data.session?.user.email ?? null)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  const signOut = async () => {
    await createClient().auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-ink-line py-3">
      <p className="truncate font-mono text-[11px] text-bone-faint">
        {email ?? 'not signed in'}
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <div className="w-24">
          <ThemeToggle />
        </div>
        {email ? (
          <button type="button" className="btn" onClick={signOut}>
            Sign out
          </button>
        ) : (
          <Link href="/login" className="btn btn-primary">
            Sign in
          </Link>
        )}
      </div>
    </div>
  )
}

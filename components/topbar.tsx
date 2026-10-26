'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ThemeToggle } from '@/components/theme-toggle'

/**
 * Slim topbar: who is signed in, theme, way out. Visible on every screen
 * including mobile — the toggle and sign-out lived in the sidebar footer,
 * which requires scrolling precisely when you need them fastest.
 */
export function Topbar({ email }: { email: string | null }) {
  const router = useRouter()

  // The session lives in an httpOnly cookie, so the server passes the email
  // in rather than the browser trying to read the cookie itself.
  const signOut = async () => {
    await fetch('/api/auth/signout', { method: 'POST' })
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
          <>
            <Link href="/select-workspace" className="btn">
              Workspace
            </Link>
            <button type="button" className="btn" onClick={signOut}>
              Sign out
            </button>
          </>
        ) : (
          <Link href="/login" className="btn btn-primary">
            Sign in
          </Link>
        )}
      </div>
    </div>
  )
}

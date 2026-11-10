'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { AgentPortLogo } from '@/components/brand/agentport-logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { StatusPill } from '@/components/ui/status-pill'
function externalHref(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`
}

/**
 * Slim topbar: the workspace, its honest state, and the one action that moves
 * it forward. The page itself owns the detail; the topbar never repeats a
 * checklist. Sign-out stays visible because it is the action people need
 * fastest when something is wrong.
 *
 * A small GitHub connection indicator sits beside the publish status so the
 * merchant can always see whether the discovery package is installed — the
 * first thing that must be true before anything can go live.
 */
export function Topbar({
  email,
  businessName,
  published,
  role,
  siteUrl,
}: {
  email: string | null
  businessName: string
  published: boolean | null
  role: string
  siteUrl: string | null
}) {
  const router = useRouter()
  const [githubConnected, setGithubConnected] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/github/installations')
      .then(async (r) => {
        if (!r.ok) return null
        return r.json()
      })
      .then((body) => {
        if (cancelled) return
        const installations = body?.installations ?? body ?? []
        setGithubConnected(Array.isArray(installations) && installations.length > 0)
      })
      .catch(() => setGithubConnected(null))
    return () => {
      cancelled = true
    }
  }, [])

  const signOut = async () => {
    await fetch('/api/auth/signout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="sticky top-0 z-30 flex min-h-14 items-center justify-between gap-3 border-b border-ink-line bg-ink/85 py-2.5 backdrop-blur">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="shrink-0 md:hidden">
          <AgentPortLogo size={28} markOnly />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13px] text-bone">
            {businessName}
            <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.12em] text-bone-faint">{role}</span>
          </p>
          <p className="truncate font-mono text-[10.5px] text-bone-faint">
            {email ?? 'not signed in'}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <span className="hidden sm:inline-flex">
          {published === null ? (
            <StatusPill tone="unknown">Unknown</StatusPill>
          ) : (
            <StatusPill tone={published ? 'live' : 'draft'}>{published ? 'Live' : 'Setup'}</StatusPill>
          )}
        </span>
        <span className="hidden sm:inline-flex font-mono text-[10px]">
          {githubConnected === null ? null : githubConnected ? (
            <span className="text-verdant">GitHub connected</span>
          ) : (
            <span className="text-bone-faint">GitHub not connected</span>
          )}
        </span>
        <div className="w-24">
          <ThemeToggle />
        </div>
        {email ? (
          <>
            {published === null ? (
              <Link href="/go-live" className="btn btn-sm btn-primary">
                Check status
              </Link>
            ) : published && siteUrl ? (
              <a href={externalHref(siteUrl)} target="_blank" rel="noreferrer" className="btn btn-sm">
                Open site
              </a>
            ) : published ? (
              <Link href="/go-live#verify" className="btn btn-sm btn-primary">
                Verify
              </Link>
            ) : (
              <Link href="/go-live" className="btn btn-sm btn-primary">
                Go live
              </Link>
            )}
            <Link href="/select-workspace" className="btn btn-sm btn-quiet hidden sm:inline-flex">
              Workspace
            </Link>
            <button type="button" className="btn btn-sm btn-quiet" onClick={signOut}>
              Sign out
            </button>
          </>
        ) : (
          <Link href="/login" className="btn btn-sm btn-primary">
            Sign in
          </Link>
        )}
      </div>
    </div>
  )
}

'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

/**
 * The pull request, on the dashboard where the owner watches it.
 *
 * Reads live PR state (branch, CI rollup, merge) through /api/github/pr.
 * No record yet is an explicit empty state with the way forward — never an
 * empty widget pretending a PR is coming. The merge is the signature:
 * nothing here merges, approves, or implies either happened.
 */
export function PullRequestCard() {
  const [pr, setPr] = useState<
    | { state: 'none' }
    | { state: 'open' | 'merged' | 'closed'; url: string; repo: string; number: number; checks: string }
    | null
  >(null)

  useEffect(() => {
    let live = true
    fetch('/api/github/pr')
      .then((r) => r.json())
      .then((body: { status: string; pr?: { state: string; url?: string; repo?: string; number?: number; checks?: string } }) => {
        if (!live) return
        if (body.status !== 'ok' || !body.pr || body.pr.state === 'none') {
          setPr({ state: 'none' })
          return
        }
        setPr(body.pr as { state: 'open' | 'merged' | 'closed'; url: string; repo: string; number: number; checks: string })
      })
      .catch(() => {
        if (live) setPr({ state: 'none' })
      })
    return () => {
      live = false
    }
  }, [])

  if (pr && pr.state !== 'none') {
    return (
      <div className="panel flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <p className="label">Pull request</p>
          <p className="mt-1 font-mono text-[13px] text-bone">
            {pr.repo} · #{pr.number} · {pr.state}
            {pr.state === 'open' ? <span className="ml-2 text-bone-faint">checks {pr.checks}</span> : null}
          </p>
        </div>
        <a href={pr.url} target="_blank" rel="noreferrer" className="btn btn-primary">
          {pr.state === 'merged' ? 'View merge' : 'Review it'}
        </a>
      </div>
    )
  }
  return (
    <div className="panel flex flex-wrap items-center justify-between gap-3 p-5">
      <div>
        <p className="label">Pull request</p>
        <p className="mt-1 text-[14px] text-bone-dim">
          No pull request yet — there is nothing to review until GitHub is connected.
        </p>
      </div>
      <Link href="/connect" className="btn btn-primary">Connect GitHub</Link>
    </div>
  )
}

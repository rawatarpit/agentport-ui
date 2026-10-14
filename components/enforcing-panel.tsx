'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/stat'
import { ageLabel, type EnforcingState } from '@/lib/enforcing'

/**
 * The anti-blur control for the entire product.
 *
 * Shows what the site is actually enforcing right now — the push digest plus
 * when it last checked in — fetched from GET /api/enforcing (Supabase
 * `push_batches` via RLS, never process RAM). Silence reads `unknown`,
 * never a green lie.
 */
export function EnforcingPanel({ draftLabel }: { draftLabel: string }) {
  const [state, setState] = useState<EnforcingState | null>(null)

  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const res = await fetch('/api/enforcing')
        const body = (await res.json()) as { status: string; enforcing?: EnforcingState }
        if (live && res.ok && body.status === 'ok' && body.enforcing) setState(body.enforcing)
        else if (live) setState({ status: 'unknown', reason: 'Could not read liveness.' })
      } catch {
        if (live) setState({ status: 'unknown', reason: 'Could not read liveness.' })
      }
    })()
    return () => {
      live = false
    }
  }, [])

  if (!state) {
    return (
      <div className="panel p-5">
        <p className="label">What your site is enforcing right now</p>
        <p className="mt-3 font-mono text-[12px] text-bone-faint">Reading liveness…</p>
      </div>
    )
  }

  return (
    <div className="panel p-5">
      <p className="label">What your site is enforcing right now</p>
      {state.status === 'live' ? (
        <div className="mt-3 space-y-2">
          <p className="font-mono text-[13px] text-bone">
            version <span className="text-bone">{state.digest.slice(0, 8)}</span>
            <span className="ml-2 text-bone-faint">checked {ageLabel(state.pushedAt)}</span>
          </p>
          <p className="text-[13px] leading-relaxed text-bone-dim">
            This is what your site is actually doing — not what is typed below. The two match only after you publish
            and your site picks it up.
          </p>
          <p className="font-mono text-[11px] text-bone-faint">
            editing now: {draftLabel} · <span className="text-bone-faint">not live until published</span>
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2">
            <Badge tone="idle">unknown</Badge>
            <span className="font-mono text-[12px] text-bone-faint">
              {state.status === 'unknown' && state.reason.includes('stale')
                ? 'your site has gone quiet'
                : 'waiting for your site to check in'}
            </span>
          </div>
          <p className="text-[13px] leading-relaxed text-bone-dim">
            We have not heard from your site, so nothing here claims to be live. Your site keeps enforcing its last
            published rules regardless — this screen simply stops guessing until it hears back.
          </p>
        </div>
      )}
    </div>
  )
}

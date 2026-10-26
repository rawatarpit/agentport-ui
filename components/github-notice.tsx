'use client'

import { useEffect, useState } from 'react'
import { githubReasonText } from '@/lib/github-reasons'

/**
 * The dashboard's transient GitHub result.
 *
 * The query is a message, not authority: the checklist below still comes from
 * durable tenant rows. Remove only the `github` parameter so the panel can
 * still adopt a validated `installation_id`.
 */
export function GithubNotice() {
  const [reason, setReason] = useState<string | null>(null)
  const [verified, setVerified] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const q = params.get('github')
    if (!q) return
    setReason(q)
    params.delete('github')
    const query = params.toString()
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
    )
  }, [])

  // A query string is a message, not authority. Confirm the named install
  // against the tenant's revalidated list before showing a green success.
  useEffect(() => {
    if (reason !== 'installed') return
    const id = Number(new URLSearchParams(window.location.search).get('installation_id') ?? '')
    if (!Number.isInteger(id) || id <= 0) {
      setVerified(false)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/github/installations')
        const body = (await res.json()) as {
          status: string
          installations?: Array<{ installationId: number }>
        }
        if (cancelled) return
        setVerified(
          body.status === 'ok' &&
            Array.isArray(body.installations) &&
            body.installations.some((i) => i.installationId === id),
        )
      } catch {
        if (!cancelled) setVerified(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [reason])

  if (!reason) return null

  if (reason === 'installed') {
    if (verified === null) {
      return (
        <div className="panel p-5" role="status">
          <p className="font-mono text-[11px] uppercase tracking-widest text-bone-faint">GitHub returned</p>
          <p className="mt-2 text-[13px] leading-relaxed text-bone-dim">
            Confirming the installation with GitHub…
          </p>
        </div>
      )
    }
    if (!verified) {
      return (
        <div className="panel border-amber/40 p-5" role="alert">
          <p className="font-mono text-[11px] uppercase tracking-widest text-amber">GitHub returned</p>
          <p className="mt-2 text-[13px] leading-relaxed text-bone-dim">
            We could not confirm that installation for this business. The checklist
            below is authoritative; retry from Connect a GitHub repo if it still says
            missing.
          </p>
        </div>
      )
    }
    return (
      <div className="panel border-verdant/40 p-5" role="status">
        <p className="font-mono text-[11px] uppercase tracking-widest text-verdant">GitHub connected</p>
        <p className="mt-2 text-[13px] leading-relaxed text-bone-dim">
          The App is installed and verified. Pick the repository below and open the
          install pull request. It adds <span className="font-mono text-bone">agentport/</span> and
          the discovery files your site serves — not a runtime.
        </p>
      </div>
    )
  }

  const retry = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/github/install', { method: 'POST' })
      const body = (await res.json()) as { status: string; installUrl?: string }
      if (body.status !== 'ok' || !body.installUrl) throw new Error()
      window.location.assign(body.installUrl)
    } catch {
      setReason('install-start')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel border-amber/40 p-5" role="alert">
      <p className="font-mono text-[11px] uppercase tracking-widest text-amber">GitHub needs attention</p>
      <p className="mt-2 text-[13px] leading-relaxed text-bone-dim">
        {githubReasonText(reason)}{' '}
        <button type="button" className="text-bone underline underline-offset-4" disabled={busy} onClick={() => void retry()}>
          {busy ? 'Starting…' : 'Try installing again'}
        </button>
        .
      </p>
    </div>
  )
}

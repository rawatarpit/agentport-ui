'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/stat'

/**
 * Publishing, on the rules screen where the draft lives.
 *
 * Shows the plain-language summary of what publishing would enact next to
 * the live version — review, then publish freely. There is deliberately no
 * approval gate here (TASKS.md 4.3): the merchant is the sole authority over
 * their own money, and sync is the act of publishing. The signature lives in
 * the PR merge, not in this button. What the button keeps is the concurrency
 * guard: it publishes only over the digest it just read, so a version that
 * landed since is never silently overwritten — a 409 sends you back to read.
 * Nothing here is verdant until the runtime reports the digest back.
 */

type Status = {
  businessName: string | null
  live: { version: number; digest: string; confirmedAt: string } | null
  draft: { summary: string[] } | null
  draftError: string | null
}

export function GolivePanel() {
  const [s, setS] = useState<Status | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setErr(null)
    try {
      const res = await fetch('/api/golive')
      const body = (await res.json()) as Status & { status: string }
      if (body.status !== 'ok') throw new Error('Could not read publish state.')
      setS(body)
      setMsg(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not read publish state.')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const publish = async () => {
    if (!s) return
    setBusy(true)
    setErr(null)
    setMsg(null)
    try {
      const res = await fetch('/api/golive', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fromDigest: s.live?.digest ?? 'none' }),
      })
      const body = (await res.json()) as { status: string; reason?: string; version?: number; digest?: string }
      if (body.status !== 'ok') throw new Error(body.reason ?? 'Publish refused.')
      setMsg(`Published as version ${body.version}. Your site picks it up from here.`)
      await load()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Publish refused.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="label">Publish</p>
        {s?.live ? (
          <span className="font-mono text-[11px] text-bone-faint">
            live version {s.live.version}
          </span>
        ) : (
          <Badge tone="idle">not published</Badge>
        )}
      </div>

      {!s ? (
        <p className="text-[13px] text-bone-faint">Reading publish state…</p>
      ) : !s.businessName ? (
        <p className="text-[13px] leading-relaxed text-bone-dim">
          No account yet — create one on the <a className="text-bone underline" href="/connect">connect screen</a>, then come back. Publishing always happens as your business.
        </p>
      ) : s.draft ? (
        <>
          <p className="text-[13px] leading-relaxed text-bone-dim">
            Read this carefully — publishing turns exactly this on:
          </p>
          <ul className="space-y-1.5 text-[13px] leading-relaxed text-bone-dim">
            {s.draft.summary.map((line) => (
              <li key={line}>· {line}</li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={publish}>
              {busy ? 'Publishing…' : s.live ? 'Publish new version' : 'Publish'}
            </button>
            <span className="font-mono text-[11px] text-bone-faint">review above — publishing turns on exactly this</span>
          </div>
        </>
      ) : (
        <p className="text-[13px] leading-relaxed text-bone-dim">{s.draftError}</p>
      )}

      {msg ? <p className="text-[13px] text-bone">{msg}</p> : null}
      {err ? (
        <p className="text-[13px] text-rust" role="alert">
          {err}
        </p>
      ) : null}
      <p className="font-mono text-[11px] text-bone-faint">your site picks up the new version from here</p>
    </div>
  )
}

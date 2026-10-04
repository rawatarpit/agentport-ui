'use client'

import { useState } from 'react'

/**
 * The merchant's public runtime endpoint (TASKS.md 1.2).
 *
 * This is the manifest's baseUrl — the address external agents call — and it
 * is deliberately not the dashboard origin. The form accepts https only
 * (localhost for development); the API re-validates, because the browser is
 * not a boundary.
 */
export function WebsiteForm({ current, onDone }: { current: string | null; onDone: () => void }) {
  const [url, setUrl] = useState(current ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch('/api/me', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ websiteUrl: url }),
      })
      const body = (await res.json()) as { status: string; reason?: string }
      if (body.status !== 'ok') throw new Error(body.reason ?? 'Refused.')
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Refused.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel space-y-3 p-6">
      <p className="label">Your runtime address</p>
      <p className="text-[13px] leading-relaxed text-bone-dim">
        The public address your runtime serves — this is what the manifest advertises
        to agents. Not this dashboard: agents calling here would reach a UI, not an
        enforcement point.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <input
          className="min-w-64 flex-1 border border-ink-line bg-transparent px-3 py-2 font-mono text-[13px] text-bone outline-none focus:border-verdant"
          value={url}
          inputMode="url"
          placeholder="https://shop.example"
          onChange={(e) => setUrl(e.target.value)}
          aria-label="Runtime URL"
        />
        <button type="button" className="btn btn-primary" disabled={busy} onClick={submit}>
          {busy ? 'Saving…' : current ? 'Update' : 'Save'}
        </button>
      </div>
      {current ? (
        <p className="font-mono text-[11px] text-bone-faint">serving agents at {current}</p>
      ) : null}
      {err ? (
        <p className="text-[13px] text-rust" role="alert">{err}</p>
      ) : null}
    </div>
  )
}

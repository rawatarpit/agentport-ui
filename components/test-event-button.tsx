'use client'

import { useState } from 'react'

/**
 * TASKS.md 6.5 — one round trip, shown.
 *
 * Fires a governed read through the real invoke path with a development
 * credential and renders what the engine answered. Anything but a clean
 * allow here means the enforcement path is broken underneath a working UI —
 * which is exactly the failure this button exists to catch.
 */
export function TestEventButton() {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const fire = async () => {
    setBusy(true)
    setResult(null)
    setErr(null)
    try {
      const res = await fetch('/api/test-event', { method: 'POST' })
      const body = (await res.json()) as {
        status: string
        reason?: string
        roundTrip?: { capability?: string; outcome?: string; reason?: string }
      }
      if (body.status !== 'ok' || !body.roundTrip) throw new Error(body.reason ?? 'Round trip failed.')
      setResult(
        `${body.roundTrip.capability}: ${body.roundTrip.outcome}${body.roundTrip.reason ? ` (${body.roundTrip.reason})` : ''}`,
      )
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Round trip failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel space-y-3 p-6">
      <p className="label">Diagnostics — development only</p>
      <p className="text-[13px] leading-relaxed text-bone-dim">
        One governed read through the real enforcement path, with a throwaway
        credential. If the UI renders but this fails, the path is broken under it.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn" disabled={busy} onClick={fire}>
          {busy ? 'Firing…' : 'Fire test event'}
        </button>
        {result ? <span className="font-mono text-[12px] text-verdant">{result}</span> : null}
        {err ? (
          <span className="text-[13px] text-rust" role="alert">{err}</span>
        ) : null}
      </div>
    </div>
  )
}

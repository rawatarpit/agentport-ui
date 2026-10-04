'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/stat'

/**
 * The signature ceremony, on the rules screen where the draft lives.
 *
 * Reads the summary (what publishing would enact) next to the live version,
 * and publishes only on an exact typed business name plus a fresh fromDigest.
 * A 409 means someone published since the summary was read — the confirm
 * signs what was seen, so it must be read again. Nothing here is verdant
 * until the runtime reports the digest back.
 */

type Status = {
  businessName: string | null
  live: { version: number; digest: string; confirmedAt: string } | null
  draft: { summary: string[] } | null
  draftError: string | null
}

export function GolivePanel() {
  const [s, setS] = useState<Status | null>(null)
  const [confirm, setConfirm] = useState('')
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
        body: JSON.stringify({ confirm, fromDigest: s.live?.digest ?? 'none' }),
      })
      const body = (await res.json()) as { status: string; reason?: string; version?: number; digest?: string }
      if (body.status !== 'ok') throw new Error(body.reason ?? 'Publish refused.')
      setMsg(`Live at version ${body.version}, digest ${body.digest?.slice(0, 12)}. Your runtime picks it up from here.`)
      setConfirm('')
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
        <p className="label">Go live</p>
        {s?.live ? (
          <span className="font-mono text-[11px] text-bone-faint">
            live v{s.live.version} · {s.live.digest.slice(0, 12)}
          </span>
        ) : (
          <Badge tone="idle">not deployed</Badge>
        )}
      </div>

      {!s ? (
        <p className="text-[13px] text-bone-faint">Reading publish state…</p>
      ) : !s.businessName ? (
        <p className="text-[13px] leading-relaxed text-bone-dim">
          No account yet — create one on the <a className="text-bone underline" href="/connect">connect screen</a>, then come back. Publishing signs as your business.
        </p>
      ) : s.draft ? (
        <>
          <ul className="space-y-1.5 text-[13px] leading-relaxed text-bone-dim">
            {s.draft.summary.map((line) => (
              <li key={line}>· {line}</li>
            ))}
          </ul>
          <div>
            <label className="block text-[13px] text-bone" htmlFor="golive-confirm">
              Type <span className="font-mono">{s.businessName}</span> to publish exactly this.
            </label>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <input
                id="golive-confirm"
                className="w-64 border border-ink-line bg-transparent px-3 py-2 font-mono text-[13px] text-bone outline-none focus:border-verdant"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={s.businessName}
              />
              <button type="button" className="btn btn-primary" disabled={busy || confirm.trim() !== s.businessName} onClick={publish}>
                {busy ? 'Publishing…' : s.live ? 'Publish new version' : 'Publish'}
              </button>
            </div>
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
      <p className="font-mono text-[11px] text-bone-faint">publishing signs a version — the runtime heartbeat is what turns it live on screen</p>
    </div>
  )
}

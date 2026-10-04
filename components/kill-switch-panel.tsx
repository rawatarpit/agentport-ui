'use client'

import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/stat'

/**
 * The emergency switch, with both directions typed.
 *
 * Engaging stops writes (reads go audit-only) the moment the live row flips;
 * releasing restores exactly what was published — the digest never changes,
 * because the policy never changed. The switch is merchant state, not policy:
 * no sync payload can carry it, and this panel is the only writer. The only
 * fast careless action in this product should be a refusal — flipping this
 * is deliberately the opposite of fast.
 */
export function KillSwitchPanel() {
  const [engaged, setEngaged] = useState<boolean | null>(null)
  const [businessName, setBusinessName] = useState<string | null>(null)
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/config')
      const body = (await res.json()) as {
        status: string
        emergencyKillSwitch?: boolean
      }
      setEngaged(body.status === 'ok' ? (body.emergencyKillSwitch ?? false) : null)
      const me = await fetch('/api/me')
      const mbody = (await me.json()) as { status: string; merchant?: { businessName?: string } }
      setBusinessName(mbody.status === 'ok' ? (mbody.merchant?.businessName ?? null) : null)
    } catch {
      setEngaged(null)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const flip = async (engage: boolean) => {
    setBusy(true)
    setErr(null)
    setMsg(null)
    try {
      const res = await fetch('/api/kill-switch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ engage, confirm }),
      })
      const body = (await res.json()) as { status: string; reason?: string; emergencyKillSwitch?: boolean }
      if (body.status !== 'ok') throw new Error(body.reason ?? 'Refused.')
      setEngaged(body.emergencyKillSwitch ?? engage)
      setConfirm('')
      setMsg(engage ? 'Engaged. Writes stop now; reads are audit-only.' : 'Released. The published policy enforces again, unchanged.')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Refused.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="label">Emergency switch</p>
        {engaged === null ? (
          <Badge tone="idle">not deployed</Badge>
        ) : (
          <Badge tone={engaged ? 'deny' : 'idle'}>{engaged ? 'engaged' : 'clear'}</Badge>
        )}
      </div>

      {engaged === null ? (
        <p className="text-[13px] leading-relaxed text-bone-dim">
          Nothing live to stop — publish a config first. The switch only exists against something running.
        </p>
      ) : !businessName ? (
        <p className="text-[13px] leading-relaxed text-bone-dim">
          No account yet — create one on the <a className="text-bone underline" href="/connect">connect screen</a>. The switch flips on a typed business name, nothing less.
        </p>
      ) : (
        <>
          <p className="text-[13px] leading-relaxed text-bone-dim">
            {engaged
              ? 'Engaged: writes stop, reads go audit-only. Releasing restores the published policy exactly — nothing is re-decided.'
              : 'Clear: the published policy enforces. Engaging stops writes immediately and is recorded against your account.'}
          </p>
          <div>
            <label className="block text-[13px] text-bone" htmlFor="kill-confirm">
              Type <span className="font-mono">{businessName}</span> to {engaged ? 'release' : 'engage'}.
            </label>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <input
                id="kill-confirm"
                className="w-64 border border-ink-line bg-transparent px-3 py-2 font-mono text-[13px] text-bone outline-none focus:border-rust"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={businessName}
              />
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy || confirm.trim() !== businessName}
                onClick={() => flip(!engaged)}
              >
                {busy ? 'Working…' : engaged ? 'Release the switch' : 'Engage the switch'}
              </button>
            </div>
          </div>
        </>
      )}

      {msg ? <p className="text-[13px] text-bone">{msg}</p> : null}
      {err ? (
        <p className="text-[13px] text-rust" role="alert">{err}</p>
      ) : null}
      <p className="font-mono text-[11px] text-bone-faint">merchant state, not policy — no sync payload can carry it</p>
    </div>
  )
}

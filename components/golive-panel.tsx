'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/stat'

/**
 * Publishing, where the merchant can see the exact policy and capability set
 * they are about to enact. The panel is embedded in /go-live; /rules links
 * here rather than owning a second publish flow.
 *
 * Shows the plain-language summary of what applying would enact next to the
 * live version. On approval the dashboard writes one append-only config row
 * and advances the runtime pointer. There is no artifact to sign: the hosted
 * governor reads the applied config on its next registry poll. Nothing here
 * is live until that poll succeeds.
 */

type Status = {
  tenantId: string
  businessName: string | null
  live: { version: number; publishedAt: string } | null
  draft: { summary: string[] } | null
  draftError: string | null
  nextVersion: number
}

type ApplyResponse = {
  status: string
  reason?: string
  tier?: string
  version?: number
  next?: string
}

export function GolivePanel() {
  const router = useRouter()
  const [s, setS] = useState<Status | null>(null)
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setErr(null)
    try {
      const res = await fetch('/api/publish/status')
      const body = (await res.json()) as Status & { status: string }
      if (body.status !== 'ok') throw new Error('Could not read publish state.')
      setS(body)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not read publish state.')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const apply = async (payload: { confirm: boolean | string; fromVersion?: number }): Promise<ApplyResponse> => {
    const res = await fetch('/api/publish/apply', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return (await res.json()) as ApplyResponse
  }

  const applyConfig = async (payload: { confirm: boolean | string; fromVersion?: number }) => {
    if (!s) return
    setBusy(true)
    setErr(null)
    setMsg(null)
    setPhase('Applying…')
    try {
      let body = await apply(payload)
      // A widening change always asks for the business name, whether this is
      // a normal apply or a rollback. The version row is not written until the
      // name matches, so a cancelled prompt records nothing.
      if (body.status !== 'ok' && body.tier === 'typed' && typeof body.version === 'number') {
        const typed = window.prompt(
          `This widens what agents may do. Type your business name to apply v${body.version}:`,
        )
        if (typed === null) return
        body = await apply({ ...payload, confirm: typed })
      }
      if (body.status !== 'ok') throw new Error(body.reason ?? 'Apply refused.')
      setMsg(
        body.next ??
          `Applied version ${body.version}. The hosted governor reads it on its next registry poll.`,
      )
      await load()
      await loadVersions()
      router.refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Apply refused.')
    } finally {
      setPhase(null)
      setBusy(false)
    }
  }

  const downloadFile = async () => {
    if (!s) return
    setBusy(true)
    setErr(null)
    setMsg(null)
    try {
      const res = await fetch('/api/golive/file')
      const body = (await res.json()) as { status: string; reason?: string; filename?: string; content?: string }
      if (body.status !== 'ok' || typeof body.content !== 'string') {
        throw new Error(body.reason ?? 'Install package not ready — finish your answers first.')
      }
      const blob = new Blob([body.content], { type: 'text/javascript' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = body.filename ?? 'agentport-install.mjs'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setMsg('Downloaded. Run `node agentport-install.mjs` at your repo root, review the diff, then commit.')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Download refused.')
    } finally {
      setBusy(false)
    }
  }

  const [versions, setVersions] = useState<Array<{
    version: number
    approverRole: string
    riskTier: string
    approvedAt: string
    active: boolean
  }> | null>(null)

  const loadVersions = useCallback(async () => {
    try {
      const res = await fetch('/api/publish/versions')
      const body = (await res.json()) as { status: string; versions?: typeof versions }
      if (body.status === 'ok' && Array.isArray(body.versions)) setVersions(body.versions)
    } catch {
      // Versions are history, not the apply path — a failed read hides the list, never the button.
    }
  }, [])

  useEffect(() => {
    void loadVersions()
  }, [loadVersions])

  const rollback = async (version: number) => {
    // Rollback is a new apply of an old config (append-only friendly).
    // Narrowing-or-equal content usually clears light ceremony; anything
    // widening asks typed.
    const confirm = window.prompt(
      `Restore version ${version} as a new apply? Type your business name for typed changes, or "yes" for narrowing ones.`,
    )
    if (confirm === null) return
    await applyConfig({ fromVersion: version, confirm })
  }

  const canPublish = s !== null

  return (
    <div className="panel space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="label">Publish</p>
        {s?.live ? (
          <span className="font-mono text-[11px] text-bone-faint">
            live version {s.live.version}
          </span>
        ) : err ? (
          <Badge tone="idle">unknown</Badge>
        ) : s ? (
          <Badge tone="idle">not published</Badge>
        ) : (
          <Badge tone="idle">checking…</Badge>
        )}
      </div>

      {!s ? (
        err ? (
          <p className="text-[13px] text-rust" role="alert">
            The publish state could not be read. This is unknown — not unpublished.
          </p>
        ) : (
          <p className="text-[13px] text-bone-faint">Reading publish state…</p>
        )
      ) : !s.businessName ? (
        <p className="text-[13px] leading-relaxed text-bone-dim">
          No account yet — create one on the <a className="text-bone underline" href="/setup">setup screen</a>, then come back. Publishing always happens as your business.
        </p>
      ) : s.draft ? (
        <>
          <p className="text-[13px] leading-relaxed text-bone-dim">
            Read this carefully — applying records exactly this policy and capability set:
          </p>
          <ul className="space-y-1.5 text-[13px] leading-relaxed text-bone-dim">
            {s.draft.summary.map((line) => (
              <li key={line}>· {line}</li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !canPublish}
              onClick={() => void applyConfig({ confirm: true })}
            >
              {busy ? (phase ?? 'Working…') : 'Approve & apply'}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={downloadFile}>
              {busy ? 'Preparing…' : 'Download install package'}
            </button>
            <span className="font-mono text-[11px] text-bone-faint">
              review above — approval covers exactly this content
            </span>
          </div>
          <p className="font-mono text-[11px] leading-relaxed text-bone-faint">
            Applying writes one append-only config version and advances the runtime pointer. The hosted
            governor reads it on its next registry poll. Until then, nothing changes.
          </p>
          <p className="font-mono text-[11px] leading-relaxed text-bone-faint">
            No GitHub App on your repo yet? Download{' '}
            <span className="text-bone">agentport-install.mjs</span>, run it at the repo root, review
            the diff, then commit — same discovery package the PR would carry.
          </p>
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
      <p className="font-mono text-[11px] text-bone-faint">
        nothing runs until the config is applied and the hosted governor loads it
      </p>
      {versions && versions.length > 0 ? (
        <div className="mt-2 border-t border-ink-line pt-3">
          <p className="label">Applied versions</p>
          <ul className="mt-2 space-y-1.5">
            {versions.map((v) => (
              <li key={v.version} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                <span className="font-mono text-bone">v{v.version}</span>
                <span className="font-mono text-[11px] text-bone-faint">{v.riskTier} · {v.approverRole}</span>
                <span className={`font-mono text-[11px] ${v.active ? 'text-verdant' : 'text-bone-faint'}`}>
                  {v.active ? 'active' : 'history'}
                </span>
                <button type="button" className="underline underline-offset-4 text-bone-dim" disabled={busy || v.active} onClick={() => void rollback(v.version)}>
                  restore as new
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

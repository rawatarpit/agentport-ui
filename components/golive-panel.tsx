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
 * Nothing here is verdant until the hosted governor reports the digest back.
 */

type Status = {
  businessName: string | null
  live: { version: number; publishedAt: string } | null
  draft: { summary: string[] } | null
  draftError: string | null
  nextVersion: number
}

export function GolivePanel() {
  const [s, setS] = useState<Status | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [envelope, setEnvelope] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState<string | null>(null)
  const [uploadErr, setUploadErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    setErr(null)
    try {
      const res = await fetch('/api/publish/status')
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
    const approve = async (confirm: boolean | string) => {
      const res = await fetch('/api/publish/approve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirm }),
      })
      return (await res.json()) as {
        status: string
        reason?: string
        tier?: string
        version?: number
        next?: string
      }
    }
    try {
      let body = await approve(true)
      if (body.status !== 'ok' && body.tier === 'typed') {
        const typed = window.prompt(
          `This widens what agents may do. Type your business name to approve v${body.version}:`,
        )
        if (typed === null) return
        body = await approve(typed)
      }
      if (body.status !== 'ok') throw new Error(body.reason ?? 'Publish refused.')
      setMsg(
        body.next ??
          `Approved version ${body.version}. Sign the exact bytes locally, then upload the envelope.`,
      )
      await load()
      await loadVersions()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Publish refused.')
    } finally {
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
    artifactStored: boolean
  }> | null>(null)

  const loadVersions = useCallback(async () => {
    try {
      const res = await fetch('/api/publish/versions')
      const body = (await res.json()) as { status: string; versions?: typeof versions }
      if (body.status === 'ok' && Array.isArray(body.versions)) setVersions(body.versions)
    } catch {
      // Versions are history, not the publish path — a failed read hides the list, never the button.
    }
  }, [])

  useEffect(() => {
    void loadVersions()
  }, [loadVersions])

  const upload = async () => {
    setUploading(true)
    setUploadErr(null)
    setUploadMsg(null)
    try {
      let parsed: unknown
      try {
        parsed = JSON.parse(envelope)
      } catch {
        throw new Error('The envelope is not valid JSON — upload the file `agent-port publish` wrote.')
      }
      const res = await fetch('/api/publish/artifact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed),
      })
      const body = (await res.json()) as {
        status: string
        reason?: string
        version?: number
        activated?: boolean
        revision?: number
      }
      if (body.status !== 'ok') throw new Error(body.reason ?? 'Upload refused.')
      setUploadMsg(
        `Artifact v${body.version} stored and activated${typeof body.revision === 'number' ? ` (runtime revision ${body.revision})` : ''}. The worker picks it up within one poll interval.`,
      )
      setEnvelope('')
      await load()
      await loadVersions()
    } catch (e) {
      setUploadErr(e instanceof Error ? e.message : 'Upload refused.')
    } finally {
      setUploading(false)
    }
  }

  const rollback = async (version: number) => {
    // Rollback is a new approval of old bytes (append-only friendly), then
    // the same sign-and-upload as any publish. Narrowing-or-equal content
    // usually clears light ceremony; anything widening asks typed.
    const confirm = window.prompt(`Restore version ${version} as a new publish? Type your business name for typed changes, or "yes" for narrowing ones.`)
    if (confirm === null) return
    setBusy(true)
    setErr(null)
    setMsg(null)
    try {
      const res = await fetch('/api/publish/approve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fromVersion: version, confirm }),
      })
      const body = (await res.json()) as { status: string; reason?: string; version?: number; tier?: string }
      if (body.status !== 'ok') throw new Error(body.reason ?? 'Rollback refused.')
      setMsg(`Version ${version} re-approved as v${body.version} (${body.tier}). Sign and upload it like any publish.`)
      await loadVersions()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Rollback refused.')
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
            Read this carefully — approving records exactly these bytes:
          </p>
          <ul className="space-y-1.5 text-[13px] leading-relaxed text-bone-dim">
            {s.draft.summary.map((line) => (
              <li key={line}>· {line}</li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={publish}>
              {busy ? 'Approving…' : s.live ? 'Approve new version' : 'Approve publish'}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={downloadFile}>
              {busy ? 'Preparing…' : 'Download install package'}
            </button>
            <span className="font-mono text-[11px] text-bone-faint">
              review above — approval covers the exact bytes you sign
            </span>
          </div>
          <p className="font-mono text-[11px] leading-relaxed text-bone-faint">
            After approval, sign locally with{' '}
            <span className="text-bone">agent-port publish --key merchant-private.pem --public-key merchant-public.pem</span>{' '}
            (the private key never leaves your machine), then upload the envelope. Until the hosted
            governor applies it and the heartbeat confirms, nothing changes.
          </p>
          <div className="border-t border-ink-line pt-3">
            <p className="label">Upload the signed envelope</p>
            <p className="mt-1 text-[12px] leading-relaxed text-bone-faint">
              Upload the JSON `agent-port publish` produced. The public key inside it is pinned by
              the hosted worker on first activation; a later key change is refused until an operator
              clears the pin.
            </p>
            <input
              type="file"
              accept=".json,application/json"
              className="mt-3 block w-full text-[12px] text-bone-dim file:mr-3 file:rounded-md file:border file:border-ink-line file:bg-ink-soft file:px-3 file:py-1.5 file:text-[12px] file:text-bone"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                setUploadMsg(null)
                setUploadErr(null)
                setEnvelope(await file.text())
              }}
            />
            <textarea
              className="mt-2 w-full rounded-md border border-ink-line bg-ink px-3 py-2 font-mono text-[12px] text-bone"
              rows={5}
              spellCheck={false}
              value={envelope}
              onChange={(e) => setEnvelope(e.target.value)}
              placeholder='{ "artifact": { ... }, "signature": "...", "publicKey": "-----BEGIN PUBLIC KEY-----..." }'
            />
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="btn"
                disabled={uploading || envelope.trim() === ''}
                onClick={upload}
              >
                {uploading ? 'Uploading…' : 'Upload and activate'}
              </button>
              {uploadMsg ? <span className="text-[13px] text-verdant">{uploadMsg}</span> : null}
            </div>
            {uploadErr ? (
              <p className="mt-2 text-[13px] text-rust" role="alert">
                {uploadErr}
              </p>
            ) : null}
          </div>
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
        nothing runs until the signed envelope is stored and the hosted governor applies it
      </p>
      {versions && versions.length > 0 ? (
        <div className="mt-2 border-t border-ink-line pt-3">
          <p className="label">Published versions</p>
          <ul className="mt-2 space-y-1.5">
            {versions.map((v) => (
              <li key={v.version} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                <span className="font-mono text-bone">v{v.version}</span>
                <span className="font-mono text-[11px] text-bone-faint">{v.riskTier} · {v.approverRole}</span>
                <span className={`font-mono text-[11px] ${v.artifactStored ? 'text-verdant' : 'text-amber'}`}>
                  {v.artifactStored ? 'stored' : 'approved, awaiting upload'}
                </span>
                <button type="button" className="underline underline-offset-4 text-bone-dim" disabled={busy} onClick={() => void rollback(v.version)}>
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

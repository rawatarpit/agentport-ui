'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { Badge } from '@/components/stat'
import type { SignedArtifact } from '@/lib/artifact-canonical'
import {
  ensurePublishKey,
  keyMatchesPin,
  loadPublishKey,
  signArtifact,
  type PublishKey,
} from '@/lib/browser-publish-key'

/**
 * Publishing, where the merchant can see the exact bytes they are about to
 * sign. The panel is embedded in /go-live; /rules links here rather than
 * owning a second publish flow.
 *
 * Shows the plain-language summary of what publishing would enact next to
 * the live version — review, then approve. The approval is the ceremony. On
 * a successful approval this browser signs the exact bytes with a key it
 * generated locally and uploads the envelope automatically: the pilot never
 * runs a CLI or handles a private key by hand. Nothing here is verdant until
 * the hosted governor reports the digest back.
 */

type Status = {
  tenantId: string
  businessName: string | null
  live: { version: number; publishedAt: string } | null
  draft: { summary: string[] } | null
  draftError: string | null
  nextVersion: number
  pinnedPublicKey: string | null
  pinnedPublicKeyKnown: boolean
}

type DeviceKeyState = 'checking' | 'ready' | 'will-create' | 'missing' | 'mismatch' | 'unknown'

type ApproveResponse = {
  status: string
  reason?: string
  tier?: string
  version?: number
  next?: string
  artifact?: SignedArtifact
}

type ArtifactResponse = {
  status: string
  reason?: string
  version?: number
  activated?: boolean
  revision?: number
}

export function GolivePanel() {
  const router = useRouter()
  const [s, setS] = useState<Status | null>(null)
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [deviceKey, setDeviceKey] = useState<DeviceKeyState>('checking')
  const [pending, setPending] = useState<{ artifact: SignedArtifact; key: PublishKey } | null>(null)

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

  useEffect(() => {
    if (!s) return
    let cancelled = false
    void (async () => {
      try {
        const key = await loadPublishKey(s.tenantId)
        if (cancelled) return
        if (!s.pinnedPublicKeyKnown) setDeviceKey('unknown')
        else if (!key) setDeviceKey(s.pinnedPublicKey !== null ? 'missing' : 'will-create')
        else if (keyMatchesPin(key, s.pinnedPublicKey)) setDeviceKey('ready')
        else setDeviceKey('mismatch')
      } catch {
        if (!cancelled) setDeviceKey('unknown')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [s])

  const approve = async (payload: { confirm: boolean | string; fromVersion?: number }): Promise<ApproveResponse> => {
    const res = await fetch('/api/publish/approve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return (await res.json()) as ApproveResponse
  }

  const prepareKey = useCallback(async (status: Status): Promise<PublishKey> => {
    if (!status.pinnedPublicKeyKnown) {
      throw new Error(
        'The publishing key pinned for this workspace could not be read. Publishing is unknown, not ready — retry before signing.',
      )
    }
    const existing = await loadPublishKey(status.tenantId)
    if (existing !== null) {
      if (!keyMatchesPin(existing, status.pinnedPublicKey)) {
        throw new Error(
          'This browser holds a different publishing key than the one pinned for this workspace. It cannot sign for it.',
        )
      }
      return existing
    }
    if (status.pinnedPublicKey !== null) {
      throw new Error(
        'This workspace is pinned to a publishing key that is not on this device. Automatic publishing can only run where that key was created; key rotation is an operator ceremony.',
      )
    }
    const ensured = await ensurePublishKey(status.tenantId)
    if (!ensured.ok) throw new Error(ensured.reason)
    if (!keyMatchesPin(ensured.key, status.pinnedPublicKey)) {
      throw new Error('The signing key created on this device does not match the workspace pin.')
    }
    return ensured.key
  }, [])

  const uploadSigned = async (artifact: SignedArtifact, key: PublishKey): Promise<ArtifactResponse> => {
    setPhase('Signing…')
    const signed = await signArtifact(artifact, key)
    setPhase('Uploading…')
    const res = await fetch('/api/publish/artifact', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ artifact, signature: signed.signature, publicKey: signed.publicKey }),
    })
    return (await res.json()) as ArtifactResponse
  }

  const approveAndPublish = async (payload: { confirm: boolean | string; fromVersion?: number }) => {
    if (!s) return
    setBusy(true)
    setErr(null)
    setMsg(null)
    setPhase('Preparing…')
    let key: PublishKey | null = null
    let approved: SignedArtifact | null = null
    try {
      key = await prepareKey(s)
      setPhase('Approving…')
      let body = await approve(payload)
      // A widening change always asks for the business name, whether this is
      // a normal publish or a rollback. The approval row is not written until
      // the name matches, so a cancelled prompt records nothing.
      if (body.status !== 'ok' && body.tier === 'typed' && typeof body.version === 'number') {
        const typed = window.prompt(
          `This widens what agents may do. Type your business name to approve v${body.version}:`,
        )
        if (typed === null) return
        body = await approve({ ...payload, confirm: typed })
      }
      if (body.status !== 'ok') throw new Error(body.reason ?? 'Publish refused.')
      if (!body.artifact) throw new Error('Approval did not return the exact bytes to sign. Retry.')
      approved = body.artifact
      const result = await uploadSigned(approved, key)
      if (result.status !== 'ok') throw new Error(result.reason ?? 'Upload refused.')
      setPending(null)
      const revision = typeof result.revision === 'number' ? ` (runtime revision ${result.revision})` : ''
      setMsg(
        `Version ${result.version} signed on this device, stored, and activated${revision}. It is not live until the hosted governor applies it and the heartbeat confirms.`,
      )
      await load()
      await loadVersions()
      router.refresh()
    } catch (e) {
      // The approval is durable once recorded. If signing or upload fails,
      // keep the exact bytes and key in memory so the merchant can retry
      // without re-approving different content.
      if (approved !== null && key !== null) {
        setPending({ artifact: approved, key })
        await loadVersions()
      }
      setErr(e instanceof Error ? e.message : 'Publish refused.')
    } finally {
      setPhase(null)
      setBusy(false)
    }
  }

  const retryPending = async () => {
    if (!s || !pending) return
    setBusy(true)
    setErr(null)
    setMsg(null)
    try {
      const result = await uploadSigned(pending.artifact, pending.key)
      if (result.status !== 'ok') throw new Error(result.reason ?? 'Upload refused.')
      setPending(null)
      const revision = typeof result.revision === 'number' ? ` (runtime revision ${result.revision})` : ''
      setMsg(
        `Version ${result.version} signed on this device, stored, and activated${revision}. It is not live until the hosted governor applies it and the heartbeat confirms.`,
      )
      await load()
      await loadVersions()
      router.refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload refused.')
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

  const rollback = async (version: number) => {
    // Rollback is a new approval of old bytes (append-only friendly), then
    // the same automatic sign-and-upload as any publish. Narrowing-or-equal
    // content usually clears light ceremony; anything widening asks typed.
    const confirm = window.prompt(
      `Restore version ${version} as a new publish? Type your business name for typed changes, or "yes" for narrowing ones.`,
    )
    if (confirm === null) return
    await approveAndPublish({ fromVersion: version, confirm })
  }

  const canPublish = s !== null && (deviceKey === 'ready' || deviceKey === 'will-create')

  const deviceKeyNote =
    deviceKey === 'will-create'
      ? 'First publish creates a signing key on this device. It never leaves the browser.'
      : deviceKey === 'ready'
        ? 'This device holds the publishing key for this workspace.'
        : deviceKey === 'missing'
          ? 'This workspace is pinned to a publishing key that is not on this device. Automatic publishing can only run where that key was created; key rotation is an operator ceremony.'
          : deviceKey === 'mismatch'
            ? 'This device holds a different publishing key than the one pinned for this workspace. It cannot sign for it.'
            : deviceKey === 'unknown'
              ? 'The workspace pin could not be read. Publishing is unknown, not ready — retry.'
              : null

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
            Read this carefully — approving records exactly these bytes and this browser signs them immediately:
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
              onClick={() => void approveAndPublish({ confirm: true })}
            >
              {busy ? (phase ?? 'Working…') : 'Approve & publish'}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={downloadFile}>
              {busy ? 'Preparing…' : 'Download install package'}
            </button>
            <span className="font-mono text-[11px] text-bone-faint">
              review above — approval covers the exact bytes this browser signs
            </span>
          </div>
          {deviceKeyNote ? (
            <p className="font-mono text-[11px] leading-relaxed text-bone-faint">{deviceKeyNote}</p>
          ) : null}
          <p className="font-mono text-[11px] leading-relaxed text-bone-faint">
            After approval, this browser signs the exact bytes and uploads the envelope automatically. The
            private key never leaves the device. Until the hosted governor applies it and the heartbeat
            confirms, nothing changes.
          </p>
          {pending ? (
            <div className="rounded-md border border-ink-line p-3">
              <p className="text-[13px] text-bone">
                Version {pending.artifact.version} was approved but not uploaded. Keep this page open and retry.
              </p>
              <button type="button" className="btn mt-2" disabled={busy} onClick={() => void retryPending()}>
                {busy ? (phase ?? 'Working…') : 'Retry signing & upload'}
              </button>
            </div>
          ) : null}
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

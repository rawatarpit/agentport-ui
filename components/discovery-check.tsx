'use client'

import { useState } from 'react'
import { StatusPill } from '@/components/ui/status-pill'

type CheckResult =
  | { status: 'ok'; url: string; httpStatus: number; manifest: unknown }
  | { status: 'error'; reason: string; url: string | null; httpStatus: number | null }

type ManifestShape = {
  version?: unknown
  business?: unknown
  generatedAt?: unknown
  capabilities?: unknown
  baseUrl?: unknown
}

/**
 * The last step is a fetch, not a badge.
 *
 * A stored artifact proves the merchant signed something. It does not prove a
 * worker is serving this tenant. This button asks the hosted governor for the
 * canonical manifest through the console's own route (no cross-origin fetch,
 * no open proxy) and reports the HTTP answer it actually got.
 */
export function DiscoveryCheck({
  canonicalUrl,
  invokeUrl,
}: {
  canonicalUrl: string | null
  invokeUrl?: string | null
}) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<CheckResult | null>(null)

  const check = async () => {
    setBusy(true)
    setResult(null)
    try {
      const res = await fetch('/api/discovery/check', { cache: 'no-store' })
      const body = (await res.json()) as CheckResult
      setResult(body)
    } catch {
      setResult({
        status: 'error',
        reason: 'The console could not run the check. Try again in a moment.',
        url: canonicalUrl,
        httpStatus: null,
      })
    } finally {
      setBusy(false)
    }
  }

  const manifest = result?.status === 'ok' ? (result.manifest as ManifestShape) : null
  const capabilities = manifest && Array.isArray(manifest.capabilities) ? manifest.capabilities.length : null
  const state = result === null ? 'idle' : result.status === 'ok' ? 'live' : 'blocked'

  return (
    <div className="panel-strong space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="label">Canonical discovery</p>
          <p className="mt-1 text-[13px] leading-relaxed text-bone-dim">
            The address an agent reads. It must be served by the hosted governor, not by
            the static files on your site.
          </p>
        </div>
        <StatusPill tone={state === 'live' ? 'live' : state === 'blocked' ? 'blocked' : 'draft'}>
          {state === 'live' ? 'Serving' : state === 'blocked' ? 'Not serving' : 'Unchecked'}
        </StatusPill>
      </div>

      {canonicalUrl ? (
        <div className="space-y-1.5">
          <p className="break-all rounded-md border border-ink-line bg-ink/50 px-3 py-2 font-mono text-[11.5px] text-bone-dim">
            {canonicalUrl}
          </p>
          {invokeUrl ? (
            <p className="break-all px-3 font-mono text-[11px] text-bone-faint">execute: {invokeUrl}</p>
          ) : null}
        </div>
      ) : (
        <p className="text-[13px] text-amber" role="alert">
          The hosted governor origin is not configured on this deployment, so the
          canonical address cannot be built. Set <span className="font-mono">AGENTPORT_WORKER_URL</span>.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary" disabled={busy || !canonicalUrl} onClick={() => void check()}>
          {busy ? 'Checking…' : 'Check canonical manifest'}
        </button>
        {canonicalUrl ? (
          <a href={canonicalUrl} target="_blank" rel="noreferrer" className="btn btn-sm btn-quiet">
            Open in a tab
          </a>
        ) : null}
      </div>

      {result?.status === 'ok' ? (
        <div className="rounded-md border border-verdant/30 bg-verdant/[0.06] p-3" role="status">
          <p className="text-[13px] text-verdant">
            The governor answered {result.httpStatus} with a manifest.
          </p>
          <p className="mt-1 font-mono text-[11.5px] leading-relaxed text-bone-dim">
            {typeof manifest?.version === 'string' ? `version ${manifest.version}` : 'version unknown'}
            {typeof manifest?.business === 'string' ? ` · ${manifest.business}` : ''}
            {capabilities !== null ? ` · ${capabilities} capabilit${capabilities === 1 ? 'y' : 'ies'}` : ''}
            {typeof manifest?.generatedAt === 'string' ? ` · generated ${manifest.generatedAt}` : ''}
          </p>
        </div>
      ) : null}

      {result?.status === 'error' ? (
        <div className="rounded-md border border-rust/40 bg-rust/[0.07] p-3" role="alert">
          <p className="text-[13px] text-rust">
            {result.httpStatus ? `HTTP ${result.httpStatus}: ` : ''}
            {result.reason}
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-bone-dim">
            A 502 here means the hosted worker has no active runtime for this tenant, even
            if the static files on your site look correct.
          </p>
        </div>
      ) : null}
    </div>
  )
}

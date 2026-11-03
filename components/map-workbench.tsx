'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import Link from 'next/link'
import {
  parseInventory,
  propose,
  reconcile,
  type Buckets,
  type CapabilityProposal,
} from '@/lib/map'

/**
 * Map your pages to AgentPort.
 *
 * The non-technical path: scan your website, see the pages found, pick which
 * ones agents may use, save. The technical path: paste discovery inventory
 * JSON. Both lead to the same draft.
 *
 * Defaults are safe: reads are included, writes are included but held for
 * your approval until you explicitly allow them to run unattended.
 */

const SAMPLE = JSON.stringify(
  {
    endpoints: [
      { method: 'GET', path: '/products', provenance: ['discover'], liveHits: 412 },
      { method: 'GET', path: '/products/:id', provenance: ['discover'], liveHits: 87 },
      { method: 'POST', path: '/orders', provenance: ['discover'], liveHits: 39 },
      { method: 'POST', path: '/admin/reindex', provenance: ['capture'], liveHits: 3 },
      { method: 'GET', path: '/legacy/feed', provenance: ['discover'], liveHits: 0 },
    ],
  },
  null,
  2,
)

type Row = CapabilityProposal & { checked: boolean; name: string }

export function MapWorkbench() {
  const router = useRouter()
  const [stage, setStage] = useState<'intro' | 'review' | 'saved'>('intro')
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [buckets, setBuckets] = useState<Buckets | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [dropped, setDropped] = useState(0)
  const [saved, setSaved] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function analyze(input: string) {
    setError(null)
    setSaved(null)
    const parsed = parseInventory(input)
    if (!parsed.ok) {
      setError(parsed.reason)
      setBuckets(null)
      setRows([])
      return
    }
    const b = reconcile(parsed.endpoints)
    setBuckets(b)
    setDropped(b.dropped)
    setStage('review')
    setRows(
      propose(b).map((p) => ({
        ...p,
        checked: p.bucket === 'corroborated',
        name: p.name,
      })),
    )
  }

  function toggle(key: string) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, checked: !r.checked } : r)))
  }

  function rename(key: string, name: string) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, name } : r)))
  }

  async function save() {
    setSaving(true)
    setSaved(null)
    setError(null)
    const extra = rows
      .filter((r) => r.checked)
      .map((r) => ({
        name: r.name.trim(),
        method: r.method,
        path: r.path,
        kind: r.kind,
      }))
    try {
      const res = await fetch('/api/drafts/capabilities', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: { hidden: {}, extra } }),
      })
      const body = (await res.json()) as { status: string; reason?: string; errors?: string[] }
      if (body.status !== 'ok') {
        setError(`Draft rejected: ${body.reason ?? 'unknown'}${body.errors?.length ? ` — ${body.errors.join('; ')}` : ''}`)
        return
      }
      setSaved(
        `Saved ${extra.length} page${extra.length === 1 ? '' : 's'}. Agents can now use these pages once you publish.`,
      )
      setStage('saved')
      router.refresh()
    } catch (e) {
      setError(`Could not save: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSaving(false)
    }
  }

  // ── Intro screen ──────────────────────────────────────────────
  if (stage === 'intro') {
    return (
      <div className="space-y-6">
        <div className="panel p-6 text-center">
          <p className="label">Map your pages to AgentPort</p>
          <h2 className="mt-2 font-display text-[24px] font-semibold leading-tight text-bone">
            Which pages can agents use?
          </h2>
          <p className="mt-3 max-w-[56ch] mx-auto text-[13px] leading-relaxed text-bone-dim">
            AgentPort can only act on pages you choose. Scan your site to see
            what pages exist, then pick the ones agents should be able to use.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              setError(null)
              try {
                const res = await fetch('/api/map/crawl', { method: 'POST' })
                const body = (await res.json()) as {
                  status: string
                  reason?: string
                  endpoints?: unknown
                  origin?: string
                }
                if (body.status !== 'ok' || !body.endpoints) {
                  setError(
                    `Scan refused: ${body.reason ?? 'unknown'} — set your website address first in Go live.`,
                  )
                  return
                }
                const crawled = JSON.stringify(
                  { origin: body.origin, endpoints: body.endpoints },
                  null,
                  2,
                )
                analyze(crawled)
              } catch (e) {
                setError(`Scan failed: ${e instanceof Error ? e.message : String(e)}`)
              }
            }}
          >
            Scan my website
          </button>
          <button type="button" className="btn" onClick={() => setText(SAMPLE)}>
            Load example
          </button>
          <div className="flex flex-col gap-2">
            <label className="label text-left">Or paste discovery JSON</label>
            <textarea
              id="map-input"
              className="w-full rounded-md border border-ink-line bg-ink px-3 py-2 font-mono text-[12px] text-bone"
              rows={6}
              spellCheck={false}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder='{"endpoints": [{"method": "GET", "path": "/products"}]}'
            />
            <button type="button" className="btn btn-sm" onClick={() => analyze(text)}>
              Review pages
            </button>
          </div>
        </div>

        {error ? (
          <p className="mt-3 text-[13px] text-rust" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    )
  }

  // ── Saved screen ──────────────────────────────────────────────
  if (stage === 'saved') {
    return (
      <div className="space-y-6">
        <div className="panel p-6 rounded-xl border border-verdant/30 bg-verdant/[0.05] text-center">
          <p className="font-display text-[20px] font-semibold text-verdant">Saved</p>
          <p className="mt-2 text-[13px] text-bone-dim">{saved}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link href="/capabilities" className="btn btn-sm">
              Review pages & limits
            </Link>
            <Link href="/go-live" className="btn btn-sm btn-primary">
              Continue setup
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ── Review screen ─────────────────────────────────────────────
  const count = buckets ? buckets.corroborated.length + buckets.undeclared.length : 0
  const writeCount = rows.filter((r) => r.kind === 'write' && r.checked).length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="label">Pages found</p>
          <p className="mt-1 text-[13px] text-bone-dim">
            {count} page{count === 1 ? '' : 's'} detected. Pick the ones agents may use.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setStage('intro')}
          >
            Rescan
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={rows.filter((r) => r.checked).length === 0 || saving}
            onClick={save}
          >
            {saving ? 'Saving…' : 'Save selected pages'}
          </button>
        </div>
      </div>

      {dropped > 0 && (
        <p className="text-[12px] text-bone-faint">
          {dropped} item{dropped === 1 ? '' : 's'} skipped (no valid address).
        </p>
      )}

      {error ? (
        <p className="mt-3 text-[13px] text-rust" role="alert">{error}</p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => {
          const isWrite = r.kind === 'write'
          const isChecked = r.checked
          return (
            <article
              key={r.key}
              className={`rounded-lg border p-4 transition-colors ${isChecked ? 'border-verdant/50 bg-verdant/[0.04]' : 'border-ink-line/60 hover:border-verdant/50'}`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggle(r.key)}
                    className="mt-0.5"
                    aria-label={`Include ${r.name}`}
                  />
                  <span className={`font-mono text-[12px] font-semibold ${isChecked ? 'text-verdant' : 'text-bone'}`}>
                    {r.name}
                  </span>
                </div>
                <span className={`text-[10px] uppercase tracking-[0.12em] ${isWrite ? 'text-rust' : 'text-verdant'}`}>
                  {isWrite ? 'Changes data' : 'Read-only'}
                </span>
              </div>
              <p className="font-mono text-[11px] text-bone-dim truncate max-w-[200px]">
                {r.method} {r.path}
              </p>
              <p className="mt-2 text-[12px] text-bone-faint leading-relaxed">
                {isWrite
                  ? 'Agents can use this, but it waits for your approval before running.'
                  : 'Agents can read this page freely.'}
              </p>
              {!isChecked && (
                <p className="mt-2 text-[11px] text-bone-faint">
                  Not included — agents cannot use this page.
                </p>
              )}
            </article>
          )
        })}
      </div>

      {rows.length > 0 && (
        <div className="mt-4 rounded-lg border border-ink-line bg-ink/30 p-4">
          <p className="label">What happens next</p>
          <ul className="mt-2 space-y-1 text-[12px] text-bone-dim">
            <li>
              Read pages are included as-is. Agents can look them up freely.
            </li>
            <li>
              Write pages (like placing an order) are saved but{' '}
              <span className="text-bone">held for your approval</span> before they run.
            </li>
            <li>
              Nothing is live for your visitors until you publish from Go live.
            </li>
          </ul>
        </div>
      )}

      {saved ? (
        <p className="mt-3 text-[13px] text-verdant" role="status">
          {saved}
        </p>
      ) : null}
    </div>
  )
}

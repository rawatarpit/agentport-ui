'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/stat'
import type { DataClass } from '@/lib/contracts'
import {
  parseInventory,
  propose,
  reconcile,
  type Buckets,
  type CapabilityProposal,
} from '@/lib/map'

type Row = Omit<CapabilityProposal, 'dataClass'> & { checked: boolean; name: string; dataClass: DataClass }

const DATA_CLASSES: DataClass[] = ['public', 'internal', 'pii', 'payment']
const DATA_CLASS_HELP: Record<DataClass, string> = {
  public: 'Already published; safe to auto-issue to agents.',
  internal: 'Business data. Requires a human grant.',
  pii: 'Personal data. Requires a human grant and is redacted in the ledger.',
  payment: 'Payment data. Requires a human grant.',
}

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
        dataClass: p.dataClass,
      })),
    )
  }

  function toggle(key: string) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, checked: !r.checked } : r)))
  }

  function rename(key: string, name: string) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, name } : r)))
  }

  function updateDataClass(key: string, value: DataClass) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, dataClass: value } : r)))
  }

  async function save() {
    setSaving(true)
    setSaved(null)
    setError(null)
    try {
      const current = await fetch('/api/drafts/capabilities', { cache: 'no-store' })
      if (!current.ok) {
        setError('Could not read current capabilities draft — refusing to save.')
        return
      }
      const currentBody = (await current.json()) as {
        draft?: {
          hidden?: Record<string, string[]>
          extra?: Array<{
            name: string
            method: string
            path: string
            kind: 'read' | 'write'
            allowUnattended?: boolean
            dataClass?: 'public' | 'internal' | 'pii' | 'payment'
            autoIssue?: boolean
          }>
        } | null
      }
      const hidden = currentBody.draft?.hidden ?? {}
      // Re-mapping the same route must not silently reset its classification
      // or auto-issue choice. The route identity is method + path, not the
      // editable display name.
      const existing = new Map(
        (currentBody.draft?.extra ?? []).map((e) => [`${e.method} ${e.path}`, e]),
      )
      const extra = rows
        .filter((r) => r.checked)
        .map((r) => {
          const saved = existing.get(`${r.method} ${r.path}`)
          return {
            name: r.name.trim(),
            method: r.method,
            path: r.path,
            kind: r.kind,
            allowUnattended: saved?.allowUnattended === true,
            dataClass: saved?.dataClass ?? r.dataClass,
            autoIssue: saved?.autoIssue === true,
          }
        })

      const res = await fetch('/api/drafts/capabilities', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: { hidden, extra } }),
      })
      const body = (await res.json()) as { status: string; reason?: string; errors?: string[] }
      if (body.status !== 'ok') {
        setError(`Draft rejected: ${body.reason ?? 'unknown'}${body.errors?.length ? ` — ${body.errors.join('; ')}` : ''}`)
        return
      }
      setSaved(`Saved ${extra.length} page${extra.length === 1 ? '' : 's'}. Agents can now use these pages once you publish.`)
      setStage('saved')
      router.refresh()
    } catch (e) {
      setError(`Could not save: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSaving(false)
    }
  }

  if (stage === 'intro') {
    return (
      <div className="space-y-6">
        <div className="panel p-6 text-center">
          <p className="label">Map your pages to AgentPort</p>
          <h2 className="mt-2 font-display text-[24px] font-semibold leading-tight text-bone">
            Which pages can agents use?
          </h2>
          <p className="mt-3 max-w-[56ch] mx-auto text-[13px] leading-relaxed text-bone-dim">
            AgentPort can only act on pages you choose. Paste your discovery
            output below, then pick which endpoints become executable capabilities.
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

  if (stage === 'saved') {
    return (
      <div className="space-y-6">
        <div className="panel p-6 rounded-xl border border-verdant/30 bg-verdant/[0.05] text-center">
          <p className="font-display text-[20px] font-semibold text-verdant">Saved</p>
          <p className="mt-2 text-[13px] text-bone-dim">{saved}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link href="/capabilities" className="btn btn-sm">
              Review mapped capabilities
            </Link>
            <Link href="/go-live" className="btn btn-sm btn-primary">
              Continue setup
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const checkedCount = rows.filter((r) => r.checked).length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="label">Discovered endpoints</p>
          <p className="mt-1 text-[13px] text-bone-dim">
            {rows.length} endpoint{rows.length === 1 ? '' : 's'} found.{' '}
            {checkedCount > 0 ? `${checkedCount} selected for mapping.` : ''}
            {dropped > 0 ? ` · ${dropped} skipped.` : ''}
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
            disabled={checkedCount === 0 || saving}
            onClick={save}
          >
            {saving ? 'Saving…' : 'Save selected pages'}
          </button>
        </div>
      </div>

      {dropped > 0 && (
        <p className="text-[12px] text-bone-faint">
          {dropped} endpoint{dropped === 1 ? '' : 's'} skipped (no valid address).
        </p>
      )}

      {error ? (
        <p className="mt-3 text-[13px] text-rust" role="alert">{error}</p>
      ) : null}

      <div className="panel overflow-hidden">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-ink-line bg-ink/20">
              <th key="include" className="label px-4 py-3 font-normal" style={{ width: 60 }}>
                Include
              </th>
              <th key="name" className="label px-4 py-3 font-normal">
                Capability name
              </th>
              <th key="method" className="label px-4 py-3 font-normal">
                Method
              </th>
              <th key="path" className="label px-4 py-3 font-normal">
                Path
              </th>
              <th key="kind" className="label px-4 py-3 font-normal">
                Type
              </th>
              <th key="dataClass" className="label px-4 py-3 font-normal">
                Data class
              </th>
              <th key="bucket" className="label px-4 py-3 font-normal">
                Surface
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isChecked = r.checked
              return (
                <tr key={r.key} className="border-b border-ink-line/60 hover:bg-ink/5 last:border-0">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggle(r.key)}
                      className="mt-0.5"
                      aria-label={`Include ${r.name}`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={r.name}
                      onChange={(e) => rename(r.key, e.target.value)}
                      className="w-full border border-ink-line bg-transparent px-3 py-2 font-mono text-[12px] text-bone outline-none focus:border-verdant focus-visible:ring-1 focus-visible:ring-verdant/50"
                      aria-label={`Capability name for ${r.name}`}
                    />
                  </td>
                  <td className="px-4 py-3 font-mono text-[12px] text-bone-dim">
                    {r.method}
                  </td>
                  <td className="px-4 py-3 font-mono text-[12px] text-bone-dim truncate max-w-[200px]">
                    {r.path}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={r.kind === 'write' ? 'held' : 'allow'}>{r.kind}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className="border border-ink-line bg-transparent px-2 py-1 font-mono text-[11px] outline-none focus:border-verdant"
                      value={r.dataClass}
                      onChange={(e) => updateDataClass(r.key, e.target.value as DataClass)}
                      aria-label={`Data class for ${r.name}`}
                    >
                      {DATA_CLASSES.map((dc) => (
                        <option key={dc} value={dc}>
                          {dc}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-bone-faint uppercase tracking-[0.08em]">
                    {r.bucket}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {rows.length > 0 && (
        <div className="mt-4 rounded-lg border border-ink-line bg-ink/30 p-4">
          <p className="label">What happens next</p>
          <ul className="mt-2 space-y-1 text-[12px] text-bone-dim">
            <li>
              Read capabilities are included as-is. Agents can look them up freely.
            </li>
            <li>
              Write capabilities are saved but{' '}
              <span className="text-bone">held for your approval</span> before they run.
            </li>
            <li>
              Each route is given a data class above — set it here or change it later on
              Capabilities. Only a public read may auto-issue; writes and private reads
              require a human grant.
            </li>
            <li>
              Nothing is live for your visitors until you publish from Go-live.
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

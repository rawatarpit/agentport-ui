'use client'

import { useState } from 'react'
import {
  parseInventory,
  propose,
  reconcile,
  type Buckets,
  type CapabilityProposal,
} from '@/lib/map'

/**
 * The Map workbench: pasted inventory in, capability draft out.
 *
 * Client-side on purpose: parsing and reconciling never leave the browser —
 * the merchant's route tables are their own reconnaissance surface, and
 * there is no reason to POST them anywhere before the merchant has chosen
 * what to publish. Only the chosen draft travels, to /api/drafts, which
 * validates it a second time server-side.
 *
 * Defaults are the safe direction: corroborated pre-checked (declared AND
 * seen — the safe core), undeclared unchecked (shadow surface needs a human
 * look first), unused unchecked (dead surface, prune candidate).
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

type Row = CapabilityProposal & { checked: boolean; name: string; kind: 'read' | 'write' }

export function MapWorkbench() {
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
    setRows(
      propose(b).map((p) => ({
        ...p,
        checked: p.bucket === 'corroborated',
        name: p.name,
        kind: p.kind,
      })),
    )
  }

  function toggle(key: string) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, checked: !r.checked } : r)))
  }

  function rename(key: string, name: string) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, name } : r)))
  }

  function setKind(key: string, kind: 'read' | 'write') {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, kind } : r)))
  }

  async function save() {
    setSaving(true)
    setSaved(null)
    setError(null)
    const extra = rows
      .filter((r) => r.checked)
      .map((r) => ({ name: r.name.trim(), method: r.method, path: r.path, kind: r.kind }))
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
        `Saved ${extra.length} mapped ${extra.length === 1 ? 'capability' : 'capabilities'} to the capabilities draft. Review in Capabilities, set limits in Rules, publish from Go-live.`,
      )
    } catch (e) {
      setError(`Could not save: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSaving(false)
    }
  }

  const counts = buckets
    ? [
        ['corroborated', buckets.corroborated.length],
        ['undeclared', buckets.undeclared.length],
        ['unused', buckets.unused.length],
      ]
    : []

  return (
    <div className="space-y-6">
      <div className="panel p-5">
        <label className="label" htmlFor="map-input">
          Inventory JSON — paste `agent-port discover`, `capture`, or `inventory` output
        </label>
        <textarea
          id="map-input"
          className="mt-3 w-full rounded-md border border-ink-line bg-ink px-3 py-2 font-mono text-[12px] text-bone"
          rows={8}
          spellCheck={false}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='{"endpoints": [{"method": "GET", "path": "/products", ...}]}'
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn btn-primary" type="button" onClick={() => analyze(text)}>
            Reconcile
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => {
              setText(SAMPLE)
              analyze(SAMPLE)
            }}
          >
            Load sample
          </button>
          <button
            className="btn"
            type="button"
            onClick={async () => {
              setError(null)
              setSaved(null)
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
                    `Crawl refused: ${body.reason ?? 'unknown'} — set the merchant website URL on connect first.`,
                  )
                  return
                }
                const crawled = JSON.stringify(
                  { origin: body.origin, endpoints: body.endpoints },
                  null,
                  2,
                )
                setText(crawled)
                analyze(crawled)
              } catch (e) {
                setError(`Crawl failed: ${e instanceof Error ? e.message : String(e)}`)
              }
            }}
          >
            Crawl merchant site
          </button>
        </div>
        {error ? (
          <p className="mt-3 text-[13px] text-rust" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      {buckets ? (
        <div className="panel p-5">
          <div className="flex flex-wrap gap-2">
            {counts.map(([name, n]) => (
              <span key={name} className="font-mono text-[12px] text-bone-dim">
                {name}: <span className="text-bone">{n}</span>
              </span>
            ))}
            {dropped > 0 ? (
              <span className="font-mono text-[12px] text-bone-faint">dropped (unparseable): {dropped}</span>
            ) : null}
          </div>
          <p className="mt-3 max-w-[68ch] text-[13px] text-bone-dim">
            <span className="text-bone">Undeclared</span> is the security-relevant bucket: live
            traffic to routes no static pass named — shadow surface. Review every row before
            promoting it; a used route the team forgot is how an admin endpoint becomes
            agent-reachable.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-ink-line">
                  {['', 'Capability', 'Method', 'Path', 'Kind', 'Bucket'].map((h) => (
                    <th key={h} scope="col" className="label px-3 py-2 font-normal">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-b border-ink-line/60 last:border-0">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={r.checked}
                        onChange={() => toggle(r.key)}
                        aria-label={`Promote ${r.key}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="w-40 rounded border border-ink-line bg-ink px-2 py-1 font-mono text-[12px] text-bone"
                        value={r.name}
                        onChange={(e) => rename(r.key, e.target.value)}
                        aria-label={`Capability name for ${r.key}`}
                      />
                    </td>
                    <td className="px-3 py-2 font-mono text-[12px] text-bone-dim">{r.method}</td>
                    <td className="px-3 py-2 font-mono text-[12px] text-bone-dim">{r.path}</td>
                    <td className="px-3 py-2">
                      <select
                        className="rounded border border-ink-line bg-ink px-2 py-1 text-[12px] text-bone"
                        value={r.kind}
                        onChange={(e) => setKind(r.key, e.target.value === 'write' ? 'write' : 'read')}
                        aria-label={`Access class for ${r.key}`}
                      >
                        <option value="read">read</option>
                        <option value="write">write</option>
                      </select>
                    </td>
                    <td className="px-3 py-2 font-mono text-[12px] text-bone-faint">{r.bucket}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button className="btn btn-primary" type="button" disabled={saving} onClick={save}>
              {saving ? 'Saving…' : 'Save selected to capabilities draft'}
            </button>
            <a className="font-mono text-[12px] text-bone-dim underline" href="/capabilities">
              Review in Capabilities
            </a>
            <a className="font-mono text-[12px] text-bone-dim underline" href="/rules">
              Set limits in Rules
            </a>
          </div>
          {saved ? (
            <p className="mt-3 text-[13px] text-verdant" role="status">
              {saved}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

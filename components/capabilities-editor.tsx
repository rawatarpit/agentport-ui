'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Badge } from '@/components/stat'
import type { DataClass } from '@/lib/contracts'

/**
 * What agents may see.
 *
 * Split from the rules screen on purpose. The owner of a small shop changes what
 * an agent is allowed to know long before they think about limits — "don't show
 * them my supplier cost" is an instinct, and "cap orders at ₹250" is a policy
 * decision that arrives later, usually after something went wrong. One screen
 * asking for both gets the first one answered late.
 *
 * Every row here is a **draft**. Hiding a field changes the manifest the agent
 * reads, which is advisory; it does not change what the ledger records, and it
 * does not change enforcement. TASKS.md 3.4: a saved capability that has not
 * merged is `not deployed`, and this screen must never imply otherwise.
 */

type Cap = {
  name: string
  kind: 'read' | 'write'
  fields: string[]
  hidden: string[]
  description: string
}

/**
 * A route-backed capability saved from Map routes. The server normalises
 * `kind` from the HTTP method and defaults writes to held; the UI only
 * displays that decision, it does not re-derive it.
 */
type ExtraCap = {
  name: string
  method: string
  path: string
  kind: 'read' | 'write'
  allowUnattended?: boolean
  dataClass: DataClass
  autoIssue: boolean
}

const DATA_CLASSES: DataClass[] = ['public', 'internal', 'pii', 'payment']
const DATA_CLASS_HELP: Record<DataClass, string> = {
  public: 'Already published; safe to auto-issue to agents.',
  internal: 'Business data. Requires a human grant.',
  pii: 'Personal data. Requires a human grant and is redacted in the ledger.',
  payment: 'Payment data. Requires a human grant.',
}

/** An approved execution blueprint, written by publish approval. */
export type InventoryCap = {
  name: string
  method: string
  path: string
  kind: 'read' | 'write'
  origin: string
}

const CAPS: Cap[] = [
  {
    name: 'searchProducts',
    kind: 'read',
    fields: ['q', 'maxPriceMinor'],
    hidden: [],
    description: 'Search the catalogue by query, size or price band.',
  },
  {
    name: 'checkInventory',
    kind: 'read',
    fields: ['sku'],
    hidden: [],
    description: 'Check stock for a SKU.',
  },
  {
    name: 'createOrder',
    kind: 'write',
    fields: ['items', 'amountMinor'],
    hidden: ['amountMinor'],
    description: 'Create an order. Always held for human approval.',
  },
  {
    name: 'requestRefund',
    kind: 'write',
    fields: ['orderId'],
    hidden: [],
    description: 'Refund an order. Forbidden to external agents.',
  },
]

export function CapabilitiesEditor({ inventory = [] }: { inventory?: InventoryCap[] }) {
  // Start with nothing hidden. The old default pre-hid createOrder.amountMinor,
  // which made the unsaved screen claim a field was already hidden from
  // agents. Only a saved draft may say that.
  const [hidden, setHidden] = useState<Record<string, string[]>>(
    Object.fromEntries(CAPS.map((c) => [c.name, []])),
  )
  // Kept in state so saving field visibility cannot silently drop the
  // merchant's mapped routes. The PUT replaces the whole draft section.
  const [extra, setExtra] = useState<ExtraCap[]>([])
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // The form edits a copy; the API holds truth. Unknown capabilities in a
  // saved draft are ignored rather than rendered — the known list is the UI.
  useEffect(() => {
    let live = true
    fetch('/api/drafts/capabilities')
      .then((r) => r.json())
      .then((body: { draft?: { hidden?: Record<string, string[]>; extra?: ExtraCap[] } | null }) => {
        if (!live || !body.draft) return
        if (body.draft.hidden) {
          const savedHidden = body.draft.hidden
          setHidden((h) => {
            const next = { ...h }
            for (const [cap, fields] of Object.entries(savedHidden)) {
              if (next[cap] && Array.isArray(fields)) next[cap] = fields.filter((f) => typeof f === 'string')
            }
            return next
          })
        }
        if (Array.isArray(body.draft.extra)) {
          setExtra(
            body.draft.extra.map((e) => ({
              ...e,
              dataClass: e.dataClass ?? 'internal',
              autoIssue: e.autoIssue === true,
            })),
          )
        }
        setSavedAt('loaded')
      })
      .catch(() => {
        if (live) setLoadError(true)
      })
      .finally(() => {
        if (live) setLoaded(true)
      })
    return () => {
      live = false
    }
  }, [])

  const save = async () => {
    if (!loaded || loadError) {
      setSaveError(
        'Reload the page before saving — the current draft could not be read, so saving could overwrite mapped routes.',
      )
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch('/api/drafts/capabilities', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ payload: { hidden, extra } }),
      })
      const body = (await res.json()) as { status: string; reason?: string; errors?: string[]; updatedAt?: string }
      if (body.status !== 'ok') throw new Error(body.errors?.[0] ?? body.reason ?? 'Save refused.')
      setSavedAt(body.updatedAt ?? 'saved')
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save refused.')
    } finally {
      setSaving(false)
    }
  }

  const toggle = (cap: string, field: string) =>
    setHidden((h) => ({
      ...h,
      [cap]: h[cap]!.includes(field) ? h[cap]!.filter((f) => f !== field) : [...h[cap]!, field],
    }))

  const updateExtra = (key: string, patch: Partial<ExtraCap>) => {
    setExtra((rows) =>
      rows.map((row) => {
        if (`${row.method} ${row.path}` !== key) return row
        const next = { ...row, ...patch }
        // Auto-issue is only legal for a public read. Changing the class or
        // method away from that must not leave a stale true behind.
        if (next.kind !== 'read' || next.dataClass !== 'public') next.autoIssue = false
        return next
      }),
    )
  }

  const totalHidden = Object.values(hidden).reduce((n, f) => n + f.length, 0)

  return (
    <div className="space-y-4">
      <div className="panel flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="label">Draft</p>
          <p className="mt-1 text-[13px] text-bone-dim">
            {!loaded
              ? 'Reading your saved draft…'
              : savedAt
                ? 'Draft saved. Nothing changed for your visitors yet.'
                : totalHidden === 0
                  ? 'Agents currently see every field.'
                  : `${totalHidden} field${totalHidden === 1 ? '' : 's'} hidden from agents.`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone="idle">not published yet</Badge>
          <button type="button" className="btn btn-primary" disabled={saving || !loaded || loadError} onClick={save}>
            {saving ? 'Saving…' : !loaded ? 'Reading draft…' : savedAt ? 'Saved as draft' : 'Save as draft'}
          </button>
        </div>
      </div>
      {saveError ? (
        <p className="text-[13px] text-rust" role="alert">{saveError}</p>
      ) : null}
      {loadError ? (
        <p className="text-[12px] text-rust" role="alert">
          Could not load your saved draft. Reload before saving — saving now could overwrite mapped routes.
        </p>
      ) : null}

      <div className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="label">Mapped routes — current draft</p>
            <p className="mt-1 text-[13px] text-bone-dim">
              Routes you saved from Map routes. These are the only capabilities with an
              execution path; a catalogue entry alone is a description. Still draft until published.
            </p>
          </div>
          <Link href="/map" className="btn">
            Map routes
          </Link>
        </div>
        {extra.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-ink-line bg-ink/30 p-4 text-[13px] text-bone-dim">
            No routes in the current draft. <Link href="/map" className="text-bone underline">Map an endpoint</Link>{' '}
            to make it executable.
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-ink-line/60">
            {extra.map((e) => {
              const key = `${e.method} ${e.path}`
              const canAutoIssue = e.kind === 'read' && e.dataClass === 'public'
              return (
                <li key={key} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-[12px] text-bone">{e.name}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-bone-faint">
                        {e.method} {e.path}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={e.kind === 'write' ? 'held' : 'allow'}>{e.kind}</Badge>
                      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-bone-faint">
                        {e.kind === 'read' || e.allowUnattended ? 'unattended' : 'held'}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-end gap-4">
                    <label className="flex flex-col gap-1 text-[11px] text-bone-faint">
                      <span className="label">Data class</span>
                      <select
                        className="input min-w-36 text-[12px]"
                        value={e.dataClass}
                        onChange={(event) =>
                          updateExtra(key, { dataClass: event.target.value as DataClass })
                        }
                        aria-label={`Data class for ${e.name}`}
                      >
                        {DATA_CLASSES.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                      <span className="max-w-72 text-[11px] leading-snug text-bone-faint">
                        {DATA_CLASS_HELP[e.dataClass]}
                      </span>
                    </label>
                    <label className="flex max-w-72 items-start gap-2 text-[12px] text-bone-dim">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={e.autoIssue}
                        disabled={!canAutoIssue}
                        onChange={(event) => updateExtra(key, { autoIssue: event.target.checked })}
                        aria-label={`Auto-issue ${e.name}`}
                      />
                      <span>
                        Auto-issue this read
                        <span className="block text-[11px] text-bone-faint">
                          Only public reads can be auto-issued. Writes and private reads require a
                          human grant.
                        </span>
                      </span>
                    </label>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {inventory.length > 0 ? (
        <div className="panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="label">Approved inventory</p>
              <p className="mt-1 text-[13px] text-bone-dim">
                Routes with an execution blueprint in this workspace, written when a config was
                applied. Approved is not the same as live — the applied config still has to be
                active before the governor serves them.
              </p>
            </div>
            <Badge tone="allow">approved</Badge>
          </div>
          <ul className="mt-4 divide-y divide-ink-line/60">
            {inventory.map((e) => (
              <li key={`${e.method} ${e.path}`} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-mono text-[12px] text-bone">{e.name}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-bone-faint">
                    {e.method} {e.path}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={e.kind === 'write' ? 'held' : 'allow'}>{e.kind}</Badge>
                  <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-bone-faint">
                    {e.origin}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="panel p-5">
        <p className="label">Discovery catalogue — field names only</p>
        <p className="mt-1 text-[13px] leading-relaxed text-bone-dim">
          These are the standard capability names an agent may be told about. They are
          <span className="text-bone"> descriptions, not execution paths</span> — only the
          mapped routes and approved inventory above can run.
        </p>
      </div>

      {CAPS.map((c) => (
        <div key={c.name} className="panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[13px] text-bone">{c.name}</span>
                <Badge tone={c.kind === 'write' ? 'held' : 'allow'}>{c.kind}</Badge>
              </div>
              <p className="mt-2 text-[13px] text-bone-dim">{c.description}</p>
            </div>
          </div>

          <div className="mt-4 border-t border-ink-line/60 pt-4">
            <p className="label">Fields</p>
            <ul className="mt-2 space-y-1.5">
              {c.fields.map((f) => {
                const isHidden = hidden[c.name]!.includes(f)
                return (
                  <li key={f}>
                    <label className="flex cursor-pointer items-center gap-3 text-[13px]">
                      <input
                        type="checkbox"
                        checked={!isHidden}
                        onChange={() => toggle(c.name, f)}
                      />
                      <span className={isHidden ? 'text-bone-faint line-through' : 'text-bone'}>
                        <span className="font-mono">{f}</span>
                      </span>
                      <span className="text-[12px] text-bone-faint">
                        {isHidden ? 'hidden from agents' : 'visible to agents'}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      ))}

      {/*
        The distinction that keeps this screen honest. Hiding a field changes
        what an agent is told exists. It does not stop the field arriving, does
        not change the record, and does not change a single decision. Anyone
        who believes hiding a field makes it safe has been told something
        false by the absence of a warning here.
      */}
      <div className="panel border-amber/30 p-5">
        <p className="font-mono text-[11px] uppercase tracking-widest text-amber">What hiding does not do</p>
        <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-bone-dim">
          <li>
            Hiding a field changes what an agent is told about. It does not stop
            the field being sent, and it is not a security measure.
          </li>
          <li>
            The record still keeps the full request. What an agent was allowed
            to see and what it sent are different questions — the record
            answers the second.
          </li>
          <li>
            Nothing here is live until you publish it. A saved draft on this
            screen is <span className="text-bone">not published yet</span>.
          </li>
        </ul>
      </div>
    </div>
  )
}
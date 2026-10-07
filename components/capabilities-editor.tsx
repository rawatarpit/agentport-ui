'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/stat'

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

export function CapabilitiesEditor() {
  const [hidden, setHidden] = useState<Record<string, string[]>>(
    Object.fromEntries(CAPS.map((c) => [c.name, c.hidden])),
  )
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState(false)

  // The form edits a copy; the API holds truth. Unknown capabilities in a
  // saved draft are ignored rather than rendered — the known list is the UI.
  useEffect(() => {
    let live = true
    fetch('/api/drafts/capabilities')
      .then((r) => r.json())
      .then((body: { draft?: { hidden?: Record<string, string[]> } | null }) => {
        if (!live || !body.draft?.hidden) return
        setHidden((h) => {
          const next = { ...h }
          for (const [cap, fields] of Object.entries(body.draft!.hidden!)) {
            if (next[cap] && Array.isArray(fields)) next[cap] = fields.filter((f) => typeof f === 'string')
          }
          return next
        })
        setSavedAt('loaded')
      })
      .catch(() => {
        if (live) setLoadError(true)
      })
    return () => {
      live = false
    }
  }, [])

  const save = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch('/api/drafts/capabilities', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ payload: { hidden } }),
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

  const totalHidden = Object.values(hidden).reduce((n, f) => n + f.length, 0)

  return (
    <div className="space-y-4">
      <div className="panel flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="label">Draft</p>
          <p className="mt-1 text-[13px] text-bone-dim">
            {savedAt
              ? 'Draft saved. Nothing changed for your visitors yet.'
              : totalHidden === 0
                ? 'Agents currently see every field.'
                : `${totalHidden} field${totalHidden === 1 ? '' : 's'} hidden from agents.`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone="idle">not published yet</Badge>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : savedAt ? 'Saved as draft' : 'Save as draft'}
          </button>
        </div>
      </div>
      {saveError ? (
        <p className="text-[13px] text-rust" role="alert">{saveError}</p>
      ) : null}
      {loadError ? (
        <p className="text-[12px] text-rust" role="alert">Could not load your saved draft — showing defaults. Saving still works.</p>
      ) : null}

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
                        aria-label={`Expose ${f}`}
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
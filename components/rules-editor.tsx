'use client'

import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/stat'

/**
 * 6.3 /rules — refused, held, capped. 6.4 merchant's language. 6.5 validate
 * at save time.
 *
 * A rule saves as a **draft** and its generated code is reviewable. Nothing
 * here is live: the badge reads `not published yet` in idle grey, never green,
 * until the generated file is merged and the runtime reports its digest.
 * A technical term in the only label on a field is a support ticket, so every
 * label is a sentence a non-technical operator would say.
 */

type Draft = {
  askAbove: string
  neverAbove: string
  bulkUnits: string
  alwaysAskOrders: boolean
  forbidRefunds: boolean
}

const DEFAULTS: Draft = { askAbove: '250', neverAbove: '1000', bulkUnits: '20', alwaysAskOrders: true, forbidRefunds: true }

function toMinor(v: string): number | null {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null
}

export function RulesEditor() {
  const [d, setD] = useState<Draft>(DEFAULTS)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState(false)

  // The API stores minor units; the form speaks rupees. Convert at the edge.
  useEffect(() => {
    let live = true
    fetch('/api/drafts/rules')
      .then((r) => r.json())
      .then(
        (body: {
          draft?: {
            askAboveMinor?: number
            neverAboveMinor?: number
            bulkUnits?: number
            alwaysAskOrders?: boolean
            forbidRefunds?: boolean
          } | null
        }) => {
          if (!live || !body.draft) return
          const v = body.draft
          setD({
            askAbove: typeof v.askAboveMinor === 'number' ? String(v.askAboveMinor / 100) : DEFAULTS.askAbove,
            neverAbove: typeof v.neverAboveMinor === 'number' ? String(v.neverAboveMinor / 100) : DEFAULTS.neverAbove,
            bulkUnits: typeof v.bulkUnits === 'number' ? String(v.bulkUnits) : DEFAULTS.bulkUnits,
            alwaysAskOrders: typeof v.alwaysAskOrders === 'boolean' ? v.alwaysAskOrders : DEFAULTS.alwaysAskOrders,
            forbidRefunds: typeof v.forbidRefunds === 'boolean' ? v.forbidRefunds : DEFAULTS.forbidRefunds,
          })
          setSavedAt('saved draft loaded')
        },
      )
      .catch(() => {
        if (live) setLoadError(true)
      })
    return () => {
      live = false
    }
  }, [])

  const ask = toMinor(d.askAbove)
  const never = toMinor(d.neverAbove)
  const bulk = Number(d.bulkUnits)

  const errors = useMemo(() => {
    const list: string[] = []
    if (ask === null) list.push('Tell us the ask-first amount in rupees — a number, zero or more.')
    if (never === null) list.push('Tell us the never-cross line in rupees — a number, zero or more.')
    if (!Number.isInteger(bulk) || bulk <= 0) list.push('Bulk means a whole number of items greater than zero.')
    if (ask !== null && never !== null && never <= ask)
      list.push('The never-cross line sits at or below the ask-first line, so you would never be asked — refused first. Raise the never line or lower the ask line.')
    return list
  }, [ask, never, bulk])

  const save = async () => {
    if (!ready || ask === null || never === null || !Number.isInteger(bulk)) return
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch('/api/drafts/rules', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          payload: { askAboveMinor: ask, neverAboveMinor: never, bulkUnits: bulk, alwaysAskOrders: d.alwaysAskOrders, forbidRefunds: d.forbidRefunds },
        }),
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

  const ready = errors.length === 0

  const generated = useMemo(() => {
    if (!ready) return null
    const lines = [
      `// Draft — reviewable, not live. Publish to turn it on.`,
      `maxOrderValue: { minor: ${ask}, currency: 'INR' },          // ask you first`,
      `absoluteMaxOrderValue: { minor: ${never}, currency: 'INR' }, // always say no`,
      `bulkOrderThreshold: { units: ${bulk} },                     // big baskets wait too`,
    ]
    if (d.alwaysAskOrders) lines.push(`alwaysRequireApproval: ['createOrder'],            // even a small order waits`)
    if (d.forbidRefunds) lines.push(`forbiddenCapabilities: ['requestRefund'],          // refunds never via agent`)
    return lines.join('\n')
  }, [ready, ask, never, bulk, d.alwaysAskOrders, d.forbidRefunds])

  return (
    <div className="space-y-4">
      <div className="panel flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="label">Draft</p>
          <p className="mt-1 text-[13px] text-bone-dim">
            {savedAt
              ? 'Draft saved. Nothing changed for your visitors yet.'
              : 'Unsaved draft. Nothing here affects your visitors.'}
          </p>
          <p className="mt-1 font-mono text-[11px] text-bone-faint">
            same policy as the setup answers — saving here replaces those
          </p>
          {loadError ? (
            <p className="mt-1 text-[12px] text-rust" role="alert">
              Could not load your saved draft — editing from defaults. Saving still works.
            </p>
          ) : null}
        </div>
        <Badge tone="idle">not published yet</Badge>
      </div>

      <div className="panel space-y-5 p-6">
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" className="mt-1" checked={d.alwaysAskOrders} onChange={(e) => { setD({ ...d, alwaysAskOrders: e.target.checked }); setSavedAt(null) }} />
          <span>
            <span className="text-[14px] text-bone">Ask me before any order goes through</span>
            <span className="mt-1 block text-[12px] text-bone-faint">Held for you first — even a small one. Nothing runs unseen.</span>
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" className="mt-1" checked={d.forbidRefunds} onChange={(e) => { setD({ ...d, forbidRefunds: e.target.checked }); setSavedAt(null) }} />
          <span>
            <span className="text-[14px] text-bone">Never let an agent issue a refund</span>
            <span className="mt-1 block text-[12px] text-bone-faint">Refused outright, with a reason the agent can read.</span>
          </span>
        </label>

        <details>
          <summary className="cursor-pointer text-[13px] text-bone-dim">
            Amount limits <span className="font-mono text-[11px] text-bone-faint">— only if you want them; the two switches above already cover most businesses</span>
          </summary>
          <div className="mt-4 space-y-5">
            <div>
              <label className="block text-[14px] text-bone" htmlFor="rules-ask">
                Above what order value should we ask you first?
              </label>
              <p className="mt-1 text-[12px] text-bone-faint">Anything below this runs on its own. Above it, nothing happens until you approve it.</p>
              <div className="mt-2 flex items-center gap-2">
                <span aria-hidden="true" className="font-display text-xl text-bone-faint">₹</span>
                <input id="rules-ask" className="w-36 border border-ink-line bg-transparent px-3 py-2 font-display text-xl text-bone outline-none focus:border-verdant focus-visible:ring-2 focus-visible:ring-verdant/60" value={d.askAbove} inputMode="decimal" onChange={(e) => { setD({ ...d, askAbove: e.target.value }); setSavedAt(null) }} />
              </div>
            </div>

            <div>
              <label className="block text-[14px] text-bone" htmlFor="rules-never">
                Above what value should we always say no?
              </label>
              <p className="mt-1 text-[12px] text-bone-faint">Never held, never queued — simply refused with the reason the agent can read.</p>
              <div className="mt-2 flex items-center gap-2">
                <span aria-hidden="true" className="font-display text-xl text-bone-faint">₹</span>
                <input id="rules-never" className="w-36 border border-ink-line bg-transparent px-3 py-2 font-display text-xl text-bone outline-none focus:border-verdant focus-visible:ring-2 focus-visible:ring-verdant/60" value={d.neverAbove} inputMode="decimal" onChange={(e) => { setD({ ...d, neverAbove: e.target.value }); setSavedAt(null) }} />
              </div>
            </div>

            <div>
              <label className="block text-[14px] text-bone" htmlFor="rules-bulk">
                How many items in one basket should always wait for you?
              </label>
              <p className="mt-1 text-[12px] text-bone-faint">Volume control, independent of value — a cheap basket of many units still gets looked at.</p>
              <input id="rules-bulk" className="mt-2 w-36 border border-ink-line bg-transparent px-3 py-2 font-display text-xl text-bone outline-none focus:border-verdant focus-visible:ring-2 focus-visible:ring-verdant/60" value={d.bulkUnits} inputMode="numeric" onChange={(e) => { setD({ ...d, bulkUnits: e.target.value }); setSavedAt(null) }} />
            </div>
          </div>
        </details>
      </div>

      {errors.length > 0 && (
        <div className="panel border-rust/40 p-5" role="alert">
          <p className="font-mono text-[11px] uppercase tracking-widest text-rust">Cannot save yet</p>
          <ul className="mt-2 space-y-1 text-[13px] leading-relaxed text-bone-dim">
            {errors.map((e) => <li key={e}>· {e}</li>)}
          </ul>
        </div>
      )}

      <div className="panel p-6">
        <p className="label">Generated code — reviewable</p>
        <pre tabIndex={0} aria-label="Generated configuration preview" className="mt-3 overflow-x-auto border border-ink-line bg-ink/40 p-4 font-mono text-[12px] leading-relaxed text-bone-dim">
          {generated ?? 'Fix the problems above to see the output.'}
        </pre>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-primary" disabled={!ready || saving} onClick={save}>
            {saving ? 'Saving…' : savedAt && savedAt !== 'saved draft loaded' ? 'Saved as draft' : 'Save as draft'}
          </button>
          <span className="font-mono text-[11px] text-bone-faint">saving never turns anything on — publishing does</span>
          {saveError ? (
            <span className="text-[13px] text-rust" role="alert">{saveError}</span>
          ) : null}
        </div>
      </div>
    </div>
  )
}

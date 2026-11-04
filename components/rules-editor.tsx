'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/stat'
import { EmptyState } from '@/components/ui/empty-state'

/**
 * Rules editor — rebuilt to be capability-aware.
 *
 * Reads your mapped capabilities from the capabilities draft (what you saved
 * from Map routes) and lets you set a rule for each one individually:
 *   • Allow freely — runs unattended
 *   • Ask first — held for your approval before it runs
 *   • Always refuse — blocked, never executes
 *
 * Amount limits are optional and apply to all write capabilities equally.
 * Nothing here is live: the badge reads `not published yet` until you publish
 * from Go-live.
 */

type CapabilityDraft = {
  name: string
  method: string
  path: string
  kind: 'read' | 'write'
  allowUnattended?: boolean
}

type Rule = 'allow' | 'hold' | 'refuse'

type DraftRule = {
  capability: string
  rule: Rule
}

type AmountDraft = {
  askAbove: string
  neverAbove: string
  bulkUnits: string
}

const DEFAULTS: AmountDraft = { askAbove: '', neverAbove: '', bulkUnits: '' }

function toMinor(v: string): number | null {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null
}

export function RulesEditor() {
  const router = useRouter()
  const [drafts, setDrafts] = useState<{ capabilities: CapabilityDraft[]; rules: DraftRule[]; amount: AmountDraft }>({
    capabilities: [],
    rules: [],
    amount: { ...DEFAULTS },
  })
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState(false)

  // Load the saved capabilities draft and rules draft.
  useEffect(() => {
    let live = true
    Promise.all([
      fetch('/api/drafts/capabilities', { cache: 'no-store' }),
      fetch('/api/drafts/rules', { cache: 'no-store' }),
    ])
      .then(([capsRes, rulesRes]) =>
        Promise.all([capsRes.json(), rulesRes.json()])
      )
      .then(([capsBody, rulesBody]) => {
        if (!live) return
        const caps: CapabilityDraft[] =
          capsBody.draft?.extra?.filter((c: any) => c && typeof c.name === 'string') ?? []
        const rulesBodyParsed = rulesBody.draft as {
          askAboveMinor?: number
          neverAboveMinor?: number
          bulkUnits?: number
          alwaysRequireApproval?: string[]
          forbiddenCapabilities?: string[]
        } | null

        // Build per-capability rules from the saved draft.
        const alwaysRequire = new Set(rulesBodyParsed?.alwaysRequireApproval ?? [])
        const forbidden = new Set(rulesBodyParsed?.forbiddenCapabilities ?? [])

        const capabilityRules: DraftRule[] = caps.map((c) => ({
          capability: c.name,
          rule: (forbidden.has(c.name) ? 'refuse' : alwaysRequire.has(c.name) ? 'hold' : 'allow') as Rule,
        }))

        setDrafts({
          capabilities: caps,
          rules: capabilityRules,
          amount: {
            askAbove: typeof rulesBodyParsed?.askAboveMinor === 'number' ? String(rulesBodyParsed.askAboveMinor / 100) : '',
            neverAbove: typeof rulesBodyParsed?.neverAboveMinor === 'number' ? String(rulesBodyParsed.neverAboveMinor / 100) : '',
            bulkUnits: typeof rulesBodyParsed?.bulkUnits === 'number' ? String(rulesBodyParsed.bulkUnits) : '',
          },
        })
        setSavedAt('saved draft loaded')
      })
      .catch(() => {
        if (live) setLoadError(true)
      })
    return () => {
      live = false
    }
  }, [])

  const ask = toMinor(drafts.amount.askAbove)
  const never = toMinor(drafts.amount.neverAbove)
  const bulk = Number(drafts.amount.bulkUnits)

  const errors = useMemo(() => {
    const list: string[] = []
    if (drafts.amount.askAbove !== '' && ask === null) list.push('Ask-first amount must be a valid number.')
    if (drafts.amount.neverAbove !== '' && never === null) list.push('Never-cross amount must be a valid number.')
    if (drafts.amount.bulkUnits !== '' && (!Number.isInteger(bulk) || bulk <= 0)) list.push('Bulk units must be a whole number greater than zero.')
    if (ask !== null && never !== null && never <= ask) list.push('Never-cross line is at or below the ask-first line — you would never be asked, only refused.')
    return list
  }, [ask, never, bulk, drafts.amount.askAbove, drafts.amount.neverAbove, drafts.amount.bulkUnits])

  const setRule = (capability: string, rule: Rule) => {
    setDrafts((d) => ({
      ...d,
      rules: d.rules.map((r) => (r.capability === capability ? { capability, rule } : r)),
    }))
    setSavedAt(null)
  }

  const setAmount = (field: keyof AmountDraft, value: string) => {
    setDrafts((d) => ({ ...d, amount: { ...d.amount, [field]: value } }))
    setSavedAt(null)
  }

  const save = async () => {
    if (errors.length > 0) return
    setSaving(true)
    setSaveError(null)
    try {
      const alwaysRequireApproval = drafts.rules.filter((r) => r.rule === 'hold').map((r) => r.capability)
      const forbiddenCapabilities = drafts.rules.filter((r) => r.rule === 'refuse').map((r) => r.capability)

      // Save capabilities draft (mapped routes) — unchanged.
      const capsRes = await fetch('/api/drafts/capabilities', { cache: 'no-store' })
      if (!capsRes.ok) {
        setSaveError('Could not read current capabilities draft — refusing to overwrite.')
        return
      }
      const capsBody = await capsRes.json()
      const currentExtra = capsBody.draft?.extra ?? []

      // Save rules draft.
      const rulesRes = await fetch('/api/drafts/rules', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          payload: {
            askAboveMinor: ask,
            neverAboveMinor: never,
            bulkUnits: bulk,
            alwaysRequireApproval,
            forbiddenCapabilities,
          },
        }),
      })
      const rulesBody = await rulesRes.json()
      if (rulesBody.status !== 'ok') throw new Error(rulesBody.errors?.[0] ?? rulesBody.reason ?? 'Save refused.')
      setSavedAt(rulesBody.updatedAt ?? 'saved')
      router.refresh()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save refused.')
    } finally {
      setSaving(false)
    }
  }

  const ready = errors.length === 0

  // Generated configuration — reviewable, not live.
  const alwaysRequireList = drafts.rules.filter((r) => r.rule === 'hold').map((r) => r.capability)
  const forbiddenList = drafts.rules.filter((r) => r.rule === 'refuse').map((r) => r.capability)

  const generated = useMemo(() => {
    if (!ready) return null
    const lines: string[] = []
    lines.push(`// Draft — reviewable, not live. Publish to turn it on.`)

    if (ask !== null) lines.push(`maxOrderValue: { minor: ${ask}, currency: 'INR' },          // ask you first above ₹${drafts.amount.askAbove}`)
    if (never !== null) lines.push(`absoluteMaxOrderValue: { minor: ${never}, currency: 'INR' }, // always say no above ₹${drafts.amount.neverAbove}`)
    if (Number.isInteger(bulk) && bulk > 0) lines.push(`bulkOrderThreshold: { units: ${bulk} },                     // big baskets wait too`)

    if (alwaysRequireList.length > 0) lines.push(`alwaysRequireApproval: [${alwaysRequireList.map((c) => `'${c}'`).join(', ')}],            // held for your approval`)
    if (forbiddenList.length > 0) lines.push(`forbiddenCapabilities: [${forbiddenList.map((c) => `'${c}'`).join(', ')}],          // refused outright`)

    if (lines.length === 1) lines.push(`// No rules set — all capabilities run unattended.`)

    return lines.join('\n')
  }, [ready, ask, never, bulk, drafts.amount.askAbove, drafts.amount.neverAbove, alwaysRequireList, forbiddenList])

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
            {drafts.capabilities.length} mapped capability{drafts.capabilities.length === 1 ? '' : 's'} loaded from Map routes.
          </p>
          {loadError ? (
            <p className="mt-1 text-[12px] text-rust" role="alert">
              Could not load your saved draft — editing from defaults. Saving still works.
            </p>
          ) : null}
        </div>
        <Badge tone="idle">not published yet</Badge>
      </div>

      {/* Mapped capabilities with per-capability rules */}
      <div className="panel space-y-3 p-6">
        <p className="label">Rules per mapped capability</p>
        <p className="mt-1 text-[12px] text-bone-faint">
          Set a rule for each capability you mapped. Read capabilities run unattended by default; writes are held by default.
        </p>
        {drafts.capabilities.length === 0 ? (
          <EmptyState
            title="No mapped capabilities yet"
            body="Go to Map routes and save some endpoints first. Then come back here to set limits."
            action={<Link href="/map" className="btn btn-primary">Map routes</Link>}
          />
        ) : (
          <div className="space-y-2">
            {drafts.capabilities.map((cap) => {
              const current = drafts.rules.find((r) => r.capability === cap.name)?.rule ?? 'allow'
              return (
                <div key={cap.name} className="flex items-center justify-between gap-3 p-3 rounded border border-ink-line/60 bg-ink/30">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[12px] text-bone">{cap.name}</span>
                    <span className="font-mono text-[11px] text-bone-faint">{cap.method} {cap.path}</span>
                    <Badge tone={cap.kind === 'write' ? 'held' : 'allow'}>{cap.kind}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="cursor-pointer flex items-center gap-2 px-3 py-1.5 rounded border transition-colors {current === 'allow' ? 'border-verdant/40 bg-verdant/5' : 'border-ink-line/40 hover:border-verdant/40'}">
                      <input
                        type="radio"
                        name={`rule-${cap.name}`}
                        value="allow"
                        checked={current === 'allow'}
                        onChange={() => setRule(cap.name, 'allow')}
                      />
                      Allow
                    </label>
                    <label className="cursor-pointer flex items-center gap-2 px-3 py-1.5 rounded border transition-colors {current === 'hold' ? 'border-amber/40 bg-amber/5' : 'border-ink-line/40 hover:border-amber/40'}">
                      <input
                        type="radio"
                        name={`rule-${cap.name}`}
                        value="hold"
                        checked={current === 'hold'}
                        onChange={() => setRule(cap.name, 'hold')}
                      />
                      Hold
                    </label>
                    <label className="cursor-pointer flex items-center gap-2 px-3 py-1.5 rounded border transition-colors {current === 'refuse' ? 'border-rust/40 bg-rust/5' : 'border-ink-line/40 hover:border-rust/40'}">
                      <input
                        type="radio"
                        name={`rule-${cap.name}`}
                        value="refuse"
                        checked={current === 'refuse'}
                        onChange={() => setRule(cap.name, 'refuse')}
                      />
                      Refuse
                    </label>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Amount limits (optional, apply to all write capabilities) */}
      <details className="panel p-6">
        <summary className="cursor-pointer text-[13px] text-bone-dim">
          Amount limits <span className="font-mono text-[11px] text-bone-faint">— optional; apply to all write capabilities</span>
        </summary>
        <div className="mt-4 space-y-5">
          <div>
            <label className="block text-[14px] text-bone" htmlFor="rules-ask">
              Ask me first above this order value
            </label>
            <p className="mt-1 text-[12px] text-bone-faint">Anything below this runs on its own. Above it, nothing happens until you approve it.</p>
            <div className="mt-2 flex items-center gap-2">
              <span aria-hidden="true" className="font-display text-xl text-bone-faint">₹</span>
              <input
                id="rules-ask"
                className="w-36 border border-ink-line bg-transparent px-3 py-2 font-display text-xl text-bone outline-none focus:border-verdant focus-visible:ring-2 focus-visible:ring-verdant/60"
                value={drafts.amount.askAbove}
                inputMode="decimal"
                onChange={(e) => setAmount('askAbove', e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="block text-[14px] text-bone" htmlFor="rules-never">
              Always refuse above this order value
            </label>
            <p className="mt-1 text-[12px] text-bone-faint">Never held, never queued — simply refused with the reason the agent can read.</p>
            <div className="mt-2 flex items-center gap-2">
              <span aria-hidden="true" className="font-display text-xl text-bone-faint">₹</span>
              <input
                id="rules-never"
                className="w-36 border border-ink-line bg-transparent px-3 py-2 font-display text-xl text-bone outline-none focus:border-verdant focus-visible:ring-2 focus-visible:ring-verdant/60"
                value={drafts.amount.neverAbove}
                inputMode="decimal"
                onChange={(e) => setAmount('neverAbove', e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="block text-[14px] text-bone" htmlFor="rules-bulk">
              Hold orders with more than this many items
            </label>
            <p className="mt-1 text-[12px] text-bone-faint">Volume control, independent of value — a cheap basket of many units still gets looked at.</p>
            <div className="mt-2 flex items-center gap-2">
              <input
                id="rules-bulk"
                className="w-36 border border-ink-line bg-transparent px-3 py-2 font-display text-xl text-bone outline-none focus:border-verdant focus-visible:ring-2 focus-visible:ring-verdant/60"
                value={drafts.amount.bulkUnits}
                inputMode="numeric"
                onChange={(e) => setAmount('bulkUnits', e.target.value)}
              />
            </div>
          </div>
        </div>
      </details>

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

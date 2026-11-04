'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/stat'
import { EmptyState } from '@/components/ui/empty-state'
import Link from 'next/link'

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
  const [editingCell, setEditingCell] = useState<{ capability: string; field: string } | null>(null)

  useEffect(() => {
    let live = true
    Promise.all([
      fetch('/api/drafts/capabilities', { cache: 'no-store' }),
      fetch('/api/drafts/rules', { cache: 'no-store' }),
    ])
      .then(([capsRes, rulesRes]) => Promise.all([capsRes.json(), rulesRes.json()]))
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

        const alwaysRequire = new Set(rulesBodyParsed?.alwaysRequireApproval ?? [])
        const forbidden = new Set(rulesBodyParsed?.forbiddenCapabilities ?? [])

        const capabilityRules = caps.map((c) => ({
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

      const capsRes = await fetch('/api/drafts/capabilities', { cache: 'no-store' })
      if (!capsRes.ok) {
        setSaveError('Could not read current capabilities draft — refusing to overwrite.')
        return
      }
      const capsBody = await capsRes.json()
      const currentExtra = capsBody.draft?.extra ?? []

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

  const ruleOptions: { value: Rule; label: string }[] = [
    { value: 'allow', label: 'Allow freely' },
    { value: 'hold', label: 'Hold for approval' },
    { value: 'refuse', label: 'Refuse outright' },
  ]

  return (
    <div className="space-y-4">
      <div className="panel flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="label">Rules per mapped capability</p>
          <p className="mt-1 text-[13px] text-bone-dim">
            Click any rule cell to edit. Nothing is live until you publish from Go-live.
          </p>
          {drafts.capabilities.length === 0 ? (
            <p className="mt-1 text-[12px] text-bone-faint">
              No mapped capabilities yet. Go to{' '}
              <Link href="/map" className="text-bone underline underline-offset-2 hover:underline-offset-4">
                Map routes
              </Link>
              , then come back here.
            </p>
          ) : null}
        </div>
        <Badge tone="idle">not published yet</Badge>
      </div>

      <div className="panel overflow-hidden">
        {drafts.capabilities.length === 0 ? (
          <EmptyState
            title="No mapped capabilities yet"
            body="Go to Map routes and save some endpoints first. Then come back here to set limits for each one."
            action={<Link href="/map" className="btn btn-primary">Map routes</Link>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-ink-line bg-ink/20">
                  <th key="cap" className="label px-4 py-3 font-normal">
                    Capability
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
                  <th key="rule" className="label px-4 py-3 font-normal">
                    Rule
                  </th>
                </tr>
              </thead>
              <tbody>
                {drafts.capabilities.map((cap) => {
                  const current = drafts.rules.find((r) => r.capability === cap.name)?.rule ?? 'allow'
                  const isEditing = editingCell?.capability === cap.name && editingCell.field === 'rule'
                  return (
                    <tr key={cap.name} className="border-b border-ink-line/60 hover:bg-ink/5 last:border-0">
                      <td className="px-4 py-3 font-mono text-[12px] text-bone">
                        {cap.name}
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-bone-dim">
                        {cap.method}
                      </td>
                      <td className="px-4 py-3 font-mono text-[12px] text-bone-dim truncate max-w-[200px]">
                        {cap.path}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={cap.kind === 'write' ? 'held' : 'allow'}>
                          {cap.kind}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <select
                            value={current}
                            onChange={(e) => setRule(cap.name, (e.target.value as Rule))}
                            onBlur={() => setEditingCell(null)}
                            className="w-full border border-ink-line px-3 py-2 text-[12px] font-mono text-bone outline-none focus:border-verdant focus-visible:ring-1 focus-visible:ring-verdant/50"
                          >
                            {ruleOptions.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setEditingCell({ capability: cap.name, field: 'rule' })}
                            className="flex items-center justify-between w-full px-3 py-2 rounded border border-ink-line bg-transparent text-[12px] text-bone hover:bg-ink/30 transition-colors"
                          >
                            <span>{current === 'allow' ? 'Allow freely' : current === 'hold' ? 'Hold for approval' : 'Refuse outright'}</span>
                            <span className="text-bone-faint">↓</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="label">Amount limits (optional)</p>
            <p className="mt-1 text-[13px] text-bone-faint">
              Apply to all write capabilities. Leave blank to skip.
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-[14px] text-bone" htmlFor="rules-ask">
              Ask me first above (₹)
            </label>
            <div className="mt-2 flex items-center gap-2">
              <span className="font-mono text-[12px] text-bone-dim">₹</span>
              <input
                id="rules-ask"
                className="w-36 border border-ink-line bg-transparent px-3 py-2 font-mono text-[14px] text-bone outline-none focus:border-verdant focus-visible:ring-2 focus-visible:ring-verdant/50"
                value={drafts.amount.askAbove}
                inputMode="decimal"
                onChange={(e) => setAmount('askAbove', e.target.value)}
              />
            </div>
            {drafts.amount.askAbove !== '' && ask === null && (
              <p className="mt-1 text-[11px] text-rust">Enter a valid number.</p>
            )}
          </div>
          <div>
            <label className="block text-[14px] text-bone" htmlFor="rules-never">
              Always refuse above (₹)
            </label>
            <div className="mt-2 flex items-center gap-2">
              <span className="font-mono text-[12px] text-bone-dim">₹</span>
              <input
                id="rules-never"
                className="w-36 border border-ink-line bg-transparent px-3 py-2 font-mono text-[14px] text-bone outline-none focus:border-verdant focus-visible:ring-2 focus-visible:ring-verdant/50"
                value={drafts.amount.neverAbove}
                inputMode="decimal"
                onChange={(e) => setAmount('neverAbove', e.target.value)}
              />
            </div>
            {drafts.amount.neverAbove !== '' && never === null && (
              <p className="mt-1 text-[11px] text-rust">Enter a valid number.</p>
            )}
          </div>
          <div>
            <label className="block text-[14px] text-bone" htmlFor="rules-bulk">
              Hold orders with more than this many items
            </label>
            <div className="mt-2 flex items-center gap-2">
              <input
                id="rules-bulk"
                className="w-36 border border-ink-line bg-transparent px-3 py-2 font-mono text-[14px] text-bone outline-none focus:border-verdant focus-visible:ring-2 focus-visible:ring-verdant/50"
                value={drafts.amount.bulkUnits}
                inputMode="numeric"
                onChange={(e) => setAmount('bulkUnits', e.target.value)}
              />
            </div>
            {drafts.amount.bulkUnits !== '' && (!Number.isInteger(bulk) || bulk <= 0) && (
              <p className="mt-1 text-[11px] text-rust">Enter a whole number greater than zero.</p>
            )}
          </div>
        </div>
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
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="label">Generated code — reviewable</p>
            <p className="mt-1 text-[12px] text-bone-faint">
              This is what gets published. Review it before you save.
            </p>
          </div>
        </div>
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

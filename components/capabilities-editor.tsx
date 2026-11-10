'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
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
  dataClass: DataClass
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

export function CapabilitiesEditor({
  inventory = [],
  activeNames = null,
}: {
  inventory?: InventoryCap[]
  /** Names the active config serves. Null/absent means unknown, not empty. */
  activeNames?: string[] | null
}) {
  const router = useRouter()
  const activeSet = activeNames === null ? null : new Set(activeNames)
  const activeInventory = activeSet === null ? inventory : inventory.filter((e) => activeSet.has(e.name))
  const retainedInventory =
    activeSet === null ? [] : inventory.filter((e) => !activeSet.has(e.name))
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
    setAppliedVersion(null)
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

  // Add and remove are the primary actions. Each one saves the draft and
  // applies it in one step, so the governor — not a build-time snapshot — is
  // what changes. The tier rule stays in lib/publish.ts: adding a write is a
  // widening change and keeps the typed-name ceremony; adding a read and
  // removing anything are light.
  const [addOpen, setAddOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newMethod, setNewMethod] = useState('GET')
  const [newPath, setNewPath] = useState('')
  const [newDataClass, setNewDataClass] = useState<DataClass>('internal')
  const [addError, setAddError] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  const [applyMsg, setApplyMsg] = useState<string | null>(null)
  const [applyError, setApplyError] = useState<string | null>(null)
  // A successful apply is live; a draft is not. The old screen only knew
  // `saved`, so it claimed "not published" after a real activation.
  const [appliedVersion, setAppliedVersion] = useState<number | null>(null)

  const applyConfig = async (payload: { confirm: boolean | string }): Promise<{
    status: string
    reason?: string
    tier?: string
    version?: number
  }> => {
    const res = await fetch('/api/publish/apply', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return (await res.json()) as { status: string; reason?: string; tier?: string; version?: number }
  }

  const commit = async (nextExtra: ExtraCap[]) => {
    if (!loaded || loadError) {
      setApplyError('Reload the page before changing capabilities — the current draft could not be read.')
      return
    }
    setApplying(true)
    setApplyError(null)
    setApplyMsg(null)
    setAppliedVersion(null)
    try {
      const put = await fetch('/api/drafts/capabilities', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ payload: { hidden, extra: nextExtra } }),
      })
      const putBody = (await put.json()) as { status: string; reason?: string; errors?: string[] }
      if (putBody.status !== 'ok') {
        throw new Error(putBody.errors?.[0] ?? putBody.reason ?? 'Draft rejected.')
      }
      setExtra(nextExtra)
      setSavedAt('draft')
      let res = await applyConfig({ confirm: true })
      if (res.status !== 'ok' && res.tier === 'typed') {
        const typed = window.prompt(
          `This adds a write capability. Type your business name to activate version ${res.version ?? ''}:`,
        )
        if (typed === null) {
          setApplyMsg('Saved as draft. Not activated.')
          return
        }
        res = await applyConfig({ confirm: typed })
      }
      if (res.status !== 'ok') throw new Error(res.reason ?? 'Apply refused.')
      setAppliedVersion(typeof res.version === 'number' ? res.version : null)
      setApplyMsg(`Active in version ${res.version}. The hosted governor serves it on its next poll.`)
      setSavedAt('applied')
      router.refresh()
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : 'Could not apply the change.')
    } finally {
      setApplying(false)
    }
  }

  const addCapability = async () => {
    setAddError(null)
    const name = newName.trim()
    const path = newPath.trim()
    if (!/^[A-Za-z][A-Za-z0-9_]{2,63}$/.test(name)) {
      setAddError('Name must start with a letter and be 3–64 characters (letters, digits, underscore).')
      return
    }
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('://') || path.length > 512) {
      setAddError('Path must be a single leading slash relative path, at most 512 characters.')
      return
    }
    if (extra.some((e) => e.name === name)) {
      setAddError(`"${name}" already exists in this draft.`)
      return
    }
    if (extra.some((e) => e.method === newMethod && e.path === path)) {
      setAddError('That method and path is already mapped.')
      return
    }
    const kind: 'read' | 'write' = newMethod === 'GET' || newMethod === 'HEAD' ? 'read' : 'write'
    const next: ExtraCap[] = [
      ...extra,
      { name, method: newMethod, path, kind, dataClass: newDataClass, autoIssue: false },
    ]
    setNewName('')
    setNewPath('')
    setAddOpen(false)
    await commit(next)
  }

  const removeCapability = async (key: string) => {
    await commit(extra.filter((e) => `${e.method} ${e.path}` !== key))
  }

  return (
    <div className="space-y-4">
      <div className="panel flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="label">{appliedVersion !== null ? 'Active' : 'Draft'}</p>
          <p className="mt-1 text-[13px] text-bone-dim">
            {!loaded
              ? 'Reading your saved draft…'
              : appliedVersion !== null
                ? `Active in version ${appliedVersion}. The hosted governor serves it on its next poll.`
                : savedAt
                  ? 'Draft saved. Nothing changed for your visitors yet.'
                  : totalHidden === 0
                    ? 'Agents currently see every field.'
                    : `${totalHidden} field${totalHidden === 1 ? '' : 's'} hidden from agents.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {appliedVersion !== null ? (
            <Badge tone="allow">active v{appliedVersion}</Badge>
          ) : (
            <Badge tone="idle">not published yet</Badge>
          )}
          <button type="button" className="btn" disabled={saving || !loaded || loadError} onClick={save}>
            {saving ? 'Saving…' : !loaded ? 'Reading draft…' : 'Save as draft'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={applying || !loaded || loadError}
            onClick={() => void commit(extra)}
          >
            {applying ? 'Applying…' : 'Apply changes'}
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
      {applyMsg ? (
        <p className="text-[13px] text-verdant" role="status">{applyMsg}</p>
      ) : null}
      {applyError ? (
        <p className="text-[13px] text-rust" role="alert">{applyError}</p>
      ) : null}

      <div className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="label">Capabilities</p>
            <p className="mt-1 text-[13px] text-bone-dim">
              Add an API or remove one. Adding a read or removing anything activates in one step;
              adding a write asks you to type your business name first. The hosted governor is the
              only thing that changes — no rebuild and no pull request.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setAddOpen((v) => !v)
                setAddError(null)
              }}
            >
              {addOpen ? 'Close' : '+ Add API'}
            </button>
            <Link href="/map" className="btn">
              Scan site
            </Link>
          </div>
        </div>

        {addOpen ? (
          <div className="mt-4 rounded-lg border border-ink-line bg-ink/30 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-[11px] text-bone-faint">
                <span className="label">Capability name</span>
                <input
                  className="input font-mono text-[12px]"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="submitContactForm"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-bone-faint">
                <span className="label">Method</span>
                <select
                  className="input text-[12px]"
                  value={newMethod}
                  onChange={(e) => setNewMethod(e.target.value)}
                >
                  {['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-bone-faint sm:col-span-2">
                <span className="label">Path</span>
                <input
                  className="input font-mono text-[12px]"
                  value={newPath}
                  onChange={(e) => setNewPath(e.target.value)}
                  placeholder="/.netlify/functions/submit-contact"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-bone-faint sm:col-span-2">
                <span className="label">Data class</span>
                <select
                  className="input text-[12px]"
                  value={newDataClass}
                  onChange={(e) => setNewDataClass(e.target.value as DataClass)}
                >
                  {DATA_CLASSES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
                <span className="max-w-72 text-[11px] leading-snug text-bone-faint">
                  {DATA_CLASS_HELP[newDataClass]}
                </span>
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={applying}
                onClick={() => void addCapability()}
              >
                {applying ? 'Adding…' : 'Add & activate'}
              </button>
              <span className="text-[11px] text-bone-faint">
                {newMethod === 'GET' || newMethod === 'HEAD'
                  ? 'Read — activates immediately.'
                  : 'Write — type your business name to activate.'}
              </span>
            </div>
            {addError ? (
              <p className="mt-2 text-[12px] text-rust" role="alert">{addError}</p>
            ) : null}
          </div>
        ) : null}
        {extra.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-ink-line bg-ink/30 p-4 text-[13px] text-bone-dim">
            No capabilities yet. Use <span className="text-bone">+ Add API</span> above, or{' '}
            <Link href="/map" className="text-bone underline">scan your site</Link> to pick routes.
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
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={applying}
                        onClick={() => void removeCapability(key)}
                      >
                        Remove
                      </button>
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

      {activeInventory.length > 0 || retainedInventory.length > 0 ? (
        <div className="panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="label">Active inventory</p>
              <p className="mt-1 text-[13px] text-bone-dim">
                {activeSet === null
                  ? 'Routes with an execution blueprint in this workspace. The active config could not be read, so this is the full inventory — not a claim that every route is live.'
                  : 'Routes the active config serves. The governor executes these and denies everything else.'}
              </p>
            </div>
            <Badge tone={activeSet === null ? 'idle' : 'allow'}>
              {activeSet === null ? 'unknown' : 'active'}
            </Badge>
          </div>
          {activeInventory.length === 0 ? (
            <p className="mt-4 text-[13px] text-bone-faint">
              The active config serves no capabilities.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-ink-line/60">
              {activeInventory.map((e) => (
                <li key={e.name} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-mono text-[12px] text-bone">{e.name}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-bone-faint">
                      {e.method} {e.path}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={e.kind === 'write' ? 'held' : 'allow'}>{e.kind}</Badge>
                    <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-bone-faint">
                      {e.origin} · {e.dataClass}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {retainedInventory.length > 0 ? (
        <div className="panel p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="label">Retained blueprints</p>
              <p className="mt-1 text-[13px] text-bone-dim">
                Removed from the active config. The row is kept so re-adding the capability
                keeps its classification. The governor does not serve these.
              </p>
            </div>
            <Badge tone="idle">not active</Badge>
          </div>
          <ul className="mt-4 divide-y divide-ink-line/60">
            {retainedInventory.map((e) => (
              <li key={e.name} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-mono text-[12px] text-bone-faint">{e.name}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-bone-faint">
                    {e.method} {e.path}
                  </p>
                </div>
                <Badge tone="idle">{e.kind}</Badge>
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
          mapped routes and active inventory above can run.
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
            {appliedVersion !== null ? (
              <>Version {appliedVersion} is active. Further edits stay a draft until you apply again.</>
            ) : (
              <>A saved draft is not live. <span className="text-bone">Apply changes</span> updates the hosted governor.</>
            )}
          </li>
        </ul>
      </div>
    </div>
  )
}
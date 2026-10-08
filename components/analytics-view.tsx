import { createClient } from '@/lib/supabase/server'

type ActivityRow = {
  capability: string
  window_start: string
  asked: number | null
  denied: number | null
  held: number | null
  approved: number | null
  executed: number | null
}

type ConversionRow = {
  capability: string
  window_start: string
  succeeded: boolean
  failed: boolean
  succeeded_count: number | null
  failed_count: number | null
}

/**
 * FRONTEND.md §3 step 4 — analytics reads the views, not the ledger.
 *
 * `v_capability_activity` (asked/denied/held/approved/executed per
 * capability per ISO week) plus `v_conversion` (succeeded/failed booleans —
 * the one payment-adjacent fact we accept). No amounts anywhere: the views
 * cannot return one, so the screen cannot invent one.
 *
 * Empty is a first-class answer. A tenant with no pushes renders unknown —
 * not zeros dressed as health, and not fixtures dressed as history.
 */
export async function AnalyticsView() {
  const supabase = createClient()
  const [{ data: activity, error: aErr }, { data: conversion, error: cErr }] = await Promise.all([
    supabase.from('v_capability_activity').select('*').order('window_start', { ascending: false }).limit(200),
    supabase.from('v_conversion').select('*').order('window_start', { ascending: false }).limit(200),
  ])

  if (aErr || cErr || !activity || activity.length === 0) {
    return (
      <div className="panel space-y-2 p-6">
        <p className="label">By capability — counts, not money</p>
        <p className="text-[14px] leading-relaxed text-bone-dim">
          No pushes received yet. This screen shows <span className="text-bone">unknown</span>,
          not zero — zero would claim a healthy runtime that may not exist.
        </p>
        <p className="font-mono text-[11px] text-bone-faint">
          wire the webhook on the connect screen; counts land here per ISO week
        </p>
      </div>
    )
  }

  const rows = activity as ActivityRow[]
  const conv = (conversion ?? []) as ConversionRow[]
  const convByCap = new Map<string, ConversionRow>()
  for (const c of conv) {
    if (!convByCap.has(c.capability)) convByCap.set(c.capability, c)
  }

  const byCap = new Map<string, { asked: number; denied: number; held: number; approved: number; executed: number }>()
  for (const r of rows) {
    const cur = byCap.get(r.capability) ?? { asked: 0, denied: 0, held: 0, approved: 0, executed: 0 }
    cur.asked += r.asked ?? 0
    cur.denied += r.denied ?? 0
    cur.held += r.held ?? 0
    cur.approved += r.approved ?? 0
    cur.executed += r.executed ?? 0
    byCap.set(r.capability, cur)
  }

  // Direction, not just totals: latest week vs the one before, per
  // capability. One week of data has no direction — it renders flat, not
  // zero, because a single point is not a trend.
  const weeks = [...new Set(rows.map((r) => String(r.window_start)))].sort().reverse()
  const [latest, previous] = weeks
  const totalOf = (cap: string, week: string | undefined) =>
    week === undefined
      ? null
      : rows
          .filter((r) => r.capability === cap && String(r.window_start) === week)
          .reduce((n, r) => n + (r.asked ?? 0) + (r.denied ?? 0) + (r.held ?? 0) + (r.approved ?? 0) + (r.executed ?? 0), 0)
  const direction = (cap: string): { arrow: string; tone: string; label: string } => {
    const now = totalOf(cap, latest)
    const then = totalOf(cap, previous)
    if (now === null || then === null) return { arrow: '→', tone: 'text-bone-faint', label: 'first week seen' }
    if (now === then) return { arrow: '→', tone: 'text-bone-faint', label: 'steady' }
    return now > then
      ? { arrow: '↗', tone: 'text-verdant', label: 'busier than last week' }
      : { arrow: '↘', tone: 'text-amber', label: 'quieter than last week' }
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="panel p-5">
        <p className="label">By capability — counts, not money</p>
        <ul className="mt-3 space-y-2 text-[13px]">
          {[...byCap.entries()].sort((a, b) => b[1].asked + b[1].executed - (a[1].asked + a[1].executed)).map(([cap, r]) => {
            const c = convByCap.get(cap)
            const d = direction(cap)
            return (
              <li key={cap} className="border-b border-ink-line/60 py-2 last:border-0">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono text-[12px] text-bone">
                    {cap} <span className={`ml-1 ${d.tone}`} title={d.label}>{d.arrow}</span>
                  </span>
                  <span className="tabular font-mono text-[11px] text-bone-faint">
                    <span className="text-verdant">{r.executed} ok</span>
                    {' · '}
                    <span className="text-amber">{r.held} held</span>
                    {' · '}
                    <span className="text-rust">{r.denied} refused</span>
                  </span>
                </div>
                {c ? (
                  <p className="mt-1 font-mono text-[11px] text-bone-faint">
                    converts: {c.succeeded ? 'yes' : 'no'} · fails: {c.failed ? 'yes' : 'no'}
                  </p>
                ) : null}
              </li>
            )
          })}
        </ul>
        <p className="mt-3 font-mono text-[11px] text-bone-faint">
          “Did it convert” is the question. “How much” never leaves your database.
        </p>
      </div>

      <div className="panel p-5">
        <p className="label">By week — latest first</p>
        <ul className="mt-3 space-y-2 text-[13px]">
          {rows.slice(0, 12).map((r, i) => (
            <li key={`${r.capability}-${r.window_start}-${i}`} className="flex items-center justify-between gap-3 border-b border-ink-line/60 py-2 last:border-0">
              <span className="font-mono text-[12px] text-bone-dim">
                {r.capability} <span className="text-bone-faint">· {String(r.window_start).slice(0, 10)}</span>
              </span>
              <span className="tabular font-mono text-[11px] text-bone-faint">
                {r.asked ?? 0} asked · {r.held ?? 0} held · {r.denied ?? 0} refused
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 font-mono text-[11px] text-bone-faint">
          Missing weeks render as gaps — a runtime that went quiet is news, not zero.
        </p>
      </div>
    </div>
  )
}

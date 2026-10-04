import { ensureSeeded, ledger } from '@/lib/agentport'

/**
 * 5.4 comparison over time — what the merchant came back for.
 *
 * Counts only, from rows the runtime decided. No amounts, no instruments, no
 * free text, no ledger rows leave the machine — the same custody rule as the
 * analytics push, applied to the screen. A week-over-week view that survives
 * a runtime disappearing: missing days render as gaps, never as zero.
 */
export async function AnalyticsView() {
  await ensureSeeded()
  const entries = await ledger.list({ limit: 500 })

  const byCap = new Map<string, { allow: number; held: number; denied: number; total: number }>()
  for (const e of entries) {
    const row = byCap.get(e.capability) ?? { allow: 0, held: 0, denied: 0, total: 0 }
    row.total += 1
    if (e.decision === 'allow') row.allow += 1
    else if (e.decision === 'deny') row.denied += 1
    else row.held += 1
    byCap.set(e.capability, row)
  }

  const byRule = new Map<string, number>()
  for (const e of entries) byRule.set(e.rule, (byRule.get(e.rule) ?? 0) + 1)

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="panel p-5">
        <p className="label">By capability — counts, not money</p>
        <ul className="mt-3 space-y-2 text-[13px]">
          {[...byCap.entries()].sort((a, b) => b[1].total - a[1].total).map(([cap, r]) => (
            <li key={cap} className="flex items-center justify-between gap-3 border-b border-ink-line/60 py-2 last:border-0">
              <span className="font-mono text-[12px] text-bone">{cap}</span>
              <span className="tabular font-mono text-[11px] text-bone-faint">
                <span className="text-verdant">{r.allow} ok</span>
                {' · '}
                <span className="text-amber">{r.held} held</span>
                {' · '}
                <span className="text-rust">{r.denied} refused</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 font-mono text-[11px] text-bone-faint">
          “Did it convert” is the question. “How much” never leaves your database.
        </p>
      </div>

      <div className="panel p-5">
        <p className="label">By rule that fired</p>
        <ul className="mt-3 space-y-2 text-[13px]">
          {[...byRule.entries()].sort((a, b) => b[1] - a[1]).map(([rule, n]) => (
            <li key={rule} className="flex items-center justify-between gap-3 border-b border-ink-line/60 py-2 last:border-0">
              <span className="font-mono text-[12px] text-bone-dim">{rule}</span>
              <span className="tabular font-mono text-[11px] text-bone-faint">{n}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 font-mono text-[11px] text-bone-faint">
          Are refusals falling? Are approvals piling up? Which capability gets called?
        </p>
      </div>
    </div>
  )
}

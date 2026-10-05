import { createClient } from '@/lib/supabase/server'

type DenialRow = {
  denial_reason: string
  policy_rule: string | null
  window_start: string
  occurrences: number | string
}

/**
 * FRONTEND.md §3 step 5 — the rules screen reads `v_denial_reasons`.
 *
 * Which rule fired, how often, per week. A merchant holding a refusal learns
 * what to change — without us holding anything about the request behind it.
 * Silent when empty: no denials is good news and renders as exactly that,
 * not as a missing panel.
 */
export async function DenialReasons() {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('v_denial_reasons')
    .select('*')
    .order('window_start', { ascending: false })
    .limit(50)

  if (error || !data || data.length === 0) return null
  const rows = data as DenialRow[]

  return (
    <div className="panel p-5">
      <p className="label">What is actually firing — from your runtime</p>
      <ul className="mt-3 space-y-2 text-[13px]">
        {rows.slice(0, 10).map((r, i) => (
          <li key={`${r.denial_reason}-${r.policy_rule}-${i}`} className="flex items-center justify-between gap-3 border-b border-ink-line/60 py-2 last:border-0">
            <span className="font-mono text-[12px] text-bone">
              {r.denial_reason}
              <span className="ml-2 text-bone-faint">{r.policy_rule ?? 'no rule named'}</span>
            </span>
            <span className="tabular font-mono text-[11px] text-bone-faint">
              {String(r.occurrences)} · {String(r.window_start).slice(0, 10)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

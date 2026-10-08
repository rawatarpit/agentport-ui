import { Badge } from '@/components/stat'
import { configHash, ensureSeeded, ledger } from '@/lib/agentport'
import type { LedgerEntry } from '@agentport/sdk'

export const dynamic = 'force-dynamic'

const tone = (e: LedgerEntry) =>
  e.decision === 'allow' ? 'allow' : e.decision === 'deny' ? 'deny' : 'held'

/**
 * The numbers the rule was measured against.
 *
 * Rendered because a row saying `rule: max_order_value` with no amount and no
 * ceiling tells a merchant holding a refusal that it fired and nothing about
 * why. `evaluated` is absent for a capability that is not registered, because
 * there were no rules to evaluate — so its absence is not a gap to paper over.
 */
function evaluated(e: LedgerEntry): string {
  if (!e.evaluated || Object.keys(e.evaluated).length === 0) return '—'
  return Object.entries(e.evaluated)
    .map(([k, v]) => `${k}=${typeof v === 'number' ? v.toLocaleString() : String(v)}`)
    .join('  ')
}

export default async function LedgerPage() {
  let entries: LedgerEntry[] = []
  let failed = false
  try {
    await ensureSeeded()
    entries = await ledger.list({ limit: 200 })
  } catch {
    failed = true
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="label">PROVE</p>
        <h1 className="mt-2 font-display text-3xl text-bone">Agent Activity Ledger</h1>
        <p className="prose-bone mt-3 max-w-[68ch]">
          Every call an agent has made, including the ones that were refused. A
          refusal you cannot explain is a control the agent will route around, so
          denials are recorded with the rule that fired and the numbers it was
          measured against.
        </p>
      </div>

      {failed ? (
        <p className="text-[13px] text-rust" role="alert">
          The ledger could not be read. Nothing is lost — try reloading.
        </p>
      ) : entries.length === 0 ? (
        <div className="panel p-8 text-center">
          <p className="text-bone-dim">No calls recorded yet.</p>
          <p className="mt-1 font-mono text-[11px] text-bone-faint">unknown — not zero, not healthy</p>
        </div>
      ) : (
      <>
      {/*
        FRONTEND.md §5 — below 768px each row becomes a stacked card with
        labelled pairs. Horizontal-scrolling a nine-column table on a phone
        hides the refusal column exactly where the anxious owner looks first,
        so the table stays desktop-only and the cards carry the same fields.
      */}
      <div className="panel hidden overflow-x-auto md:block">
        <table className="w-full min-w-[1100px] text-left text-[13px]">
          <caption className="sr-only">Agent calls with decisions, rules, and config versions</caption>
          <thead>
            <tr className="border-b border-ink-line">
              {['Request', 'Agent', 'Capability', 'Decision', 'Rule', 'Measured', 'Approval', 'Result', 'Config'].map((h) => (
                <th key={h} scope="col" className="label px-4 py-3 font-normal">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={`${e.tenantId}:${e.requestId}`} className="border-b border-ink-line/60 last:border-0">
                <td className="px-4 py-3 font-mono text-[11px] text-bone-faint">
                  <div>{e.requestId}</div>
                  <div className="text-bone-faint/70">
                    <time dateTime={e.at}>{new Date(e.at).toLocaleString()}</time>
                  </div>
                </td>

                {/*
                  `assurance` is required on every row, and it is the difference
                  between "an agent we issued a credential to" and "a string
                  someone sent". `unverified` is rendered as itself — never as a
                  name that reads like authority, and never quietly omitted,
                  because an absent value used to be read as `verified`.
                */}
                <td className="px-4 py-3 font-mono text-[12px] text-bone-dim">
                  <div>{e.agentId}</div>
                  <div className={e.assurance === 'verified' ? 'text-bone-faint' : 'text-amber'}>
                    {e.assurance}
                  </div>
                </td>

                <td className="px-4 py-3">
                  <span className="text-bone">{e.capability}</span>
                  <span className="ml-2 text-[11px] text-bone-faint">
                    {e.capabilityRegistered === false ? 'not registered' : e.access}
                  </span>
                </td>

                <td className="px-4 py-3">
                  <Badge tone={tone(e)}>{e.decision}</Badge>
                </td>

                <td className="px-4 py-3 font-mono text-[11px] text-bone-faint">{e.rule}</td>
                <td className="px-4 py-3 font-mono text-[11px] text-bone-faint">{evaluated(e)}</td>

                <td className="px-4 py-3 text-[12px] text-bone-dim">
                  {e.approval?.approvedBy ? `by ${e.approval.approvedBy}` : e.approval?.required ? 'awaiting human' : '—'}
                </td>
                <td className="px-4 py-3 text-[12px] text-bone-dim">{e.result ?? '—'}</td>

                {/*
                  The config version that produced this row. Without it a merchant
                  can see that a ceiling fired but cannot tell which ceiling, and
                  the table has no update path — so a row written without it can
                  never be given one later.
                */}
                <td className="px-4 py-3 font-mono text-[11px] text-bone-faint">
                  {e.configHash ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 md:hidden">
        {entries.map((e) => (
          <li key={`${e.tenantId}:${e.requestId}`} className="panel space-y-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-[13px] text-bone">{e.capability}</span>
              <Badge tone={tone(e)}>{e.decision}</Badge>
            </div>
            <dl className="space-y-1.5 text-[13px]">
              <div className="flex justify-between gap-3">
                <dt className="label">Agent</dt>
                <dd className="font-mono text-[12px] text-bone-dim">{e.agentId} · {e.assurance}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="label">Rule</dt>
                <dd className="font-mono text-[12px] text-bone-faint">{e.rule}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="label">Measured</dt>
                <dd className="max-w-[60%] text-right font-mono text-[12px] text-bone-faint">{evaluated(e)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="label">Approval</dt>
                <dd className="text-[12px] text-bone-dim">
                  {e.approval?.approvedBy ? `by ${e.approval.approvedBy}` : e.approval?.required ? 'awaiting human' : '—'}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="label">Result</dt>
                <dd className="text-[12px] text-bone-dim">{e.result ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="label">Config</dt>
                <dd className="font-mono text-[12px] text-bone-faint">{e.configHash ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="label">Request</dt>
                <dd className="font-mono text-[11px] text-bone-faint">{e.requestId}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="idle">demonstration data</Badge>
        <p className="font-mono text-[11px] text-bone-faint">
          sample rows, kept in memory — your ledger replaces this when connected
        </p>
      </div>

      <div className="space-y-2">
        <p className="font-mono text-[11px] text-bone-faint">
          Config <span className="text-bone-dim">{configHash}</span> · entries are append-only, and
          there is no edit or delete path, because an audit trail that can be changed
          is not an audit trail.
        </p>
      </div>
      </>
      )}
    </div>
  )
}
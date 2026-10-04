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
  await ensureSeeded()
  const entries = await ledger.list({ limit: 200 })

  return (
    <div className="space-y-6">
      <div>
        <p className="label">PROVE</p>
        <h2 className="mt-2 font-display text-3xl text-bone">Agent Activity Ledger</h2>
        <p className="prose-bone mt-3 max-w-[68ch]">
          Every call an agent has made, including the ones that were refused. A
          refusal you cannot explain is a control the agent will route around, so
          denials are recorded with the rule that fired and the numbers it was
          measured against.
        </p>
      </div>

      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[1100px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-ink-line">
              {['Request', 'Agent', 'Capability', 'Decision', 'Rule', 'Measured', 'Approval', 'Result', 'Config'].map((h) => (
                <th key={h} className="label px-4 py-3 font-normal">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={`${e.tenantId}:${e.requestId}`} className="border-b border-ink-line/60 last:border-0">
                <td className="px-4 py-3 font-mono text-[11px] text-bone-faint">
                  <div>{e.requestId}</div>
                  <div className="text-bone-faint/70">{new Date(e.at).toLocaleTimeString()}</div>
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
                  <div className={e.assurance === 'verified' ? 'text-bone-faint' : 'text-amber-400/90'}>
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

      <div className="space-y-2">
        <p className="font-mono text-[11px] text-bone-faint">
          Config <span className="text-bone-dim">{configHash}</span> · entries are append-only, and
          there is no edit or delete path, because an audit trail that can be changed
          is not an audit trail.
        </p>
        {/*
          The honest caveat. The DB aborts UPDATE and DELETE, but this console owns
          the table, so a merchant who drops those triggers degrades the guarantee
          to "the SDK never issues an UPDATE or a DELETE" — a weaker claim, and one
          already asserted by a test in the SDK. Do not restate it as the stronger
          one here.
        */}
        <p className="font-mono text-[11px] text-bone-faint/70">
          Demonstration surface: these rows are seeded fixtures and the ledger is
          in-memory, so it is capped and does not survive a restart. A real
          deployment passes a <span className="text-bone-dim">SqlLedger</span> bound
          to the merchant&rsquo;s own database.
        </p>
      </div>
    </div>
  )
}
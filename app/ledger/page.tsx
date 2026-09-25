import { Badge } from '@/components/stat'
import { ensureSeeded, ledger } from '@/lib/agentport'
import type { LedgerEntry } from '@agentport/sdk'

export const dynamic = 'force-dynamic'

const tone = (e: LedgerEntry) =>
  e.decision === 'allow' ? 'allow' : e.decision === 'deny' ? 'deny' : 'held'

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
          denials are recorded with the rule that fired.
        </p>
      </div>

      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-ink-line">
              {['Request', 'Agent', 'Capability', 'Decision', 'Rule', 'Approval', 'Result'].map((h) => (
                <th key={h} className="label px-4 py-3 font-normal">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.requestId} className="border-b border-ink-line/60 last:border-0">
                <td className="px-4 py-3 font-mono text-[11px] text-bone-faint">
                  <div>{e.requestId}</div>
                  <div className="text-bone-faint/70">{new Date(e.at).toLocaleTimeString()}</div>
                </td>
                <td className="px-4 py-3 font-mono text-[12px] text-bone-dim">{e.agentId}</td>
                <td className="px-4 py-3">
                  <span className="text-bone">{e.capability}</span>
                  <span className="ml-2 text-[11px] text-bone-faint">{e.access}</span>
                </td>
                <td className="px-4 py-3">
                  <Badge tone={tone(e)}>{e.decision}</Badge>
                </td>
                <td className="px-4 py-3 font-mono text-[11px] text-bone-faint">{e.rule}</td>
                <td className="px-4 py-3 text-[12px] text-bone-dim">
                  {e.approval?.approvedBy ? `by ${e.approval.approvedBy}` : e.approval?.required ? 'awaiting human' : '—'}
                </td>
                <td className="px-4 py-3 text-[12px] text-bone-dim">{e.result ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="font-mono text-[11px] text-bone-faint">
        Entries are append-only. There is no edit or delete path, because an audit
        trail that can be changed is not an audit trail.
      </p>
    </div>
  )
}

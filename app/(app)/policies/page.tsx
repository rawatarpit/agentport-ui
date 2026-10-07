import { Badge } from '@/components/stat'
import { KillSwitchPanel } from '@/components/kill-switch-panel'
import { policy } from '@/lib/agentport'
import { getLive, resolveTenant } from '@/lib/store'

export const dynamic = 'force-dynamic'

/** Evaluation order, as the engine applies it. Order is the design. */
const ORDER = [
  {
    n: '01',
    rule: 'emergency_kill_switch',
    outcome: 'deny' as const,
    why: 'Evaluated first so nothing can outrank it. Denies writes, makes reads audit-only.',
  },
  {
    n: '02',
    rule: 'forbidden_capabilities',
    outcome: 'deny' as const,
    why: 'An explicit prohibition. A capability named here is unreachable by any agent.',
  },
  {
    n: '03',
    rule: 'restricted_data_classes',
    outcome: 'deny' as const,
    why: 'An agent may not read a data class the business restricted, exposed or not.',
  },
  {
    n: '04',
    rule: 'absolute_max_order_value',
    outcome: 'deny' as const,
    why: 'A hard ceiling. Denied outright, never queued, so a human is never asked to approve the impossible.',
  },
  {
    n: '05',
    rule: 'max_order_value',
    outcome: 'held' as const,
    why: 'A soft ceiling. Held for a human, and nothing executes until they decide.',
  },
  {
    n: '06',
    rule: 'bulk_order_threshold',
    outcome: 'held' as const,
    why: 'Volume control, independent of value. A small order of many units still gets looked at.',
  },
  {
    n: '07',
    rule: 'requires_approval',
    outcome: 'held' as const,
    why: 'Set on the capability or by policy. Carries through regardless of value or volume.',
  },
  {
    n: '08',
    rule: 'rate_limit',
    outcome: 'deny' as const,
    why: 'Applied last, so it only throttles requests that would otherwise have been permitted.',
  },
]

export default function PoliciesPage() {
  // Live values win; the demo constant below is only the fallback shape.
  // Nothing published yet renders as exactly that — never demo numbers
  // dressed as the merchant's configuration.
  const live = getLive(resolveTenant())
  const livePolicy = live?.policy as
    | {
        maxOrderValue?: { minor?: number; currency?: string }
        absoluteMaxOrderValue?: { minor?: number; currency?: string }
        forbiddenCapabilities?: string[]
        alwaysRequireApproval?: string[]
        rateLimit?: { requestsPerMinute?: number }
      }
    | undefined
  const shown = {
    ask: livePolicy?.maxOrderValue?.minor ?? null,
    currency: livePolicy?.maxOrderValue?.currency ?? livePolicy?.absoluteMaxOrderValue?.currency ?? 'INR',
    never: livePolicy?.absoluteMaxOrderValue?.minor ?? null,
    forbidden: livePolicy?.forbiddenCapabilities ?? null,
    alwaysAsk: livePolicy?.alwaysRequireApproval ?? null,
    rate: livePolicy?.rateLimit?.requestsPerMinute ?? policy.rateLimit?.requestsPerMinute,
    kill: live ? live.emergencyKillSwitch : null,
  }
  const fmt = (minor: number | null) => (minor === null ? '—' : `${minor.toLocaleString()} ${shown.currency} minor`)

  return (
    <div className="space-y-6">
      <div>
        <p className="label">AUTHORIZE</p>
        <h2 className="mt-2 font-display text-3xl text-bone">Business-controlled policy</h2>
        <p className="prose-bone mt-3 max-w-[68ch]">
          The merchant owns this. An agent is never trusted because it is an AI
          agent; it is trusted because the business issued it a credential with
          named scopes, and these rules decide what that credential may do.
        </p>
      </div>

      <div className="panel hidden overflow-x-auto md:block">
        <table className="w-full min-w-[760px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-ink-line">
              {['#', 'Rule', 'Outcome', 'Why it sits here'].map((h) => (
                <th key={h} className="label px-4 py-3 font-normal">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ORDER.map((r) => (
              <tr key={r.rule} className="border-b border-ink-line/60 last:border-0">
                <td className="tabular px-4 py-3 font-mono text-[12px] text-bone-faint">{r.n}</td>
                <td className="px-4 py-3 font-mono text-[12px] text-bone">{r.rule}</td>
                <td className="px-4 py-3">
                  <Badge tone={r.outcome === 'deny' ? 'deny' : 'held'}>{r.outcome}</Badge>
                </td>
                <td className="px-4 py-3 text-[13px] leading-relaxed text-bone-dim">{r.why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 md:hidden">
        {ORDER.map((r) => (
          <li key={r.rule} className="panel space-y-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-[12px] text-bone">{r.rule}</span>
              <Badge tone={r.outcome === 'deny' ? 'deny' : 'held'}>{r.outcome}</Badge>
            </div>
            <p className="text-[13px] leading-relaxed text-bone-dim">{r.why}</p>
          </li>
        ))}
      </ul>

      <div className="panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="label">Currently in force</p>
          {live ? (
            <span className="font-mono text-[11px] text-bone-faint">published version {live.version}</span>
          ) : (
            <Badge tone="idle">nothing published yet</Badge>
          )}
        </div>
        <dl className="mt-3 grid gap-x-8 gap-y-2 text-[13px] sm:grid-cols-2">
          <div className="flex justify-between gap-3 border-b border-ink-line/60 py-2">
            <dt className="text-bone-faint">Ask you first above</dt>
            <dd className="tabular font-mono text-bone">{fmt(shown.ask)}</dd>
          </div>
          <div className="flex justify-between gap-3 border-b border-ink-line/60 py-2">
            <dt className="text-bone-faint">Always say no above</dt>
            <dd className="tabular font-mono text-bone">{fmt(shown.never)}</dd>
          </div>
          <div className="flex justify-between gap-3 border-b border-ink-line/60 py-2">
            <dt className="text-bone-faint">Never allowed</dt>
            <dd className="font-mono text-bone">{shown.forbidden ? shown.forbidden.join(', ') : '—'}</dd>
          </div>
          <div className="flex justify-between gap-3 border-b border-ink-line/60 py-2">
            <dt className="text-bone-faint">Always needs you</dt>
            <dd className="font-mono text-bone">{shown.alwaysAsk ? shown.alwaysAsk.join(', ') : '—'}</dd>
          </div>
          <div className="flex justify-between gap-3 border-b border-ink-line/60 py-2">
            <dt className="text-bone-faint">Rate limit</dt>
            <dd className="tabular font-mono text-bone">{shown.rate ?? '—'}/min</dd>
          </div>
          <div className="flex justify-between gap-3 border-b border-ink-line/60 py-2">
            <dt className="text-bone-faint">Emergency stop</dt>
            <dd>
              {shown.kill === null ? (
                <span className="font-mono text-[12px] text-bone-faint">—</span>
              ) : (
                <Badge tone={shown.kill ? 'deny' : 'idle'}>
                  {shown.kill ? 'stopped' : 'running normally'}
                </Badge>
              )}
            </dd>
          </div>
        </dl>
        {!live ? (
          <p className="mt-3 text-[13px] text-bone-dim">
            Answer the setup questions or save a rules draft, then publish — until then there is nothing to show here, and this screen will not invent any.
          </p>
        ) : null}
      </div>

      <KillSwitchPanel />
    </div>
  )
}

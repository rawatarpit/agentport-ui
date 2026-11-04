import { Badge } from '@/components/stat'

/**
 * The emergency switch is merchant state, decided elsewhere.
 *
 * There is no browser control here: a session cookie is not the trust path
 * for stopping enforcement. The dashboard shows the command and the fact that
 * closing this tab cannot flip it. Approvals and kill-switch decisions land
 * through the hosted path; this repo only renders what that path recorded.
 */
export function KillSwitchPanel() {
  return (
    <div className="panel space-y-3 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="label">Emergency stop</p>
        <Badge tone="idle">hosted governor</Badge>
      </div>
      <p className="text-[13px] leading-relaxed text-bone-dim">
        The stop is evaluated first by the hosted governor. It is command-only:
        this console can show the state, but it cannot flip the switch from a
        browser session.
      </p>
      <pre className="overflow-x-auto border border-ink-line bg-ink/60 p-3 font-mono text-[12px] text-bone-dim">
        agent-port kill engage
      </pre>
      <p className="text-[13px] leading-relaxed text-bone-dim">
        Releasing requires typing your business name. The switch survives restarts
        and cannot be cleared by a publish, a rollback, or this dashboard.
      </p>
    </div>
  )
}

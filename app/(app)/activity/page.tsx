import Link from 'next/link'
import { Chip } from '@/components/ui/chip'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { StatusPill } from '@/components/ui/status-pill'
import { listDecisions } from '@/lib/console-reads'
import type { LedgerEntry } from '@/lib/contracts'
import { safeAgentLabel } from '@/lib/safe-display'
import { resolveRequestTenant } from '@/lib/tenant-server'

export const dynamic = 'force-dynamic'

/**
 * Activity is the ledger's console projection and nothing wider. The select
 * list lives in `listDecisions`, where ledger_console_view is checked to carry
 * identity, decision, reason, rule, result and digest only. This page adds no
 * select of amounts, parameters, detail, evaluated figures or error text.
 */

function when(value: string): string {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : 'unknown'
}

function decisionTone(decision: LedgerEntry['decision']) {
  if (decision === 'allow') return 'live' as const
  if (decision === 'deny') return 'blocked' as const
  return 'draft' as const
}

export default async function ActivityPage() {
  const tenant = await resolveRequestTenant()
  if (tenant.active.status !== 'active') {
    return (
      <div className="panel p-8 text-center">
        <p className="text-bone-dim">Choose a workspace before reading activity.</p>
        <p className="mt-1 font-mono text-[11px] text-bone-faint">no tenant is read without an explicit selection</p>
      </div>
    )
  }

  let rows: LedgerEntry[] = []
  let failed = false
  try {
    rows = await listDecisions(tenant.active.tenantId, 100)
  } catch {
    // A failed RLS read is unknown, never an empty ledger.
    failed = true
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operate"
        title="Activity"
        description="Decision rows received from the hosted ledger. Parameters, amounts, evaluated figures, error text and request detail are not in this projection and are never shown here."
        actions={
          <Link href="/ledger" className="btn">
            Full ledger
          </Link>
        }
      />

      {failed || rows.length === 0 ? (
        <EmptyState
          title="No ledger rows received"
          body={
            failed
              ? 'The ledger read did not complete. This is unknown, not an empty ledger — try reloading.'
              : 'No decision rows have been received for this workspace yet. That is unknown activity, not a healthy zero.'
          }
          action={
            <Link href="/connect" className="btn">
              Connect an agent
            </Link>
          }
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={`${row.requestId}:${row.at}`} className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[13px] text-bone">{row.capability}</span>
                  <StatusPill tone={decisionTone(row.decision)}>{row.decision}</StatusPill>
                  {row.access ? <Chip tone={row.access === 'write' ? 'warn' : 'neutral'}>{row.access}</Chip> : null}
                  {row.result ? <Chip tone={row.result === 'ok' ? 'good' : 'bad'}>{row.result}</Chip> : null}
                  {row.approval?.required ? <Chip tone="warn">human approval required</Chip> : null}
                </div>
                <p className="text-[12px] leading-relaxed text-bone-dim">
                  rule <span className="font-mono text-bone-faint">{row.rule}</span> · reason{' '}
                  <span className="font-mono text-bone-faint">{row.reason}</span>
                </p>
                <p className="font-mono text-[11px] text-bone-faint">
                  {safeAgentLabel(row.agentLabel) ?? (row.agentLabelSource === 'credential' ? 'Unnamed credential' : 'Unidentified agent')}
                </p>
              </div>
              <time dateTime={row.at} className="shrink-0 font-mono text-[11px] text-bone-faint">
                {when(row.at)}
              </time>
            </li>
          ))}
        </ul>
      )}

      <p className="font-mono text-[11px] text-bone-faint">
        Reads use the session client and the tenant&apos;s RLS scope. A row here is a recorded decision, not proof
        that a capability is live.
      </p>
    </div>
  )
}

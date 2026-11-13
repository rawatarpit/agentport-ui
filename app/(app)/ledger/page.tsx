import Link from 'next/link'
import type { ReactNode } from 'react'
import { Badge } from '@/components/stat'
import { Callout } from '@/components/ui/callout'
import { Chip } from '@/components/ui/chip'
import { EmptyState } from '@/components/ui/empty-state'
import { KpiCard } from '@/components/ui/kpi-card'
import { PageHeader } from '@/components/ui/page-header'
import { configHash } from '@/lib/agentport'
import { listDecisions } from '@/lib/console-reads'
import type { LedgerEntry } from '@/lib/contracts'
import {
  agentAttribution,
  decisionLabel,
  filterEntries,
  isFiltering,
  parseLedgerFilter,
  summarise,
} from '@/lib/ledger-summary'
import { resolveRequestTenant } from '@/lib/tenant-server'

export const dynamic = 'force-dynamic'

const tone = (e: LedgerEntry) =>
  e.decision === 'allow' ? 'allow' : e.decision === 'deny' ? 'deny' : 'held'

function when(value: string): string {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString() : value
}

/** A labelled pair in the mobile card. Desktop uses the table instead. */
function Pair({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="label">{label}</dt>
      <dd className="max-w-[62%] text-right text-[12px] text-bone-dim">{children}</dd>
    </div>
  )
}

export default async function LedgerPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>
}) {
  const tenant = await resolveRequestTenant()
  if (tenant.active.status !== 'active') {
    return (
      <div className="panel p-8 text-center">
        <p className="text-bone-dim">Choose a workspace before reading the ledger.</p>
        <p className="mt-1 font-mono text-[11px] text-bone-faint">no tenant is read without an explicit selection</p>
      </div>
    )
  }

  const filter = parseLedgerFilter(searchParams ?? {})
  let entries: LedgerEntry[] = []
  let failed = false
  // Durable reads (TASKS.md 2.2): rows for the selected tenant only, newest
  // first. RLS can return the union of memberships, so the explicit filter is
  // what keeps a second workspace out of this table. No seed, no fixtures,
  // no fallback to memory — empty renders the honest "unknown — not zero".
  try {
    entries = await listDecisions(tenant.active.tenantId, 200)
  } catch {
    failed = true
  }

  const summary = summarise(entries)
  const visible = filterEntries(entries, filter)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Prove"
        title="Agent activity ledger"
        description="Every call an agent has made, including the ones that were refused. A refusal you cannot explain is a control the agent will route around, so denials are recorded with the rule that fired. A name marked declared was supplied by the caller, not verified by us."
        actions={
          <Link href="/analytics" className="btn">
            Read analytics
          </Link>
        }
      />

      {failed ? (
        <Callout tone="danger" title="The ledger could not be read">
          Nothing is lost — try reloading. An empty table here would be a claim that this workspace has no rows,
          and a failed read is not that claim.
        </Callout>
      ) : (
        <>
          {entries.length === 0 ? (
            <EmptyState
              title="No decisions recorded yet"
              body={
                <>
                  That is <span className="text-bone">unknown, not zero</span> — nothing has been heard from an agent
                  for this workspace, and no refusal has been recorded either.
                </>
              }
              action={
                <Link href="/connect" className="btn">
                  Connect an agent
                </Link>
              }
            />
          ) : (
            <>
              <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <KpiCard
                  label="Decisions read"
                  value={summary.total}
                  hint="Newest 200 rows for this workspace. Older rows are not counted here."
                />
                <KpiCard
                  label="Allowed"
                  value={summary.allowed}
                  tone="good"
                  hint="Policy permitted the call before it ran."
                />
                <KpiCard
                  label="Denied"
                  value={summary.denied}
                  tone={summary.denied > 0 ? 'bad' : 'default'}
                  hint="Refused with a specific rule. Nothing ran."
                />
                <KpiCard
                  label="Held decisions"
                  value={summary.held}
                  tone={summary.held > 0 ? 'warn' : 'default'}
                  hint="Policy required approval in this window. Approval commits are separate rows; Approvals shows what is still waiting."
                />
                <KpiCard
                  label="Self-service"
                  value={summary.selfService}
                  hint="Calls with a declared label, not a credential this business issued."
                />
              </section>

              <Callout tone="info" title="Reading agent names">
                A <span className="font-medium text-bone">credential</span> name came from a credential this business
                issued. A <span className="font-medium text-bone">declared</span> name was supplied by the caller and
                is not verified identity. An <span className="font-medium text-bone">unidentified</span> caller
                established no agent identity at all. Rows older than attribution read{' '}
                <span className="font-medium text-bone">source unknown</span> rather than guessing.
              </Callout>

              <form method="get" className="panel flex flex-col gap-3 p-3 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1">
                  <label htmlFor="ledger-q" className="field-label">
                    Search
                  </label>
                  <input
                    id="ledger-q"
                    name="q"
                    type="search"
                    defaultValue={filter.query}
                    placeholder="capability, agent, request id, rule"
                    className="input"
                  />
                </div>
                <div>
                  <label htmlFor="ledger-decision" className="field-label">
                    Decision
                  </label>
                  <select id="ledger-decision" name="decision" defaultValue={filter.decision} className="input">
                    <option value="all">All decisions</option>
                    <option value="allow">Allowed</option>
                    <option value="deny">Denied</option>
                    <option value="held">Held</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="ledger-access" className="field-label">
                    Access
                  </label>
                  <select id="ledger-access" name="access" defaultValue={filter.access} className="input">
                    <option value="all">All access</option>
                    <option value="read">Read</option>
                    <option value="write">Write</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <button type="submit" className="btn btn-primary">
                    Filter
                  </button>
                  {isFiltering(filter) ? (
                    <Link href="/ledger" className="btn">
                      Clear
                    </Link>
                  ) : null}
                </div>
              </form>

              <p className="font-mono text-[11px] text-bone-faint">
                Showing <span className="text-bone">{visible.length}</span> of {entries.length} decisions in the
                latest window.
              </p>

              {visible.length === 0 ? (
                <EmptyState
                  title="No decisions match this filter"
                  body={
                    <>
                      The latest window has {entries.length} rows, but none match{' '}
                      {filter.query ? <span className="text-bone">“{filter.query}”</span> : 'these filters'}. The
                      filter is applied to the newest 200 rows, not the entire history.
                    </>
                  }
                  action={
                    <Link href="/ledger" className="btn">
                      Clear the filter
                    </Link>
                  }
                />
              ) : (
                <>
                  {/*
                    FRONTEND.md §5 — below 768px each row becomes a stacked card
                    with labelled pairs. Horizontal-scrolling a nine-column table
                    on a phone hides the refusal column exactly where the anxious
                    owner looks first, so the table stays desktop-only and the
                    cards carry the same fields.
                  */}
                  <div className="panel hidden overflow-x-auto md:block">
                    <table className="table min-w-[1080px]">
                      <caption className="sr-only">
                        Agent calls with attribution, decisions, reasons, rules, approvals and outcomes
                      </caption>
                      <thead>
                        <tr>
                          {['Request', 'Agent', 'Capability', 'Decision', 'Reason', 'Rule', 'Approval', 'Result', 'Config'].map(
                            (h) => (
                              <th key={h} scope="col">
                                {h}
                              </th>
                            ),
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((e) => {
                          const agent = agentAttribution(e)
                          return (
                            <tr key={`${e.tenantId}:${e.requestId}`}>
                              <td>
                                <div className="font-mono text-[11px] text-bone-faint">{e.requestId}</div>
                                <div className="font-mono text-[10.5px] text-bone-faint/70">
                                  <time dateTime={e.at}>{when(e.at)}</time>
                                </div>
                                {/* TASKS.md 2.5 — the digest that lets a counted row be
                                  verified against the merchant's local row. Absent on rows
                                  written before digests existed; absence renders as nothing,
                                  not as a broken value. */}
                                {e.rowDigest ? (
                                  <div className="mt-1 break-all font-mono text-[10px] text-bone-faint/60">
                                    {e.rowDigest}
                                  </div>
                                ) : null}
                              </td>

                              {/*
                                `assurance` is required on every row, and it is the
                                difference between "an agent we issued a credential to" and
                                "a string someone sent". `declared` is never rendered as a
                                name that reads like authority.
                              */}
                              <td>
                                <div className="text-[12.5px] text-bone">{agent.name}</div>
                                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                  <Chip
                                    tone={
                                      agent.trusted
                                        ? 'good'
                                        : agent.source === 'declared'
                                          ? 'warn'
                                          : 'neutral'
                                    }
                                    title={agent.title}
                                  >
                                    {agent.chip}
                                  </Chip>
                                  <span
                                    className={
                                      e.assurance === 'verified'
                                        ? 'font-mono text-[10.5px] text-bone-faint'
                                        : 'font-mono text-[10.5px] text-amber'
                                    }
                                  >
                                      {`token ${e.assurance}`}
                                  </span>
                                </div>
                              </td>

                              <td>
                                <div className="font-mono text-[12px] text-bone">{e.capability}</div>
                                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                  {e.access ? (
                                    <Chip tone={e.access === 'write' ? 'warn' : 'neutral'}>{e.access}</Chip>
                                  ) : null}
                                  {e.capabilityRegistered === false ? (
                                    <Chip tone="bad" title="This capability is not in the applied inventory.">
                                      not registered
                                    </Chip>
                                  ) : null}
                                </div>
                              </td>

                              <td>
                                <Badge tone={tone(e)}>{decisionLabel(e.decision)}</Badge>
                              </td>

                              <td className="font-mono text-[11px] text-bone-dim">{e.reason}</td>
                              <td className="font-mono text-[11px] text-bone-faint">{e.rule}</td>

                              <td className="text-[12px] text-bone-dim">
                                {e.approval?.approvedBy
                                  ? `by ${e.approval.approvedBy}`
                                  : e.approval?.required
                                    ? 'awaiting human'
                                    : '—'}
                              </td>

                              <td>
                                {e.result ? (
                                  <Chip tone={e.result === 'ok' ? 'good' : 'bad'}>{e.result}</Chip>
                                ) : (
                                  <span className="text-bone-faint">—</span>
                                )}
                              </td>

                              {/*
                                The config version that produced this row. Without it a merchant
                                can see that a ceiling fired but cannot tell which ceiling, and
                                the table has no update path — so a row written without it can
                                never be given one later.
                              */}
                              <td className="break-all font-mono text-[10.5px] text-bone-faint">
                                {e.configHash ?? '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  <ul className="space-y-3 md:hidden">
                    {visible.map((e) => {
                      const agent = agentAttribution(e)
                      return (
                        <li key={`${e.tenantId}:${e.requestId}`} className="panel space-y-3 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-mono text-[13px] text-bone">{e.capability}</span>
                            <Badge tone={tone(e)}>{decisionLabel(e.decision)}</Badge>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            {e.access ? (
                              <Chip tone={e.access === 'write' ? 'warn' : 'neutral'}>{e.access}</Chip>
                            ) : null}
                            <Chip
                              tone={
                                agent.source === 'credential'
                                  ? 'good'
                                  : agent.source === 'declared'
                                    ? 'warn'
                                    : 'neutral'
                              }
                              title={agent.title}
                            >
                              {agent.chip}
                            </Chip>
                            <span
                              className={
                                e.assurance === 'verified'
                                  ? 'font-mono text-[10.5px] text-bone-faint'
                                  : 'font-mono text-[10.5px] text-amber'
                              }
                            >
                              {e.assurance}
                            </span>
                          </div>

                          <dl className="space-y-1.5 text-[13px]">
                            <Pair label="Agent">
                              <span className="font-mono text-[12px] text-bone-dim">{agent.name}</span>
                            </Pair>
                            <Pair label="Reason">
                              <span className="font-mono text-[12px] text-bone-dim">{e.reason}</span>
                            </Pair>
                            <Pair label="Rule">
                              <span className="font-mono text-[12px] text-bone-faint">{e.rule}</span>
                            </Pair>
                            <Pair label="Approval">
                              {e.approval?.approvedBy
                                ? `by ${e.approval.approvedBy}`
                                : e.approval?.required
                                  ? 'awaiting human'
                                  : '—'}
                            </Pair>
                            <Pair label="Result">{e.result ?? '—'}</Pair>
                            <Pair label="Config">
                              <span className="break-all font-mono text-[11px] text-bone-faint">
                                {e.configHash ?? '—'}
                              </span>
                            </Pair>
                            <Pair label="Request">
                              <span className="font-mono text-[11px] text-bone-faint">{e.requestId}</span>
                            </Pair>
                            <Pair label="When">
                              <span className="font-mono text-[11px] text-bone-faint">
                                <time dateTime={e.at}>{when(e.at)}</time>
                              </span>
                            </Pair>
                          </dl>
                        </li>
                      )
                    })}
                  </ul>
                </>
              )}
            </>
          )}

          <div className="space-y-2 border-t border-ink-line pt-4">
            <p className="font-mono text-[11px] text-bone-faint">
              Member-scoped reads — identity, decision, reason, rule, outcome and digest. Amounts, parameters and
              evaluated figures are not projected: the console renders the decision, not the merchant request.
            </p>
            <p className="font-mono text-[11px] text-bone-faint">
              Config <span className="text-bone-dim">{configHash}</span> · entries are append-only, and there is no
              edit or delete path, because an audit trail that can be changed is not an audit trail.
            </p>
          </div>
        </>
      )}
    </div>
  )
}

import Link from 'next/link'
import { Badge } from '@/components/stat'
import { getLiveArtifact } from '@/lib/backend-reads'
import { getDraftDb, getInstallationsDb, getPullRequestsDb, installationKnownDb } from '@/lib/durable-store'
import { mintInstallationTokenFor, readPrState } from '@/lib/github'
import { getCounts, getLive, getMerchant } from '@/lib/store'
import { resolveRequestTenant } from '@/lib/tenant-server'

export const dynamic = 'force-dynamic'

/**
 * The business owner's landing: numbers first, then what needs them.
 *
 * Every number comes from counted runtime pushes in the store — never
 * fixtures, never invented. A business with no pushes yet gets an honest
 * empty state (unknown, not zero), because zero would claim a healthy
 * runtime that may not exist.
 */
export async function DashboardKpis() {
  const tenant = await resolveRequestTenant()
  const rows = tenant.active.status === 'active' ? getCounts(tenant.active.tenantId) : []

  if (rows.length === 0) {
    return (
      <div className="panel space-y-2 p-6">
        <p className="label">Activity</p>
        <p className="text-[14px] leading-relaxed text-bone-dim">
          Nothing recorded yet — this reads <span className="text-bone">unknown</span>,
          not zero. Numbers appear here once your site starts reporting.
        </p>
        <Link href="/#connect-github" className="btn mt-2">Connect your site</Link>
      </div>
    )
  }

  const heldKinds = new Set(['held', 'approved', 'require_approval'])
  const held = rows.filter((r) => heldKinds.has(r.decision)).reduce((n, r) => n + r.n, 0)
  const denied = rows.filter((r) => r.decision === 'deny' || r.decision === 'denied').reduce((n, r) => n + r.n, 0)
  const allowed = rows.reduce((n, r) => n + r.n, 0) - held - denied

  const byCap = new Map<string, { ok: number; held: number; refused: number }>()
  for (const r of rows) {
    const row = byCap.get(r.capability) ?? { ok: 0, held: 0, refused: 0 }
    if (heldKinds.has(r.decision)) row.held += r.n
    else if (r.decision === 'deny' || r.decision === 'denied') row.refused += r.n
    else row.ok += r.n
    byCap.set(r.capability, row)
  }
  const caps = [...byCap.entries()].sort((a, b) => b[1].ok + b[1].held + b[1].refused - (a[1].ok + a[1].held + a[1].refused)).slice(0, 5)
  const max = Math.max(1, ...caps.map(([, r]) => r.ok + r.held + r.refused))

  const feed = [...rows]
    .sort((a, b) => b.n - a.n)
    .slice(0, 5)
    .map((r) => ({
      key: `${r.capability}:${r.rule}:${r.decision}`,
      capability: r.capability,
      detail: r.rule,
      decision: heldKinds.has(r.decision) ? 'held' : r.decision === 'deny' || r.decision === 'denied' ? 'deny' : 'allow',
      n: r.n,
    }))
  const tone = (d: string): 'allow' | 'deny' | 'held' => (d === 'allow' ? 'allow' : d === 'deny' ? 'deny' : 'held')

  const total = allowed + held + denied

  return (
    <div className="space-y-3">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Agent calls" value={total} sub="recorded, refusals included" />
        <Kpi label="Waiting on you" value={held} sub="held, nothing executed" tone="text-amber" link="/approvals" />
        <Kpi label="Refused" value={denied} sub="with the rule that fired" tone="text-rust" link="/ledger" />
        <Kpi label="Capabilities seen" value={caps.length} sub="reported by your site" link="/capabilities" />
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <div className="panel p-5">
          <div className="flex items-baseline justify-between">
            <p className="label">Calls by capability</p>
            <Link href="/analytics" className="font-mono text-[11px] text-bone-faint hover:text-bone">all analytics →</Link>
          </div>
          <ul className="mt-4 space-y-3">
            {caps.map(([cap, r]) => {
              const n = r.ok + r.held + r.refused
              return (
                <li key={cap}>
                  <div className="flex items-baseline justify-between text-[13px]">
                    <span className="font-mono text-bone">{cap}</span>
                    <span className="tabular font-mono text-[11px] text-bone-faint">{n}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-line/50">
                    <div className="h-full rounded-full bg-verdant/70" style={{ width: `${Math.max(6, Math.round((n / max) * 100))}%` }} />
                  </div>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="panel p-5">
          <div className="flex items-baseline justify-between">
            <p className="label">Most frequent outcomes</p>
            <Link href="/ledger" className="font-mono text-[11px] text-bone-faint hover:text-bone">full ledger →</Link>
          </div>
          <ul className="mt-3 space-y-2">
            {feed.map((e) => (
              <li key={e.key} className="flex items-center justify-between gap-3 border-b border-ink-line/60 py-2 text-[13px] last:border-0">
                <span>
                  <span className="font-mono text-bone">{e.capability}</span>
                  <span className="ml-2 text-bone-faint">{e.detail} · ×{e.n}</span>
                </span>
                <Badge tone={tone(e.decision)}>{e.decision === 'allow' ? 'ok' : e.decision === 'deny' ? 'refused' : 'held'}</Badge>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  )
}

function Kpi({ label, value, sub, tone, link }: { label: string; value: number; sub: string; tone?: string; link?: string }) {
  const inner = (
    <>
      <p className="label">{label}</p>
      <p className={`mt-2 font-display text-4xl ${tone ?? 'text-bone'}`}>{value}</p>
      <p className="mt-1 font-mono text-[11px] text-bone-faint">{sub}</p>
    </>
  )
  return link ? (
    <Link href={link} className="panel block p-5 transition-colors hover:border-verdant/50">{inner}</Link>
  ) : (
    <div className="panel p-5">{inner}</div>
  )
}

/**
 * Onboarding in one voice: progress, checklist, and the GitHub explanation
 * where it belongs — under the GitHub row, when that row is the next thing
 * to do. Replaces the three separate cards (nudge, checklist, how-to) that
 * told the same journey in three voices. Returns null when finished: a
 * completed onboarding disappears instead of nagging.
 */
export async function OnboardingCard() {
  const tenant = await resolveRequestTenant()
  if (tenant.active.status !== 'active') return null
  const tenantId = tenant.active.tenantId
  const merchant = getMerchant(tenantId)
  const [setup, rules, installations, prs, liveArtifact] = await Promise.all([
    getDraftDb(tenantId, 'setup'),
    getDraftDb(tenantId, 'rules'),
    getInstallationsDb(tenantId),
    getPullRequestsDb(tenantId),
    getLiveArtifact(tenantId),
  ])
  const rulesReady = Boolean(setup || rules)
  const prOpened = prs.length > 0
  const live = liveArtifact !== null

  // Revalidate before calling an installation connected. Only a successful
  // mint is proof; a revoked install or an App/network failure is not a green
  // step. The row stays in the durable store so the panel can retry.
  let installed = false
  for (const inst of installations) {
    const minted = await mintInstallationTokenFor(inst.installationId)
    if (minted.ok) {
      installed = true
      break
    }
  }

  // Has any recorded pull request actually merged? Read live through a
  // fresh installation token — the record only says one was opened. A PR
  // record whose installation is no longer linked is skipped before mint,
  // exactly as /api/github/pr does; a stale row is not authority.
  let merged = false
  try {
    for (const pr of prs) {
      if (!(await installationKnownDb(tenantId, pr.installationId))) continue
      const minted = await mintInstallationTokenFor(pr.installationId)
      if (!minted.ok) continue
      const state = await readPrState({ installationToken: minted.token, repoFullName: pr.repo, prNumber: pr.number })
      if (state.ok && state.merged) {
        merged = true
        break
      }
    }
  } catch {
    merged = false
  }

  let account: { done: boolean; body: string } = {
    done: !!merchant,
    body: 'Email + password + business name — two minutes.',
  }
  try {
    const { createClient } = await import('@/lib/supabase/server')
    const {
      data: { session },
    } = await createClient().auth.getSession()
    if (session?.user.email) {
      account = { done: true, body: `Signed in as ${session.user.email}.` }
    }
  } catch {
    // No session available (demo mode) — fall back to the demo record above.
  }

  const items = [
    { done: account.done, label: 'Create your account', body: account.body, href: '/connect', key: 'account' },
    {
      done: rulesReady,
      label: 'Set your starter rules',
      body: rulesReady ? 'Saved as a draft — nothing is live yet.' : 'Four plain questions. The install package is generated from these answers.',
      href: '/setup',
      key: 'rules',
    },
    {
      done: installed,
      label: 'Connect GitHub and choose your website repo',
      body: installed ? 'GitHub is connected for this business.' : 'You pick the repo; we never see your password.',
      href: '#connect-github',
      key: 'github',
    },
    {
      done: prOpened,
      label: 'Open the install PR',
      body: prOpened ? 'PR opened — review it on GitHub.' : 'Adds `agentport/` and discovery files, not a runtime.',
      href: '#connect-github',
      key: 'pr',
    },
    {
      done: merged,
      label: 'Review and merge the PR',
      body: merged ? 'Merged — your CI/CD can deploy it.' : 'Your merge adopts it; your normal deploy puts it on the site.',
      href: '#connect-github',
      key: 'merge',
    },
    {
      done: live,
      label: 'Publish your rules',
      body: live ? 'Published — the hosted governor enforces it.' : 'Review the summary and publish. Nothing is live before this.',
      href: '/rules',
      key: 'live',
    },
  ]
  const done = items.filter((i) => i.done).length
  if (done === items.length) return null
  // First run gets one door, not six: the single next action as the
  // primary button, the rest as the list below. A wall of equal choices
  // is how onboarding stalls on step zero.
  const firstUndone = items.find((i) => !i.done)
  // Rules come before the install PR because the package is generated from
  // them. Until a draft exists, the PR would refuse with "nothing to
  // publish" after the merchant had already picked a repo.
  const urgent = account.done && !rulesReady
  const nextUndone = firstUndone

  return (
    <div className={`panel p-5 ${urgent ? 'border-amber/40' : ''}`}>
      <div className="flex items-baseline justify-between">
        <p className="label">
          {urgent ? 'One step left — set your starter rules' : `Getting started — ${done} of ${items.length}`}
        </p>
        <div className="h-1.5 w-32 overflow-hidden rounded-full bg-ink-line/50" role="progressbar" aria-valuenow={Math.round((done / items.length) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`Setup progress: ${done} of ${items.length} steps done`}>
          <div className="h-full rounded-full bg-verdant/70" style={{ width: `${Math.round((done / items.length) * 100)}%` }} />
        </div>
      </div>
      {urgent ? (
        <p className="mt-3 max-w-[62ch] text-[14px] leading-relaxed text-bone-dim">
          Your account is ready. Set your starter rules first: the install
          pull request adds <span className="font-mono text-bone">agentport/</span>{' '}
          and the discovery files your site serves, and those files are
          generated from your answers. It is not a runtime.
        </p>
      ) : null}
      {firstUndone && (done === 0 || urgent) ? (
        <div className="mt-4">
          <Link href={firstUndone.href} className="btn btn-primary px-5 py-2.5">
            Start: {firstUndone.label.toLowerCase()} →
          </Link>
        </div>
      ) : null}
      <ol className="mt-4 space-y-2">
        {items.map((it) => (
          <li key={it.key}>
            <div className="flex items-center justify-between gap-3 text-[14px]">
              <span>
                <span className={it.done ? 'text-bone-faint line-through' : 'text-bone'}>{it.label}</span>
                <span className="block text-[12px] text-bone-faint">{it.body}</span>
              </span>
              {it.done ? (
                <span className="font-mono text-[11px] text-verdant">done</span>
              ) : (
                <Link href={it.href} className="btn shrink-0">Do it</Link>
              )}
            </div>
            {it.key === 'github' && !it.done && nextUndone?.key === 'github' ? (
              <ol className="ml-1 mt-2 space-y-1 border-l border-ink-line pl-3 text-[13px] text-bone-dim">
                <li><span className="font-mono text-bone">1.</span> On GitHub, connect your website&apos;s repo — we never see your password.</li>
                <li><span className="font-mono text-bone">2.</span> We open a pull request your team reviews like any other change.</li>
                <li><span className="font-mono text-bone">3.</span> You merge; your normal CI/CD deploys it. Merge is not live by itself.</li>
              </ol>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  )
}

/**
 * The emergency stop as an overview row: visible without hunting, quiet
 * unless engaged. Full control lives on Limits; this row only reports and
 * links. Nothing published yet renders nothing at all — a stop button with
 * nothing to stop would be decoration.
 */
export async function KillSwitchRow() {
  const tenant = await resolveRequestTenant()
  if (tenant.active.status !== 'active') return null
  const live = getLive(tenant.active.tenantId)
  if (!live) return null
  if (!live.emergencyKillSwitch) {
    return (
      <div className="panel flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-[13px] text-bone-dim">
          Running normally under published version {live.version}.
        </p>
        <Link href="/policies" className="font-mono text-[11px] text-bone-faint hover:text-bone">
          emergency stop →
        </Link>
      </div>
    )
  }
  return (
    <div className="panel space-y-2 border-rust/50 bg-rust/10 p-5" role="alert">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-rust">
        Stopped — nothing new runs
      </p>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-bone-dim">
          You stopped everything. Looking still works; running does not.
        </p>
        <Link href="/policies" className="btn btn-danger">Review the stop</Link>
      </div>
    </div>
  )
}


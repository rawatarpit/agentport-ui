import Link from 'next/link'
import { Badge } from '@/components/stat'
import { getCounts, getDraft, getLive, getMerchant, resolveTenant } from '@/lib/store'

/** True when the GitHub App credentials exist — the only thing code cannot invent. */
export function githubConnected(): boolean {
  return (
    (process.env.GITHUB_APP_ID ?? '').trim().length > 0 &&
    (process.env.GITHUB_APP_PRIVATE_KEY ?? '').trim().length > 0
  )
}

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
  const rows = getCounts(resolveTenant())

  if (rows.length === 0) {
    return (
      <div className="panel space-y-2 p-6">
        <p className="label">Activity</p>
        <p className="text-[14px] leading-relaxed text-bone-dim">
          Nothing recorded yet — this reads <span className="text-bone">unknown</span>,
          not zero. Numbers appear here once your site starts reporting.
        </p>
        <Link href="/connect" className="btn mt-2">Connect your site</Link>
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
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink">
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
 * Getting started, computed — never a static list. Each row checks real
 * state and links to the screen that finishes it. The account row reads the
 * signed-in session first (real users) and the demo record second; drafts
 * and publishes read the store. When everything is done the whole card
 * returns null — a finished onboarding disappears instead of nagging. An
 * owner opening the dashboard on day one sees exactly what is left, in order.
 */
export async function GettingStarted() {
  const tenantId = resolveTenant()
  const merchant = getMerchant(tenantId)
  const setup = getDraft(tenantId, 'setup')
  const rules = getDraft(tenantId, 'rules') ?? getDraft(tenantId, 'capabilities')
  const live = getLive(tenantId)
  const github = githubConnected()

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
    { done: account.done, label: 'Create your account', body: account.body, href: '/connect' },
    { done: !!setup, label: 'Answer four questions', body: 'Plain language in, typed policy out, saved as a draft.', href: '/setup' },
    { done: !!rules, label: 'Set capabilities and limits', body: 'What agents see, what waits for you, what is always no.', href: '/rules' },
    { done: github, label: 'Connect GitHub', body: github ? 'App installed — open the connect screen to pick the repo.' : 'Install the App on the website repo so the runtime can move in.', href: '/connect' },
    { done: !!live, label: 'Publish your first version', body: 'Review the summary, publish, watch your site pick it up.', href: '/rules' },
  ]
  const done = items.filter((i) => i.done).length
  if (done === items.length) return null
  return (
    <div className="panel p-5">
      <div className="flex items-baseline justify-between">
        <p className="label">Getting started — {done} of {items.length}</p>
        <div className="h-1.5 w-32 overflow-hidden rounded-full bg-ink">
          <div className="h-full rounded-full bg-verdant/70" style={{ width: `${Math.round((done / items.length) * 100)}%` }} />
        </div>
      </div>
      <ol className="mt-4 space-y-2">
        {items.map((it) => (
          <li key={it.label} className="flex items-center justify-between gap-3 text-[14px]">
            <span>
              <span className={it.done ? 'text-bone-faint line-through' : 'text-bone'}>{it.label}</span>
              <span className="block text-[12px] text-bone-faint">{it.body}</span>
            </span>
            {it.done ? (
              <span className="font-mono text-[11px] text-verdant">done</span>
            ) : (
              <Link href={it.href} className="btn shrink-0">Do it</Link>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}

/**
 * The pull request, on the dashboard where the owner watches it.
 *
 * Once the App exists this shows the live PR — branch, CI state, merge
 * state — for your business. Until then it says there is no PR instead of
 * rendering an empty widget as if one were coming. The merge is the
 * signature: nothing here merges, approves, or implies either happened.
 */
export function PullRequestCard() {
  if (!githubConnected()) {
    return (
      <div className="panel flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <p className="label">Pull request</p>
          <p className="mt-1 text-[14px] text-bone-dim">
            No pull request yet — there is nothing to review until GitHub is connected.
          </p>
        </div>
        <Link href="/connect" className="btn btn-primary">Connect GitHub</Link>
      </div>
    )
  }
  return (
    <div className="panel p-5">
      <p className="label">Pull request</p>
      <p className="mt-1 text-[14px] text-bone-dim">
        Connected — open pull requests for your business will appear here with branch, CI, and merge state.
      </p>
    </div>
  )
}

/**
 * The nudge for everybody signed up but not connected.
 *
 * You have an account, the App is not installed, so nothing can reach your
 * site yet — this banner says exactly that and points at the one button
 * that fixes it. Amber-tinted because it is the single most important
 * un-done thing, not because anything is wrong. Disappears the moment the
 * App connects; nagging a connected business would be the boy who cried.
 */
export function GithubNudge() {
  if (githubConnected()) return null
  return (
    <div className="panel space-y-3 border-amber/40 bg-amber/5 p-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-amber">
        One step left — connect GitHub
      </p>
      <p className="max-w-[62ch] text-[14px] leading-relaxed text-bone-dim">
        Your account is ready, but nothing is governed yet — no code of yours
        is touched until you install the App on your website&apos;s repo. It
        takes two clicks, you pick the repo, and your merge is what turns
        everything on.
      </p>
      <div className="flex flex-wrap gap-2">
        <Link href="/connect" className="btn btn-primary">Connect GitHub now</Link>
        <Link href="/setup" className="btn">Answer questions first</Link>
      </div>
    </div>
  )
}

/**
 * GitHub in the owner's language. No OAuth jargon, no scopes lecture: three
 * steps, each saying who acts and what it produces. Shown on the overview
 * until the App is connected — the front door belongs where the owner lands,
 * not buried three clicks deep.
 */
export function GithubHowto() {
  if (githubConnected()) return null
  return (
    <div className="panel space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="label">Connect GitHub — how it works</p>
        <Link href="/connect" className="btn btn-primary">Start connecting</Link>
      </div>
      <ol className="space-y-2 text-[14px] text-bone-dim">
        <li><span className="font-mono text-bone">1. You install our App</span> on your website&apos;s repo — two clicks, you pick the repo, we never see your password.</li>
        <li><span className="font-mono text-bone">2. We open a pull request</span> that adds the governed runtime to your site. Your team reviews it like any other change.</li>
        <li><span className="font-mono text-bone">3. You merge.</span> That merge is your signature — nothing goes live without it, and we can never merge for you.</li>
      </ol>
    </div>
  )
}

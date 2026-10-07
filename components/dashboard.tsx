import Link from 'next/link'
import { Badge } from '@/components/stat'
import { ensureSeeded, ledger } from '@/lib/agentport'
import { getDraft, getLive, getMerchant, resolveTenant } from '@/lib/store'

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
 * KPIs across the top (calls, held, refused, capabilities), a this-week
 * activity bar per capability, the five most recent decisions as a feed,
 * and a getting-started checklist that is computed from real state — each
 * item links to the screen that completes it, and completed items stay
 * checked. A dashboard that opens with prose is a document; this opens
 * with the business.
 */
export async function DashboardKpis() {
  await ensureSeeded()
  const entries = await ledger.list({ limit: 200 })
  const held = entries.filter((e) => e.decision === 'require_approval')
  const denied = entries.filter((e) => e.decision === 'deny')

  const byCap = new Map<string, number>()
  for (const e of entries) byCap.set(e.capability, (byCap.get(e.capability) ?? 0) + 1)
  const caps = [...byCap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  const max = caps[0]?.[1] ?? 1

  const feed = [...entries].slice(-5).reverse()
  const tone = (d: string) => (d === 'allow' ? 'allow' : d === 'deny' ? 'deny' : 'held');

  return (
    <div className="space-y-3">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Agent calls" value={entries.length} sub="recorded, refusals included" />
        <Kpi label="Waiting on you" value={held.length} sub="held, nothing executed" tone="text-amber" link="/approvals" />
        <Kpi label="Refused" value={denied.length} sub="with the rule that fired" tone="text-rust" link="/ledger" />
        <Kpi label="Capabilities live" value={caps.length} sub="on the manifest" link="/capabilities" />
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <div className="panel p-5">
          <div className="flex items-baseline justify-between">
            <p className="label">Calls by capability</p>
            <Link href="/analytics" className="font-mono text-[11px] text-bone-faint hover:text-bone">all analytics →</Link>
          </div>
          <ul className="mt-4 space-y-3">
            {caps.map(([cap, n]) => (
              <li key={cap}>
                <div className="flex items-baseline justify-between text-[13px]">
                  <span className="font-mono text-bone">{cap}</span>
                  <span className="tabular font-mono text-[11px] text-bone-faint">{n}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink">
                  <div className="h-full rounded-full bg-verdant/70" style={{ width: `${Math.max(6, Math.round((n / max) * 100))}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel p-5">
          <div className="flex items-baseline justify-between">
            <p className="label">Latest decisions</p>
            <Link href="/ledger" className="font-mono text-[11px] text-bone-faint hover:text-bone">full ledger →</Link>
          </div>
          <ul className="mt-3 space-y-2">
            {feed.map((e) => (
              <li key={`${e.tenantId}:${e.requestId}`} className="flex items-center justify-between gap-3 border-b border-ink-line/60 py-2 text-[13px] last:border-0">
                <span>
                  <span className="font-mono text-bone">{e.capability}</span>
                  <span className="ml-2 text-bone-faint">{e.agentId}</span>
                </span>
                <Badge tone={tone(e.decision) as 'allow' | 'deny' | 'held'}>{e.decision === 'require_approval' ? 'held' : e.decision}</Badge>
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
 * state (account, website URL, drafts, live publish, GitHub App) and links
 * to the screen that finishes it. An owner opening the dashboard on day one
 * sees exactly what is left, in order.
 */
export async function GettingStarted() {
  const tenantId = resolveTenant()
  const merchant = getMerchant(tenantId)
  const setup = getDraft(tenantId, 'setup')
  const rules = getDraft(tenantId, 'rules') ?? getDraft(tenantId, 'capabilities')
  const live = getLive(tenantId)
  const github = githubConnected()

  const items = [
    { done: !!merchant, label: 'Create your account', body: 'Email + business name — two minutes, no password to hold.', href: '/connect' },
    { done: !!setup, label: 'Answer four questions', body: 'Plain language in, typed policy out, saved as a draft.', href: '/setup' },
    { done: !!rules, label: 'Set capabilities and limits', body: 'What agents see, what waits for you, what is always no.', href: '/rules' },
    { done: github, label: 'Connect GitHub', body: github ? 'App installed — open the connect screen to pick the repo.' : 'Install the App on the website repo so the runtime can move in.', href: '/connect' },
    { done: !!live, label: 'Publish your first version', body: 'Review the summary, publish, watch the digest go live.', href: '/rules' },
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
 * state — for this tenant. Until then it says there is no PR instead of
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
        Connected — open pull requests for this tenant will appear here with branch, CI, and merge state.
      </p>
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

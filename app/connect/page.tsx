import Link from 'next/link'
import { EnforcingPanel } from '@/components/enforcing-panel'

export const dynamic = 'force-dynamic'

/**
 * Phase 3/4 scaffolding that is safe without credentials.
 *
 * Steps 1, 2, 4 need a registered GitHub OAuth App — code is not the
 * blocker, credentials are. This screen states what is connected, what is
 * missing, and what each path produces, without implying any of it works
 * today. A capability saved but not merged is visibly not deployed; a sync
 * that never landed is an explicit unknown, never a stale enabled.
 */
const STEPS = [
  {
    n: '1',
    title: 'Sign in with GitHub',
    body: 'Your identity, and the org that becomes the tenantId the ledger already requires.',
    state: 'missing' as const,
  },
  {
    n: '2',
    title: 'Install the App, pick a repo',
    body: 'Analysis runs in your workflow — names and types only. Never your rows, never your database credentials.',
    state: 'missing' as const,
  },
  {
    n: '3',
    title: 'Answer four questions',
    body: 'Done here, today. Four answers become a typed policy you can review.',
    state: 'done' as const,
    href: '/setup',
  },
  {
    n: '4',
    title: 'Review the pull request — the signature',
    body: 'We open a branch. You merge. Nothing affects a running system without that merge, and we cannot merge into a protected branch.',
    state: 'missing' as const,
  },
  {
    n: '5',
    title: 'Sync — the fast path',
    body: 'Signed payload, distinct credential, replay protection. Never carries the kill switch — enforced by type, not review. Offline keeps enforcing; this screen shows unknown.',
    state: 'missing' as const,
  },
]

export default function ConnectPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="label">Front door</p>
        <h2 className="mt-2 font-display text-3xl text-bone">Connect your store</h2>
        <p className="prose-bone mt-3 max-w-[68ch]">
          Two doors, one artifact. The dashboard is the front door;{' '}
          <span className="font-mono text-bone">agent-port init</span> stays as the
          second door for the shop with no GitHub. Both produce the same committed
          file — the merge is the signature either way.
        </p>
      </div>

      <EnforcingPanel draftLabel="no draft open" />

      <ol className="space-y-3">
        {STEPS.map((s) => (
          <li key={s.n} className="panel flex flex-wrap items-start justify-between gap-3 p-5">
            <div className="max-w-[60ch]">
              <p className="font-mono text-[11px] text-bone-faint">Step {s.n}</p>
              <p className="mt-1 text-[15px] text-bone">{s.title}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-bone-dim">{s.body}</p>
              {s.href ? (
                <Link href={s.href} className="btn mt-3">Open it</Link>
              ) : null}
            </div>
            <span
              className={`inline-block rounded border px-2 py-0.5 font-mono text-[11px] ${
                s.state === 'done' ? 'border-verdant/40 text-verdant' : 'border-ink-line text-bone-faint'
              }`}
            >
              {s.state}
            </span>
          </li>
        ))}
      </ol>

      <div className="panel p-5">
        <p className="label">What never happens here</p>
        <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-bone-dim">
          <li>· This screen never decides, never mints a credential, never approves a held write.</li>
          <li>· <span className="font-mono text-bone">agent-port token</span> stays in the CLI — a session-derived credential cannot tell an employee from an algorithm.</li>
          <li>· Approvals stay in your environment: <span className="font-mono text-bone">agent-port approve</span> records who approved against the frozen request.</li>
        </ul>
      </div>
    </div>
  )
}

'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { EnforcingPanel } from '@/components/enforcing-panel'
import { GithubPanel } from '@/components/github-panel'
import { SignupForm } from '@/components/signup-form'
import { TestEventButton } from '@/components/test-event-button'
import { WebsiteForm } from '@/components/website-form'
import { WebhookPanel } from '@/components/webhook-panel'

type Step = { n: string; title: string; body: string; state: 'missing' | 'done'; href?: string }

/** Callback reasons are machine strings; the banner speaks merchant. */
function githubReasonText(reason: string): string {
  if (reason.startsWith('oauth-')) return `The sign-in step failed (${reason.slice('oauth-'.length)}). Nothing was linked.`
  if (reason === 'missing-installation') return 'GitHub did not report an installation. It may have been cancelled halfway.'
  if (reason === 'oauth-unconfigured') return 'Our side is not ready to receive the sign-in yet.'
  return `Something interrupted the install (${reason}). Nothing was linked.`
}

/**
 * The front door as computed state.
 *
 * Steps come from GET /api/connect, which reports what the store can prove.
 * GitHub steps stay `missing` until real App credentials exist — the screen
 * must not imply otherwise. The signup form completes step 1: an account
 * with us, after which the same list re-renders with step 1 done.
 */
export default function ConnectPage() {
  const [steps, setSteps] = useState<Step[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [showSignup, setShowSignup] = useState(false)
  const [websiteUrl, setWebsiteUrl] = useState<string | null | undefined>(undefined)
  const [githubNotice, setGithubNotice] = useState<string | null>(null)

  // The callback lands back here with ?github=<reason>: installed,
  // oauth-<cause>, or missing-installation. Read once on mount (client-only,
  // so no SSR/Suspense ceremony) and render it as a banner, never a dead end.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('github')
    if (!q) return
    if (q === 'installed') {
      setGithubNotice('__installed__')
    } else {
      setGithubNotice(q)
    }
    window.history.replaceState(null, '', window.location.pathname)
  }, [])

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/connect')
      const body = (await res.json()) as { status: string; steps?: Step[] }
      if (body.status !== 'ok' || !body.steps) throw new Error()
      setSteps(body.steps)
      setFailed(false)
    } catch {
      setFailed(true)
    }
    try {
      const me = await fetch('/api/me')
      const mbody = (await me.json()) as { status: string; merchant?: { websiteUrl?: string | null } }
      setWebsiteUrl(mbody.status === 'ok' ? (mbody.merchant?.websiteUrl ?? null) : null)
    } catch {
      setWebsiteUrl(null)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const step1 = steps?.find((s) => s.n === '1')

  return (
    <div className="space-y-6">
      <div>
        <p className="label">Front door</p>
        <h2 className="mt-2 font-display text-3xl text-bone">Connect your business</h2>
        <p className="prose-bone mt-3 max-w-[68ch]">
          Two doors, one artifact. The dashboard is the front door;{' '}
          <span className="font-mono text-bone">agent-port init</span> stays as the
          second door for the team with no GitHub. Both produce the same committed
          file — the merge is the signature either way.
        </p>
      </div>

      <EnforcingPanel draftLabel="no draft open" />

      {githubNotice === '__installed__' ? (
        <div className="panel border-verdant/40 p-5" role="status">
          <p className="font-mono text-[11px] uppercase tracking-widest text-verdant">GitHub connected</p>
          <p className="mt-2 text-[13px] leading-relaxed text-bone-dim">
            The App is installed. Pick the repositories below and open the install pull request.
          </p>
        </div>
      ) : githubNotice ? (
        <div className="panel border-amber/40 p-5" role="alert">
          <p className="font-mono text-[11px] uppercase tracking-widest text-amber">GitHub needs attention</p>
          <p className="mt-2 text-[13px] leading-relaxed text-bone-dim">
            {githubReasonText(githubNotice)}{' '}
            <a
              href="https://github.com/apps/agentport-installer/installations/new"
              target="_blank"
              rel="noreferrer"
              className="text-bone underline underline-offset-4"
            >
              Try installing again
            </a>
            .
          </p>
        </div>
      ) : null}

      {step1 && step1.state === 'missing' && !showSignup ? (
        <button type="button" className="btn btn-primary" onClick={() => setShowSignup(true)}>
          Create your account — step 1
        </button>
      ) : null}
      {showSignup && (!step1 || step1.state === 'missing') ? (
        <SignupForm
          onDone={() => {
            setShowSignup(false)
            void load()
          }}
        />
      ) : null}

      {step1?.state === 'done' && websiteUrl === null ? (
        <WebsiteForm current={null} onDone={() => void load()} />
      ) : null}
      {step1?.state === 'done' && typeof websiteUrl === 'string' ? (
        <WebsiteForm current={websiteUrl} onDone={() => void load()} />
      ) : null}

      {failed ? (
        <p className="text-[13px] text-rust" role="alert">Could not read connection state.</p>
      ) : !steps ? (
        <p className="text-[13px] text-bone-faint">Reading connection state…</p>
      ) : (
        <ol className="space-y-3">
          {steps.map((s) => (
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
      )}

      <div className="panel p-5">
        <p className="label">What never happens here</p>
        <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-bone-dim">
          <li>· This screen never decides, never mints a credential, never approves a held write.</li>
          <li>· <span className="font-mono text-bone">agent-port token</span> stays in the CLI — a session-derived credential cannot tell an employee from an algorithm.</li>
          <li>· Approvals stay in your environment: <span className="font-mono text-bone">agent-port approve</span> records who approved against the frozen request.</li>
        </ul>
      </div>

      <TestEventButton />

      <GithubPanel />

      <WebhookPanel />
    </div>
  )
}

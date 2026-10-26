'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { EnforcingPanel } from '@/components/enforcing-panel'
import { githubReasonText } from '@/lib/github-reasons'
import { GithubPanel } from '@/components/github-panel'
import { SignupForm } from '@/components/signup-form'
import { WebsiteForm } from '@/components/website-form'
import { WebhookPanel } from '@/components/webhook-panel'

type Step = { n: string; title: string; body: string; state: 'missing' | 'done'; href?: string }

/**
 * The front door as computed state, split in two: onboarding spine first
 * (account → website → GitHub → steps), diagnostics last (test event,
 * delivery status, enforcing state). Diagnostics are honest dev tools, not
 * merchant onboarding — burying them mid-flow taught owners to skip the
 * whole screen, and promoting them taught developers the screen was done.
 */
export default function ConnectPage() {
  const [steps, setSteps] = useState<Step[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [showSignup, setShowSignup] = useState(false)
  const [websiteUrl, setWebsiteUrl] = useState<string | null | undefined>(undefined)
  const [canManage, setCanManage] = useState(false)
  const [githubNotice, setGithubNotice] = useState<string | null>(null)

  // This page remains a deep link and diagnostics surface. GitHub callbacks
  // now land on the dashboard, but old links and failures may still carry
  // ?github=<reason>; render it as a banner, never a dead end.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('github')
    if (!q) return
    if (q === 'installed') {
      setGithubNotice('__installed__')
    } else {
      setGithubNotice(q)
    }
    // Drop only the notice flag; an installation id may still be needed by
    // the panel below and is not authority by itself.
    const url = new URL(window.location.href)
    url.searchParams.delete('github')
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
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
      const mbody = (await me.json()) as {
        status: string
        role?: string
        merchant?: { websiteUrl?: string | null }
      }
      setWebsiteUrl(mbody.status === 'ok' ? (mbody.merchant?.websiteUrl ?? null) : null)
      setCanManage(mbody.status === 'ok' && (mbody.role === 'owner' || mbody.role === 'admin'))
    } catch {
      setWebsiteUrl(null)
      setCanManage(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const step1 = steps?.find((s) => s.n === '1')
  const rulesReady = steps?.find((s) => s.n === '2')?.state === 'done'

  return (
    <div className="space-y-6">
      <div>
        <p className="label">Front door</p>
        <h1 className="mt-2 font-display text-3xl text-bone">Connect your business</h1>
        <p className="prose-bone mt-3 max-w-[68ch]">
          Two doors, one artifact. The dashboard is the front door; the manual
          installer stays as the second door for the team with no GitHub. Both
          produce the same committed package — the merge is the signature either way.
        </p>
      </div>

      <EnforcingPanel draftLabel="no draft open" />

      {githubNotice === '__installed__' ? (
        <div className="panel p-5" role="status">
          <p className="font-mono text-[11px] uppercase tracking-widest text-bone-faint">GitHub returned</p>
          <p className="mt-2 text-[13px] leading-relaxed text-bone-dim">
            The checklist below is authoritative: we verify the installation with
            GitHub before marking it connected. Pick the repositories below only
            after that step turns green.
          </p>
        </div>
      ) : githubNotice ? (
        <div className="panel border-amber/40 p-5" role="alert">
          <p className="font-mono text-[11px] uppercase tracking-widest text-amber">GitHub needs attention</p>
          <p className="mt-2 text-[13px] leading-relaxed text-bone-dim">
            {githubReasonText(githubNotice)}{' '}
            <button
              type="button"
              className="text-bone underline underline-offset-4"
              onClick={() => {
                void (async () => {
                  try {
                    const res = await fetch('/api/github/install', { method: 'POST' })
                    const body = (await res.json()) as { status: string; installUrl?: string }
                    if (body.status !== 'ok' || !body.installUrl) throw new Error()
                    window.location.assign(body.installUrl)
                  } catch {
                    setGithubNotice('install-start')
                  }
                })()
              }}
            >
              Try installing again
            </button>
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

      <GithubPanel
        canManage={canManage}
        prBlockedReason={
          rulesReady ? null : 'Set your starter rules first — the discovery package is generated from them.'
        }
      />

      {failed ? (
        <p className="text-[13px] text-rust" role="alert">Could not read connection state.</p>
      ) : !steps ? (
        <p className="text-[13px] text-bone-faint">Reading connection state…</p>
      ) : (
        <ol className="space-y-3">
          {steps.map((s, i) => {
            const current = s.state === 'missing' && steps.slice(0, i).every((p) => p.state === 'done')
            return (
              <li
                key={s.n}
                className={`panel flex flex-wrap items-start justify-between gap-3 p-5 ${
                  current ? 'border-verdant/40' : ''
                }`}
              >
                <div className="max-w-[60ch]">
                  <p className="font-mono text-[11px] text-bone-faint">
                    Step {s.n}{current ? ' · you are here' : ''}
                  </p>
                  <p className="mt-1 text-[15px] text-bone">{s.title}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-bone-dim">{s.body}</p>
                  {s.href ? (
                    <Link href={s.href} className={current ? 'btn btn-primary mt-3' : 'btn mt-3'} aria-label={`Open ${s.title}`}>Open it</Link>
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
            )
          })}
        </ol>
      )}

      <details className="panel p-5">
        <summary className="cursor-pointer text-[14px] text-bone">
          Diagnostics <span className="ml-2 font-mono text-[11px] text-bone-faint">for developers — not part of setup</span>
        </summary>
        <div className="mt-4 space-y-4">
          <div className="panel p-5">
            <p className="label">What never happens here</p>
            <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-bone-dim">
              <li>· This screen never decides, never mints a credential, never approves a held write.</li>
              <li>· <span className="font-mono text-bone">agent-port token</span> stays in the CLI — a session-derived credential cannot tell an employee from an algorithm.</li>
              <li>· Approvals stay in your environment: <span className="font-mono text-bone">agent-port approve</span> records who approved against the frozen request.</li>
            </ul>
          </div>

          <WebhookPanel />
        </div>
      </details>
    </div>
  )
}

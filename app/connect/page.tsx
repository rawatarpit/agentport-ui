'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { EnforcingPanel } from '@/components/enforcing-panel'
import { SignupForm } from '@/components/signup-form'
import { WebsiteForm } from '@/components/website-form'

type Step = { n: string; title: string; body: string; state: 'missing' | 'done'; href?: string }

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
        <h2 className="mt-2 font-display text-3xl text-bone">Connect your store</h2>
        <p className="prose-bone mt-3 max-w-[68ch]">
          Two doors, one artifact. The dashboard is the front door;{' '}
          <span className="font-mono text-bone">agent-port init</span> stays as the
          second door for the shop with no GitHub. Both produce the same committed
          file — the merge is the signature either way.
        </p>
      </div>

      <EnforcingPanel draftLabel="no draft open" />

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
    </div>
  )
}

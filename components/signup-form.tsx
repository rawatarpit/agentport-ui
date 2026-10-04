'use client'

import { useState } from 'react'

/**
 * Step 1 of the front door: an account with us.
 *
 * Email plus business name, nothing else — no password to hold, no GitHub
 * involved. The business name matters beyond the form: it becomes the typed
 * confirmation at go-live, so spell it the way you will type it later.
 */
export function SignupForm({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('')
  const [business, setBusiness] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, businessName: business }),
      })
      const body = (await res.json()) as { status: string; reason?: string }
      if (body.status !== 'ok') throw new Error(body.reason ?? 'Signup refused.')
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Signup refused.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel space-y-4 p-6">
      <div>
        <p className="label">Step 1 — your account</p>
        <p className="mt-2 text-[13px] leading-relaxed text-bone-dim">
          An account with us, not with GitHub. Sign-in links arrive by email; GitHub
          comes later, for your website repo only.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-[13px] text-bone" htmlFor="signup-email">Email</label>
          <input
            id="signup-email"
            className="mt-2 w-full border border-ink-line bg-transparent px-3 py-2 text-[14px] text-bone outline-none focus:border-verdant"
            value={email}
            inputMode="email"
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@yourshop.in"
          />
        </div>
        <div>
          <label className="block text-[13px] text-bone" htmlFor="signup-business">Business name</label>
          <input
            id="signup-business"
            className="mt-2 w-full border border-ink-line bg-transparent px-3 py-2 text-[14px] text-bone outline-none focus:border-verdant"
            value={business}
            onChange={(e) => setBusiness(e.target.value)}
            placeholder="Example Shoes"
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={submit}>
          {busy ? 'Creating…' : 'Create account'}
        </button>
        {err ? (
          <span className="text-[13px] text-rust" role="alert">{err}</span>
        ) : null}
      </div>
    </div>
  )
}

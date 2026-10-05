'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

/**
 * Signup — email + password + business name. The name rides in
 * `options.data` where the provisioning trigger reads it; the trigger mints
 * the tenant and the first owner atomically, so there is no window where a
 * user exists with no tenant. If confirmation email is on, there is no
 * session yet and the screen says "check your email" instead of navigating
 * anywhere — a new user landing on an empty dashboard reads as broken.
 */
export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [business, setBusiness] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const submit = async () => {
    setBusy(true)
    setErr(null)
    try {
      const supabase = createClient()
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { business_name: business.trim() } },
      })
      if (error) throw new Error(error.message)
      if (!data.session) {
        setSent(true)
        return
      }
      window.location.href = '/onboarding'
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Signup failed.')
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <div className="mx-auto max-w-md space-y-6">
        <p className="label">Check your email</p>
        <h2 className="mt-2 font-display text-3xl text-bone">Confirm to continue</h2>
        <p className="prose-bone">We sent a confirmation link to {email}. Nothing is set up until you click it — an unconfirmed account owns nothing.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <p className="label">Create your account</p>
        <h2 className="mt-2 font-display text-3xl text-bone">Your shop, governed</h2>
      </div>
      <div className="panel space-y-4 p-6">
        <div>
          <label className="block text-[13px] text-bone" htmlFor="su-email">Email</label>
          <input id="su-email" className="mt-2 w-full border border-ink-line bg-transparent px-3 py-2 text-[14px] text-bone outline-none focus:border-verdant" value={email} inputMode="email" onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="block text-[13px] text-bone" htmlFor="su-password">Password</label>
          <input id="su-password" type="password" className="mt-2 w-full border border-ink-line bg-transparent px-3 py-2 text-[14px] text-bone outline-none focus:border-verdant" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div>
          <label className="block text-[13px] text-bone" htmlFor="su-business">Business name</label>
          <input id="su-business" className="mt-2 w-full border border-ink-line bg-transparent px-3 py-2 text-[14px] text-bone outline-none focus:border-verdant" value={business} onChange={(e) => setBusiness(e.target.value)} placeholder="Example Shoes" />
        </div>
        <button type="button" className="btn btn-primary" disabled={busy || !email || !password || !business} onClick={submit}>
          {busy ? 'Creating…' : 'Create account'}
        </button>
        {err ? <p className="text-[13px] text-rust" role="alert">{err}</p> : null}
      </div>
      <p className="text-[13px] text-bone-dim">
        Have an account? <Link className="text-bone underline" href="/login">Sign in</Link>
      </p>
    </div>
  )
}

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { AuthShell, FieldError } from '@/components/auth-shell'

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
      <AuthShell eyebrow="Agent Port · verify" title="Check your email" lede={`We sent a confirmation link to ${email}. Nothing is set up until you click it — an unconfirmed account owns nothing.`} footer={<Link className="text-bone underline underline-offset-4" href="/login">Back to sign in</Link>} >
        <div />
      </AuthShell>
    )
  }

  return (
    <AuthShell
      eyebrow="Agent Port · create account"
      title="Your shop, governed"
      lede="One account, one tenant. Four questions later, agents answer to your policy."
      footer={
        <>Have an account? <Link className="text-bone underline underline-offset-4" href="/login">Sign in</Link></>
      }
    >
      <div>
        <label className="field-label" htmlFor="su-email">Email</label>
        <input id="su-email" className="input" value={email} inputMode="email" autoComplete="email" placeholder="you@yourshop.in" onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label className="field-label" htmlFor="su-password">Password</label>
        <input id="su-password" type="password" className="input" value={password} autoComplete="new-password" placeholder="At least 8 characters" onChange={(e) => setPassword(e.target.value)} />
      </div>
      <div>
        <label className="field-label" htmlFor="su-business">Business name</label>
        <input id="su-business" className="input" value={business} autoComplete="organization" placeholder="Example Shoes" onChange={(e) => setBusiness(e.target.value)} />
      </div>
      <button type="button" className="btn btn-primary w-full py-2.5" disabled={busy || !email || !password || !business} onClick={submit}>
        {busy ? 'Creating…' : 'Create account'}
      </button>
      {err ? <FieldError>{err}</FieldError> : null}
    </AuthShell>
  )
}

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { AuthShell, FieldError } from '@/components/auth-shell'

/** Email + password login. GoTrue holds the password; this form never sees it twice. */
export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const router = useRouter()

  const submit = async () => {
    setBusy(true)
    setErr(null)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) throw new Error(error.message)
      router.push('/onboarding')
      router.refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Sign-in failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      eyebrow="Agent Port · sign in"
      title="Welcome back"
      lede="Your policies, ledger, and approvals are behind this door."
      footer={
        <>
          No account? <Link className="text-bone underline underline-offset-4" href="/signup">Create one</Link>
          {' · '}
          <Link className="text-bone underline underline-offset-4" href="/reset-password">Reset password</Link>
        </>
      }
    >
      <div>
        <label className="field-label" htmlFor="login-email">Email</label>
        <input id="login-email" className="input" value={email} inputMode="email" autoComplete="email" placeholder="you@yourshop.in" onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <label className="field-label" htmlFor="login-password">Password</label>
        <input id="login-password" type="password" className="input" value={password} autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void submit() }} />
      </div>
      <button type="button" className="btn btn-primary w-full py-2.5" disabled={busy || !email || !password} onClick={submit}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
      {err ? <FieldError>{err}</FieldError> : null}
    </AuthShell>
  )
}

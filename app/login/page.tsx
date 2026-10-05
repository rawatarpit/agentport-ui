'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

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
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <p className="label">Sign in</p>
        <h2 className="mt-2 font-display text-3xl text-bone">Welcome back</h2>
      </div>
      <div className="panel space-y-4 p-6">
        <div>
          <label className="block text-[13px] text-bone" htmlFor="login-email">Email</label>
          <input id="login-email" className="mt-2 w-full border border-ink-line bg-transparent px-3 py-2 text-[14px] text-bone outline-none focus:border-verdant" value={email} inputMode="email" onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="block text-[13px] text-bone" htmlFor="login-password">Password</label>
          <input id="login-password" type="password" className="mt-2 w-full border border-ink-line bg-transparent px-3 py-2 text-[14px] text-bone outline-none focus:border-verdant" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void submit() }} />
        </div>
        <button type="button" className="btn btn-primary" disabled={busy || !email || !password} onClick={submit}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        {err ? <p className="text-[13px] text-rust" role="alert">{err}</p> : null}
      </div>
      <p className="text-[13px] text-bone-dim">
        No account? <Link className="text-bone underline" href="/signup">Create one</Link>
        {' · '}
        <Link className="text-bone underline" href="/reset-password">Reset password</Link>
      </p>
    </div>
  )
}

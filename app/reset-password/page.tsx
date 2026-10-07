'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { AuthShell, FieldError } from '@/components/auth-shell'

/** Password reset: request link, then set the new password after the recovery link. */
export default function ResetPasswordPage() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const submit = async () => {
    setBusy(true)
    setErr(null)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=/login`,
      })
      if (error) throw new Error(error.message)
      setSent(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Request failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      eyebrow="Agent Port · recovery"
      title="Get back in"
      lede={sent ? undefined : 'One link, by email. It lands you back at sign in.'}
      footer={<Link className="text-bone underline underline-offset-4" href="/login">Back to sign in</Link>}
    >
      {sent ? (
        <p className="prose-bone text-[14px]">If that address has an account, a recovery link is on its way.</p>
      ) : (
        <>
          <div>
            <label className="field-label" htmlFor="rp-email">Email</label>
            <input id="rp-email" className="input" value={email} inputMode="email" autoComplete="email" placeholder="you@yourshop.in" onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void submit() }} />
          </div>
          <button type="button" className="btn btn-primary w-full py-2.5" disabled={busy || !email} onClick={submit}>
            {busy ? 'Sending…' : 'Send recovery link'}
          </button>
          {err ? <FieldError>{err}</FieldError> : null}
        </>
      )}
    </AuthShell>
  )
}

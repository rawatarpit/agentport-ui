'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

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
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <p className="label">Reset password</p>
        <h2 className="mt-2 font-display text-3xl text-bone">Get back in</h2>
      </div>
      <div className="panel space-y-4 p-6">
        {sent ? (
          <p className="prose-bone">If that address has an account, a recovery link is on its way.</p>
        ) : (
          <>
            <div>
              <label className="block text-[13px] text-bone" htmlFor="rp-email">Email</label>
              <input id="rp-email" className="mt-2 w-full border border-ink-line bg-transparent px-3 py-2 text-[14px] text-bone outline-none focus:border-verdant" value={email} inputMode="email" onChange={(e) => setEmail(e.target.value)} />
            </div>
            <button type="button" className="btn btn-primary" disabled={busy || !email} onClick={submit}>
              {busy ? 'Sending…' : 'Send recovery link'}
            </button>
            {err ? <p className="text-[13px] text-rust" role="alert">{err}</p> : null}
          </>
        )}
      </div>
    </div>
  )
}

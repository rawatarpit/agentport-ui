'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { newPasswordError, passwordUpdateError } from '@/lib/password-recovery'
import { AuthShell, FieldError } from '@/components/auth-shell'

type Mode = 'checking' | 'request' | 'set'

/** Password reset: request link, then set the new password after the recovery link. */
export default function ResetPasswordPage() {
  const [mode, setMode] = useState<Mode>('checking')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('error')) setErr('That recovery link has expired or was already used. Request a new one below.')

    void (async () => {
      try {
        const res = await fetch('/api/auth/session')
        const body = (await res.json()) as { signedIn?: boolean }
        setMode(body.signedIn ? 'set' : 'request')
      } catch {
        setMode('request')
      }
    })()
  }, [])

  const requestLink = async () => {
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch('/api/auth/reset', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const body = (await res.json()) as { status: string; reason?: string }
      if (body.status !== 'ok') throw new Error(body.reason ?? 'Request failed.')
      setSent(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Request failed.')
    } finally {
      setBusy(false)
    }
  }

  const updatePassword = async () => {
    const localError = newPasswordError(password, confirmation)
    if (localError) {
      setErr(localError)
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const body = (await res.json()) as { status: string; reason?: string }
      if (body.status !== 'ok') throw new Error(body.reason ?? 'Could not update the password — try again.')
      router.push('/home')
      router.refresh()
    } catch (e) {
      setErr(passwordUpdateError(e instanceof Error ? e.message : ''))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      eyebrow="Agent Port · recovery"
      title={mode === 'set' ? 'Set a new password' : 'Get back in'}
      lede={mode === 'set' ? 'Your recovery link is valid once. Choose the password you will sign in with.' : sent ? undefined : 'One link, by email. It lands you back here to set a new password.'}
      footer={<Link className="text-bone underline underline-offset-4" href="/login">Back to sign in</Link>}
    >
      {mode === 'checking' ? (
        <p className="prose-bone text-[14px]">Checking your recovery link…</p>
      ) : mode === 'set' ? (
        <>
          <div>
            <label className="field-label" htmlFor="rp-password">New password</label>
            <input id="rp-password" type="password" className="input" value={password} autoComplete="new-password" placeholder="At least 8 characters" onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void updatePassword() }} />
          </div>
          <div>
            <label className="field-label" htmlFor="rp-confirm">Confirm new password</label>
            <input id="rp-confirm" type="password" className="input" value={confirmation} autoComplete="new-password" placeholder="Repeat it" onChange={(e) => setConfirmation(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void updatePassword() }} />
          </div>
          <button type="button" className="btn btn-primary w-full py-2.5" disabled={busy || !password || !confirmation} onClick={updatePassword}>
            {busy ? 'Updating…' : 'Set password'}
          </button>
          {err ? <FieldError>{err}</FieldError> : null}
        </>
      ) : sent ? (
        <p className="prose-bone text-[14px]">If that address has an account, a recovery link is on its way.</p>
      ) : (
        <>
          <div>
            <label className="field-label" htmlFor="rp-email">Email</label>
            <input id="rp-email" className="input" value={email} inputMode="email" autoComplete="email" placeholder="you@yourshop.in" onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void requestLink() }} />
          </div>
          <button type="button" className="btn btn-primary w-full py-2.5" disabled={busy || !email} onClick={requestLink}>
            {busy ? 'Sending…' : 'Send recovery link'}
          </button>
          {err ? <FieldError>{err}</FieldError> : null}
        </>
      )}
    </AuthShell>
  )
}

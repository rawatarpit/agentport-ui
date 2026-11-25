'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { track, getVisitorId } from '@/lib/funnel-events'
import { AuthShell, FieldError } from '@/components/auth-shell'

/**
 * Signup — email + password + business name. The name rides in
 * `options.data` where the provisioning trigger reads it; the trigger mints
 * the tenant and the first owner atomically, so there is no window where a
 * user exists with no tenant. If confirmation email is on, there is no
 * session yet and the screen says "check your email" instead of navigating
 * anywhere — a new user landing on an empty dashboard reads as broken.
 *
 * A report preview's industry, sub-industry, country and website survive signup
 * as setup query parameters: the setup wizard uses industry/sector for tenant
 * metadata, and the assessment step still asks for the website.
 */
export default function SignupPage() {
  const searchParams = useSearchParams() as URLSearchParams
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [business, setBusiness] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  // Track that signup was started.
  useEffect(() => {
    const visitorId = getVisitorId()
    track({ event_type: 'signup_started' }, visitorId ? `signup_started:${visitorId}` : undefined)
  }, [])

  function signupParams(): URLSearchParams {
    const to = new URLSearchParams()
    for (const key of [
      'industry', 'subIndustry', 'country', 'geography', 'companyName',
      'website', 'productsServices', 'businessModel', 'customerSegment',
      'objective', 'setupIndustry', 'setupSector',
    ]) {
      const value = searchParams.get(key)
      if (value) to.set(key, value)
    }
    return to
  }

  const submit = async () => {
    setBusy(true)
    setErr(null)
    try {
      // Track that signup was submitted.
      const visitorId = getVisitorId()
      track({ event_type: 'signup_submitted' }, visitorId ? `signup_submitted:${visitorId}` : undefined)

      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password, businessName: business.trim() }),
      })
      const body = (await res.json()) as { status: string; session?: boolean; reason?: string }
      if (body.status !== 'ok') throw new Error(body.reason ?? 'Signup failed.')
      if (!body.session) {
        setSent(true)
        track({ event_type: 'verification_email_sent' }, visitorId ? `verification_email_sent:${visitorId}` : undefined)
        return
      }
      track({ event_type: 'signup_completed' }, visitorId ? `signup_completed:${visitorId}` : undefined)
      window.location.href = `/setup?${signupParams().toString()}`
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
      lede="One account, one business. Four questions later, agents answer to your policy."
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
        <input id="su-password" type="password" className="input" value={password} autoComplete="new-password" placeholder="At least 12 characters" onChange={(e) => setPassword(e.target.value)} />
      </div>
      <div>
        <label className="field-label" htmlFor="su-business">Business name</label>
          <input id="su-business" className="input" value={business} autoComplete="organization" placeholder="What customers call you" onChange={(e) => setBusiness(e.target.value)} />
      </div>
      <button type="button" className="btn btn-primary w-full py-2.5" disabled={busy || !email || !password || !business} onClick={submit}>
        {busy ? 'Creating…' : 'Create account'}
      </button>
      {err ? <FieldError>{err}</FieldError> : null}
    </AuthShell>
  )
}

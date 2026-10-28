'use client'

import { useState } from 'react'

/**
 * The invite-only pilot form.
 *
 * Four fields and a honeypot. On success the panel is replaced by a plain
 * acknowledgement — no "you're in", no fake onboarding step. It posts to
 * /api/contact, which stores the request and notifies the founder; this
 * component never touches Supabase directly.
 */
type Status = 'idle' | 'busy' | 'done'

const EMPTY = { name: '', email: '', company: '', message: '', website2: '' }

export function ContactForm() {
  const [fields, setFields] = useState(EMPTY)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)

  const update =
    (key: keyof typeof EMPTY) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setFields((f) => ({ ...f, [key]: e.target.value }))
    }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('busy')
    setError(null)
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(fields),
      })
      const body = (await res.json()) as { status: string; reason?: string }
      if (!res.ok || body.status !== 'ok') {
        throw new Error(body.reason ?? 'Could not send your request. Please try again.')
      }
      setFields(EMPTY)
      setStatus('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send your request.')
      setStatus('idle')
    }
  }

  if (status === 'done') {
    return (
      <div className="panel p-6" role="status" aria-live="polite">
        <p className="font-display text-xl text-bone">Request received.</p>
        <p className="mt-2 text-[13px] leading-relaxed text-bone-dim">
          We read every request ourselves and reply within one business day. If
          you added a note, it is with us.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="panel space-y-4 p-6" noValidate>
      {/* Honeypot — hidden from people and assistive tech, filled by bots. */}
      <input
        type="text"
        name="website2"
        value={fields.website2}
        onChange={update('website2')}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="contact-name" className="field-label">
            Name
          </label>
          <input
            id="contact-name"
            className="input"
            value={fields.name}
            onChange={update('name')}
            autoComplete="name"
            required
            maxLength={120}
            placeholder="Your name"
          />
        </div>
        <div>
          <label htmlFor="contact-email" className="field-label">
            Work email
          </label>
          <input
            id="contact-email"
            type="email"
            inputMode="email"
            className="input"
            value={fields.email}
            onChange={update('email')}
            autoComplete="email"
            required
            maxLength={254}
            placeholder="you@company.com"
          />
        </div>
      </div>

      <div>
        <label htmlFor="contact-company" className="field-label">
          Company <span className="font-normal text-bone-faint">(optional)</span>
        </label>
        <input
          id="contact-company"
          className="input"
          value={fields.company}
          onChange={update('company')}
          autoComplete="organization"
          maxLength={200}
          placeholder="Business or site"
        />
      </div>

      <div>
        <label htmlFor="contact-message" className="field-label">
          What do your agents do?{' '}
          <span className="font-normal text-bone-faint">(optional)</span>
        </label>
        <textarea
          id="contact-message"
          className="input min-h-[96px] resize-y"
          value={fields.message}
          onChange={update('message')}
          maxLength={2000}
          rows={3}
          placeholder="Chatbots taking orders, an assistant calling your API, checkout, refunds…"
        />
        <p className="mt-1.5 text-[11px] text-bone-faint">
          Please do not include card numbers, passwords, or API keys.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button type="submit" className="btn btn-primary px-5 py-2.5" disabled={status === 'busy'}>
          {status === 'busy' ? 'Sending…' : 'Request an invite'}
        </button>
        {error ? (
          <span className="text-[13px] text-rust" role="alert">
            {error}
          </span>
        ) : (
          <span className="font-mono text-[11px] text-bone-faint">One reply, no list.</span>
        )}
      </div>
    </form>
  )
}

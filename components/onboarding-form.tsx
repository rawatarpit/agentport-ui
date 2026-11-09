'use client'

import { useEffect, useState } from 'react'

type Form = {
  businessDescription: string
  docsUrl: string
  supportUrl: string
  privacyUrl: string
  termsUrl: string
  connectorUrl: string
}

const EMPTY: Form = {
  businessDescription: '',
  docsUrl: '',
  supportUrl: '',
  privacyUrl: '',
  termsUrl: '',
  connectorUrl: '',
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * Public facts for the discovery package.
 *
 * These values are published by `publish.mjs` into `agentport/config.json`
 * and the generated guide surface. They are not policy and they grant nothing.
 * The connector is deliberately the last field: a guide that points at a
 * connector that is not live is a dead end, so leaving it blank is correct
 * until the hosted MCP/OAuth adapter exists.
 */
export function OnboardingForm() {
  const [form, setForm] = useState<Form>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/drafts/onboarding')
        const body = (await res.json()) as { draft?: Record<string, unknown> | null }
        if (cancelled || body.draft === null || body.draft === undefined) return
        setForm({
          businessDescription: asString(body.draft.businessDescription),
          docsUrl: asString(body.draft.docsUrl),
          supportUrl: asString(body.draft.supportUrl),
          privacyUrl: asString(body.draft.privacyUrl),
          termsUrl: asString(body.draft.termsUrl),
          connectorUrl: asString(body.draft.connectorUrl),
        })
      } catch {
        if (!cancelled) setErr('Could not load your public facts. Refresh and try again.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const update = (field: keyof Form, value: string) => {
    setSaved(false)
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const submit = async () => {
    setBusy(true)
    setErr(null)
    setSaved(false)
    try {
      const res = await fetch('/api/drafts/onboarding', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ payload: form }),
      })
      const body = (await res.json()) as { status?: string; reason?: string; errors?: string[] }
      if (body.status !== 'ok') {
        throw new Error(body.errors?.[0] ?? body.reason ?? 'Refused.')
      }
      setSaved(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Refused.')
    } finally {
      setBusy(false)
    }
  }

  const field = (
    key: keyof Form,
    label: string,
    placeholder: string,
    help: string,
  ) => (
    <label className="block space-y-1.5">
      <span className="label">{label}</span>
      <input
        className="input w-full font-mono text-[12px]"
        value={form[key]}
        inputMode="url"
        placeholder={placeholder}
        onChange={(e) => update(key, e.target.value)}
      />
      <span className="field-help">{help}</span>
    </label>
  )

  return (
    <div className="panel space-y-4 p-5 sm:p-6">
      <p className="text-[13px] leading-relaxed text-bone-dim">
        Agents read these facts from your discovery files. They are public.
        Never put a token, client secret, merchant API key, or connector
        credential here — the draft API refuses it by shape.
      </p>

      <label className="block space-y-1.5">
        <span className="label">What the business does</span>
        <textarea
          className="input min-h-20 w-full text-[13px]"
          value={form.businessDescription}
          maxLength={280}
          placeholder="One or two sentences an agent can quote."
          onChange={(e) => update('businessDescription', e.target.value)}
        />
        <span className="field-help">{form.businessDescription.length}/280 characters.</span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        {field('docsUrl', 'Docs URL', 'https://docs.example', 'Where an agent reads how to use you.')}
        {field('supportUrl', 'Support URL', 'https://example.com/support', 'Where a human gets help.')}
        {field('privacyUrl', 'Privacy URL', 'https://example.com/privacy', 'What data you keep and why.')}
        {field('termsUrl', 'Terms URL', 'https://example.com/terms', 'The terms an integration accepts.')}
      </div>

      {field(
        'connectorUrl',
        'Hosted connector URL',
        'https://connector.example/mcp',
        'Only a live hosted MCP/OAuth connector. Leave blank until it exists; a guide without one is not generated.',
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary" disabled={busy || loading} onClick={submit}>
          {busy ? 'Saving…' : saved ? 'Saved' : 'Save public facts'}
        </button>
        {saved ? <span className="text-[12px] text-bone-faint">Saved. Re-open the install PR to publish them.</span> : null}
      </div>
      {err ? (
        <p className="text-[13px] text-rust" role="alert">{err}</p>
      ) : null}
    </div>
  )
}

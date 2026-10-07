'use client'

import { useEffect, useMemo, useState } from 'react'

/**
 * Setup: four questions, then one line.
 *
 * The person who needs a policy change is often a non-technical operator, so
 * the wizard exists to end. Every question is answerable without a technical term, and the output is a
 * single copyable command rather than a file to edit — a merchant who cannot get
 * from this screen to a running runtime has not been onboarded, however good the
 * rest of the console looks.
 *
 * Amounts are collected in major units and converted to minor units here, once,
 * in one place. The SDK renamed `amount` to `minor` because `amount: 100_000,
 * currency: 'INR'` reads as one lakh rupees while the engine compares 90,000
 * *paise* — both round numbers, 100x apart. A UI that collected "₹100,000" into
 * an `amount` field would reintroduce exactly that bug one layer up.
 */

type Answers = {
  ceiling: string
  hardCeiling: string
  alwaysAsk: boolean
  forbidden: boolean
}

const DEFAULT_ANSWERS: Answers = {
  ceiling: '250',
  hardCeiling: '1000',
  alwaysAsk: true,
  forbidden: true,
}

const STEPS = [
  {
    key: 'ceiling' as const,
    question: 'Above what order value should we ask you first?',
    help: 'Anything below this runs on its own. Above it, nothing happens until you approve it.',
    placeholder: '250',
  },
  {
    key: 'hardCeiling' as const,
    question: 'And above what value should we always say no?',
    help: 'This is the line we never cross, even if an agent asks nicely. Nothing is held for you here — it is simply refused.',
    placeholder: '1000',
  },
]

export function SetupWizard() {
  const [a, setA] = useState<Answers>(DEFAULT_ANSWERS)
  const [step, setStep] = useState(0)
  const [copied, setCopied] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState(false)

  const minor = useMemo(() => {
    const toMinor = (v: string): number | null => {
      const n = Number(v)
      return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null
    }
    return { ceiling: toMinor(a.ceiling), hard: toMinor(a.hardCeiling) }
  }, [a.ceiling, a.hardCeiling])

  /**
   * The validation that matters is the ordering, not the syntax. A hard ceiling
   * below the approval threshold means the approval threshold can never be
   * reached: every order above the hard ceiling is refused before a human is
   * ever asked. That is a coherent policy, but almost never the one meant, and
   * the merchant would discover it from a refused order rather than from here.
   */
  const hardTooLow =
    minor.ceiling !== null && minor.hard !== null && minor.hard <= minor.ceiling

  const generated = useMemo(() => {
    if (minor.ceiling === null || minor.hard === null) return null
    const lines = [
      `export default {`,
      `  policy: {`,
      `    // Above this, a human is asked.`,
      `    maxOrderValue: { minor: ${minor.ceiling}, currency: 'INR' },`,
      `    // Above this, refused outright. Never held.`,
      `    absoluteMaxOrderValue: { minor: ${minor.hard}, currency: 'INR' },`,
    ]
    if (a.alwaysAsk) {
      lines.push(`    // These wait for a person, whatever the amount.`)
      lines.push(`    alwaysRequireApproval: ['createOrder'],`)
    }
    if (a.forbidden) {
      lines.push(`    // Refunds are never available to external agents.`)
      lines.push(`    forbiddenCapabilities: ['requestRefund'],`)
    }
    lines.push(`    // The ceilings live on the policy, which every capability shares.`)
    lines.push(`    // A read that carries no order must not be refused for having no amount.`)
    lines.push(`    ceilingExempt: ['searchProducts', 'checkInventory'],`)
    lines.push(`  },`)
      lines.push(`} as const`)
    return lines.join('\n')
  }, [minor, a.alwaysAsk, a.forbidden])

  const ready = generated !== null && !hardTooLow

  // Answers persist as the setup draft (minor units at the edge, like rules).
  useEffect(() => {
    let live = true
    fetch('/api/drafts/setup')
      .then((r) => r.json())
      .then(
        (body: {
          draft?: { ceilingMinor?: number; hardCeilingMinor?: number; alwaysAsk?: boolean; forbidRefunds?: boolean } | null
        }) => {
          if (!live || !body.draft) return
          const v = body.draft
          setA({
            ceiling: typeof v.ceilingMinor === 'number' ? String(v.ceilingMinor / 100) : DEFAULT_ANSWERS.ceiling,
            hardCeiling: typeof v.hardCeilingMinor === 'number' ? String(v.hardCeilingMinor / 100) : DEFAULT_ANSWERS.hardCeiling,
            alwaysAsk: typeof v.alwaysAsk === 'boolean' ? v.alwaysAsk : DEFAULT_ANSWERS.alwaysAsk,
            forbidden: typeof v.forbidRefunds === 'boolean' ? v.forbidRefunds : DEFAULT_ANSWERS.forbidden,
          })
          setSavedAt('loaded')
        },
      )
      .catch(() => {
        if (live) setLoadError(true)
      })
    return () => {
      live = false
    }
  }, [])

  const save = async () => {
    if (minor.ceiling === null || minor.hard === null) return
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch('/api/drafts/setup', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          payload: { ceilingMinor: minor.ceiling, hardCeilingMinor: minor.hard, alwaysAsk: a.alwaysAsk, forbidRefunds: a.forbidden },
        }),
      })
      const body = (await res.json()) as { status: string; reason?: string; errors?: string[]; updatedAt?: string }
      if (body.status !== 'ok') throw new Error(body.errors?.[0] ?? body.reason ?? 'Save refused.')
      setSavedAt(body.updatedAt ?? 'saved')
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save refused.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <ol className="flex flex-wrap gap-2" aria-label="Progress">
        {([...STEPS.map((s) => s.key), 'approval', 'forbidden'] as string[]).map(
          (k, i) => (
            <li key={k}>
              <span
                className={`inline-block rounded px-2 py-0.5 font-mono text-[11px] ${
                  i <= step
                    ? 'border border-verdant/40 text-verdant'
                    : 'border border-ink-line text-bone-faint'
                }`}
              >
                {i + 1}
              </span>
            </li>
          ),
        )}
      </ol>

      {step < STEPS.length && (
        <div className="panel p-6">
          <h3 className="font-display text-2xl text-bone">{STEPS[step]!.question}</h3>
          <p className="mt-2 text-[13px] leading-relaxed text-bone-dim">{STEPS[step]!.help}</p>
          <div className="mt-4 flex items-center gap-3">
            <span className="font-display text-2xl text-bone-faint">₹</span>
            <input
              className="w-40 border border-ink-line bg-transparent px-3 py-2 font-display text-2xl text-bone outline-none focus:border-verdant"
              value={a[STEPS[step]!.key]}
              inputMode="decimal"
              placeholder={STEPS[step]!.placeholder}
              onChange={(e) => setA({ ...a, [STEPS[step]!.key]: e.target.value })}
              aria-label={STEPS[step]!.question}
            />
          </div>
        </div>
      )}

      {step === 1 && hardTooLow && (
        <div className="panel border-rust/40 p-5" role="alert">
          <p className="font-mono text-[11px] uppercase tracking-widest text-rust">That can never be reached</p>
          <p className="mt-2 text-[13px] leading-relaxed text-bone-dim">
            Your always-say-no line is at or below your ask-me-first line, so every order
            above it is refused before you are ever asked. You would find out from a
            refused order rather than from here.
          </p>
        </div>
      )}

      {step === 2 && (
        <div className="panel p-6">
          <h3 className="font-display text-2xl text-bone">Should any action always wait for you?</h3>
          <p className="mt-2 text-[13px] leading-relaxed text-bone-dim">
            Pick the actions that should never run unattended, whatever the amount. An
            action an agent wanted but policy would not authorise on its own.
          </p>
          <label className="mt-5 flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-1"
              checked={a.alwaysAsk}
              onChange={(e) => setA({ ...a, alwaysAsk: e.target.checked })}
            />
            <span>
              <span className="text-[14px] text-bone">Always ask before placing an order</span>
              <span className="mt-1 block text-[12px] text-bone-faint">
                Held for you, even a small one.
              </span>
            </span>
          </label>
        </div>
      )}

      {step === 3 && (
        <div className="panel p-6">
          <h3 className="font-display text-2xl text-bone">Is there anything no agent may ever do?</h3>
          <p className="mt-2 text-[13px] leading-relaxed text-bone-dim">
            A refusal is permanent and specific. It is better than an approval nobody is
            around to give.
          </p>
          <label className="mt-5 flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-1"
              checked={a.forbidden}
              onChange={(e) => setA({ ...a, forbidden: e.target.checked })}
            />
            <span>
              <span className="text-[14px] text-bone">Never let an agent issue a refund</span>
              <span className="mt-1 block text-[12px] text-bone-faint">
                Refused outright, with a reason the agent can read and act on.
              </span>
            </span>
          </label>
        </div>
      )}

      {step >= STEPS.length + 2 && (
        <div className="space-y-4">
          <div className="panel p-6">
            <h3 className="font-display text-2xl text-bone">Your policy</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-bone-dim">
              This is the whole thing. It saves as a draft and does nothing until it is
              merged into your project — a saved change is not a live one.
            </p>
            <pre className="mt-4 overflow-x-auto border border-ink-line bg-ink/40 p-4 font-mono text-[12px] leading-relaxed text-bone-dim">
              {generated}
            </pre>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!ready || saving}
                onClick={save}
              >
                {saving ? 'Saving…' : savedAt ? 'Saved as draft' : 'Save answers as draft'}
              </button>
              <button
                type="button"
                className="btn"
                disabled={!ready}
                onClick={async () => {
                  await navigator.clipboard.writeText(generated ?? '')
                  setCopied(true)
                }}
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
              {saveError ? (
                <span className="text-[13px] text-rust" role="alert">{saveError}</span>
              ) : null}
              {loadError ? (
                <span className="text-[12px] text-rust" role="alert">Saved answers would not load — starting fresh. Saving still works.</span>
              ) : null}
              {!ready && (
                <span className="font-mono text-[11px] text-rust">
                  Answer the first two questions to finish.
                </span>
              )}
            </div>
          </div>

          <div className="panel p-6">
            <p className="label">Next</p>
            <ol className="mt-3 space-y-2 text-[13px] leading-relaxed text-bone-dim">
              <li>1. Save this into your project as <span className="font-mono text-bone">agentport.config.ts</span>.</li>
              <li>2. Mint a credential: <span className="font-mono text-bone">npx agent-port token</span>.</li>
              <li>3. Run it: <span className="font-mono text-bone">npx agent-port serve</span>.</li>
            </ol>
            <p className="mt-4 text-[12px] leading-relaxed text-bone-faint">
              Steps 1 and 3 happen in your project, not here. This console reads your
              runtime; it does not run it.
            </p>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          className="btn"
          onClick={() => setStep(Math.max(0, step - 1))}
          disabled={step === 0}
        >
          Back
        </button>
        {step < STEPS.length + 2 && (
          <button type="button" className="btn btn-primary" onClick={() => setStep(step + 1)}>
            Next
          </button>
        )}
      </div>
    </div>
  )
}
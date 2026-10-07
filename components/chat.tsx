'use client'

import { useState } from 'react'

/**
 * The governed conversion surface.
 *
 * This is the half of the thesis that is about money coming in: a customer
 * talks to an assistant, and the assistant is subject to the same policy as
 * every other agent. Reads answer immediately. Anything that writes is held
 * for a human. Anything forbidden is refused with a reason the customer can be
 * shown, not an error they have to guess at.
 *
 * The calls below go to the real /.well-known/agent/invoke route, so what you
 * see here is the enforcement path, not a simulation of it.
 */

type Role = 'customer' | 'assistant' | 'system'

interface Turn {
  id: number
  role: Role
  text: string
  tone?: 'ok' | 'held' | 'denied'
  wire?: { capability: string; status: number; reason?: string; rule?: string }
}

const SCRIPT: Array<{ match: RegExp; capability?: string; input?: unknown; reply: string }> = [
  {
    match: /boot|size|stock|available|inventory/i,
    capability: 'checkInventory',
    input: { sku: 'EX-140' },
    reply: 'The Chelsea Boot (EX-140) is in stock — 6 left. Want me to hold a pair?',
  },
  {
    match: /buy|order|purchase|checkout/i,
    capability: 'createOrder',
    input: { items: [{ sku: 'EX-140', quantity: 1 }], amountMinor: 18_500 },
    reply: 'I can put that together.',
  },
  {
    match: /refund|return|money back/i,
    capability: 'requestRefund',
    input: { orderId: 'ord_1042' },
    reply: 'Let me look at that refund.',
  },
]

let seq = 0

export function StorefrontChat() {
  const [turns, setTurns] = useState<Turn[]>([
    {
      id: seq++,
      role: 'assistant',
      text: 'Ask me about the catalogue, or tell me what you want to order. I can read stock freely. Anything that spends money goes to a human first.',
    },
  ])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  async function send() {
    const text = draft.trim()
    if (!text || busy) return
    setDraft('')
    setBusy(true)
    setTurns((t) => [...t, { id: seq++, role: 'customer', text }])

    const step = SCRIPT.find((s) => s.match.test(text))
    if (!step) {
      setTurns((t) => [
        ...t,
        { id: seq++, role: 'assistant', text: 'I can check stock and prepare an order. I cannot issue refunds — that is refused at the policy layer.' },
      ])
      setBusy(false)
      return
    }

    try {
      const res = await fetch('/.well-known/agent/invoke', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer storefront-chat',
        },
        body: JSON.stringify({ capability: step.capability, input: step.input }),
      })
      const body = await res.json()

      if (res.status === 200) {
        setTurns((t) => [
          ...t,
          {
            id: seq++,
            role: 'assistant',
            text: step.reply,
            tone: 'ok',
            wire: { capability: step.capability!, status: res.status },
          },
        ])
      } else if (res.status === 202) {
        setTurns((t) => [
          ...t,
          {
            id: seq++,
            role: 'assistant',
            text: 'Your order is ready but I am not allowed to complete it myself. A human at the shop has to approve it — it is waiting on them now, and nothing has been charged.',
            tone: 'held',
            wire: { capability: step.capability!, status: res.status, reason: body.reason },
          },
        ])
      } else {
        setTurns((t) => [
          ...t,
          {
            id: seq++,
            role: 'assistant',
            text: `I cannot do that. The shop has forbidden agents from calling ${step.capability}, so I am refusing rather than guessing. You will need to email a human.`,
            tone: 'denied',
            wire: {
              capability: step.capability!,
              status: res.status,
              reason: body.reason,
              rule: 'forbidden_capabilities',
            },
          },
        ])
      }
    } catch {
      setTurns((t) => [
        ...t,
        { id: seq++, role: 'system', text: 'Could not reach the agent endpoint. Nothing was attempted.' },
      ])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="panel flex min-h-[460px] flex-col p-5">
        <p className="label">Governed demo — storefront</p>

        <div className="mt-4 flex-1 space-y-4">
          {turns.map((t) => (
            <div key={t.id} className="space-y-1">
              <p
                className={`text-[14px] leading-relaxed ${
                  t.role === 'customer'
                    ? 'text-bone'
                    : t.tone === 'denied'
                      ? 'text-rust'
                      : t.tone === 'held'
                        ? 'text-amber'
                        : t.role === 'system'
                          ? 'text-bone-faint'
                          : 'text-bone-dim'
                }`}
              >
                {t.text}
              </p>
              {t.wire ? (
                <p className="font-mono text-[11px] text-bone-faint">
                  POST {t.wire.capability} → {t.wire.status}
                  {t.wire.reason ? ` · ${t.wire.reason}` : ''}
                  {t.wire.rule ? ` · ${t.wire.rule}` : ''}
                </p>
              ) : null}
            </div>
          ))}
          {busy ? <p className="font-mono text-[11px] text-bone-faint">calling…</p> : null}
        </div>

        <div className="mt-5 flex gap-2 border-t border-ink-line pt-4">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void send()
            }}
            placeholder="Do you have the Chelsea Boot in stock?"
            className="min-w-0 flex-1 rounded-md border border-ink-line bg-ink px-3 py-2 text-[14px] text-bone outline-none placeholder:text-bone-faint focus:border-verdant"
          />
          <button className="btn btn-primary" onClick={() => void send()} disabled={busy} type="button">
            Send
          </button>
        </div>
      </div>

      <aside className="space-y-4">
        <div className="panel p-5">
          <p className="label">Try</p>
          <ul className="mt-3 space-y-2 text-[13px] text-bone-dim">
            <li>Do you have the Chelsea Boot in stock?</li>
            <li>I want to buy one</li>
            <li>I need a refund for order 1042</li>
          </ul>
        </div>
        <div className="panel p-5">
          <p className="label">Why the order did not complete</p>
          <p className="mt-2 text-[13px] leading-relaxed text-bone-dim">
            <code className="font-mono text-bone">createOrder</code> is a write, and
            every write this business exposes requires human approval. The assistant
            gets 202 and a held request. The customer is told the truth rather than
            shown a fake success.
          </p>
          <p className="mt-3 text-[13px] leading-relaxed text-bone-dim">
            An assistant that quietly completes a purchase it was not authorised to
            complete is worse than one that refuses. The refusal is the product.
          </p>
        </div>
      </aside>
    </div>
  )
}

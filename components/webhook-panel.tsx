'use client'

import { useEffect, useState } from 'react'

/**
 * Where your site's updates go — and whether any have arrived.
 *
 * Shows the delivery address your site reports to, whether its access key
 * exists yet, and what has actually arrived. Three deliberate absences: keys
 * are created with us, not here; the detailed setup lives with your
 * developer; and no rows ever travel — counts only. A green light this
 * panel cannot prove would be worse than none, so every row states plainly
 * what is known.
 */
export function WebhookPanel() {
  const [endpoint, setEndpoint] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    fetch('/api/backend')
      .then((r) => r.json())
      .then((body: { status: string; ingestEndpoint?: string | null }) => {
        if (live) setEndpoint(body.status === 'ok' ? (body.ingestEndpoint ?? null) : null)
      })
      .catch(() => {
        if (live) setEndpoint(null)
      })
    return () => {
      live = false
    }
  }, [])

  return (
    <div className="panel space-y-4 p-6">
      <p className="label">Delivery status</p>
      <dl className="space-y-2 text-[13px]">
        <div className="flex flex-wrap justify-between gap-3 border-b border-ink-line/60 py-2">
          <dt className="text-bone-faint">Where your site reports to</dt>
          <dd className="font-mono text-[12px] text-bone">{endpoint ?? 'Not set up yet'}</dd>
        </div>
        <div className="flex flex-wrap justify-between gap-3 border-b border-ink-line/60 py-2">
          <dt className="text-bone-faint">Site access key</dt>
          <dd className="font-mono text-[12px] text-bone-faint">not created yet — we make one together at setup</dd>
        </div>
        <div className="flex flex-wrap justify-between gap-3 border-b border-ink-line/60 py-2">
          <dt className="text-bone-faint">Updates received</dt>
          <dd className="font-mono text-[12px] text-bone-faint">none yet</dd>
        </div>
      </dl>
      <p className="text-[12px] leading-relaxed text-bone-faint">
        Your site sends us short summaries — never customer details, never
        amounts. We never hold a password into your systems.
      </p>
    </div>
  )
}

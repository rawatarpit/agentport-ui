'use client'

import { useEffect, useState } from 'react'

/**
 * TASKS.md 6.4 — the log stream, as far as it honestly goes.
 *
 * Shows the ingest endpoint the merchant configures their webhook against,
 * whether a push key exists for them, and what has actually been delivered.
 * Three deliberate absences: no key provisioning here (B2 needs an
 * operator), no projection DDL yet (B4), and no rows — counts and digests
 * only, per the custody boundary. A green light this panel cannot prove
 * would be a spoofed green, so every row states its source.
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
      <p className="label">Log stream — webhook</p>
      <dl className="space-y-2 text-[13px]">
        <div className="flex flex-wrap justify-between gap-3 border-b border-ink-line/60 py-2">
          <dt className="text-bone-faint">Ingest endpoint</dt>
          <dd className="font-mono text-[12px] text-bone">{endpoint ?? 'Supabase URL not configured'}</dd>
        </div>
        <div className="flex flex-wrap justify-between gap-3 border-b border-ink-line/60 py-2">
          <dt className="text-bone-faint">Push key</dt>
          <dd className="font-mono text-[12px] text-bone-faint">not provisioned — needs an operator (B2)</dd>
        </div>
        <div className="flex flex-wrap justify-between gap-3 border-b border-ink-line/60 py-2">
          <dt className="text-bone-faint">Deliveries received</dt>
          <dd className="font-mono text-[12px] text-bone-faint">none yet — receiver blocked on the SQL wrapper (B1)</dd>
        </div>
      </dl>
      <p className="text-[12px] leading-relaxed text-bone-faint">
        Their side pushes to an address they chose; we never hold a credential into
        their database. The SDK fires it — a database trigger would put our endpoint
        inside their commit path.
      </p>
    </div>
  )
}

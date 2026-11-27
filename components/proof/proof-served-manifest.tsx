'use client'

import { useState } from 'react'
import { DiscoveryCheck, type CheckResult } from '@/components/discovery-check'
import { StatusPill } from '@/components/ui/status-pill'
import { compareAppliedAndServed, servedProofFromCheckResult, type AppliedProof } from '@/lib/proof-state'

const TONE = {
  unknown: 'unknown',
  'not-comparable': 'unknown',
  different: 'blocked',
  same: 'live',
} as const

/**
 * The served-manifest result stays in this client boundary. It is a live fetch
 * observation, not a stored approval or a durable proof row. The applied value
 * passed in is the version only — never the stored policy body.
 */
export function ProofServedManifest({
  applied,
  canonicalUrl,
  invokeUrl,
  expectedTenantId,
}: {
  applied: AppliedProof
  canonicalUrl: string | null
  invokeUrl: string | null
  expectedTenantId: string
}) {
  const [result, setResult] = useState<CheckResult | null>(null)
  const served = servedProofFromCheckResult(result, expectedTenantId)
  const comparison = compareAppliedAndServed(applied, served)

  return (
    <section className="panel space-y-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="label">Served manifest</p>
          <h2 className="mt-2 font-display text-[20px] leading-tight text-bone">
            What the governor answered for this workspace
          </h2>
        </div>
        <StatusPill tone={TONE[comparison.kind]}>
          {comparison.kind === 'same'
            ? 'version label matches'
            : comparison.kind === 'different'
              ? 'does not match'
              : comparison.kind === 'not-comparable'
                ? 'not comparable'
                : 'unknown'}
        </StatusPill>
      </div>

      <p className="max-w-[85ch] text-[13px] leading-relaxed text-bone-dim">{comparison.reason}</p>
      <p className="font-mono text-[11px] leading-relaxed text-bone-faint">
        A manifest answer is advisory. It does not execute a capability, approve a hold, or write a ledger row.
      </p>

      {served.status === 'ok' ? (
        <dl className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-ink-line p-3">
            <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-bone-faint">Served version</dt>
            <dd className="mt-1 break-all text-[13px] text-bone">{served.version ?? 'unknown'}</dd>
          </div>
          <div className="rounded-lg border border-ink-line p-3">
            <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-bone-faint">Capabilities</dt>
            <dd className="mt-1 text-[13px] text-bone">
              {served.capabilityCount === null ? 'unknown' : served.capabilityCount}
            </dd>
          </div>
          <div className="rounded-lg border border-ink-line p-3">
            <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-bone-faint">Generated</dt>
            <dd className="mt-1 break-all text-[13px] text-bone">{served.generatedAt ?? 'unknown'}</dd>
          </div>
        </dl>
      ) : null}

      <DiscoveryCheck
        canonicalUrl={canonicalUrl}
        invokeUrl={invokeUrl}
        onResult={setResult}
      />
    </section>
  )
}

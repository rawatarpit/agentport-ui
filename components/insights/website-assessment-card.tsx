'use client'

import Link from 'next/link'
import { useEffect, useState, type FormEvent } from 'react'
import { track, getVisitorId } from '@/lib/funnel-events'
import { Callout } from '@/components/ui/callout'
import { Chip, type ChipTone } from '@/components/ui/chip'
import { EmptyState } from '@/components/ui/empty-state'
import { Section } from '@/components/ui/section'
import type { FileProbe, FindingStatus, ReadinessAssessment, WebsiteEvidence } from '@/lib/intelligence/readiness'

/**
 * Public-surface assessment. It shows what a bounded scan observed, and never
 * promotes a discovery file or a structured-data signal into proof that a
 * capability executes. The scan runs in the server route; this component only
 * renders the returned evidence and derived findings.
 */

type AssessmentResponse = {
  status?: string
  reason?: string
  evidence?: WebsiteEvidence
  assessment?: ReadinessAssessment
}

function isEvidence(value: unknown): value is WebsiteEvidence {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<WebsiteEvidence>
  return typeof row.url === 'string' && typeof row.fetchedAt === 'string' && Boolean(row.probes) && Boolean(row.html)
}

function isAssessment(value: unknown): value is ReadinessAssessment {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<ReadinessAssessment>
  return Array.isArray(row.dimensions) && 'overall' in row && 'note' in row
}

const PROBE_LABELS: Array<[keyof WebsiteEvidence['probes'], string]> = [
  ['agentJson', '/.well-known/agent.json'],
  ['llmsTxt', '/llms.txt'],
  ['llmsFullTxt', '/llms-full.txt'],
  ['robotsTxt', '/robots.txt'],
  ['sitemapXml', '/sitemap.xml'],
  ['openApi', '/openapi.json'],
]

// Scan findings describe observations, not deployment state. They stay in the
// Chip vocabulary so a fetched file can never be coloured as a live status.
const OBSERVATION_LABEL: Record<FindingStatus, string> = {
  pass: 'observed',
  partial: 'partial',
  fail: 'not observed',
  unknown: 'not observed',
}

const OBSERVATION_TONE: Record<FindingStatus, ChipTone> = {
  pass: 'good',
  partial: 'warn',
  fail: 'bad',
  unknown: 'neutral',
}

function probeLabel(probe: FileProbe): string {
  if (probe.status === null) return 'not observed'
  if (probe.status === 404) return 'not found'
  return `HTTP ${probe.status}`
}

function probeTone(probe: FileProbe): ChipTone {
  if (probe.status === null) return 'neutral'
  if (probe.status >= 200 && probe.status < 300) return 'good'
  if (probe.status === 404) return 'bad'
  return 'warn'
}

export function WebsiteAssessmentCard({ website }: { website: string | null }) {
  const [url, setUrl] = useState(website ?? '')
  const [evidence, setEvidence] = useState<WebsiteEvidence | null>(null)
  const [assessment, setAssessment] = useState<ReadinessAssessment | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  // The profile is read on the server and can arrive after this client mounts.
  // Keeping the old input or an old result would show a different site's scan.
  useEffect(() => {
    setUrl(website ?? '')
    setEvidence(null)
    setAssessment(null)
    setError(null)
  }, [website])

  const run = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const target = url.trim()
    if (!target) return
    setRunning(true)
    setError(null)
    setEvidence(null)
    setAssessment(null)

    // Track that an assessment was started.
    const visitorId = getVisitorId()
    track({ event_type: 'assessment_started' }, visitorId ? `assessment_started:${visitorId}` : undefined)

    try {
      const response = await fetch('/api/assessment/website', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: target }),
      })
      const body = (await response.json()) as AssessmentResponse
      if (!response.ok || body.status === 'error') {
        setError(body.reason ?? 'The scan could not be completed. Nothing was inferred from the failed request.')
        return
      }
      if (!isEvidence(body.evidence) || !isAssessment(body.assessment)) {
        setError('The scan returned an unrecognised result. No score is shown for it.')
        return
      }
      setEvidence(body.evidence)
      setAssessment(body.assessment)

      // Track that an assessment completed successfully.
      track({ event_type: 'assessment_completed' }, visitorId ? `assessment_completed:${visitorId}` : undefined)
    } catch {
      setError('The scan could not be reached. Try again; no result was invented.')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-6">
      {!website ? (
        <EmptyState
          title="Add a website in assessment to run a scan"
          body={
            <>
              No website is recorded for this workspace yet. Enter its public address below, or set the site
              address in <Link href="/go-live#site" className="text-bone underline">go live</Link> to reuse it
              everywhere.
            </>
          }
        />
      ) : null}

      <form onSubmit={run} className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <label htmlFor="assessment-url" className="field-label">
            Website to scan
          </label>
          <input
            id="assessment-url"
            type="url"
            inputMode="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://your-site.example"
            className="input"
          />
          <p className="mt-1 text-[11px] text-bone-faint">
            Public https address only. No login, no forms, no private networks.
          </p>
        </div>
        <button type="submit" className="btn btn-primary shrink-0" disabled={running || url.trim().length === 0}>
          {running ? 'Scanning…' : 'Scan public surface'}
        </button>
      </form>

      {error ? (
        <Callout tone="warning" title="Scan did not produce a result">
          {error}
        </Callout>
      ) : null}

      <Callout tone="info" title="What this scan proves">
        This is a public-surface scan, not proof of live capability. A file you can fetch is evidence of
        discoverability only; authorisation, execution and the ledger are decided by the hosted governor.
        The result stays in this browser session only — it is not a durable row, so reloading requires a
        new scan. No dashboard claim is stored from it.
      </Callout>

      {evidence ? (
        <Section
          title="Observed public evidence"
          description={`Fetched ${evidence.fetchedAt}. Only public responses and page-structure signals are recorded.`}
        >
          <div className="panel space-y-4 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone={evidence.reachable ? 'good' : 'bad'}>
                {evidence.reachable ? 'reachable' : 'not reached'}
              </Chip>
              <Chip tone={evidence.https ? 'good' : 'bad'}>{evidence.https ? 'https' : 'not https'}</Chip>
              <Chip>HTTP {evidence.status ?? 'unknown'}</Chip>
              <Chip tone={evidence.headers.hsts ? 'good' : 'neutral'}>HSTS {evidence.headers.hsts ? 'yes' : 'no'}</Chip>
              <Chip tone={evidence.headers.csp ? 'good' : 'neutral'}>CSP {evidence.headers.csp ? 'yes' : 'no'}</Chip>
            </div>
            <p className="break-all font-mono text-[11px] text-bone-faint">{evidence.url}</p>
            {evidence.note ? <p className="text-[13px] leading-relaxed text-bone-dim">{evidence.note}</p> : null}
            <div>
              <p className="label">Probed files</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {PROBE_LABELS.map(([key, label]) => {
                  const probe = evidence.probes[key]
                  return (
                    <li key={key}>
                      <Chip tone={probeTone(probe)}>
                        {label}: {probeLabel(probe)}
                      </Chip>
                    </li>
                  )
                })}
              </ul>
            </div>
            <div>
              <p className="label">Page signals</p>
              <p className="mt-1 text-[12px] leading-relaxed text-bone-dim">
                title {evidence.html.title ?? 'unknown'} · meta description {evidence.html.metaDescription ? 'yes' : 'not observed'} ·{' '}
                {evidence.html.jsonLdBlocks} JSON-LD block(s) · schema types{' '}
                {evidence.html.schemaTypes.length > 0 ? evidence.html.schemaTypes.join(', ') : 'none observed'} ·{' '}
                {evidence.html.priceSignals} price signal(s) · {evidence.html.productLinks} product link(s)
              </p>
            </div>
          </div>
        </Section>
      ) : null}

      {assessment ? (
        <Section
          title="Readiness dimensions"
          description="Six separate findings. A missing signal is unknown, not a failing zero; no dimension is collapsed into a live-status claim."
        >
          <div className="panel flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <p className="label">Mean of observed dimensions — not a compatibility score</p>
              <p className="mt-1 font-display text-[26px] font-semibold leading-none text-bone">
                {assessment.overall === null ? 'unknown' : assessment.overall}
              </p>
            </div>
            <p className="max-w-[46ch] text-[12px] leading-relaxed text-bone-dim">{assessment.note}</p>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {assessment.dimensions.map((dimension) => (
              <div key={dimension.id} className="panel p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-display text-[16px] font-semibold text-bone">{dimension.label}</h3>
                  <div className="flex items-center gap-2">
                    <span className="tabular font-mono text-[13px] text-bone">
                      {dimension.score === null ? 'unknown' : `${dimension.score}/100`}
                    </span>
                    <Chip tone={OBSERVATION_TONE[dimension.status]}>
                      {OBSERVATION_LABEL[dimension.status]}
                    </Chip>
                  </div>
                </div>
                <ul className="mt-3 space-y-3">
                  {dimension.findings.map((finding) => (
                    <li key={finding.id} className="border-t border-ink-line pt-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[13px] text-bone">{finding.label}</p>
                        <Chip tone={OBSERVATION_TONE[finding.status]}>
                          {OBSERVATION_LABEL[finding.status]}
                        </Chip>
                      </div>
                      <p className="mt-1 text-[12px] leading-relaxed text-bone-dim">{finding.evidence}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  )
}

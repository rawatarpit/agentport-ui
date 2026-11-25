'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { track } from '@/lib/funnel-events'
import { Callout } from '@/components/ui/callout'
import type { ReportSection, ResearchReport } from '@/lib/intelligence/types'
import { setupIndustryValue, setupSectorValue } from '@/lib/intelligence/sectors'
import { Chart } from './chart'
import { FindingList } from './finding-list'
import { MetricCard } from './metric-card'
import { OpportunityList } from './opportunity-list'
import { ProfileSummary } from './profile-summary'
import { ProvenancePanel } from './provenance-panel'
import { SourceList } from './source-list'

function SectionView({ section, report }: { section: ReportSection; report: ResearchReport }) {
  const labelFor = (id: string | null) => report.sources.find((source) => source.id === id)?.label ?? null

  return (
    <section
      id={`section-${section.id}`}
      aria-labelledby={`heading-${section.id}`}
      className="scroll-mt-24 space-y-4 border-t border-ink-line pt-8"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`heading-${section.id}`} className="font-display text-[22px] leading-tight text-bone">
          {section.title}
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-bone-faint">{section.id}</span>
      </div>
      <p className="prose-bone max-w-[80ch]">{section.summary}</p>

      <FindingList findings={section.findings} sources={report.sources} />

      {section.metrics.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {section.metrics.map((metric) => (
            <MetricCard
              key={metric.key}
              metric={metric}
              sourceLabel={labelFor(metric.sourceId) ?? labelFor(section.sourceIds[0] ?? null)}
            />
          ))}
        </div>
      ) : null}

      {section.charts.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {section.charts.map((chart) => (
            <Chart
              key={chart.id}
              chart={chart}
              sourceLabel={labelFor(chart.sourceId) ?? labelFor(section.sourceIds[0] ?? null)}
            />
          ))}
        </div>
      ) : null}

      {section.id === 'opportunity-map' ? (
        <OpportunityList opportunities={report.opportunities} method={report.rankingMethod} />
      ) : null}

      {section.id === 'sources' ? <SourceList sources={report.sources} /> : null}
    </section>
  )
}

/**
 * The same renderer handles an unresearched profile and an explicitly flagged
 * sample. Only `report.dataMode` changes what appears — never a silent fallback
 * to illustrative numbers.
 */
export function ReportView({
  report,
  sampleLabel = 'FICTIONAL SAMPLE',
}: {
  report: ResearchReport
  sampleLabel?: string
}) {
  const isSample = report.dataMode === 'illustrative'

  // Track report generation on mount. Sample reports are not tracked as real
  // intelligence events.
  useEffect(() => {
    if (!isSample) {
      track({ event_type: 'report_generated' })
    }
  }, [isSample])

  const params = new URLSearchParams()
  params.set('industry', report.profile.industry ?? '')
  params.set('subIndustry', report.profile.subIndustry ?? '')
  params.set('country', report.profile.country ?? '')
  params.set('geography', report.profile.geography ?? '')
  params.set('companyName', report.profile.companyName ?? '')
  params.set('website', report.profile.website ?? '')
  params.set('productsServices', report.profile.productsServices ?? '')
  params.set('businessModel', report.profile.businessModel ?? '')
  params.set('customerSegment', report.profile.customerSegment ?? '')
  params.set('objective', report.profile.objectives.join(', '))
  if (!isSample) {
    params.set('setupIndustry', setupIndustryValue(report.profile.industry, report.profile.subIndustry))
    params.set('setupSector', setupSectorValue(report.profile.industry, report.profile.subIndustry))
  }
  const signupHref = isSample ? '/signup' : `/signup?${params.toString()}`

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <p className="label">Industry intelligence preview</p>
        <h1 className="text-balance font-display text-[clamp(2rem,4vw,3rem)] leading-[1.05] tracking-[-0.02em] text-bone">
          {report.profile.industry || 'Your industry'}, as understood from your answers
        </h1>
      </header>

      {isSample ? (
        <div role="alert" className="rounded-xl border-2 border-amber/60 bg-amber/10 p-5 sm:p-6">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-amber">
            {sampleLabel}
          </p>
          <h2 className="mt-2 font-display text-[24px] leading-tight text-bone">
            Every figure on this page is invented.
          </h2>
          <p className="mt-2 max-w-[80ch] text-[13px] leading-relaxed text-bone-dim">{report.honestyNote}</p>
          <p className="mt-2 max-w-[80ch] font-mono text-[11px] leading-relaxed text-bone-faint">
            Use this only to review the layout. It is not research about a real industry or company.
          </p>
        </div>
      ) : (
        <Callout tone="warning" title="Unresearched preview">
          <p>{report.honestyNote}</p>
          <p className="mt-2">
            Market figures render as unknown and charts show that no dated series exists. The opportunity
            map is a discussion aid derived from your answers, not measured demand.
          </p>
        </Callout>
      )}

      <ProfileSummary profile={report.profile} />
      <ProvenancePanel />

      <nav aria-label="Report sections" className="panel p-4 sm:p-5">
        <p className="label">On this page</p>
        <ol className="mt-3 grid gap-x-8 gap-y-1.5 font-mono text-[11.5px] sm:grid-cols-2 lg:grid-cols-3">
          {report.sections.map((section, index) => (
            <li key={section.id}>
              <a href={`#section-${section.id}`} className="link">
                {String(index + 1).padStart(2, '0')} · {section.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="space-y-12">
        {report.sections.map((section) => (
          <SectionView key={section.id} section={section} report={report} />
        ))}
      </div>

      <section className="rounded-xl border border-verdant/30 bg-verdant/[0.05] p-5 sm:p-7">
        <p className="label">Next step</p>
        <h2 className="mt-2 font-display text-[24px] leading-tight text-bone">
          {isSample ? 'Create an account for your own assessment' : 'Continue to account + setup'}
        </h2>
        <p className="mt-2 max-w-[75ch] text-[13px] leading-relaxed text-bone-dim">
          {isSample
            ? 'These sample values are not your data. This preview does not save anything, and the link opens plain signup. After signup, enter your own website in the assessment.'
            : 'This public preview does not write to your account. Your answers carry forward on the signup link; after signup, setup maps them to the reviewed tenant fields and saves the full answers as your first tenant-scoped report snapshot. Your website is not set from the link — enter it yourself in assessment or Go live. Nothing is claimed live by saving a report.'}
        </p>
        <Link href={signupHref} className="btn btn-primary mt-5">
          {isSample ? 'Create an account' : 'Continue to account + setup'}
        </Link>
      </section>
    </div>
  )
}

'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { track } from '@/lib/funnel-events'
import { Callout } from '@/components/ui/callout'
import type { ReportSection, ResearchReport, ResearchChart } from '@/lib/intelligence/types'
import { setupIndustryValue, setupSectorValue } from '@/lib/intelligence/sectors'
import { Chart } from './chart'
import { FindingList } from './finding-list'
import { MetricCard } from './metric-card'
import { OpportunityList } from './opportunity-list'
import { OperateLinks } from './operate-links'
import { ProfileSummary } from './profile-summary'
import { ProvenancePanel } from './provenance-panel'
import { SourceList } from './source-list'
import { IntelligenceStateStrip } from './state-strip'
import { WorkflowList } from './workflow-list'
import { REPORT_GROUPS, sectionsForGroup } from './report-groups'
import { EngineStatusPanel } from './engine-status-panel'
import { ExperienceBoundary } from './experience-boundary'
import { VisualisationCoverage } from './visualisation-coverage'

function hasRenderablePoints(chart: ResearchChart): boolean {
  return chart.points.some((point) => point.value !== null)
}

/** Read-only links for the public preview. Saved snapshots receive none. */
export type ReportPreviewActions = {
  editHref: string
  reportHref: string
  dashboardHref: string
  dashboardLabel: string
  installHref: string
}

function SectionView({ section, report }: { section: ReportSection; report: ResearchReport }) {
  const labelFor = (id: string | null) => report.sources.find((source) => source.id === id)?.label ?? null
  const charts = section.charts.filter(hasRenderablePoints)

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

      {charts.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {charts.map((chart) => (
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
  previewActions,
  trackGenerated = false,
}: {
  report: ResearchReport
  sampleLabel?: string
  previewActions?: ReportPreviewActions
  trackGenerated?: boolean
}) {
  const isSample = report.dataMode === 'illustrative'

  // Only the surface that actually builds a report emits this event. Reopening
  // a durable snapshot is a read, not a fresh generation.
  useEffect(() => {
    if (trackGenerated && !isSample) {
      track({ event_type: 'report_generated' })
    }
  }, [isSample, trackGenerated])

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
        <IntelligenceStateStrip state={report.dataMode} />
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
      ) : report.dataMode === 'unresearched' ? (
        <Callout tone="warning" title="Unresearched preview">
          <p>{report.honestyNote}</p>
          <p className="mt-2">
            No intelligence engine is connected for this preview. Market figures render as unknown and charts
            show that no dated series exists. The opportunity map is a discussion aid derived from your
            answers, not measured demand.
          </p>
        </Callout>
      ) : (
        <Callout tone="info" title="Sourced preview">
          <p>{report.honestyNote}</p>
        </Callout>
      )}

      <EngineStatusPanel state="not_configured" />
      <ExperienceBoundary />

      {previewActions ? (
        <nav aria-label="Report actions" className="panel p-4 sm:p-5">
          <p className="label">Report actions</p>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[11.5px]">
            <Link href={previewActions.editHref} className="link">
              Edit answers
            </Link>
            <Link href={previewActions.reportHref} className="link">
              Revisit this report
            </Link>
            <Link href={previewActions.dashboardHref} className="link">
              {previewActions.dashboardLabel}
            </Link>
            <Link href={previewActions.installHref} className="link">
              Continue to installation
            </Link>
          </div>
          <p className="mt-3 max-w-[85ch] text-[12px] leading-relaxed text-bone-dim">
            This public preview uses your answers and, where available, public sources. It is not an
            installation: no repository is selected, no GitHub permission is granted, and nothing is
            published, enabled, approved, or executed. Revisiting re-reads the public sources; a saved
            snapshot in your workspace stays unchanged.
          </p>
        </nav>
      ) : null}

      <VisualisationCoverage report={report} />

      <ProfileSummary profile={report.profile} />
      <ProvenancePanel />

      <OperateLinks />

      <nav aria-label="Report sections" className="panel p-4 sm:p-5">
        <p className="label">On this page</p>
        <div className="mt-3 space-y-3">
          {REPORT_GROUPS.map((group, groupIndex) => {
            const sections = sectionsForGroup(report.sections, group)
            if (sections.length === 0) return null
            return (
              <div key={group.id}>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-bone-faint">
                  {String(groupIndex + 1).padStart(2, '0')} · {group.label}
                </p>
                <ol className="mt-1 grid gap-x-8 gap-y-1 font-mono text-[11.5px] sm:grid-cols-2 lg:grid-cols-3">
                  {sections.map((section) => (
                    <li key={section.id}>
                      <a href={`#section-${section.id}`} className="link">
                        {section.title}
                      </a>
                    </li>
                  ))}
                </ol>
              </div>
            )
          })}
        </div>
      </nav>

      <div className="space-y-12">
        {REPORT_GROUPS.map((group) => {
          const sections = sectionsForGroup(report.sections, group)
          if (sections.length === 0) return null
          return (
            <section key={group.id} aria-label={group.label} className="space-y-8">
              <div className="border-t border-ink-line pt-8">
                <p className="label">Report group</p>
                <h2 className="mt-2 font-display text-[28px] leading-tight text-bone">{group.label}</h2>
              </div>
              {sections.map((section) => (
                <SectionView key={section.id} section={section} report={report} />
              ))}
              {group.id === 'agent-opportunity-map' ? (
                <section className="scroll-mt-24 space-y-4 border-t border-ink-line pt-8">
                  <h3 className="font-display text-[22px] leading-tight text-bone">Workflow templates</h3>
                  <p className="prose-bone max-w-[80ch]">
                    Interpretation-only templates derived from the profile. They are not live capabilities, not enabled, and not executable from this report.
                  </p>
                  <WorkflowList workflows={report.workflows} />
                </section>
              ) : null}
            </section>
          )
        })}
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

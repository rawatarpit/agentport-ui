import type { Provenance, ResearchReport, ResearchChart } from './types'

export type VisualisationStatus = 'unknown' | 'sourced' | 'illustrative'

export type VisualisationCoverageSlot = {
  id: string
  title: string
  question: string
  evidenceRequired: string
  status: VisualisationStatus
  detail: string
  sourceLabel: string | null
}

/**
 * These are UI evidence slots, not API fields or stored metrics. An engine may
 * later satisfy one by returning a dated series with the matching id; until
 * then the slot stays unknown. Keeping the ids here avoids inventing report
 * fields the server does not own.
 */
const SLOTS = [
  {
    id: 'consumer-ai-platform-usage',
    title: 'Consumer AI assistant usage by platform',
    question: 'Which assistants do consumers in this market use for product research?',
    evidenceRequired:
      'Dated platform-use series with geography, sample size, methodology and confidence.',
  },
  {
    id: 'ai-vs-search-discovery',
    title: 'AI-assisted discovery versus traditional search',
    question: 'How does AI-assisted product discovery compare with conventional search?',
    evidenceRequired: 'Dated comparison series from a survey or observed dataset with a stated denominator.',
  },
  {
    id: 'ai-usage-demographics-geography',
    title: 'AI usage by demographic and geography',
    question: 'Which age, income and regional groups use AI differently?',
    evidenceRequired: 'Segmented dated data with geography, sample size and credible category definitions.',
  },
  {
    id: 'competitor-chatbot-adoption',
    title: 'Chatbot adoption across competitors',
    question: 'Which competitors have observable customer-facing chatbots?',
    evidenceRequired:
      'Named competitor set, observation date, detection method and source URL for each detected chatbot.',
  },
  {
    id: 'competitor-agent-adoption',
    title: 'AI agent adoption across competitors',
    question: 'Which competitors expose agent-interactable systems or services?',
    evidenceRequired:
      'Named competitor set, observation date, public documentation or observed capability, and scope limits.',
  },
  {
    id: 'agentic-commerce-readiness-by-segment',
    title: 'Agentic commerce readiness by business segment',
    question: 'How prepared are different business segments for external agent interaction?',
    evidenceRequired:
      'Segment definitions, dated readiness observations, and a source for each observed capability.',
  },
  {
    id: 'industry-trends-over-time',
    title: 'Industry trends over time',
    question: 'How is AI adoption and discovery behaviour changing in this industry?',
    evidenceRequired: 'At least two dated observations with comparable method, source and coverage.',
  },
  {
    id: 'merchant-vs-industry-benchmark',
    title: 'Individual merchant versus industry benchmark',
    question: 'How does this merchant compare with its industry?',
    evidenceRequired:
      'A verified merchant measurement, a comparable peer cohort, and a source for the benchmark window.',
  },
] as const

const SOURCED_PROVENANCES: Provenance[] = ['verified', 'reported', 'derived', 'forecast']

function allCharts(report: ResearchReport): ResearchChart[] {
  return report.sections.flatMap((section) => section.charts)
}

function hasDatedPoints(chart: ResearchChart): boolean {
  return (
    chart.points.length > 0 &&
    chart.points.every((point) => point.label.trim().length > 0) &&
    chart.points.some((point) => point.value !== null && Number.isFinite(point.value))
  )
}

function sourcedChart(report: ResearchReport, id: string): ResearchChart | null {
  const chart = allCharts(report).find((entry) => entry.id === id)
  if (!chart || !hasDatedPoints(chart)) return null
  if (!SOURCED_PROVENANCES.includes(chart.provenance)) return null
  if (!chart.sourceId) return null
  return report.sources.some((source) => source.id === chart.sourceId) ? chart : null
}

function labelFor(report: ResearchReport, sourceId: string | null): string | null {
  if (!sourceId) return null
  return report.sources.find((source) => source.id === sourceId)?.label ?? null
}

/**
 * Derive coverage only from the report passed in. A stored snapshot describes
 * itself; it never triggers a live engine read or a second research path.
 */
export function visualisationCoverage(report: ResearchReport): VisualisationCoverageSlot[] {
  return SLOTS.map((slot) => {
    const chart = sourcedChart(report, slot.id)
    if (chart) {
      return {
        ...slot,
        status: 'sourced',
        detail: 'A dated series is attached. Read the source, date and stated limits before acting.',
        sourceLabel: labelFor(report, chart.sourceId),
      }
    }

    if (report.dataMode === 'illustrative') {
      return {
        ...slot,
        status: 'illustrative',
        detail: 'Illustrative layout only. No sourced series backs this view.',
        sourceLabel: null,
      }
    }

    return {
      ...slot,
      status: 'unknown',
      detail: 'No dated sourced series is connected for this view. No value is inferred.',
      sourceLabel: null,
    }
  })
}

import type {
  Metric,
  Provenance,
  ResearchChart,
  ResearchReport,
  ResearchSource,
} from '@/lib/intelligence/types'

export const FIVE_LENS_LABELS = [
  'AI ecosystem',
  'Consumer behaviour',
  'Market signals',
  'Geographic intelligence',
  'Business implications',
] as const

export const FIVE_LENSES = FIVE_LENS_LABELS

export type FiveLensLabel = (typeof FIVE_LENS_LABELS)[number]
export type FiveLensStatus = 'unknown' | 'sourced'
export type FiveLensCoverageValue = 'unknown' | 'source-backed'

export type FiveLensCoverageSlot = {
  id: string
  label: FiveLensLabel
  title: FiveLensLabel
  status: FiveLensStatus
  coverage: FiveLensCoverageValue
  sourceBacked: boolean
  sourceId: string | null
  sourceLabel: string | null
  sourceUrl: string | null
  reportedAt: string | null
  geography: string | null
  definition: string
  limitations: string
}

export type FiveLensCoverageRow = {
  key?: string | null
  id?: string | null
  label?: string | null
  title?: string | null
  value?: number | null
  points?: ReadonlyArray<{ label?: string | null; value?: number | null }>
  provenance?: Provenance | null
  sourceId?: string | null
  sourceIds?: ReadonlyArray<string | null> | null
  period?: string | null
  sectionId?: string | null
  sectionTitle?: string | null
}

export type FiveLensCoverageInput =
  | ResearchReport
  | ReadonlyArray<FiveLensCoverageRow>
  | { rows: ReadonlyArray<FiveLensCoverageRow>; sources?: ReadonlyArray<ResearchSource> }

type LensMeta = {
  id: string
  definition: string
  limitations: string
  patterns: ReadonlyArray<RegExp>
}

const SOURCE_BACKED_PROVENANCES: ReadonlySet<Provenance> = new Set<Provenance>([
  'verified',
  'reported',
  'derived',
  'forecast',
])

const LENSES: Record<FiveLensLabel, LensMeta> = {
  'AI ecosystem': {
    id: 'ai-ecosystem',
    definition:
      'Named assistants, protocols, platforms and service providers that could interact with a business. Crawler activity and autonomous agent interactions are recorded separately and never treated as human demand.',
    limitations:
      'A crawler request is not assistant usage. An autonomous agent interaction is not a completed transaction. Neither proves that a capability is live or enabled.',
    patterns: [
      /\bai[- ]?ecosystem\b/i,
      /\bagent[- ]?ecosystem\b/i,
      /\becosystem\b/i,
      /\bassistant[- ]?(?:platform|provider)s?\b/i,
      /\bcrawler\b/i,
      /\bautonomous[- ]?agent\b/i,
      /\bagent[- ]?compatibility\b/i,
      /\bgithub\b/i,
    ],
  },
  'Consumer behaviour': {
    id: 'consumer-behaviour',
    definition:
      'How people research, compare and choose with assistants. Assistant usage and AI-referred traffic are distinct observations with distinct denominators.',
    limitations:
      'Profile answers and crawler activity are not consumer behaviour. A sourced row must state its geography, period and sample basis before it can describe people.',
    patterns: [
      /\bconsumer\b/i,
      /\bbehavio(?:u)?r\b/i,
      /\bassistant[- ]?usage\b/i,
      /\bshopping\b/i,
      /\bdiscovery\b/i,
      /\bsearch[- ]?demand\b/i,
    ],
  },
  'Market signals': {
    id: 'market-signals',
    definition:
      'Dated, source-backed demand, supply and competitive observations. AI-referred traffic is a signal only when its referral definition and reporting window are stated.',
    limitations:
      'AI-referred traffic is not AI search visibility measurement. Repository counts, filing counts and macroeconomic rows are not market size, growth or share.',
    patterns: [
      /\bmarket\b/i,
      /\bdemand\b/i,
      /\bgrowth\b/i,
      /\b(?:share|competitor|revenue|pricing)\b/i,
      /\bai[- ]?referred\b/i,
      /\breferral\b/i,
    ],
  },
  'Geographic intelligence': {
    id: 'geographic-intelligence',
    definition:
      'The geography a source actually queried, with its reporting period and local definitions, rather than the geography a visitor entered.',
    limitations:
      'A country field in a submitted profile is not geographic evidence. One region or one metro is not a national market, and gaps stay unknown.',
    patterns: [
      /\bgeograph/i,
      /\bgeo(?:graphy|graphic)?\b/i,
      /\bregion(?:al)?\b/i,
      /\bcountry\b/i,
      /\bmetro\b/i,
      /\blocation\b/i,
    ],
  },
  'Business implications': {
    id: 'business-implications',
    definition:
      'What a sourced observation could mean for operations, with read and write effects kept apart. Transactions are counted only from sourced completion records.',
    limitations:
      'Assistant usage, crawler activity and autonomous agent interactions are not transactions. Interpretations and profile scores are discussion aids, not measured outcomes.',
    patterns: [
      /\bbusiness\b/i,
      /\bimplications?\b/i,
      /\bopportunit/i,
      /\bagentic\b/i,
      /\bworkflow\b/i,
      /\bcapabilit/i,
      /\border\b/i,
      /\btransaction\b/i,
      /\bconversion\b/i,
    ],
  },
}

function isReport(input: FiveLensCoverageInput): input is ResearchReport {
  return !Array.isArray(input) && 'sections' in input
}

function isRowCollection(
  input: FiveLensCoverageInput,
): input is { rows: ReadonlyArray<FiveLensCoverageRow>; sources?: ReadonlyArray<ResearchSource> } {
  return !Array.isArray(input) && 'rows' in input
}

function reportRows(report: ResearchReport): FiveLensCoverageRow[] {
  return report.sections.flatMap((section) => {
    const metrics: FiveLensCoverageRow[] = section.metrics.map((metric: Metric) => ({
      ...metric,
      sectionId: section.id,
      sectionTitle: section.title,
    }))
    const charts: FiveLensCoverageRow[] = section.charts.map((chart: ResearchChart) => ({
      ...chart,
      label: chart.title,
      value: null,
      points: chart.points,
      sourceId: chart.sourceId,
      period: null,
      sectionId: section.id,
      sectionTitle: section.title,
    }))
    return [...metrics, ...charts]
  })
}

function rowValue(row: FiveLensCoverageRow): number | null {
  if (typeof row.value === 'number') {
    return Number.isFinite(row.value) ? row.value : null
  }
  const point = row.points?.find(
    (candidate) => typeof candidate.value === 'number' && Number.isFinite(candidate.value),
  )
  return typeof point?.value === 'number' ? point.value : null
}

function rowSourceId(row: FiveLensCoverageRow): string | null {
  if (typeof row.sourceId === 'string' && row.sourceId.trim().length > 0) return row.sourceId
  for (const sourceId of row.sourceIds ?? []) {
    if (typeof sourceId === 'string' && sourceId.trim().length > 0) return sourceId
  }
  return null
}

function resolveSource(
  row: FiveLensCoverageRow,
  sources: ReadonlyArray<ResearchSource>,
): ResearchSource | null {
  const sourceId = rowSourceId(row)
  if (!sourceId) return null
  const source = sources.find((entry) => entry.id === sourceId)
  if (!source || source.kind === 'sample') return null
  return source
}

function isSourceBacked(row: FiveLensCoverageRow): boolean {
  return (
    row.provenance !== null &&
    row.provenance !== undefined &&
    SOURCE_BACKED_PROVENANCES.has(row.provenance) &&
    rowValue(row) !== null
  )
}

function rowText(row: FiveLensCoverageRow): string {
  return [row.key, row.id, row.label, row.title, row.sectionId, row.sectionTitle]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
}

function lensForRow(row: FiveLensCoverageRow): FiveLensLabel | null {
  const text = rowText(row)
  if (text.length === 0) return null
  for (const label of FIVE_LENS_LABELS) {
    if (LENSES[label].patterns.some((pattern) => pattern.test(text))) return label
  }
  return null
}

/**
 * Derive lens coverage from the report or row array passed in. Nothing is
 * fetched, inferred from profile answers, or carried over from another run.
 * A lens stays unknown unless a row explicitly carries a value, a source-backed
 * provenance, and a resolvable non-sample source.
 */
export function fiveLensCoverage(input: FiveLensCoverageInput = []): FiveLensCoverageSlot[] {
  const rows: ReadonlyArray<FiveLensCoverageRow> = isReport(input)
    ? input.dataMode === 'sourced'
      ? reportRows(input)
      : []
    : isRowCollection(input)
      ? input.rows
      : input
  const sources: ReadonlyArray<ResearchSource> = isReport(input)
    ? input.sources
    : isRowCollection(input)
      ? (input.sources ?? [])
      : []

  const bestByLens = new Map<FiveLensLabel, { row: FiveLensCoverageRow; source: ResearchSource }>()

  for (const row of rows) {
    if (!isSourceBacked(row)) continue
    const source = resolveSource(row, sources)
    if (!source) continue
    const label = lensForRow(row)
    if (!label) continue
    if (!bestByLens.has(label)) bestByLens.set(label, { row, source })
  }

  return FIVE_LENS_LABELS.map((label) => {
    const meta = LENSES[label]
    const found = bestByLens.get(label)
    const sourced = Boolean(found)
    const source = found?.source ?? null
    const reportedAt = found?.row.period ?? source?.dataPeriod ?? source?.publishedAt ?? null
    return {
      id: meta.id,
      label,
      title: label,
      status: sourced ? 'sourced' : 'unknown',
      coverage: sourced ? 'source-backed' : 'unknown',
      sourceBacked: sourced,
      sourceId: source?.id ?? null,
      sourceLabel: source?.label ?? null,
      sourceUrl: source?.url ?? null,
      reportedAt: typeof reportedAt === 'string' && reportedAt.trim().length > 0 ? reportedAt : null,
      geography: source?.geography ?? null,
      definition: meta.definition,
      limitations: meta.limitations,
    }
  })
}

export const computeFiveLensCoverage = fiveLensCoverage
export const fiveLensCoverageForReport = fiveLensCoverage

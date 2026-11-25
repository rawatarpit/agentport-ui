import { buildOpportunities, RANKING_METHOD } from './report'
import { buildWorkflows } from './workflows'
import type {
  Metric,
  ReportSection,
  ResearchChart,
  ResearchProfile,
  ResearchReport,
  ResearchSource,
} from './types'

/**
 * A FICTIONAL sample report.
 *
 * This module exists so the report layout, charts and citation components can
 * be reviewed before a research provider is connected. It is not market
 * research and it must never be presented as research about a real business
 * or a real market.
 *
 * Two structural protections make that hard to misuse:
 *
 * 1. Every numeric metric and every chart series is `provenance:
 *    'illustrative'` and cites `sample-source`, whose label says it is not a
 *    citation. `sample.test.ts` fails the build if that stops being true.
 * 2. The route only reaches this module when `?sample=1` is explicit. The
 *    default `buildReport` never falls back to these numbers.
 */

const SAMPLE_SOURCE: ResearchSource = {
  id: 'sample-source',
  label: 'Fictional sample dataset — created for UI review, not a citation',
  url: null,
  publishedAt: null,
  dataPeriod: null,
  collectedAt: null,
  geography: null,
  industry: null,
  kind: 'sample',
}

const SAMPLE_METHOD: ResearchSource = {
  id: 'sample-method',
  label: 'AgentPort sample methodology note — illustrative only',
  url: null,
  publishedAt: null,
  dataPeriod: null,
  collectedAt: null,
  geography: null,
  industry: null,
  kind: 'sample',
}

function sampleMetric(key: string, label: string, value: number, unit: string, period: string): Metric {
  return {
    key,
    label,
    value,
    unit,
    provenance: 'illustrative',
    confidence: 'low',
    sourceId: 'sample-source',
    period,
    note: 'Fictional sample figure. Not market research.',
  }
}

function sampleChart(
  id: string,
  title: string,
  kind: ResearchChart['kind'],
  unit: string,
  points: Array<{ label: string; value: number }>,
): ResearchChart {
  return {
    id,
    title,
    kind,
    unit,
    points,
    provenance: 'illustrative',
    sourceId: 'sample-source',
    note: 'Fictional sample series. Not market research.',
  }
}

function sampleSections(profile: ResearchProfile): ReportSection[] {
  return [
    {
      id: 'executive',
      title: 'Executive overview',
      summary:
        'A fictional summary used to review the report layout. Every figure below is invented and labelled illustrative.',
      findings: [
        {
          id: 'sample-exec',
          claim:
            'In this fictional sample, demand is growing and agent-originated discovery is a small but rising share of sessions.',
          provenance: 'illustrative',
          confidence: 'low',
          sourceIds: ['sample-source'],
          note: 'Invented for layout review.',
        },
        {
          id: 'sample-exec-2',
          claim:
            'The sample business has a catalogue and pricing information but no machine-readable capability menu.',
          provenance: 'illustrative',
          confidence: 'low',
          sourceIds: ['sample-source'],
          note: 'Invented for layout review.',
        },
      ],
      metrics: [
        sampleMetric('market-size', 'Market size', 12.4, 'USD bn', '2026 (fictional)'),
        sampleMetric('growth', 'Market growth', 8.2, '% CAGR', '2026–2030 (fictional)'),
      ],
      charts: [
        sampleChart('market-growth', 'Market growth', 'line', 'USD bn', [
          { label: '2022', value: 8.1 },
          { label: '2023', value: 8.9 },
          { label: '2024', value: 9.8 },
          { label: '2025', value: 10.7 },
          { label: '2026', value: 12.4 },
          { label: '2027', value: 13.4 },
          { label: '2028', value: 14.5 },
          { label: '2029', value: 15.7 },
          { label: '2030', value: 17.0 },
        ]),
      ],
      sourceIds: ['sample-source', 'sample-method'],
    },
    {
      id: 'landscape',
      title: 'Market landscape',
      summary: 'Fictional segment and geography splits for layout review.',
      findings: [
        {
          id: 'sample-landscape',
          claim: 'The fictional market is concentrated in three metro regions and a long tail of regional operators.',
          provenance: 'illustrative',
          confidence: 'low',
          sourceIds: ['sample-source'],
          note: 'Invented for layout review.',
        },
      ],
      metrics: [
        sampleMetric('online-share', 'Online share', 31, '% of revenue', '2026 (fictional)'),
        sampleMetric('top3-share', 'Top-three share', 41, '% of market', '2026 (fictional)'),
      ],
      charts: [
        sampleChart('geo-distribution', 'Geographic distribution', 'bar', '% of market', [
          { label: 'Metro A', value: 24 },
          { label: 'Metro B', value: 18 },
          { label: 'Metro C', value: 12 },
          { label: 'Regional', value: 46 },
        ]),
        sampleChart('segment-split', 'Segment breakdown', 'bar', '% of market', [
          { label: 'Premium', value: 28 },
          { label: 'Mainstream', value: 44 },
          { label: 'Value', value: 20 },
          { label: 'Other', value: 8 },
        ]),
      ],
      sourceIds: ['sample-source'],
    },
    {
      id: 'demand',
      title: 'Demand and emerging trends',
      summary: 'A fictional search-demand series. Real reports require a dated source.',
      findings: [
        {
          id: 'sample-demand',
          claim: 'In the fictional sample, search demand rises steadily through the period.',
          provenance: 'illustrative',
          confidence: 'low',
          sourceIds: ['sample-source'],
          note: 'Invented for layout review.',
        },
      ],
      metrics: [sampleMetric('search-demand', 'Search demand index', 132, 'index (2022 = 100)', '2026 (fictional)')],
      charts: [
        sampleChart('search-demand', 'Search demand', 'line', 'index', [
          { label: '2022', value: 100 },
          { label: '2023', value: 106 },
          { label: '2024', value: 114 },
          { label: '2025', value: 123 },
          { label: '2026', value: 132 },
        ]),
      ],
      sourceIds: ['sample-source'],
    },
    {
      id: 'ai-transformation',
      title: 'AI transformation',
      summary: 'Fictional adoption figures to exercise the chart component.',
      findings: [
        {
          id: 'sample-ai',
          claim: 'The fictional sample shows low but rising AI adoption across operators.',
          provenance: 'illustrative',
          confidence: 'low',
          sourceIds: ['sample-source'],
          note: 'Invented for layout review.',
        },
      ],
      metrics: [sampleMetric('ai-adoption', 'AI adoption', 24, '% of firms', '2026 (fictional)')],
      charts: [
        sampleChart('ai-adoption', 'AI adoption', 'bar', '% of firms', [
          { label: 'Discovery', value: 24 },
          { label: 'Read APIs', value: 17 },
          { label: 'Write actions', value: 6 },
          { label: 'Human-confirmed', value: 3 },
        ]),
      ],
      sourceIds: ['sample-source'],
    },
    {
      id: 'competition',
      title: 'Competitive intelligence',
      summary: 'Fictional competitor comparison. No real company is described.',
      findings: [
        {
          id: 'sample-competition',
          claim: 'The fictional sample compares four invented operators on read and write capability.',
          provenance: 'illustrative',
          confidence: 'low',
          sourceIds: ['sample-source'],
          note: 'Invented companies and scores; not a claim about any real business.',
        },
      ],
      metrics: [sampleMetric('competitors', 'Operators profiled', 14, 'count', '2026 (fictional)')],
      charts: [
        sampleChart('competitor-comparison', 'Competitor comparison', 'bar', 'readiness score 0–5', [
          { label: 'Sample Co A', value: 3.4 },
          { label: 'Sample Co B', value: 2.6 },
          { label: 'Sample Co C', value: 2.1 },
          { label: 'Sample Co D', value: 1.4 },
        ]),
      ],
      sourceIds: ['sample-source'],
    },
    {
      id: 'ecosystem',
      title: 'Industry ecosystem',
      summary: 'Fictional ecosystem counts.',
      findings: [
        {
          id: 'sample-ecosystem',
          claim: 'The fictional sample has suppliers, distributors, marketplaces and service providers.',
          provenance: 'illustrative',
          confidence: 'low',
          sourceIds: ['sample-source'],
          note: 'Invented for layout review.',
        },
      ],
      metrics: [],
      charts: [
        sampleChart('ecosystem', 'Industry ecosystem', 'bar', 'entities (fictional)', [
          { label: 'Suppliers', value: 120 },
          { label: 'Distributors', value: 34 },
          { label: 'Marketplaces', value: 9 },
          { label: 'Service providers', value: 48 },
        ]),
      ],
      sourceIds: ['sample-source'],
    },
    {
      id: 'agentic-commerce',
      title: 'Agentic commerce analysis',
      summary:
        'The same interaction model as a real report: discovery, research, comparison, preparation, human confirmation and completion are separate stages.',
      findings: [
        {
          id: 'sample-agentic',
          claim:
            'In the fictional sample, discovery and read capabilities are the realistic near-term scope; confirmed writes need more evidence.',
          provenance: 'illustrative',
          confidence: 'low',
          sourceIds: ['sample-source'],
          note: 'Illustrative conclusion for layout review.',
        },
        {
          id: 'sample-agentic-2',
          claim:
            'A GET-only agent session can prepare an action, but a human must approve the exact operation before any write is sent.',
          provenance: 'interpretation',
          confidence: 'high',
          sourceIds: ['sample-method'],
          note: 'Product architecture, not a market claim.',
        },
      ],
      metrics: [],
      charts: [],
      sourceIds: ['sample-method'],
    },
    {
      id: 'opportunity-map',
      title: 'Agent opportunity map',
      summary: 'Fictional opportunities ranked with the real, transparent method.',
      findings: [
        {
          id: 'sample-opportunity-method',
          claim: 'Ranking uses the documented weighted factors on a 1–5 scale.',
          provenance: 'derived',
          confidence: 'high',
          sourceIds: ['sample-method'],
          note: 'Method is real; the sample profile is fictional.',
        },
      ],
      metrics: [],
      charts: [],
      sourceIds: ['sample-method'],
    },
    {
      id: 'risks',
      title: 'Risks and regulation',
      summary: 'Fictional risk notes. Not legal advice and not a jurisdiction dataset.',
      findings: [
        {
          id: 'sample-risk',
          claim:
            'The fictional sample flags data minimisation, consumer disclosure and write-authorisation as the main risk areas.',
          provenance: 'illustrative',
          confidence: 'low',
          sourceIds: ['sample-source'],
          note: 'Invented for layout review.',
        },
      ],
      metrics: [],
      charts: [],
      sourceIds: ['sample-source'],
    },
    {
      id: 'outlook',
      title: 'Outlook and scenarios',
      summary: 'Conditional narratives, clearly not forecasts.',
      findings: [
        {
          id: 'sample-outlook',
          claim:
            'The fictional base case assumes read capabilities mature first and writes remain human-confirmed.',
          provenance: 'illustrative',
          confidence: 'low',
          sourceIds: ['sample-source'],
          note: 'Invented narrative for layout review.',
        },
      ],
      metrics: [],
      charts: [],
      sourceIds: ['sample-source'],
    },
    {
      id: 'sources',
      title: 'Sources and methodology',
      summary: 'Every figure in this sample is fictional. There is no external citation because there is no research.',
      findings: [
        {
          id: 'sample-sources',
          claim: 'This sample cites only a fictional dataset; it does not cite a real publication.',
          provenance: 'illustrative',
          confidence: 'low',
          sourceIds: ['sample-source', 'sample-method'],
          note: 'The absence of real sources is deliberate and visible.',
        },
      ],
      metrics: [],
      charts: [],
      sourceIds: ['sample-source', 'sample-method'],
    },
  ]
}

export function buildSampleReport(profile: ResearchProfile): ResearchReport {
  const sampleProfile: ResearchProfile = {
    ...profile,
    industry: profile.industry || 'Fictional sample industry',
    subIndustry: profile.subIndustry ?? 'Fictional sample sub-industry',
    businessModel: profile.businessModel ?? 'Direct-to-consumer',
    customerSegment: profile.customerSegment ?? 'Consumers',
    productsServices: profile.productsServices ?? 'Fictional catalogue of sample products',
    objectives: profile.objectives.length > 0 ? profile.objectives : ['Increase agent-assisted discovery'],
  }
  const opportunities = buildOpportunities(sampleProfile).map((opportunity) => ({
    ...opportunity,
    evidence: 'Fictional sample evidence. Not market research.',
  }))
  return {
    profile: sampleProfile,
    generatedAt: new Date().toISOString(),
    dataMode: 'illustrative',
    honestyNote:
      'FICTIONAL SAMPLE. Every figure is invented for interface review and is not market research about any real industry or company.',
    sections: sampleSections(sampleProfile),
    opportunities,
    workflows: buildWorkflows(sampleProfile),
    sources: [SAMPLE_SOURCE, SAMPLE_METHOD],
    rankingMethod: RANKING_METHOD,
  }
}

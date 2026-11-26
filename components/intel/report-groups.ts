import type { ReportSection, ReportSectionId } from '@/lib/intelligence/types'

export type ReportGroup = {
  id: string
  label: string
  sectionIds: ReportSectionId[]
}

export const REPORT_GROUPS: ReportGroup[] = [
  { id: 'industry-overview', label: 'Industry Overview', sectionIds: ['executive', 'landscape', 'demand'] },
  { id: 'competitive-intelligence', label: 'Competitive Intelligence', sectionIds: ['competition', 'ecosystem'] },
  { id: 'industry-trends', label: 'Industry Trends', sectionIds: ['ai-transformation', 'outlook'] },
  { id: 'ai-transformation', label: 'AI Transformation', sectionIds: ['agentic-commerce'] },
  { id: 'agent-opportunity-map', label: 'Agent Opportunity Map', sectionIds: ['opportunity-map'] },
  { id: 'risks-and-regulation', label: 'Risks and Regulation', sectionIds: ['risks'] },
  { id: 'sources-and-methodology', label: 'Sources and Methodology', sectionIds: ['sources'] },
]

export function sectionsForGroup(sections: ReportSection[], group: ReportGroup): ReportSection[] {
  const byId = new Map(sections.map((section) => [section.id, section]))
  return group.sectionIds.map((id) => byId.get(id)).filter((section): section is ReportSection => section !== undefined)
}

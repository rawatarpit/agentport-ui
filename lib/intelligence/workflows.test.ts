import { describe, expect, it } from 'vitest'
import { buildReport } from './report'
import { emptyProfile, type ResearchProfile } from './types'
import { buildWorkflows, detectIndustryKey, WORKFLOW_INDUSTRY_KEYS } from './workflows'

function profileFor(industry: string, subIndustry: string | null): ResearchProfile {
  return { ...emptyProfile(), industry, subIndustry, country: 'India', geography: 'Urban India' }
}

const PROFILES: Record<string, ResearchProfile> = {
  'retail-ecommerce': profileFor('Retail & E-commerce', 'Specialty retail'),
  healthcare: profileFor('Healthcare', 'Clinics and diagnostics'),
  manufacturing: profileFor('Manufacturing', 'Industrial components'),
  energy: profileFor('Energy', 'Renewable utilities'),
  'financial-services': profileFor('Financial services', 'Payments'),
  'data-centres-gpu': profileFor('Data centres', 'GPU compute hosting'),
}

const ALL_KEYS = [...WORKFLOW_INDUSTRY_KEYS, 'general']

function workflowsFor(key: string) {
  return buildWorkflows(PROFILES[key] ?? profileFor('Unknown sector', null))
}

describe('buildWorkflows industry coverage', () => {
  for (const key of WORKFLOW_INDUSTRY_KEYS) {
    it(`returns three to four distinct workflows for ${key}`, () => {
      const workflows = workflowsFor(key)
      expect(workflows.length).toBeGreaterThanOrEqual(3)
      expect(workflows.length).toBeLessThanOrEqual(4)
      expect(detectIndustryKey(PROFILES[key]!)).toBe(key)

      const ids = workflows.map((workflow) => workflow.id)
      expect(new Set(ids).size).toBe(ids.length)
      for (const workflow of workflows) {
        expect(workflow.industryKey).toBe(key)
        expect(workflow.id.startsWith(`${key}:`)).toBe(true)
      }

      expect(workflows.some((workflow) => workflow.access === 'read')).toBe(true)
      expect(workflows.some((workflow) => workflow.access === 'write')).toBe(true)

      expect(new Set(workflows.map((workflow) => workflow.requiredCapability)).size).toBe(workflows.length)
      expect(new Set(workflows.map((workflow) => workflow.requiredData.join('|'))).size).toBe(workflows.length)
      expect(new Set(workflows.map((workflow) => workflow.technicalDependencies.join('|'))).size).toBe(
        workflows.length,
      )
    })
  }

  it('falls back to general workflows for an unrecognised industry', () => {
    const profile = profileFor('Unclassified sector', null)
    expect(detectIndustryKey(profile)).toBe('general')
    const workflows = buildWorkflows(profile)
    expect(workflows.length).toBeGreaterThanOrEqual(3)
    for (const workflow of workflows) expect(workflow.industryKey).toBe('general')
  })

  it('detects industries from sub-industry text alone', () => {
    expect(detectIndustryKey(profileFor('Operations', 'GPU cluster'))).toBe('data-centres-gpu')
    expect(detectIndustryKey(profileFor('Operations', 'Dental clinic'))).toBe('healthcare')
    expect(detectIndustryKey(profileFor('Operations', 'Consumer lending'))).toBe('financial-services')
  })
})

describe('buildWorkflows honesty fields', () => {
  for (const key of ALL_KEYS) {
    it(`every ${key} workflow states its scope and carries no evidence claim`, () => {
      for (const workflow of workflowsFor(key)) {
        for (const field of [
          workflow.id,
          workflow.industryKey,
          workflow.workflowName,
          workflow.customerProblem,
          workflow.businessOpportunity,
          workflow.requiredCapability,
          workflow.evidenceStatement,
        ]) {
          expect(field.trim().length).toBeGreaterThan(0)
        }
        expect(workflow.requiredData.length).toBeGreaterThan(0)
        expect(workflow.technicalDependencies.length).toBeGreaterThan(0)
        for (const item of [...workflow.requiredData, ...workflow.technicalDependencies]) {
          expect(item.trim().length).toBeGreaterThan(0)
        }

        expect(['read', 'write']).toContain(workflow.access)
        expect(['none', 'merchant', 'end_user', 'oauth']).toContain(workflow.authentication)
        expect(['none', 'recommended', 'required']).toContain(workflow.humanConfirmation)
        expect(['low', 'medium', 'high']).toContain(workflow.feasibility)

        expect(workflow.evidenceProvenance).toBe('interpretation')
        expect(workflow.confidence).toBe('low')
        expect(workflow.verifiedCapability).toBe(false)
        expect(workflow.sourceIds).toEqual([])

        expect(workflow.evidenceStatement).toMatch(/hypothesis/i)
        expect(workflow.evidenceStatement).toMatch(/submitted profile/i)
        expect(workflow.evidenceStatement).toMatch(/not a verified capability/i)
        expect(workflow.evidenceStatement).toMatch(/no external evidence/i)
        expect(workflow.evidenceStatement).not.toMatch(/\d/)

        if (workflow.access === 'write') {
          expect(workflow.humanConfirmation).toBe('required')
          expect(workflow.authentication).not.toBe('none')
        }
      }
    })
  }
})

describe('buildWorkflows determinism and report wiring', () => {
  it('produces identical workflows for the same profile', () => {
    for (const key of ALL_KEYS) {
      const profile = PROFILES[key] ?? profileFor('Unclassified sector', null)
      expect(buildWorkflows(profile)).toEqual(buildWorkflows(profile))
    }
  })

  it('does not share mutable arrays between calls', () => {
    const profile = PROFILES['retail-ecommerce']!
    const first = buildWorkflows(profile)
    first[0]!.requiredData.push('mutated')
    expect(buildWorkflows(profile)[0]!.requiredData).not.toContain('mutated')
  })

  it('is included in a built report', () => {
    const profile = PROFILES['data-centres-gpu']!
    expect(buildReport(profile).workflows).toEqual(buildWorkflows(profile))
  })
})

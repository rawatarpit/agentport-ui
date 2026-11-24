import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { canonicalJson, normalizeCollectedEvidence } from './normalize.js'
import type { JsonValue } from './types.js'

/** Literal test data only — no runtime fixture, no network, no storage. */
function validInput(): Record<string, unknown> {
  return {
    tenantId: 'tenant_123',
    providerId: 'economic-dataset-slot',
    adapterVersion: '0.0.0',
    sourceIdentifier: 'stats-release-2025-q4',
    sourceUrl: 'https://stats.example.org/releases/2025-q4',
    sourceName: 'Example Statistics Office',
    publishedAt: '2026-01-15T09:30:00.000Z',
    collectedAt: '2026-02-01T10:00:00.000Z',
    geography: 'India',
    geographyScope: 'national',
    industry: 'retail',
    category: 'economic_dataset',
    evidenceType: 'numeric_dataset',
    extractedInformation: { metric: 'retail sales', value: 42.5, period: '2025 Q4' },
    confidence: 'medium',
    verificationStatus: 'source_verified',
    dataPeriod: '2025 Q4',
    attribution: 'Example Statistics Office, 2026',
  }
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

describe('normalizeCollectedEvidence', () => {
  it('normalizes valid test data exactly, deriving only the two hashes', () => {
    const input = validInput()
    const result = normalizeCollectedEvidence(input)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const { contentHash, queryHash, ...rest } = result.value
    expect(rest).toEqual(input)
    expect(contentHash).toMatch(/^[a-f0-9]{64}$/)
    expect(queryHash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('keeps null publication date, data period, tenant and industry null', () => {
    const result = normalizeCollectedEvidence({
      ...validInput(),
      tenantId: null,
      publishedAt: null,
      industry: null,
      dataPeriod: null,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.publishedAt).toBeNull()
    expect(result.value.dataPeriod).toBeNull()
    expect(result.value.tenantId).toBeNull()
    expect(result.value.industry).toBeNull()
  })

  it('accepts the publicationDate/dataPeriod aliases without inventing values', () => {
    const { publishedAt, dataPeriod, ...rest } = validInput()
    const result = normalizeCollectedEvidence({ ...rest, publicationDate: null, period: '2025' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.publishedAt).toBeNull()
    expect(result.value.dataPeriod).toBe('2025')
  })

  it('refuses non-object input and missing explicit fields', () => {
    for (const value of [null, 'evidence', 42, ['evidence']]) {
      expect(normalizeCollectedEvidence(value).ok).toBe(false)
    }
    const { attribution, ...rest } = validInput()
    expect(normalizeCollectedEvidence(rest).ok).toBe(false)
  })

  const refusals: Array<[string, (input: Record<string, unknown>) => Record<string, unknown>]> = [
    ['empty providerId', (input) => ({ ...input, providerId: '   ' })],
    ['empty sourceIdentifier', (input) => ({ ...input, sourceIdentifier: '' })],
    ['empty sourceName', (input) => ({ ...input, sourceName: '   ' })],
    ['malformed URL', (input) => ({ ...input, sourceUrl: 'not-a-url' })],
    ['http source URL', (input) => ({ ...input, sourceUrl: 'http://stats.example.org/releases' })],
    ['sample scheme URL', (input) => ({ ...input, sourceUrl: 'sample://illustrative' })],
    ['unknown category', (input) => ({ ...input, category: 'market_size' })],
    ['unknown evidence type', (input) => ({ ...input, evidenceType: 'opinion' })],
    ['unknown confidence', (input) => ({ ...input, confidence: 'certain' })],
    ['unknown verification status', (input) => ({ ...input, verificationStatus: 'verified' })],
    ['unknown geography scope', (input) => ({ ...input, geographyScope: 'planet' })],
    ['non-ISO collectedAt', (input) => ({ ...input, collectedAt: 'yesterday' })],
    ['impossible ISO date', (input) => ({ ...input, collectedAt: '2025-02-30T00:00:00Z' })],
    ['non-ISO publishedAt', (input) => ({ ...input, publishedAt: '2026/01/15' })],
    ['array extractedInformation', (input) => ({ ...input, extractedInformation: [1, 2] })],
    ['scalar extractedInformation', (input) => ({ ...input, extractedInformation: 'value' })],
    ['credential-like key', (input) => ({ ...input, extractedInformation: { api_key: 'do-not-store' } })],
    ['nested credential-like key', (input) => ({ ...input, extractedInformation: { meta: { access_token: 'x' } } })],
    ['function in extractedInformation', (input) => ({ ...input, extractedInformation: { fn: () => 1 } })],
  ]

  for (const [label, mutate] of refusals) {
    it(`rejects ${label}`, () => {
      const result = normalizeCollectedEvidence(mutate(validInput()))
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.reason.length).toBeGreaterThan(0)
    })
  }

  it('allows a dev-only localhost source but never a production one', () => {
    expect(normalizeCollectedEvidence({ ...validInput(), sourceUrl: 'http://localhost:3000/source' }).ok).toBe(true)
  })

  it('hashes a canonical projection deterministically and reacts to content changes', () => {
    const input = validInput() as Record<string, JsonValue>
    const first = normalizeCollectedEvidence(input)
    const second = normalizeCollectedEvidence(validInput())
    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) return
    expect(first.value.contentHash).toBe(second.value.contentHash)
    expect(first.value.queryHash).toBe(second.value.queryHash)

    const expectedContent = sha256(
      canonicalJson({
        providerId: input.providerId,
        sourceIdentifier: input.sourceIdentifier,
        sourceUrl: input.sourceUrl,
        sourceName: input.sourceName,
        publishedAt: input.publishedAt,
        geography: input.geography,
        geographyScope: input.geographyScope,
        industry: input.industry,
        category: input.category,
        evidenceType: input.evidenceType,
        dataPeriod: input.dataPeriod,
        extractedInformation: input.extractedInformation,
      }),
    )
    expect(first.value.contentHash).toBe(expectedContent)

    const changed = normalizeCollectedEvidence({
      ...input,
      extractedInformation: { metric: 'retail sales', value: 99, period: '2025 Q4' },
    })
    expect(changed.ok).toBe(true)
    if (!changed.ok) return
    expect(changed.value.contentHash).not.toBe(first.value.contentHash)
    expect(changed.value.queryHash).toBe(first.value.queryHash)
  })

  it('canonicalises nested keys in sorted order', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}')
  })

  it('cannot carry illustrative provenance or a sample source', () => {
    const illustrative = normalizeCollectedEvidence({ ...validInput(), provenance: 'illustrative' })
    expect(illustrative.ok).toBe(true)
    if (illustrative.ok) expect(illustrative.value).not.toHaveProperty('provenance')
    expect(normalizeCollectedEvidence({ ...validInput(), sourceIdentifier: 'sample', sourceUrl: 'sample://x' }).ok).toBe(false)
  })
})

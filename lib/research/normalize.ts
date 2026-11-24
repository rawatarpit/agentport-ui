import { createHash } from 'node:crypto'

import {
  CONFIDENCE_VALUES,
  EVIDENCE_TYPES,
  GEOGRAPHY_SCOPES,
  RESEARCH_CATEGORIES,
  VERIFICATION_STATUSES,
  type CollectedEvidence,
  type EvidenceAttribution,
  type JsonValue,
} from './types'

export type NormalizeResult =
  | { ok: true; value: CollectedEvidence }
  | { ok: false; reason: string }

type ValueResult<T> = { ok: true; value: T } | { ok: false; reason: string }

const REQUIRED_KEYS = [
  'tenantId',
  'providerId',
  'adapterVersion',
  'sourceIdentifier',
  'sourceUrl',
  'sourceName',
  'publishedAt',
  'collectedAt',
  'geography',
  'geographyScope',
  'industry',
  'category',
  'evidenceType',
  'extractedInformation',
  'confidence',
  'verificationStatus',
  'dataPeriod',
  'attribution',
] as const

const CREDENTIAL_KEY_PARTS = ['api_key', 'secret', 'token', 'password', 'authorization', 'cvv', 'card_number'] as const
const MAX_JSON_DEPTH = 32

function fail(reason: string): { ok: false; reason: string } {
  return { ok: false, reason }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value) as unknown
  return prototype === Object.prototype || prototype === null
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key)
}

function requiredText(value: unknown, field: string): ValueResult<string> {
  if (typeof value !== 'string') return fail(`${field} must be a non-empty string.`)
  const trimmed = value.trim()
  if (!trimmed) return fail(`${field} must be a non-empty string.`)
  return { ok: true, value: trimmed }
}

function nullableText(value: unknown, field: string): ValueResult<string | null> {
  if (value === null) return { ok: true, value: null }
  if (typeof value !== 'string') return fail(`${field} must be a string or null.`)
  const trimmed = value.trim()
  if (!trimmed) return fail(`${field} must be a non-empty string or null; blank is not a value.`)
  return { ok: true, value: trimmed }
}

function oneOf<T extends string>(values: readonly T[], value: unknown, field: string): ValueResult<T> {
  if (typeof value !== 'string' || !values.includes(value as T)) return fail(`Unknown ${field}.`)
  return { ok: true, value: value as T }
}

/** Calendar-checked ISO date or date-time; "soon" and 2025-02-30 are not dates. */
function isIsoTimestamp(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2}))?$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return false
  if (match[4] !== undefined) {
    if (Number(match[4]) > 23 || Number(match[5]) > 59 || Number(match[6]) > 59) return false
    const zone = match[7]
    if (zone && zone !== 'Z') {
      const parts = zone.slice(1).split(':')
      if (parts.length !== 2 || Number(parts[0]) > 23 || Number(parts[1]) > 59) return false
    }
  }
  return Number.isFinite(Date.parse(value))
}

function isoRequiredText(value: unknown, field: string): ValueResult<string> {
  const text = requiredText(value, field)
  if (!text.ok) return text
  if (!isIsoTimestamp(text.value)) return fail(`${field} must be an ISO 8601 date or date-time.`)
  return text
}

function isoNullableText(value: unknown, field: string): ValueResult<string | null> {
  const text = nullableText(value, field)
  if (!text.ok) return text
  if (text.value !== null && !isIsoTimestamp(text.value)) return fail(`${field} must be an ISO 8601 date or date-time.`)
  return text
}

function isHttpsOrDevLocalhost(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  // Credentials in a source URL are never evidence metadata; they are a leak.
  if (url.username || url.password) return false
  if (url.protocol === 'https:') return true
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
  return url.protocol === 'http:' && local && process.env.NODE_ENV !== 'production'
}

function hasCredentialKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return CREDENTIAL_KEY_PARTS.some((part) => normalized.includes(part))
}

function jsonValue(value: unknown, path: string, depth: number): ValueResult<JsonValue> {
  if (depth > MAX_JSON_DEPTH) return fail(`extractedInformation.${path} is nested too deeply.`)
  if (value === null) return { ok: true, value: null }
  if (typeof value === 'string' || typeof value === 'boolean') return { ok: true, value }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? { ok: true, value } : fail(`extractedInformation.${path} is not a finite number.`)
  }
  if (Array.isArray(value)) {
    const out: JsonValue[] = []
    for (let index = 0; index < value.length; index += 1) {
      const item = jsonValue(value[index], `${path}[${index}]`, depth + 1)
      if (!item.ok) return item
      out.push(item.value)
    }
    return { ok: true, value: out }
  }
  if (isPlainObject(value)) {
    const out: Record<string, JsonValue> = {}
    for (const [key, item] of Object.entries(value)) {
      if (hasCredentialKey(key)) {
        return fail(`extractedInformation.${path}.${key} is a credential-like key and is refused.`)
      }
      const nested = jsonValue(item, `${path}.${key}`, depth + 1)
      if (!nested.ok) return nested
      out[key] = nested.value
    }
    return { ok: true, value: out }
  }
  return fail(`extractedInformation.${path} is not a plain JSON value.`)
}

function attributionValue(value: unknown): ValueResult<EvidenceAttribution> {
  if (typeof value === 'string') {
    const text = requiredText(value, 'attribution')
    return text.ok ? { ok: true, value: text.value } : text
  }
  if (!isPlainObject(value)) return fail('attribution must be citation text or a plain object.')
  for (const key of Object.keys(value)) {
    if (key !== 'label' && key !== 'url' && key !== 'license') return fail(`Unknown attribution field: ${key}.`)
  }
  const label = requiredText(value.label, 'attribution.label')
  if (!label.ok) return label
  const url = nullableText(value.url, 'attribution.url')
  if (!url.ok) return url
  if (url.value !== null && !isHttpsOrDevLocalhost(url.value)) return fail('attribution.url must be absolute https (localhost in dev only).')
  const license = nullableText(value.license, 'attribution.license')
  if (!license.ok) return license
  return { ok: true, value: { label: label.value, url: url.value, license: license.value } }
}

/** Sorted keys and compact separators: the same evidence always hashes alike. */
export function canonicalJson(value: JsonValue): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Cannot canonicalise a non-finite number.')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const keys = Object.keys(value).sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key]!)}`).join(',')}}`
}

function hashProjection(projection: Record<string, JsonValue>): string {
  return createHash('sha256').update(canonicalJson(projection), 'utf8').digest('hex')
}

/**
 * Validate and canonicalise one item. Nothing is defaulted: a missing or blank
 * value is refused rather than turned into a plausible-looking zero or sample.
 */
export function normalizeCollectedEvidence(input: unknown): NormalizeResult {
  if (!isPlainObject(input)) return fail('Evidence must be a plain object.')

  for (const key of REQUIRED_KEYS) {
    const aliased =
      (key === 'publishedAt' && hasOwn(input, 'publicationDate')) ||
      (key === 'dataPeriod' && hasOwn(input, 'period'))
    if (!hasOwn(input, key) && !aliased) return fail(`${key} is required (use null explicitly when unknown).`)
  }

  const providerId = requiredText(input.providerId, 'providerId')
  if (!providerId.ok) return providerId
  const adapterVersion = requiredText(input.adapterVersion, 'adapterVersion')
  if (!adapterVersion.ok) return adapterVersion
  const sourceIdentifier = requiredText(input.sourceIdentifier, 'sourceIdentifier')
  if (!sourceIdentifier.ok) return sourceIdentifier
  const sourceUrl = requiredText(input.sourceUrl, 'sourceUrl')
  if (!sourceUrl.ok) return sourceUrl
  if (!isHttpsOrDevLocalhost(sourceUrl.value)) {
    return fail('sourceUrl must be an absolute https URL (localhost allowed in dev only).')
  }
  const sourceName = requiredText(input.sourceName, 'sourceName')
  if (!sourceName.ok) return sourceName

  const tenantId = nullableText(input.tenantId, 'tenantId')
  if (!tenantId.ok) return tenantId
  const publishedAt = isoNullableText(
    hasOwn(input, 'publishedAt') ? input.publishedAt : input.publicationDate,
    'publishedAt',
  )
  if (!publishedAt.ok) return publishedAt
  const collectedAt = isoRequiredText(input.collectedAt, 'collectedAt')
  if (!collectedAt.ok) return collectedAt
  const dataPeriod = nullableText(
    hasOwn(input, 'dataPeriod') ? input.dataPeriod : input.period,
    'dataPeriod',
  )
  if (!dataPeriod.ok) return dataPeriod

  const geography = requiredText(input.geography, 'geography')
  if (!geography.ok) return geography
  const geographyScope = oneOf(GEOGRAPHY_SCOPES, input.geographyScope, 'geographyScope')
  if (!geographyScope.ok) return geographyScope
  const industry = nullableText(input.industry, 'industry')
  if (!industry.ok) return industry

  const category = oneOf(RESEARCH_CATEGORIES, input.category, 'category')
  if (!category.ok) return category
  const evidenceType = oneOf(EVIDENCE_TYPES, input.evidenceType, 'evidenceType')
  if (!evidenceType.ok) return evidenceType
  const confidence = oneOf(CONFIDENCE_VALUES, input.confidence, 'confidence')
  if (!confidence.ok) return confidence
  const verificationStatus = oneOf(VERIFICATION_STATUSES, input.verificationStatus, 'verificationStatus')
  if (!verificationStatus.ok) return verificationStatus

  if (!isPlainObject(input.extractedInformation)) return fail('extractedInformation must be a plain object, not an array or scalar.')
  const extracted: Record<string, JsonValue> = {}
  for (const [key, item] of Object.entries(input.extractedInformation)) {
    if (hasCredentialKey(key)) {
      return fail(`extractedInformation.${key} is a credential-like key and is refused.`)
    }
    const nested = jsonValue(item, key, 0)
    if (!nested.ok) return nested
    extracted[key] = nested.value
  }

  const attribution = attributionValue(input.attribution)
  if (!attribution.ok) return attribution

  const projection: Record<string, JsonValue> = {
    providerId: providerId.value,
    sourceIdentifier: sourceIdentifier.value,
    sourceUrl: sourceUrl.value,
    sourceName: sourceName.value,
    publishedAt: publishedAt.value,
    geography: geography.value,
    geographyScope: geographyScope.value,
    industry: industry.value,
    category: category.value,
    evidenceType: evidenceType.value,
    dataPeriod: dataPeriod.value,
    extractedInformation: extracted,
  }
  const queryProjection: Record<string, JsonValue> = {
    providerId: providerId.value,
    category: category.value,
    geography: geography.value,
    industry: industry.value,
    dataPeriod: dataPeriod.value,
  }

  return {
    ok: true,
    value: {
      tenantId: tenantId.value,
      providerId: providerId.value,
      adapterVersion: adapterVersion.value,
      sourceIdentifier: sourceIdentifier.value,
      sourceUrl: sourceUrl.value,
      sourceName: sourceName.value,
      publishedAt: publishedAt.value,
      collectedAt: collectedAt.value,
      geography: geography.value,
      geographyScope: geographyScope.value,
      industry: industry.value,
      category: category.value,
      evidenceType: evidenceType.value,
      extractedInformation: extracted,
      confidence: confidence.value,
      verificationStatus: verificationStatus.value,
      dataPeriod: dataPeriod.value,
      contentHash: hashProjection(projection),
      queryHash: hashProjection(queryProjection),
      attribution: attribution.value,
    },
  }
}

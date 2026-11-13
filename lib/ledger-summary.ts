import type { LedgerEntry } from '@/lib/contracts'

/**
 * Pure projections for the ledger screen.
 *
 * The page reads the newest 200 durable rows and then filters them here, on
 * the server, so the URL can carry a filter without a second database round
 * trip and without putting user input into a PostgREST query string. 200 is
 * the window the page already trusts; the UI says so rather than implying it
 * searched the whole history.
 */

export type DecisionFilter = 'all' | 'allow' | 'deny' | 'held'
export type AccessFilter = 'all' | 'read' | 'write'

export interface LedgerFilter {
  query: string
  decision: DecisionFilter
  access: AccessFilter
}

export const EMPTY_FILTER: LedgerFilter = { query: '', decision: 'all', access: 'all' }

type ParamValue = string | string[] | undefined

function one(value: ParamValue): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
}

/** Invalid or repeated values fall back to `all`; a filter never throws. */
export function parseLedgerFilter(params: Record<string, ParamValue>): LedgerFilter {
  const decision = one(params.decision)
  const access = one(params.access)
  return {
    query: one(params.q).trim().slice(0, 120),
    decision: decision === 'allow' || decision === 'deny' || decision === 'held' ? decision : 'all',
    access: access === 'read' || access === 'write' ? access : 'all',
  }
}

export function isFiltering(filter: LedgerFilter): boolean {
  return filter.query.length > 0 || filter.decision !== 'all' || filter.access !== 'all'
}

function decisionBucket(e: LedgerEntry): Exclude<DecisionFilter, 'all'> {
  return e.decision === 'allow' ? 'allow' : e.decision === 'deny' ? 'deny' : 'held'
}

/**
 * A hold is a `require_approval` decision, not a fourth decision value. The
 * filter says "held" because that is the word the merchant uses.
 */
export function filterEntries(entries: LedgerEntry[], filter: LedgerFilter): LedgerEntry[] {
  const needle = filter.query.toLowerCase()
  return entries.filter((e) => {
    if (filter.decision !== 'all' && decisionBucket(e) !== filter.decision) return false
    if (filter.access !== 'all' && e.access !== filter.access) return false
    if (!needle) return true
    const haystack = [e.capability, e.agentLabel, e.agentId, e.rule, e.reason, e.requestId]
      .filter((value): value is string => typeof value === 'string')
      .join(' ')
      .toLowerCase()
    return haystack.includes(needle)
  })
}

export interface LedgerSummary {
  total: number
  allowed: number
  denied: number
  held: number
  reads: number
  writes: number
  selfService: number
}

/**
 * Counts over the loaded window. `selfService` is a declared agent label: a
 * self-issued token naming itself, not a credential the business issued.
 */
export function summarise(entries: LedgerEntry[]): LedgerSummary {
  const summary: LedgerSummary = {
    total: entries.length,
    allowed: 0,
    denied: 0,
    held: 0,
    reads: 0,
    writes: 0,
    selfService: 0,
  }
  for (const e of entries) {
    if (e.decision === 'allow') summary.allowed += 1
    else if (e.decision === 'deny') summary.denied += 1
    else summary.held += 1
    if (e.access === 'read') summary.reads += 1
    else if (e.access === 'write') summary.writes += 1
    if (e.agentLabelSource === 'declared') summary.selfService += 1
  }
  return summary
}

export type AttributionSource = 'credential' | 'declared' | 'none' | 'unknown'

export interface AgentAttribution {
  name: string
  source: AttributionSource
  /** The one word the chip shows. */
  chip: string
  /** Why the name is or is not something the business vouches for. */
  title: string
  /** True only when a credential this business issued supplied the name. */
  trusted: boolean
}

/**
 * Name the agent without promoting a caller's claim to identity.
 *
 * `agentId` alone is not enough: a self-issued public token is stored as
 * `public:[redacted]`, so every anonymous caller would render identically.
 * `agentLabel` restores the name, and `agentLabelSource` is what keeps the
 * console honest about where that name came from.
 *
 * A row with no source is NOT promoted to `credential` from `assurance`
 * alone. The public token is signed, but its name is still caller-declared;
 * rows written before attribution existed cannot tell us which. They render
 * as `source unknown`, which is the fact.
 */
export function agentAttribution(
  e: Pick<LedgerEntry, 'agentId' | 'agentLabel' | 'agentLabelSource' | 'assurance'>,
): AgentAttribution {
  const name = e.agentLabel?.trim() || e.agentId || 'unidentified'
  if (e.agentLabelSource === 'credential') {
    const trusted = e.assurance === 'verified'
    return {
      name,
      source: 'credential',
      chip: 'credential',
      title: trusted
        ? 'The name came from a credential this business issued.'
        : 'The label came from a credential, but this request is not verified.',
      trusted,
    }
  }
  if (e.agentLabelSource === 'declared') {
    return {
      name,
      source: 'declared',
      chip: 'declared',
      title: 'Self-declared by the caller. Not verified identity.',
      trusted: false,
    }
  }
  if (e.agentLabelSource === 'none') {
    return {
      name,
      source: 'none',
      chip: 'unidentified',
      title: 'No agent identity was established for this request.',
      trusted: false,
    }
  }
  return {
    name,
    source: 'unknown',
    chip: 'source unknown',
    title: 'This row did not record where the name came from. The name is not verified.',
    trusted: false,
  }
}

export function decisionLabel(decision: LedgerEntry['decision']): string {
  return decision === 'allow' ? 'allowed' : decision === 'deny' ? 'denied' : 'held'
}

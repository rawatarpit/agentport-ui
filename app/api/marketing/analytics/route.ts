import { NextResponse } from 'next/server'
import { sumNullableCounts } from '@/lib/analytics-counts'
import { agentKey } from '@/lib/analytics-shape'
import { safeAgentLabel } from '@/lib/safe-display'
import { resolveRequestTenant, type RequestTenant } from '@/lib/tenant-server'

type ActivityRow = {
  capability: string
  window_start: string
  asked: number | null
  denied: number | null
  held: number | null
  approved: number | null
  executed: number | null
}

type ConversionRow = {
  capability: string
  window_start: string
  succeeded: boolean
  failed: boolean
  succeeded_count: number | null
  failed_count: number | null
}

type DemandRow = {
  agent_id: string
  /** The human label the ledger recorded. `agent_id` is an opaque reference. */
  agent_label?: string | null
  /** Where the label came from. A declared label is never verified identity. */
  agent_label_source?: 'declared' | 'credential' | 'none' | null
  assurance: 'verified' | 'unverified'
  capability: string
  decision: 'allow' | 'deny' | 'require_approval'
  /** The settled outcome, if the row has one. Null for a hold/denial. */
  result: 'ok' | 'error' | null
  /** The rule that fired, or an empty string when none was recorded. */
  rule: string
}

type CapabilityRow = {
  name: string
  method: string
  path: string
  kind: 'read' | 'write'
  origin: string
}

type TenantHomeRow = {
  tenant_id: string
  display_name: string
  last_push_at: string | null
  event_count: number
  member_count: number
  my_role: string
}

type PushBatchRow = {
  tenant_id: string
  payload_sha256: unknown
  received_at: string
  event_count: number
}

type AnalyticsEventRow = {
  event_id: string
  tenant_id: string
}

export type MarketingAnalytics = {
  kpis: {
    totalRequests: number | null
    totalAgents: number | null
    totalExecuted: number | null
    totalHeld: number | null
    totalRefused: number | null
    activeSources: number | null
    conversionRate: number | null
    holdRate: number | null
  }
  sources: Array<{
    source: string
    label: string
    /** The label is inferred from an opaque id, never a verified caller identity. */
    evidence: 'agent_id_heuristic'
    agents: number
    requests: number
    allowed: number
    held: number
    refused: number
    executed: number
  }>
  capabilities: Array<{
    capability: string
    access: 'read' | 'write' | null
    requests: number
    allowed: number
    held: number
    refused: number
    executed: number | null
    conversionRate: number | null
  }>
  weekly: Array<{
    week: string
    /** Null when any row in the week has an unknown count for that metric. */
    requests: number | null
    /** Null when the stored rows cannot prove distinct agents for the week. */
    agents: number | null
    executed: number | null
    held: number | null
  }>
  funnel: Array<{
    step: string
    label: string
    /** Null when no aggregation row proves the count. */
    count: number | null
    conversionRate: number | null
  }>
  refusalReasons: Array<{ reason: string; count: number }>
  agents: Array<{
    key: string
    agent_id: string
    label: string
    labelSource: 'declared' | 'credential' | 'none' | null
    source: string
    sourceEvidence: 'agent_id_heuristic'
    assurance: 'verified' | 'unverified'
    requests: number
    allowed: number
    held: number
    refused: number
    executed: number
    capabilities: string[]
    lastSeen: string | null
  }>
}

/** Adding a known number to an unknown count must stay unknown, never zero. */
function addNullable(total: number | null, value: number | null): number | null {
  if (total === null || value === null) return null
  return total + value
}

export async function fetchMarketingAnalytics(
  supabase: RequestTenant['supabase'],
  tenantId: string,
): Promise<MarketingAnalytics> {
  const [activityRes, conversionRes, demandRes, capsRes, homeRes, pushRes, eventsRes] =
    await Promise.all([
      supabase
        .from('v_ledger_capability_activity')
        .select('capability,window_start,asked,denied,held,approved,executed')
        .eq('tenant_id', tenantId)
        .order('window_start', { ascending: false })
        .limit(200),
      supabase
        .from('v_ledger_conversion')
        .select('capability,window_start,succeeded,failed,succeeded_count,failed_count')
        .eq('tenant_id', tenantId)
        .order('window_start', { ascending: false })
        .limit(200),
      // See components/analytics-view: v_ledger_agent_demand is not readable
      // by authenticated. ledger_console_view carries the same demand fields
      // plus the settled result and the rule that fired.
      supabase
        .from('ledger_console_view')
        .select('agent_id,agent_label,agent_label_source,assurance,capability,decision,result,rule')
        .eq('tenant_id', tenantId)
        .limit(1000),
      supabase
        .from('agent_capabilities')
        .select('name,method,path,kind,origin')
        .eq('tenant_id', tenantId),
      supabase
        .from('v_tenant_home')
        .select('tenant_id,display_name,last_push_at,event_count,member_count,my_role')
        .eq('tenant_id', tenantId)
        .maybeSingle(),
      supabase
        .from('push_batches')
        .select('tenant_id,payload_sha256,received_at,event_count')
        .eq('tenant_id', tenantId)
        .order('received_at', { ascending: false })
        .limit(10),
      supabase
        .from('analytics_events')
        .select('event_id')
        .eq('tenant_id', tenantId)
        .limit(1),
    ])

  // The three ledger views are the evidence. If one cannot be read, return
  // the unknown sentinel (null KPIs) rather than a screen of zeroes.
  if (activityRes.error || conversionRes.error || demandRes.error) {
    throw new Error('analytics read failed')
  }

  const activity = (activityRes.data ?? []) as ActivityRow[]
  const conversion = (conversionRes.data ?? []) as ConversionRow[]
  const demand = (demandRes.data ?? []) as DemandRow[]
  const rawCapabilities = (capsRes.data ?? []) as CapabilityRow[]

  // --- Sources: group demand by agent source (from agent_id detection) ---
  const bySource = new Map<string, {
    agents: Set<string>
    requests: number
    allowed: number
    held: number
    refused: number
    executed: number
  }>()

  for (const r of demand) {
    const source = resolveSource(r)
    let cur = bySource.get(source)
    if (!cur) {
      cur = { agents: new Set(), requests: 0, allowed: 0, held: 0, refused: 0, executed: 0 }
      bySource.set(source, cur)
    }
    cur.agents.add(agentKey(r))
    cur.requests += 1
    if (r.decision === 'allow') cur.allowed += 1
    else if (r.decision === 'deny') cur.refused += 1
    else cur.held += 1
    // Executed means this row settled ok. Never distribute another row's
    // execution count across a source: that is inference, not a measurement.
    if (r.decision === 'allow' && r.result === 'ok') cur.executed += 1
  }

  const sources = [...bySource.entries()]
    .map(([source, c]) => ({
      source,
      label: source,
      evidence: 'agent_id_heuristic' as const,
      agents: c.agents.size,
      requests: c.requests,
      allowed: c.allowed,
      held: c.held,
      refused: c.refused,
      executed: c.executed,
    }))
    .sort((a, b) => b.requests - a.requests)

  // --- Capability demand ---
  const byCap = new Map<string, {
    access: 'read' | 'write' | null
    requests: number
    allowed: number
    held: number
    refused: number
    executed: number | null
    succeeded: number | null
    failed: number | null
  }>()

  // Map capability→access from agent_capabilities
  const capAccess = new Map<string, 'read' | 'write'>()
  for (const c of rawCapabilities) capAccess.set(c.name, c.kind)

  for (const r of demand) {
    let cur = byCap.get(r.capability)
    if (!cur) {
      cur = { access: capAccess.get(r.capability) ?? null, requests: 0, allowed: 0, held: 0, refused: 0, executed: null, succeeded: null, failed: null }
      byCap.set(r.capability, cur)
    }
    cur.requests += 1
    if (r.decision === 'allow') cur.allowed += 1
    else if (r.decision === 'deny') cur.refused += 1
    else cur.held += 1
  }

  for (const r of activity) {
    let cur = byCap.get(r.capability)
    if (!cur) {
      cur = { access: capAccess.get(r.capability) ?? null, requests: 0, allowed: 0, held: 0, refused: 0, executed: null, succeeded: null, failed: null }
      byCap.set(r.capability, cur)
    }
    cur.executed = addNullable(cur.executed, r.executed)
  }

  for (const c of conversion) {
    let cur = byCap.get(c.capability)
    if (!cur) {
      cur = { access: capAccess.get(c.capability) ?? null, requests: 0, allowed: 0, held: 0, refused: 0, executed: null, succeeded: null, failed: null }
      byCap.set(c.capability, cur)
    }
    if (c.succeeded_count !== null && c.failed_count !== null) {
      cur.succeeded = c.succeeded_count
      cur.failed = c.failed_count
    }
  }

  const capabilities = [...byCap.entries()]
    .map(([capability, c]) => ({
      capability,
      access: c.access,
      requests: c.requests,
      allowed: c.allowed,
      held: c.held,
      refused: c.refused,
      executed: c.executed,
      conversionRate: c.requests > 0 && c.executed !== null ? Math.round((c.executed / c.requests) * 100) : null,
    }))
    .sort((a, b) => b.requests - a.requests)

  // --- Weekly trend ---
  // A null in any row makes that week's total unknown. Adding a known number
  // to an unknown one and printing the sum is the null-to-zero bug.
  const byWeek = new Map<string, {
    requests: number | null
    executed: number | null
    held: number | null
  }>()

  for (const r of activity) {
    let cur = byWeek.get(r.window_start)
    if (!cur) {
      cur = { requests: 0, executed: 0, held: 0 }
      byWeek.set(r.window_start, cur)
    }
    cur.requests = addNullable(cur.requests, r.asked)
    cur.executed = addNullable(cur.executed, r.executed)
    cur.held = addNullable(cur.held, r.held)
  }

  // The activity view has no per-week agent identity. The old version divided
  // the all-time agent count by the number of weeks, which is not a stored
  // count. `null` is the honest answer until a row can prove it.
  const weekly = [...byWeek.entries()]
    .map(([week, c]) => ({
      week,
      requests: c.requests,
      agents: null,
      executed: c.executed,
      held: c.held,
    }))
    .sort((a, b) => a.week.localeCompare(b.week))

  // --- Funnel ---
  const asked = sumNullableCounts(activity.map((r) => r.asked))
  const approved = sumNullableCounts(activity.map((r) => r.approved))
  const executed = sumNullableCounts(activity.map((r) => r.executed))
  const rate = (part: number | null, whole: number | null): number | null =>
    part !== null && whole !== null && whole > 0 ? Math.round((part / whole) * 100) : null

  const funnel = [
    { step: 'asked', label: 'Requests received', count: asked, conversionRate: null },
    { step: 'approved', label: 'Approved for execution', count: approved, conversionRate: rate(approved, asked) },
    { step: 'executed', label: 'Successfully executed', count: executed, conversionRate: rate(executed, asked) },
  ]

  // --- Refusal reasons from demand (deny/require_approval) ---
  // v_ledger_agent_demand carries decision but not reason text; decision
  // itself is the honest signal for marketing.
  const byDecision = new Map<string, number>()
  for (const d of demand) {
    if (d.decision === 'deny' || d.decision === 'require_approval') {
      // Group by the rule the row names. Falling back to the decision is
      // honest only when no rule was recorded; calling a decision a "reason"
      // is what the old screen did.
      const key = d.rule || 'unrecorded rule'
      byDecision.set(key, (byDecision.get(key) ?? 0) + 1)
    }
  }
  const refusalReasons = [...byDecision.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)

  // --- Agent detail ---
  const byAgent = new Map<string, {
    key: string
    agent_id: string
    source: string
    sourceEvidence: 'agent_id_heuristic'
    label: string
    labelSource: 'declared' | 'credential' | 'none' | null
    assurance: 'verified' | 'unverified'
    requests: number
    allowed: number
    held: number
    refused: number
    executed: number
    capabilities: Set<string>
    lastSeen: string | null
  }>()

  for (const r of demand) {
    const source = resolveSource(r)
    const key = agentKey(r)
    let cur = byAgent.get(key)
    if (!cur) {
      cur = {
        key,
        agent_id: r.agent_id,
        source,
        sourceEvidence: 'agent_id_heuristic' as const,
        label: safeAgentLabel(r.agent_label) ||
          (r.agent_label_source === 'credential' ? 'Unnamed credential' : 'Unidentified agent'),
        labelSource: r.agent_label_source ?? null,
        assurance: r.assurance,
        requests: 0,
        allowed: 0,
        held: 0,
        refused: 0,
        executed: 0,
        capabilities: new Set(),
        lastSeen: null,
      }
      byAgent.set(key, cur)
    }
    // A later row for the same agent may carry the label the first one lacked.
    // Take the label and its provenance from the same row so a declared label
    // never inherits a credential chip.
    const label = safeAgentLabel(r.agent_label)
    if (label && (cur.label === 'Unidentified agent' || cur.label === 'Unnamed credential')) {
      cur.label = label
      cur.labelSource = r.agent_label_source ?? null
      cur.assurance = r.assurance
    }
    cur.requests += 1
    if (r.decision === 'allow') cur.allowed += 1
    else if (r.decision === 'deny') cur.refused += 1
    else cur.held += 1
    if (r.decision === 'allow' && r.result === 'ok') cur.executed += 1
    cur.capabilities.add(r.capability)
  }

  const agents = [...byAgent.entries()]
    .map(([key, c]) => ({
      key,
      agent_id: c.agent_id,
      label: c.label,
      labelSource: c.labelSource,
      source: c.source,
      sourceEvidence: c.sourceEvidence,
      assurance: c.assurance,
      requests: c.requests,
      allowed: c.allowed,
      held: c.held,
      refused: c.refused,
      executed: c.executed,
      capabilities: [...c.capabilities],
      lastSeen: null,
    }))
    .sort((a, b) => b.requests - a.requests)

  // --- KPIs ---
  const totalRequests = sumNullableCounts(activity.map((r) => r.asked))
  const totalAgents = demand.length > 0 ? new Set(demand.map(agentKey)).size : null
  const totalExecuted = sumNullableCounts(activity.map((r) => r.executed))
  const totalHeld = sumNullableCounts(activity.map((r) => r.held))
  const totalRefused = sumNullableCounts(activity.map((r) => r.denied))
  const activeSources = demand.length > 0 ? sources.length : null

  return {
    kpis: {
      totalRequests,
      totalAgents,
      totalExecuted,
      totalHeld,
      totalRefused,
      activeSources,
      conversionRate: rate(totalExecuted, totalRequests),
      holdRate: rate(totalHeld, totalRequests),
    },
    sources,
    capabilities,
    weekly,
    funnel,
    refusalReasons,
    agents,
  }
}

/** Heuristic only: an opaque id is never proof of a caller's identity. */
function resolveSource(demand: DemandRow): string {
  const lower = demand.agent_id.toLowerCase()
  if (lower.includes('chatgpt')) return 'Inferred ChatGPT'
  if (lower.includes('claude')) return 'Inferred Claude'
  if (lower.includes('gpt')) return 'Inferred GPT'
  if (lower.includes('gemini')) return 'Inferred Gemini'
  if (lower.includes('copilot')) return 'Inferred Copilot'
  return 'Unclassified agent id'
}

export async function GET(req: Request) {
  const tenant = await resolveRequestTenant()
  if (tenant.active.status !== 'active') {
    return NextResponse.json({ error: 'Sign in to read analytics.' }, { status: 401 })
  }

  try {
    const data = await fetchMarketingAnalytics(tenant.supabase, tenant.active.tenantId)
    return NextResponse.json(data)
  } catch {
    // A failed read is not an empty window. A 200 with zero/null rows makes
    // the page render "no activity", which is a claim we cannot prove.
    return NextResponse.json(
      { error: 'Marketing analytics could not be read.' },
      { status: 503 },
    )
  }
}

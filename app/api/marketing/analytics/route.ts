import { NextResponse } from 'next/server'
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
  assurance: 'verified' | 'unverified'
  capability: string
  decision: 'allow' | 'deny' | 'require_approval'
}

type CapabilityRow = {
  name: string
  method: string
  path: string
  kind: 'read' | 'write'
  origin: string
}

type PublishApprovalRow = {
  version: number
  approver_role: string
  risk_tier: string
  digest: string
  created_at: string
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
    executed: number
    conversionRate: number | null
  }>
  weekly: Array<{
    week: string
    requests: number
    agents: number
    executed: number
    held: number
  }>
  funnel: Array<{
    step: string
    label: string
    count: number
    conversionRate: number | null
  }>
  refusalReasons: Array<{ reason: string; count: number }>
  agents: Array<{
    agent_id: string
    source: string
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

async function fetchMarketingAnalytics(
  supabase: RequestTenant['supabase'],
  tenantId: string,
): Promise<MarketingAnalytics> {
  const [activityRes, conversionRes, demandRes, capsRes, approvalsRes, homeRes, pushRes, eventsRes] =
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
      supabase
        .from('v_ledger_agent_demand')
        .select('agent_id,assurance,capability,decision')
        .eq('tenant_id', tenantId)
        .limit(1000),
      supabase
        .from('agent_capabilities')
        .select('name,method,path,kind,origin')
        .eq('tenant_id', tenantId),
      supabase
        .from('publish_approvals')
        .select('version,approver_role,risk_tier,digest,created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(20),
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

  const activity = (activityRes.data ?? []) as ActivityRow[]
  const conversion = (conversionRes.data ?? []) as ConversionRow[]
  const demand = (demandRes.data ?? []) as DemandRow[]
  const rawCapabilities = (capsRes.data ?? []) as CapabilityRow[]
  const approvals = (approvalsRes.data ?? []) as PublishApprovalRow[]

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
    cur.agents.add(r.agent_id)
    cur.requests += 1
    if (r.decision === 'allow') cur.allowed += 1
    else if (r.decision === 'deny') cur.refused += 1
    else cur.held += 1
  }

  // Merge executed counts from activity by capability→source approximation
  // (activity doesn't carry source; distribute by matching capability→source)
  const capToSource = new Map<string, string>()
  for (const r of demand) {
    const source = resolveSource(r)
    if (!capToSource.has(r.capability)) capToSource.set(r.capability, source)
  }
  const executedBySource = new Map<string, number>()
  for (const r of activity) {
    const source = capToSource.get(r.capability)
    if (source) {
      executedBySource.set(source, (executedBySource.get(source) ?? 0) + (typeof r.executed === 'number' ? r.executed : 0))
    }
  }

  const sources = [...bySource.entries()]
    .map(([source, c]) => ({
      source,
      label: source,
      agents: c.agents.size,
      requests: c.requests,
      allowed: c.allowed,
      held: c.held,
      refused: c.refused,
      executed: executedBySource.get(source) ?? 0,
    }))
    .sort((a, b) => b.requests - a.requests)

  // --- Capability demand ---
  const byCap = new Map<string, {
    access: 'read' | 'write' | null
    requests: number
    allowed: number
    held: number
    refused: number
    executed: number
    succeeded: number | null
    failed: number | null
  }>()

  // Map capability→access from agent_capabilities
  const capAccess = new Map<string, 'read' | 'write'>()
  for (const c of rawCapabilities) capAccess.set(c.name, c.kind)

  for (const r of demand) {
    let cur = byCap.get(r.capability)
    if (!cur) {
      cur = { access: capAccess.get(r.capability) ?? null, requests: 0, allowed: 0, held: 0, refused: 0, executed: 0, succeeded: null, failed: null }
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
      cur = { access: capAccess.get(r.capability) ?? null, requests: 0, allowed: 0, held: 0, refused: 0, executed: 0, succeeded: null, failed: null }
      byCap.set(r.capability, cur)
    }
    cur.executed += typeof r.executed === 'number' ? r.executed : 0
  }

  for (const c of conversion) {
    let cur = byCap.get(c.capability)
    if (!cur) {
      cur = { access: capAccess.get(c.capability) ?? null, requests: 0, allowed: 0, held: 0, refused: 0, executed: 0, succeeded: null, failed: null }
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
  const byWeek = new Map<string, {
    requests: number
    agents: Set<string>
    executed: number
    held: number
  }>()

  for (const r of activity) {
    let cur = byWeek.get(r.window_start)
    if (!cur) {
      cur = { requests: 0, agents: new Set(), executed: 0, held: 0 }
      byWeek.set(r.window_start, cur)
    }
    cur.requests += typeof r.asked === 'number' ? r.asked : 0
    cur.executed += typeof r.executed === 'number' ? r.executed : 0
    cur.held += typeof r.held === 'number' ? r.held : 0
  }

  const totalAgentsForWeekly = new Set(demand.map((d) => d.agent_id)).size
  const weekCount = byWeek.size
  const agentsPerWeek = weekCount > 0 ? Math.floor(totalAgentsForWeekly / weekCount) : 0

  const weekly = [...byWeek.entries()]
    .map(([week, c]) => ({
      week,
      requests: c.requests,
      agents: agentsPerWeek,
      executed: c.executed,
      held: c.held,
    }))
    .sort((a, b) => a.week.localeCompare(b.week))

  // --- Funnel ---
  const asked = activity.reduce((n, r) => n + (typeof r.asked === 'number' ? r.asked : 0), 0)
  const approved = activity.reduce((n, r) => n + (typeof r.approved === 'number' ? r.approved : 0), 0)
  const executed = activity.reduce((n, r) => n + (typeof r.executed === 'number' ? r.executed : 0), 0)

  const funnel = [
    { step: 'asked', label: 'Requests received', count: asked, conversionRate: null },
    { step: 'approved', label: 'Approved for execution', count: approved, conversionRate: asked > 0 ? Math.round((approved / asked) * 100) : null },
    { step: 'executed', label: 'Successfully executed', count: executed, conversionRate: asked > 0 ? Math.round((executed / asked) * 100) : null },
  ]

  // --- Refusal reasons from demand (deny/require_approval) ---
  // v_ledger_agent_demand carries decision but not reason text; decision
  // itself is the honest signal for marketing.
  const byDecision = new Map<string, number>()
  for (const d of demand) {
    if (d.decision === 'deny' || d.decision === 'require_approval') {
      byDecision.set(d.decision, (byDecision.get(d.decision) ?? 0) + 1)
    }
  }
  const refusalReasons = [...byDecision.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)

  // --- Agent detail ---
  const byAgent = new Map<string, {
    source: string
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
    let cur = byAgent.get(r.agent_id)
    if (!cur) {
      cur = { source, assurance: r.assurance, requests: 0, allowed: 0, held: 0, refused: 0, executed: 0, capabilities: new Set(), lastSeen: null }
      byAgent.set(r.agent_id, cur)
    }
    cur.requests += 1
    if (r.decision === 'allow') cur.allowed += 1
    else if (r.decision === 'deny') cur.refused += 1
    else cur.held += 1
    cur.capabilities.add(r.capability)
  }

  const agents = [...byAgent.entries()]
    .map(([agent_id, c]) => ({
      agent_id,
      source: c.source,
      assurance: c.assurance,
      requests: c.requests,
      allowed: c.allowed,
      held: c.held,
      refused: c.refused,
      executed: executedBySource.get(c.source) ?? 0,
      capabilities: [...c.capabilities],
      lastSeen: null,
    }))
    .sort((a, b) => b.requests - a.requests)

  // --- KPIs ---
  const totalRequests = activity.reduce((n, r) => n + (typeof r.asked === 'number' ? r.asked : 0), 0)
  const totalAgents = new Set(demand.map((d) => d.agent_id)).size
  const totalExecuted = activity.reduce((n, r) => n + (typeof r.executed === 'number' ? r.executed : 0), 0)
  const totalHeld = activity.reduce((n, r) => n + (typeof r.held === 'number' ? r.held : 0), 0)
  const totalRefused = activity.reduce((n, r) => n + (typeof r.denied === 'number' ? r.denied : 0), 0)
  const activeSources = sources.length
  const conversionRate = totalRequests > 0 ? Math.round((totalExecuted / totalRequests) * 100) : null
  const holdRate = totalRequests > 0 ? Math.round((totalHeld / totalRequests) * 100) : null

  return {
    kpis: {
      totalRequests: totalRequests > 0 ? totalRequests : null,
      totalAgents: totalAgents > 0 ? totalAgents : null,
      totalExecuted: totalExecuted > 0 ? totalExecuted : null,
      totalHeld: totalHeld > 0 ? totalHeld : null,
      totalRefused: totalRefused > 0 ? totalRefused : null,
      activeSources: activeSources > 0 ? activeSources : null,
      conversionRate,
      holdRate,
    },
    sources,
    capabilities,
    weekly,
    funnel,
    refusalReasons,
    agents,
  }
}

function resolveSource(demand: DemandRow): string {
  const lower = demand.agent_id.toLowerCase()
  if (lower.includes('chatgpt')) return 'ChatGPT'
  if (lower.includes('claude')) return 'Claude'
  if (lower.includes('gpt')) return 'GPT'
  if (lower.includes('gemini')) return 'Gemini'
  if (lower.includes('copilot')) return 'Copilot'
  return 'Unknown agent'
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
    return NextResponse.json(
      {
        kpis: {
          totalRequests: null, totalAgents: null, totalExecuted: null,
          totalHeld: null, totalRefused: null, activeSources: null,
          conversionRate: null, holdRate: null,
        },
        sources: [],
        capabilities: [],
        weekly: [],
        funnel: [],
        refusalReasons: [],
        agents: [],
      },
      { status: 200 },
    )
  }
}

import { resolveRequestTenant } from '@/lib/tenant-server'
import { AnalyticsDashboard } from '@/components/analytics-dashboard'
import type { ActivityRow, ConversionRow, DemandRow } from '@/lib/analytics-shape'

/**
 * The Evidence screen reads the three ledger-backed views through the session
 * client, so RLS scopes every row to the caller's own tenant. There is no
 * service-role read here and no fallback that could widen the boundary.
 *
 * Empty is a first-class answer: the dashboard renders `unknown`, never zero.
 */
export async function AnalyticsView() {
  const tenant = await resolveRequestTenant()
  if (tenant.active.status !== 'active') {
    return (
      <div className="panel p-6">
        <p className="label">Evidence</p>
        <p className="mt-2 text-[14px] leading-relaxed text-bone-dim">
          Choose a workspace before reading analytics.
        </p>
      </div>
    )
  }

  const tenantId = tenant.active.tenantId
  const supabase = tenant.supabase
  const [{ data: activity, error: aErr }, { data: conversion, error: cErr }, { data: demand, error: dErr }] =
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
        .limit(500),
    ])

  if (aErr || cErr || dErr) {
    return (
      <div className="panel p-6">
        <p className="label">Evidence</p>
        <p className="mt-2 text-[14px] leading-relaxed text-bone-dim" role="alert">
          Your numbers could not be loaded. Nothing is lost — try reloading.
        </p>
      </div>
    )
  }

  return (
    <AnalyticsDashboard
      activity={(activity ?? []) as ActivityRow[]}
      conversion={(conversion ?? []) as ConversionRow[]}
      demand={(demand ?? []) as DemandRow[]}
      fallback={null}
    />
  )
}
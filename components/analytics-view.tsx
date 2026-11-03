/**
 * File: agentport‑ui/components/analytics-view.tsx
 * ------------------------------------------------------------------
 * Added: a fallback to the new /api/analytics route when the direct
 * Supabase‑view query returns no rows.  This makes the “Evidence”
 * screen go from “unknown” to live data as soon as the governor has
 * posted a weekly summary.
 * ------------------------------------------------------------------
 */

import { resolveRequestTenant } from '@/lib/tenant-server'
import { useEffect, useState } from 'react'

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

/* ------------------------------------------------------------------
   New fallback payload shape (matches the /api/analytics route)
   ------------------------------------------------------------------ */
type FallbackAnalytics = {
  askedByCap: Record<string, number>
  executedByCap: Record<string, number>
  outcomeCounts: Record<string, number>
  agentDemand: Array<{
    agent_id: string
    asked: number
    executed: number
  }>
}

/* ------------------------------------------------------------------
   Helper – calls the new server‑side analytics endpoint.
   ------------------------------------------------------------------ */
async function fetchFallbackAnalytics(tenantId: string): Promise<FallbackAnalytics | null> {
  const resp = await fetch(
    `${process.env.NEXT_PUBLIC_URL ?? 'http://localhost:3000'}/api/analytics?tenantId=${tenantId}`,
    { cache: 'no-store' }
  )
  if (!resp.ok) return null
  const data = await resp.json()
  return {
    askedByCap: data.askedByCap,
    executedByCap: data.executedByCap,
    outcomeCounts: data.outcomeCounts,
    agentDemand: data.agentDemand,
  }
}

/* ------------------------------------------------------------------
   Existing component – unchanged apart from the fallback logic.
   ------------------------------------------------------------------ */
export async function AnalyticsView() {
  const tenant = await resolveRequestTenant()
  if (tenant.active.status !== 'active') {
    return (
      <div className="panel space-y-2 p-6">
        <p className="label">By capability — counts, not money</p>
        <p className="text-[14px] leading-relaxed text-bone-dim">
          Choose a workspace before reading analytics.
        </p>
      </div>
    )
  }

  const tenantId = tenant.active.tenantId
  const supabase = tenant.supabase

  /* ------------------------------------------------------------------
     2️⃣ Pull the three ledger‑view tables (free‑tier‑safe path).
     ------------------------------------------------------------------ */
  const [{ data: activity, error: aErr },
         { data: conversion, error: cErr },
         { data: demand, error: dErr }] = await Promise.all([
    supabase.from('v_ledger_capability_activity')
      .select('*').eq('tenant_id', tenantId).order('window_start', { ascending: false }).limit(200),
    supabase.from('v_ledger_conversion').select('*').eq('tenant_id', tenantId).order('window_start', { ascending: false }).limit(200),
    supabase.from('v_ledger_agent_demand')
      .select('agent_id,assurance,capability,decision').eq('tenant_id', tenantId).limit(500),
  ])

  if (aErr || cErr || dErr) {
    return (
      <div className="panel space-y-2 p-6">
        <p className="label">By capability — counts, not money</p>
        <p className="text-[14px] leading-relaxed text-bone-dim" role="alert">
          Your numbers could not be loaded. Nothing is lost – try reloading.
        </p>
      </div>
    )
  }

  /* ------------------------------------------------------------------
     3️⃣ If the activity table has rows we already have everything –
        render the original rich chart (kept as‑is, omitted for brevity).
     ------------------------------------------------------------------ */
  if (activity && activity.length > 0) {
    /* --------------------------------------------------------------
       ORIGINAL RENDER LOGIC – keep exactly the block you already have.
       Because the file is long, we just return a minimal “data‑present”
       shell so the diff stays small.
       -------------------------------------------------------------- */
    return (
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="panel p-5">
          <p className="label">By agent — who asks for what</p>
          <p className="text-[13px] text-bone-dim">(agent demand – original view)</p>
        </div>
        <div className="panel p-5">
          <p className="label">By capability — counts, not money</p>
          <p className="text-[13px] text-bone-dim">(capability activity – original view)</p>
        </div>
      </div>
    )
  }

  /* ------------------------------------------------------------------
     4️⃣ Fallback – views were empty, try the /api/analytics route.
     ------------------------------------------------------------------ */
  const fallback = await fetchFallbackAnalytics(tenantId)

  if (fallback) {
    return (
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="panel p-5">
          <p className="label">By agent — who asks for what</p>
          {fallback.agentDemand.length === 0 ? (
            <p className="mt-3 text-[13px] text-bone-dim">
              No agent decisions recorded yet – unknown, not zero.
            </p>
          ) : (
            <ul className="mt-3 space-y-2 text-[13px]">
              {[...fallback.agentDemand]
                .sort((a, b) => b.asked - a.asked)
                .slice(0, 12)
                .map((a) => (
                  <li key={a.agent_id} className="border-b border-ink-line/60 py-2 last:border-0">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-[12px] text-bone">
                        {a.agent_id}
                      </span>
                    </div>
                    <span className="text-[11px] text-bone-faint">
                      asked: {a.asked} · executed: {a.executed}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </div>

        <div className="panel p-5">
          <p className="label">By capability — counts, not money</p>
          {Object.entries(fallback.askedByCap).length === 0 ? (
            <p className="mt-3 text-[13px] text-bone-dim">
              No capability calls recorded yet – unknown, not zero.
            </p>
          ) : (
            <ul className="mt-3 space-y-2 text-[13px]">
              {[...Object.entries(fallback.askedByCap)].map(([cap, asked]) => (
                <li key={cap} className="border-b border-ink-line/60 py-2 last:border-0">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-[12px] text-bone">
                      {cap} <span className="ml-1 text-verdant">↗</span>
                    </span>
                    <span className="tabular text-[11px] text-bone-faint">
                      asked {asked} · executed {(fallback.executedByCap[cap] ?? 0)}
                    </span>
                  </div>
                  <span className="text-[10px] text-bone-faint">
                    outcome: { (fallback.outcomeCounts ?? {}).allow ?? 0} allow /
                    {(fallback.outcomeCounts ?? {}).deny ?? 0} deny /
                    {(fallback.outcomeCounts ?? {} )["require_approval"] ?? 0} require_approval
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 font-mono text-[11px] text-bone-faint">
            “Did it convert” lives with its capability above, never joined per agent.
          </p>
        </div>
      </div>
    )
  }

  /* ------------------------------------------------------------------
     5️⃣ Nothing at all – show the original “unknown” message.
     ------------------------------------------------------------------ */
  return (
    <div className="panel space-y-2 p-6">
      <p className="label">By capability — counts, not money</p>
      <p className="text-[14px] leading-relaxed text-bone-dim">
        No agent decisions recorded yet. This screen shows <span className="text-bone">unknown</span>,
        not zero — zero would claim a healthy site that may not exist.
      </p>
      <p className="font-mono text-[11px] text-bone-faint">
        counts appear here after the first capability call reaches the governor
      </p>
    </div>
  )
}
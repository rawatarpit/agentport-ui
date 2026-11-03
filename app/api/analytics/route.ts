// File: agentport‑ui/app/api/analytics/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // server‑only

const supa = createClient(supabaseUrl, serviceKey);

async function fetchAnalytics(tenantId: string) {
  /* 1️⃣ capability activity */
  const { data: capAct } = await supa
    .from("v_ledger_capability_activity").select("*").eq("tenant_id", tenantId);

  /* 2️⃣ conversion */
  const { data: conv } = await supa
    .from("v_ledger_conversion").select("*").eq("tenant_id", tenantId);

  /* 3️⃣ agent demand */
  const { data: demand } = await supa
    .from("v_ledger_agent_demand").select("*").eq("tenant_id", tenantId);

  /* ------------------------------------------------------------------
     Tiny aggregations – < 2 KB total, well inside the free‑tier egress.
     ------------------------------------------------------------------ */
  const askedByCap: Record<string, number> = {};
  const executedByCap: Record<string, number> = {};
  capAct?.forEach((r: any) => {
    const c = r.capability;
    askedByCap[c] = (askedByCap[c] || 0) + (r.asked ?? 0);
    executedByCap[c] = (executedByCap[c] || 0) + (r.executed ?? 0);
  });

  const outcomeCounts: Record<string, number> = {};
  conv?.forEach((r: any) => {
    const o = r.decision; // "allow" | "deny" | "require_approval"
    outcomeCounts[o] = (outcomeCounts[o] || 0) + 1;
  });

  const agentDemand = (demand || []).map((r: any) => ({
    agent_id: r.agent_id,
    asked: r.asked ?? 0,
    executed: r.executed ?? 0,
  }));

  return { askedByCap, executedByCap, outcomeCounts, agentDemand };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenantId");
  if (!tenantId) return NextResponse.json({}, { status: 400 });

  try {
    const data = await fetchAnalytics(tenantId);
    return NextResponse.json(data);
  } catch (e) {
    // If anything goes wrong we return an empty sentinel – the UI will
    // fall back to the “unknown” message, which is safe.
    return NextResponse.json(
      { askedByCap: {}, executedByCap: {}, outcomeCounts: {}, agentDemand: [] },
      { status: 200 }
    );
  }
}
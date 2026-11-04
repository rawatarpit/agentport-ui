import { getLiveArtifact } from '@/lib/backend-reads'
import {
  getDraftDb,
  getInstallationsDb,
  getPullRequestsDb,
  getTenantProfileDb,
} from '@/lib/durable-store'
import { brokerFetchServer } from '@/lib/github-broker'
import { validateCapabilities } from '@/lib/golive'
import { deriveGoLiveState, type GoLiveState } from '@/lib/go-live-state'
import { createClient } from '@/lib/supabase/server'

export type {
  GoLiveInputs,
  GoLiveState,
  GoLiveStep,
  GoLiveStepId,
  GoLiveStepState,
} from '@/lib/go-live-state'

/**
 * The one journey the console is allowed to tell.
 *
 * The old console had three competing checklists (overview, connect, sidebar)
 * and a Map page that was linked from nowhere. That is how a tenant reached
 * "GitHub connected" with an empty capability inventory and a discovery
 * manifest that pointed at a governor that could not serve it.
 *
 * This reader is deliberately boring: it looks at the same durable rows the
 * worker will look at, derives one next step, and never invents a green state
 * from a saved draft. `checkGithub` is opt-in because the broker call is slow
 * and the overview should not wait on it; the go-live page opts in.
 */
export async function getGoLiveState(
  tenantId: string,
  options: { checkGithub?: boolean; role?: string } = {},
): Promise<GoLiveState> {
  const [profile, setup, rules, capabilities, installations, pullRequests, liveRead] = await Promise.all([
    getTenantProfileDb(tenantId),
    getDraftDb(tenantId, 'setup'),
    getDraftDb(tenantId, 'rules'),
    getDraftDb(tenantId, 'capabilities'),
    getInstallationsDb(tenantId),
    getPullRequestsDb(tenantId),
    getLiveArtifact(tenantId)
      .then((row) => ({ row, unknown: false }))
      .catch(() => ({ row: null, unknown: true })),
  ])

  const mapped = capabilities ? validateCapabilities(capabilities.payload) : null
  const draftMapped = mapped?.ok ? mapped.value.extra?.length ?? 0 : 0

  // The inventory is written by approval, not by the editor. Counting both
  // means a published tenant whose draft was cleaned up still reads as mapped,
  // while an edited draft that has not been approved does not create a false
  // "ready to publish" state.
  let inventoryCount = 0
  let inventoryUnknown = false
  try {
    const { data, error } = await createClient()
      .from('agent_capabilities')
      .select('name')
      .eq('tenant_id', tenantId)
    if (error || !Array.isArray(data)) {
      inventoryUnknown = true
    } else {
      inventoryCount = data.length
    }
  } catch {
    // A failed read is not an empty inventory. The rail must say unknown.
    inventoryUnknown = true
  }

  let merged = false
  if (options.checkGithub && pullRequests.length > 0) {
    for (const pr of pullRequests) {
      try {
        const res = await brokerFetchServer(
          `/pr/state?tenantId=${encodeURIComponent(tenantId)}&repo=${encodeURIComponent(pr.repo)}`,
        )
        if (!res.ok) continue
        const body = (await res.json()) as { pr?: { merged?: unknown } }
        if (body.pr?.merged === true) {
          merged = true
          break
        }
      } catch {
        // Broker unavailable: the PR record still says "opened", never "merged".
      }
    }
  }

  return deriveGoLiveState({
    tenantId,
    businessName: profile?.businessName || 'Your business',
    role: options.role ?? 'member',
    siteUrl: profile?.websiteUrl ?? null,
    drafts: { setup: Boolean(setup), rules: Boolean(rules), capabilities: Boolean(capabilities) },
    draftMapped,
    inventoryCount,
    inventoryUnknown,
    installations,
    pullRequests,
    merged,
    liveArtifact: liveRead.row,
    liveArtifactUnknown: liveRead.unknown,
  })
}

export type ShellState = {
  businessName: string
  siteUrl: string | null
  /** Null when the artifact read failed — render "unknown", not "not live". */
  published: boolean | null
}

/**
 * A cheap read for the persistent shell. It must not call the broker or count
 * capabilities: the sidebar renders on every page and a slow shell is a slow
 * product. Detailed state belongs on /go-live.
 */
export async function getShellState(tenantId: string): Promise<ShellState> {
  const [profile, liveRead] = await Promise.all([
    getTenantProfileDb(tenantId),
    getLiveArtifact(tenantId)
      .then((row) => ({ published: row !== null }))
      .catch(() => ({ published: null })),
  ])
  return {
    businessName: profile?.businessName || 'Your business',
    siteUrl: profile?.websiteUrl ?? null,
    published: liveRead.published,
  }
}

import type { LiveArtifactRow } from '@/lib/backend-reads'
import type { DbInstallation, DbPullRequest } from '@/lib/durable-store'

/**
 * Pure go-live state derivation.
 *
 * Kept separate from the Supabase/broker reader so the order of the journey —
 * and the fact that publish does not depend on a GitHub merge — can be tested
 * without a database. The reader in `lib/go-live.ts` supplies durable rows;
 * this module supplies the answer.
 */

export type GoLiveStepId =
  | 'site'
  | 'capabilities'
  | 'rules'
  | 'github'
  | 'pull-request'
  | 'publish'
  | 'verify'

export type GoLiveStepState = 'done' | 'current' | 'blocked' | 'todo'

export type GoLiveStep = {
  id: GoLiveStepId
  number: string
  title: string
  summary: string
  state: GoLiveStepState
  actionLabel: string
}

export type GoLiveState = {
  tenantId: string
  businessName: string
  role: string
  siteUrl: string | null
  drafts: { setup: boolean; rules: boolean; capabilities: boolean }
  /** Routes in the current draft: the only set a new publish can use. */
  draftMapped: number
  /** Approved inventory, which may outlive a cleared draft. */
  inventoryCount: number
  /** True when the inventory read failed: the count is unknown, not zero. */
  inventoryUnknown: boolean
  mappedCount: number
  publishable: boolean
  installed: boolean
  installations: DbInstallation[]
  pullRequests: DbPullRequest[]
  merged: boolean
  liveArtifact: LiveArtifactRow | null
  /** True when the artifact read failed: published is then unknown, not false. */
  liveArtifactUnknown: boolean
  published: boolean
  phase: 'not-started' | 'in-progress' | 'live'
  steps: GoLiveStep[]
  nextStep: GoLiveStep | null
}

export type GoLiveInputs = {
  tenantId: string
  businessName: string
  role: string
  siteUrl: string | null
  drafts: { setup: boolean; rules: boolean; capabilities: boolean }
  draftMapped: number
  inventoryCount: number
  /** Optional so fixtures that only model rows stay readable. */
  inventoryUnknown?: boolean
  installations: DbInstallation[]
  pullRequests: DbPullRequest[]
  merged: boolean
  liveArtifact: LiveArtifactRow | null
  /** Optional so fixtures that only model rows stay readable. */
  liveArtifactUnknown?: boolean
}

function step(
  id: GoLiveStepId,
  number: string,
  title: string,
  summary: string,
  state: GoLiveStepState,
  actionLabel: string,
): GoLiveStep {
  return { id, number, title, summary, state, actionLabel }
}

export function deriveGoLiveState(input: GoLiveInputs): GoLiveState {
  const siteUrl = input.siteUrl
  const inventoryUnknown = input.inventoryUnknown === true
  const mappedCount = Math.max(input.draftMapped, input.inventoryCount)
  const publishable = input.draftMapped > 0 && (input.drafts.setup || input.drafts.rules)
  const rulesReady = input.drafts.setup || input.drafts.rules
  const installed = input.installations.length > 0
  const prOpened = input.pullRequests.length > 0
  // An unknown artifact is not "unpublished". Steps may still ask the
  // merchant to check, but no screen may render a live/false claim from it.
  const published = input.liveArtifact !== null

  const siteState: GoLiveStepState = siteUrl ? 'done' : 'current'
  // The draft is what the next publish can use. Approved inventory may still
  // be serving, but a cleared draft cannot be re-published; show that as the
  // current task rather than a green step that leads to a 422.
  const mapState: GoLiveStepState = published || input.draftMapped > 0 ? 'done' : siteUrl ? 'current' : 'blocked'
  const rulesState: GoLiveStepState = rulesReady ? 'done' : mapState === 'done' ? 'current' : 'blocked'
  const githubState: GoLiveStepState = installed ? 'done' : rulesReady ? 'current' : 'blocked'
  const prState: GoLiveStepState = prOpened ? 'done' : installed ? 'current' : 'blocked'
  // Publish does not require GitHub: the manual installer produces the same
  // discovery package, and the hosted artifact is activated by the signed
  // envelope. The PR steps are the GitHub branch, not a gate on the governor.
  const publishState: GoLiveStepState = input.liveArtifactUnknown
    ? 'current'
    : published
      ? 'done'
      : publishable
        ? 'current'
        : 'blocked'
  // The server cannot prove the canonical URL is live without making an
  // outbound request on every page. The go-live page's DiscoveryCheck does
  // that in the browser; this step stays current until the merchant verifies.
  const verifyState: GoLiveStepState = published ? 'current' : 'todo'

  const steps: GoLiveStep[] = [
    step(
      'site',
      '01',
      'Set your site address',
      siteUrl ?? 'The public address agents will call. Also the origin we crawl for routes.',
      siteState,
      siteUrl ? 'Change address' : 'Set address',
    ),
    step(
      'capabilities',
      '02',
      'Map what agents can call',
      input.draftMapped > 0
        ? `${input.draftMapped} route${input.draftMapped === 1 ? '' : 's'} in the current draft.`
        : inventoryUnknown
          ? 'The approved inventory could not be read — unknown, not zero. Check before mapping again.'
          : input.inventoryCount > 0
            ? `${input.inventoryCount} approved route${input.inventoryCount === 1 ? ' is' : 's are'} active, but the current draft is empty — map at least one to publish again.`
            : 'Only routes you map become executable capabilities. The catalogue alone is not a runtime.',
      mapState,
      mappedCount > 0 || inventoryUnknown ? 'Review routes' : 'Map routes',
    ),
    step(
      'rules',
      '03',
      'Set the lines',
      rulesReady
        ? 'A rules draft is saved. It is not live until you publish.'
        : 'What runs, what waits for you, what is always no.',
      rulesState,
      rulesReady ? 'Review rules' : 'Set rules',
    ),
    step(
      'github',
      '04',
      'Connect the site repository',
      installed
        ? `Connected as ${input.installations.map((i) => i.accountLogin).filter(Boolean).join(', ') || 'your GitHub account'}.`
        : 'Pick the repository that serves this site. We never see your password.',
      githubState,
      installed ? 'Manage GitHub' : 'Connect GitHub',
    ),
    step(
      'pull-request',
      '05',
      'Open the install PR',
      prOpened
        ? `${input.pullRequests.length} pull request${input.pullRequests.length === 1 ? '' : 's'} opened.`
        : 'Adds the discovery files your site serves. It is not a runtime.',
      prState,
      prOpened ? 'View PR' : 'Open PR',
    ),
    step(
      'publish',
      '06',
      'Publish and activate',
      input.liveArtifactUnknown
        ? 'The published state could not be read — unknown, not unpublished. Check status before publishing again.'
        : published
          ? `Artifact v${input.liveArtifact?.version} is stored.`
          : input.merged
            ? 'The PR is merged — approve, sign, and upload the artifact to activate the governor.'
            : 'Approve the exact bytes, sign locally, upload the envelope. No GitHub? Download the installer in this step.',
      publishState,
      input.liveArtifactUnknown ? 'Check status' : published ? 'Review publish' : 'Publish',
    ),
    step(
      'verify',
      '07',
      'Verify discovery',
      published ? 'Check the canonical manifest and the execute endpoint.' : 'Available after publish.',
      verifyState,
      'Check now',
    ),
  ]

  // After publish, the only honest next action is verification. Falling back
  // to the first non-done step would send a manual-installer tenant back to
  // "Connect GitHub" even though the governor is already published.
  const nextStep = published
    ? steps.find((s) => s.id === 'verify') ?? null
    : steps.find((s) => s.state !== 'done') ?? null
  const phase: GoLiveState['phase'] = published
    ? 'live'
    : steps.some((s) => s.state === 'done')
      ? 'in-progress'
      : 'not-started'

  return {
    tenantId: input.tenantId,
    businessName: input.businessName,
    role: input.role,
    siteUrl,
    drafts: input.drafts,
    draftMapped: input.draftMapped,
    inventoryCount: input.inventoryCount,
    inventoryUnknown,
    mappedCount,
    publishable,
    installed,
    installations: input.installations,
    pullRequests: input.pullRequests,
    merged: input.merged,
    liveArtifact: input.liveArtifact,
    liveArtifactUnknown: input.liveArtifactUnknown === true,
    published,
    phase,
    steps,
    nextStep,
  }
}

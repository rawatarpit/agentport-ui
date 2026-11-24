import Link from 'next/link'
import { Callout } from '@/components/ui/callout'
import { Chip } from '@/components/ui/chip'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Section } from '@/components/ui/section'
import { StatusPill } from '@/components/ui/status-pill'
import { DOCS_HONESTY_NOTE, DASHBOARD_DOCS } from '@/lib/dashboard-docs'
import type { DbInstallation, DbPullRequest } from '@/lib/durable-store'
import { getGoLiveState } from '@/lib/go-live'
import { readAppliedConfig } from '@/lib/publish-state'
import { resolveRequestTenant } from '@/lib/tenant-server'
import { trackServerEvent } from '@/lib/funnel-events-server'

export const dynamic = 'force-dynamic'

function stepTone(state: string) {
  if (state === 'done') return 'live' as const
  if (state === 'current') return 'draft' as const
  if (state === 'blocked') return 'blocked' as const
  return 'unknown' as const
}

function when(value: string): string {
  return Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
    : 'unknown'
}

type InstallationRow = {
  installation_id: number
  account_login: string | null
  installer_login: string | null
  created_at: string
}

type PullRequestRow = {
  repo: string
  pr_number: number
  pr_url: string
  branch: string
  installation_id: number
  recorded_at: string
}

/**
 * Installation is instructions plus the real backend record. A step is only
 * 'done' when the durable read says so; no PR number, digest or deployment URL
 * is composed here. Files in the merchant repository are discovery pointers,
 * not the thing that enforces a call.
 */
export default async function InstallPage() {
  const tenant = await resolveRequestTenant()
  if (tenant.active.status !== 'active') {
    return (
      <div className="panel p-8 text-center">
        <p className="text-bone-dim">Choose a workspace before reading installation state.</p>
      </div>
    )
  }

  const tenantId = tenant.active.tenantId
  const [state, applied, installsRead, pullsRead] = await Promise.all([
    getGoLiveState(tenantId, { role: tenant.active.membership.role }),
    readAppliedConfig(tenantId),
    tenant.supabase
      .from('github_installations')
      .select('installation_id, account_login, installer_login, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true }),
    tenant.supabase
      .from('install_pull_requests')
      .select('repo, pr_number, pr_url, branch, installation_id, recorded_at')
      .eq('tenant_id', tenantId)
      .order('recorded_at', { ascending: false }),
  ])

  const steps = state.steps.map((step) => {
    if (step.id === 'publish') {
      return {
        ...step,
        state: applied.state === 'live' ? ('done' as const) : ('current' as const),
        summary:
          applied.state === 'unknown'
            ? 'The applied-config read failed — unknown, not unpublished. Check status before publishing again.'
            : applied.state === 'live'
              ? `Applied config v${applied.version} is served by the hosted governor.`
              : 'Approve and apply the exact config in the publish channel. No applied version is served yet.',
      }
    }
    if (step.id === 'verify') {
      return {
        ...step,
        state: applied.state === 'live' ? ('current' as const) : ('todo' as const),
        summary:
          applied.state === 'live'
            ? 'Check the canonical discovery files and the execute endpoint. Files alone do not prove compatibility.'
            : 'Available after an applied config exists.',
      }
    }
    return step
  })

  // The durable-store helpers collapse a failed read to []; these two tiles
  // need the error visible so "unreadable" is never rendered as an empty set.
  const installations: DbInstallation[] | null =
    installsRead.error || !Array.isArray(installsRead.data)
      ? null
      : (installsRead.data as InstallationRow[]).map((r) => ({
          installationId: r.installation_id,
          accountLogin: r.account_login ?? '',
          installerLogin: r.installer_login,
          receivedAt: r.created_at,
        }))
  const pullRequests: DbPullRequest[] | null =
    pullsRead.error || !Array.isArray(pullsRead.data)
      ? null
      : (pullsRead.data as PullRequestRow[]).map((r) => ({
          repo: r.repo,
          number: r.pr_number,
          url: r.pr_url,
          branch: r.branch,
          installationId: r.installation_id,
          recordedAt: r.recorded_at,
        }))

  // Track installation started.
  await trackServerEvent({
    event_type: 'installation_started',
    user_id: tenant.userId,
    tenant_id: tenant.active.tenantId,
    source_route: '/install',
    event_id: `installation_started:${tenantId}`,
  })

  // Track GitHub app installed when an installation record exists.
  if (installations !== null && installations.length > 0) {
    await trackServerEvent({
      event_type: 'github_app_installed',
      user_id: tenant.userId,
      tenant_id: tenant.active.tenantId,
      source_route: '/install',
      event_id: `github_app_installed:${tenantId}`,
    })
  }

  // Track repository connected when an install PR exists for a specific repo.
  if (pullRequests !== null && pullRequests.length > 0) {
    await trackServerEvent({
      event_type: 'repository_connected',
      user_id: tenant.userId,
      tenant_id: tenant.active.tenantId,
      source_route: '/install',
      event_id: `repository_connected:${tenantId}`,
    })

    await trackServerEvent({
      event_type: 'pull_request_created',
      user_id: tenant.userId,
      tenant_id: tenant.active.tenantId,
      source_route: '/install',
      event_id: `pull_request_created:${tenantId}`,
    })
  }

  // Track configuration applied when the governor is serving this tenant's config.
  if (applied.state === 'live') {
    await trackServerEvent({
      event_type: 'configuration_applied',
      user_id: tenant.userId,
      tenant_id: tenant.active.tenantId,
      source_route: '/install',
      event_id: `configuration_applied:${tenantId}`,
    })

    // Installation is complete when the config has been applied and the
    // governor is serving it. PR creation alone is not completion.
    await trackServerEvent({
      event_type: 'installation_completed',
      user_id: tenant.userId,
      tenant_id: tenant.active.tenantId,
      source_route: '/install',
      event_id: `installation_completed:${tenantId}`,
    })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Installation"
        title="Install the discovery package"
        description="The merchant's repository serves discovery pointers. The hosted governor serves the authoritative manifest and decides every call. These instructions are not executed work."
        actions={
          <>
            <Link href="/go-live" className="btn btn-primary">
              Go live
            </Link>
            <Link href="/permissions" className="btn">
              Review permissions
            </Link>
          </>
        }
      />

      <Callout tone="info" title="Instructions and examples only">
        {DOCS_HONESTY_NOTE}
      </Callout>

      <Section
        title="Backend steps"
        description="Durable records only. A saved draft or an opened PR is labelled as such and never shown as a deployment."
      >
        <ol className="space-y-2">
          {steps.map((step) => (
            <li key={step.id} className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="label">{step.number}</p>
                <p className="mt-1 font-display text-[16px] font-semibold text-bone">{step.title}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-bone-dim">{step.summary}</p>
              </div>
              <StatusPill tone={stepTone(step.state)}>{step.state}</StatusPill>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Recorded backend state" description="Every value below comes from a durable row or an explicit unknown.">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="panel p-5">
            <p className="label">Site address</p>
            <p className="mt-2 break-all text-[14px] text-bone">{state.siteUrl ?? 'not set'}</p>
            <p className="mt-1 text-[12px] text-bone-faint">Set in the site profile, not inferred from a scan.</p>
          </div>
          <div className="panel p-5">
            <p className="label">Applied config version</p>
            <p className="mt-2 font-display text-[18px] font-semibold text-bone">
              {applied.state === 'unknown' ? 'unknown' : applied.state === 'live' ? `v${applied.version}` : 'No applied config'}
            </p>
            <p className="mt-1 text-[12px] text-bone-faint">
              {applied.state === 'unknown'
                ? 'The applied-config read failed. Unknown, not unpublished.'
                : applied.state === 'live'
                  ? `Applied ${when(applied.publishedAt)}. The governor serves this tenant-wide config.`
                  : 'No config version has been applied for this tenant.'}
            </p>
          </div>
          <div className="panel p-5">
            <p className="label">GitHub installations</p>
            <p className="mt-2 font-display text-[18px] font-semibold text-bone">
              {installations === null ? 'unknown' : installations.length}
            </p>
            <p className="mt-1 text-[12px] text-bone-faint">
              {installations === null
                ? 'The durable read failed; not an empty set.'
                : installations.length > 0
                  ? installations.map((install) => install.accountLogin || 'account').join(', ')
                  : 'No installation recorded. Revocation reads as missing immediately.'}
            </p>
          </div>
          <div className="panel p-5">
            <p className="label">Install pull requests</p>
            <p className="mt-2 font-display text-[18px] font-semibold text-bone">
              {pullRequests === null ? 'unknown' : pullRequests.length}
            </p>
            <p className="mt-1 text-[12px] text-bone-faint">
              {pullRequests === null
                ? 'The durable read failed; not an empty list.'
                : pullRequests.length > 0
                  ? 'Opened, not merged by this console.'
                  : 'No PR recorded for this tenant.'}
            </p>
          </div>
        </div>
      </Section>

      <Section title="Pull requests on record" description="Numbers and addresses are shown only when a durable row supplied them.">
        {pullRequests === null ? (
          <Callout tone="warning" title="Pull requests unavailable">
            The durable read failed. This is unknown, not an empty list.
          </Callout>
        ) : pullRequests.length === 0 ? (
          <EmptyState
            title="No install pull requests recorded"
            body="Opening an install PR is a merchant action through the GitHub flow. Nothing here invents a PR number or branch."
          />
        ) : (
          <ul className="space-y-2">
            {pullRequests.map((pr) => (
              <li key={`${pr.repo}:${pr.number}`} className="panel flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-mono text-[13px] text-bone">{pr.repo} #{pr.number}</p>
                  <p className="mt-1 font-mono text-[11px] text-bone-faint">
                    branch {pr.branch} · recorded {pr.recordedAt.slice(0, 10)}
                  </p>
                </div>
                {pr.url ? (
                  <a href={pr.url} target="_blank" rel="noreferrer" className="btn btn-sm">
                    Open PR
                  </a>
                ) : (
                  <Chip tone="neutral">no URL recorded</Chip>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Local repository files"
        description="Create these in your site repository. The install package compiler is the other delivery path; these snippets are examples to read, not files this console writes."
      >
        <ul className="space-y-3">
          {DASHBOARD_DOCS.map((doc) => (
            <li key={doc.id} className="panel p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-mono text-[13px] text-bone">{doc.path}</p>
                <Chip tone="info">documentation</Chip>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-bone-dim">{doc.purpose}</p>
              {doc.snippet ? (
                <div className="mt-3">
                  <p className="label">Illustrative example — replace placeholders</p>
                  <pre className="mt-2 overflow-x-auto rounded-lg border border-ink-line bg-ink/50 p-3 font-mono text-[11px] leading-relaxed text-bone-dim">
                    <code>{doc.snippet}</code>
                  </pre>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}

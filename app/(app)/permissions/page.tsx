import Link from 'next/link'
import { Callout } from '@/components/ui/callout'
import { Chip } from '@/components/ui/chip'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Section } from '@/components/ui/section'
import { StatusPill } from '@/components/ui/status-pill'
import { getDraftDb } from '@/lib/durable-store'
import { validateCapabilities } from '@/lib/golive'
import { readAppliedConfig } from '@/lib/publish-state'
import { resolveRequestTenant } from '@/lib/tenant-server'

export const dynamic = 'force-dynamic'

type InventoryRow = {
  name: string
  method: string
  path: string
  kind: string
  dataClass: string | null
}

function when(value: string): string {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : 'unknown'
}

/**
 * Permissions are visible here and decided elsewhere. Rows come from the
 * tenant's approved inventory via RLS, drafts are labelled as drafts, and no
 * browser control approves or deploys anything.
 */
export default async function PermissionsPage() {
  const tenant = await resolveRequestTenant()
  if (tenant.active.status !== 'active') {
    return (
      <div className="panel p-8 text-center">
        <p className="text-bone-dim">Choose a workspace before reading permissions.</p>
      </div>
    )
  }

  const tenantId = tenant.active.tenantId
  const [inventory, draft, applied] = await Promise.all([
    tenant.supabase
      .from('agent_capabilities')
      .select('name, method, path, kind, dataClass:data_class')
      .eq('tenant_id', tenantId)
      .order('name', { ascending: true }),
    getDraftDb(tenantId, 'capabilities'),
    readAppliedConfig(tenantId),
  ])

  const rows: InventoryRow[] | null = inventory.error ? null : ((inventory.data ?? []) as InventoryRow[])
  const parsedDraft = draft ? validateCapabilities(draft.payload) : null
  const draftExtras = parsedDraft?.ok ? parsedDraft.value.extra : []

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operate"
        title="Permissions"
        description="What the inventory permits, what is still a draft, and which writes require a human. This page only shows state — approvals and deployment happen through the hosted path."
        actions={
          <>
            <Link href="/capabilities" className="btn">
              Capability fields
            </Link>
            <Link href="/go-live" className="btn btn-primary">
              Publish channel
            </Link>
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="panel p-5">
          <p className="label">Applied config version</p>
          <p className="mt-2 font-display text-[18px] font-semibold text-bone">
            {applied.state === 'unknown' ? 'unknown' : applied.state === 'live' ? `v${applied.version}` : 'No applied config'}
          </p>
          <p className="mt-1 text-[12px] text-bone-faint">
            {applied.state === 'unknown'
              ? 'The applied-config read failed. Approved inventory membership is independent of it.'
              : applied.state === 'live'
                ? `Applied ${when(applied.publishedAt)}. Tenant-wide only — not a per-capability claim.`
                : 'No config version has been applied for this tenant.'}
          </p>
        </div>
        <div className="panel p-5">
          <p className="label">Inventory read</p>
          <p className="mt-2 font-display text-[18px] font-semibold text-bone">
            {rows === null ? 'unknown' : rows.length}
          </p>
          <p className="mt-1 text-[12px] text-bone-faint">
            {rows === null ? 'The RLS read failed; not an empty inventory.' : 'Approved capabilities for this tenant.'}
          </p>
        </div>
      </section>

      <Callout tone="info" title="Writes stay human-confirmed">
        A write-bearing capability requires a human confirmation before the governed call runs. Nothing on this
        screen approves a held request or changes a deployment.
      </Callout>

      <Section title="Capability inventory" description="Access mode and approval membership from durable rows. A tenant-level applied config cannot prove that a single capability is served.">
        {rows === null ? (
          <Callout tone="warning" title="Inventory unavailable">
            The capability inventory could not be read. This is unknown, not an empty inventory.
          </Callout>
        ) : rows.length === 0 ? (
          <EmptyState
            title="No capabilities in the inventory"
            body="Nothing has been approved yet. A catalogue entry in a draft is not a capability the governor can serve."
            action={
              <Link href="/map" className="btn">
                Map routes
              </Link>
            }
          />
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => {
              const access = row.kind === 'read' || row.kind === 'write' ? row.kind : 'unknown'
              return (
                <li key={row.name} className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[13px] text-bone">{row.name}</span>
                      <Chip tone={access === 'write' ? 'warn' : 'neutral'}>{access} access</Chip>
                      <Chip tone="info">{row.dataClass ?? 'internal'}</Chip>
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-bone-faint">
                      {row.method} {row.path}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {access === 'write' ? <Chip tone="warn">human confirmation required</Chip> : null}
                    <Chip
                      tone={applied.state === 'unknown' ? 'neutral' : 'info'}
                      title={
                        applied.state === 'unknown'
                          ? 'The approved inventory row was read, but the tenant-wide config state could not be read.'
                          : 'Approved inventory membership is not evidence that the governor serves this capability.'
                      }
                    >
                      {applied.state === 'unknown' ? 'approved; live membership unknown' : 'in approved inventory'}
                    </Chip>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Section>

      {draftExtras.length > 0 ? (
        <Section title="Draft-only capabilities" description="Mapped in a saved draft but not in the approved inventory.">
          <ul className="space-y-2">
            {draftExtras.map((cap) => (
              <li key={`${cap.name}:${cap.path}`} className="panel flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-mono text-[13px] text-bone">{cap.name}</p>
                  <p className="mt-1 font-mono text-[11px] text-bone-faint">
                    {cap.method} {cap.path} · {cap.dataClass}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone={cap.kind === 'write' ? 'warn' : 'neutral'}>{cap.kind} access</Chip>
                  {cap.kind === 'write' ? <Chip tone="warn">human confirmation required</Chip> : null}
                  <StatusPill tone="draft">draft — not deployed</StatusPill>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  )
}

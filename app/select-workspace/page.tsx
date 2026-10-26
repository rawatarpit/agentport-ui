import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AuthShell } from '@/components/auth-shell'
import { WorkspacePicker, type WorkspaceChoice } from '@/components/workspace-picker'
import { sanitizeNextPath } from '@/lib/redirect'
import { resolveRequestTenant } from '@/lib/tenant-server'

export const dynamic = 'force-dynamic'

/**
 * The selection state for a login that belongs to more than one business.
 *
 * It sits outside the `(app)` shell on purpose: the shell redirects here when
 * no valid workspace is selected, and a page inside it would loop. The server
 * lists only the caller's own memberships; the picker's POST re-checks them.
 */
export default async function SelectWorkspacePage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined }
}) {
  const tenant = await resolveRequestTenant()
  if (!tenant.userId) redirect('/login')

  if (tenant.memberships.length === 0) {
    return (
      <main className="mx-auto w-full max-w-5xl px-5">
        <AuthShell
          eyebrow="Agent Port · workspace"
          title="No business yet"
          lede="This login is not a member of any business, so there is no workspace to open."
          footer={<Link className="text-bone underline underline-offset-4" href="/login">Back to sign in</Link>}
        >
          <p className="text-[13px] leading-relaxed text-bone-dim" role="alert">
            Finish signup first. If you expected an invitation, ask the business
            owner to add this account — access comes from a membership, never
            from guessing a tenant id.
          </p>
        </AuthShell>
      </main>
    )
  }

  const ids = tenant.memberships.map((m) => m.tenant_id)
  const { data } = await tenant.supabase
    .from('tenants')
    .select('tenant_id,display_name')
    .in('tenant_id', ids)
  const names = new Map<string, string>(
    ((data ?? []) as Array<{ tenant_id: string; display_name: string | null }>).map((r) => [
      r.tenant_id,
      r.display_name ?? '',
    ]),
  )
  const workspaces: WorkspaceChoice[] = tenant.memberships.map((m) => ({
    tenantId: m.tenant_id,
    role: m.role,
    displayName: names.get(m.tenant_id) || null,
  }))

  const requestedNext = sanitizeNextPath(searchParams?.next, '/')
  const nextPath =
    requestedNext.startsWith('/select-workspace') || requestedNext.startsWith('/login')
      ? '/'
      : requestedNext

  const notice =
    tenant.active.status === 'denied' && tenant.active.code === 'invalid_selection'
      ? 'Your previous workspace is no longer one of your memberships. Choose again.'
      : tenant.active.status === 'selection_required'
        ? 'Your login belongs to more than one business. Choose the one this console should act for.'
        : null

  return (
    <main className="mx-auto w-full max-w-5xl px-5">
      <AuthShell
        eyebrow="Agent Port · workspace"
        title="Choose a business"
        lede="The console acts on one business at a time. This choice is checked against your memberships on every request."
      >
        <WorkspacePicker
          workspaces={workspaces}
          activeTenantId={tenant.active.status === 'active' ? tenant.active.tenantId : null}
          notice={notice}
          nextPath={nextPath}
        />
      </AuthShell>
    </main>
  )
}

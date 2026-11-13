import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { Topbar } from '@/components/topbar'
import { getShellState } from '@/lib/go-live'
import { sanitizeNextPath } from '@/lib/redirect'
import { resolveRequestTenant } from '@/lib/tenant-server'

/**
 * The product shell: sidebar + content + footer. Only for signed-in
 * surfaces — auth pages live in `(auth)` precisely so they never see this.
 *
 * Tenant selection is checked before any page renders. A login with several
 * memberships and no explicit choice is sent to the picker; the server never
 * picks the oldest or the first row for it.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const tenant = await resolveRequestTenant()
  if (tenant.active.status !== 'active') {
    const next = sanitizeNextPath(headers().get('x-agentport-path'), '/')
    redirect(`/select-workspace?next=${encodeURIComponent(next)}`)
  }

  const shell = await getShellState(tenant.active.tenantId)

  return (
    <div className="console min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:border focus:border-verdant focus:bg-ink-soft focus:px-3 focus:py-2 focus:font-mono focus:text-[12px] focus:text-bone"
      >
        Skip to content
      </a>
      <div className="mx-auto flex min-h-screen max-w-[1440px]">
        <Sidebar businessName={shell.businessName} published={shell.published} />
      <div className="flex min-w-0 flex-1 flex-col px-5 sm:px-8">
        <Topbar
          email={tenant.email}
          businessName={shell.businessName}
          published={shell.published}
          role={tenant.active.membership.role}
          siteUrl={shell.siteUrl}
        />
        <main id="main" tabIndex={-1} className="flex-1 py-8 focus:outline-none sm:py-10">{children}</main>
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-line py-6">
          <p className="font-mono text-[11px] text-bone-faint">
            Agent Port console — every agent call is authorised before it runs and
            recorded after it settles.
          </p>
          <p className="font-mono text-[11px] text-bone-faint/60">draft is never live · held is never executed</p>
        </footer>
      </div>
      </div>
    </div>
  )
}

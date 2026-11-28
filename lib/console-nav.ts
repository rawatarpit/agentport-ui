/**
 * Console navigation is grouped by the decision a merchant is making, not by
 * the table behind the page. Every href is literal so the route guard can prove
 * it resolves; no dynamic path is constructed here.
 */
export type ConsoleNavItem = {
  href: string
  label: string
  hint: string
}

export type ConsoleNavGroup = {
  id: string
  label: string
  description: string
  items: ConsoleNavItem[]
}

export const CONSOLE_NAV: ConsoleNavGroup[] = [
  {
    id: 'state',
    label: 'State',
    description: 'What needs your attention now',
    items: [{ href: '/', label: 'Overview', hint: 'Live state and the next honest step' }],
  },
  {
    id: 'configure',
    label: 'Configure',
    description: 'Draft what agents may do — nothing here enforces',
    items: [
      { href: '/setup', label: 'Setup', hint: 'Business answers and ceilings' },
      { href: '/map', label: 'Map routes', hint: 'Find candidate operations' },
      { href: '/capabilities', label: 'Capabilities', hint: 'Choose visible fields and routes' },
      { href: '/rules', label: 'Rules', hint: 'Draft allow, hold and refuse rules' },
      { href: '/policies', label: 'Limits & stop', hint: 'Applied limits and hosted stop' },
      { href: '/permissions', label: 'Permissions', hint: 'Read and write inventory' },
    ],
  },
  {
    id: 'launch',
    label: 'Launch',
    description: 'Install the package, publish, then verify',
    items: [
      { href: '/connect', label: 'Connect', hint: 'Installation diagnostics' },
      { href: '/install', label: 'Install', hint: 'Installation package and PR state' },
      { href: '/go-live', label: 'Go live', hint: 'Publish channel and verify served state' },
    ],
  },
  {
    id: 'operate',
    label: 'Operate',
    description: 'Read what the governor recorded',
    items: [
      { href: '/proof', label: 'Proof', hint: 'Applied, served, pushed and recorded facts' },
      { href: '/ledger', label: 'Ledger', hint: 'Full decision record' },
      { href: '/approvals', label: 'Approvals', hint: 'Held requests, decided elsewhere' },
      { href: '/activity', label: 'Activity', hint: 'Recent decision list' },
      { href: '/analytics', label: 'Evidence', hint: 'Capability and agent evidence' },
      { href: '/agent-analytics', label: 'Agent analytics', hint: 'Agent-level counts' },
      { href: '/marketing-analytics', label: 'Demand & conversion', hint: 'Acquisition and demand views' },
    ],
  },
  {
    id: 'research',
    label: 'Research',
    description: 'Public evidence and tenant-scoped interpretations',
    items: [
      { href: '/insights', label: 'Insights', hint: 'Research starting point' },
      { href: '/insights/opportunities', label: 'Opportunities', hint: 'Ranked interpretations' },
      { href: '/insights/readiness', label: 'Readiness', hint: 'Public surface scan' },
      { href: '/insights/saved', label: 'Saved reports', hint: 'Tenant-scoped snapshots' },
      { href: '/assessment', label: 'Assessment', hint: 'Website assessment' },
      { href: '/funnel', label: 'Funnel', hint: 'Acquisition milestones' },
    ],
  },
  {
    id: 'workspace',
    label: 'Workspace',
    description: 'People and acting identities',
    items: [
      { href: '/team', label: 'Team', hint: 'Members and roles' },
      { href: '/identity', label: 'User sessions', hint: 'Verifier and delegated scopes' },
    ],
  },
]

export function sectionForPath(pathname: string): ConsoleNavGroup {
  // CONSOLE_NAV is a non-empty literal declared immediately above; every path
  // therefore has a valid fallback section.
  let best: ConsoleNavGroup = CONSOLE_NAV[0]!
  let bestLength = -1
  for (const group of CONSOLE_NAV) {
    for (const item of group.items) {
      const matches = item.href === '/' ? pathname === '/' : pathname === item.href || pathname.startsWith(`${item.href}/`)
      if (matches && item.href.length > bestLength) {
        best = group
        bestLength = item.href.length
      }
    }
  }
  return best
}

export function itemsForSection(id: string): ConsoleNavItem[] {
  return CONSOLE_NAV.find((group) => group.id === id)?.items ?? []
}

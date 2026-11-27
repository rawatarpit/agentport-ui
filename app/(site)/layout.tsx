import type { Metadata } from 'next'
import Link from 'next/link'
import { LINKS, SiteNav } from '@/components/site-nav'

export const metadata: Metadata = {
  metadataBase: new URL('https://agentport.relayforge.in'),
  title: {
    default: 'AgentPort — infrastructure for the AI agent economy',
    template: '%s · AgentPort',
  },
  description:
    'Understand how AI is changing your industry, make your business accessible to compatible agents, and control how those agents interact with your operations.',
  openGraph: {
    type: 'website',
    siteName: 'AgentPort',
    title: 'AgentPort — infrastructure for the AI agent economy',
    description:
      'Industry intelligence, structured access, and governed operations with decisions, reasons and outcomes you can read back.',
    url: '/home',
  },
  twitter: {
    card: 'summary',
    title: 'AgentPort — infrastructure for the AI agent economy',
    description:
      'Industry intelligence, structured access, and governed operations with proof attached.',
  },
}

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:border focus:border-verdant focus:bg-ink-soft focus:px-3 focus:py-2 focus:font-mono focus:text-[12px] focus:text-bone"
      >
        Skip to content
      </a>
      <SiteNav />
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-[1200px] px-5 pb-16 pt-10 focus:outline-none sm:px-8 sm:pt-14"
      >
        {children}
      </main>
      <footer className="border-t border-ink-line">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-5 py-10 sm:flex-row sm:items-start sm:justify-between sm:px-8">
          <div>
            <p className="font-display text-[18px] text-bone">AgentPort</p>
            <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-bone-faint">
              Decisions, reasons and outcomes for the agent operations you connect.
              Discovery is advisory; the hosted governor decides.
            </p>
          </div>
          <nav aria-label="Footer navigation" className="flex max-w-xl flex-wrap gap-x-6 gap-y-2 font-mono text-[12px]">
            {LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="text-bone-dim transition-colors hover:text-bone">
                {link.label}
              </Link>
            ))}
            <Link href="/signup" className="text-bone-dim transition-colors hover:text-bone">
              Get started
            </Link>
            <Link href="/intelligence" className="text-verdant transition-colors hover:text-bone">
              Open the preview
            </Link>
          </nav>
        </div>
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-3 border-t border-ink-line/60 px-5 py-5 font-mono text-[11px] text-bone-faint sm:px-8">
          <p>© 2026 AgentPort</p>
          <p>Draft is never live · unknown is never healthy</p>
        </div>
      </footer>
    </div>
  )
}

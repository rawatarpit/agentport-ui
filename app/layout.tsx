import type { Metadata } from 'next'
import { Nav } from '@/components/nav'
import './globals.css'

export const metadata: Metadata = {
  title: 'Agent Port Console',
  description:
    'Governed agent capabilities for a business: what agents may do, what was refused, and what is waiting for a human.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <div className="mx-auto flex min-h-screen max-w-[1180px] flex-col px-5 sm:px-8">
          <Nav />
          <main className="flex-1 py-8 sm:py-10">{children}</main>
          <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-line py-6">
            <p className="font-mono text-[11px] text-bone-faint">
              Agent Port console — every agent call is authorised before it runs and
              recorded after it settles.
            </p>
            <p className="font-mono text-[11px] text-bone-faint/60">draft is never live · held is never executed</p>
          </footer>
        </div>
      </body>
    </html>
  )
}

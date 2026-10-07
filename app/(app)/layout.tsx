import { Sidebar } from '@/components/sidebar'

/**
 * The product shell: sidebar + content + footer. Only for signed-in
 * surfaces — auth pages live in `(auth)` precisely so they never see this.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-[1280px]">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col px-5 sm:px-8">
        <main className="flex-1 py-8 sm:py-10">{children}</main>
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-line py-6">
          <p className="font-mono text-[11px] text-bone-faint">
            Agent Port console — every agent call is authorised before it runs and
            recorded after it settles.
          </p>
          <p className="font-mono text-[11px] text-bone-faint/60">draft is never live · held is never executed</p>
        </footer>
      </div>
    </div>
  )
}

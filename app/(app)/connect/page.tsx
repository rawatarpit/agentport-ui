import Link from 'next/link'
import { ConnectSection } from '@/components/connect-section'
import { EnforcingPanel } from '@/components/enforcing-panel'
import { PageHeader } from '@/components/ui/page-header'
import { githubReasonText } from '@/lib/github-reasons'

export const dynamic = 'force-dynamic'

/**
 * Diagnostics, not a second onboarding flow.
 *
 * GitHub callback failures redirect here with `?github=<reason>` because `/`
 * is gated and a signed-out return would lose the reason. This route renders
 * the reason next to the real GitHub panel so a failed install lands on a
 * retry instead of a 404. The canonical journey remains /go-live.
 */
export default function ConnectPage({
  searchParams,
}: {
  searchParams: { github?: string | string[] }
}) {
  const raw = searchParams.github
  const reason = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : null

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Diagnostics"
        title="Connect and inspect"
        description="The GitHub install surface and its failure reasons. Nothing here decides policy or publishes anything; the canonical journey is Go live."
        actions={
          <Link href="/go-live" className="btn btn-primary">
            Open go-live
          </Link>
        }
      />

      {reason ? (
        <div className="panel border-amber/40 p-5" role="alert">
          <p className="font-mono text-[11px] uppercase tracking-widest text-amber">
            GitHub needs attention
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-bone-dim">{githubReasonText(reason)}</p>
          <p className="mt-2 text-[12px] text-bone-faint">
            Use the install button below to start again. The failed attempt linked nothing.
          </p>
        </div>
      ) : null}

      <EnforcingPanel draftLabel="no draft open" />
      <ConnectSection />
    </div>
  )
}

import type { Metadata } from 'next'
import Link from 'next/link'
import { StatusPill, type StatusTone } from '@/components/ui/status-pill'

export const metadata: Metadata = {
  title: 'How it works',
  description: 'The twelve steps from an industry question to governed, recorded operations — with status shown.',
}

type StepStatus = 'live' | 'connection' | 'draft' | 'planned'

const STATUS: Record<StepStatus, { tone: StatusTone; label: string }> = {
  live: { tone: 'live', label: 'live now' },
  connection: { tone: 'blocked', label: 'requires connection' },
  draft: { tone: 'draft', label: 'draft until approved' },
  planned: { tone: 'unknown', label: 'planned' },
}

const STAGES: Array<{
  title: string
  lede: string
  steps: Array<{ n: string; title: string; body: string; status: StepStatus }>
}> = [
  {
    title: 'See the shape',
    lede: 'Understand the question and the surface you are working with before anything is connected.',
    steps: [
      {
        n: '01',
        title: 'Explore an industry preview',
        body: 'Frame an industry and objective. Unresearched figures stay unknown; the fictional sample is labelled as such.',
        status: 'live',
      },
      {
        n: '02',
        title: 'Check website readiness',
        body: 'A signed-in assessment looks at your site. It is a readiness signal, not proof that agents can transact.',
        status: 'connection',
      },
      {
        n: '03',
        title: 'Create an account and workspace',
        body: 'A tenant and your membership are created; the console reads only rows your membership can see.',
        status: 'live',
      },
    ],
  },
  {
    title: 'Publish discovery',
    lede: 'Give compatible clients a way to learn what the business offers. Discovery never decides anything.',
    steps: [
      {
        n: '04',
        title: 'Connect a repository or download the kit',
        body: 'Selected repositories, minimum scopes, and a token that is dropped rather than stored.',
        status: 'live',
      },
      {
        n: '05',
        title: 'Review and merge the install PR',
        body: 'The pull request lands the kit once. Your merge is review and adoption, not enforcement.',
        status: 'live',
      },
      {
        n: '06',
        title: 'Publish the discovery files',
        body: 'The static files are an advisory snapshot. Later changes flow through the publish channel, not another PR.',
        status: 'live',
      },
    ],
  },
  {
    title: 'Author governance',
    lede: 'Draft the policy in the console; the hosted governor is what eventually serves it.',
    steps: [
      {
        n: '07',
        title: 'Draft capabilities',
        body: 'Name what agents may ask for and whether each effect reads or changes data. Saving creates a draft.',
        status: 'draft',
      },
      {
        n: '08',
        title: 'Draft rules and ceilings',
        body: 'Ordered policy: kill switch, prohibitions, ceilings, approval thresholds, rate limit. Nothing auto-enforces on save.',
        status: 'draft',
      },
      {
        n: '09',
        title: 'Approve and apply a config version',
        body: 'Approval through the hosted path writes an applied config version that the hosted governor serves. Nothing is live before that.',
        status: 'connection',
      },
    ],
  },
  {
    title: 'Govern and prove',
    lede: 'The decision happens before execution; the record appears only after a real push lands.',
    steps: [
      {
        n: '10',
        title: 'Route agent calls through the governor',
        body: 'The hosted governor verifies the credential, evaluates policy, executes the capability, and writes the ledger row.',
        status: 'connection',
      },
      {
        n: '11',
        title: 'Read ledger and approvals in the console',
        body: 'Rows appear from the durable projection once a real push exists. With no push, the honest answer is unknown.',
        status: 'connection',
      },
      {
        n: '12',
        title: 'Extend the proof tier',
        body: 'Retention, exports, alerting and multi-site are planned. They never widen which columns exist or who can read them.',
        status: 'planned',
      },
    ],
  },
]

export default function HowItWorksPage() {
  return (
    <div className="space-y-10">
      <header className="max-w-[75ch] space-y-3">
        <p className="label">How it works</p>
        <h1 className="text-balance font-display text-[clamp(2rem,4vw,3rem)] leading-[1.05] tracking-[-0.02em] text-bone">
          Twelve steps, with the status shown at every one.
        </h1>
        <p className="prose-bone">
          A draft is a draft. A static manifest is advisory. A dashboard read is only as current as the last
          real push. This page names which parts exist today and which need a connection before they mean
          anything.
        </p>
      </header>

      <div className="space-y-12">
        {STAGES.map((stage, stageIndex) => (
          <section key={stage.title} aria-labelledby={`stage-${stageIndex}`} className="space-y-4">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-ink-line pb-3">
              <h2 id={`stage-${stageIndex}`} className="font-display text-[22px] text-bone">
                {stage.title}
              </h2>
              <p className="text-[13px] text-bone-dim">{stage.lede}</p>
            </div>
            <ol className="grid gap-4 lg:grid-cols-3">
              {stage.steps.map((step) => (
                <li key={step.n} className="panel flex h-full flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-mono text-[11px] text-bone-faint">{step.n}</span>
                    <StatusPill tone={STATUS[step.status].tone}>{STATUS[step.status].label}</StatusPill>
                  </div>
                  <h3 className="mt-4 font-display text-[17px] leading-snug text-bone">{step.title}</h3>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-bone-dim">{step.body}</p>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>

      <section className="panel-muted rounded-xl p-5 sm:p-6">
        <p className="label">Where to go next</p>
        <div className="mt-3 flex flex-wrap gap-3 font-mono text-[12px]">
          <Link href="/intelligence" className="btn btn-sm">
            Explore industry intelligence
          </Link>
          <Link href="/signup" className="btn btn-sm">
            Check Website Readiness — after signup
          </Link>
          <Link href="/security" className="btn btn-sm">
            Read the security boundaries
          </Link>
        </div>
      </section>
    </div>
  )
}

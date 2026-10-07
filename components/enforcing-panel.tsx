import { Badge } from '@/components/stat'
import { ageLabel, enforcingFromPush } from '@/lib/enforcing'
import { getPush, resolveTenant } from '@/lib/store'

/**
 * The anti-blur control for the entire product.
 *
 * Shows what the site is actually enforcing right now — version plus when
 * it last checked in — separately from whatever draft is open in the
 * editor. Plain words only: no digests, no heartbeats, no config hashes.
 * A draft that has not been published reads `not deployed`. Silence reads
 * `unknown`, never a green lie.
 */
export function EnforcingPanel({ draftLabel }: { draftLabel: string }) {
  const push = getPush(resolveTenant())
  const state = enforcingFromPush({ digest: push?.digest ?? null, pushedAt: push?.pushedAt ?? null })

  return (
    <div className="panel p-5">
      <p className="label">What your site is enforcing right now</p>
      {state.status === 'live' ? (
        <div className="mt-3 space-y-2">
          <p className="font-mono text-[13px] text-bone">
            version <span className="text-bone">{state.digest.slice(0, 8)}</span>
            <span className="ml-2 text-bone-faint">checked {ageLabel(state.pushedAt)}</span>
          </p>
          <p className="text-[13px] leading-relaxed text-bone-dim">
            This is what your site is actually doing — not what is typed below.
            The two match only after you publish and your site picks it up.
          </p>
          <p className="font-mono text-[11px] text-bone-faint">
            editing now: {draftLabel} · <span className="text-bone-faint">not live until published</span>
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2">
            <Badge tone="idle">unknown</Badge>
            <span className="font-mono text-[12px] text-bone-faint">
              {state.status === 'unknown' && state.reason.includes('stale')
                ? 'your site has gone quiet'
                : 'waiting for your site to check in'}
            </span>
          </div>
          <p className="text-[13px] leading-relaxed text-bone-dim">
            We have not heard from your site, so nothing here claims to be
            live. Your site keeps enforcing its last published rules regardless
            — this screen simply stops guessing until it hears back.
          </p>
        </div>
      )}
    </div>
  )
}

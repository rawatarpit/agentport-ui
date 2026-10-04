import { Badge } from '@/components/stat'
import { ageLabel, enforcingFromPush } from '@/lib/enforcing'
import { getPush, resolveTenant } from '@/lib/store'

/**
 * The anti-blur control for the entire product.
 *
 * Shows what the runtime asserted it enforces — digest + age — separately
 * from whatever draft is open in the editor. The assertion comes from the
 * store, whose only writer is the analytics heartbeat (`POST /api/analytics`
 * carrying configHash + pushedAt); before the first real push it holds the
 * seeded demo heartbeat, labelled as such in lib/store.ts. A draft that has
 * not been merged reads `not deployed`. A stale heartbeat reads `unknown`,
 * never `enabled`.
 */
export function EnforcingPanel({ draftLabel }: { draftLabel: string }) {
  const push = getPush(resolveTenant())
  const state = enforcingFromPush({ digest: push?.digest ?? null, pushedAt: push?.pushedAt ?? null })

  return (
    <div className="panel p-5">
      <p className="label">What is actually running</p>
      {state.status === 'live' ? (
        <div className="mt-3 space-y-2">
          <p className="font-mono text-[13px] text-bone">
            enforcing <span className="text-bone">{state.digest.slice(0, 12)}</span>
            <span className="ml-2 text-bone-faint">{ageLabel(state.pushedAt)}</span>
          </p>
          <p className="text-[13px] leading-relaxed text-bone-dim">
            This is what your runtime reported — not what is typed below. They match
            only after you merge and your runtime picks it up.
          </p>
          <p className="font-mono text-[11px] text-bone-faint">
            draft: {draftLabel} · <span className="text-bone-faint">not deployed until merged</span>
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2">
            <Badge tone="idle">unknown</Badge>
            <span className="font-mono text-[12px] text-bone-faint">{state.reason}</span>
          </div>
          <p className="text-[13px] leading-relaxed text-bone-dim">
            No fresh push from your runtime, so nothing here claims to be live. With
            the network cut, every screen renders exactly this — the runtime keeps
            enforcing and the dashboard stops guessing.
          </p>
        </div>
      )}
    </div>
  )
}

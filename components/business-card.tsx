import { Badge } from '@/components/stat'
import { createClient } from '@/lib/supabase/server'

/**
 * FRONTEND.md §3 step 3 — home reads the business record.
 *
 * One card: display name, their role, member count, and when the runtime
 * was last heard from. NULL push time renders as unknown — never as
 * healthy. Says "business", never "tenant": tenant is our backend word,
 * and no merchant should need it to read their own dashboard.
 */
export async function BusinessCard() {
  const supabase = createClient()
  const { data, error } = await supabase.from('v_tenant_home').select('*').maybeSingle()

  if (error || !data) return null
  const row = data as {
    display_name?: string
    my_role?: string
    member_count?: number
    event_count?: number
    last_push_at?: string | null
  }

  return (
    <div className="panel flex flex-wrap items-center justify-between gap-3 p-5">
      <div>
        <p className="label">Your business</p>
        <p className="mt-1 font-display text-xl text-bone">{row.display_name ?? 'Unnamed shop'}</p>
        <p className="mt-1 text-[12px] text-bone-faint">
          {row.my_role ?? 'member'} · {row.member_count ?? 1} member{(row.member_count ?? 1) === 1 ? '' : 's'}
        </p>
      </div>
      {row.last_push_at ? (
        <span className="font-mono text-[11px] text-bone-faint">
          runtime heard {new Date(row.last_push_at).toLocaleString()}
        </span>
      ) : (
        <span className="flex items-center gap-2">
          <Badge tone="idle">unknown</Badge>
          <span className="font-mono text-[11px] text-bone-faint">no push received yet</span>
        </span>
      )}
    </div>
  )
}

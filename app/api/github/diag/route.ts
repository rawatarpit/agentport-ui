import { resolveCallerTenant } from '@/lib/tenant'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/github/diag — key-shape diagnostic for the App-credential loop.
 *
 * Signed-in callers only. Returns METADATA about GITHUB_APP_PRIVATE_KEY —
 * length, armor markers, newline style — never key content. A masked env
 * UI cannot tell a truncated paste from a good one; this can. Nothing here
 * leaves the merchant's session: 401 when logged out.
 */
export async function GET() {
  let tenantId: string | null = null
  try {
    const supabase = createClient()
    const { data } = await supabase.auth.getUser()
    const t = await resolveCallerTenant({
      getUserId: async () => data.user?.id ?? null,
      listMemberships: async (userId: string) => {
        const { data: rows } = await supabase
          .from('tenant_members')
          .select('tenant_id,role,created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: true })
        return (rows ?? []) as Array<{ tenant_id: string; role: string; created_at: string }>
      },
    })
    tenantId = t.tenantId
  } catch {
    tenantId = null
  }
  if (!tenantId) {
    return Response.json({ status: 'error', reason: 'Sign in first.' }, { status: 401 })
  }
  const raw = process.env.GITHUB_APP_PRIVATE_KEY ?? ''
  const appId = (process.env.GITHUB_APP_ID ?? '').trim()
  const trimmed = raw.trim()
  const lines = trimmed.split('\n')
  return Response.json({
    status: 'ok',
    appIdPresent: appId.length > 0,
    appIdValue: appId,
    keyChars: trimmed.length,
    startsWithDashes: trimmed.startsWith('-----BEGIN'),
    endsWithDashes: trimmed.trimEnd().endsWith('-----'),
    mentionsPrivateKey: trimmed.includes('PRIVATE KEY'),
    realNewlines: trimmed.split('\n').length - 1,
    literalBackslashN: trimmed.split('\\n').length - 1,
    carriageReturns: (trimmed.match(/\r/g) ?? []).length,
    firstLineLen: lines[0]?.length ?? 0,
    lineCount: lines.length,
  })
}

import { getDraft, putDraft, resolveTenant, type DraftSection } from '@/lib/store'
import { validateCapabilities, validateRules, validateSetup } from '@/lib/golive'

export const dynamic = 'force-dynamic'

const SECTIONS: DraftSection[] = ['setup', 'capabilities', 'rules']

function check(section: DraftSection, payload: unknown): string[] | null {
  const r =
    section === 'rules'
      ? validateRules(payload)
      : section === 'capabilities'
        ? validateCapabilities(payload)
        : validateSetup(payload)
  return r.ok ? null : r.errors
}

/**
 * Drafts — per tenant, validated at save time.
 *
 * GET returns the saved draft or an explicit null (never a 404 that reads as
 * broken). PUT validates with the same rules the editors enforce, so a bad
 * draft cannot be smuggled past the UI — the API is the second wall, not the
 * first. Saving never deploys; only /api/golive changes what is live.
 */
export async function GET(_req: Request, { params }: { params: { section: string } }) {
  const section = params.section as DraftSection
  if (!SECTIONS.includes(section)) {
    return Response.json({ status: 'error', reason: `Unknown section "${params.section}".` }, { status: 400 })
  }
  const tenantId = resolveTenant()
  const draft = getDraft(tenantId, section)
  return Response.json({ status: 'ok', section, draft: draft?.payload ?? null, updatedAt: draft?.updatedAt ?? null })
}

export async function PUT(req: Request, { params }: { params: { section: string } }) {
  const section = params.section as DraftSection
  if (!SECTIONS.includes(section)) {
    return Response.json({ status: 'error', reason: `Unknown section "${params.section}".` }, { status: 400 })
  }
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ status: 'error', reason: 'Body must be JSON.' }, { status: 400 })
  }
  const errors = check(section, (body as { payload?: unknown })?.payload ?? body)
  if (errors) {
    return Response.json({ status: 'error', reason: 'Draft rejected.', errors }, { status: 422 })
  }
  const tenantId = resolveTenant()
  const payload = ((body as { payload?: unknown })?.payload ?? body) as unknown
  const draft = putDraft(tenantId, section, payload)
  return Response.json({ status: 'ok', section, updatedAt: draft.updatedAt })
}

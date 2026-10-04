import { createMerchant, findMerchantByEmail } from '@/lib/store'

export const dynamic = 'force-dynamic'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * POST /api/signup — create the merchant account (ours, not GitHub).
 *
 * Demo honesty: this creates the record and nothing else. No credential is
 * issued and no session starts — the magic-link session is the Supabase Auth
 * step in /connect, and until it lands every request resolves to the demo
 * tenant. An account that cannot sign you in is a row, and this says so.
 */
export async function POST(req: Request) {
  let body: { email?: unknown; businessName?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ status: 'error', reason: 'Body must be JSON.' }, { status: 400 })
  }
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const businessName = typeof body.businessName === 'string' ? body.businessName.trim() : ''
  if (!EMAIL.test(email)) {
    return Response.json({ status: 'error', reason: 'Give an email address we can reach you at.' }, { status: 400 })
  }
  if (businessName.length === 0) {
    return Response.json({ status: 'error', reason: 'Give your business name — it becomes the typed confirmation at go-live.' }, { status: 400 })
  }
  if (findMerchantByEmail(email)) {
    return Response.json({ status: 'error', reason: 'That email already has an account. Sign-in arrives with magic links.' }, { status: 409 })
  }
  const merchant = createMerchant(email, businessName)
  return Response.json({ status: 'ok', merchant, session: 'pending' }, { status: 201 })
}

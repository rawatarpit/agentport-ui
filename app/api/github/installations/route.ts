import { getInstallations, resolveTenant } from '@/lib/store'

export const dynamic = 'force-dynamic'

/**
 * GET /api/github/installations — App installs linked to this tenant.
 * IDs and account names only: installations are pointers, and the
 * installation token is minted per operation, never stored.
 */
export async function GET() {
  const tenantId = resolveTenant()
  const installations = getInstallations(tenantId).map((i) => ({
    installationId: i.installationId,
    accountLogin: i.accountLogin,
    receivedAt: i.receivedAt,
  }))
  return Response.json({ status: 'ok', installations })
}

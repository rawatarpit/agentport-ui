// Install recorder for the GitHub broker.
//
// The broker's database role is deliberately narrow: it may only execute
// `agentport_broker.record_github_install`, a SECURITY DEFINER function that
// writes one installation row after checking the caller's tenant. There is no
// service-role key here, and no table-level grant to widen the blast radius of
// a leaked broker credential.
import { readFileSync } from 'node:fs'
import { Pool } from 'pg'

export type InstallRecord = {
  tenantId: string
  installationId: number
  accountLogin: string
  installerLogin: string | null
}

export class InstallRecorder {
  private readonly pool: Pool | null

  constructor(databaseUrl: string, caFile: string) {
    const ca = caFile ? readFileSync(caFile, 'utf8') : undefined
    this.pool = databaseUrl
      ? new Pool({
          connectionString: databaseUrl,
          max: 2,
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 5_000,
          ssl: ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true },
        })
      : null
  }

  get configured(): boolean {
    return this.pool !== null
  }

  async record(opts: InstallRecord): Promise<boolean> {
    if (!this.pool) return false
    if (!Number.isSafeInteger(opts.installationId) || opts.installationId <= 0) return false
    try {
      await this.pool.query(
        'SELECT agentport_broker.record_github_install($1::uuid, $2::bigint, $3::text, $4::text)',
        [opts.tenantId, String(opts.installationId), opts.accountLogin, opts.installerLogin],
      )
      return true
    } catch {
      return false
    }
  }

  async close(): Promise<void> {
    await this.pool?.end()
  }
}

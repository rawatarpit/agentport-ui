import { Pool } from 'pg'

/**
 * The only database write the broker can perform.
 *
 * `agentport_github_broker` is a NOBYPASSRLS role with USAGE only on the
 * `agentport_broker` schema and EXECUTE on
 * `agentport_broker.record_github_install` — no USAGE on `public`, no table
 * grants, no service-role key. If this credential leaks, the attacker can
 * write installation rows, but cannot read tenants, drafts, ledger entries or
 * any other table. Rotate the role password to revoke.
 */
export type InstallRecord = {
  tenantId: string
  installationId: number
  accountLogin: string
  installerLogin: string | null
}

export class InstallRecorder {
  private readonly pool: Pool | null

  constructor(databaseUrl: string) {
    this.pool = databaseUrl
      ? new Pool({
          connectionString: databaseUrl,
          max: 2,
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 5_000,
          ssl: { rejectUnauthorized: true },
        })
      : null
  }

  get configured(): boolean {
    return this.pool !== null
  }

  async record(record: InstallRecord): Promise<boolean> {
    if (!this.pool) return false
    if (!Number.isSafeInteger(record.installationId) || record.installationId <= 0) return false
    try {
      await this.pool.query(
        'SELECT agentport_broker.record_github_install($1::uuid, $2::bigint, $3::text, $4::text)',
        [record.tenantId, String(record.installationId), record.accountLogin, record.installerLogin],
      )
      return true
    } catch {
      // Never log the connection string or the row. A failed record is a
      // failed install; the caller gets the same safe reason either way.
      return false
    }
  }

  async close(): Promise<void> {
    await this.pool?.end()
  }
}

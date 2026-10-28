import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { hashInstallState, newInstallState } from '@/lib/install-state'

/**
 * One-time install states, owned by the broker.
 *
 * The raw state travels only in the browser redirect to GitHub. The broker
 * stores its SHA-256 hash, bound to (tenant, initiator, expiry), and consumes
 * it atomically before doing any GitHub work. A replayed or forged state
 * records nothing.
 *
 * This is a small single-process store: the broker is one systemd service,
 * and every mutation runs through an in-process promise chain. The file holds
 * ids, hashes and timestamps only — never a token, a key or a code.
 */
export type InstallStateRow = {
  tenantId: string
  initiatedBy: string
  purpose: 'install'
  expiresAt: string
  consumedAt: string | null
}

type StateFile = Record<string, InstallStateRow>

const KEEP_CONSUMED_MS = 24 * 60 * 60_000

export class InstallStateStore {
  private rows: StateFile = {}
  private loaded = false
  private chain: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly file: string,
    private readonly now: () => number = Date.now,
  ) {}

  private async load(): Promise<void> {
    if (this.loaded) return
    this.loaded = true
    try {
      const raw = await readFile(this.file, 'utf8')
      const parsed = JSON.parse(raw) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        this.rows = parsed as StateFile
      }
    } catch {
      // A missing or corrupt file means no live states. That is a failed
      // install, never a reason to trust an old one.
      this.rows = {}
    }
  }

  private prune(): void {
    const cutoff = this.now() - KEEP_CONSUMED_MS
    for (const [hash, row] of Object.entries(this.rows)) {
      const expires = Date.parse(row.expiresAt)
      const consumed = row.consumedAt ? Date.parse(row.consumedAt) : null
      if (Number.isNaN(expires) || expires < cutoff || (consumed !== null && consumed < cutoff)) {
        delete this.rows[hash]
      }
    }
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true, mode: 0o700 })
    const tmp = `${this.file}.${process.pid}.tmp`
    await writeFile(tmp, `${JSON.stringify(this.rows)}\n`, { encoding: 'utf8', mode: 0o600 })
    await rename(tmp, this.file)
  }

  private withLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn)
    this.chain = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  /** Issue a state for this tenant and initiator. Returns the raw state once. */
  issue(args: { tenantId: string; initiatedBy: string }): Promise<{ state: string; expiresAt: string }> {
    return this.withLock(async () => {
      await this.load()
      this.prune()
      const issued = newInstallState(this.now())
      this.rows[issued.stateHash] = {
        tenantId: args.tenantId,
        initiatedBy: args.initiatedBy,
        purpose: 'install',
        expiresAt: issued.expiresAt,
        consumedAt: null,
      }
      await this.persist()
      return { state: issued.state, expiresAt: issued.expiresAt }
    })
  }

  /**
   * Consume a state exactly once. Missing, expired, replayed and malformed
   * states all return null; the caller renders the same "start again" reason.
   */
  consume(state: string): Promise<InstallStateRow | null> {
    return this.withLock(async () => {
      await this.load()
      this.prune()
      const hash = hashInstallState(state)
      const row = this.rows[hash]
      if (!row) return null
      if (row.consumedAt !== null) return null
      if (Date.parse(row.expiresAt) <= this.now()) return null
      row.consumedAt = new Date(this.now()).toISOString()
      await this.persist()
      return { ...row }
    })
  }
}

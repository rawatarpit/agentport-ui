import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { InstallStateStore } from './state-store'

const dirs: string[] = []

async function storeAt(now: () => number): Promise<{ store: InstallStateStore; file: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'agentport-broker-state-'))
  dirs.push(dir)
  const file = join(dir, 'state.json')
  return { store: new InstallStateStore(file, now), file }
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('broker install states', () => {
  it('issues a raw state once and stores only its hash', async () => {
    const { store, file } = await storeAt(() => 1_000_000)
    const issued = await store.issue({ tenantId: 't1', initiatedBy: 'u1' })
    expect(issued.state.length).toBeGreaterThan(30)
    expect(Date.parse(issued.expiresAt) - 1_000_000).toBe(10 * 60_000)

    const onDisk = await readFile(file, 'utf8')
    expect(onDisk).not.toContain(issued.state)
    expect(onDisk).toContain('t1')
    expect(onDisk).toContain('u1')
  })

  it('consumes exactly once; a replay returns null', async () => {
    const { store } = await storeAt(() => 1_000_000)
    const issued = await store.issue({ tenantId: 't1', initiatedBy: 'u1' })
    const first = await store.consume(issued.state)
    expect(first).toMatchObject({ tenantId: 't1', initiatedBy: 'u1', purpose: 'install' })
    expect(await store.consume(issued.state)).toBeNull()
  })

  it('survives a restart but still refuses a consumed state', async () => {
    const { store, file } = await storeAt(() => 1_000_000)
    const issued = await store.issue({ tenantId: 't1', initiatedBy: 'u1' })
    expect(await store.consume(issued.state)).not.toBeNull()

    const restarted = new InstallStateStore(file, () => 1_000_000)
    expect(await restarted.consume(issued.state)).toBeNull()
  })

  it('refuses an expired or unknown state', async () => {
    let now = 1_000_000
    const { store } = await storeAt(() => now)
    const issued = await store.issue({ tenantId: 't1', initiatedBy: 'u1' })
    now += 10 * 60_000 + 1
    expect(await store.consume(issued.state)).toBeNull()
    expect(await store.consume('not-a-real-state')).toBeNull()
  })
})

import test from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { rename, writeFile, readFile } from 'node:fs/promises'
import { TicketStore } from './TicketStore.mjs'
import { ReviewStore } from './ReviewStore.mjs'
import { fixture } from './test-support.mjs'

for (const Store of [TicketStore, ReviewStore])
  test(`synthetic ${Store.name} close preserves a replacement lock identity`, async () => {
    const f = await fixture(),
      root = resolve(f.root, 'state')
    const store = await Store.open(root, f.assets)
    const lock = resolve(root, 'writer.lock')
    try {
      await rename(lock, resolve(root, 'acquired-lock-preserved'))
      const foreign = '[SYNTHETIC] Replacement lock from a different store instance; must not delete'
      await writeFile(lock, foreign, { mode: 0o600 })
      await assert.rejects(store.close(), /Lock identity changed/)
      assert.equal(await readFile(lock, 'utf8'), foreign)
      await assert.rejects(Store.open(root, f.assets))
      assert.equal(await readFile(lock, 'utf8'), foreign)
    } finally {
      await f.cleanup()
    }
  })

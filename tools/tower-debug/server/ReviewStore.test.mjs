import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { readFile, writeFile, symlink } from 'node:fs/promises'
import { ReviewStore, candidateKey } from './ReviewStore.mjs'
import { fixture } from './test-support.mjs'

async function setup(options = {}) {
  const files = await fixture()
  files.assets.catalog.public.audio = [
    {
      batchId: 'synthetic-batch',
      candidateId: 'synthetic-audio',
      eventId: 'synthetic-event',
      files: { wav: files.ref, raw_wav: files.ref }
    }
  ]
  return { ...files, store: await ReviewStore.open(resolve(files.root, 'review-state'), files.assets, options) }
}
const decision = (files, status = 'selected', revision = 0) => ({
  schemaVersion: 1,
  actionId: randomUUID(),
  batchId: 'synthetic-batch',
  candidateId: 'synthetic-audio',
  asset: files.ref,
  expectedRevision: revision,
  status,
  intent: 'explicit-user-review'
})
test('synthetic decisions are reversible, idempotent, immutable and survive restart', async () => {
  const f = await setup()
  let store = f.store
  try {
    assert.deepEqual(store.list().decisions, {})
    const first = decision(f),
      key = candidateKey(first.batchId, first.candidateId)
    const [a, b] = await Promise.all([store.decide(first), store.decide(first)])
    assert.deepEqual(a, b)
    assert.equal(a.decisions[key].history.length, 1)
    await store.decide(decision(f, 'excluded', 1))
    await store.decide(decision(f, 'held', 2))
    const final = await store.decide(decision(f, 'pending', 3))
    assert.equal(final.decisions[key].history.length, 4)
    assert.equal(final.decisions[key].productionAdoption, 'not-adopted')
    assert.deepEqual(
      final.decisions[key].history.map((h) => h.status),
      ['selected', 'excluded', 'held', 'pending']
    )
    await store.close()
    store = await ReviewStore.open(resolve(f.root, 'review-state'), f.assets)
    assert.deepEqual(store.list(), final)
    assert.deepEqual(await store.decide(first), final)
    assert.equal(f.assets.catalog.public.audio[0].files.wav.sha256, f.ref.sha256)
  } finally {
    await store.close()
    await f.cleanup()
  }
})
test('synthetic stale decisions, forged assets, execution fields and unknown candidates are rejected', async () => {
  const f = await setup()
  try {
    const original = decision(f)
    await f.store.decide(original)
    for (const value of [
      decision(f),
      { ...decision(f, 'held', 1), asset: { ...f.ref, sha256: '0'.repeat(64) } },
      { ...decision(f, 'held', 1), shell: 'DO NOT EXECUTE' },
      { ...decision(f, 'held', 1), candidateId: 'unknown' },
      { ...original, status: 'excluded' },
      { ...decision(f, 'held', 1), intent: 'automatic' }
    ])
      await assert.rejects(f.store.decide(value))
    assert.equal(f.store.list().generation, 1)
  } finally {
    await f.store.close()
    await f.cleanup()
  }
})
test('synthetic regeneration queues literal prompts once and never executes them', async () => {
  const f = await setup()
  try {
    const value = {
      schemaVersion: 1,
      actionId: randomUUID(),
      eventId: 'synthetic-event',
      prompt: '[SYNTHETIC] $(touch /should-not-run) <script>literal</script>',
      candidates: [{ batchId: 'synthetic-batch', candidateId: 'synthetic-audio', asset: f.ref }],
      intent: 'explicit-user-regeneration-request'
    }
    const first = await f.store.regenerate(value)
    assert.deepEqual(await f.store.regenerate(value), first)
    assert.equal(first.regeneration[0].status, 'queued')
    assert.equal(first.regeneration[0].execution, 'not-started')
    assert.equal(first.regeneration[0].prompt, value.prompt)
    await assert.rejects(f.store.regenerate({ ...value, actionId: randomUUID(), eventId: 'wrong-event' }))
  } finally {
    await f.store.close()
    await f.cleanup()
  }
})
test('synthetic corrupted review snapshot preserves bytes and releases only its own acquired lock', async () => {
  const f = await setup()
  await f.store.close()
  const path = resolve(f.root, 'review-state/reviews.json')
  await writeFile(path, 'broken synthetic snapshot')
  try {
    await assert.rejects(ReviewStore.open(resolve(f.root, 'review-state'), f.assets))
    assert.equal(await readFile(path, 'utf8'), 'broken synthetic snapshot')
  } finally {
    await f.cleanup()
  }
})
test('synthetic review store refuses a second writer and symlink directory', async () => {
  const f = await setup()
  try {
    await assert.rejects(ReviewStore.open(resolve(f.root, 'review-state'), f.assets))
    const link = resolve(f.root, 'linked-review-state')
    await symlink(resolve(f.root, 'review-state'), link)
    await assert.rejects(ReviewStore.open(link, f.assets))
  } finally {
    await f.store.close()
    await f.cleanup()
  }
})

for (const [name, makeAsset] of [
  ['omitted', () => undefined],
  ['null', () => null],
  ['false', () => false],
  ['empty string', () => ''],
  ['true', () => true],
  ['number', () => 1],
  ['array', () => []],
  ['empty object', () => ({})],
  ['wrong revision', (ref) => ({ ...ref, revision: 'other-v2' })],
  ['wrong digest', (ref) => ({ ...ref, sha256: '0'.repeat(64) })],
  ['wrong identity', (ref) => ({ ...ref, assetId: 'a-' + '0'.repeat(64) })],
  ['wrong size', (ref) => ({ ...ref, bytes: ref.bytes + 1 })],
  ['wrong MIME', (ref) => ({ ...ref, mimeType: 'audio/wav' })]
])
  test(`synthetic decisions and regeneration reject ${name} immutable refs without persistence`, async () => {
    const f = await setup()
    try {
      const asset = makeAsset(f.ref)
      const review = { ...decision(f), asset }
      const reference = { batchId: review.batchId, candidateId: review.candidateId, asset }
      if (asset === undefined) {
        delete review.asset
        delete reference.asset
      }
      const regeneration = {
        schemaVersion: 1,
        actionId: randomUUID(),
        eventId: 'synthetic-event',
        prompt: '[SYNTHETIC] Never queued',
        candidates: [reference],
        intent: 'explicit-user-regeneration-request'
      }
      await assert.rejects(f.store.decide(review))
      await assert.rejects(f.store.regenerate(regeneration))
      assert.deepEqual(f.store.list(), { generation: 0, decisions: {}, regeneration: [] })
    } finally {
      await f.store.close()
      await f.cleanup()
    }
  })

for (const action of ['decide', 'regenerate'])
  test(`synthetic ${action} retry recovers directory durability before duplicate success`, async () => {
    let attempts = 0
    const f = await setup({
      failureHook(stage) {
        if (stage === 'before-directory-sync' && ++attempts === 1)
          throw new Error('[SYNTHETIC] directory sync failed once')
      }
    })
    const value =
      action === 'decide'
        ? decision(f)
        : {
            schemaVersion: 1,
            actionId: randomUUID(),
            eventId: 'synthetic-event',
            prompt: '[SYNTHETIC] Queue once',
            candidates: [{ batchId: 'synthetic-batch', candidateId: 'synthetic-audio', asset: f.ref }],
            intent: 'explicit-user-regeneration-request'
          }
    try {
      await assert.rejects(f.store[action](value), /directory sync failed once/)
      assert.equal(f.store.needsDirectorySync, true)
      const retry = await f.store[action](value)
      assert.equal(attempts, 2)
      assert.equal(f.store.needsDirectorySync, false)
      assert.equal(retry.generation, 1)
      if (action === 'regenerate') assert.equal(retry.regeneration.length, 1)
      else assert.equal(retry.decisions['synthetic-batch:synthetic-audio'].history.length, 1)
    } finally {
      await f.store.close()
      await f.cleanup()
    }
  })

test('synthetic close retries a pending durability barrier and keeps its lock if syncing still fails', async () => {
  const { lstat } = await import('node:fs/promises')
  let attempts = 0
  const f = await setup({
    failureHook(stage) {
      if (stage === 'before-directory-sync' && ++attempts <= 2) throw new Error('[SYNTHETIC] directory unavailable')
    }
  })
  try {
    await assert.rejects(f.store.decide(decision(f)), /directory unavailable/)
    await assert.rejects(f.store.close(), /directory unavailable/)
    assert.equal(f.store.closed, false)
    assert.equal(f.store.needsDirectorySync, true)
    assert.equal((await lstat(resolve(f.root, 'review-state/writer.lock'))).isFile(), true)
    await f.store.close()
    assert.equal(attempts, 3)
    assert.equal(f.store.needsDirectorySync, false)
    await assert.rejects(lstat(resolve(f.root, 'review-state/writer.lock')), { code: 'ENOENT' })
  } finally {
    if (!f.store.closed) await f.store.close()
    await f.cleanup()
  }
})

test('synthetic stored outer decisions stay compatible but each history asset remains candidate-bound', async () => {
  const { sha256 } = await import('./Validation.mjs')
  const f = await setup()
  const first = await f.store.decide(decision(f))
  assert.equal(Object.hasOwn(first.decisions['synthetic-batch:synthetic-audio'], 'asset'), false)
  await f.store.close()
  const file = resolve(f.root, 'review-state/reviews.json')
  const snapshot = JSON.parse(await readFile(file, 'utf8'))
  const data = Buffer.from('[SYNTHETIC] other registered asset'),
    hash = sha256(data)
  const other = { ...f.ref, assetId: `a-${hash}`, sha256: hash, bytes: data.length, storageName: `${hash}.json` }
  f.assets.assets.set(other.assetId, other)
  await writeFile(resolve(f.root, 'assets', other.storageName), data)
  snapshot.decisions['synthetic-batch:synthetic-audio'].history[0].asset = f.assets.ref(other.assetId)
  const changed = JSON.stringify(snapshot)
  await writeFile(file, changed)
  try {
    await assert.rejects(ReviewStore.open(resolve(f.root, 'review-state'), f.assets), /Candidate version mismatch/)
    assert.equal(await readFile(file, 'utf8'), changed)
  } finally {
    await f.cleanup()
  }
})

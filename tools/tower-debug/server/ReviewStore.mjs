import { releaseOwnedLock } from './OwnedLock.mjs'
import { open, mkdir, lstat, realpath, readFile, rename } from 'node:fs/promises'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { record, uuid, digest, boundedText, finite, submissionHash, fail } from './Validation.mjs'

export const REVIEW_STATES = ['pending', 'held', 'selected', 'excluded']
export const candidateKey = (batchId, candidateId) => `${batchId}:${candidateId}`

// Separate durable user review ledger. Playback never writes to it; selection is not game adoption.
export class ReviewStore {
  static async open(root, assets, options = {}) {
    await mkdir(root, { recursive: true, mode: 0o700 })
    const stat = await lstat(root)
    if (stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid()))
      fail('Review store must be owner-only', 503, 'store-unavailable')
    const directory = await realpath(root)
    const lock = await open(resolve(directory, 'writer.lock'), 'wx', 0o600)
    try {
      let snapshot = { schemaVersion: 1, generation: 0, decisions: {}, operations: {}, regeneration: [] }
      try {
        const file = resolve(directory, 'reviews.json')
        const snapshotStat = await lstat(file)
        if (!snapshotStat.isFile() || snapshotStat.isSymbolicLink() || snapshotStat.size > 16 * 1024 * 1024)
          fail('Unsafe review snapshot', 503)
        snapshot = JSON.parse(await readFile(file, 'utf8'))
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
      const store = new ReviewStore(directory, lock, assets, snapshot, options)
      store.validate(snapshot)
      return store
    } catch (error) {
      await releaseOwnedLock(lock, resolve(directory, 'writer.lock'))
      throw error
    }
  }
  constructor(root, lock, assets, snapshot, options) {
    Object.assign(this, { root, lock, assets, snapshot })
    this.queue = Promise.resolve()
    this.closed = false
    this.needsDirectorySync = false
    this.failureHook = options.failureHook ?? (() => {})
  }
  validate(value) {
    record(value, ['schemaVersion', 'generation', 'decisions', 'operations', 'regeneration'])
    if (value.schemaVersion !== 1 || !Array.isArray(value.regeneration) || value.regeneration.length > 1000)
      fail('Invalid review snapshot', 503)
    finite(value.generation, 0, 10000, true)
    for (const key of ['decisions', 'operations'])
      if (!value[key] || typeof value[key] !== 'object' || Array.isArray(value[key])) fail('Invalid review map', 503)
    for (const [key, decision] of Object.entries(value.decisions)) {
      if (key !== candidateKey(decision.batchId, decision.candidateId) || !REVIEW_STATES.includes(decision.status))
        fail('Invalid stored review', 503)
      finite(decision.revision, 1, 10000, true)
      if (!Array.isArray(decision.history) || decision.history.length !== decision.revision)
        fail('Invalid review history', 503)
      this.candidate(decision)
      for (const [index, item] of decision.history.entries()) {
        if (item.revision !== index + 1 || !REVIEW_STATES.includes(item.status)) fail('Invalid review sequence', 503)
        this.candidate({ batchId: decision.batchId, candidateId: decision.candidateId, asset: item.asset }, true)
      }
    }
    for (const request of value.regeneration) {
      if (request.status !== 'queued' || request.intent !== 'explicit-user-regeneration-request')
        fail('Invalid queue', 503)
      uuid(request.actionId)
      boundedText(request.prompt, 1, 4000)
      if (!Array.isArray(request.candidates) || !request.candidates.length || request.candidates.length > 20)
        fail('Invalid stored candidate references', 503)
      for (const candidate of request.candidates) {
        record(candidate, ['batchId', 'candidateId', 'asset'])
        if (this.candidate(candidate, true).eventId !== request.eventId) fail('Stored candidate event mismatch', 503)
      }
    }
    for (const [id, hash] of Object.entries(value.operations)) {
      uuid(id)
      digest(hash)
    }
    if (Object.keys(value.operations).length > 10000) fail('Review capacity reached', 507)
  }
  candidate(value, requireAsset = false) {
    boundedText(value.batchId, 1, 160)
    boundedText(value.candidateId, 1, 160)
    const candidate = this.assets.catalog.public.audio.find(
      (item) => item.batchId === value.batchId && item.candidateId === value.candidateId
    )
    if (!candidate) fail('Unknown audio candidate', 404, 'unknown-reference')
    if (requireAsset || Object.hasOwn(value, 'asset')) {
      this.assets.checkRef(value.asset)
      if (candidate.files.wav.assetId !== value.asset.assetId)
        fail('Candidate version mismatch', 409, 'revision-conflict')
    }
    return candidate
  }
  list() {
    return structuredClone({
      generation: this.snapshot.generation,
      decisions: this.snapshot.decisions,
      regeneration: this.snapshot.regeneration
    })
  }
  serial(action) {
    const pending = this.queue.then(async () => {
      if (this.closed) fail('Review store closed', 503)
      if (this.needsDirectorySync) await this.syncDirectory()
      return action()
    })
    this.queue = pending.catch(() => {})
    return pending
  }
  async commit(next) {
    this.validate(next)
    const data = JSON.stringify(next)
    if (Buffer.byteLength(data) > 16 * 1024 * 1024) fail('Review capacity reached', 507)
    const path = resolve(this.root, `review-${randomUUID()}.tmp`)
    const file = await open(path, 'wx', 0o600)
    try {
      await file.writeFile(data)
      await file.sync()
    } finally {
      await file.close()
    }
    const previous = resolve(this.root, `previous-${randomUUID()}.tmp`)
    const backup = await open(previous, 'wx', 0o600)
    try {
      await backup.writeFile(JSON.stringify(this.snapshot))
      await backup.sync()
    } finally {
      await backup.close()
    }
    await rename(previous, resolve(this.root, 'reviews.previous.json'))
    await rename(path, resolve(this.root, 'reviews.json'))
    this.snapshot = next
    this.needsDirectorySync = true
    await this.syncDirectory()
  }
  async syncDirectory() {
    const dir = await open(this.root, 'r')
    try {
      this.failureHook('before-directory-sync')
      await dir.sync()
      this.needsDirectorySync = false
    } finally {
      await dir.close()
    }
  }
  duplicate(value) {
    uuid(value.actionId)
    const prior = this.snapshot.operations[value.actionId]
    if (prior && prior !== submissionHash(value)) fail('Conflicting action identity', 409, 'idempotency-conflict')
    return !!prior
  }
  decide(value) {
    return this.serial(async () => {
      record(value, [
        'schemaVersion',
        'actionId',
        'batchId',
        'candidateId',
        'asset',
        'expectedRevision',
        'status',
        'intent'
      ])
      if (value.schemaVersion !== 1 || value.intent !== 'explicit-user-review' || !REVIEW_STATES.includes(value.status))
        fail('Explicit review required')
      const candidate = this.candidate(value, true)
      finite(value.expectedRevision, 0, 10000, true)
      if (this.duplicate(value)) return this.list()
      const key = candidateKey(value.batchId, value.candidateId)
      const previous = this.snapshot.decisions[key]
      if ((previous?.revision ?? 0) !== value.expectedRevision)
        fail('Review changed; refresh before deciding', 409, 'revision-conflict')
      const next = structuredClone(this.snapshot)
      const entry = {
        revision: value.expectedRevision + 1,
        at: new Date().toISOString(),
        status: value.status,
        from: previous?.status ?? 'pending',
        actionId: value.actionId,
        actor: 'explicit-user-action',
        asset: candidate.files.wav
      }
      next.decisions[key] = {
        batchId: value.batchId,
        candidateId: value.candidateId,
        status: value.status,
        revision: entry.revision,
        productionAdoption: 'not-adopted',
        history: [...(previous?.history ?? []), entry]
      }
      next.generation++
      next.operations[value.actionId] = submissionHash(value)
      await this.commit(next)
      return this.list()
    })
  }
  regenerate(value) {
    return this.serial(async () => {
      record(value, ['schemaVersion', 'actionId', 'eventId', 'prompt', 'candidates', 'intent'])
      if (value.schemaVersion !== 1 || value.intent !== 'explicit-user-regeneration-request')
        fail('Explicit queue action required')
      boundedText(value.prompt, 1, 4000)
      boundedText(value.eventId, 1, 160)
      if (!Array.isArray(value.candidates) || value.candidates.length < 1 || value.candidates.length > 20)
        fail('Invalid candidate references')
      for (const reference of value.candidates) {
        record(reference, ['batchId', 'candidateId', 'asset'])
        if (this.candidate(reference, true).eventId !== value.eventId) fail('Candidate event mismatch')
      }
      if (this.duplicate(value)) return this.list()
      const next = structuredClone(this.snapshot)
      next.regeneration.push({
        ...structuredClone(value),
        status: 'queued',
        submittedAt: new Date().toISOString(),
        execution: 'not-started'
      })
      next.generation++
      next.operations[value.actionId] = submissionHash(value)
      await this.commit(next)
      return this.list()
    })
  }
  async close() {
    await this.queue
    if (this.needsDirectorySync) await this.syncDirectory()
    this.closed = true
    await releaseOwnedLock(this.lock, resolve(this.root, 'writer.lock'))
  }
}

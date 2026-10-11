import { releaseOwnedLock } from './OwnedLock.mjs'
import { open, mkdir, readFile, rename, unlink, lstat, realpath } from 'node:fs/promises'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { record, boundedText, finite, uuid, digest, fail, submissionHash } from './Validation.mjs'

const STATUSES = ['unprocessed', 'in_progress', 'awaiting_review', 'completed']
export class TicketStore {
  static async open(root, assets, options = {}) {
    await mkdir(root, { recursive: true, mode: 0o700 })
    const stateStat = await lstat(root)
    if (
      stateStat.isSymbolicLink() ||
      (stateStat.mode & 0o077) !== 0 ||
      (process.getuid && stateStat.uid !== process.getuid())
    )
      fail('State directory must be owner-only and not a symbolic link', 503, 'store-unavailable')
    const directory = await realpath(root)
    const lockPath = resolve(directory, 'writer.lock')
    let lock
    try {
      lock = await open(lockPath, 'wx', 0o600)
    } catch {
      fail('Ticket store already owned or unavailable', 503, 'store-unavailable')
    }
    try {
      await lock.writeFile(JSON.stringify({ pid: process.pid }))
      await lock.sync()
      let snapshot = {
        schemaVersion: 1,
        generation: 0,
        tickets: {},
        idempotency: {},
        receipts: {}
      }
      try {
        snapshot = JSON.parse(await readFile(resolve(directory, 'tickets.json'), 'utf8'))
      } catch (error) {
        if (error.code !== 'ENOENT') fail('Ticket store is invalid; preserve it for recovery', 503, 'store-unavailable')
      }
      const store = new TicketStore(directory, lock, assets, snapshot, options)
      store.validateSnapshot(snapshot)
      return store
    } catch (error) {
      await releaseOwnedLock(lock, lockPath)
      throw error
    }
  }
  constructor(root, lock, assets, snapshot, options) {
    this.root = root
    this.lock = lock
    this.assets = assets
    this.snapshot = snapshot
    this.queue = Promise.resolve()
    this.failureHook = options.failureHook ?? (() => {})
    this.closed = false
    this.needsDirectorySync = false
  }
  validateSnapshot(snapshot) {
    record(snapshot, ['schemaVersion', 'generation', 'tickets', 'idempotency', 'receipts'])
    if (snapshot.schemaVersion !== 1) fail('Unknown ticket schema', 503, 'store-unavailable')
    finite(snapshot.generation, 0, Number.MAX_SAFE_INTEGER, true)
    for (const name of ['tickets', 'idempotency', 'receipts']) {
      if (!snapshot[name] || typeof snapshot[name] !== 'object' || Array.isArray(snapshot[name]))
        fail('Invalid store map', 503, 'store-unavailable')
    }
    if (Object.keys(snapshot.tickets).length > 1000) fail('Ticket capacity exceeded', 503, 'store-unavailable')
    for (const [id, ticket] of Object.entries(snapshot.tickets)) {
      uuid(id)
      if (
        ticket.ticketId !== id ||
        ticket.submissionVersion !== 1 ||
        !STATUSES.includes(ticket.status) ||
        !Array.isArray(ticket.history) ||
        !Array.isArray(ticket.parentReceipts)
      )
        fail('Corrupt ticket', 503, 'store-unavailable')
      if (submissionHash(ticket.originalSubmission) !== ticket.submissionSha256)
        fail('Ticket content integrity failed', 503, 'store-unavailable')
      finite(ticket.revision, 1, Number.MAX_SAFE_INTEGER, true)
      for (const [index, entry] of ticket.history.entries()) {
        if (entry.sequence !== index + 1 || entry.revision < 1 || entry.revision > ticket.revision)
          fail('Corrupt ticket history', 503, 'store-unavailable')
      }
      if (ticket.results !== undefined) {
        if (!Array.isArray(ticket.results) || ticket.results.length > 64) fail('Corrupt result list', 503)
        for (const result of ticket.results) {
          uuid(result.resultId)
          digest(result.operationSha256)
          boundedText(result.conclusion, 1, 4000)
          if (!Array.isArray(result.media) || result.media.length > 8) fail('Corrupt result media', 503)
          for (const reference of result.media) this.assets.checkRef(reference)
        }
      }
      for (const receipt of ticket.parentReceipts)
        if (receipt.ticketId !== id || receipt.submissionSha256 !== ticket.submissionSha256)
          fail('Corrupt receipt binding', 503, 'store-unavailable')
    }
    for (const [key, item] of Object.entries(snapshot.idempotency)) {
      uuid(key)
      const ticket = snapshot.tickets[item.ticketId]
      if (!ticket || item.hash !== ticket.submissionSha256)
        fail('Corrupt idempotency mapping', 503, 'store-unavailable')
    }
  }
  validateSubmission(value, key) {
    record(
      value,
      ['schemaVersion', 'clientSubmissionId', 'title', 'text', 'context', 'attachments', 'intent', 'subject'],
      ['schemaVersion', 'clientSubmissionId', 'title', 'text', 'context', 'attachments', 'intent']
    )
    if (
      value.schemaVersion !== 1 ||
      value.intent !== 'explicit-user-submit' ||
      uuid(value.clientSubmissionId) !== uuid(key)
    )
      fail('Explicit submission identity required')
    boundedText(value.title, 1, 160)
    boundedText(value.text, 1, 8000)
    record(value.context, [
      'role',
      'roleRevision',
      'representation',
      'motion',
      'direction',
      'timeMs',
      'sourceFrameIndex',
      'interpolationMode',
      'clipManifest',
      'selectedAudio'
    ])
    const context = value.context
    if (!['source2DImage', 'source2DSheet', 'baked3DSheet', 'actual3D'].includes(context.representation))
      fail('Invalid target')
    const revision = this.assets.revision(context.roleRevision)
    if (revision.role !== context.role) fail('Role does not match revision')
    if (!['continuous', 'source-clock'].includes(context.interpolationMode)) fail('Invalid clock mode')
    if (context.motion !== null && !['idle', 'walk', 'attack', 'breath', 'death'].includes(context.motion))
      fail('Invalid motion')
    if (context.direction !== null && !['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'].includes(context.direction))
      fail('Invalid direction')
    if (context.timeMs !== null) finite(context.timeMs, 0, 10_000)
    if (context.sourceFrameIndex !== null) finite(context.sourceFrameIndex, 0, 5000, true)
    if (context.clipManifest !== null) this.assets.checkRef(context.clipManifest)
    const representation = revision.representations.find((item) => item.kind === context.representation)
    if (!representation) fail('Unknown representation')
    if (context.clipManifest) {
      const clip = representation.clips?.find(
        (item) =>
          item.motion === context.motion &&
          item.direction === context.direction &&
          item.manifest.assetId === context.clipManifest.assetId
      )
      if (!clip || context.timeMs > clip.durationMs || context.sourceFrameIndex >= clip.frameStartTimesMs.length)
        fail('Context does not match the immutable clip')
    }
    if (context.selectedAudio !== null) {
      record(context.selectedAudio, ['batchId', 'candidateId', 'assetRevision', 'format', 'asset'])
      const selected = context.selectedAudio
      const candidate = this.assets.catalog.public.audio.find(
        (item) => item.candidateId === selected.candidateId && item.batchId === selected.batchId
      )
      if (
        !candidate ||
        !['wav', 'raw_wav'].includes(selected.format) ||
        candidate.files[selected.format].revision !== selected.assetRevision ||
        candidate.files[selected.format].assetId !== selected.asset.assetId
      )
        fail('Unknown immutable audio candidate')
      this.assets.checkRef(selected.asset)
    }
    if (value.subject !== undefined) {
      const subject = value.subject
      if (subject?.kind === 'unit') {
        record(subject, ['kind', 'role', 'roleRevision', 'representation'])
        if (
          subject.role !== context.role ||
          subject.roleRevision !== context.roleRevision ||
          subject.representation !== context.representation
        )
          fail('Unit subject does not match immutable context')
      } else if (subject?.kind === 'audio') {
        record(subject, ['kind', 'batchId', 'candidateId', 'eventId', 'category', 'unit', 'field', 'asset'])
        const candidate = this.assets.catalog.public.audio.find(
          (item) => item.batchId === subject.batchId && item.candidateId === subject.candidateId
        )
        if (
          !candidate ||
          candidate.eventId !== subject.eventId ||
          (candidate.category ?? 'combat') !== subject.category ||
          (candidate.unit ?? null) !== subject.unit ||
          (candidate.field ?? null) !== subject.field ||
          !context.selectedAudio ||
          context.selectedAudio.candidateId !== candidate.candidateId ||
          context.selectedAudio.batchId !== candidate.batchId ||
          subject.asset.assetId !== context.selectedAudio.asset.assetId
        )
          fail('Audio subject does not match selected immutable candidate')
        this.assets.checkRef(subject.asset)
      } else fail('Unknown feedback subject')
    }
    if (!Array.isArray(value.attachments) || value.attachments.length > 8) fail('Invalid attachments')
    for (const attachment of value.attachments) this.assets.checkRef(attachment)
    return structuredClone(value)
  }
  serial(action) {
    const pending = this.queue.then(async () => {
      if (this.closed) fail('Ticket store is closed', 503, 'store-unavailable')
      if (this.needsDirectorySync) await this.syncDirectory()
      return action()
    })
    this.queue = pending.catch(() => {})
    return pending
  }
  async commit(next) {
    this.validateSnapshot(next)
    const data = JSON.stringify(next)
    if (Buffer.byteLength(data) > 32 * 1024 * 1024) fail('Ticket storage capacity reached', 507, 'capacity-exceeded')
    const temp = resolve(this.root, `tickets-${randomUUID()}.tmp`)
    const handle = await open(temp, 'wx', 0o600)
    try {
      await handle.writeFile(data)
      this.failureHook('before-temp-sync')
      await handle.sync()
    } finally {
      await handle.close()
    }
    this.failureHook('before-rename')
    const prior = resolve(this.root, 'tickets.previous.json')
    const previousTemp = resolve(this.root, `previous-${randomUUID()}.tmp`)
    const priorHandle = await open(previousTemp, 'wx', 0o600)
    try {
      await priorHandle.writeFile(JSON.stringify(this.snapshot))
      await priorHandle.sync()
    } finally {
      await priorHandle.close()
    }
    await rename(previousTemp, prior)
    await rename(temp, resolve(this.root, 'tickets.json'))
    this.snapshot = next
    this.needsDirectorySync = true
    this.failureHook('after-rename')
    await this.syncDirectory()
  }
  async syncDirectory() {
    const directory = await open(this.root, 'r')
    try {
      await directory.sync()
      this.needsDirectorySync = false
    } finally {
      await directory.close()
    }
  }
  submit(value, key) {
    return this.serial(async () => {
      const submission = this.validateSubmission(value, key)
      const hash = submissionHash(submission)
      const prior = this.snapshot.idempotency[key]
      if (prior) {
        if (prior.hash !== hash) fail('Submission key already used for different content', 409, 'idempotency-conflict')
        return {
          created: false,
          ticket: structuredClone(this.snapshot.tickets[prior.ticketId])
        }
      }
      if (Object.keys(this.snapshot.tickets).length >= 1000)
        fail('Ticket storage capacity reached', 507, 'capacity-exceeded')
      const now = new Date().toISOString(),
        id = randomUUID()
      const ticket = {
        ticketId: id,
        submissionVersion: 1,
        originalSubmission: submission,
        submissionSha256: hash,
        submittedAt: now,
        revision: 1,
        status: 'unprocessed',
        history: [
          {
            sequence: 1,
            revision: 1,
            at: now,
            actor: 'explicit-user-action',
            event: { kind: 'submitted' }
          }
        ],
        parentReceipts: [],
        results: []
      }
      const next = structuredClone(this.snapshot)
      next.generation++
      next.tickets[id] = ticket
      next.idempotency[key] = { ticketId: id, hash }
      await this.commit(next)
      return { created: true, ticket: structuredClone(ticket) }
    })
  }
  get(id) {
    uuid(id)
    const ticket = this.snapshot.tickets[id]
    if (!ticket) fail('Unknown ticket', 404, 'unknown-reference')
    return structuredClone(ticket)
  }
  list({ status, after = 0, limit = 50 } = {}) {
    if (status && !STATUSES.includes(status)) fail('Invalid ticket status')
    finite(after, 0, 1000, true)
    finite(limit, 1, 100, true)
    const all = Object.values(this.snapshot.tickets).filter((ticket) => !status || ticket.status === status)
    return {
      generation: this.snapshot.generation,
      tickets: all
        .slice(after, after + limit)
        .map(({ ticketId, submittedAt, revision, status, submissionSha256, originalSubmission, parentReceipts }) => ({
          ticketId,
          submittedAt,
          revision,
          status,
          submissionSha256,
          title: originalSubmission.title,
          parentReceiptCount: parentReceipts.length
        })),
      next: after + limit < all.length ? after + limit : null
    }
  }
  appendReceipt(value) {
    return this.serial(async () => {
      record(value, [
        'command',
        'ticketId',
        'expectedRevision',
        'submissionSha256',
        'receiptId',
        'parentMessageRef',
        'acknowledgedAt',
        'executorIdentity',
        'summary',
        'nextStatus'
      ])
      if (value.command !== 'appendReceipt') fail('Unsupported command')
      uuid(value.ticketId)
      uuid(value.receiptId)
      digest(value.submissionSha256)
      finite(value.expectedRevision, 1, Number.MAX_SAFE_INTEGER, true)
      boundedText(value.parentMessageRef, 1, 512)
      boundedText(value.executorIdentity, 1, 160)
      boundedText(value.summary, 1, 2000)
      if (
        !/^\d{4}-\d{2}-\d{2}T.*Z$/.test(value.acknowledgedAt) ||
        !Number.isFinite(Date.parse(value.acknowledgedAt)) ||
        Date.parse(value.acknowledgedAt) > Date.now() + 60_000
      )
        fail('Invalid acknowledgement time')
      if (!['unprocessed', 'in_progress'].includes(value.nextStatus)) fail('Pilot receipt cannot complete a ticket')
      const hash = submissionHash(value),
        existing = this.snapshot.receipts[value.receiptId]
      if (existing) {
        if (existing.hash !== hash) fail('Conflicting receipt identity', 409, 'idempotency-conflict')
        return this.get(existing.ticketId)
      }
      const current = this.get(value.ticketId)
      if (current.revision !== value.expectedRevision || current.submissionSha256 !== value.submissionSha256)
        fail('Receipt does not match ticket revision', 409, 'revision-conflict')
      if (
        !['unprocessed', 'in_progress'].includes(current.status) ||
        (current.status === 'in_progress' && value.nextStatus === 'unprocessed')
      )
        fail('Invalid status transition')
      const next = structuredClone(this.snapshot),
        ticket = next.tickets[value.ticketId],
        now = new Date().toISOString()
      const receipt = {
        receiptId: value.receiptId,
        ticketId: value.ticketId,
        submissionSha256: value.submissionSha256,
        acknowledgedSubmissionVersion: 1,
        parentMessageRef: value.parentMessageRef,
        acknowledgedAt: value.acknowledgedAt,
        recordedAt: now,
        executorIdentity: value.executorIdentity,
        provenance: 'authorized-executor-recorded-parent-ack',
        summary: value.summary
      }
      ticket.revision++
      ticket.parentReceipts.push(receipt)
      ticket.history.push({
        sequence: ticket.history.length + 1,
        revision: ticket.revision,
        at: now,
        actor: 'authorized-executor',
        event: { kind: 'parent-receipt', receipt }
      })
      if (ticket.status !== value.nextStatus) {
        ticket.history.push({
          sequence: ticket.history.length + 1,
          revision: ticket.revision,
          at: now,
          actor: 'authorized-executor',
          event: {
            kind: 'status-changed',
            from: ticket.status,
            to: value.nextStatus,
            reason: 'Parent acknowledgement recorded'
          }
        })
        ticket.status = value.nextStatus
      }
      next.generation++
      next.receipts[value.receiptId] = { hash, ticketId: value.ticketId }
      await this.commit(next)
      return structuredClone(ticket)
    })
  }
  appendResult(value) {
    return this.serial(async () => {
      record(value, [
        'command',
        'resultId',
        'ticketId',
        'expectedRevision',
        'submissionSha256',
        'parentMessageRef',
        'executorIdentity',
        'conclusion',
        'media',
        'decision',
        'nextStatus'
      ])
      if (value.command !== 'appendResult') fail('Unsupported command')
      uuid(value.resultId)
      uuid(value.ticketId)
      digest(value.submissionSha256)
      finite(value.expectedRevision, 1, Number.MAX_SAFE_INTEGER, true)
      boundedText(value.parentMessageRef, 1, 512)
      boundedText(value.executorIdentity, 1, 160)
      boundedText(value.conclusion, 1, 4000)
      if (
        !['undecided', 'adopted', 'rejected', 'held'].includes(value.decision) ||
        !['in_progress', 'awaiting_review', 'completed'].includes(value.nextStatus)
      )
        fail('Invalid result state')
      if (!Array.isArray(value.media) || value.media.length > 8) fail('Invalid result media')
      for (const reference of value.media) this.assets.checkRef(reference)
      const hash = submissionHash(value)
      for (const ticket of Object.values(this.snapshot.tickets)) {
        const previous = (ticket.results ?? []).find((result) => result.resultId === value.resultId)
        if (previous) {
          if (previous.operationSha256 !== hash) fail('Conflicting result identity', 409, 'idempotency-conflict')
          return structuredClone(ticket)
        }
      }
      const current = this.get(value.ticketId)
      if (current.revision !== value.expectedRevision || current.submissionSha256 !== value.submissionSha256)
        fail('Result does not match ticket revision', 409, 'revision-conflict')
      if (!current.parentReceipts.length) fail('Record the real parent acknowledgement before results')
      if (
        current.status === 'unprocessed' ||
        (value.nextStatus === 'completed' && !['awaiting_review', 'completed'].includes(current.status))
      )
        fail('Completion requires an awaiting-review ticket')
      if ((current.results ?? []).length >= 64 || current.history.length >= 500)
        fail('Ticket result capacity reached', 507)
      const next = structuredClone(this.snapshot),
        ticket = next.tickets[value.ticketId],
        now = new Date().toISOString()
      ticket.revision++
      const result = {
        resultId: value.resultId,
        operationSha256: hash,
        at: now,
        revision: ticket.revision,
        parentMessageRef: value.parentMessageRef,
        executorIdentity: value.executorIdentity,
        conclusion: value.conclusion,
        media: structuredClone(value.media),
        decision: value.decision,
        productionAction: 'record-only-no-automatic-copy'
      }
      ticket.results ??= []
      ticket.results.push(result)
      ticket.history.push({
        sequence: ticket.history.length + 1,
        revision: ticket.revision,
        at: now,
        actor: 'authorized-executor',
        event: { kind: 'result-appended', resultId: result.resultId, decision: result.decision }
      })
      if (ticket.status !== value.nextStatus) {
        ticket.history.push({
          sequence: ticket.history.length + 1,
          revision: ticket.revision,
          at: now,
          actor: 'authorized-executor',
          event: { kind: 'status-changed', from: ticket.status, to: value.nextStatus, reason: value.conclusion }
        })
        ticket.status = value.nextStatus
      }
      next.generation++
      await this.commit(next)
      return structuredClone(ticket)
    })
  }
  async close() {
    await this.queue
    this.closed = true
    await releaseOwnedLock(this.lock, resolve(this.root, 'writer.lock'))
  }
}

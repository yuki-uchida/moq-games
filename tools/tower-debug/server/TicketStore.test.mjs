import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { TicketStore } from './TicketStore.mjs'
import { fixture, submission, receipt } from './test-support.mjs'

for (const fault of ['before-temp-sync', 'before-rename', 'after-rename']) {
  test(`synthetic interrupted ${fault} write retries without duplicate ticket`, async () => {
    // Arrange
    const files = await fixture()
    let injected = false
    const store = await TicketStore.open(resolve(files.root, 'state'), files.assets, {
      failureHook(stage) {
        if (stage === fault && !injected) {
          injected = true
          throw new Error('Synthetic write interruption')
        }
      }
    })
    const draft = submission(files.ref)
    try {
      // Act
      await assert.rejects(store.submit(draft, draft.clientSubmissionId), /Synthetic/)
      const result = await store.submit(draft, draft.clientSubmissionId)
      // Assert
      assert.equal(store.list().tickets.length, 1)
      assert.equal(result.ticket.originalSubmission.text, draft.text)
      assert.equal(result.ticket.parentReceipts.length, 0)
      assert.equal(store.needsDirectorySync, false)
    } finally {
      await store.close()
      await files.cleanup()
    }
  })
}
test('synthetic concurrent retry, conflicting retry, restart and exact receipt dedup', async () => {
  // Arrange
  const files = await fixture()
  let store = await TicketStore.open(resolve(files.root, 'state'), files.assets)
  const draft = submission(files.ref)
  try {
    // Act
    const [a, b] = await Promise.all([
      store.submit(draft, draft.clientSubmissionId),
      store.submit(draft, draft.clientSubmissionId)
    ])
    await assert.rejects(store.submit({ ...draft, text: 'different synthetic text' }, draft.clientSubmissionId), {
      status: 409
    })
    const acknowledgement = receipt(a.ticket)
    const first = await store.appendReceipt(acknowledgement)
    await store.close()
    store = await TicketStore.open(resolve(files.root, 'state'), files.assets)
    const repeated = await store.appendReceipt(acknowledgement)
    const resubmitted = await store.submit(draft, draft.clientSubmissionId)
    // Assert
    assert.equal(a.ticket.ticketId, b.ticket.ticketId)
    assert.equal(Number(a.created) + Number(b.created), 1)
    assert.equal(first.revision, 2)
    assert.deepEqual(repeated, first)
    assert.equal(resubmitted.created, false)
    assert.equal(repeated.parentReceipts.length, 1)
    assert.equal(repeated.originalSubmission.text, draft.text)
    assert.equal(repeated.submissionSha256, a.ticket.submissionSha256)
  } finally {
    await store.close()
    await files.cleanup()
  }
})
test('synthetic wrong receipt identity, stale version and completion are rejected', async () => {
  // Arrange
  const files = await fixture()
  const store = await TicketStore.open(resolve(files.root, 'state'), files.assets)
  const draft = submission(files.ref)
  try {
    const { ticket } = await store.submit(draft, draft.clientSubmissionId)
    // Act / Assert
    await assert.rejects(store.appendReceipt(receipt(ticket, { submissionSha256: '0'.repeat(64) })), { status: 409 })
    await assert.rejects(store.appendReceipt(receipt(ticket, { expectedRevision: 2 })), { status: 409 })
    await assert.rejects(store.appendReceipt(receipt(ticket, { nextStatus: 'completed' })), { status: 400 })
    assert.equal(store.get(ticket.ticketId).status, 'unprocessed')
    assert.equal(store.get(ticket.ticketId).parentReceipts.length, 0)
  } finally {
    await store.close()
    await files.cleanup()
  }
})
test('synthetic unknown refs, external paths and duplicate writers fail closed', async () => {
  // Arrange
  const files = await fixture()
  const store = await TicketStore.open(resolve(files.root, 'state'), files.assets)
  const draft = submission(files.ref)
  try {
    // Act / Assert
    await assert.rejects(TicketStore.open(resolve(files.root, 'state'), files.assets), { status: 503 })
    await assert.rejects(
      store.submit({ ...draft, attachments: [{ ...files.ref, path: '/etc/passwd' }] }, draft.clientSubmissionId),
      { status: 400 }
    )
    await assert.rejects(
      store.submit({ ...draft, attachments: [{ ...files.ref, revision: 'changed' }] }, draft.clientSubmissionId),
      { status: 409 }
    )
    assert.equal(store.list().tickets.length, 0)
  } finally {
    await store.close()
    await files.cleanup()
  }
})
test('synthetic corrupt startup preserves original bytes instead of initializing empty queue', async () => {
  // Arrange
  const files = await fixture()
  const store = await TicketStore.open(resolve(files.root, 'state'), files.assets)
  await store.close()
  const file = resolve(files.root, 'state/tickets.json')
  await writeFile(file, '{CORRUPT SYNTHETIC STATE')
  try {
    // Act / Assert
    await assert.rejects(TicketStore.open(resolve(files.root, 'state'), files.assets), { status: 503 })
    assert.equal(await readFile(file, 'utf8'), '{CORRUPT SYNTHETIC STATE')
  } finally {
    await files.cleanup()
  }
})

test('synthetic additive audio subject is independent of visible unit and older schema remains unchanged', async () => {
  const files = await fixture()
  files.assets.catalog.public.audio = [
    {
      candidateId: 'desert__v01',
      batchId: 'synthetic-bgm',
      eventId: 'bgm_desert',
      category: 'bgm',
      field: 'desert',
      unit: null,
      files: { wav: files.ref, raw_wav: files.ref }
    }
  ]
  const store = await TicketStore.open(resolve(files.root, 'state'), files.assets)
  try {
    const draft = submission(files.ref)
    draft.context.selectedAudio = {
      batchId: 'synthetic-bgm',
      candidateId: 'desert__v01',
      assetRevision: files.ref.revision,
      format: 'wav',
      asset: files.ref
    }
    draft.subject = {
      kind: 'audio',
      batchId: 'synthetic-bgm',
      candidateId: 'desert__v01',
      eventId: 'bgm_desert',
      category: 'bgm',
      field: 'desert',
      unit: null,
      asset: files.ref
    }
    const { ticket } = await store.submit(draft, draft.clientSubmissionId)
    assert.equal(ticket.originalSubmission.context.role, 'wolf')
    assert.equal(ticket.originalSubmission.subject.field, 'desert')
    await assert.rejects(
      store.submit({ ...draft, subject: { ...draft.subject, eventId: 'wolf_attack' } }, draft.clientSubmissionId)
    )
    const old = submission(files.ref)
    const accepted = await store.submit(old, old.clientSubmissionId)
    assert.deepEqual(accepted.ticket.originalSubmission, old)
  } finally {
    await store.close()
    await files.cleanup()
  }
})
test('synthetic owner results append conclusions, exact media and review history without mutating submission', async () => {
  const { randomUUID } = await import('node:crypto')
  const files = await fixture()
  let store = await TicketStore.open(resolve(files.root, 'state'), files.assets)
  const draft = submission(files.ref)
  try {
    const { ticket } = await store.submit(draft, draft.clientSubmissionId)
    const value = {
      command: 'appendResult',
      resultId: randomUUID(),
      ticketId: ticket.ticketId,
      expectedRevision: 1,
      submissionSha256: ticket.submissionSha256,
      parentMessageRef: 'synthetic:result-not-real-ack',
      executorIdentity: 'synthetic-test',
      conclusion: '[SYNTHETIC] Review result, no game adoption',
      media: [files.ref],
      decision: 'held',
      nextStatus: 'awaiting_review'
    }
    await assert.rejects(store.appendResult(value), /acknowledgement/)
    const ack = await store.appendReceipt(receipt(ticket))
    const operation = { ...value, expectedRevision: ack.revision }
    const first = await store.appendResult(operation)
    assert.equal(first.status, 'awaiting_review')
    assert.equal(first.results.length, 1)
    const completed = await store.appendResult({
      ...value,
      resultId: randomUUID(),
      expectedRevision: first.revision,
      nextStatus: 'completed',
      decision: 'rejected'
    })
    assert.equal(completed.status, 'completed')
    assert.deepEqual(completed.originalSubmission, draft)
    assert.equal(completed.submissionSha256, ticket.submissionSha256)
    assert.equal(completed.results.length, 2)
    await store.close()
    store = await TicketStore.open(resolve(files.root, 'state'), files.assets)
    assert.deepEqual(await store.appendResult(operation), completed)
    await assert.rejects(store.appendResult({ ...operation, conclusion: 'changed' }), { status: 409 })
    await assert.rejects(
      store.appendResult({
        ...value,
        resultId: randomUUID(),
        expectedRevision: completed.revision,
        media: [{ ...files.ref, path: '/etc/passwd' }]
      })
    )
    assert.equal(store.get(ticket.ticketId).results.length, 2)
  } finally {
    await store.close()
    await files.cleanup()
  }
})

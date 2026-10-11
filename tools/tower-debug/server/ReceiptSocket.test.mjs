import test from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { lstat, chmod } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { TicketStore } from './TicketStore.mjs'
import { openReceiptSocket, receiptRequest } from './ReceiptSocket.mjs'
import { fixture, submission, receipt } from './test-support.mjs'

test(
  'synthetic owner-only IPC records one synthetic receipt and rejects executable commands',
  {
    skip:
      process.env.TOWER_DEBUG_ALLOW_SOCKET_TESTS !== '1'
        ? 'Cloud Unix-domain listen returned EPERM; run explicitly on authorized Mac'
        : false
  },
  async () => {
    // Arrange
    const files = await fixture()
    const store = await TicketStore.open(resolve(files.root, 'state'), files.assets)
    let socket
    const draft = submission(files.ref)
    try {
      socket = await openReceiptSocket(store)
      const { ticket } = await store.submit(draft, draft.clientSubmissionId)
      // Act
      const list = await receiptRequest(socket.path, { command: 'list' })
      const response = await receiptRequest(socket.path, receipt(ticket))
      const resultCommand = {
        command: 'appendResult',
        resultId: randomUUID(),
        ticketId: ticket.ticketId,
        expectedRevision: response.result.revision,
        submissionSha256: ticket.submissionSha256,
        parentMessageRef: 'synthetic:ipc-result-not-real-parent',
        executorIdentity: 'synthetic-test',
        conclusion: '[SYNTHETIC] Immutable result over owner IPC',
        media: [files.ref],
        decision: 'held',
        nextStatus: 'awaiting_review'
      }
      const result = await receiptRequest(socket.path, resultCommand)
      const repeatedResult = await receiptRequest(socket.path, resultCommand)
      assert.equal(result.result.status, 'awaiting_review')
      assert.equal(result.result.results.length, 1)
      assert.deepEqual(repeatedResult, result)
      const blocked = await receiptRequest(socket.path, {
        command: 'shell',
        text: 'must never run'
      })
      // Assert
      assert.equal((await lstat(socket.path)).mode & 0o077, 0)
      assert.equal(list.result.tickets.length, 1)
      assert.equal(response.result.parentReceipts.length, 1)
      assert.equal(response.result.status, 'in_progress')
      assert.equal(blocked.ok, false)
      await chmod(socket.path, 0o666)
      await assert.rejects(receiptRequest(socket.path, { command: 'list' }), /unsafe/)
    } finally {
      await socket?.close()
      await store.close()
      await files.cleanup()
    }
  }
)

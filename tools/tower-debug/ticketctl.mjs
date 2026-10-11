import { resolve } from 'node:path'
import { explicitStorePath } from './server/StorePath.mjs'
import { receiptRequest } from './server/ReceiptSocket.mjs'

const [action, ...argumentsList] = process.argv.slice(2)
const allowed = new Set([
  'status',
  'after',
  'limit',
  'ticket',
  'expected-revision',
  'submission-sha',
  'receipt-id',
  'parent-message-ref',
  'acknowledged-at',
  'executor',
  'summary',
  'result-id',
  'conclusion',
  'decision',
  'media-json'
])
const args = {}
for (let i = 0; i < argumentsList.length; i += 2) {
  const key = argumentsList[i].replace(/^--/, ''),
    value = argumentsList[i + 1]
  if (!argumentsList[i].startsWith('--') || !allowed.has(key) || !value || Object.hasOwn(args, key))
    throw new Error('Invalid CLI argument')
  args[key] = value
}
let command
if (action === 'list')
  command = {
    command: 'list',
    ...(args.status ? { status: args.status } : {}),
    ...(args.after ? { after: Number(args.after) } : {}),
    ...(args.limit ? { limit: Number(args.limit) } : {})
  }
else if (action === 'show') command = { command: 'get', ticketId: args.ticket }
else if (action === 'receipt')
  command = {
    command: 'appendReceipt',
    ticketId: args.ticket,
    expectedRevision: Number(args['expected-revision']),
    submissionSha256: args['submission-sha'],
    receiptId: args['receipt-id'],
    parentMessageRef: args['parent-message-ref'],
    acknowledgedAt: args['acknowledged-at'],
    executorIdentity: args.executor,
    summary: args.summary,
    nextStatus: args.status ?? 'in_progress'
  }
else if (action === 'result')
  command = {
    command: 'appendResult',
    resultId: args['result-id'],
    ticketId: args.ticket,
    expectedRevision: Number(args['expected-revision']),
    submissionSha256: args['submission-sha'],
    parentMessageRef: args['parent-message-ref'],
    executorIdentity: args.executor,
    conclusion: args.conclusion,
    decision: args.decision ?? 'undecided',
    nextStatus: args.status ?? 'awaiting_review',
    media: JSON.parse(args['media-json'] ?? '[]')
  }
else throw new Error('Use list, show, receipt or result. This CLI never executes ticket content.')
const root = explicitStorePath(process.env.TOWER_DEBUG_STORE)
const result = await receiptRequest(resolve(root, 'state/receipt.sock'), command)
process.stdout.write(JSON.stringify(result, null, 2) + '\n')
if (!result.ok) process.exitCode = 1

import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { syntheticTemporaryRoot } from './StorePath.mjs'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createServer, request as httpRequest } from 'node:http'
import { sha256 } from './Validation.mjs'
import { AssetStore } from './AssetStore.mjs'
import { createDebugService } from './DebugServer.mjs'

export async function fixture() {
  const root = await mkdtemp(resolve(syntheticTemporaryRoot(), 'tower-debug-SYNTHETIC-'))
  await mkdir(resolve(root, 'assets'), { mode: 0o700 })
  const bytes = Buffer.from('{"syntheticFixture":true}'),
    hash = sha256(bytes)
  const ref = {
    assetId: `a-${hash}`,
    revision: 'synthetic-v1',
    sha256: hash,
    bytes: bytes.length,
    mimeType: 'application/json'
  }
  await writeFile(resolve(root, 'assets', hash + '.json'), bytes)
  await writeFile(resolve(root, '.synthetic-test-store'), 'Not a real user ticket store.\n')
  const catalog = {
    schemaVersion: 1,
    assets: [{ ...ref, storageName: hash + '.json' }],
    revisions: [
      {
        revision: 'synthetic-v1',
        role: 'wolf',
        representations: [{ kind: 'source2DImage', state: 'ready', image: ref }]
      }
    ],
    public: {
      catalogRevision: 'synthetic-v1',
      actual3DState: 'not-imported',
      audio: []
    }
  }
  await writeFile(resolve(root, 'catalog.json'), JSON.stringify(catalog))
  return {
    root,
    ref,
    assets: await AssetStore.open(root),
    async cleanup() {
      await rm(root, { recursive: true, force: true })
    }
  }
}
export function submission(ref, key = randomUUID()) {
  return {
    schemaVersion: 1,
    clientSubmissionId: key,
    title: '[SYNTHETIC TEST] Viewer fixture',
    text: 'Synthetic data. Do not treat as a user request.',
    context: {
      role: 'wolf',
      roleRevision: 'synthetic-v1',
      representation: 'source2DImage',
      motion: null,
      direction: null,
      timeMs: null,
      sourceFrameIndex: null,
      interpolationMode: 'source-clock',
      clipManifest: null,
      selectedAudio: null
    },
    attachments: [ref],
    intent: 'explicit-user-submit'
  }
}
export function receipt(ticket, overrides = {}) {
  return {
    command: 'appendReceipt',
    ticketId: ticket.ticketId,
    expectedRevision: ticket.revision,
    submissionSha256: ticket.submissionSha256,
    receiptId: randomUUID(),
    parentMessageRef: 'synthetic:fixture:not-a-real-parent-receipt',
    acknowledgedAt: new Date().toISOString(),
    executorIdentity: 'synthetic-test-executor',
    summary: '[SYNTHETIC TEST] no real parent acknowledgement',
    nextStatus: 'in_progress',
    ...overrides
  }
}
export async function httpFixture() {
  const files = await fixture()
  let service
  const server = createServer((request, response) => service.handler(request, response))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  service = await createDebugService({
    root: files.root,
    origin,
    receiptSocket: false
  })
  const response = await fetch(origin + '/api/v1/session', {
    headers: { 'Sec-Fetch-Site': 'same-origin' }
  })
  const session = await response.json()
  const cookie = response.headers.get('set-cookie').split(';')[0]
  const headers = {
    'Sec-Fetch-Site': 'same-origin',
    Origin: origin,
    Cookie: cookie,
    'X-Debug-CSRF': session.csrf,
    'Content-Type': 'application/json'
  }
  return {
    ...files,
    service,
    origin,
    headers,
    async cleanup() {
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
      await service.close()
      await files.cleanup()
    }
  }
}

export function rawHttp(origin, path, init) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(origin + path, { method: init.method, headers: init.headers }, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () =>
        resolve({
          status: response.statusCode,
          text: async () => Buffer.concat(chunks).toString()
        })
      )
    })
    request.once('error', reject)
    request.end(init.body)
  })
}

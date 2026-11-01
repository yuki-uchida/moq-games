import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { verifyPublishedRefinedMotions } from '../scripts/verify-published-refined-motions.mjs'
const bytes = Buffer.from('{"name":"walk"}\n')
const entry = {
  role: 'archer',
  motion: 'walk',
  source: 'source.glb',
  sourceSha256: 'source-hash',
  clip: 'archer-walk-v2.json',
  bytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex')
}
const mock =
  (sourceHash = entry.sourceSha256, payload = bytes) =>
  async (url) =>
    new Response(
      String(url).includes('runtime-manifest.json')
        ? JSON.stringify({ models: [{ role: 'archer', file: 'archer/source.glb', outputSha256: sourceHash }] })
        : payload
    )
test('verifies deployed overlay bytes against the preserved source identity', async () => {
  const result = await verifyPublishedRefinedMotions('https://example.test/moq-games/', [entry], mock())
  assert.equal(result[0].sha256, entry.sha256)
})
test('rejects stale source identity and stale overlay content', async () => {
  await assert.rejects(
    verifyPublishedRefinedMotions('https://example.test/', [entry], mock('stale')),
    /source identity/
  )
  await assert.rejects(
    verifyPublishedRefinedMotions('https://example.test/', [entry], mock(entry.sourceSha256, Buffer.from('old'))),
    /motion bytes differ/
  )
})

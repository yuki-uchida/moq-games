import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { verifyPublishedMotions } from '../scripts/verify-published-motions.mjs'

async function fixture(change, check) {
  const bytes = Buffer.from('glTF verified fixture bytes')
  const sha = createHash('sha256').update(bytes).digest('hex')
  const audit = { units: { wolf: { file: 'wolf.glb', outputSha256: sha, bytes: bytes.length } } }
  const server = createServer((request, response) => {
    if (request.url.includes('runtime-manifest.json')) {
      response.setHeader('Content-Type', 'application/json')
      response.end(
        JSON.stringify({
          models: [{ role: 'wolf', file: 'wolf/wolf.glb', outputSha256: change === 'manifest' ? 'stale' : sha }]
        })
      )
    } else if (request.url.endsWith('.gz.bin')) {
      response.end(gzipSync(change === 'bytes' ? Buffer.from('corrupted deployment') : bytes))
    } else response.end('<!doctype html><title>Published game</title>')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    await check(`http://127.0.0.1:${server.address().port}/moq-games/`, audit, sha)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

test('verifies decoded production sidecar bytes and all three public pages', () =>
  fixture(undefined, async (base, audit, sha) => {
    const result = await verifyPublishedMotions(base, audit)
    assert.equal(result.assets[0].sha256, sha)
    assert.equal(result.pages.length, 3)
  }))
test('rejects a stale deployed manifest', () =>
  fixture('manifest', (base, audit) => assert.rejects(verifyPublishedMotions(base, audit), /manifest hash/)))
test('rejects corrupt GLB bytes even when the published hash filename is correct', () =>
  fixture('bytes', (base, audit) => assert.rejects(verifyPublishedMotions(base, audit), /GLB bytes/)))

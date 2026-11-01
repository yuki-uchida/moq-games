import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { verifyPublishedMotions } from '../scripts/verify-published-motions.mjs'
import { quadGlb } from './glb-fixture.mjs'

async function fixture(change, check) {
  const source = quadGlb()
  const sha = createHash('sha256').update(source).digest('hex')
  // The deployed sidecar is a stamped meshopt derivative, never larger than its verified source.
  const bytes = quadGlb({ extras: { sourceSha256: sha } })
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
      response.end(gzipSync(change === 'bytes' ? quadGlb({ extras: { sourceSha256: 'other' } }) : bytes))
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
    assert.equal(result.assets[0].bytes, audit.units.wolf.bytes)
    assert.equal(result.pages.length, 3)
  }))
test('rejects a stale deployed manifest', () =>
  fixture('manifest', (base, audit) => assert.rejects(verifyPublishedMotions(base, audit), /manifest hash/)))
test('rejects a derivative of another source even when the published hash filename is correct', () =>
  fixture('bytes', (base, audit) => assert.rejects(verifyPublishedMotions(base, audit), /GLB bytes/)))

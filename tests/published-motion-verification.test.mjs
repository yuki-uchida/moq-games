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
  // Expected derivative digests are preserved separately from anything the server returns.
  const bytes = quadGlb({ extras: { sourceSha256: sha } })
  const audit = { units: { wolf: { file: 'wolf.glb', outputSha256: sha, bytes: bytes.length } } }
  const expectedSidecars = {
    version: 1,
    models: [
      {
        file: 'wolf/wolf.glb',
        sourceSha256: sha,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        bytes: bytes.length
      }
    ]
  }
  expectedSidecars.models.push({ ...expectedSidecars.models[0], file: 'wolf/other.glb' })
  const altered = Buffer.from(bytes)
  altered.writeFloatLE(0.25, 28 + altered.readUInt32LE(12))
  const server = createServer((request, response) => {
    if (request.url.includes('runtime-manifest.json')) {
      response.setHeader('Content-Type', 'application/json')
      response.end(
        JSON.stringify({
          models: [
            { role: 'wolf', file: 'wolf/wolf.glb', outputSha256: change === 'manifest' ? 'stale' : sha },
            { role: 'wolf', file: 'wolf/other.glb', outputSha256: sha }
          ]
        })
      )
    } else if (request.url.endsWith('.gz.bin')) {
      response.end(
        gzipSync(
          change === 'bytes'
            ? quadGlb({ extras: { sourceSha256: 'other' } })
            : change === 'payload' || (change === 'other_payload' && request.url.includes('/other.glb.'))
              ? altered
              : bytes
        )
      )
    } else response.end('<!doctype html><title>Published game</title>')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    await check(`http://127.0.0.1:${server.address().port}/moq-games/`, audit, expectedSidecars)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

test('verifies decoded production sidecar bytes and all three public pages', () =>
  fixture(undefined, async (base, audit, expectedSidecars) => {
    const result = await verifyPublishedMotions(base, audit, expectedSidecars)
    assert.equal(result.assets[0].bytes, audit.units.wolf.bytes)
    assert.equal(result.assets.length, 2)
    assert.equal(result.pages.length, 3)
  }))
test('rejects a stale deployed manifest', () =>
  fixture('manifest', (base, audit, expectedSidecars) =>
    assert.rejects(verifyPublishedMotions(base, audit, expectedSidecars), /manifest hash/)
  ))
test('rejects a derivative of another source even when the published hash filename is correct', () =>
  fixture('bytes', (base, audit, expectedSidecars) =>
    assert.rejects(verifyPublishedMotions(base, audit, expectedSidecars), /GLB bytes/)
  ))

test('rejects altered payload with the correct source stamp, header, filename and fresh gzip CRC', () =>
  fixture('payload', (base, audit, expectedSidecars) =>
    assert.rejects(verifyPublishedMotions(base, audit, expectedSidecars), /GLB bytes/)
  ))
test('requires independently preserved build digests', () =>
  assert.rejects(verifyPublishedMotions('http://unused/', { units: {} }), /digest manifest/))
test('verifies every built sidecar, including files outside the repair audit', () =>
  fixture('other_payload', (base, audit, expectedSidecars) =>
    assert.rejects(verifyPublishedMotions(base, audit, expectedSidecars), /other.glb.*GLB bytes/)
  ))
test('does not allow an audited model to disappear from the trusted digest list', () =>
  fixture(undefined, (base, audit) =>
    assert.rejects(verifyPublishedMotions(base, audit, { version: 1, models: [] }), /missing verified build/)
  ))

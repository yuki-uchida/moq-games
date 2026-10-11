import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer as createPortReservation } from 'node:net'
import { createServer } from 'vite'
import { resolve } from 'node:path'
import { realpath } from 'node:fs/promises'
import { makeTowerDebugConfig } from '../../../vite.config.tower-debug.mjs'
import { fixture } from './test-support.mjs'

test('real Vite middleware serves only the isolated client and blocks private filesystem probes', async () => {
  // Arrange
  const files = await fixture(),
    reservation = createPortReservation()
  await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve))
  const port = reservation.address().port
  await new Promise((resolve) => reservation.close(resolve))
  const config = makeTowerDebugConfig({
    port,
    storeRoot: files.root,
    receiptSocket: false
  })
  const server = await createServer({
    ...config,
    configFile: false,
    logLevel: 'silent',
    server: { ...config.server, preTransformRequests: false }
  })
  try {
    await server.listen()
    const origin = `http://127.0.0.1:${port}`
    // Act
    const html = await fetch(origin + '/'),
      transformed = await fetch(origin + '/src/main.ts')
    // Assert
    assert.equal(html.status, 200)
    assert.match(html.headers.get('content-security-policy'), /connect-src 'self' blob: ws:\/\/127\.0\.0\.1:/)
    assert.match(await html.text(), /Tower assets/)
    assert.equal(transformed.status, 200)
    assert.match(await transformed.text(), /loadRepresentation/)
    const dependency = await realpath(resolve('node_modules/vite/dist/client/env.mjs'))
    for (const prefix of ['/@fs', '/@fs/']) {
      const result = await fetch(`${origin}${prefix}${dependency}`)
      assert.equal(result.status, 200)
      assert.match(await result.text(), /globalThis/)
    }
    for (const file of [
      resolve(files.root, 'catalog.json'),
      resolve('tools/tower-debug/server/DebugServer.mjs'),
      resolve('package.json'),
      '/etc/passwd'
    ]) {
      const result = await fetch(`${origin}/@fs/${file}`)
      assert.equal(result.status, 403, file)
      assert.doesNotMatch(await result.text(), /syntheticFixture|import \{ resolve/)
    }
    const hostile = await fetch(origin + '/src/main.ts', {
      headers: { Origin: 'https://evil.example' }
    })
    assert.equal(hostile.status, 403)
  } finally {
    await server.close()
    await files.cleanup()
  }
})

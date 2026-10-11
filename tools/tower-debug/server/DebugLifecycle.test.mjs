import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { resolve } from 'node:path'
import { lstat } from 'node:fs/promises'
import { attachDebugShutdown } from '../DebugLifecycle.mjs'
import { TicketStore } from './TicketStore.mjs'
import { ReviewStore } from './ReviewStore.mjs'
import { fixture, submission } from './test-support.mjs'

for (const signal of ['SIGINT', 'SIGTERM'])
  test(`synthetic ${signal} waits for owned stores and closes once`, async () => {
    const f = await fixture(),
      signals = new EventEmitter()
    const tickets = await TicketStore.open(resolve(f.root, 'state'), f.assets)
    const reviews = await ReviewStore.open(resolve(f.root, 'review-state'), f.assets)
    const draft = submission(f.ref)
    const pending = tickets.submit(draft, draft.clientSubmissionId)
    let calls = 0,
      exitCode
    const lifecycle = attachDebugShutdown(
      {
        async close() {
          calls++
          await tickets.close()
          await reviews.close()
        }
      },
      {
        signals,
        setExitCode: (code) => {
          exitCode = code
        }
      }
    )
    try {
      signals.emit(signal)
      signals.emit(signal)
      await lifecycle.shutdown()
      assert.equal(calls, 1)
      assert.equal(exitCode, 0)
      assert.equal((await pending).ticket.originalSubmission.title, draft.title)
      for (const path of ['state/writer.lock', 'review-state/writer.lock'])
        await assert.rejects(lstat(resolve(f.root, path)), { code: 'ENOENT' })
      const reopened = await TicketStore.open(resolve(f.root, 'state'), f.assets)
      assert.equal(reopened.list().tickets.length, 1)
      await reopened.close()
      assert.equal(signals.listenerCount(signal), 0)
    } finally {
      await f.cleanup()
    }
  })
test('synthetic shutdown failure is reported without deleting unknown locks', async () => {
  const signals = new EventEmitter(),
    messages = []
  let code
  const lifecycle = attachDebugShutdown(
    {
      async close() {
        throw new Error('synthetic cleanup denied')
      }
    },
    {
      signals,
      report: (text) => messages.push(text),
      setExitCode: (value) => {
        code = value
      }
    }
  )
  await lifecycle.shutdown()
  assert.equal(code, 1)
  assert.match(messages[0], /preserve/)
})

// This launches only a synthetic Vite process, not a browser and not the user's service.
for (const signal of ['SIGINT', 'SIGTERM'])
  test(`synthetic real Vite ${signal} leaves no owned writer locks`, { timeout: 15000 }, async () => {
    const { spawn } = await import('node:child_process')
    const { createServer: reserve } = await import('node:net')
    const { pathToFileURL } = await import('node:url')
    const f = await fixture(),
      reservation = reserve()
    await new Promise((done) => reservation.listen(0, '127.0.0.1', done))
    const port = reservation.address().port
    await new Promise((done) => reservation.close(done))
    const config = pathToFileURL(resolve('vite.config.tower-debug.mjs')).href
    const lifecycleModule = pathToFileURL(resolve('tools/tower-debug/DebugLifecycle.mjs')).href
    const script = `import {createServer} from 'vite'; import {makeTowerDebugConfig} from ${JSON.stringify(config)}; import {attachDebugShutdown} from ${JSON.stringify(lifecycleModule)};
    const config=makeTowerDebugConfig({port:${port},storeRoot:${JSON.stringify(f.root)},receiptSocket:${process.env.TOWER_DEBUG_ALLOW_SOCKET_TESTS === '1'}});
    const server=await createServer({...config,configFile:false,logLevel:'silent',server:{...config.server,preTransformRequests:false}});
    attachDebugShutdown(server); await server.listen(); process.stdout.write('SYNTHETIC_READY\\n');`
    const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
      env: { ...process.env, CI: 'true' },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    const exited = new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', (code, signal) => resolve({ code, signal }))
    })
    try {
      await new Promise((done, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Synthetic child did not start: ${stderr}`)), 10000)
        child.stdout.on('data', (chunk) => {
          if (String(chunk).includes('SYNTHETIC_READY')) {
            clearTimeout(timeout)
            done()
          }
        })
        child.once('exit', () => {
          clearTimeout(timeout)
          reject(new Error(`Synthetic child exited before ready: ${stderr}`))
        })
      })
      assert.equal((await lstat(resolve(f.root, 'state/writer.lock'))).isFile(), true)
      child.kill(signal)
      const result = await exited
      assert.ok((signal === 'SIGTERM' ? [0, 143] : [0]).includes(result.code), stderr)
      for (const path of ['state/writer.lock', 'review-state/writer.lock'])
        await assert.rejects(lstat(resolve(f.root, path)), { code: 'ENOENT' })
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM')
        await exited
      }
      await f.cleanup()
    }
  })

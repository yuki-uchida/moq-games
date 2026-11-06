import assert from 'node:assert/strict'
import { spawn, execFile } from 'node:child_process'
import { createHash, X509Certificate } from 'node:crypto'
import { createSocket } from 'node:dgram'
import { access, mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createServer as createTcpServer } from 'node:net'
import { dirname, join, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { createServer } from 'vite'

const execute = promisify(execFile)
const root = fileURLToPath(new URL('../', import.meta.url))

export async function executable(name) {
  const value = process.env[name]
  assert(value, `${name} is required; real MoQ E2E cannot run without this dependency (not skipped)`)
  const path = resolve(value)
  await access(path).catch(() => {
    throw new Error(`${name} does not exist: ${path}`)
  })
  return path
}

async function relayBindings(pid) {
  const script =
    `$ErrorActionPreference='Stop'; $bindings=@(); ` +
    `$bindings+=@(Get-NetUDPEndpoint -ErrorAction SilentlyContinue | Where-Object OwningProcess -eq ${pid} | ForEach-Object { @{ protocol='udp'; address=$_.LocalAddress; port=$_.LocalPort } }); ` +
    `$bindings+=@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object OwningProcess -eq ${pid} | ForEach-Object { @{ protocol='tcp'; address=$_.LocalAddress; port=$_.LocalPort } }); ` +
    `ConvertTo-Json -Compress -InputObject @($bindings)`
  const { stdout } = await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    timeout: 30_000,
    windowsHide: true
  })
  const bindings = JSON.parse(stdout.trim())
  assert(Array.isArray(bindings))
  for (const binding of bindings) assert.equal(binding.address, '127.0.0.1', 'relay must bind loopback only')
  return bindings
}

async function freeRelayPort() {
  const socket = createSocket('udp4')
  try {
    await new Promise((done, reject) => {
      socket.once('error', reject)
      socket.bind(0, '127.0.0.1', done)
    })
    const { port } = socket.address()
    assert(![55353, 55354].includes(port), 'reserved parent port was selected; rerun the test')
    return port
  } finally {
    socket.close()
  }
}

export async function startRealMoq() {
  assert.equal(process.platform, 'win32', 'this harness verifies Windows relay socket ownership')
  const relayPath = await executable('MOQ_RELAY_EXECUTABLE_PATH')
  const openssl = await executable('OPENSSL_EXECUTABLE_PATH')
  const chrome = await executable('PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH')
  const sdk = await realpath(fileURLToPath(import.meta.resolve('@moq-games/moqt-client')))
  const sdkRoot = await realpath(join(root, '.generated/moqt-sdk'))
  assert(sdk.startsWith(sdkRoot + sep), 'normal Vite must resolve the generated SDK, not a protocol mock')
  const { stdout } = await execute(relayPath, ['--version'], { timeout: 10_000, windowsHide: true })
  assert.equal(stdout.trim(), 'moq-relay 0.17.2', 'use the pinned relay for reproducibility')
  const directory = await mkdtemp(join(tmpdir(), 'yoru-real-moq-'))
  let relay
  let vite
  let log = ''
  let spawnError
  let stopped = false
  const stop = async () => {
    if (stopped) return
    stopped = true
    const failures = []
    if (vite) await vite.close().catch((error) => failures.push(error))
    if (relay && relay.exitCode === null && relay.signalCode === null) {
      const exited = new Promise((done) => relay.once('exit', done))
      relay.kill()
      await Promise.race([
        exited,
        delay(10_000, undefined, { ref: false }).then(() => {
          throw new Error(`owned relay ${relay.pid} did not stop`)
        })
      ]).catch((error) => failures.push(error))
    }
    const target = resolve(directory)
    assert.equal(dirname(target), resolve(tmpdir()))
    assert(target.startsWith(resolve(tmpdir()) + sep + 'yoru-real-moq-'))
    await rm(target, { recursive: true, force: true }).catch((error) => failures.push(error))
    if (failures.length) throw new AggregateError(failures, 'real MoQ teardown failed')
  }
  try {
    const cert = join(directory, 'relay-cert.pem')
    const key = join(directory, 'relay-key.pem')
    await execute(
      openssl,
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-sha256',
        '-days',
        '1',
        '-subj',
        '/CN=127.0.0.1',
        '-addext',
        'subjectAltName=IP:127.0.0.1',
        '-keyout',
        key,
        '-out',
        cert
      ],
      { timeout: 15_000, windowsHide: true }
    )
    const certificate = new X509Certificate(await readFile(cert))
    const spki = createHash('sha256')
      .update(certificate.publicKey.export({ type: 'spki', format: 'der' }))
      .digest('base64')
    const relayPort = await freeRelayPort()
    const args = [
      '--listen',
      `127.0.0.1:${relayPort}`,
      '--listen-version',
      'moq-transport-14',
      '--listen-tls-cert',
      cert,
      '--listen-tls-key',
      key,
      '--auth-public',
      'anon/**',
      '--web-http-listen',
      '127.0.0.1:0',
      '--connect-bind',
      '127.0.0.1:0',
      '--cluster-lan=false',
      '--iroh-enabled=false'
    ]
    const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(MOQ_|RUST_LOG$)/i.test(name)))
    relay = spawn(relayPath, args, {
      env: { ...env, RUST_LOG: 'info' },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    relay.on('error', (error) => {
      spawnError = error
    })
    for (const output of [relay.stdout, relay.stderr])
      output.on('data', (chunk) => {
        log = (log + chunk).slice(-256_000)
      })
    let bindings = []
    for (let attempt = 0; attempt < 5; attempt++) {
      if (spawnError) throw spawnError
      assert.equal(relay.exitCode, null, `relay exited before readiness: ${log}`)
      bindings = await relayBindings(relay.pid)
      if (
        bindings.some((binding) => binding.protocol === 'udp' && binding.port === relayPort) &&
        bindings.some((binding) => binding.protocol === 'tcp')
      )
        break
      await delay(250)
    }
    assert(
      bindings.some((binding) => binding.protocol === 'udp' && binding.port === relayPort),
      `relay UDP listener missing: ${log}`
    )
    assert(
      bindings.some((binding) => binding.protocol === 'tcp'),
      `relay HTTP listener missing: ${log}`
    )
    const reservation = createTcpServer()
    await new Promise((done, reject) => {
      reservation.once('error', reject)
      reservation.listen(0, '127.0.0.1', done)
    })
    const reserved = reservation.address()
    await new Promise((done, reject) => reservation.close((error) => (error ? reject(error) : done())))
    assert(reserved && typeof reserved !== 'string')
    assert(![55353, 55354].includes(reserved.port), 'reserved parent Vite port was selected')
    vite = await createServer({
      configFile: join(root, 'vite.config.yoru-no-yashiki.mjs'),
      server: { host: '127.0.0.1', port: reserved.port, strictPort: true, hmr: false }
    })
    await vite.listen()
    const address = vite.httpServer.address()
    assert(address && typeof address !== 'string')
    assert.equal(address.address, '127.0.0.1')
    assert(![55353, 55354].includes(address.port), 'reserved parent Vite port was selected')
    return {
      baseURL: `http://127.0.0.1:${address.port}`,
      relayURL: `https://127.0.0.1:${relayPort}/anon`,
      chrome,
      spki,
      stop,
      diagnostics: () => ({
        relayPid: relay.pid,
        relayVersion: stdout.trim(),
        args,
        bindings,
        sdk,
        log,
        stopped,
        relayExitCode: relay.exitCode,
        relayExitSignal: relay.signalCode,
        baseURL: `http://127.0.0.1:${address.port}`,
        relayURL: `https://127.0.0.1:${relayPort}/anon`,
        directory
      })
    }
  } catch (error) {
    console.error('real MoQ startup failed:', log)
    await stop()
    throw error
  }
}

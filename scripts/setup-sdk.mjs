import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  copyFileSync,
  renameSync,
  unlinkSync
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFileSync(path, 'utf8')
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const manifest = JSON.parse(read(join(root, 'sdk/source.json')))
const output = join(root, '.generated/moqt-sdk')
const cache = join(root, '.sdk-cache')
const source = join(cache, 'source', manifest.commit)
const stampName = '.setup-integrity.json'
const inputHash = hash(
  ['sdk/source.json', 'sdk/package.json', 'scripts/setup-sdk.mjs'].map((p) => read(join(root, p))).join('\n')
)
const env = { ...process.env, RUSTUP_TOOLCHAIN: manifest.rust }
function run(command, args, cwd = root, capture = false) {
  return execFileSync(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    maxBuffer: 64 * 1024 * 1024
  })?.trim()
}
function files(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      if (entry.isSymbolicLink()) throw new Error(`Unexpected symlink in generated SDK: ${entry.name}`)
      const name = join(prefix, entry.name)
      return entry.isDirectory() ? files(join(directory, entry.name), name) : [name]
    })
    .sort()
}
function inventory(directory) {
  return Object.fromEntries(
    files(directory)
      .filter((p) => p !== stampName)
      .map((p) => [p, hash(readFileSync(join(directory, p)))])
  )
}
function assertSource() {
  if (run('git', ['remote', 'get-url', 'origin'], source, true) !== manifest.repository)
    throw new Error('Cached source origin does not match sdk/source.json; preserve it and inspect it manually.')
  if (run('git', ['rev-parse', 'HEAD'], source, true) !== manifest.commit)
    throw new Error('Cached source HEAD does not match the pinned commit; no checkout was changed.')
  if (run('git', ['status', '--porcelain', '--untracked-files=all'], source, true))
    throw new Error('Cached source has local changes; no reset or cleanup was performed.')
  if (hash(readFileSync(join(source, 'Cargo.lock'))) !== manifest.cargoLockSha256)
    throw new Error('Pinned Cargo.lock hash mismatch.')
}

try {
  if (!/^[a-f0-9]{40}$/.test(manifest.commit) || !manifest.repository.startsWith('https://github.com/'))
    throw new Error('SDK source must use an explicit HTTPS GitHub URL and full commit SHA.')
  if (existsSync(source)) assertSource()
  if (existsSync(output)) {
    if (!existsSync(join(output, stampName)))
      throw new Error('Generated SDK has no integrity record; preserve it outside .generated/moqt-sdk before setup.')
    const stamp = JSON.parse(read(join(output, stampName)))
    if (JSON.stringify(inventory(output)) !== JSON.stringify(stamp.files))
      throw new Error('Generated SDK contains local changes; no files were replaced. Preserve changes before setup.')
    if (stamp.inputHash === inputHash) {
      console.log(`SDK already prepared from ${manifest.commit}; integrity verified.`)
      process.exit(0)
    }
  }
  mkdirSync(cache, { recursive: true })
  run('rustup', ['toolchain', 'install', manifest.rust, '--profile', 'minimal', '--target', 'wasm32-unknown-unknown'])
  let wasmPack = 'wasm-pack'
  try {
    if (run(wasmPack, ['--version'], root, true) !== `wasm-pack ${manifest.wasmPack}`)
      throw new Error('version mismatch')
  } catch {
    wasmPack = join(cache, 'tools/bin', process.platform === 'win32' ? 'wasm-pack.exe' : 'wasm-pack')
    let installed = false
    try {
      installed = run(wasmPack, ['--version'], root, true) === `wasm-pack ${manifest.wasmPack}`
    } catch {}
    if (!installed)
      run('cargo', ['install', 'wasm-pack', '--version', manifest.wasmPack, '--locked', '--root', join(cache, 'tools')])
  }
  if (!existsSync(source)) {
    mkdirSync(dirname(source), { recursive: true })
    const checkout = `${source}.fetch-${randomUUID()}`
    mkdirSync(checkout)
    run('git', ['init', '--quiet'], checkout)
    run('git', ['remote', 'add', 'origin', manifest.repository], checkout)
    run('git', ['fetch', '--depth=1', 'origin', manifest.commit], checkout)
    run('git', ['checkout', '--detach', '--quiet', 'FETCH_HEAD'], checkout)
    renameSync(checkout, source)
  }
  assertSource()
  const staging = join(root, '.generated', `.sdk-build-${randomUUID()}`)
  mkdirSync(staging, { recursive: true })
  env.CARGO_TARGET_DIR = join(cache, 'target', manifest.rust)
  delete env.RUSTFLAGS
  env.CARGO_ENCODED_RUSTFLAGS = [
    '--cfg',
    'tokio_unstable',
    '--cfg',
    'web_sys_unstable_apis',
    `--remap-path-prefix=${homedir()}=/build-home`,
    `--remap-path-prefix=${tmpdir()}=/build-tmp`,
    `--remap-path-prefix=${root}=/moq-games`,
    `--remap-path-prefix=${source}=/moq-wasm`
  ].join('\u001f')
  run(
    wasmPack,
    ['build', 'bindings/wasm', '--target', 'web', '--out-dir', join(staging, 'wasm'), '--', '--locked'],
    source
  )
  if (existsSync(join(staging, 'wasm/.gitignore'))) unlinkSync(join(staging, 'wasm/.gitignore'))
  mkdirSync(join(staging, 'source'))
  for (const [name, expected] of Object.entries(manifest.wrapperSha256)) {
    let text = read(join(source, 'examples/browser/lib/moqt', name))
    if (hash(text) !== expected) throw new Error(`Pinned wrapper hash mismatch: ${name}`)
    text = text
      .replaceAll("'../../pkg/moqt_client_wasm'", "'../wasm/moqt_client_wasm.js'")
      .replaceAll("'./subscriptionStateManager'", "'./subscriptionStateManager.js'")
    writeFileSync(join(staging, 'source', name), text)
  }
  copyFileSync(join(root, 'sdk/package.json'), join(staging, 'package.json'))
  run(
    'npm',
    [
      'exec',
      '--yes',
      '--package',
      `typescript@${manifest.typescript}`,
      '--',
      'tsc',
      '--target',
      'ES2022',
      '--module',
      'ESNext',
      '--moduleResolution',
      'bundler',
      '--declaration',
      '--strict',
      '--skipLibCheck',
      '--rootDir',
      'source',
      '--outDir',
      'dist',
      'source/moqtClient.ts',
      'source/subscriptionStateManager.ts'
    ],
    staging
  )
  const metadata = JSON.parse(run('cargo', ['metadata', '--locked', '--format-version', '1'], source, true))
  const packages = new Map(metadata.packages.map((p) => [p.id, p]))
  const nodes = new Map(metadata.resolve.nodes.map((n) => [n.id, n]))
  const pending = [metadata.packages.find((p) => p.name === 'moqt-client-wasm').id]
  const selected = new Set()
  while (pending.length) {
    const id = pending.pop()
    if (selected.has(id)) continue
    selected.add(id)
    pending.push(...nodes.get(id).dependencies)
  }
  const notices = []
  for (const id of [...selected].sort()) {
    const p = packages.get(id)
    const folder = dirname(p.manifest_path)
    notices.push(
      `${p.name} ${p.version}\nLicense: ${p.license ?? 'MIT (upstream repository LICENSE)'}\nRepository: ${p.repository ?? manifest.repository}`
    )
    const paths = new Set(
      readdirSync(folder, { withFileTypes: true })
        .filter((f) => f.isFile() && /^(LICENSE|COPYING|NOTICE)/i.test(f.name))
        .map((f) => join(folder, f.name))
    )
    if (p.license_file) paths.add(resolve(folder, p.license_file))
    for (const path of [...paths].sort()) notices.push(`${p.name}/${path.slice(folder.length + 1)}\n${read(path)}`)
  }
  copyFileSync(join(source, 'LICENSE'), join(staging, 'LICENSE'))
  writeFileSync(join(staging, 'THIRD-PARTY-NOTICES.txt'), notices.join('\n\n'))
  const wasmSha256 = hash(readFileSync(join(staging, 'wasm/moqt_client_wasm_bg.wasm')))
  writeFileSync(
    join(staging, 'provenance.json'),
    JSON.stringify({ ...manifest, wasmSha256, dependencyCount: selected.size }, null, 2) + '\n'
  )
  assertSource()
  for (const p of files(staging)) {
    const bytes = readFileSync(join(staging, p))
    if (
      bytes.includes(Buffer.from(homedir())) ||
      bytes.includes(Buffer.from(root)) ||
      bytes.includes(Buffer.from(source))
    )
      throw new Error(`Private build path found in generated SDK: ${p}`)
  }
  writeFileSync(join(staging, stampName), JSON.stringify({ inputHash, files: inventory(staging) }, null, 2) + '\n')
  if (existsSync(output)) renameSync(output, `${output}.previous-${randomUUID()}`)
  renameSync(staging, output)
  console.log(
    `Prepared SDK from ${manifest.commit}; ${selected.size} dependency declarations and available upstream notices included.`
  )
} catch (error) {
  console.error(
    `SDK setup failed: ${error.message}\nExisting source/output was preserved. Install Git, Node.js 24/npm and rustup, then rerun node scripts/setup-sdk.mjs. See sdk/README.md.`
  )
  process.exitCode = 1
}

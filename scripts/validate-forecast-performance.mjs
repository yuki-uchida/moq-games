import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const work = resolve(root, '.build/forecast-validation')
const fixtures = resolve(root, 'tests/performance/forecast-baseline')
const manifest = JSON.parse(readFileSync(resolve(fixtures, 'manifest.json'), 'utf8'))
mkdirSync(work, { recursive: true })
cpSync(resolve(root, 'examples/games/tower_diffence_with_jev/src'), resolve(work, 'baseline/src'), { recursive: true })
for (const [name, sha256] of Object.entries(manifest.sha256)) {
  const source = resolve(fixtures, name)
  const contents = readFileSync(source)
  if (createHash('sha256').update(contents).digest('hex') !== sha256)
    throw new Error(`Baseline fixture changed: ${name}`)
  writeFileSync(resolve(work, 'baseline/src/game', name), contents)
}
cpSync(resolve(root, 'tests/performance/forecast-equivalence.template.ts'), resolve(work, 'equivalence.test.ts'))
writeFileSync(
  resolve(work, 'vitest.config.mts'),
  `import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { include: ['.build/forecast-validation/equivalence.test.ts'], exclude: [], environment: 'node', maxWorkers: 1, fileParallelism: false, testTimeout: 180000, hookTimeout: 180000 } })\n`
)
console.log(`Baseline source: ${manifest.source}. Independent source/module trees; unchanged CONFIG.step.`)
const result = spawnSync(
  process.execPath,
  [
    resolve(root, 'node_modules/vitest/vitest.mjs'),
    'run',
    '--config',
    resolve(work, 'vitest.config.mts'),
    '--reporter=verbose',
    ...process.argv.slice(2)
  ],
  { cwd: root, stdio: 'inherit', env: process.env }
)
if (result.error) throw result.error
process.exitCode = result.status ?? 1

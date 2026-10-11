import { mkdtemp, cp, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { explicitStorePath, syntheticTemporaryRoot } from './server/StorePath.mjs'
const source = explicitStorePath(process.env.TOWER_DEBUG_SOURCE_STORE ?? process.env.TOWER_DEBUG_STORE)
const destination = await mkdtemp(resolve(syntheticTemporaryRoot(), 'tower-debug-E2E-SYNTHETIC-'))
await cp(resolve(source, 'assets'), resolve(destination, 'assets'), {
  recursive: true
})
const catalog = JSON.parse(await readFile(resolve(source, 'catalog.json'), 'utf8'))
catalog.public.syntheticTestStore = true
await writeFile(resolve(destination, 'catalog.json'), JSON.stringify(catalog), {
  mode: 0o600
})
await writeFile(
  resolve(destination, '.synthetic-test-store'),
  'Explicit synthetic E2E fixture. No real user tickets.\n',
  { mode: 0o600 }
)
process.stdout.write(destination + '\n')

import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('..', import.meta.url))
execFileSync(
  process.execPath,
  [
    'node_modules/typescript/bin/tsc',
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
    'sdk/source',
    '--outDir',
    'sdk/dist',
    'sdk/source/moqtClient.ts',
    'sdk/source/subscriptionStateManager.ts'
  ],
  { cwd: root, stdio: 'inherit' }
)
execFileSync('npm', ['pack', './sdk', '--pack-destination', './vendor'], { cwd: root, stdio: 'inherit' })

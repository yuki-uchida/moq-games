import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = process.cwd()
const files = [
  resolve(root, 'LICENSE'),
  resolve(root, '.generated/moqt-sdk/LICENSE'),
  resolve(root, 'node_modules/three/LICENSE'),
  resolve(root, 'node_modules/vite/LICENSE.md'),
  resolve(root, '.generated/moqt-sdk/THIRD-PARTY-NOTICES.txt'),
  resolve(root, 'licenses/moq-wasm-0.1.0-notices.txt'),
  resolve(root, 'licenses/vite-8.3.4-license.md')
]
const notices = await Promise.all(
  files.map(async (path) => `${path.slice(root.length + 1)}\n${await readFile(path, 'utf8')}`)
)
await mkdir('dist', { recursive: true })
await copyFile('licenses/rust-1.99.1-COPYRIGHT-library.html', 'dist/RUST-STANDARD-LIBRARY-NOTICES.html')
await writeFile(
  'dist/THIRD-PARTY-NOTICES.txt',
  [...notices, 'Rust 1.99.1 standard library: see RUST-STANDARD-LIBRARY-NOTICES.html'].join('\n\n')
)

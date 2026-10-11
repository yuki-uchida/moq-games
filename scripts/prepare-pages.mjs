import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = process.cwd()
const files = [
  resolve(root, 'LICENSE'),
  resolve(root, '.generated/moqt-sdk/LICENSE'),
  resolve(root, 'node_modules/three/LICENSE'),
  resolve(root, '.generated/moqt-sdk/THIRD-PARTY-NOTICES.txt')
]
const notices = await Promise.all(
  files.map(async (path) => `${path.slice(root.length + 1)}\n${await readFile(path, 'utf8')}`)
)
await mkdir('dist', { recursive: true })
await writeFile('dist/THIRD-PARTY-NOTICES.txt', notices.join('\n\n'))

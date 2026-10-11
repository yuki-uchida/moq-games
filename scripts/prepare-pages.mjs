import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

async function licenseFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name)
      return entry.isDirectory() ? licenseFiles(path) : [path]
    })
  )
  return files.flat().sort()
}

const root = process.cwd()
const files = [
  resolve(root, 'LICENSE'),
  resolve(root, 'sdk/LICENSE'),
  resolve(root, 'node_modules/three/LICENSE'),
  ...(await licenseFiles(resolve(root, 'sdk/THIRD-PARTY-LICENSES')))
]
const notices = await Promise.all(
  files.map(async (path) => `${path.slice(root.length + 1)}\n${await readFile(path, 'utf8')}`)
)
await mkdir('dist', { recursive: true })
await writeFile('dist/THIRD-PARTY-NOTICES.txt', notices.join('\n\n'))

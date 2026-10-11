import { resolve, join } from 'node:path'
import { readdir, lstat, mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('..', import.meta.url))
if (!process.argv[2]) throw new Error('Pass an authorized unpacked asset directory')
const source = resolve(process.argv[2])
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const entries = []
async function copy(from, to, relative) {
  const stat = await lstat(from)
  if (stat.isSymbolicLink()) throw new Error('Asset symlinks are not accepted')
  if (stat.isDirectory()) {
    await mkdir(to, { recursive: true })
    for (const name of await readdir(from)) await copy(join(from, name), join(to, name), join(relative, name))
    return
  }
  if (!stat.isFile()) throw new Error('Only regular asset files are accepted')
  const bytes = await readFile(from)
  try {
    const existing = await readFile(to)
    if (hash(existing) !== hash(bytes)) throw new Error('Existing asset differs: ' + relative)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    await writeFile(to, bytes, { flag: 'wx' })
  }
  entries.push({ path: relative, bytes: bytes.length, sha256: hash(bytes) })
}
for (const name of ['tower-defense-art', 'tower-defense-sfx'])
  await copy(join(source, name), join(root, 'public', name), name)
await mkdir(join(root, 'local-assets'), { recursive: true })
await writeFile(join(root, 'local-assets', 'import-manifest.json'), JSON.stringify(entries, null, 2) + '\n')
console.log(`Verified ${entries.length} local files; nothing was published.`)

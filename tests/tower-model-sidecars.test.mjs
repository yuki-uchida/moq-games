import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { towerModelSidecars } from '../scripts/tower-model-sidecars.mjs'

test('build sidecars are deterministic, reversible, and reject changed sources', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'moq-sidecars-'))
  try {
    const dir = resolve(root, 'public/tower-defense-art/models/role')
    const dest = resolve(root, 'dist/tower-defense-art/models/role')
    await mkdir(dir, { recursive: true })
    await mkdir(dest, { recursive: true })
    const original = Buffer.from('glb fixture '.repeat(100))
    await writeFile(resolve(dir, 'model.glb'), original)
    const manifest = {
      models: [
        {
          file: 'role/model.glb',
          bytes: original.length,
          outputSha256: createHash('sha256').update(original).digest('hex')
        }
      ]
    }
    await writeFile(resolve(root, 'public/tower-defense-art/models/runtime-manifest.json'), JSON.stringify(manifest))
    const sidecar = `model.glb.${manifest.models[0].outputSha256}.gz.bin`
    const plugin = towerModelSidecars(root)
    plugin.configResolved({ root, build: { outDir: 'dist' } })
    await plugin.closeBundle()
    const first = await readFile(resolve(dest, sidecar))
    assert.deepEqual(gunzipSync(first), original)
    await plugin.closeBundle()
    assert.deepEqual(await readFile(resolve(dest, sidecar)), first)
    await writeFile(resolve(dir, 'model.glb'), Buffer.from('changed'))
    await assert.rejects(plugin.closeBundle(), /source mismatch/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

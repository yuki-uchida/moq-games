import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { createRequire } from 'node:module'
import { towerModelSidecars } from '../scripts/tower-model-sidecars.mjs'
import { quadGlb, QUAD_POSITIONS, QUAD_INDICES } from './glb-fixture.mjs'
const { MeshoptDecoder } = createRequire(import.meta.url)('meshoptimizer')

test('build sidecars are deterministic, decode to the source mesh, and reject changed sources', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'moq-sidecars-'))
  try {
    const dir = resolve(root, 'public/tower-defense-art/models/role')
    const dest = resolve(root, 'dist/tower-defense-art/models/role')
    await mkdir(dir, { recursive: true })
    await mkdir(dest, { recursive: true })
    const original = quadGlb()
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
    const glb = gunzipSync(first)
    assert.equal(glb.readUInt32LE(8), glb.length)
    const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString())
    const bin = glb.subarray(28 + glb.readUInt32LE(12))
    assert.deepEqual(json.extensionsRequired, ['EXT_meshopt_compression'])
    assert.equal(json.asset.extras.sourceSha256, manifest.models[0].outputSha256)
    assert.equal(json.buffers[1].extensions.EXT_meshopt_compression.fallback, true)
    await MeshoptDecoder.ready
    const decode = (view) => {
      const ext = view.extensions.EXT_meshopt_compression
      const target = new Uint8Array(ext.count * ext.byteStride)
      MeshoptDecoder.decodeGltfBuffer(
        target,
        ext.count,
        ext.byteStride,
        bin.subarray(ext.byteOffset, ext.byteOffset + ext.byteLength),
        ext.mode,
        ext.filter
      )
      return target
    }
    const positions = Array.from(new Float32Array(decode(json.bufferViews[0]).buffer))
    const indices = Array.from(new Uint16Array(decode(json.bufferViews[1]).buffer))
    const corner = (source, i) =>
      source
        .slice(i * 3, i * 3 + 3)
        .map((n) => n.toFixed(3))
        .join(',')
    const triangles = (source, index) =>
      [0, 3]
        .map((t) =>
          index
            .slice(t, t + 3)
            .map((i) => corner(source, i))
            .sort()
            .join('|')
        )
        .sort()
    // Vertices may be reordered, but each triangle still spans the same corners within filter precision.
    assert.deepEqual(triangles(positions, indices), triangles(QUAD_POSITIONS, QUAD_INDICES))
    await plugin.closeBundle()
    assert.deepEqual(await readFile(resolve(dest, sidecar)), first)
    await writeFile(resolve(dir, 'model.glb'), Buffer.from('changed'))
    await assert.rejects(plugin.closeBundle(), /source mismatch/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

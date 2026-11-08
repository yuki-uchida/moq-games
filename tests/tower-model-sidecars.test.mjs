import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'
import { createRequire } from 'node:module'
import { towerModelSidecars, compressGlb } from '../scripts/tower-model-sidecars.mjs'
import { verifyModelSidecar } from '../scripts/verify-model-sidecar.mjs'
import { readGlb } from '../scripts/optimize-tower-models.mjs'
import { quadGlb, animatedQuadGlb, packGlb, QUAD_POSITIONS, QUAD_INDICES } from './glb-fixture.mjs'
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
    const digests = JSON.parse(await readFile(resolve(root, '.build/model-sidecar-digests.json'), 'utf8'))
    assert.equal(digests.models[0].sha256, createHash('sha256').update(glb).digest('hex'))
    assert.equal(digests.models[0].bytes, glb.length)
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

test('validates quantized geometry but exact animation, weights, rigs, winding and images', async () => {
  const original = animatedQuadGlb()
  const sha = createHash('sha256').update(original).digest('hex')
  const result = await verifyModelSidecar(original, await compressGlb(original, sha))
  assert.ok(result.maxError.POSITION > 0, 'fixture must actually exercise lossy precision')
  for (const [name, change] of [
    ['animation', ({ json, bin }) => bin.writeFloatLE(4, json.bufferViews[json.accessors[6].bufferView].byteOffset)],
    ['weights', ({ json, bin }) => bin.writeFloatLE(0.7, json.bufferViews[json.accessors[3].bufferView].byteOffset)],
    ['normals', ({ json, bin }) => bin.writeFloatLE(-1, json.bufferViews[json.accessors[1].bufferView].byteOffset)],
    ['bind matrix', ({ json, bin }) => bin.writeFloatLE(3, json.bufferViews[json.accessors[7].bufferView].byteOffset)],
    [
      'winding',
      ({ json, bin }) => {
        const offset = json.bufferViews[json.accessors[4].bufferView].byteOffset
        bin.writeUInt16LE(2, offset + 2)
        bin.writeUInt16LE(1, offset + 4)
      }
    ],
    ['image', ({ json, bin }) => (bin[json.bufferViews[json.images[0].bufferView].byteOffset] ^= 1)],
    ['rig', ({ json }) => (json.nodes[2].name = 'wrong bone')]
  ]) {
    const changed = readGlb(Buffer.from(original))
    change(changed)
    const corrupt = await compressGlb(packGlb(changed.json, changed.bin), sha)
    await assert.rejects(verifyModelSidecar(original, corrupt), undefined, `${name} corruption must fail`)
  }
})

test('rejects a vertex reorder that changes a shared animation accessor', async () => {
  const source = animatedQuadGlb({ sharedAnimationPositions: true })
  const derived = await compressGlb(source, createHash('sha256').update(source).digest('hex'))
  await assert.rejects(verifyModelSidecar(source, derived), /animation\/bind data must remain exact/)
})

test('worker pool keeps manifest order and rejects with the original error when one model fails', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'moq-sidecars-pool-'))
  try {
    const dir = resolve(root, 'public/tower-defense-art/models/role')
    await mkdir(dir, { recursive: true })
    await mkdir(resolve(root, 'dist/tower-defense-art/models/role'), { recursive: true })
    const models = []
    for (let i = 0; i < 7; i++) {
      const bytes = quadGlb()
      await writeFile(resolve(dir, `m${i}.glb`), bytes)
      models.push({
        file: `role/m${i}.glb`,
        bytes: bytes.length,
        outputSha256: createHash('sha256').update(bytes).digest('hex')
      })
    }
    const manifestPath = resolve(root, 'public/tower-defense-art/models/runtime-manifest.json')
    const plugin = towerModelSidecars(root)
    plugin.configResolved({ root, build: { outDir: 'dist' } })
    await writeFile(manifestPath, JSON.stringify({ models }))
    await plugin.closeBundle()
    const digests = JSON.parse(await readFile(resolve(root, '.build/model-sidecar-digests.json'), 'utf8'))
    assert.deepEqual(
      digests.models.map((m) => m.file),
      models.map((m) => m.file)
    )

    await writeFile(manifestPath, JSON.stringify({ models: models.map((m, i) => (i === 4 ? { ...m, bytes: 1 } : m)) }))
    await assert.rejects(plugin.closeBundle(), /^Error: Model sidecar source mismatch: role[\\/]m4\.glb$/)
    await writeFile(
      manifestPath,
      JSON.stringify({ models: models.map((m, i) => (i === 2 ? { ...m, file: '../x.glb' } : m)) })
    )
    await assert.rejects(plugin.closeBundle(), /^Error: Invalid model sidecar path$/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

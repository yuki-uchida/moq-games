import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { resolve, relative, isAbsolute } from 'node:path'
import { createRequire } from 'node:module'
import { readGlb } from './optimize-tower-models.mjs'
import { verifyModelSidecar } from './verify-model-sidecar.mjs'
const { MeshoptEncoder } = createRequire(import.meta.url)('meshoptimizer')

const EXT = 'EXT_meshopt_compression'
const SIZE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }
const WIDTH = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 }
/** Mantissa bits kept per vertex semantic (error bounded by the shared component exponent). Everything else stays exact:
 * skinning adapters verify weight sums to 1e-5 and rigid skin matrices to 1e-4, so skin weights, animation
 * tracks and inverse bind matrices are never filtered. */
const BITS = {
  POSITION: 14,
  NORMAL: 10,
  TANGENT: 10,
  TEXCOORD: 12,
  COLOR: 10
}

/** Lossy-precision, structure-preserving EXT_meshopt_compression derivative of a plain GLB. */
export async function compressGlb(source, sourceSha256) {
  await MeshoptEncoder.ready
  const { json, bin } = readGlb(source)
  const accessors = json.accessors ?? [],
    views = json.bufferViews ?? []
  const semantic = new Map(),
    vertex = new Set()
  for (const mesh of json.meshes ?? [])
    for (const p of mesh.primitives) {
      if (p.indices !== undefined) semantic.set(p.indices, 'index')
      for (const [name, a] of Object.entries(p.attributes)) semantic.set(a, name.replace(/_\d+$/, '')), vertex.add(a)
      for (const t of p.targets ?? []) for (const a of Object.values(t)) semantic.set(a, 'morph'), vertex.add(a)
    }
  for (const animation of json.animations ?? [])
    for (const channel of animation.channels) {
      const sampler = animation.samplers[channel.sampler]
      semantic.set(sampler.input, 'time')
      semantic.set(sampler.output, channel.target.path)
    }
  const users = views.map(() => [])
  accessors.forEach((a, i) => a.bufferView !== undefined && users[a.bufferView].push(i))
  const elemOf = (a) => SIZE[a.componentType] * WIDTH[a.type]
  const data = views.map((v) => new Uint8Array(bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength)))

  // Cache-friendly vertex order compresses far better and renders the same triangles.
  const owns = (i) => {
    const a = accessors[i],
      v = views[a.bufferView]
    return (
      users[a.bufferView].length === 1 &&
      !a.byteOffset &&
      !a.sparse &&
      !v.byteStride &&
      a.count * elemOf(a) === v.byteLength
    )
  }
  for (const mesh of json.meshes ?? [])
    for (const p of mesh.primitives) {
      const index = accessors[p.indices]
      const attributes = [...Object.values(p.attributes), ...(p.targets ?? []).flatMap((t) => Object.values(t))]
      const count = accessors[attributes[0]].count
      if (
        p.indices === undefined ||
        (p.mode ?? 4) !== 4 ||
        ![5123, 5125].includes(index.componentType) ||
        ![p.indices, ...attributes].every(owns) ||
        attributes.some((i) => accessors[i].count !== count)
      )
        continue
      const raw = data[index.bufferView]
      const indices = Uint32Array.from(
        index.componentType === 5125 ? new Uint32Array(raw.buffer) : new Uint16Array(raw.buffer)
      )
      const [remap, unique] = MeshoptEncoder.reorderMesh(indices, true, true)
      if (unique !== count) continue
      data[index.bufferView] = new Uint8Array(
        (index.componentType === 5125 ? indices : Uint16Array.from(indices)).buffer
      )
      for (const i of attributes) {
        const a = accessors[i],
          elem = elemOf(a),
          src = data[a.bufferView],
          dst = new Uint8Array(src.length)
        for (let v = 0; v < count; v++) dst.set(src.subarray(v * elem, (v + 1) * elem), remap[v] * elem)
        data[a.bufferView] = dst
      }
    }

  const align = (n) => (n + 3) & ~3
  const parts = []
  let binLength = 0,
    fallbackLength = 0
  json.bufferViews = views.map((view, i) => {
    const bytes = data[i],
      used = users[i].map((a) => accessors[a]),
      sems = new Set(users[i].map((a) => semantic.get(a))),
      elems = new Set(used.map(elemOf)),
      stride = view.byteStride ?? (elems.size === 1 ? [...elems][0] : 0),
      sem = sems.size === 1 ? [...sems][0] : undefined
    const count = stride ? bytes.length / stride : 0
    let encoded, mode, filter
    if (!used.length || !stride || !Number.isInteger(count)) {
      // Images and unknown layouts stay as they are.
    } else if (sem === 'index') {
      if ((stride === 2 || stride === 4) && count % 3 === 0) {
        encoded = MeshoptEncoder.encodeIndexBuffer(bytes, count, stride)
        mode = 'TRIANGLES'
      }
    } else if (stride % 4 === 0 && stride <= 256) {
      let input = bytes
      if (BITS[sem] && !view.byteStride && used.every((a) => a.componentType === 5126)) {
        input = MeshoptEncoder.encodeFilterExp(
          new Float32Array(bytes.buffer),
          count,
          stride,
          BITS[sem],
          'SharedComponent'
        )
        filter = 'EXPONENTIAL'
      }
      encoded = MeshoptEncoder.encodeVertexBuffer(input, count, stride)
      mode = 'ATTRIBUTES'
    }
    const output = encoded ?? bytes
    parts.push(output)
    const byteOffset = binLength
    binLength += align(output.length)
    if (!encoded) return { ...view, buffer: 0, byteOffset, byteLength: bytes.length }
    const result = {
      ...view,
      buffer: 1,
      byteOffset: fallbackLength,
      byteLength: bytes.length,
      extensions: {
        ...view.extensions,
        [EXT]: {
          buffer: 0,
          byteOffset,
          byteLength: output.length,
          byteStride: stride,
          count,
          mode,
          ...(filter && { filter })
        }
      }
    }
    if (users[i].some((a) => vertex.has(a))) result.byteStride = stride
    fallbackLength += align(bytes.length)
    return result
  })
  json.buffers = [{ byteLength: binLength }, { byteLength: fallbackLength, extensions: { [EXT]: { fallback: true } } }]
  json.extensionsUsed = [...(json.extensionsUsed ?? []), EXT]
  json.extensionsRequired = [...(json.extensionsRequired ?? []), EXT]
  json.asset = { ...json.asset, extras: { ...json.asset?.extras, sourceSha256 } }

  const text = Buffer.from(JSON.stringify(json)),
    jsonChunk = Buffer.alloc(align(text.length), 0x20)
  text.copy(jsonChunk)
  const binChunk = Buffer.alloc(binLength)
  parts.reduce((offset, part) => (binChunk.set(part, offset), offset + align(part.length)), 0)
  const header = Buffer.alloc(28)
  header.writeUInt32LE(0x46546c67, 0)
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(28 + jsonChunk.length + binChunk.length, 8)
  header.writeUInt32LE(jsonChunk.length, 12)
  header.writeUInt32LE(0x4e4f534a, 16)
  header.writeUInt32LE(binChunk.length, 20)
  header.writeUInt32LE(0x004e4942, 24)
  return Buffer.concat([header.subarray(0, 20), jsonChunk, header.subarray(20), binChunk])
}

/** Deterministic sidecars are build artifacts; original GLBs remain available for fallback. */
export function towerModelSidecars(root) {
  let outDir
  return {
    name: 'tower-model-sidecars',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    async closeBundle() {
      const sourceDir = resolve(root, 'public/tower-defense-art/models')
      const targetDir = resolve(outDir, 'tower-defense-art/models')
      const manifest = JSON.parse(await readFile(resolve(sourceDir, 'runtime-manifest.json'), 'utf8'))
      const models = []
      for (const model of manifest.models) {
        const source = resolve(sourceDir, model.file)
        const rel = relative(sourceDir, source)
        if (!rel || rel.startsWith('..') || isAbsolute(rel) || !rel.endsWith('.glb'))
          throw new Error('Invalid model sidecar path')
        const bytes = await readFile(source)
        if (bytes.length !== model.bytes || createHash('sha256').update(bytes).digest('hex') !== model.outputSha256)
          throw new Error(`Model sidecar source mismatch: ${rel}`)
        const derivative = await compressGlb(bytes, model.outputSha256)
        const verification = await verifyModelSidecar(bytes, derivative)
        const compressed = gzipSync(derivative, { level: 6, mtime: 0 })
        await writeFile(resolve(targetDir, `${rel}.${model.outputSha256}.gz.bin`), compressed)
        models.push({
          file: model.file,
          sourceSha256: model.outputSha256,
          sha256: createHash('sha256').update(derivative).digest('hex'),
          bytes: derivative.length,
          verification
        })
      }
      await mkdir(resolve(root, '.build'), { recursive: true })
      await writeFile(
        resolve(root, '.build/model-sidecar-digests.json'),
        JSON.stringify({ version: 1, models }, null, 2)
      )
    }
  }
}

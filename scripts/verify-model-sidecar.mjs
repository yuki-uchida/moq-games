import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { readGlb, accessorArray } from './optimize-tower-models.mjs'
const { MeshoptDecoder, MeshoptEncoder } = createRequire(import.meta.url)('meshoptimizer')
const EXT = 'EXT_meshopt_compression'
const WIDTH = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }
const BITS = { POSITION: 14, NORMAL: 10, TANGENT: 10, TEXCOORD: 12, COLOR: 10 }

/** Decode through the consumer's decoder, independently of the encoder's input buffers. */
export async function decodeModelSidecar(bytes) {
  await MeshoptDecoder.ready
  assert.equal(bytes.readUInt32LE(0), 0x46546c67)
  assert.equal(bytes.readUInt32LE(4), 2)
  assert.equal(bytes.readUInt32LE(8), bytes.length)
  const length = bytes.readUInt32LE(12)
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a)
  assert.equal(bytes.readUInt32LE(24 + length), 0x004e4942)
  const json = JSON.parse(bytes.subarray(20, 20 + length).toString())
  const bin = bytes.subarray(28 + length)
  assert.equal(bytes.readUInt32LE(20 + length), bin.length)
  assert.equal(json.buffers[0].byteLength, bin.length)
  const parts = []
  let offset = 0
  json.bufferViews = json.bufferViews.map((view) => {
    const ext = view.extensions?.[EXT]
    let data
    if (ext) {
      assert.equal(ext.buffer, 0)
      data = Buffer.alloc(ext.count * ext.byteStride)
      MeshoptDecoder.decodeGltfBuffer(
        data,
        ext.count,
        ext.byteStride,
        bin.subarray(ext.byteOffset, ext.byteOffset + ext.byteLength),
        ext.mode,
        ext.filter
      )
    } else {
      assert.equal(view.buffer, 0)
      data = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength)
    }
    assert.equal(data.length, view.byteLength)
    const result = { ...view, buffer: 0, byteOffset: offset }
    parts.push(data)
    offset += data.length
    return result
  })
  return { json, bin: Buffer.concat(parts) }
}

/** Check every decoded accessor, oriented triangle, image, animation, rig and material.
 * Only the documented vertex semantics may lose precision; tracks, weights, joints,
 * morphs and bind matrices must remain exact after the known vertex permutation. */
export async function verifyModelSidecar(sourceBytes, sidecarBytes) {
  await MeshoptEncoder.ready
  const source = readGlb(sourceBytes),
    decoded = await decodeModelSidecar(sidecarBytes)
  assert.equal(
    decoded.json.asset.extras.sourceSha256,
    createHash('sha256').update(sourceBytes).digest('hex'),
    'source digest'
  )
  const structure = (json) => {
    const value = structuredClone(json)
    delete value.buffers
    delete value.bufferViews
    for (const key of ['extensionsUsed', 'extensionsRequired']) {
      if (value[key]) value[key] = value[key].filter((ext) => ext !== EXT)
      if (!value[key]?.length) delete value[key]
    }
    if (value.asset.extras) {
      delete value.asset.extras.sourceSha256
      if (!Object.keys(value.asset.extras).length) delete value.asset.extras
    }
    return value
  }
  assert.deepEqual(structure(decoded.json), structure(source.json), 'GLB scene/rig/material/clip structure changed')
  assert.equal(decoded.json.bufferViews.length, source.json.bufferViews.length)
  const users = source.json.bufferViews.map(() => [])
  source.json.accessors.forEach((a, i) => a.bufferView !== undefined && users[a.bufferView].push(i))
  const arrays = source.json.accessors.map((_, i) => accessorArray(source, i))
  const exact = new Set()
  for (const animation of source.json.animations ?? [])
    for (const sampler of animation.samplers) {
      exact.add(sampler.input)
      exact.add(sampler.output)
    }
  for (const skin of source.json.skins ?? [])
    if (skin.inverseBindMatrices !== undefined) exact.add(skin.inverseBindMatrices)
  const remaps = new Map(),
    indices = new Map(),
    semantics = new Map()
  const owns = (i) => {
    const a = source.json.accessors[i],
      view = source.json.bufferViews[a.bufferView]
    return (
      users[a.bufferView].length === 1 &&
      !a.byteOffset &&
      !a.sparse &&
      !view.byteStride &&
      arrays[i].byteLength === view.byteLength
    )
  }
  for (const mesh of source.json.meshes ?? [])
    for (const primitive of mesh.primitives) {
      if (primitive.indices !== undefined && (primitive.mode ?? 4) === 4)
        indices.set(primitive.indices, arrays[primitive.indices])
      const attributes = [...Object.values(primitive.attributes), ...(primitive.targets ?? []).flatMap(Object.values)]
      for (const [name, i] of Object.entries(primitive.attributes)) semantics.set(i, name.replace(/_\d+$/, ''))
      const index = source.json.accessors[primitive.indices]
      const count = source.json.accessors[attributes[0]].count
      if (
        primitive.indices === undefined ||
        (primitive.mode ?? 4) !== 4 ||
        ![5123, 5125].includes(index.componentType) ||
        ![primitive.indices, ...attributes].every(owns) ||
        attributes.some((i) => source.json.accessors[i].count !== count)
      )
        continue
      const reordered = Uint32Array.from(arrays[primitive.indices])
      const [remap, unique] = MeshoptEncoder.reorderMesh(reordered, true, true)
      if (unique !== count) continue
      assert.equal(new Set(remap).size, count, 'vertex remap must be a permutation')
      assert.ok(
        remap.every((value) => value < count),
        'vertex remap range'
      )
      // Use original topology through the permutation witness, not the encoder's triangle output as an oracle.
      indices.set(
        primitive.indices,
        Uint32Array.from(arrays[primitive.indices], (value) => remap[value])
      )
      for (const i of attributes) remaps.set(i, remap)
    }
  const orientedTriangles = (values) => {
    const result = []
    for (let i = 0; i < values.length; i += 3) {
      const a = values[i],
        b = values[i + 1],
        c = values[i + 2]
      result.push(a <= b && a <= c ? `${a},${b},${c}` : b <= c ? `${b},${c},${a}` : `${c},${a},${b}`)
    }
    return result.sort()
  }
  const errors = {}
  for (let i = 0; i < arrays.length; i++) {
    const expected = arrays[i],
      actual = accessorArray(decoded, i),
      a = source.json.accessors[i]
    assert.equal(actual.length, expected.length, `accessor ${i} length`)
    if (exact.has(i)) {
      assert.deepEqual(actual, expected, `accessor ${i} animation/bind data must remain exact`)
      continue
    }
    if (indices.has(i)) {
      assert.deepEqual(
        orientedTriangles(actual),
        orientedTriangles(indices.get(i)),
        `accessor ${i} triangle winding/topology`
      )
      continue
    }
    const width = WIDTH[a.type],
      semantic = semantics.get(i),
      remap = remaps.get(i)
    const bits =
      a.componentType === 5126 &&
      !source.json.bufferViews[a.bufferView]?.byteStride &&
      decoded.json.bufferViews[a.bufferView]?.extensions?.[EXT]?.filter === 'EXPONENTIAL'
        ? BITS[semantic]
        : undefined
    const exponents = Array(width).fill(-100)
    if (bits) {
      const view = source.json.bufferViews[a.bufferView]
      for (let n = 0; n < view.byteLength / 4; n++) {
        const value = source.bin.readFloatLE((view.byteOffset ?? 0) + n * 4)
        exponents[n % width] = Math.max(
          exponents[n % width],
          value === 0 ? 0 : Math.floor(Math.log2(Math.abs(value))) + 1
        )
      }
    }
    for (let n = 0; n < expected.length; n++) {
      const destination = remap ? remap[Math.floor(n / width)] * width + (n % width) : n
      const error = Math.abs(actual[destination] - expected[n])
      // Half a quantization step; meshopt assigns exponent zero to zero inputs.
      // https://github.com/zeux/meshoptimizer/blob/v0.22/src/vertexfilter.cpp#L866-L947
      const tolerance = bits ? 2 ** (exponents[n % width] - bits) : 0
      assert.ok(
        Number.isFinite(error) && error <= tolerance,
        `accessor ${i} ${semantic ?? 'exact'} component ${n}: error ${error} > ${tolerance}`
      )
      if (bits) errors[semantic] = Math.max(errors[semantic] ?? 0, error)
    }
  }
  const images = new Set((source.json.images ?? []).map((image) => image.bufferView))
  for (let i = 0; i < users.length; i++)
    if (!users[i].length || images.has(i)) {
      const a = source.json.bufferViews[i],
        b = decoded.json.bufferViews[i]
      assert.deepEqual(
        decoded.bin.subarray(b.byteOffset, b.byteOffset + b.byteLength),
        source.bin.subarray(a.byteOffset ?? 0, (a.byteOffset ?? 0) + a.byteLength),
        `image/opaque bufferView ${i}`
      )
    }
  return { accessors: arrays.length, maxError: errors }
}

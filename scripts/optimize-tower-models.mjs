/**
 * Non-destructive, opt-in game-scale LOD builder. Originals are never modified.
 * Review profile: node scripts/optimize-tower-models.mjs --roles all
 * Game-memory candidate: add --texture-size 512 --output-dir
 * public/tower-defense-art/models-optimized-512 --manifest
 * local-assets/runtime-model-optimization-512.json
 * Defaults weight normals at .2 (Tank .5), retain a 0.3% simplifier error cap,
 * and target 10% triangles (Tank/Soldier 3%). Locks may stop earlier.
 * Requirements: meshoptimizer 0.22.x and sharp 0.35.x (official npm packages).
 * Output remains plain glTF 2.0: no MeshoptDecoder or quantization shader needed.
 * All retained vertex tuples are copied byte-for-byte, including unknown custom
 * attributes and sparse morphs. Animation, skeleton, node and material data are
 * untouched. LOD is lossy topology and texture resampling, requiring GPU review.
 */
import { readFile, writeFile, mkdir, readdir, rename } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { MeshoptSimplifier } = require('meshoptimizer')
const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }
const TYPES = {
  5120: Int8Array,
  5121: Uint8Array,
  5122: Int16Array,
  5123: Uint16Array,
  5125: Uint32Array,
  5126: Float32Array
}
export const DEFAULTS = Object.freeze({
  ratio: 0.1,
  error: 0.003,
  textureSize: 1024,
  textureQuality: 90,
  minTriangles: 1000,
  normalWeight: 0.2
})
export const validModelRole = (role) => typeof role === 'string' && /^[a-z][A-Za-z0-9]*$/.test(role)

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const clone = (value) => JSON.parse(JSON.stringify(value))
const align4 = (n) => (n + 3) & ~3

export function readGlb(bytes) {
  bytes = Buffer.from(bytes)
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length)
    throw Error('Invalid GLB 2.0 header')
  let json, bin
  for (let offset = 12; offset < bytes.length; ) {
    const size = bytes.readUInt32LE(offset),
      type = bytes.readUInt32LE(offset + 4)
    const data = bytes.subarray(offset + 8, offset + 8 + size)
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'))
    else if (type === 0x004e4942) bin = data
    else throw Error('Unrecognized GLB chunk; refusing to drop it')
    offset += 8 + size
  }
  if (!json || !bin || json.buffers?.length !== 1 || json.buffers[0].uri)
    throw Error('Only self-contained single-buffer GLB is supported')
  if (json.extensionsUsed?.length || json.extensionsRequired?.length)
    throw Error('Unreviewed glTF extension; refusing to rewrite')
  return { json, bin }
}

/** Densify an accessor without changing component precision or normalized flags. */
export function accessorArray(glb, index) {
  const a = glb.json.accessors[index],
    Ctor = TYPES[a.componentType],
    width = COMPONENTS[a.type]
  if (!Ctor || !width) throw Error(`Unsupported accessor ${index}`)
  const output = new Ctor(a.count * width),
    rowSize = width * Ctor.BYTES_PER_ELEMENT
  const target = Buffer.from(output.buffer)
  if (a.bufferView !== undefined) {
    const view = glb.json.bufferViews[a.bufferView],
      stride = view.byteStride ?? rowSize
    const offset = (view.byteOffset ?? 0) + (a.byteOffset ?? 0)
    for (let v = 0; v < a.count; v++)
      glb.bin.copy(target, v * rowSize, offset + v * stride, offset + v * stride + rowSize)
  }
  if (a.sparse) {
    const sparse = a.sparse,
      Index = TYPES[sparse.indices.componentType]
    if (![5121, 5123, 5125].includes(sparse.indices.componentType)) throw Error('Invalid sparse index type')
    const iv = glb.json.bufferViews[sparse.indices.bufferView],
      vv = glb.json.bufferViews[sparse.values.bufferView]
    const indicesBytes = Buffer.from(
      glb.bin.subarray(
        (iv.byteOffset ?? 0) + (sparse.indices.byteOffset ?? 0),
        (iv.byteOffset ?? 0) + (sparse.indices.byteOffset ?? 0) + sparse.count * Index.BYTES_PER_ELEMENT
      )
    )
    const indices = new Index(indicesBytes.buffer, indicesBytes.byteOffset, sparse.count)
    const offset = (vv.byteOffset ?? 0) + (sparse.values.byteOffset ?? 0)
    for (let i = 0; i < sparse.count; i++) {
      if (indices[i] >= a.count) throw Error('Sparse index out of bounds')
      glb.bin.copy(target, indices[i] * rowSize, offset + i * rowSize, offset + (i + 1) * rowSize)
    }
  }
  return output
}

function normalize(value, a) {
  if (!a.normalized) return value
  return a.componentType === 5121
    ? value / 255
    : a.componentType === 5123
      ? value / 65535
      : a.componentType === 5120
        ? Math.max(-1, value / 127)
        : a.componentType === 5122
          ? Math.max(-1, value / 32767)
          : value
}
function bounds(array, width) {
  const min = Array(width).fill(Infinity),
    max = Array(width).fill(-Infinity)
  for (let i = 0; i < array.length; i++) {
    const k = i % width
    min[k] = Math.min(min[k], array[i])
    max[k] = Math.max(max[k], array[i])
  }
  return { min, max }
}
function accessorReferences(json) {
  const refs = []
  for (const mesh of json.meshes ?? [])
    for (const p of mesh.primitives) {
      if (p.indices !== undefined) refs.push([p, 'indices'])
      for (const name of Object.keys(p.attributes)) refs.push([p.attributes, name])
      for (const target of p.targets ?? []) for (const name of Object.keys(target)) refs.push([target, name])
    }
  for (const skin of json.skins ?? [])
    if (skin.inverseBindMatrices !== undefined) refs.push([skin, 'inverseBindMatrices'])
  for (const animation of json.animations ?? [])
    for (const sampler of animation.samplers) refs.push([sampler, 'input'], [sampler, 'output'])
  return refs
}
export function meshStats(json) {
  let vertices = 0,
    triangles = 0,
    drawCalls = 0
  for (const mesh of json.meshes ?? [])
    for (const p of mesh.primitives) {
      vertices += json.accessors[p.attributes.POSITION].count
      triangles +=
        (p.indices !== undefined ? json.accessors[p.indices].count : json.accessors[p.attributes.POSITION].count) / 3
      drawCalls++
    }
  return { vertices, triangles, drawCalls }
}

function packGlb(json, views) {
  let offset = 0
  const parts = []
  json.bufferViews = views.map(({ metadata, bytes }) => {
    const result = { ...metadata, buffer: 0, byteOffset: offset, byteLength: bytes.length }
    const padded = Buffer.alloc(align4(bytes.length))
    bytes.copy(padded)
    parts.push(padded)
    offset += padded.length
    return result
  })
  json.buffers[0] = { ...json.buffers[0], byteLength: offset }
  const jsonRaw = Buffer.from(JSON.stringify(json)),
    jsonBytes = Buffer.alloc(align4(jsonRaw.length), 0x20)
  jsonRaw.copy(jsonBytes)
  const header = Buffer.alloc(20)
  header.writeUInt32LE(0x46546c67)
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(28 + jsonBytes.length + offset, 8)
  header.writeUInt32LE(jsonBytes.length, 12)
  header.writeUInt32LE(0x4e4f534a, 16)
  const binHeader = Buffer.alloc(8)
  binHeader.writeUInt32LE(offset)
  binHeader.writeUInt32LE(0x004e4942, 4)
  return Buffer.concat([header, jsonBytes, binHeader, ...parts])
}

/** Remove provenance-only private metadata; never touch executable/runtime fields. */
export function sanitizeRuntimeMetadata(input) {
  const json = clone(input),
    removed = []
  const privateValue =
    /(?:libfile_[a-z0-9]+|gh[pousr]_[A-Za-z0-9]+|github_pat_[A-Za-z0-9_]+|-----BEGIN[^-]*PRIVATE KEY-----|(?:library|sediment|sandbox|file):\/\/|(?:\/Users\/|\/home\/|\/workspace\/|\/tmp\/)|[A-Z]:\\|https?:\/\/(?:chatgpt\.com|[^/]*oaiusercontent\.com|[^/]*blob\.core\.windows\.net|[^/]*amazonaws\.com))/i
  const walk = (value, path, inExtras) => {
    if (Array.isArray(value)) {
      value.forEach((child, i) => walk(child, `${path}/${i}`, inExtras))
      return
    }
    if (!value || typeof value !== 'object') return
    for (const [key, child] of Object.entries(value)) {
      const pointer = `${path}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`
      const reason = /library|sediment/i.test(key)
        ? 'private-library-reference'
        : inExtras && /notes?$/i.test(key)
          ? 'source-notes'
          : inExtras && /(?:local|source|file|blend|archive).*(?:path|url|uri)$/i.test(key)
            ? 'private-source-location'
            : inExtras && typeof child === 'string' && /^(?:sourceScene|sourceFile)$/i.test(key)
              ? 'source-filename'
              : inExtras && typeof child === 'string' && privateValue.test(child)
                ? 'private-location-or-reference'
                : undefined
      if (reason) {
        delete value[key]
        removed.push({ path: pointer, reason })
        continue
      }
      if (!inExtras && typeof child === 'string' && privateValue.test(child))
        throw Error(`Private marker outside extras requires explicit review: ${pointer}`)
      walk(child, pointer, inExtras || key === 'extras')
    }
  }
  walk(json, '', false)
  if (privateValue.test(JSON.stringify(json))) throw Error('Private metadata marker remains after sanitization')
  return { json, removed }
}

export async function optimizeGlb(sourceBytes, options = {}) {
  const config = { ...DEFAULTS, ...options }
  if (!(config.ratio > 0 && config.ratio <= 1) || !(config.error >= 0 && config.error <= 0.01))
    throw Error('LOD ratio/error outside reviewed safety limits')
  if (!Number.isInteger(config.textureSize) || config.textureSize < 128 || config.textureSize > 4096)
    throw Error('Invalid texture size')
  await MeshoptSimplifier.ready
  MeshoptSimplifier.useExperimentalFeatures = true
  if (!Number.isFinite(config.normalWeight) || config.normalWeight < 0.01 || config.normalWeight > 1)
    throw Error('Invalid normal fidelity weight')
  const source = readGlb(sourceBytes),
    json = clone(source.json),
    views = json.bufferViews.map((v) => ({
      metadata: clone(v),
      bytes: source.bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength)
    }))
  const audit = {
    config,
    before: { ...meshStats(json), bytes: sourceBytes.length },
    primitives: [],
    textures: [],
    validation: {},
    sourceSha256: hash(sourceBytes)
  }
  const arrayCache = new Map()
  const getArray = (i) => {
    if (!arrayCache.has(i)) arrayCache.set(i, accessorArray(source, i))
    return arrayCache.get(i)
  }
  const appendAccessor = (oldIndex, array, target) => {
    const previous = source.json.accessors[oldIndex]
    const a = {
      ...clone(previous),
      count: array.length / COMPONENTS[previous.type],
      bufferView: views.length,
      byteOffset: 0
    }
    delete a.sparse
    if (previous.min || previous.max) Object.assign(a, bounds(array, COMPONENTS[a.type]))
    views.push({
      metadata: target ? { target } : {},
      bytes: Buffer.from(array.buffer, array.byteOffset, array.byteLength)
    })
    json.accessors.push(a)
    return json.accessors.length - 1
  }
  for (const [meshIndex, mesh] of json.meshes.entries())
    for (const [primitiveIndex, primitive] of mesh.primitives.entries()) {
      const original = source.json.meshes[meshIndex].primitives[primitiveIndex]
      if ((primitive.mode ?? 4) !== 4 || primitive.indices === undefined)
        throw Error('Unreviewed non-indexed/non-triangle primitive')
      const posAccessor = source.json.accessors[primitive.attributes.POSITION]
      if (posAccessor.componentType !== 5126 || posAccessor.type !== 'VEC3')
        throw Error('Expected unquantized float positions')
      const positions = getArray(primitive.attributes.POSITION),
        indices = Uint32Array.from(getArray(primitive.indices)),
        vertexCount = positions.length / 3
      const locked = new Uint8Array(vertexCount)
      const unreviewedAttributes = Object.keys(primitive.attributes).filter(
        (name) =>
          !/^(POSITION|NORMAL|TANGENT|TEXCOORD_\d+|COLOR_\d+|JOINTS_\d+|WEIGHTS_\d+|_BLINKRESTPOSITION|_BLINK_REST|_(RANGER|CANNON)(WEIGHTS[01]|JOINTS1))$/.test(
            name
          )
      )
      // Preserve unfamiliar semantics conservatively; no guessing their meaning.
      if (unreviewedAttributes.length) locked.fill(1)
      // Preserve every geometrically active morph vertex and one-ring neighborhood.
      // Normals and all other morph endpoint tuples remain exact on retained vertices.
      for (const target of primitive.targets ?? [])
        if (target.POSITION !== undefined) {
          const deltas = getArray(target.POSITION)
          for (let v = 0; v < vertexCount; v++)
            if (deltas[v * 3] !== 0 || deltas[v * 3 + 1] !== 0 || deltas[v * 3 + 2] !== 0) locked[v] = 1
        }
      const morphLocked = locked.slice()
      for (let i = 0; i < indices.length; i += 3)
        if (morphLocked[indices[i]] || morphLocked[indices[i + 1]] || morphLocked[indices[i + 2]])
          for (let k = 0; k < 3; k++) locked[indices[i + k]] = 1
      // Bone-index discontinuities cannot be approximated as continuous attributes.
      // Protect their incident triangles; retain weights exactly without renormalizing.
      const jointSets = Object.entries(primitive.attributes)
        .filter(([name]) => /JOINTS/.test(name))
        .map(([, a]) => [getArray(a), COMPONENTS[source.json.accessors[a].type]])
      for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i],
          b = indices[i + 1],
          c = indices[i + 2]
        let boundary = false
        for (const [data, width] of jointSets)
          for (let k = 0; k < width; k++)
            if (data[a * width + k] !== data[b * width + k] || data[a * width + k] !== data[c * width + k])
              boundary = true
        if (boundary) locked[a] = locked[b] = locked[c] = 1
      }
      const attributes = Object.entries(primitive.attributes).filter(
        ([name]) => name === 'NORMAL' || name === 'TEXCOORD_0' || name === 'COLOR_0' || /WEIGHTS/.test(name)
      )
      const columns = attributes.map(([name, a]) => ({
        data: getArray(a),
        accessor: source.json.accessors[a],
        width: COMPONENTS[source.json.accessors[a].type],
        weight: /WEIGHTS/.test(name) ? 0.5 : name === 'NORMAL' ? config.normalWeight : 0.1
      }))
      const stride = columns.reduce((sum, c) => sum + c.width, 0)
      if (stride > 32) throw Error('More than 32 simplification attributes requires a reviewed policy')
      const attributeData = new Float32Array(vertexCount * stride),
        weights = columns.flatMap((c) => Array(c.width).fill(c.weight))
      for (let v = 0; v < vertexCount; v++) {
        let col = 0
        for (const c of columns)
          for (let k = 0; k < c.width; k++)
            attributeData[v * stride + col++] = normalize(c.data[v * c.width + k], c.accessor)
      }
      const targetCount = Math.max(3, Math.floor((indices.length * config.ratio) / 3) * 3)
      const [reduced, error] =
        indices.length / 3 > config.minTriangles && config.ratio < 1
          ? MeshoptSimplifier.simplifyWithAttributes(
              indices,
              positions,
              3,
              attributeData,
              stride,
              weights,
              locked,
              targetCount,
              config.error,
              ['LockBorder']
            )
          : [indices, 0]
      if (error > config.error + 1e-6 || reduced.length > indices.length)
        throw Error('Simplifier exceeded configured error/count')
      const kept = [],
        reverse = new Map(),
        remapped = new Uint32Array(reduced.length)
      for (let i = 0; i < reduced.length; i++) {
        const old = reduced[i]
        if (!reverse.has(old)) {
          reverse.set(old, kept.length)
          kept.push(old)
        }
        remapped[i] = reverse.get(old)
      }
      // Every morph-position-active vertex referenced by the source must survive.
      for (const old of new Set(indices))
        if (morphLocked[old] && !reverse.has(old)) throw Error('Simplifier removed an authored morph endpoint')
      let preservedComponents = 0
      const remapAccessor = (oldIndex) => {
        const a = source.json.accessors[oldIndex],
          old = getArray(oldIndex),
          width = COMPONENTS[a.type]
        if (a.count !== vertexCount) throw Error('Mismatched custom/morph attribute count')
        const next = new old.constructor(kept.length * width)
        for (let v = 0; v < kept.length; v++)
          for (let k = 0; k < width; k++) next[v * width + k] = old[kept[v] * width + k]
        // Compare bytes, not floating-point tolerances. NaN payloads are not accepted.
        if (old instanceof Float32Array && !next.every(Number.isFinite)) throw Error('Non-finite retained attribute')
        preservedComponents += next.length
        return appendAccessor(oldIndex, next, 34962)
      }
      for (const name of Object.keys(primitive.attributes))
        primitive.attributes[name] = remapAccessor(original.attributes[name])
      for (let t = 0; t < (primitive.targets?.length ?? 0); t++)
        for (const name of Object.keys(primitive.targets[t]))
          primitive.targets[t][name] = remapAccessor(original.targets[t][name])
      const indexArray = kept.length <= 65535 ? Uint16Array.from(remapped) : remapped
      primitive.indices = appendAccessor(original.indices, indexArray, 34963)
      json.accessors[primitive.indices].componentType = indexArray instanceof Uint16Array ? 5123 : 5125
      audit.primitives.push({
        mesh: meshIndex,
        primitive: primitiveIndex,
        name: mesh.name ?? '',
        inputVertices: vertexCount,
        outputVertices: kept.length,
        inputTriangles: indices.length / 3,
        outputTriangles: reduced.length / 3,
        relativeError: error,
        lockedVertices: locked.reduce((a, b) => a + b, 0),
        morphPositionVertices: morphLocked.reduce((a, b) => a + b, 0),
        preservedComponents,
        unreviewedAttributes,
        retainedSourceVertices: kept
      })
    }
  if (config.resizeTextures !== false) {
    const sharp = require('sharp')
    for (let index = 0; index < (json.images?.length ?? 0); index++) {
      const image = json.images[index]
      if (image.uri || image.bufferView === undefined || !['image/jpeg', 'image/png'].includes(image.mimeType))
        throw Error('Unreviewed texture encoding')
      const before = views[image.bufferView].bytes,
        metadata = await sharp(before).metadata()
      const resized = sharp(before).resize({
        width: config.textureSize,
        height: config.textureSize,
        fit: 'inside',
        withoutEnlargement: true
      })
      const after = await (
        image.mimeType === 'image/jpeg'
          ? resized.jpeg({ quality: config.textureQuality, chromaSubsampling: '4:4:4' })
          : resized.png()
      ).toBuffer()
      const output = await sharp(after).metadata()
      views[image.bufferView].bytes = after
      audit.textures.push({
        index,
        mimeType: image.mimeType,
        before: { bytes: before.length, width: metadata.width, height: metadata.height },
        after: { bytes: after.length, width: output.width, height: output.height }
      })
    }
  }
  // Only known reference sites may be remapped. Unknown extensions are rejected above.
  const refs = accessorReferences(json),
    live = [...new Set(refs.map(([obj, key]) => obj[key]))].sort((a, b) => a - b),
    accessorMap = new Map(live.map((old, i) => [old, i]))
  for (const [obj, key] of refs) obj[key] = accessorMap.get(obj[key])
  json.accessors = live.map((i) => json.accessors[i])
  const viewRefs = []
  for (const a of json.accessors) {
    if (a.bufferView !== undefined) viewRefs.push([a, 'bufferView'])
    if (a.sparse) viewRefs.push([a.sparse.indices, 'bufferView'], [a.sparse.values, 'bufferView'])
  }
  for (const image of json.images ?? []) if (image.bufferView !== undefined) viewRefs.push([image, 'bufferView'])
  const liveViews = [...new Set(viewRefs.map(([obj, key]) => obj[key]))].sort((a, b) => a - b),
    viewMap = new Map(liveViews.map((old, i) => [old, i]))
  for (const [obj, key] of viewRefs) obj[key] = viewMap.get(obj[key])
  const sanitized = sanitizeRuntimeMetadata(json)
  const result = packGlb(
    sanitized.json,
    liveViews.map((i) => views[i])
  )
  audit.metadataSanitization = {
    removed: sanitized.removed,
    binaryDataPolicy: 'Only JSON metadata changes; all runtime accessors separately verified'
  }
  audit.after = { ...meshStats(json), bytes: result.length }
  const geometryAccessors = new Set()
  for (const mesh of json.meshes)
    for (const p of mesh.primitives) {
      geometryAccessors.add(p.indices)
      Object.values(p.attributes).forEach((i) => geometryAccessors.add(i))
      for (const target of p.targets ?? []) Object.values(target).forEach((i) => geometryAccessors.add(i))
    }
  audit.loadBudget = {
    geometryDecodedBytes: [...geometryAccessors].reduce((sum, i) => {
      const a = json.accessors[i]
      return sum + a.count * COMPONENTS[a.type] * TYPES[a.componentType].BYTES_PER_ELEMENT
    }, 0),
    animationDecodedBytes: [
      ...new Set((json.animations ?? []).flatMap((a) => a.samplers.flatMap((s) => [s.input, s.output])))
    ].reduce((sum, i) => {
      const a = json.accessors[i]
      return sum + a.count * COMPONENTS[a.type] * TYPES[a.componentType].BYTES_PER_ELEMENT
    }, 0),
    estimatedTextureRgbaWithMipBytes: Math.ceil(
      audit.textures.reduce((sum, t) => sum + (t.after.width * t.after.height * 4 * 4) / 3, 0)
    ),
    scope:
      'Per GLB. Mesh/texture sharing across independently loaded rigs is not assumed. Excludes renderer overhead and draw-time instancing.'
  }
  audit.outputSha256 = hash(result)
  audit.validation = verifyPreservation(sourceBytes, result, audit.primitives)
  return { bytes: result, audit }
}

/** Exhaustive numeric/structural check; cannot establish visual equivalence. */
export function verifyPreservation(beforeBytes, afterBytes, primitiveAudits) {
  const before = readGlb(beforeBytes),
    after = readGlb(afterBytes)
  // Compare metadata against the independently sanitized source. Numeric
  // accessor data is always compared against the untouched original bytes.
  before.json = sanitizeRuntimeMetadata(before.json).json
  for (const key of ['asset', 'scene', 'scenes', 'nodes', 'materials', 'textures', 'samplers', 'extras'])
    if (JSON.stringify(before.json[key]) !== JSON.stringify(after.json[key])) throw Error(`Changed ${key}`)
  const compareAccessor = (ai, bi, kept) => {
    const a = accessorArray(before, ai),
      b = accessorArray(after, bi),
      old = before.json.accessors[ai],
      next = after.json.accessors[bi],
      width = COMPONENTS[old.type]
    if (old.componentType !== next.componentType || old.type !== next.type || old.normalized !== next.normalized)
      throw Error('Accessor interpretation changed')
    if (kept) {
      if (b.length !== kept.length * width) throw Error('Retained vertex count mismatch')
      for (let v = 0; v < kept.length; v++)
        for (let k = 0; k < width; k++)
          if (a[kept[v] * width + k] !== b[v * width + k]) throw Error('Retained attribute changed')
    } else if (!Buffer.from(a.buffer).equals(Buffer.from(b.buffer))) throw Error('Non-geometry accessor changed')
  }
  let components = 0,
    animationSamplers = 0
  for (const entry of primitiveAudits) {
    const a = before.json.meshes[entry.mesh].primitives[entry.primitive],
      b = after.json.meshes[entry.mesh].primitives[entry.primitive]
    for (const key of ['name', 'extras', 'weights'])
      if (JSON.stringify(before.json.meshes[entry.mesh][key]) !== JSON.stringify(after.json.meshes[entry.mesh][key]))
        throw Error('Mesh metadata changed')
    if (
      JSON.stringify(Object.keys(a.attributes)) !== JSON.stringify(Object.keys(b.attributes)) ||
      a.material !== b.material ||
      JSON.stringify(a.extras) !== JSON.stringify(b.extras)
    )
      throw Error('Primitive attributes/material changed')
    for (const name of Object.keys(a.attributes))
      compareAccessor(a.attributes[name], b.attributes[name], entry.retainedSourceVertices)
    if ((a.targets?.length ?? 0) !== (b.targets?.length ?? 0)) throw Error('Morph count changed')
    for (let t = 0; t < (a.targets?.length ?? 0); t++) {
      if (JSON.stringify(Object.keys(a.targets[t])) !== JSON.stringify(Object.keys(b.targets[t])))
        throw Error('Morph attributes changed')
      for (const name of Object.keys(a.targets[t]))
        compareAccessor(a.targets[t][name], b.targets[t][name], entry.retainedSourceVertices)
    }
    components += entry.preservedComponents
  }
  if ((before.json.animations?.length ?? 0) !== (after.json.animations?.length ?? 0))
    throw Error('Animation count changed')
  for (let i = 0; i < (before.json.animations?.length ?? 0); i++) {
    const a = before.json.animations[i],
      b = after.json.animations[i]
    const structure = (animation) => ({
      ...animation,
      samplers: animation.samplers.map(({ input, output, ...rest }) => rest)
    })
    if (JSON.stringify(structure(a)) !== JSON.stringify(structure(b)))
      throw Error('Animation channel/interpolation/extras changed')
    for (let s = 0; s < a.samplers.length; s++) {
      compareAccessor(a.samplers[s].input, b.samplers[s].input)
      compareAccessor(a.samplers[s].output, b.samplers[s].output)
      animationSamplers++
    }
  }
  if ((before.json.skins?.length ?? 0) !== (after.json.skins?.length ?? 0)) throw Error('Skin count changed')
  for (let i = 0; i < (before.json.skins?.length ?? 0); i++) {
    const { inverseBindMatrices: a, ...as } = before.json.skins[i],
      { inverseBindMatrices: b, ...bs } = after.json.skins[i]
    if (JSON.stringify(as) !== JSON.stringify(bs)) throw Error('Skin metadata/joint order changed')
    if (a !== undefined) compareAccessor(a, b)
  }
  return {
    exactRetainedVertexComponents: components,
    retainedVertexMaximumAbsoluteError: 0,
    exactAnimationSamplers: animationSamplers,
    exactNodesMaterialsSkinsAndExtras: true,
    metadataComparison:
      'Exact against independently sanitized source; private references and source notes removed only at audited JSON pointers',
    morphEndpointPolicy:
      'Preserve every nonzero position-morph vertex and adjacent ring; copy every retained morph component exactly',
    gpuVisualReview: 'pending: headless browser infrastructure unavailable; CPU preservation is not GPU acceptance'
  }
}

async function main() {
  const args = process.argv.slice(2),
    value = (name) => {
      const index = args.indexOf(name)
      return index < 0 ? undefined : args[index + 1]
    }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
    input = resolve(root, value('--input-dir') ?? 'local-assets/models-source'),
    output = resolve(root, value('--output-dir') ?? 'public/tower-defense-art/models-optimized')
  if (!existsSync(input))
    throw Error(
      'Preserved original models are required; supply --input-dir. Do not re-optimize the public runtime derivatives.'
    )
  if (existsSync(resolve(input, 'runtime-manifest.json')))
    throw Error('Input is a runtime derivative pack. Use preserved original models, not an already optimized pack.')
  if (input === output || !relative(input, output).startsWith('..'))
    throw Error('Derivatives must be outside the original input tree')
  const requestedRoles = value('--roles') ?? 'tank,mage,ranger,dragon'
  const roles =
    requestedRoles === 'all'
      ? (await readdir(input, { withFileTypes: true }))
          .filter((d) => d.isDirectory())
          .map((d) => d.name)
          .sort()
      : requestedRoles.split(',')
  if (roles.some((role) => !validModelRole(role))) throw Error('Invalid role')
  const config = {
    ...DEFAULTS,
    ...(value('--ratio') ? { ratio: Number(value('--ratio')) } : {}),
    ...(value('--error') ? { error: Number(value('--error')) } : {}),
    ...(value('--texture-size') ? { textureSize: Number(value('--texture-size')) } : {}),
    ...(value('--normal-weight') ? { normalWeight: Number(value('--normal-weight')) } : {})
  }
  const manifestPath = resolve(root, value('--manifest') ?? 'local-assets/runtime-model-optimization.json')
  const mapsDirectory = manifestPath.replace(/\.json$/, '') + '-maps'
  let manifest = {
    schemaVersion: 1,
    generatedBy: 'scripts/optimize-tower-models.mjs',
    sourcePolicy:
      'Originals preserved; derivatives only. Do not adopt before CPU contracts and representative GPU review.',
    tools: { meshoptimizer: require('meshoptimizer/package.json').version, sharp: require('sharp').versions.sharp },
    assets: []
  }
  try {
    const old = JSON.parse(await readFile(manifestPath, 'utf8'))
    manifest.assets = old.assets ?? []
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  for (const role of roles) {
    for (const file of (await readdir(resolve(input, role))).filter((f) => f.endsWith('.glb')).sort()) {
      const sourcePath = resolve(input, role, file),
        targetPath = resolve(output, role, file),
        beforeBytes = await readFile(sourcePath)
      const roleConfig = {
        ...config,
        ...(!value('--ratio') && ['tank', 'soldier'].includes(role) ? { ratio: 0.03 } : {}),
        ...(!value('--normal-weight') && role === 'tank' ? { normalWeight: 0.5 } : {})
      }
      const { bytes, audit } = await optimizeGlb(beforeBytes, roleConfig)
      if (hash(await readFile(sourcePath)) !== audit.sourceSha256) throw Error('Source changed during optimization')
      await mkdir(dirname(targetPath), { recursive: true })
      await writeFile(targetPath + '.tmp', bytes)
      if (hash(await readFile(targetPath + '.tmp')) !== audit.outputSha256)
        throw Error('Derivative write verification failed')
      await rename(targetPath + '.tmp', targetPath)
      // Retained-source maps make numerical comparisons independently reproducible.
      const mapFile = resolve(mapsDirectory, role, file + '.json')
      await mkdir(dirname(mapFile), { recursive: true })
      await writeFile(mapFile, JSON.stringify(audit.primitives.map((p) => p.retainedSourceVertices)))
      const record = {
        role,
        file,
        source: relative(root, sourcePath),
        output: relative(root, targetPath),
        vertexMap: relative(root, mapFile),
        ...audit,
        primitives: audit.primitives.map(({ retainedSourceVertices, ...rest }) => rest)
      }
      manifest.assets = manifest.assets.filter((a) => a.role !== role || a.file !== file)
      manifest.assets.push(record)
      manifest.summary = {
        roles: new Set(manifest.assets.map((a) => a.role)).size,
        files: manifest.assets.length,
        beforeBytes: manifest.assets.reduce((sum, a) => sum + a.before.bytes, 0),
        afterBytes: manifest.assets.reduce((sum, a) => sum + a.after.bytes, 0),
        beforeTriangles: manifest.assets.reduce((sum, a) => sum + a.before.triangles, 0),
        afterTriangles: manifest.assets.reduce((sum, a) => sum + a.after.triangles, 0),
        estimatedTextureRgbaWithMipBytes: manifest.assets.reduce(
          (sum, a) => sum + (a.loadBudget?.estimatedTextureRgbaWithMipBytes ?? 0),
          0
        )
      }
      await mkdir(dirname(manifestPath), { recursive: true })
      await writeFile(manifestPath + '.tmp', JSON.stringify(manifest, null, 2) + '\n')
      await rename(manifestPath + '.tmp', manifestPath)
      console.log(
        `${role}/${file}: ${(audit.before.bytes / 1048576).toFixed(2)} → ${(audit.after.bytes / 1048576).toFixed(2)} MiB; ${audit.before.triangles} → ${audit.after.triangles} triangles; ${audit.before.vertices} → ${audit.after.vertices} vertices`
      )
    }
  }
  const publicManifest = {
    schemaVersion: 1,
    status: 'Geometry/texture candidate; Three.js custom-material/DQ/GPU review pending',
    summary: { files: manifest.assets.length, bytes: manifest.assets.reduce((sum, a) => sum + a.after.bytes, 0) },
    models: manifest.assets
      .map((a) => ({
        role: a.role,
        file: `${a.role}/${a.file}`,
        sourceSha256: a.sourceSha256,
        outputSha256: a.outputSha256,
        bytes: a.after.bytes,
        vertices: a.after.vertices,
        triangles: a.after.triangles,
        sourceBytes: a.before.bytes,
        sourceTriangles: a.before.triangles,
        config: a.config
      }))
      .sort((a, b) => a.file.localeCompare(b.file))
  }

  await writeFile(resolve(output, 'runtime-manifest.json'), JSON.stringify(publicManifest, null, 2) + '\n')
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })

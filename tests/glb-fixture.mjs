/** Smallest plain GLB the sidecar compressor accepts: one indexed quad with float positions. */
export const QUAD_POSITIONS = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]
export const QUAD_INDICES = [0, 1, 2, 0, 2, 3]

export function packGlb(json, bin) {
  const align = (n) => (n + 3) & ~3
  const text = Buffer.from(JSON.stringify(json))
  const jsonChunk = Buffer.alloc(align(text.length), 0x20)
  text.copy(jsonChunk)
  const binChunk = Buffer.alloc(align(bin.length))
  binChunk.set(bin)
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

export function quadGlb(extra = {}) {
  const positions = Buffer.from(new Float32Array(QUAD_POSITIONS).buffer)
  const indices = Buffer.from(new Uint16Array(QUAD_INDICES).buffer)
  const json = {
    asset: { version: '2.0', ...extra },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 4, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5123, count: 6, type: 'SCALAR' }
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.length, target: 34962 },
      { buffer: 0, byteOffset: positions.length, byteLength: indices.length, target: 34963 }
    ],
    buffers: [{ byteLength: positions.length + indices.length }]
  }
  return packGlb(json, Buffer.concat([positions, indices]))
}

/** Exercise vertex permutation, lossy attributes, exact skinning/tracks and opaque image bytes. */
export function animatedQuadGlb({ sharedAnimationPositions = false } = {}) {
  const parts = [],
    bufferViews = [],
    accessors = []
  let size = 0
  const view = (bytes) => {
    const index = bufferViews.length
    bufferViews.push({ buffer: 0, byteOffset: size, byteLength: bytes.length })
    const padded = Buffer.alloc((bytes.length + 3) & ~3)
    bytes.copy(padded)
    parts.push(padded)
    size += padded.length
    return index
  }
  const accessor = (values, type, componentType = 5126) => {
    const ArrayType = componentType === 5126 ? Float32Array : Uint16Array
    const bufferView = view(Buffer.from(new ArrayType(values).buffer))
    accessors.push({
      bufferView,
      componentType,
      count: values.length / { SCALAR: 1, VEC3: 3, VEC4: 4, MAT4: 16 }[type],
      type
    })
    return accessors.length - 1
  }
  const POSITION = accessor(
    QUAD_POSITIONS.map((n) => n + 0.123456),
    'VEC3'
  )
  const NORMAL = accessor(Array(4).fill([0.123, 0.456, 0.88]).flat(), 'VEC3')
  const JOINTS_0 = accessor(Array(4).fill([0, 1, 2, 0]).flat(), 'VEC4', 5123)
  const WEIGHTS_0 = accessor(Array(4).fill([0.2, 0.3, 0.5, 0]).flat(), 'VEC4')
  const indices = accessor(sharedAnimationPositions ? [2, 3, 0, 2, 0, 1] : QUAD_INDICES, 'SCALAR', 5123)
  const input = accessor(sharedAnimationPositions ? [0, 0.3, 0.6, 1] : [0, 0.5, 1], 'SCALAR')
  const output = accessor([0, 0, 0, 0.2, 0.5, 0, 0, 0, 0], 'VEC3')
  const inverseBindMatrices = accessor(Array(3).fill([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]).flat(), 'MAT4')
  const image = view(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDZ8AAAAASUVORK5CYII=',
      'base64'
    )
  )
  return packGlb(
    {
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [0, 1] }],
      nodes: [{ mesh: 0, skin: 0 }, { name: 'hip', children: [2] }, { name: 'leg', children: [3] }, { name: 'foot' }],
      meshes: [{ primitives: [{ attributes: { POSITION, NORMAL, JOINTS_0, WEIGHTS_0 }, indices }] }],
      skins: [{ joints: [1, 2, 3], inverseBindMatrices }],
      animations: [
        {
          name: 'walk',
          samplers: [{ input, output: sharedAnimationPositions ? POSITION : output, interpolation: 'LINEAR' }],
          channels: [{ sampler: 0, target: { node: 1, path: 'translation' } }]
        }
      ],
      images: [{ bufferView: image, mimeType: 'image/png' }],
      bufferViews,
      accessors,
      buffers: [{ byteLength: size }]
    },
    Buffer.concat(parts)
  )
}

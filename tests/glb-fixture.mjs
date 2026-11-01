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

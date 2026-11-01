/** Trim pinned remnants of the original cut arms, retaining the authored flank fillers.
 * Original GLB and all vertex/skin/animation bytes are preserved locally. Only the
 * original torso skin's triangle index lists are replaced; rebuilt arms are untouched.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { readGlb, accessorArray } from './optimize-tower-models.mjs'
const source = 'local-assets/locomotion-repair/ogre-original.glb'
const target = 'public/tower-defense-art/models/ogre/ogre-motion-arm-swing20.glb'
const bytes = readFileSync(source),
  { json, bin } = readGlb(bytes)
if (
  createHash('sha256').update(bytes).digest('hex') !==
  '6834b2e3804545d1555a2b229ae262ec52424f5d61974428eff138dfbbda01f5'
)
  throw Error('Unexpected Ogre source; preserve and inspect it before regeneration')
let offset = bin.length
const parts = [bin],
  report = []
const body = json.nodes.find((n) => n.name === 'Ogre_Original_Body')
for (const [index, primitive] of json.meshes[body.mesh].primitives.entries()) {
  if (index > 1) continue // The skirt primitive is unrelated.
  const positions = accessorArray({ json, bin }, primitive.attributes.POSITION)
  const indices = accessorArray({ json, bin }, primitive.indices)
  const retained = []
  let removed = 0
  for (let i = 0; i < indices.length; i += 3) {
    const triangle = Array.from(indices.subarray(i, i + 3))
    // Native Y-up. The source's torso center is asymmetric: x≈0.04.
    // Existing Ogre_Flank_R/L cover these lateral cut-arm volumes.
    const remnant = triangle.some((v) => {
      const x = positions[v * 3],
        y = positions[v * 3 + 1],
        z = positions[v * 3 + 2]
      return (x < -0.23 || x > 0.36) && y > -0.22 && y < 0.3 && z > -0.6 && z < -0.08
    })
    if (remnant) removed++
    else retained.push(...triangle)
  }
  const array = new Uint32Array(retained),
    data = Buffer.from(array.buffer)
  const padding = Buffer.alloc((4 - (offset % 4)) % 4)
  parts.push(padding)
  offset += padding.length
  const view = json.bufferViews.length
  json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.length, target: 34963 })
  const accessor = json.accessors.length
  json.accessors.push({
    bufferView: view,
    componentType: 5125,
    count: array.length,
    type: 'SCALAR',
    min: [Math.min(...retained)],
    max: [Math.max(...retained)]
  })
  primitive.indices = accessor
  parts.push(data)
  offset += data.length
  report.push({
    primitive: index,
    originalTriangles: indices.length / 3,
    removedTriangles: removed,
    remainingTriangles: retained.length / 3
  })
}
const newBin = Buffer.concat(parts)
json.buffers[0].byteLength = newBin.length
const finalJson = Buffer.from(JSON.stringify(json)),
  jsonChunk = Buffer.concat([finalJson, Buffer.alloc((4 - (finalJson.length % 4)) % 4, 0x20)])
const header = Buffer.alloc(20)
header.writeUInt32LE(0x46546c67, 0)
header.writeUInt32LE(2, 4)
header.writeUInt32LE(28 + jsonChunk.length + newBin.length, 8)
header.writeUInt32LE(jsonChunk.length, 12)
header.writeUInt32LE(0x4e4f534a, 16)
const binHeader = Buffer.alloc(8)
binHeader.writeUInt32LE(newBin.length, 0)
binHeader.writeUInt32LE(0x004e4942, 4)
const output = Buffer.concat([header, jsonChunk, binHeader, newBin])
writeFileSync(target, output)
writeFileSync(
  'local-assets/locomotion-repair/ogre-generation-report.json',
  JSON.stringify(
    {
      sourceSha256: createHash('sha256').update(bytes).digest('hex'),
      outputSha256: createHash('sha256').update(output).digest('hex'),
      bytes: output.length,
      report,
      animationsPreserved: true,
      weightsPreserved: true,
      vertexAttributesPreserved: true
    },
    null,
    2
  ) + '\n'
)
console.log(report)

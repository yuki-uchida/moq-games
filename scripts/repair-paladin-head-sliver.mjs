/** Removes a stray 47-triangle island from the Paladin head primitive (glTF mesh 1, primitive 0).
 * The island is skinned 100% to `head` and sits inside the rest sword blade, so it shows as a dark
 * sliver beside the head whenever the sword moves. Its triangles are made degenerate in place.
 * Index count, vertices, weights, binds, materials and animations are unchanged, as is the byte length.
 * Input is the scripts/repair-roster-motion.mjs output. Re-run this after that script.
 * Run from repository root: node scripts/repair-paladin-head-sliver.mjs
 */
import fs from 'node:fs'
import crypto from 'node:crypto'
import { readGlb } from './optimize-tower-models.mjs'
const file = 'public/tower-defense-art/models/paladin/paladin-motion-v2-candidate.glb',
  provenancePath = 'examples/games/tower_diffence_with_jev/src/rendering/models/paladin-head-sliver-provenance.json',
  manifestPath = 'public/tower-defense-art/models/runtime-manifest.json',
  inputSha256 = '3a64f163df6700f14ca1b87d0caad40cb4000a984793a2c58b02907990b60ced',
  skipped = new Set([42509, 42511, 42514, 42515, 42518]),
  triangles = Array.from({ length: 52 }, (_, i) => 42507 + i).filter((t) => !skipped.has(t))
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex')
const input = fs.readFileSync(file)
if (hash(input) !== inputSha256) {
  const done = fs.existsSync(provenancePath) && JSON.parse(fs.readFileSync(provenancePath, 'utf8'))
  if (done?.outputSha256 === hash(input)) process.exit(console.log('already applied'))
  throw Error(`Unexpected input bytes: ${file}`)
}
const g = readGlb(input),
  a = g.json.accessors[g.json.meshes[1].primitives[0].indices],
  view = g.json.bufferViews[a.bufferView]
if (a.componentType !== 5123) throw Error('Expected uint16 indices')
// GLB binary chunk starts after the 12-byte header, 8-byte JSON chunk header, JSON and 8-byte BIN header.
const base = 28 + input.readUInt32LE(12) + (view.byteOffset ?? 0) + (a.byteOffset ?? 0),
  output = Buffer.from(input)
for (const t of triangles) {
  const first = output.readUInt16LE(base + t * 6)
  output.writeUInt16LE(first, base + t * 6 + 2)
  output.writeUInt16LE(first, base + t * 6 + 4)
}
fs.mkdirSync('local-assets/paladin-head-sliver', { recursive: true })
if (!fs.existsSync('local-assets/paladin-head-sliver/input.glb'))
  fs.writeFileSync('local-assets/paladin-head-sliver/input.glb', input)
fs.writeFileSync(file, output)
const record = {
  role: 'paladin',
  file: 'paladin-motion-v2-candidate.glb',
  generator: 'scripts/repair-paladin-head-sliver.mjs',
  inputSha256,
  outputSha256: hash(output),
  bytes: output.length,
  mesh: 'glTF mesh 1 (Paladin_Head_Original) primitive 0',
  degenerateTriangles: triangles,
  preserved: 'all bytes except those triangles’ second and third indices'
}
fs.writeFileSync(provenancePath, JSON.stringify(record, null, 2) + '\n')
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')),
  m = manifest.models.find((x) => x.file === 'paladin/paladin-motion-v2-candidate.glb')
m.outputSha256 = record.outputSha256
m.headSliverRepair = { inputSha256, script: record.generator, provenance: provenancePath }
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
console.log(record.outputSha256)

import fs from 'node:fs'
import { readGlb, accessorArray } from './optimize-tower-models.mjs'
const manifestPath = 'public/tower-defense-art/models/runtime-manifest.json',
  provenancePath = 'examples/games/tower_diffence_with_jev/src/rendering/models/asset-provenance.json',
  m = JSON.parse(fs.readFileSync(manifestPath)),
  p = JSON.parse(fs.readFileSync(provenancePath))
for (const r of JSON.parse(fs.readFileSync('scripts/caster-v3-provenance.json'))) {
  const g = readGlb(fs.readFileSync(r.output))
  const file = r.output.split('/models/')[1]
  const metrics = {
    vertices: g.json.meshes.reduce(
      (sum, mesh) => sum + mesh.primitives.reduce((s, p) => s + g.json.accessors[p.attributes.POSITION].count, 0),
      0
    ),
    triangles: g.json.meshes.reduce(
      (sum, mesh) => sum + mesh.primitives.reduce((s, p) => s + g.json.accessors[p.indices].count / 3, 0),
      0
    )
  }
  m.models = m.models.filter((x) => x.file !== file)
  m.models.push({
    role: r.role,
    file,
    sourceSha256: r.sourceSHA256,
    outputSha256: r.outputSHA256,
    bytes: r.bytesAfter,
    ...metrics,
    sourceBytes: r.bytesBefore,
    method:
      'Animation derivative; original geometry/materials and bind matrices retained; healer garment joint reassignment',
    provenance: 'scripts/caster-v3-provenance.json'
  })
  p.splice(0, p.length, ...p.filter((x) => !(x.role === r.role && x.file === file.split('/')[1])))
  p.push({
    role: r.role,
    file: file.split('/')[1],
    sha256: r.sourceSHA256,
    archive: r.input,
    archiveSha256: r.sourceSHA256,
    basis: 'glTF Y-up; derivative of preserved runtime v2',
    verification: '8-direction runtime/EXTRA review; docs/caster-motion-review.md'
  })
}
m.summary = { files: m.models.length, bytes: m.models.reduce((s, r) => s + r.bytes, 0) }
fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2) + '\n')
fs.writeFileSync(provenancePath, JSON.stringify(p, null, 2) + '\n')

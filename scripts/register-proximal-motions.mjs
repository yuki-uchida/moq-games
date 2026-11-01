import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { readGlb, accessorArray, meshStats } from './optimize-tower-models.mjs'
const hash = (x) =>
  createHash('sha256')
    .update(typeof x === 'string' || Buffer.isBuffer(x) ? x : JSON.stringify(x))
    .digest('hex')
const names = {
  wolf: 'wolf-walk-smooth.glb',
  brute: 'brute-motion-v2-candidate.glb',
  ogre: 'ogre-motion-arm-swing20.glb'
}
const audit = { date: '2026-11-01', blender: '5.2.3 LTS e13b728c6880', units: {} }
for (const [role, file] of Object.entries(names)) {
  const source = readFileSync(`local-assets/locomotion-repair/${role}-original.glb`),
    runtime = readFileSync(`public/tower-defense-art/models/${role}/${file}`),
    g = readGlb(source),
    r = readGlb(runtime)
  const attributeHashes = {}
  for (let mi = 0; mi < g.json.meshes.length; mi++)
    for (let pi = 0; pi < g.json.meshes[mi].primitives.length; pi++)
      for (const [k, i] of Object.entries(g.json.meshes[mi].primitives[pi].attributes)) {
        if (role === 'wolf' && ['JOINTS_0', 'WEIGHTS_0'].includes(k)) continue
        attributeHashes[`${mi}/${pi}/${k}`] = hash(Buffer.from(accessorArray(g, i).buffer))
      }
  const unchangedClips = role === 'ogre' ? ['idle', 'walk', 'attack'] : role === 'wolf' ? ['idle', 'attack'] : ['idle']
  const clipHashes = {}
  for (const name of unchangedClips) {
    const a = g.json.animations.find((a) => a.name === name)
    clipHashes[name] = {
      metadata: hash(a),
      samples: hash(
        a.samplers.map((s) => [
          hash(Buffer.from(accessorArray(g, s.input).buffer)),
          hash(Buffer.from(accessorArray(g, s.output).buffer))
        ])
      )
    }
  }
  audit.units[role] = {
    file,
    baselineSha256: hash(source),
    outputSha256: hash(runtime),
    baselineBytes: source.length,
    bytes: runtime.length,
    baselineStats: meshStats(g.json),
    stats: meshStats(r.json),
    nodeHash: hash(g.json.nodes),
    skinHash: hash(g.json.skins),
    materialHash: hash(g.json.materials),
    attributeHashes,
    clipHashes
  }
}
writeFileSync('docs/animation-repair-audit.json', JSON.stringify(audit, null, 2) + '\n')

const manifestPath = 'public/tower-defense-art/models/runtime-manifest.json'
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
for (const [role, record] of Object.entries(audit.units)) {
  const entry = manifest.models.find((m) => m.role === role && m.file === `${role}/${record.file}`)
  if (!entry) throw Error(`Missing existing manifest entry for ${role}`)
  Object.assign(entry, {
    outputSha256: record.outputSha256,
    bytes: record.bytes,
    ...record.stats,
    motionRevision: role === 'ogre' ? 'arm-remnant-v1' : 'proximal-v1',
    motionSourceSha256: record.baselineSha256
  })
}
manifest.summary.files = manifest.models.length
manifest.summary.bytes = manifest.models.reduce((n, m) => n + m.bytes, 0)
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')

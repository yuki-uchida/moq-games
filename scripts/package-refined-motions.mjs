/** Motion-only overlays reuse the existing GLBs, textures and cached geometry. */
import fs from 'node:fs'
import crypto from 'node:crypto'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
const base = 'public/tower-defense-art/models'
const loader = new GLTFLoader()
loader.register(() => ({
  name: 'NO_TEXTURE_IO_FOR_CLIP_EXTRACTION',
  loadTexture: () => Promise.resolve(new THREE.Texture())
}))
const specs = [
  ['archer', 'walk', 'archer-walk-natural-v2.glb', 'archer-walk-candidate.glb'],
  ['runner', 'walk', 'runner-walk-natural-v2.glb', 'runner-walk-current.glb'],
  ['tank', 'walk', 'tank-walk-clearance-v2.glb', 'tank-walk-candidate.glb'],
  ['tank', 'attack', 'tank-attack-candidate-combat-v2.glb', 'tank-attack-candidate.glb'],
  ['crystalSentinel', 'attack', 'crystal-sentinel-combat-v2.glb', 'crystal-sentinel.glb'],
  ['koboldLancer', 'attack', 'amber-kobold-lancer-combat-v2.glb', 'amber-kobold-lancer.glb']
]
const records = []
fs.mkdirSync(`${base}/motions`, { recursive: true })
for (const [role, motion, candidate, source] of specs) {
  const bytes = fs.readFileSync(`local-assets/refined-motions-v2/glb-candidates/${role}/${candidate}`),
    jsonLength = bytes.readUInt32LE(12),
    doc = JSON.parse(bytes.subarray(20, 20 + jsonLength))
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
  const clip = gltf.animations.find((c) => c.name === motion)
  clip.userData = structuredClone(doc.animations.find((a) => a.name === motion).extras ?? {})
  clip.tracks = clip.tracks.filter((t) => !t.name.endsWith('.scale'))
  clip.optimize()
  const json = THREE.AnimationClip.toJSON(clip)
  delete json.uuid
  const output = `${role}-${motion}-v2.json`,
    text = JSON.stringify(json, (_k, v) => (typeof v === 'number' ? Number(v.toFixed(8)) : v)) + '\n'
  fs.writeFileSync(`${base}/motions/${output}`, text)
  records.push({
    role,
    motion,
    source,
    sourceSha256: crypto
      .createHash('sha256')
      .update(fs.readFileSync(`${base}/${role}/${source}`))
      .digest('hex'),
    clip: output,
    duration: clip.duration,
    tracks: clip.tracks.length,
    bytes: Buffer.byteLength(text),
    sha256: crypto.createHash('sha256').update(text).digest('hex')
  })
}
fs.writeFileSync('scripts/refined-motions-manifest.json', JSON.stringify(records, null, 2) + '\n')
console.log(records)

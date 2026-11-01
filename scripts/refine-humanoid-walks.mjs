/** Preserve geometry/bind poses and replace only lower-body walk samples.
 * Inputs are immutable accepted exports; outputs are separate v2 derivatives.
 * Source Blender walk scenes were unavailable; no reconstructed .blend is claimed.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { Quaternion, Vector3 } from 'three'
const base = 'public/tower-defense-art/models'
const specs = [
  {
    role: 'archer',
    input: 'archer-walk-candidate.glb',
    output: 'archer-walk-natural-v2.glb',
    pelvis: 0.282,
    ankle: 0.025,
    stride: 0.095,
    lift: 0.034,
    bob: 0.004
  },
  {
    role: 'runner',
    input: 'runner-walk-current.glb',
    output: 'runner-walk-natural-v2.glb',
    pelvis: 0.478,
    ankle: 0.055,
    stride: 0.085,
    lift: 0.048,
    bob: 0.004
  }
]
const xAxis = new Vector3(1, 0, 0)
const angle = (a) => new Quaternion().setFromAxisAngle(xAxis, a)
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex')
const records = []
for (const spec of specs) {
  const input = path.join(base, spec.role, spec.input)
  const bytes = fs.readFileSync(input)
  const jsonSize = bytes.readUInt32LE(12)
  const doc = JSON.parse(bytes.subarray(20, 20 + jsonSize).toString())
  const binary = Buffer.from(bytes.subarray(28 + jsonSize))
  const nodes = new Map(doc.nodes.map((node, index) => [node.name, { ...node, index }]))
  const clip = doc.animations.find((clip) => clip.name === 'walk')
  const access = (index) => {
    const a = doc.accessors[index],
      v = doc.bufferViews[a.bufferView]
    const width = { SCALAR: 1, VEC3: 3, VEC4: 4 }[a.type]
    if (a.componentType !== 5126 || !width) throw Error('Expected float animation accessor')
    const offset = (v.byteOffset ?? 0) + (a.byteOffset ?? 0),
      stride = v.byteStride ?? width * 4
    return {
      count: a.count,
      read: (i) => Array.from({ length: width }, (_, k) => binary.readFloatLE(offset + i * stride + k * 4)),
      write: (i, values) => values.forEach((value, k) => binary.writeFloatLE(value, offset + i * stride + k * 4))
    }
  }
  const tracks = new Map(
    clip.channels.map((channel) => {
      const sampler = clip.samplers[channel.sampler]
      return [
        `${doc.nodes[channel.target.node].name}:${channel.target.path}`,
        { times: access(sampler.input), values: access(sampler.output), sampler }
      ]
    })
  )
  const pelvisTrack = tracks.get('pelvis:translation')
  const oldPelvis = Array.from({ length: pelvisTrack.values.count }, (_, i) => pelvisTrack.values.read(i))
  const duration = pelvisTrack.times.read(pelvisTrack.times.count - 1)[0]
  const originalFoot = (side) =>
    ['thigh', 'shin', 'foot'].reduce(
      (q, part) => q.multiply(new Quaternion().fromArray(nodes.get(`${part}.${side}`).rotation ?? [0, 0, 0, 1])),
      new Quaternion()
    )
  const footOrientation = { L: originalFoot('L'), R: originalFoot('R') }
  for (let i = 0; i < pelvisTrack.values.count; i++) {
    const cycle = pelvisTrack.times.read(i)[0] / duration
    const hipY = spec.pelvis + spec.bob * (1 - Math.cos(cycle * Math.PI * 4))
    const delta = new Vector3(-oldPelvis[i][0], hipY - oldPelvis[i][1], -oldPelvis[i][2])
    pelvisTrack.values.write(i, [0, hipY, 0])
    tracks.get('pelvis:rotation').values.write(i, [0, 0, 0, 1])
    for (const side of ['L', 'R']) {
      const phase = (cycle + (side === 'R' ? 0.5 : 0)) % 1
      // Stance travels back at constant speed; swing returns with zero vertical
      // velocity at contact. No lateral target motion or toe-out rotation.
      const stance = phase < 0.5,
        u = stance ? phase * 2 : (phase - 0.5) * 2
      const z = stance ? spec.stride * (1 - 2 * u) : -spec.stride * Math.cos(Math.PI * u)
      const y = spec.ankle + (stance ? 0 : spec.lift * Math.sin(Math.PI * u) ** 2)
      const thigh = nodes.get(`thigh.${side}`),
        shin = nodes.get(`shin.${side}`),
        foot = nodes.get(`foot.${side}`)
      const hip = new Vector3(...thigh.translation).add(new Vector3(0, hipY, 0))
      const l1 = new Vector3(...shin.translation).length(),
        l2 = new Vector3(...foot.translation).length()
      const dy = y - hip.y,
        dz = z - hip.z,
        distance = Math.hypot(dy, dz)
      if (distance >= l1 + l2) throw Error(`${spec.role}: unreachable ankle at ${cycle}`)
      const bend = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + distance * distance - l2 * l2) / (2 * l1 * distance))))
      const direction = Math.atan2(dz, dy)
      const thighAngle = direction - bend
      const knee = hip.clone().add(new Vector3(0, l1 * Math.cos(thighAngle), l1 * Math.sin(thighAngle)))
      const shinAngle = Math.atan2(z - knee.z, y - knee.y)
      const tq = angle(thighAngle),
        sq = angle(shinAngle - thighAngle)
      const fq = angle(shinAngle).invert().multiply(footOrientation[side])
      for (const [part, q] of [
        ['thigh', tq],
        ['shin', sq],
        ['foot', fq]
      ])
        tracks.get(`${part}.${side}:rotation`).values.write(i, q.toArray())
      // Archer's repaired body uses independent world-space skin helpers.
      for (const [part, position, q] of [
        ['thigh', hip, tq],
        ['shin', knee, angle(shinAngle)]
      ]) {
        tracks.get(`skin_bind_${part}.${side}:translation`)?.values.write(i, position.toArray())
        tracks.get(`skin_bind_${part}.${side}:rotation`)?.values.write(i, q.toArray())
      }
    }
    // Independently animated bow controls must follow the corrected pelvis.
    for (const name of ['Bow_Rigid_Control', 'Nocked_Arrow_Control', 'Archer_Bow_Grip_Control']) {
      const track = tracks.get(`${name}:translation`)
      if (track) track.values.write(i, new Vector3(...track.values.read(i)).add(delta).toArray())
    }
  }
  // Close the tiny source bow-control drift as well as the lower-body seam.
  for (const track of tracks.values()) track.values.write(track.values.count - 1, track.values.read(0))
  // Dense quaternion samples must retain shortest-arc continuity at the seam.
  for (const [name, track] of tracks)
    if (name.endsWith(':rotation')) {
      for (let i = 1; i < track.values.count; i++) {
        const prev = track.values.read(i - 1),
          next = track.values.read(i)
        if (prev.reduce((s, v, k) => s + v * next[k], 0) < 0)
          track.values.write(
            i,
            next.map((v) => -v)
          )
      }
    }
  const output = Buffer.from(bytes)
  binary.copy(output, 28 + jsonSize)
  const preservation = `local-assets/walk-natural-v2/originals/${spec.role}`
  fs.mkdirSync(preservation, { recursive: true })
  if (!fs.existsSync(path.join(preservation, spec.input))) fs.copyFileSync(input, path.join(preservation, spec.input))
  const outputDir = path.join('local-assets/refined-motions-v2/glb-candidates', spec.role)
  fs.mkdirSync(outputDir, { recursive: true })
  const destination = path.join(outputDir, spec.output)
  fs.writeFileSync(destination, output)
  records.push({
    ...spec,
    sourceSha256: hash(bytes),
    outputSha256: hash(output),
    duration,
    bytes: output.length,
    policy:
      'Geometry, weights, inverse bind matrices, node rest transforms, clip duration, sample times and upper-body keys preserved; independent bow controls translated with pelvis.'
  })
}
fs.writeFileSync('scripts/humanoid-walk-v2-provenance.json', JSON.stringify(records, null, 2) + '\n')
console.log(records)

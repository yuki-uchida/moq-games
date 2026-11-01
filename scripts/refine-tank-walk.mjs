import fs from 'node:fs'
import { Vector3, Quaternion } from 'three'
import { readMotion, solveArm } from './lib/glb-motion.mjs'
const source = 'public/tower-defense-art/models/tank/tank-walk-candidate.glb',
  rig = readMotion(source, 'walk'),
  frames = []
const neutral = new Map(
  rig.doc.nodes
    .filter((n) => ['leg.L', 'leg.R', 'shin.L', 'shin.R'].includes(n.name))
    .map((n) => [n.name, new Quaternion().fromArray(n.rotation ?? [0, 0, 0, 1])])
)
const duration = 0.625
for (let i = 0; i <= 192; i++) {
  rig.sample((i / 192) * duration)
  for (const [name, rest] of neutral) {
    const node = rig.nodes.get(name)
    node.quaternion.copy(rest.clone().slerp(node.quaternion, 0.58))
  }
  for (const name of ['foot.L', 'foot.R']) {
    const foot = rig.nodes.get(name)
    foot.position.z *= 0.58
  }
  rig.update()
  const shield = rig.nodes.get('shield'),
    target = shield.getWorldPosition(new Vector3()).add(new Vector3(0.085, 0.065, 0.075)),
    orientation = shield.getWorldQuaternion(new Quaternion())
  solveArm(rig, 'upper_arm', 'forearm', 'shield', target, new Vector3(0.9, 0.65, 0.04), orientation)
  frames.push(rig.capture())
}
fs.mkdirSync('local-assets/refined-motions-v2/glb-candidates/tank', { recursive: true })
rig.write('local-assets/refined-motions-v2/glb-candidates/tank/tank-walk-clearance-v2.glb', frames, duration)
fs.writeFileSync(
  'scripts/tank-walk-v2-provenance.json',
  JSON.stringify(
    {
      source,
      output: 'tank-walk-clearance-v2.glb',
      duration,
      samples: 193,
      legAmplitude: 0.58,
      shieldGripOffset: [0.085, 0.065, 0.075],
      policy:
        'Original rig, geometry, weights, bind poses and grip preserved. Shorter stride and raised/outward shield arm.'
    },
    null,
    2
  ) + '\n'
)

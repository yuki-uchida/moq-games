import fs from 'node:fs'
import crypto from 'node:crypto'
import { Vector3, Quaternion } from 'three'
import { readMotion, key, rotateWorld, solveArm } from './lib/glb-motion.mjs'
const base = 'public/tower-defense-art/models',
  x = new Vector3(1, 0, 0),
  y = new Vector3(0, 1, 0),
  z = new Vector3(0, 0, 1),
  records = []
for (const role of ['crystalSentinel', 'koboldLancer', 'tank']) {
  const input =
    role === 'crystalSentinel'
      ? 'crystal-sentinel.glb'
      : role === 'koboldLancer'
        ? 'amber-kobold-lancer.glb'
        : 'tank-attack-candidate.glb'
  const source = `${base}/${role}/${input}`,
    rig = readMotion(source, 'attack'),
    duration = { crystalSentinel: 1.5, koboldLancer: 1.2, tank: 0.864 }[role],
    cue = { crystalSentinel: 26 / 30, koboldLancer: 19 / 30, tank: 0.468 }[role]
  const handName = role === 'tank' ? 'shield' : 'hand.R',
    hand = rig.nodes.get(handName),
    restHand = hand.getWorldQuaternion(new Quaternion()),
    restPosition = hand.getWorldPosition(new Vector3()),
    restLeft = rig.nodes.get('hand.L')?.getWorldQuaternion(new Quaternion()),
    frames = []
  for (let i = 0; i <= Math.ceil(duration * 120); i++) {
    const t = (i * duration) / Math.ceil(duration * 120)
    rig.sample(0)
    const draw = key(t, [
      [0, 0],
      [cue * 0.68, 1],
      [cue * 0.82, 1],
      [cue, 0],
      [duration, 0]
    ])
    const strike = key(t, [
      [0, 0],
      [cue * 0.82, 0],
      [cue, 1],
      [cue + 0.07, 1],
      [duration, 0]
    ])
    const recover = key(t, [
      [0, 0],
      [cue * 0.3, 1],
      [duration * 0.86, 1],
      [duration, 0]
    ])
    if (role === 'crystalSentinel') {
      const spine = rig.nodes.get('spine')
      spine.quaternion
        .setFromAxisAngle(y, -0.34 * draw + 0.28 * strike)
        .multiply(new Quaternion().setFromAxisAngle(x, -0.1 * draw + 0.17 * strike))
      rig.update()
      const target = restPosition
        .clone()
        .lerp(new Vector3(-0.52, 1.15, -0.1), draw)
        .lerp(new Vector3(-0.27, 1.16, 0.48), strike)
      solveArm(rig, 'upper_arm.R', 'forearm.R', 'hand.R', target, new Vector3(-1, 0.92, 0.03), restHand)
      const guard = new Vector3(0.43, 1.04, 0.2)
      const left = rig.nodes.get('hand.L').getWorldPosition(new Vector3()).lerp(guard, recover)
      solveArm(rig, 'upper_arm.L', 'forearm.L', 'hand.L', left, new Vector3(0.95, 0.8, 0), restLeft)
    } else if (role === 'koboldLancer') {
      const spine = rig.nodes.get('spine')
      spine.quaternion
        .setFromAxisAngle(y, -0.3 * draw + 0.25 * strike)
        .multiply(new Quaternion().setFromAxisAngle(x, -0.12 * draw + 0.2 * strike))
      rig.update()
      const target = restPosition
        .clone()
        .lerp(new Vector3(-0.39, 0.9, -0.13), draw)
        .lerp(new Vector3(-0.22, 0.96, 0.45), strike)
      // Original spear and its rigid attachment remain bound to the same hand.
      const ready = key(t, [
        [0, 0],
        [cue * 0.58, 1],
        [duration * 0.83, 1],
        [duration, 0]
      ])
      const orientation = new Quaternion().setFromAxisAngle(x, (Math.PI / 2) * ready).multiply(restHand)
      solveArm(rig, 'upper_arm.R', 'forearm.R', 'hand.R', target, new Vector3(-0.9, 0.8, -0.12), orientation)
      rotateWorld(rig.nodes.get('upper_arm.L'), z, 0.2 * draw - 0.18 * strike)
      rotateWorld(rig.nodes.get('tail.01'), y, 0.12 * draw - 0.18 * strike)
    } else {
      // Shield is the Tank's only authored rigid weapon: brace, drive, recoil.
      const chest = rig.nodes.get('chest')
      chest.quaternion
        .setFromAxisAngle(y, -0.18 * draw + 0.2 * strike)
        .multiply(new Quaternion().setFromAxisAngle(x, -0.06 * draw + 0.16 * strike))
      rig.update()
      const target = restPosition
        .clone()
        .add(new Vector3(0.055, 0.045, -0.045).multiplyScalar(draw))
        .add(new Vector3(0.065, 0.045, 0.18).multiplyScalar(strike))
      const orientation = new Quaternion().setFromAxisAngle(y, -0.1 * draw + 0.12 * strike).multiply(restHand)
      solveArm(rig, 'upper_arm', 'forearm', 'shield', target, new Vector3(0.85, 0.65, 0.05), orientation)
      rotateWorld(rig.nodes.get('offarm'), x, -0.2 * draw + 0.22 * strike)
    }
    rig.update()
    frames.push(rig.capture())
  }
  const output = input.replace('.glb', '-combat-v2.glb')
  const outputDir = `local-assets/refined-motions-v2/glb-candidates/${role}`
  fs.mkdirSync(outputDir, { recursive: true })
  rig.write(`${outputDir}/${output}`, frames, duration)
  const hash = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')
  records.push({
    role,
    motion: 'attack',
    source: input,
    output,
    duration,
    cue,
    sourceSha256: hash(source),
    outputSha256: hash(`${outputDir}/${output}`),
    samples: frames.length,
    geometry:
      'Original binary geometry, weights, inverse binds and rest transforms preserved; only attack animation replaced.'
  })
}
fs.writeFileSync('scripts/combat-v2-provenance.json', JSON.stringify(records, null, 2) + '\n')
console.log(records)

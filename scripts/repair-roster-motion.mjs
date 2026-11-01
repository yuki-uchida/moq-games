/** Reproducible, role-specific pose repair. Input is a preserved pre-repair GLB tree.
 * Meshes, bind matrices, materials, hierarchy and non-target actions are retained.
 * Usage: node scripts/repair-roster-motion.mjs --source local-assets/motion-originals
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import * as THREE from 'three'
import { readGlb, accessorArray } from './optimize-tower-models.mjs'
const sourceIndex = process.argv.indexOf('--source')
const source = sourceIndex < 0 ? undefined : process.argv[sourceIndex + 1]
if (!source || source === process.argv[0]) throw Error('Pass --source with the preserved baseline tree')
const output = 'public/tower-defense-art/models'
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex')
const smooth = (x) => {
  x = Math.max(0, Math.min(1, x))
  return x * x * (3 - 2 * x)
}
const files = {
  ranger: ['ranger-walk-candidate.glb', 'ranger-attack-candidate.glb'],
  paladin: ['paladin-motion-v2-candidate.glb'],
  goblin: ['goblin-walk-smooth.glb']
}
const provenancePath = 'examples/games/tower_diffence_with_jev/src/rendering/models/motion-repair-provenance.json'
const expectedInputs = new Map(
  JSON.parse(fs.readFileSync(provenancePath, 'utf8')).records.map((r) => [r.file, r.inputSha256])
)
const records = []
for (const [role, names] of Object.entries(files))
  for (const file of names) {
    const bytes = fs.readFileSync(path.join(source, role, file)),
      g = readGlb(bytes),
      j = g.json
    if (hash(bytes) !== expectedInputs.get(file)) throw Error(`Unexpected baseline bytes: ${file}`)
    const nodes = j.nodes.map((n) => {
      const o = new THREE.Object3D()
      o.name = n.name ?? ''
      o.position.fromArray(n.translation ?? [0, 0, 0])
      o.quaternion.fromArray(n.rotation ?? [0, 0, 0, 1])
      o.scale.fromArray(n.scale ?? [1, 1, 1])
      return o
    })
    for (let i = 0; i < nodes.length; i++) for (const child of j.nodes[i].children ?? []) nodes[i].add(nodes[child])
    const scene = new THREE.Group()
    for (const i of j.scenes[j.scene ?? 0].nodes) scene.add(nodes[i])
    scene.updateMatrixWorld(true)
    const named = (n) => {
      const node = nodes.find((o) => o.name === n)
      if (!node) throw Error(`Missing ${role}/${n}`)
      return node
    }
    const saved = nodes.map((o) => ({
      p: o.position.clone(),
      q: o.quaternion.clone(),
      s: o.scale.clone(),
      m: o.matrixWorld.clone()
    }))
    const reset = () => {
      nodes.forEach((o, i) => {
        o.position.copy(saved[i].p)
        o.quaternion.copy(saved[i].q)
        o.scale.copy(saved[i].s)
      })
      scene.updateMatrixWorld(true)
    }
    const world = (n) => n.getWorldPosition(new THREE.Vector3())
    const restPosition = (n) => new THREE.Vector3().setFromMatrixPosition(saved[nodes.indexOf(named(n))].m)
    const restRotation = (n) => new THREE.Quaternion().setFromRotationMatrix(saved[nodes.indexOf(named(n))].m)
    function setWorldQuaternion(o, q) {
      const parent = o.parent.getWorldQuaternion(new THREE.Quaternion())
      o.quaternion.copy(parent.invert().multiply(q))
      scene.updateMatrixWorld(true)
    }
    function aim(o, child, target) {
      const a = world(o),
        b = world(child),
        q = new THREE.Quaternion().setFromUnitVectors(b.sub(a).normalize(), target.clone().sub(a).normalize())
      const parent = o.parent.getWorldQuaternion(new THREE.Quaternion())
      o.quaternion.premultiply(parent.clone().invert().multiply(q).multiply(parent))
      scene.updateMatrixWorld(true)
    }
    const errors = []
    const reachLimits = {}
    function ik(upper, lower, end, target, pole, endQ) {
      const a = world(upper),
        l1 = lower.position.length(),
        l2 = end.position.length(),
        axis = target.clone().sub(a),
        requested = axis.length(),
        d = Math.max(Math.abs(l1 - l2) + 1e-6, Math.min(l1 + l2 - 1e-6, requested))
      axis.normalize()
      const bend = pole.clone().sub(a)
      bend.addScaledVector(axis, -bend.dot(axis)).normalize()
      const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d),
        height = Math.sqrt(Math.max(0, l1 * l1 - along * along))
      const knee = a.clone().addScaledVector(axis, along).addScaledVector(bend, height)
      aim(upper, lower, knee)
      aim(lower, end, a.clone().addScaledVector(axis, d))
      setWorldQuaternion(end, endQ)
      errors.push(Math.abs(requested - d))
      reachLimits[upper.name] = Math.max(reachLimits[upper.name] ?? 0, Math.abs(requested - d))
    }
    function legs(t, motion) {
      const pelvis = named('pelvis'),
        rest = saved[nodes.indexOf(pelvis)].p
      const travel = { ranger: 0.26, paladin: 0.34, goblin: 0.42 }[role],
        drop = { ranger: 0.032, paladin: 0.025, goblin: 0.045 }[role]
      pelvis.position.copy(rest)
      pelvis.position.y -= drop + (motion === 'walk' ? 0.006 * (1 + Math.cos(t * Math.PI * 4)) : 0)
      if (motion === 'walk') pelvis.position.x += Math.sin(t * Math.PI * 2) * 0.007
      else {
        const cue = { ranger: 0.625, paladin: 0.416 / 0.768, goblin: 0.396 / 0.864 }[role],
          wind = smooth(t / (cue * 0.72)),
          strike = smooth((t - cue * 0.72) / (cue * 0.28)),
          recover = smooth((t - cue) / (1 - cue))
        pelvis.position.y -= 0.012 * wind * (1 - strike)
        pelvis.position.z += -0.012 * wind * (1 - strike) + 0.025 * strike * (1 - recover)
      }
      scene.updateMatrixWorld(true)
      for (const [side, offset] of [
        ['L', 0],
        ['R', 0.5]
      ]) {
        const foot = named(`foot.${side}`),
          target = restPosition(foot.name),
          phase = (t + offset) % 1,
          stance = 0.62
        if (motion === 'walk') {
          const stride = travel * stance
          target.z +=
            phase < stance ? stride * (0.5 - phase / stance) : stride * (-0.5 + smooth((phase - stance) / (1 - stance)))
          if (phase >= stance)
            target.y +=
              Math.sin((Math.PI * (phase - stance)) / (1 - stance)) *
              { ranger: 0.035, paladin: 0.045, goblin: 0.055 }[role]
        }
        ik(
          named(`thigh.${side}`),
          named(`shin.${side}`),
          foot,
          target,
          target.clone().add(new THREE.Vector3(0, 0.2, 0.5)),
          restRotation(foot.name)
        )
        // Ranger's original toe influences are independent deform bones. They must
        // follow the repaired foot delta rather than a second, contradictory gait.
        if (role === 'ranger')
          for (const segment of ['thigh', 'shin']) {
            const helper = named(`skin_bind_toe_${segment}.${side}`),
              oldFoot = saved[nodes.indexOf(foot)].m,
              delta = foot.matrixWorld.clone().multiply(oldFoot.clone().invert()),
              m = delta.multiply(saved[nodes.indexOf(helper)].m).premultiply(helper.parent.matrixWorld.clone().invert())
            m.decompose(helper.position, helper.quaternion, helper.scale)
          }
      }
    }
    function arm(side, target, pole, q) {
      ik(named(`upper.${side}`), named(`fore.${side}`), named(`hand.${side}`), target, pole, q)
    }
    function moveTool(name, side) {
      const tool = named(name),
        hand = named(`hand.${side}`),
        delta = hand.matrixWorld.clone().multiply(saved[nodes.indexOf(hand)].m.clone().invert())
      const m = delta.multiply(saved[nodes.indexOf(tool)].m).premultiply(tool.parent.matrixWorld.clone().invert())
      m.decompose(tool.position, tool.quaternion, tool.scale)
      scene.updateMatrixWorld(true)
    }
    const chunks = [g.bin]
    let size = g.bin.length
    function append(values, type) {
      const array = new Float32Array(values),
        pad = (4 - (size % 4)) % 4
      if (pad) {
        chunks.push(Buffer.alloc(pad))
        size += pad
      }
      const data = Buffer.from(array.buffer),
        view = j.bufferViews.length
      j.bufferViews.push({ buffer: 0, byteOffset: size, byteLength: data.length })
      chunks.push(data)
      size += data.length
      const width = { SCALAR: 1, VEC3: 3, VEC4: 4 }[type],
        index = j.accessors.length
      j.accessors.push({ bufferView: view, componentType: 5126, count: array.length / width, type })
      return index
    }
    for (const animation of j.animations) {
      if (!['walk', 'attack'].includes(animation.name)) continue
      const duration = Math.max(
        ...animation.samplers.map((s) => j.accessors[s.input].max?.[0] ?? Math.max(...accessorArray(g, s.input)))
      )
      const motion = animation.name,
        times = Array.from({ length: Math.ceil(duration * 120) + 1 }, (_, i) => Math.min(duration, i / 120))
      if (motion === 'attack') times.push({ ranger: 0.75, paladin: 0.416, goblin: 0.396 }[role])
      times.splice(0, times.length, ...new Set(times.map(Math.fround)))
      times.sort((a, b) => a - b)
      const driven = new Set(j.skins[0].joints)
      for (let i = 0; i < nodes.length; i++)
        if (
          /Rigid_Control$|Ranger_Bow_Grip_Control$|Ranger_Nock_Control$|Ranger_Release_Emitter$|Ranger_Release_Nock$/.test(
            nodes[i].name
          )
        )
          driven.add(i)
      const samples = new Map([...driven].map((i) => [i, { translation: [], rotation: [], scale: [] }]))
      for (const seconds of times) {
        reset()
        const phase = seconds / duration
        legs(phase, motion)
        const chest = named('chest'),
          cue = { ranger: 0.75, paladin: 0.416, goblin: 0.396 }[role],
          wind = smooth(seconds / (cue * 0.72)),
          strike = smooth((seconds - cue * 0.72) / (cue * 0.28)),
          recover = smooth((seconds - cue) / (duration - cue)),
          effort = wind * (1 - strike)
        if (role === 'ranger') {
          // A compact bow stance suits these short arms. Both elbows stay in front
          // of the coat; the previous draw crossed the bow arm through the chest.
          const amount = motion === 'attack' ? smooth(seconds / 0.32) * (1 - smooth((seconds - 0.84) / 0.36)) : 0
          chest.quaternion.premultiply(
            new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.025 * amount, 0.06 * amount, 0))
          )
          scene.updateMatrixWorld(true)
          const bow = named('Ranger_Bow_Grip_Control')
          const bowQ = saved[nodes.indexOf(bow)].q.clone().slerp(new THREE.Quaternion(), amount)
          const bowP = new THREE.Vector3(0.33, -0.447, 0.24).lerp(new THREE.Vector3(0.17, -0.335, 0.24), amount)
          const draw = 0.065 + 0.03 * smooth(seconds / 0.68) * (1 - smooth((seconds - 0.75) / 0.08))
          const left = restPosition('hand.L').lerp(new THREE.Vector3(0.17, -0.235, 0.17), amount)
          const right = restPosition('hand.R').lerp(new THREE.Vector3(0.104, -0.203, 0.184 - draw), amount)
          arm('L', left, world(named('upper.L')).add(new THREE.Vector3(0.35, -0.15, 0.3)), restRotation('hand.L'))
          arm('R', right, world(named('upper.R')).add(new THREE.Vector3(-0.25, -0.12, 0.3)), restRotation('hand.R'))
          bow.position.copy(bowP)
          bow.quaternion.copy(bowQ)
          scene.updateMatrixWorld(true)
          if (motion === 'attack') {
            const nock = named('Ranger_Nock_Control')
            nock.position.set(0, 0.075, -draw)
            const p = bow.localToWorld(new THREE.Vector3(0, 0.075, 0.7 - draw))
            for (const n of nodes)
              if (/^Ranger_Release_(Emitter|Nock)$/.test(n.name))
                n.position.copy(
                  n.parent.worldToLocal(p.clone().add(new THREE.Vector3(0, 0, n.name.endsWith('Nock') ? -0.7 : 0)))
                )
          }
        } else {
          const swing = motion === 'walk' ? Math.sin(phase * Math.PI * 2) : 0
          const left = restPosition('hand.L'),
            right = restPosition('hand.R')
          if (role === 'paladin') {
            // Shield stays braced. Sword travels from a high outside guard to a
            // forward diagonal cut, contacting at the existing 416 ms event.
            left.add(
              new THREE.Vector3(
                0.055 * effort - 0.04 * strike * (1 - recover),
                0.1 * effort - 0.015 * strike * (1 - recover),
                -0.045 * effort + 0.015 * strike * (1 - recover) + 0.025 * swing
              )
            )
            right.add(new THREE.Vector3(0.01, 0.015, 0.015))
            chest.quaternion.premultiply(
              new THREE.Quaternion().setFromEuler(
                new THREE.Euler(
                  -0.045 * effort + 0.065 * strike * (1 - recover),
                  -0.1 * effort + 0.12 * strike * (1 - recover),
                  0
                )
              )
            )
          } else {
            // Keep hands outside the vest and use a compact dagger cut. Remove the
            // source's animated hip/chest shortening and deep backwards knee fold.
            left.add(
              new THREE.Vector3(
                -0.015,
                0.1 * effort - 0.015 * strike * (1 - recover),
                -0.025 * effort + 0.055 * strike * (1 - recover) + 0.035 * swing
              )
            )
            right.add(new THREE.Vector3(0.015, 0.015, -0.02 * swing))
            chest.quaternion.premultiply(
              new THREE.Quaternion().setFromEuler(
                new THREE.Euler(
                  -0.025 * effort + 0.06 * strike * (1 - recover),
                  -0.06 * effort + 0.08 * strike * (1 - recover),
                  0
                )
              )
            )
          }
          scene.updateMatrixWorld(true)
          let leftQ = restRotation('hand.L'),
            rightQ = restRotation('hand.R')
          if (motion === 'attack')
            leftQ.premultiply(
              new THREE.Quaternion().setFromEuler(
                new THREE.Euler(
                  -1.0 * effort + 1.25 * strike * (1 - recover),
                  0,
                  -0.6 * effort + 0.65 * strike * (1 - recover)
                )
              )
            )
          arm('L', left, world(named('upper.L')).add(new THREE.Vector3(0.4, -0.04, 0.25)), leftQ)
          arm('R', right, world(named('upper.R')).add(new THREE.Vector3(-0.4, -0.1, 0.2)), rightQ)
          moveTool(role === 'paladin' ? 'Paladin_Sword_Rigid_Control' : 'Goblin_Sword_Rigid_Control', 'L')
          moveTool(role === 'paladin' ? 'Paladin_Shield_Rigid_Control' : 'Goblin_FreeHand_Rigid_Control', 'R')
        }
        for (const [i, s] of samples) {
          s.translation.push(...nodes[i].position.toArray())
          s.rotation.push(...nodes[i].quaternion.toArray())
          s.scale.push(...nodes[i].scale.toArray())
        }
      }
      if (role === 'ranger' && motion === 'attack') {
        const bowNodes = new Set(
          j.nodes
            .map((n, i) => (/Ranger_(Integrated_String|Limb_Inlay|Lower_Limb|Upper_Limb)/.test(n.name) ? i : -1))
            .filter((i) => i >= 0)
        )
        animation.channels = animation.channels.filter(
          (c) => !(bowNodes.has(c.target.node) && c.target.path === 'weights')
        )
        for (const i of bowNodes) {
          const m = j.meshes[j.nodes[i].mesh]
          if (m.weights) m.weights.fill(0)
        }
        const stringNode = j.nodes.findIndex((n) => n.name === 'Ranger_Integrated_String'),
          mesh = j.meshes[j.nodes[stringNode].mesh],
          primitive = mesh.primitives[0],
          position = accessorArray(g, primitive.attributes.POSITION),
          delta = Array(position.length).fill(0)
        for (let v = 0; v < position.length / 3; v++)
          if (Math.abs(position[v * 3 + 1] - 0.075) < 0.01) delta[v * 3 + 2] = -0.03
        primitive.targets = [{ POSITION: append(delta, 'VEC3') }]
        mesh.weights = [0]
        mesh.extras = { targetNames: ['Compact coordinated draw'] }
        const input = append(times, 'SCALAR'),
          values = times.map((t) => smooth(t / 0.68) * (1 - smooth((t - 0.75) / 0.08))),
          output = append(values, 'SCALAR'),
          sampler = animation.samplers.length
        animation.samplers.push({ input, output, interpolation: 'LINEAR' })
        animation.channels.push({ sampler, target: { node: stringNode, path: 'weights' } })
      }
      animation.channels = animation.channels.filter((c) => !driven.has(c.target.node))
      const input = append(times, 'SCALAR')
      j.accessors[input].min = [0]
      j.accessors[input].max = [duration]
      for (const [i, s] of samples)
        for (const key of ['translation', 'rotation', 'scale']) {
          const output = append(s[key], key === 'rotation' ? 'VEC4' : 'VEC3'),
            sampler = animation.samplers.length
          animation.samplers.push({ input, output, interpolation: 'LINEAR' })
          animation.channels.push({ sampler, target: { node: i, path: key } })
        }
      for (const sampler of animation.samplers) {
        const a = j.accessors[sampler.input]
        if (!a.min || !a.max) {
          a.min = [0]
          a.max = [duration]
        }
      }
      animation.extras = {
        ...animation.extras,
        motionRepair: {
          revision: 1,
          role,
          fps: 120,
          rootMotion: 'simulation-owned; feet authored in-place',
          maxUnreachableTarget: Math.max(...errors)
        }
      }
    }
    if (Math.max(...errors) > 1e-5) throw Error(`${role}: unreachable authored limb target`)
    const bin = Buffer.concat(chunks)
    j.buffers[0].byteLength = bin.length
    const json = Buffer.from(JSON.stringify(j)),
      jp = Buffer.alloc((json.length + 3) & ~3, 0x20)
    json.copy(jp)
    const bp = Buffer.alloc((bin.length + 3) & ~3)
    bin.copy(bp)
    const header = Buffer.alloc(20)
    header.writeUInt32LE(0x46546c67)
    header.writeUInt32LE(2, 4)
    header.writeUInt32LE(28 + jp.length + bp.length, 8)
    header.writeUInt32LE(jp.length, 12)
    header.writeUInt32LE(0x4e4f534a, 16)
    const bh = Buffer.alloc(8)
    bh.writeUInt32LE(bp.length)
    bh.writeUInt32LE(0x004e4942, 4)
    const result = Buffer.concat([header, jp, bh, bp])
    fs.writeFileSync(path.join(output, role, file), result)
    records.push({
      role,
      file,
      inputSha256: hash(bytes),
      outputSha256: hash(result),
      inputBytes: bytes.length,
      outputBytes: result.length,
      maxUnreachableTarget: Math.max(...errors),
      reachLimits
    })
  }
fs.mkdirSync('local-assets/qa/ranger-paladin', { recursive: true })
fs.writeFileSync('local-assets/qa/ranger-paladin/generation.json', JSON.stringify(records, null, 2))
const manifestPath = path.join(output, 'runtime-manifest.json'),
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
for (const r of records) {
  const m = manifest.models.find((m) => m.file === `${r.role}/${r.file}`)
  if (!m) throw Error(`Missing manifest ${r.file}`)
  m.outputSha256 = r.outputSha256
  m.bytes = r.outputBytes
  m.motionRepair = {
    revision: 1,
    inputSha256: r.inputSha256,
    script: 'scripts/repair-roster-motion.mjs',
    preserved: 'rest geometry, weights, bind matrices, hierarchy, materials, idle and combat clocks'
  }
}
manifest.summary.bytes = manifest.models.reduce((sum, m) => sum + m.bytes, 0)
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
fs.writeFileSync(
  'examples/games/tower_diffence_with_jev/src/rendering/models/motion-repair-provenance.json',
  JSON.stringify(
    { revision: 1, sourceCommit: 'ceaca18', generator: 'scripts/repair-roster-motion.mjs', fps: 120, records },
    null,
    2
  ) + '\n'
)
console.log(records)

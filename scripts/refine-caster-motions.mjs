/** Narrow GLB derivative: preserves source mesh/material/morph/bind bytes.
 * Rebuilds authored spell gesture and constant-length IK; never changes clocks.
 * Run from repository root: node scripts/refine-caster-motions.mjs
 */
import fs from 'node:fs'
import crypto from 'node:crypto'
import { Object3D, Vector3, Quaternion, Euler } from 'three'
const base = 'public/tower-defense-art/models',
  records = []
const V = (a) => new Vector3(...a),
  Q = (a) => new Quaternion(...(a ?? [0, 0, 0, 1]))
const smooth = (x) => {
  x = Math.max(0, Math.min(1, x))
  return x * x * (3 - 2 * x)
}
const hash = (b) => crypto.createHash('sha256').update(b).digest('hex')
for (const role of ['mage', 'frost', 'healer']) {
  const input = `${base}/${role}/${role}-motion-v2-candidate.glb`,
    original = fs.readFileSync(input),
    n = original.readUInt32LE(12),
    j = JSON.parse(original.subarray(20, 20 + n)),
    bin = Buffer.from(original.subarray(28 + n))
  const objects = j.nodes.map((node) => {
    const o = new Object3D()
    o.name = node.name
    o.position.fromArray(node.translation ?? [0, 0, 0])
    o.quaternion.fromArray(node.rotation ?? [0, 0, 0, 1])
    o.scale.fromArray(node.scale ?? [1, 1, 1])
    return o
  })
  j.nodes.forEach((node, i) => node.children?.forEach((k) => objects[i].add(objects[k])))
  const scene = new Object3D()
  objects.filter((o) => !o.parent).forEach((o) => scene.add(o))
  scene.updateMatrixWorld(true)
  const nodes = new Map(objects.map((o) => [o.name, o])),
    rest = new Map(
      objects.map((o) => [
        o.name,
        {
          p: o.position.clone(),
          q: o.quaternion.clone(),
          s: o.scale.clone(),
          wp: o.getWorldPosition(new Vector3()),
          wq: o.getWorldQuaternion(new Quaternion())
        }
      ])
    )
  function access(i) {
    const a = j.accessors[i],
      v = j.bufferViews[a.bufferView],
      width = { SCALAR: 1, VEC3: 3, VEC4: 4 }[a.type],
      off = (v.byteOffset ?? 0) + (a.byteOffset ?? 0),
      stride = v.byteStride ?? width * 4
    return {
      count: a.count,
      width,
      read: (k) => Array.from({ length: width }, (_, c) => bin.readFloatLE(off + k * stride + c * 4)),
      write: (k, vals) => vals.forEach((x, c) => bin.writeFloatLE(x, off + k * stride + c * 4))
    }
  }
  function reset() {
    for (const [name, o] of nodes) {
      const r = rest.get(name)
      o.position.copy(r.p)
      o.quaternion.copy(r.q)
      o.scale.copy(r.s)
    }
    scene.updateMatrixWorld(true)
  }
  function ik(first, second, tip, target, orientation) {
    const a = nodes.get(first),
      b = nodes.get(second),
      c = nodes.get(tip),
      ra = rest.get(first),
      rb = rest.get(second),
      rc = rest.get(tip)
    scene.updateMatrixWorld(true)
    const start = a.getWorldPosition(new Vector3()),
      l1 = rb.p.length(),
      l2 = rc.p.length(),
      dir = target.clone().sub(start),
      dist = Math.min(dir.length(), l1 + l2 - 0.0001)
    dir.normalize()
    target.copy(start).addScaledVector(dir, dist)
    const pole = rb.wp.clone().sub(ra.wp)
    pole.addScaledVector(dir, -pole.dot(dir))
    if (pole.length() < 0.00001) pole.set(0, 0, 1)
    pole.normalize()
    const along = (l1 * l1 + dist * dist - l2 * l2) / (2 * dist),
      knee = start
        .clone()
        .addScaledVector(dir, along)
        .addScaledVector(pole, Math.sqrt(Math.max(0, l1 * l1 - along * along)))
    const aq = new Quaternion()
      .setFromUnitVectors(rb.wp.clone().sub(ra.wp).normalize(), knee.clone().sub(start).normalize())
      .multiply(ra.wq)
    a.quaternion.copy(a.parent.getWorldQuaternion(new Quaternion()).invert().multiply(aq))
    scene.updateMatrixWorld(true)
    const bq = new Quaternion()
      .setFromUnitVectors(rc.wp.clone().sub(rb.wp).normalize(), target.clone().sub(knee).normalize())
      .multiply(rb.wq)
    b.quaternion.copy(aq.clone().invert().multiply(bq))
    c.quaternion.copy(bq.clone().invert().multiply(orientation))
    scene.updateMatrixWorld(true)
  }
  let weightsChanged = 0
  if (role === 'healer') {
    // Garment envelope above the exposed knees: transfer leg influence to pelvis.
    // Below that envelope retain real leg/boot skinning, including its smooth joins.
    for (const p of j.meshes[0].primitives) {
      const pos = access(p.attributes.POSITION),
        ja = j.accessors[p.attributes.JOINTS_0],
        jv = j.bufferViews[ja.bufferView],
        jo = (jv.byteOffset ?? 0) + (ja.byteOffset ?? 0),
        jw = ja.componentType === 5121 ? 1 : 2,
        js = jv.byteStride ?? jw * 4,
        w = access(p.attributes.WEIGHTS_0)
      for (let i = 0; i < pos.count; i++) {
        const [x, y, z] = pos.read(i)
        if (y < -0.7 || y > -0.39) continue
        const vals = w.read(i)
        for (let k = 0; k < 4; k++) {
          const off = jo + i * js + k * jw,
            joint = jw === 1 ? bin.readUInt8(off) : bin.readUInt16LE(off)
          if (joint < 10 || vals[k] <= 0) continue
          if (jw === 1) bin.writeUInt8(1, off)
          else bin.writeUInt16LE(1, off)
          weightsChanged++
        }
      }
    }
  }
  for (const clip of j.animations) {
    const motion = clip.name,
      isSpell = (role === 'mage' && motion === 'attack') || (role === 'healer' && motion === 'heal'),
      isWalk = motion === 'walk' && role !== 'mage',
      isFrostAttack = role === 'frost' && motion === 'attack'
    if (!isSpell && !isWalk && !isFrostAttack) continue
    const tracks = new Map(
        clip.channels.map((c) => {
          const s = clip.samplers[c.sampler]
          return [`${j.nodes[c.target.node].name}:${c.target.path}`, { c, s, t: access(s.input), v: access(s.output) }]
        })
      ),
      clock = tracks.get('pelvis:translation'),
      duration = clock.t.read(clock.t.count - 1)[0]
    const write = (name, path, i, values) => {
      const tr = tracks.get(`${name}:${path}`)
      if (tr && tr.v.count === clock.t.count) tr.v.write(i, values)
    }
    for (let i = 0; i < clock.t.count; i++) {
      const t = clock.t.read(i)[0]
      reset()
      // Retain all accepted upper-body walk and Frost spell channels.
      if (!isSpell)
        for (const [key, tr] of tracks) {
          const [name, path] = key.split(':')
          const o = nodes.get(name)
          if (!o || path === 'weights') continue
          const value = tr.v.read(Math.min(i, tr.v.count - 1))
          if (path === 'translation') o.position.fromArray(value)
          if (path === 'rotation') o.quaternion.fromArray(value)
          if (path === 'scale') o.scale.fromArray(value)
        }
      const pelvis = nodes.get('pelvis'),
        staff = nodes.get('Staff_Rigid_Control'),
        rpelvis = rest.get('pelvis')
      let effort = 0
      if (isSpell) {
        // Slow gathering, deliberate aim, decisive cue, held offering, soft return.
        const cue = role === 'mage' ? 0.52 : 0.6,
          wind = smooth(t / (cue - 0.17)),
          fire = smooth((t - (cue - 0.14)) / 0.14),
          recover = smooth((t - (role === 'mage' ? 0.65 : 0.76)) / (role === 'mage' ? 0.31 : 0.2))
        effort = 1 - recover
        const chest = nodes.get('chest'),
          head = nodes.get('head')
        pelvis.position.y -= 0.035 * wind * (1 - recover)
        pelvis.position.z += (-0.04 * wind + 0.1 * fire) * (1 - recover)
        chest.quaternion.setFromEuler(
          new Euler(
            (role === 'mage' ? -0.28 : 0.22) * wind * (1 - fire) * (1 - recover) +
              (role === 'mage' ? 0.35 : -0.1) * fire * (1 - recover),
            (role === 'mage' ? -0.16 : 0.08) * wind * (1 - recover),
            0
          )
        )
        head.quaternion.setFromEuler(new Euler(0.15 * wind * (1 - recover), 0, 0))
        const grip = rest.get('hand.L').wp.clone(),
          offset = new Vector3(
            0,
            (role === 'mage' ? 0.035 : 0.16) * wind * (1 - recover),
            (role === 'mage' ? -0.07 : 0.025) * wind * (1 - fire) * (1 - recover) +
              (role === 'mage' ? 0.13 : 0.06) * fire * (1 - recover)
          )
        const target = grip.clone().add(offset),
          sq = new Quaternion().setFromEuler(
            new Euler(
              (role === 'mage' ? -0.2 : -0.38) * wind * (1 - fire) * (1 - recover) +
                (role === 'mage' ? 0.98 : -0.55) * fire * (1 - recover),
              (role === 'mage' ? -0.2 : 0.1) * fire * (1 - recover),
              (role === 'healer' ? 0.32 * wind * (1 - fire) - 0.72 * fire : 0) * (1 - recover)
            )
          )
        scene.updateMatrixWorld(true)
        ik('upper.L', 'fore.L', 'hand.L', target, sq.clone().multiply(rest.get('hand.L').wq))
        staff.quaternion.copy(sq)
        staff.position.copy(target).sub(grip.clone().applyQuaternion(sq))
        const arm = nodes.get('upper.R'),
          fore = nodes.get('fore.R')
        arm.quaternion.premultiply(
          new Quaternion().setFromEuler(
            new Euler(
              (role === 'mage' ? -0.25 : -0.5) * wind * (1 - recover),
              0,
              (role === 'mage' ? -0.18 * fire : -0.6 * wind * (1 - fire) - 1.0 * fire) * (1 - recover)
            )
          )
        )
        fore.quaternion.multiply(
          new Quaternion().setFromEuler(
            new Euler(
              -0.35 * wind * (1 - fire) * (1 - recover),
              0,
              (role === 'healer' ? 0.8 * wind * (1 - fire) + 0.25 * fire : 0.25 * fire) * (1 - recover)
            )
          )
        )
      }
      // Keep ankle targets fixed for spells; modest alternating steps for walking.
      if (isWalk) {
        pelvis.position.copy(rpelvis.p)
        pelvis.position.y += 0.003 * (1 - Math.cos((t / duration) * Math.PI * 4))
        pelvis.quaternion.identity()
      }
      if (isFrostAttack) {
        pelvis.position.copy(rpelvis.p)
        pelvis.position.y -= 0.008 * Math.sin((t / duration) * Math.PI) ** 2
        pelvis.quaternion.identity()
      }
      scene.updateMatrixWorld(true)
      for (const side of ['L', 'R']) {
        const foot = rest.get(`foot.${side}`),
          target = foot.wp.clone()
        if (isWalk) {
          const phase = (t / duration + (side === 'R' ? 0.5 : 0)) % 1,
            u = phase < 0.5 ? phase * 2 : (phase - 0.5) * 2
          target.z += phase < 0.5 ? 0.055 * (1 - 2 * u) : -0.055 * Math.cos(Math.PI * u)
          target.y += phase < 0.5 ? 0 : 0.025 * Math.sin(Math.PI * u) ** 2
        }
        ik(`thigh.${side}`, `shin.${side}`, `foot.${side}`, target, foot.wq)
      }
      if (isWalk) {
        const delta = pelvis.position.clone().sub(V(clock.v.read(i)))
        staff.position.add(delta)
      }
      const changed = isSpell
        ? [...nodes.keys()]
        : [
            'pelvis',
            'thigh.L',
            'shin.L',
            'foot.L',
            'thigh.R',
            'shin.R',
            'foot.R',
            ...(isWalk ? ['Staff_Rigid_Control'] : [])
          ]
      for (const name of changed) {
        const o = nodes.get(name)
        write(name, 'translation', i, o.position.toArray())
        write(name, 'rotation', i, o.quaternion.toArray())
        write(name, 'scale', i, o.scale.toArray())
      }
    }
    for (const [key, tr] of tracks)
      if (key.endsWith(':rotation'))
        for (let i = 1; i < tr.v.count; i++) {
          const p = tr.v.read(i - 1),
            q = tr.v.read(i)
          if (p.reduce((sum, v, k) => sum + v * q[k], 0) < 0)
            tr.v.write(
              i,
              q.map((v) => -v)
            )
        }
  }
  const output = Buffer.from(original)
  bin.copy(output, 28 + n)
  const filename = `${role}-${role === 'mage' ? 'spell-v3' : role === 'frost' ? 'stable-feet-v3' : 'heal-garment-v3'}.glb`,
    dir = `local-assets/caster-v3/${role}`
  fs.mkdirSync(dir, { recursive: true })
  if (!fs.existsSync(`${dir}/original.glb`)) fs.writeFileSync(`${dir}/original.glb`, original)
  fs.writeFileSync(`${base}/${role}/${filename}`, output)
  records.push({
    role,
    input,
    output: `${base}/${role}/${filename}`,
    sourceSHA256: hash(original),
    outputSHA256: hash(output),
    bytesBefore: original.length,
    bytesAfter: output.length,
    weightsChanged,
    clocks: 'mage 960/520ms; frost 768/416ms; healer 960/600ms; walk 1s',
    preserved:
      'Original files, geometry, textures, materials, morphs, inverse binds, rest nodes, clip names, durations and sample time bytes',
    method: 'constant-length two-bone IK; staff pivots at the actual left-hand grip'
  })
}
fs.writeFileSync('scripts/caster-v3-provenance.json', JSON.stringify(records, null, 2) + '\n')
console.log(records)

await import('./register-caster-motions.mjs')

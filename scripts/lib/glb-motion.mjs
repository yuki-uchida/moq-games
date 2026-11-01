import fs from 'node:fs'
import { Object3D, Quaternion, Vector3 } from 'three'
export function readMotion(file, motion) {
  const bytes = fs.readFileSync(file),
    length = bytes.readUInt32LE(12),
    doc = JSON.parse(bytes.subarray(20, 20 + length)),
    binary = Buffer.from(bytes.subarray(28 + length))
  const anim = doc.animations.find((a) => a.name === motion)
  function read(index) {
    const a = doc.accessors[index],
      v = doc.bufferViews[a.bufferView],
      width = { SCALAR: 1, VEC3: 3, VEC4: 4 }[a.type]
    return Array.from({ length: a.count }, (_, i) =>
      Array.from({ length: width }, (_, k) =>
        binary.readFloatLE((v.byteOffset ?? 0) + (a.byteOffset ?? 0) + i * (v.byteStride ?? width * 4) + k * 4)
      )
    )
  }
  const tracks = anim.channels.map((c) => {
    const s = anim.samplers[c.sampler]
    return {
      sampler: { ...s },
      node: c.target.node,
      path: c.target.path,
      times: read(s.input).flat(),
      values: read(s.output)
    }
  })
  const objects = doc.nodes.map((n) => {
    const o = new Object3D()
    o.name = n.name ?? ''
    o.position.fromArray(n.translation ?? [0, 0, 0])
    o.quaternion.fromArray(n.rotation ?? [0, 0, 0, 1])
    o.scale.fromArray(n.scale ?? [1, 1, 1])
    return o
  })
  doc.nodes.forEach((n, i) => n.children?.forEach((c) => objects[i].add(objects[c])))
  const roots = objects.filter((o) => !o.parent),
    nodes = new Map(objects.map((o) => [o.name, o]))
  const update = () => roots.forEach((o) => o.updateMatrixWorld(true))
  function sample(time) {
    for (const t of tracks) {
      if (t.path === 'weights') continue
      let i = 0
      while (i < t.times.length - 2 && t.times[i + 1] < time) i++
      const a = t.values[i],
        b = t.values[Math.min(i + 1, t.values.length - 1)],
        w = Math.max(0, Math.min(1, (time - t.times[i]) / (t.times[i + 1] - t.times[i] || 1)))
      const o = objects[t.node]
      if (t.path === 'rotation') o.quaternion.fromArray(a).slerp(new Quaternion().fromArray(b), w)
      else o[t.path === 'translation' ? 'position' : 'scale'].fromArray(a.map((v, k) => v + (b[k] - v) * w))
    }
    update()
  }
  function write(file, frames, duration) {
    let chunks = [binary],
      offset = binary.length
    const add = (values, width) => {
      const flat = values.flat(),
        b = Buffer.alloc(flat.length * 4)
      flat.forEach((v, i) => b.writeFloatLE(v, i * 4))
      const view = doc.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: b.length }) - 1
      chunks.push(b)
      offset += b.length
      const a = {
        bufferView: view,
        componentType: 5126,
        count: values.length,
        type: { 1: 'SCALAR', 3: 'VEC3', 4: 'VEC4' }[width]
      }
      if (width === 1) {
        a.min = [0]
        a.max = [duration]
      }
      return doc.accessors.push(a) - 1
    }
    const times = add(
      frames.map((_, i) => [(i * duration) / (frames.length - 1)]),
      1
    )
    anim.samplers = []
    anim.channels = []
    for (const t of tracks) {
      if (t.path === 'weights') {
        const sampler = anim.samplers.push(t.sampler) - 1
        anim.channels.push({ sampler, target: { node: t.node, path: t.path } })
        continue
      }
      let values = frames.map((f) => f[t.node][t.path])
      if (t.path === 'rotation')
        for (let i = 1; i < values.length; i++)
          if (values[i].reduce((s, v, k) => s + v * values[i - 1][k], 0) < 0) values[i] = values[i].map((v) => -v)
      const output = add(values, t.path === 'rotation' ? 4 : 3)
      const sampler = anim.samplers.push({ input: times, output, interpolation: 'LINEAR' }) - 1
      anim.channels.push({ sampler, target: { node: t.node, path: t.path } })
    }
    doc.buffers[0].byteLength = offset
    let json = Buffer.from(JSON.stringify(doc))
    json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 32)])
    let bin = Buffer.concat(chunks)
    bin = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)])
    const out = Buffer.alloc(28 + json.length + bin.length)
    out.writeUInt32LE(0x46546c67, 0)
    out.writeUInt32LE(2, 4)
    out.writeUInt32LE(out.length, 8)
    out.writeUInt32LE(json.length, 12)
    out.writeUInt32LE(0x4e4f534a, 16)
    json.copy(out, 20)
    out.writeUInt32LE(bin.length, 20 + json.length)
    out.writeUInt32LE(0x004e4942, 24 + json.length)
    bin.copy(out, 28 + json.length)
    fs.writeFileSync(file, out)
  }
  sample(0)
  return {
    doc,
    nodes,
    objects,
    tracks,
    sample,
    update,
    write,
    capture: () =>
      objects.map((o) => ({
        translation: o.position.toArray(),
        rotation: o.quaternion.toArray(),
        scale: o.scale.toArray()
      }))
  }
}
export function smooth(t) {
  return (t = Math.max(0, Math.min(1, t))) * t * (3 - 2 * t)
}
export function key(t, keys) {
  let i = 0
  while (i < keys.length - 2 && t > keys[i + 1][0]) i++
  const [a, v] = keys[i],
    [b, w] = keys[i + 1]
  return v + (w - v) * smooth((t - a) / (b - a))
}
export function rotateWorld(node, axis, angle) {
  const world = node.getWorldQuaternion(new Quaternion())
  world.premultiply(new Quaternion().setFromAxisAngle(axis, angle))
  const parent = node.parent?.getWorldQuaternion(new Quaternion()) ?? new Quaternion()
  node.quaternion.copy(parent.invert().multiply(world))
}
export function solveArm(rig, upperName, foreName, handName, target, pole, handWorld) {
  const upper = rig.nodes.get(upperName),
    fore = rig.nodes.get(foreName),
    hand = rig.nodes.get(handName)
  rig.update()
  const shoulder = upper.getWorldPosition(new Vector3()),
    delta = target.clone().sub(shoulder),
    distance = Math.min(delta.length(), fore.position.length() + hand.position.length() - 0.002),
    direction = delta.normalize(),
    l1 = fore.position.length(),
    l2 = hand.position.length()
  const along = (l1 * l1 - l2 * l2 + distance * distance) / (2 * distance),
    height = Math.sqrt(Math.max(0, l1 * l1 - along * along))
  const bend = pole.clone().sub(shoulder)
  bend.addScaledVector(direction, -bend.dot(direction)).normalize()
  const elbow = shoulder.clone().addScaledVector(direction, along).addScaledVector(bend, height)
  function aim(node, child, point) {
    rig.update()
    const origin = node.getWorldPosition(new Vector3()),
      before = child.getWorldPosition(new Vector3()).sub(origin).normalize(),
      after = point.clone().sub(origin).normalize(),
      world = node.getWorldQuaternion(new Quaternion()).premultiply(new Quaternion().setFromUnitVectors(before, after)),
      parent = node.parent?.getWorldQuaternion(new Quaternion()) ?? new Quaternion()
    node.quaternion.copy(parent.invert().multiply(world))
    rig.update()
  }
  aim(upper, fore, elbow)
  aim(fore, hand, target)
  hand.quaternion.copy(fore.getWorldQuaternion(new Quaternion()).invert().multiply(handWorld))
  rig.update()
}

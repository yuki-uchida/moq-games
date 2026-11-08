import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { Object3D, Quaternion, Vector3 } from 'three'
// @ts-expect-error audited repository GLB utility has no declaration file
import { readGlb, accessorArray } from '../scripts/optimize-tower-models.mjs'
const records = JSON.parse(fs.readFileSync('scripts/caster-v3-provenance.json', 'utf8'))
// Each role compares two whole GLBs: about 3 s on a shared 4-worker CI runner, past the 5 s default when busier.
describe('caster derivatives preserve source data and joint continuity', () => {
  for (const record of records)
    it(record.role, { timeout: 120_000 }, () => {
      const a = readGlb(fs.readFileSync(record.input)),
        b = readGlb(fs.readFileSync(record.output))
      expect(b.json).toEqual(a.json)
      for (const mesh of a.json.meshes)
        for (const p of mesh.primitives)
          for (const [name, index] of Object.entries(p.attributes)) {
            if (record.role === 'healer' && name === 'JOINTS_0') continue
            expect(accessorArray(b, index)).toEqual(accessorArray(a, index))
          }
      expect(accessorArray(b, a.json.skins[0].inverseBindMatrices)).toEqual(
        accessorArray(a, a.json.skins[0].inverseBindMatrices)
      )
      const objects = b.json.nodes.map((n: any) => {
        const o = new Object3D()
        o.name = n.name
        o.position.fromArray(n.translation ?? [0, 0, 0])
        o.quaternion.fromArray(n.rotation ?? [0, 0, 0, 1])
        o.scale.fromArray(n.scale ?? [1, 1, 1])
        return o
      })
      b.json.nodes.forEach((n: any, i: number) => n.children?.forEach((k: number) => objects[i].add(objects[k])))
      const scene = new Object3D()
      objects.filter((o: Object3D) => !o.parent).forEach((o: Object3D) => scene.add(o))
      scene.updateMatrixWorld(true)
      const feet = ['foot.L', 'foot.R'].map((name) => objects.find((o: Object3D) => o.name === name))
      const rest = feet.map((o: Object3D) => ({
        p: o.getWorldPosition(new Vector3()),
        q: o.getWorldQuaternion(new Quaternion())
      }))
      for (const clip of b.json.animations) {
        if (clip.name === 'idle' || (record.role === 'mage' && clip.name === 'walk')) continue
        const channels = clip.channels
          .filter((c: any) => c.target.path !== 'weights')
          .map((c: any) => {
            const s = clip.samplers[c.sampler],
              data = accessorArray(b, s.output),
              times = accessorArray(b, s.input)
            return { o: objects[c.target.node], path: c.target.path, data, times, width: data.length / times.length }
          })
        const clock = channels.find((c: any) => c.o.name === 'pelvis' && c.path === 'translation')
        for (let i = 0; i < clock.times.length; i += 7) {
          for (const c of channels) {
            const k = c.times.length === 2 ? (i === clock.times.length - 1 ? 1 : 0) : i
            const vals = c.data.slice(k * c.width, (k + 1) * c.width)
            if (c.path === 'translation') c.o.position.fromArray(vals)
            if (c.path === 'rotation') c.o.quaternion.fromArray(vals)
            if (c.path === 'scale') c.o.scale.fromArray(vals)
          }
          scene.updateMatrixWorld(true)
          feet.forEach((o: Object3D, k: number) => {
            const p = o.getWorldPosition(new Vector3())
            expect(Math.abs(p.x - rest[k].p.x)).toBeLessThan(0.003)
            if (clip.name !== 'walk') expect(p.distanceTo(rest[k].p)).toBeLessThan(0.003)
            expect(o.getWorldQuaternion(new Quaternion()).angleTo(rest[k].q)).toBeLessThan(0.003)
          })
        }
      }
    })
})

it('Frost preserves the authored hand-to-staff grip after pelvis stabilization', () => {
  const record = records.find((r: any) => r.role === 'frost')
  const original = readGlb(fs.readFileSync(record.input)),
    candidate = readGlb(fs.readFileSync(record.output))
  function pose(g: any, motion: string, index: number) {
    const objects = g.json.nodes.map((n: any) => {
      const o = new Object3D()
      o.name = n.name
      o.position.fromArray(n.translation ?? [0, 0, 0])
      o.quaternion.fromArray(n.rotation ?? [0, 0, 0, 1])
      o.scale.fromArray(n.scale ?? [1, 1, 1])
      return o
    })
    g.json.nodes.forEach((n: any, i: number) => n.children?.forEach((k: number) => objects[i].add(objects[k])))
    const root = new Object3D()
    objects.filter((o: any) => !o.parent).forEach((o: any) => root.add(o))
    const clip = g.json.animations.find((c: any) => c.name === motion)
    for (const c of clip.channels) {
      if (c.target.path === 'weights') continue
      const s = clip.samplers[c.sampler],
        t = accessorArray(g, s.input),
        v = accessorArray(g, s.output),
        width = v.length / t.length,
        k = t.length === 2 ? 0 : index,
        values = v.slice(k * width, (k + 1) * width),
        o = objects[c.target.node]
      if (c.target.path === 'translation') o.position.fromArray(values)
      if (c.target.path === 'rotation') o.quaternion.fromArray(values)
      if (c.target.path === 'scale') o.scale.fromArray(values)
    }
    root.updateMatrixWorld(true)
    const hand = objects.find((o: any) => o.name === 'hand.L'),
      staff = objects.find((o: any) => o.name === 'Staff_Rigid_Control')
    return {
      position: staff.worldToLocal(hand.getWorldPosition(new Vector3())),
      rotation: staff
        .getWorldQuaternion(new Quaternion())
        .invert()
        .multiply(hand.getWorldQuaternion(new Quaternion()))
        .normalize()
    }
  }
  const measured: Record<string, { position: number; angle: number }> = {}
  for (const motion of ['walk', 'attack']) {
    const clip = original.json.animations.find((c: any) => c.name === motion)
    const count = original.json.accessors[clip.samplers[0].input].count
    const samples = new Set([...Array.from({ length: Math.ceil(count / 7) }, (_, i) => i * 7), count - 1])
    measured[motion] = { position: 0, angle: 0 }
    for (const i of samples) {
      const before = pose(original, motion, i),
        after = pose(candidate, motion, i)
      const distance = after.position.distanceTo(before.position),
        angle = after.rotation.angleTo(before.rotation)
      measured[motion].position = Math.max(measured[motion].position, distance)
      measured[motion].angle = Math.max(measured[motion].angle, angle)
      expect(distance, `${motion} grip position sample ${i}`).toBeLessThan(0.0005)
      expect(angle, `${motion} grip rotation sample ${i}`).toBeLessThan(0.0005)
    }
  }
  console.log('Frost grip maximum source-relative errors:', measured)
})

it('Mage attack knees stay on their rest bend side without key flips', () => {
  const g = readGlb(fs.readFileSync(records.find((r: any) => r.role === 'mage').output))
  const objects = g.json.nodes.map((n: any) => {
    const o = new Object3D()
    o.name = n.name
    o.position.fromArray(n.translation ?? [0, 0, 0])
    o.quaternion.fromArray(n.rotation ?? [0, 0, 0, 1])
    o.scale.fromArray(n.scale ?? [1, 1, 1])
    return o
  })
  g.json.nodes.forEach((n: any, i: number) => n.children?.forEach((k: number) => objects[i].add(objects[k])))
  const root = new Object3D()
  objects.filter((o: any) => !o.parent).forEach((o: any) => root.add(o))
  root.updateMatrixWorld(true)
  const W = (name: string) => objects.find((o: any) => o.name === name).getWorldPosition(new Vector3())
  const bend = (s: string) => {
    const hip = W(`thigh.${s}`),
      knee = W(`shin.${s}`).sub(hip),
      dir = W(`foot.${s}`).sub(hip).normalize()
    return knee.addScaledVector(dir, -knee.dot(dir))
  }
  const rest = { L: bend('L'), R: bend('R') }
  const clip = g.json.animations.find((c: any) => c.name === 'attack')
  const channels = clip.channels
    .filter((c: any) => c.target.path !== 'weights')
    .map((c: any) => {
      const s = clip.samplers[c.sampler],
        data = accessorArray(g, s.output),
        count = accessorArray(g, s.input).length
      return { o: objects[c.target.node], path: c.target.path, data, count, width: data.length / count }
    })
  const legs = channels.filter((c: any) => c.path === 'rotation' && /^(thigh|shin|foot)\.[LR]$/.test(c.o.name))
  for (const c of legs)
    for (let k = 1; k < c.count; k++) {
      const p = new Quaternion().fromArray(c.data, (k - 1) * 4),
        q = new Quaternion().fromArray(c.data, k * 4)
      expect((p.angleTo(q) * 180) / Math.PI, `${c.o.name} key ${k}`).toBeLessThan(10)
    }
  const count = Math.max(...channels.map((c: any) => c.count))
  for (let i = 0; i < count; i++) {
    for (const c of channels) {
      const k = Math.min(i, c.count - 1),
        vals = c.data.slice(k * c.width, (k + 1) * c.width)
      if (c.path === 'translation') c.o.position.fromArray(vals)
      if (c.path === 'rotation') c.o.quaternion.fromArray(vals)
      if (c.path === 'scale') c.o.scale.fromArray(vals)
    }
    root.updateMatrixWorld(true)
    for (const s of ['L', 'R'] as const) expect(bend(s).dot(rest[s]), `knee.${s} key ${i}`).toBeGreaterThan(0)
  }
})

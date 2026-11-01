import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { Object3D, Quaternion, Vector3 } from 'three'
// @ts-expect-error audited repository GLB utility has no declaration file
import { readGlb, accessorArray } from '../scripts/optimize-tower-models.mjs'
const records = JSON.parse(fs.readFileSync('scripts/caster-v3-provenance.json', 'utf8'))
describe('caster derivatives preserve source data and joint continuity', () => {
  for (const record of records)
    it(record.role, () => {
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

import { it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { readGlb, accessorArray, meshStats } from '../../../../scripts/optimize-tower-models.mjs'
import audit from '../../../../docs/animation-repair-audit.json'
const hash = (x: unknown) =>
  createHash('sha256')
    .update(Buffer.isBuffer(x) ? x : JSON.stringify(x))
    .digest('hex')
for (const [role, record] of Object.entries(audit.units)) {
  it(`${role}: retains original bind, geometry attributes, material and unaffected action contracts`, () => {
    const bytes = readFileSync(`public/tower-defense-art/models/${role}/${record.file}`),
      glb = readGlb(bytes),
      j = glb.json
    expect(hash(bytes)).toBe(record.outputSha256)
    expect(hash(j.nodes)).toBe(record.nodeHash)
    expect(hash(j.skins)).toBe(record.skinHash)
    expect(hash(j.materials)).toBe(record.materialHash)
    for (const [key, expected] of Object.entries(record.attributeHashes)) {
      const [mesh, primitive, name] = key.split('/')
      expect(
        hash(
          Buffer.from(accessorArray(glb, j.meshes[Number(mesh)].primitives[Number(primitive)].attributes[name]).buffer)
        ),
        key
      ).toBe(expected)
    }
    for (const [name, expected] of Object.entries(record.clipHashes)) {
      const a = j.animations.find((a: { name: string }) => a.name === name)
      expect(hash(a), name).toBe(expected.metadata)
      expect(
        hash(
          a.samplers.map((s: { input: number; output: number }) => [
            hash(Buffer.from(accessorArray(glb, s.input).buffer)),
            hash(Buffer.from(accessorArray(glb, s.output).buffer))
          ])
        )
      ).toBe(expected.samples)
    }
    expect(meshStats(j)).toEqual(record.stats)
    if (role === 'ogre') expect(record.baselineStats.triangles - record.stats.triangles).toBe(2637)
  })
}

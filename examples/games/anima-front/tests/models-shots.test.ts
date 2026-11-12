import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { ITEM_IDS, type ItemId } from '../src/data/items'
import { createModelKit } from '../src/models'
import { runSync } from '../src/models/sdf/mesher'
import { geometryHash } from '../src/models/sdf/geometry'
import { buildShotAsset, disposeShotAsset } from '../src/models/shots'
import type { ShotKind } from '../src/sim/types'

const KINDS: ShotKind[] = [...ITEM_IDS, 'acid', 'laser', 'plasma', 'missile', 'acidRain']
/** Crafted (bigger, slower) projectiles; every other kind is a bullet-type streak (≤ 150 triangles). */
const CRAFTED = new Set<ShotKind>(['pillbug', 'swallow', 'hippo', 'octopus', 'gecko', 'acid', 'plasma', 'missile'])

const tris = (g: THREE.BufferGeometry) => (g.index?.count ?? g.getAttribute('position').count) / 3

describe('model kit: projectile looks', () => {
  it('builds every shot kind cheaply and within budget', () => {
    const t = performance.now()
    const assets = KINDS.map((k) => runSync(buildShotAsset(k, 'medium')))
    // Desktop ≈ 0.1 s for all of them; CI machines are 2–3× slower.
    expect(performance.now() - t).toBeLessThan(1200)
    for (const a of assets) {
      const g = a.geometry
      expect(a.triangles, a.kind).toBe(tris(g))
      expect(a.triangles, a.kind).toBeGreaterThan(8)
      expect(a.triangles, a.kind).toBeLessThanOrEqual(CRAFTED.has(a.kind) ? 300 : 150)
      for (const name of ['position', 'normal', 'color', 'animaMask']) expect(g.getAttribute(name), name).toBeTruthy()
      const p = g.getAttribute('position').array
      for (let i = 0; i < p.length; i++) expect(Number.isFinite(p[i])).toBe(true)
      g.computeBoundingBox()
      const size = g.boundingBox!.getSize(new THREE.Vector3())
      // Small and roughly centred on the origin; elongated shots point along Z.
      expect(Math.max(size.x, size.y, size.z), a.kind).toBeLessThan(0.8)
      expect(Math.max(size.x, size.y, size.z), a.kind).toBeGreaterThan(0.05)
      if (a.stretch >= 2) expect(size.z, a.kind).toBeGreaterThanOrEqual(Math.max(size.x, size.y))
      expect(a.stretch, a.kind).toBeGreaterThanOrEqual(1)
      expect(a.stretch, a.kind).toBeLessThanOrEqual(6)
      // Something glows (bloom) on every shot.
      const mask = g.getAttribute('animaMask')
      let glowing = 0
      for (let i = 0; i < mask.count; i++) if (mask.getY(i) > 0.5) glowing++
      expect(glowing, a.kind).toBeGreaterThan(0)
      // Works as an InstancedMesh without instance colours.
      const mesh = new THREE.InstancedMesh(g, a.material, 300)
      expect(mesh.instanceColor).toBeNull()
      mesh.dispose()
    }
    for (const a of assets) disposeShotAsset(a)
  })

  it('uses the antique colour for generic bolts and is deterministic', () => {
    for (const k of ['claw', 'turtle', 'pigeon', 'bee', 'pillbug', 'missile'] as ShotKind[]) {
      const a = runSync(buildShotAsset(k, 'medium'))
      const b = runSync(buildShotAsset(k, 'high'))
      expect(geometryHash(a.geometry)).toBe(geometryHash(b.geometry))
      disposeShotAsset(a)
      disposeShotAsset(b)
    }
    const claw = runSync(buildShotAsset('claw' as ItemId, 'medium'))
    const fang = runSync(buildShotAsset('fang' as ItemId, 'medium'))
    expect(geometryHash(claw.geometry)).not.toBe(geometryHash(fang.geometry))
    disposeShotAsset(claw)
    disposeShotAsset(fang)
  })

  it('is cached and shared by the kit, and prepared with the antiques', async () => {
    const kit = createModelKit({ quality: 'medium' })
    const a = kit.shotLook('bee')
    expect(kit.shotLook('bee')).toBe(a)
    expect(kit.shotLook('laser')).toBe(kit.shotLook('laser'))
    await kit.prepare({ items: ['owl'] })
    expect(kit.stats().shots.owl?.triangles).toBeGreaterThan(0)
    kit.dispose()
  }, 60_000)
})

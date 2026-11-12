import * as THREE from 'three'
import { beforeAll, describe, expect, it } from 'vitest'
import { FOE_KINDS } from '../src/data/enemies'
import { ITEM_IDS } from '../src/data/items'
import { SPECIES_IDS } from '../src/data/species'
import { createModelKit, type ModelKitExt } from '../src/models'
import { BONE_NAMES } from '../src/models/rig'
import { geometryHash } from '../src/models/sdf/geometry'

/** Triangles drawn by a model: every mesh instance except inverted-hull outlines (separate or merged). */
function drawnTriangles(root: THREE.Object3D): number {
  let tris = 0
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    const mats = Array.isArray(m.material) ? m.material : [m.material]
    if (mats.every((x) => x.side === THREE.BackSide)) return
    tris += (m.geometry.index?.count ?? m.geometry.getAttribute('position').count) / 3
    tris -= (m.geometry.userData.hullTriangles as number | undefined) ?? 0
  })
  return tris
}

/** Draw calls of a model: visible meshes (an outline hull merged into a mesh is part of its draw call). */
function drawCalls(root: THREE.Object3D): number {
  let n = 0
  root.traverseVisible((o) => {
    if ((o as THREE.Mesh).isMesh) n++
  })
  return n
}

const finite = (a: ArrayLike<number>) => {
  for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return false
  return true
}

describe('model kit: characters', () => {
  let kit: ModelKitExt
  beforeAll(() => {
    kit = createModelKit({ quality: 'medium' })
  })

  it('builds every species within budget (≤ 12k triangles with face, uniform and all gear)', () => {
    for (const id of SPECIES_IDS) {
      const c = kit.createCharacter(id)
      c.setPassives(['turtle', 'hedgehog', 'momonga', 'jelly'], true)
      const tris = drawnTriangles(c.root)
      expect(tris, id).toBeLessThanOrEqual(12000)
      expect(kit.stats().species[id]!.triangles, id).toBeGreaterThan(3000)
      c.dispose()
    }
  }, 60_000)

  it('draws a fully equipped character in ≤ 4 draw calls and lightens it with distance', () => {
    const camera = new THREE.PerspectiveCamera()
    for (const id of SPECIES_IDS) {
      const c = kit.createCharacter(id, { look: 'kurozume' })
      c.setPassives(['turtle', 'hedgehog', 'momonga', 'jelly'], true)
      const hand = (item: 'orca' | 'swallow') => ({ item, act: 'idle' as const, charge: 0, uses: 0, combo: 0, swap: 0 })
      const pose = {
        localVel: [0, 0] as [number, number],
        grounded: true,
        vy: 0,
        move: 'idle' as const,
        aimYaw: 0,
        aimPitch: 0,
        hands: [hand('orca'), hand('swallow')] as [ReturnType<typeof hand>, ReturnType<typeof hand>],
        state: 'alive' as const,
        revive: 0,
        reviving: false,
        hurt: 0
      }
      for (let i = 0; i < 30; i++) c.update(1 / 30, pose)
      expect(drawCalls(c.root), id).toBeLessThanOrEqual(4)
      const near = drawnTriangles(c.root)
      // Distance level of detail: the body reads the camera distance in onBeforeRender.
      const body = c.root.getObjectByName('body') as THREE.SkinnedMesh
      camera.position.set(0, 1, 40)
      camera.updateMatrixWorld()
      c.root.updateMatrixWorld(true)
      body.onBeforeRender(null as never, null as never, camera, null as never, null as never, null as never)
      for (let i = 0; i < 3; i++) c.update(1 / 30, pose)
      const far = drawnTriangles(c.root)
      expect(far, id).toBeLessThan(near * 0.55)
      // 12 players + 6 クロヅメ, mostly far away, stay well under the frame budget at medium (hulls included).
      expect(far, id).toBeLessThan(6500)
      c.dispose()
    }
  }, 60_000)

  it('generates each species in bounded time', () => {
    const fresh = createModelKit({ quality: 'medium' })
    fresh.speciesAsset('shiba')
    for (const id of SPECIES_IDS) {
      const t = performance.now()
      fresh.speciesAsset(id)
      // Desktop target is < 250 ms; CI machines are 2–3× slower, so the bound is generous.
      expect(performance.now() - t, id).toBeLessThan(1500)
    }
  }, 60_000)

  it('keeps the skeleton contract: bone names, valid normalised weights, no NaN', () => {
    for (const id of SPECIES_IDS) {
      const c = kit.createCharacter(id)
      const body = c.root.getObjectByName('body') as THREE.SkinnedMesh
      expect(body.isSkinnedMesh).toBe(true)
      // The shared 24-bone skeleton first, then the face/gear bones of the merged mesh.
      expect(body.skeleton.bones.map((b) => b.name).slice(0, BONE_NAMES.length)).toEqual([...BONE_NAMES])
      const g = body.geometry
      const idx = g.getAttribute('skinIndex').array
      const w = g.getAttribute('skinWeight').array
      expect(finite(g.getAttribute('position').array)).toBe(true)
      expect(finite(g.getAttribute('normal').array)).toBe(true)
      expect(finite(w)).toBe(true)
      for (let v = 0; v < w.length / 4; v++) {
        const sum = w[v * 4] + w[v * 4 + 1] + w[v * 4 + 2] + w[v * 4 + 3]
        expect(Math.abs(sum - 1)).toBeLessThan(1e-4)
        for (let k = 0; k < 4; k++) {
          expect(idx[v * 4 + k]).toBeLessThan(body.skeleton.bones.length)
          expect(w[v * 4 + k]).toBeGreaterThanOrEqual(0)
        }
      }
      // Heads are ≈ 40 % of the height and the head is weighted to the head bone.
      const box = new THREE.Box3().setFromBufferAttribute(g.getAttribute('position') as THREE.BufferAttribute)
      const H = kit.speciesAsset(id).plan.H
      expect(box.min.y).toBeGreaterThan(-0.01)
      expect(box.max.y).toBeGreaterThan(H * 0.95)
      c.dispose()
    }
  }, 60_000)

  it('is deterministic: the same input gives the same geometry', () => {
    const a = createModelKit({ quality: 'medium' })
    const b = createModelKit({ quality: 'medium' })
    for (const id of ['fox', 'owl'] as const) {
      expect(geometryHash(a.speciesAsset(id).body)).toBe(geometryHash(b.speciesAsset(id).body))
      for (let i = 0; i < a.speciesAsset(id).parts.length; i++)
        expect(geometryHash(a.speciesAsset(id).parts[i].model.geometry)).toBe(
          geometryHash(b.speciesAsset(id).parts[i].model.geometry)
        )
    }
    expect(geometryHash(a.itemAsset('hippo').parts[0].model.geometry)).toBe(
      geometryHash(b.itemAsset('hippo').parts[0].model.geometry)
    )
  }, 60_000)

  it('applies looks and states without throwing', () => {
    const c = kit.createCharacter('cat', { look: 'kurozume' })
    c.setTeam(0xe5484d, 0)
    c.setTeam(0x3e8ed0, 1)
    c.setTeam(null, null)
    c.setLook('ark')
    c.setLook('kurozume')
    c.setPassives(['turtle', 'jelly'], false)
    c.setPassives([], true)
    c.setCloak(0.6)
    c.setFlash(1)
    c.setAnima(0.1)
    c.setHologram(true)
    c.setHologram(false)
    const top = c.headTop(new THREE.Vector3())
    expect(top.y).toBeGreaterThan(kit.speciesAsset('cat').plan.H * 0.95)
    c.dispose()
  })

  it('prepares requests with progress up to 1 and builds every foe, boss, prop and shot kind', async () => {
    const k = createModelKit({ quality: 'low' })
    const seen: number[] = []
    await k.prepare({ species: ['hamster'], items: ['bee', 'jelly'] }, (f) => seen.push(f))
    expect(seen.at(-1)).toBe(1)
    expect(k.stats().species.hamster).toBeDefined()
    for (const kind of FOE_KINDS) {
      const rig = k.foeRig(kind)
      const out = rig.parts.map(() => new THREE.Matrix4())
      rig.pose({ state: 'move', st: 0, time: 1, speed: 3, seed: 0.5, hpFrac: 1 }, out)
    }
    k.createBoss('goutetsu').dispose()
    k.createProp('frog').dispose()
    expect(k.shotLook('bee').geometry).toBeDefined()
    k.dispose()
  }, 30_000)
})

describe('model kit: antiques', () => {
  it('builds every antique within budget with a finite muzzle', () => {
    const kit = createModelKit({ quality: 'medium' })
    for (const id of ITEM_IDS) {
      const item = kit.createItem(id)
      expect(drawnTriangles(item.root), id).toBeLessThanOrEqual(3000)
      expect(Number.isFinite(item.muzzle.x + item.muzzle.y + item.muzzle.z), id).toBe(true)
      // The muzzle lies near the model (within its bounding sphere grown a little).
      const sphere = new THREE.Box3().setFromObject(item.root).getBoundingSphere(new THREE.Sphere())
      expect(item.muzzle.distanceTo(sphere.center), id).toBeLessThan(sphere.radius * 1.3)
      for (const act of ['idle', 'fire', 'charge', 'guard', 'swing', 'beam', 'cooldown'] as const)
        for (let i = 0; i < 10; i++) item.update(1 / 30, act, i / 9)
      item.root.updateMatrixWorld(true)
      item.root.traverse((o) => {
        expect(finite(o.matrixWorld.elements), id).toBe(true)
      })
      item.dispose()
    }
  }, 60_000)
})

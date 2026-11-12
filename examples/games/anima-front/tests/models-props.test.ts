import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { createModelKit } from '../src/models'
import { buildPropAsset, createPropModel, disposePropAsset, type PropAsset } from '../src/models/props'
import { runSync } from '../src/models/sdf/mesher'
import { geometryHash } from '../src/models/sdf/geometry'
import type { PropKind } from '../src/sim/types'

/** Props the renderer asks the kit for (zone, base, ink and puddle are drawn by the renderer itself). */
const KINDS: PropKind[] = [
  'frog',
  'pad',
  'hermit',
  'honey',
  'leafDecoy',
  'decoy',
  'lighthouse',
  'cart',
  'node',
  'target',
  'tutorial'
]
const BIG = new Set<PropKind>(['lighthouse', 'node', 'cart', 'hermit'])

const assets = new Map<PropKind, PropAsset>()
const asset = (kind: PropKind) => {
  let a = assets.get(kind)
  if (!a) {
    a = runSync(buildPropAsset(kind, 'medium'))
    assets.set(kind, a)
  }
  return a
}

function meshes(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = []
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh)
  })
  return out
}

function allFinite(root: THREE.Object3D): boolean {
  root.updateMatrixWorld(true)
  let ok = true
  root.traverse((o) => {
    for (const e of o.matrixWorld.elements) if (!Number.isFinite(e)) ok = false
  })
  return ok
}

describe('model kit: props', () => {
  it('builds every prop within budget at medium (triangles, ≤ 8 meshes, bounded time)', () => {
    for (const kind of KINDS) {
      const t = performance.now()
      const a = asset(kind)
      const ms = performance.now() - t
      expect(a.triangles, kind).toBeGreaterThan(400)
      expect(a.triangles, kind).toBeLessThanOrEqual(BIG.has(kind) ? 12000 : 4000)
      // Desktop target ≤ 300 ms (lighthouse ≈ 0.5 s); CI machines are 2–3× slower.
      expect(ms, kind).toBeLessThan(BIG.has(kind) ? 2500 : 1500)
      const m = createPropModel(a)
      expect(m.kind).toBe(kind)
      const list = meshes(m.root)
      expect(list.length, kind).toBeGreaterThan(0)
      expect(list.length, kind).toBeLessThanOrEqual(8)
      // Triangles drawn (outline meshes and hull halves excluded) stay within the budget too.
      let drawn = 0
      for (const mesh of list) {
        const mat = mesh.material as THREE.Material
        if (mat.side === THREE.BackSide) continue
        const g = mesh.geometry
        drawn += (g.index?.count ?? g.getAttribute('position').count) / 3 - ((g.userData.hullTriangles as number) ?? 0)
      }
      expect(drawn, kind).toBeLessThanOrEqual(BIG.has(kind) ? 12500 : 4200)
      m.dispose()
    }
  }, 60_000)

  it('stands on the ground facing +Z with sensible sizes', () => {
    const height: Partial<Record<PropKind, [number, number]>> = {
      frog: [0.4, 0.8],
      pad: [0.3, 0.8],
      hermit: [2.2, 2.9],
      lighthouse: [7.5, 9],
      cart: [1.6, 2.6],
      node: [2.5, 4.5],
      target: [1.6, 2.2],
      tutorial: [1.2, 2]
    }
    for (const kind of KINDS) {
      const m = createPropModel(asset(kind))
      m.update(1 / 60, 3, 0, undefined)
      const box = new THREE.Box3()
      m.root.updateMatrixWorld(true)
      for (const mesh of meshes(m.root)) {
        if (mesh.userData.extra || mesh.parent?.userData.extra) continue
        mesh.geometry.computeBoundingBox()
        box.union(mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld))
      }
      expect(box.min.y, kind).toBeGreaterThan(-0.05)
      expect(box.min.y, kind).toBeLessThan(0.15)
      const range = height[kind]
      if (range) {
        expect(box.max.y, kind).toBeGreaterThan(range[0])
        expect(box.max.y, kind).toBeLessThan(range[1])
      }
      if (kind === 'hermit') expect(box.max.x - box.min.x, kind).toBeGreaterThan(3.4)
      m.dispose()
    }
  })

  it('keeps every matrix finite over time, state, life and health (bad inputs included)', () => {
    for (const kind of KINDS) {
      const m = createPropModel(asset(kind))
      for (const health of [1, 0.5, 0.1, NaN])
        for (const state of [0, 0.37, 1, NaN])
          for (const life of [undefined, 20, 2.5, 0.2, 0, NaN])
            for (const t of [0, 0.05, 0.3, 4.6, 19.9, 1e4]) {
              m.setHealth(health)
              m.update(1 / 60, t, state, life)
              expect(allFinite(m.root), `${kind} t=${t} state=${state} life=${life}`).toBe(true)
            }
      m.update(NaN, NaN, NaN, undefined)
      m.update(5, 1, 0, undefined)
      expect(allFinite(m.root), kind).toBe(true)
      m.dispose()
    }
  })

  it('animates: frog squash and expiry, cart wheels, node petals, lighthouse lamp', () => {
    const frog = createPropModel(asset('frog'))
    const body = frog.root.getObjectByName('body')!
    frog.update(1 / 60, 5, 0, 15)
    expect(body.scale.y).toBeCloseTo(1, 3)
    frog.update(1 / 60, 19.95, 0, 0.05)
    expect(body.scale.y).toBeLessThan(0.3)
    frog.dispose()

    const cart = createPropModel(asset('cart'))
    const wheel = cart.root.getObjectByName('wheelsF')!
    cart.update(1 / 60, 1, 0, undefined)
    const a0 = wheel.rotation.x
    cart.update(1 / 60, 2, 0.1, undefined)
    expect(Math.abs(wheel.rotation.x - a0)).toBeGreaterThan(10)
    cart.dispose()

    const node = createPropModel(asset('node'))
    const petal = node.root.getObjectByName('petal')!
    node.update(1 / 60, 1, 0, undefined)
    const closed = petal.rotation.x
    for (let i = 0; i < 120; i++) node.update(1 / 30, 1 + i / 30, 1, undefined)
    expect(petal.rotation.x - closed).toBeGreaterThan(0.8)
    node.dispose()

    const lh = createPropModel(asset('lighthouse'))
    const lamp = lh.root.getObjectByName('lamp')!
    lh.update(0.5, 1, 0, undefined)
    const r0 = lamp.rotation.y
    lh.update(0.5, 1.5, 0, undefined)
    expect(lamp.rotation.y).not.toBe(r0)
    lh.dispose()
  })

  it('is deterministic', () => {
    for (const kind of ['frog', 'hermit', 'node', 'target'] as PropKind[]) {
      const b = runSync(buildPropAsset(kind, 'medium'))
      const a = asset(kind)
      expect(b.parts.map((p) => geometryHash(p.baked.geometry))).toEqual(
        a.parts.map((p) => geometryHash(p.baked.geometry))
      )
      disposePropAsset(b)
    }
  }, 30_000)

  it('disposes models and assets, and the kit caches props', () => {
    const a = runSync(buildPropAsset('tutorial', 'low'))
    const m = createPropModel(a)
    const parent = new THREE.Group()
    parent.add(m.root)
    let disposed = 0
    for (const mesh of meshes(m.root)) (mesh.material as THREE.Material).addEventListener('dispose', () => disposed++)
    m.dispose()
    m.dispose()
    expect(m.root.parent).toBeNull()
    expect(disposed).toBeGreaterThan(0)
    expect(() => disposePropAsset(a)).not.toThrow()

    const kit = createModelKit({ quality: 'low' })
    const p1 = kit.createProp('target')
    const p2 = kit.createProp('target')
    expect(p1.root).not.toBe(p2.root)
    expect(kit.stats().props.target!.triangles).toBeGreaterThan(0)
    // Kinds the renderer draws itself still get a harmless (empty) model.
    const zone = kit.createProp('zone')
    zone.update(1 / 60, 1, 0.5, undefined)
    expect(meshes(zone.root).length).toBe(0)
    p1.dispose()
    p2.dispose()
    zone.dispose()
    kit.dispose()
  }, 30_000)
})

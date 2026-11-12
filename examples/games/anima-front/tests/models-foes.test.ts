import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { FOES, FOE_KINDS, type FoeKind } from '../src/data/enemies'
import type { FoeAnim } from '../src/models/api'
import { buildFoeAsset } from '../src/models/foes'
import { runSync } from '../src/models/sdf/mesher'
import { geometryHash } from '../src/models/sdf/geometry'
import type { FoeState } from '../src/sim/types'
import { createModelKit } from '../src/models'

const CROWD = FOE_KINDS.filter((k) => !FOES[k].boss)
const STATES: FoeState[] = ['spawn', 'idle', 'move', 'windup', 'attack', 'recover', 'stagger', 'dying']
/** Triangle budgets at medium (DESIGN §19: crowds of 100+ ツブテ). */
const BUDGET: Partial<Record<FoeKind, number>> = { tsubute: 1200 }

const drawn = (g: THREE.BufferGeometry) =>
  (g.getIndex()?.count ?? g.getAttribute('position').count) / 3 - ((g.userData.hullTriangles as number) ?? 0)

describe('model kit: crowd foes', () => {
  const kit = createModelKit({ quality: 'medium' })

  it('builds every crowd foe within budget (≤ 8 parts, triangles, generation time)', () => {
    for (const kind of CROWD) {
      const t = performance.now()
      const rig = kit.foeRig(kind)
      const ms = performance.now() - t
      expect(rig.kind, kind).toBe(kind)
      expect(rig.parts.length, kind).toBeGreaterThan(0)
      expect(rig.parts.length, kind).toBeLessThanOrEqual(8)
      const tris = rig.parts.reduce((n, p) => n + drawn(p.geometry), 0)
      // クロヅメ is a preview statue of an animal (never drawn as a crowd).
      expect(tris, kind).toBeLessThanOrEqual(kind === 'kurozume' ? 12000 : (BUDGET[kind] ?? 4000))
      expect(tris, kind).toBeGreaterThan(200)
      // Desktop ≲ 400 ms; CI machines are 2–3× slower.
      expect(ms, kind).toBeLessThan(2500)
      for (const p of rig.parts) {
        const pos = p.geometry.getAttribute('position').array
        for (let i = 0; i < pos.length; i++) expect(Number.isFinite(pos[i]), `${kind}:${p.name}`).toBe(true)
        if (kind !== 'kurozume') expect(p.geometry.getAttribute('animaMask'), `${kind}:${p.name}`).toBeDefined()
      }
    }
  }, 60_000)

  it('poses every state, attack, speed and seed with finite matrices', () => {
    for (const kind of CROWD) {
      const rig = kit.foeRig(kind)
      const out = rig.parts.map(() => new THREE.Matrix4())
      const attacks = [undefined, ...FOES[kind].attacks.map((a) => a.id)]
      const anim: FoeAnim = { state: 'idle', st: 0, time: 0, speed: 0, seed: 0, hpFrac: 1 }
      for (const state of STATES)
        for (const attack of attacks)
          for (const st of [0, 0.1, 0.35, 0.8, 2])
            for (const speed of [0, FOES[kind].speed * 0.5, FOES[kind].speed * 1.5])
              for (const seed of [0, 0.37, 0.99]) {
                Object.assign(anim, { state, attack, st, speed, seed, time: 123.4 + st, hpFrac: 0.5 })
                rig.pose(anim, out)
                for (const m of out)
                  for (const e of m.elements) expect(Number.isFinite(e), `${kind} ${state} ${attack}`).toBe(true)
              }
    }
  }, 60_000)

  it('poses without allocating and keeps feet on the ground while idle', () => {
    for (const kind of CROWD) {
      const rig = kit.foeRig(kind)
      const out = rig.parts.map(() => new THREE.Matrix4())
      const ref = [...out]
      const anim: FoeAnim = { state: 'move', st: 0, time: 0, speed: FOES[kind].speed, seed: 0.3, hpFrac: 1 }
      for (let i = 0; i < 2000; i++) {
        anim.time = i / 60
        rig.pose(anim, out)
      }
      out.forEach((m, i) => expect(m, kind).toBe(ref[i]))
      // Idle: the lowest posed vertex of a walker is near the floor (flyers hover above it).
      anim.state = 'idle'
      anim.speed = 0
      rig.pose(anim, out)
      let minY = Infinity
      const v = new THREE.Vector3()
      rig.parts.forEach((p, i) => {
        const pos = p.geometry.getAttribute('position') as THREE.BufferAttribute
        for (let k = 0; k < pos.count; k++) minY = Math.min(minY, v.fromBufferAttribute(pos, k).applyMatrix4(out[i]).y)
      })
      if (!FOES[kind].flying && kind !== 'kurozume') expect(Math.abs(minY), kind).toBeLessThan(0.12)
    }
  }, 30_000)

  it('is deterministic', () => {
    for (const kind of ['tsubute', 'oagos'] as const) {
      const a = runSync(buildFoeAsset(kind, 'medium'))
      const b = runSync(buildFoeAsset(kind, 'medium'))
      a.parts.forEach((p, i) => expect(geometryHash(p.geometry), kind).toBe(geometryHash(b.parts[i].geometry)))
    }
  }, 30_000)

  it('scales with quality', () => {
    const low = createModelKit({ quality: 'low' })
    for (const kind of ['tsubute', 'harigane'] as const) {
      const lo = low.foeRig(kind).parts.reduce((n, p) => n + drawn(p.geometry), 0)
      const med = kit.foeRig(kind).parts.reduce((n, p) => n + drawn(p.geometry), 0)
      expect(lo, kind).toBeLessThan(med)
    }
    low.dispose()
  }, 30_000)
})

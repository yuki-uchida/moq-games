import * as THREE from 'three'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FOES, type FoeAttack } from '../src/data/enemies'
import type { BossModel, FoeAnim } from '../src/models/api'
import { buildBossAsset, createBossModel, disposeBossAsset, type BossAsset, type BossKind } from '../src/models/bosses'
import { drawnTriangles } from '../src/models/hull'
import { createModelKit } from '../src/models'
import { geometryHash } from '../src/models/sdf/geometry'
import { runSync } from '../src/models/sdf/mesher'
import type { FoeState } from '../src/sim/types'

const KINDS: BossKind[] = ['kuitsukushi', 'goutetsu']
const STATES: FoeState[] = ['spawn', 'idle', 'move', 'windup', 'attack', 'recover', 'stagger', 'dying']

const finite = (a: ArrayLike<number>) => {
  for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return false
  return true
}

function meshesOf(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = []
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh)
  })
  return out
}

const anim = (o: Partial<FoeAnim>): FoeAnim => ({ state: 'idle', st: 0, time: 0, speed: 0, seed: 0.3, hpFrac: 1, ...o })

/** Steps a model through `seconds` of one pose at 60 fps. */
function run(m: BossModel, a: FoeAnim, seconds: number, advanceSt = true) {
  const n = Math.round(seconds * 60)
  for (let i = 0; i < n; i++) {
    a.time += 1 / 60
    if (advanceSt) a.st += 1 / 60
    m.update(1 / 60, a)
  }
  m.root.updateMatrixWorld(true)
}

const PARTS: Record<BossKind, number[][]> = {
  kuitsukushi: [[0, 1], [1, 1], [0, 2], [1, 3], []],
  goutetsu: [
    [800, 800, 800, 800],
    [800, 0, 800, 800],
    [0, 800, 0, 800],
    [600, 0, 0, 0],
    [0, 0, 0, 0],
    [1200, 900, 300, 50]
  ]
}

describe('model kit: bosses', () => {
  const assets = {} as Record<BossKind, BossAsset>
  beforeAll(() => {
    for (const kind of KINDS) assets[kind] = runSync(buildBossAsset(kind, 'medium'))
  }, 60_000)
  afterAll(() => {
    for (const kind of KINDS) disposeBossAsset(assets[kind])
  })

  it('builds both bosses within budget at medium (≤ 40k triangles, ≤ 24 meshes, bounded generation)', () => {
    for (const kind of KINDS) {
      const a = assets[kind]
      const m = createBossModel(a)
      const meshes = meshesOf(m.root)
      let tris = 0
      for (const mesh of meshes) tris += drawnTriangles(mesh.geometry)
      // The asset counts the sculpted parts; the model may add a few effect meshes (the sweep beam).
      expect(a.triangles, kind).toBeLessThanOrEqual(40_000)
      expect(a.triangles, kind).toBeGreaterThan(20_000)
      expect(tris, kind).toBeLessThanOrEqual(40_500)
      expect(meshes.length, kind).toBeLessThanOrEqual(24)
      expect(a.meshes, kind).toBeLessThanOrEqual(meshes.length)
      // Desktop target ≈ 1–1.5 s; CI machines are 2–3× slower, so the bound is generous.
      expect(a.ms, kind).toBeLessThan(6000)
      // Hull meshes skip the hull in the shadow pass.
      for (const mesh of meshes)
        if (mesh.geometry.userData.hullTriangles) expect(mesh.customDepthMaterial, `${kind} ${mesh.name}`).toBeTruthy()
      m.dispose()
    }
  })

  it('keeps every matrix finite and the weak point on the model for every state, attack and part condition', () => {
    for (const kind of KINDS) {
      const def = FOES[kind]
      const m = createBossModel(assets[kind])
      const attacks: (FoeAttack | undefined)[] = [undefined, ...def.attacks.map((x) => x.id)]
      const wp = new THREE.Vector3()
      const at = new THREE.Vector3(12, 0, -7)
      m.root.position.copy(at)
      m.root.rotation.y = 0.8
      for (const parts of PARTS[kind])
        for (const state of STATES)
          for (const attack of attacks) {
            if (attack && state !== 'windup' && state !== 'attack' && state !== 'recover') continue
            const a = anim({
              state,
              attack,
              parts: parts.length ? parts : undefined,
              speed: state === 'move' ? def.speed : 0,
              hpFrac: state === 'dying' ? 0 : 0.6
            })
            for (const st of [0, 0.05, 0.5, 1.2, 3]) {
              a.st = st
              run(m, a, 0.1, false)
              m.root.traverse((o) => {
                expect(finite(o.matrixWorld.elements), `${kind} ${state} ${attack} ${o.name}`).toBe(true)
              })
              m.weakPoint(wp)
              expect(finite(wp.toArray()), `${kind} ${state}`).toBe(true)
              expect(Math.hypot(wp.x - at.x, wp.z - at.z), `${kind} ${state} ${attack}`).toBeLessThan(def.radius * 1.6)
              expect(wp.y, `${kind} ${state} ${attack}`).toBeGreaterThan(-12)
              expect(wp.y, `${kind} ${state} ${attack}`).toBeLessThan(def.height * 1.2)
            }
          }
      m.dispose()
    }
  })

  it('shows the weak points where the sim checks them', () => {
    const wp = new THREE.Vector3()
    // クイツクシ: the open core rises into the weak zone (hits above 0.6 × height); the closed one sinks.
    const k = createBossModel(assets.kuitsukushi)
    run(k, anim({ parts: [1, 1] }), 2)
    const open = k.weakPoint(wp).y
    run(k, anim({ parts: [0, 1] }), 3)
    const closed = k.weakPoint(wp).y
    expect(open).toBeGreaterThan(FOES.kuitsukushi.height * 0.6)
    expect(closed).toBeLessThan(open - 0.5)
    k.dispose()
    // ゴウテツ: kneeling puts the chest core within 0.3–0.8 × height.
    const g = createBossModel(assets.goutetsu)
    run(g, anim({ state: 'stagger', parts: [0, 800, 0, 800] }), 3)
    g.weakPoint(wp)
    expect(wp.y).toBeGreaterThan(FOES.goutetsu.height * 0.3)
    expect(wp.y).toBeLessThan(FOES.goutetsu.height * 0.8)
    expect(wp.z).toBeGreaterThan(2)
    g.dispose()
  })

  it('plants ゴウテツ feet on the sim leg columns (0 left-back, 1 right-back, 2 left-front, 3 right-front)', () => {
    const g = createBossModel(assets.goutetsu)
    run(g, anim({ parts: [800, 800, 800, 800] }), 3)
    const feet: THREE.Object3D[] = []
    g.root.traverse((o) => {
      if (o.name === 'foot' && (o as THREE.Mesh).isMesh) feet.push(o.parent!)
    })
    expect(feet.length).toBe(4)
    const p = new THREE.Vector3()
    feet.forEach((f, i) => {
      f.getWorldPosition(p)
      expect(Math.sign(p.x), `leg ${i} x`).toBe(i & 1 ? -1 : 1)
      expect(Math.sign(p.z), `leg ${i} z`).toBe(i & 2 ? 1 : -1)
      expect(Math.hypot(Math.abs(p.x) - 3, Math.abs(p.z) - 3), `leg ${i}`).toBeLessThan(0.3)
      expect(p.y).toBeLessThan(1)
    })
    // A broken leg lifts off the ground.
    run(g, anim({ parts: [800, 800, 0, 800] }), 3)
    feet[2].getWorldPosition(p)
    expect(p.y).toBeGreaterThan(1.5)
    g.dispose()
  })

  it('is deterministic (same geometry twice) and disposes cleanly', () => {
    for (const kind of KINDS) {
      const again = runSync(buildBossAsset(kind, 'medium'))
      for (const name of Object.keys(assets[kind].parts))
        expect(geometryHash(again.parts[name].geometry), `${kind} ${name}`).toBe(
          geometryHash(assets[kind].parts[name].geometry)
        )
      const m = createBossModel(again)
      run(m, anim({ state: 'windup', attack: FOES[kind].attacks[0].id }), 0.5)
      expect(() => m.dispose()).not.toThrow()
      expect(() => disposeBossAsset(again)).not.toThrow()
    }
  }, 30_000)

  it('is served by the model kit (createBoss after prepare)', async () => {
    const kit = createModelKit({ quality: 'low' })
    await kit.prepare({ foes: ['goutetsu'] })
    const b = kit.createBoss('goutetsu')
    expect(b.kind).toBe('goutetsu')
    expect(kit.stats().foes.goutetsu!.triangles).toBeGreaterThan(5000)
    b.update(1 / 60, anim({ state: 'move', speed: 1.5, parts: [800, 800, 800, 800] }))
    b.dispose()
    kit.dispose()
  }, 30_000)
})

/**
 * 蝕機 (machines) crowd rigs: budgets, finite and allocation-free poses, planted feet, the wind-up tells that the
 * player reads (charge cores, mortar orb, blinking lamps, the mane fan) and deterministic geometry.
 */
import { readFileSync } from 'node:fs'
import { setFlagsFromString } from 'node:v8'
import { runInNewContext } from 'node:vm'
import * as THREE from 'three'
import { beforeAll, describe, expect, it } from 'vitest'
import { FOES } from '../src/data/enemies'
import type { FoeAnim, FoeRig } from '../src/models/api'
import { buildFoeAsset, createFoeRig, type FoeAsset } from '../src/models/foes'
import { MACHINES } from '../src/models/foes/machines'
import { geometryHash } from '../src/models/sdf/geometry'
import { runSync } from '../src/models/sdf/mesher'
import type { FoeState } from '../src/sim/types'

const KINDS = ['mitsume', 'ashinaga', 'korogashi', 'tategami'] as const
type Kind = (typeof KINDS)[number]
const STATES: FoeState[] = ['spawn', 'idle', 'move', 'windup', 'attack', 'recover', 'stagger', 'dying']

const drawnTris = (a: FoeAsset) => a.parts.reduce((n, p) => n + p.triangles * (p.hull ? 2 : 1), 0)

const anim = (o: Partial<FoeAnim> = {}): FoeAnim => ({
  state: 'idle',
  st: 0,
  time: 10,
  speed: 0,
  seed: 0.37,
  hpFrac: 1,
  ...o
})

/** Posed rig: matrices by part name. */
function posed(rig: FoeRig, a: FoeAnim): Record<string, THREE.Matrix4> {
  const out = rig.parts.map(() => new THREE.Matrix4())
  rig.pose(a, out)
  return Object.fromEntries(rig.parts.map((p, i) => [p.name, out[i]]))
}

/** Lowest posed vertex of a part. */
function minY(rig: FoeRig, name: string, m: THREE.Matrix4): number {
  const g = rig.parts.find((p) => p.name === name)!.geometry
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  const v = new THREE.Vector3()
  let y = Infinity
  for (let i = 0; i < pos.count; i++) y = Math.min(y, v.fromBufferAttribute(pos, i).applyMatrix4(m).y)
  return y
}

const scaleOf = (m: THREE.Matrix4) => Math.cbrt(Math.abs(m.determinant()))

describe('model kit: 蝕機 machines', () => {
  const assets = {} as Record<Kind, FoeAsset>
  const rigs = {} as Record<Kind, FoeRig>
  beforeAll(() => {
    runSync(buildFoeAsset('korogashi', 'medium'))
    for (const k of KINDS) {
      assets[k] = runSync(buildFoeAsset(k, 'medium'))
      rigs[k] = createFoeRig(assets[k])
    }
  }, 60_000)

  it('has a recipe for every machine', () => {
    for (const k of KINDS) expect(typeof MACHINES[k], k).toBe('function')
  })

  it('builds within budget at medium (≤ 8 parts, ≤ 4k drawn triangles, generation time)', () => {
    for (const k of KINDS) {
      const a = assets[k]
      expect(a.parts.length, k).toBeLessThanOrEqual(8)
      expect(drawnTris(a), k).toBeLessThanOrEqual(4000)
      expect(a.triangles, k).toBeGreaterThan(1500)
      // Desktop ≲ 400 ms; CI machines are 2–3× slower.
      expect(a.ms, k).toBeLessThan(1500)
      for (const p of a.parts) {
        expect(p.triangles, `${k}:${p.name}`).toBeGreaterThan(20)
        expect(p.geometry.getAttribute('animaMask'), `${k}:${p.name}`).toBeDefined()
        const pos = p.geometry.getAttribute('position').array
        for (let i = 0; i < pos.length; i++) if (!Number.isFinite(pos[i])) throw new Error(`${k}:${p.name} NaN`)
      }
    }
  })

  it('scales its triangles with quality', () => {
    for (const k of ['mitsume', 'korogashi'] as const) {
      const low = runSync(buildFoeAsset(k, 'low'))
      expect(low.triangles, k).toBeLessThan(assets[k].triangles)
    }
  }, 30_000)

  it('writes finite matrices for every state, attack, speed, seed and time', () => {
    for (const k of KINDS) {
      const rig = rigs[k]
      const out = rig.parts.map(() => new THREE.Matrix4())
      const def = FOES[k]
      const a = anim()
      for (const state of STATES)
        for (const attack of [undefined, ...def.attacks.map((x) => x.id)])
          for (const st of [0, 0.05, 0.2, 0.45, 0.62, 0.95, 1.6, 4])
            for (const speed of [0, 0.5, def.speed, 30])
              for (const seed of [0, 0.37, 0.999])
                for (const time of [0, 3.3, 4321.9]) {
                  a.state = state
                  a.attack = attack
                  a.st = st
                  a.speed = speed
                  a.seed = seed
                  a.time = time
                  a.hpFrac = seed > 0.5 ? 0.2 : 1
                  rig.pose(a, out)
                  for (let i = 0; i < out.length; i++) {
                    const e = out[i].elements
                    for (let j = 0; j < 16; j++)
                      if (!Number.isFinite(e[j])) throw new Error(`${k}:${rig.parts[i].name} ${state} st ${st}`)
                  }
                }
    }
  }, 30_000)

  it('poses without creating objects (source check)', () => {
    const dir = new URL('../src/models/foes/machines/', import.meta.url)
    for (const file of ['mitsume.ts', 'ashinaga.ts', 'korogashi.ts', 'tategami.ts', 'kit.ts']) {
      const src = readFileSync(new URL(file, dir), 'utf8')
      // Every function reachable from pose(): the pose itself and the posing helpers.
      const fns = /^(?:export )?function (\w+)\b[\s\S]*?^}/gm
      const bodies = [...src.matchAll(fns)].filter((m) =>
        /^(pose|legPose|legMatrix|splayFor|beginPose|endPose|hidePart|flicker|sparkPose)$/.test(m[1])
      )
      expect(bodies.length, file).toBeGreaterThan(file === 'kit.ts' ? 4 : 0)
      for (const b of bodies)
        expect(b[0], `${file}:${b[1]}`).not.toMatch(/\bnew\s|=>|\.map\(|\.filter\(|\.\.\.|\bObject\./)
    }
  })

  it('poses without allocating', () => {
    let gc: (() => void) | null = null
    try {
      setFlagsFromString('--expose_gc')
      gc = runInNewContext('gc') as () => void
    } catch {
      gc = null
    }
    const N = 20000
    for (const k of KINDS) {
      const rig = rigs[k]
      const out = rig.parts.map(() => new THREE.Matrix4())
      const ref = [...out]
      const elems = out.map((m) => m.elements)
      const def = FOES[k]
      const a = anim({ attack: def.attacks[0].id })
      const run = (n: number) => {
        for (let i = 0; i < n; i++) {
          a.state = STATES[i & 7]
          a.st = (i % 97) * 0.013
          a.time = i * 0.016
          a.speed = (i % 5) * def.speed * 0.3
          a.seed = (i % 13) / 13
          rig.pose(a, out)
        }
      }
      run(N) // warm up (JIT)
      gc?.()
      const h0 = process.memoryUsage().heapUsed
      run(N)
      const perCall = (process.memoryUsage().heapUsed - h0) / N
      // Heuristic: V8 boxes doubles passed to non-inlined helpers (~16 B each, collected young), but a Matrix4
      // per part (~200 B each) would blow this bound.
      if (gc) expect(perCall, k).toBeLessThan(1200)
      out.forEach((m, i) => {
        expect(m, k).toBe(ref[i])
        expect(m.elements, k).toBe(elems[i])
      })
    }
  }, 30_000)

  it('is deterministic for a given anim', () => {
    for (const k of KINDS) {
      const a = anim({ state: 'windup', st: 0.3, attack: FOES[k].attacks[0].id, time: 77.7, speed: 1 })
      const x = posed(rigs[k], a)
      const y = posed(rigs[k], a)
      for (const name of Object.keys(x)) expect(x[name].equals(y[name]), `${k}:${name}`).toBe(true)
    }
  })

  it('keeps the walkers planted while standing, bracing and recovering', () => {
    const cases: [Kind, string[]][] = [
      ['ashinaga', ['legFL', 'legFR', 'legBL', 'legBR']],
      ['tategami', ['legL', 'legR']]
    ]
    for (const [k, legs] of cases) {
      const def = FOES[k]
      const atk = def.attacks[0]
      for (const a of [
        anim(),
        anim({ seed: 0.81, time: 3.1 }),
        anim({ state: 'windup', attack: atk.id, st: atk.windup * 0.95 }),
        anim({ state: 'recover', attack: atk.id, st: 0.05 })
      ]) {
        const m = posed(rigs[k], a)
        for (const leg of legs) {
          const y = minY(rigs[k], leg, m[leg])
          expect(y, `${k}:${leg} ${a.state}`).toBeGreaterThan(-0.06)
          expect(y, `${k}:${leg} ${a.state}`).toBeLessThan(0.08)
        }
      }
    }
    // The rolling bomb sits on its ball.
    const m = posed(rigs.korogashi, anim())
    expect(Math.abs(minY(rigs.korogashi, 'ball', m.ball))).toBeLessThan(0.05)
  })

  it('lifts feet off the ground while walking', () => {
    for (const [k, legs] of [
      ['ashinaga', ['legFL', 'legFR', 'legBL', 'legBR']],
      ['tategami', ['legL', 'legR']]
    ] as [Kind, string[]][]) {
      let lifted = 0
      for (let i = 0; i < 40; i++) {
        const m = posed(rigs[k], anim({ state: 'move', speed: FOES[k].speed, time: i * 0.05 }))
        for (const leg of legs) lifted = Math.max(lifted, minY(rigs[k], leg, m[leg]))
      }
      expect(lifted, k).toBeGreaterThan(0.08)
    }
  })

  it('telegraphs every attack through its parts', () => {
    // ミツメ: the charge cores grow over the eyes, the ring swings in front of the face.
    const mi = FOES.mitsume.attacks[0]
    const idle = posed(rigs.mitsume, anim())
    const charged = posed(rigs.mitsume, anim({ state: 'windup', attack: mi.id, st: mi.windup * 0.95 }))
    expect(scaleOf(idle.charge)).toBeLessThan(0.01)
    expect(scaleOf(charged.charge)).toBeGreaterThan(0.95)
    const ringZ = (m: THREE.Matrix4) => new THREE.Vector3(0, 0.36, 0).applyMatrix4(m).z
    expect(ringZ(charged.ring)).toBeGreaterThan(ringZ(idle.ring) + 0.15)
    // アシナガ: the mortar swings up and the orb grows.
    const ai = FOES.ashinaga.attacks[0]
    const aIdle = posed(rigs.ashinaga, anim())
    const aWind = posed(rigs.ashinaga, anim({ state: 'windup', attack: ai.id, st: ai.windup * 0.9 }))
    expect(scaleOf(aIdle.orb)).toBeLessThan(0.01)
    expect(scaleOf(aWind.orb)).toBeGreaterThan(0.6)
    const up = (m: THREE.Matrix4) => new THREE.Vector3(0, 1, 0).transformDirection(m)
    expect(up(aWind.mortar).y).toBeGreaterThan(up(aIdle.mortar).y + 0.3)
    // コロガシ: the lamps blink faster and faster and the ball swells.
    const ki = FOES.korogashi.attacks[0]
    const toggles = [0, 0]
    let last = -1
    for (let i = 0; i <= 120; i++) {
      const st = (i / 120) * ki.windup
      const on = scaleOf(posed(rigs.korogashi, anim({ state: 'windup', attack: ki.id, st })).lamps) > 0.95 ? 1 : 0
      if (last >= 0 && on !== last) toggles[st < ki.windup / 2 ? 0 : 1]++
      last = on
    }
    expect(toggles[0]).toBeGreaterThanOrEqual(2)
    expect(toggles[1]).toBeGreaterThan(toggles[0])
    const kIdle = posed(rigs.korogashi, anim())
    const kLate = posed(rigs.korogashi, anim({ state: 'windup', attack: ki.id, st: ki.windup * 0.95 }))
    expect(scaleOf(kLate.ball)).toBeGreaterThan(scaleOf(kIdle.ball) * 1.04)
    expect(scaleOf(kLate.core) / scaleOf(kLate.ball)).toBeGreaterThan(1.08)
    // タテガミ: the mane is folded while it drops in and fanned once the dome is up.
    // Angle between the middle blades of the left and centre parts (66° apart when fanned).
    const mid = Math.PI * (66 / 180)
    const side = (m: Record<string, THREE.Matrix4>) =>
      new THREE.Vector3(Math.sin(mid), Math.cos(mid), 0)
        .transformDirection(m.maneL)
        .angleTo(new THREE.Vector3(0, 1, 0).transformDirection(m.maneC))
    const folded = posed(rigs.tategami, anim({ state: 'spawn', st: 0.3 }))
    const held = posed(rigs.tategami, anim({ state: 'move', speed: 2 }))
    expect(side(folded)).toBeLessThan(0.1)
    expect(side(held)).toBeGreaterThan(0.9)
  })

  it('puts its lights out when destroyed', () => {
    // Lens part and the part it rides on (アシナガ's lens is part of its body).
    const lens = { mitsume: ['eyes', 'body'], korogashi: ['eye', 'yoke'], tategami: ['eye', 'body'] } as const
    for (const k of ['mitsume', 'korogashi', 'tategami'] as const) {
      const [eye, host] = lens[k]
      const alive = posed(rigs[k], anim())
      const dead = posed(rigs[k], anim({ state: 'dying', st: 0.3 }))
      // Alive: the lens rides exactly on its host; dead: it has sunk back into its socket.
      expect(alive[eye].equals(alive[host]), k).toBe(true)
      expect(dead[eye].equals(dead[host]), k).toBe(false)
    }
  })

  it('generates the same geometry twice', () => {
    for (const k of KINDS) {
      const b = runSync(buildFoeAsset(k, 'medium'))
      assets[k].parts.forEach((p, i) =>
        expect(geometryHash(b.parts[i].geometry), `${k}:${p.name}`).toBe(geometryHash(p.geometry))
      )
    }
  }, 30_000)
})

/**
 * One occlusion rule for every effect that crosses space (DESIGN §10): pellets point-blank and from afar, beam
 * chains, blasts on every target kind, the beam's drawn end, foe bites and the honey aura.
 */
import { describe, expect, it } from 'vitest'
import { blast, destroyProp } from '../src/sim/combat'
import { spawnFoe } from '../src/sim/foes/index'
import { strike, type TargetInfo } from '../src/sim/foes/common'
import { addProp, syncWalls as sync } from '../src/sim/props'
import { FOE_SIDE } from '../src/sim/state'
import { beamEndPoint } from '../src/render/fx/beam-end'
import { BTN } from '../src/sim/types'
import { aimAt, rig } from './sim-helpers'
import { flatMap } from './sim-maps'

/** Adds the ヤドカリ wall to the physics (addProp leaves that to the gadget). */
const syncWalls = (sim: ReturnType<typeof rig>['sim'], _wall: unknown) => sync(sim)

const node = (r: ReturnType<typeof rig>, at: number[] = [0, 0, 0]) =>
  addProp(r.sim, 'node', at, 0, FOE_SIDE, { hp: 1000, r: 2.2, state: 1, data: { h: 4 } })

describe('フグ pellets against a node', () => {
  for (const z of [-9, -3, -2.05, -2, -1.99]) {
    it(`from z=${z} (touching it at −2) every pellet hits the node and none reaches the foe behind`, () => {
      const r = rig({ r: ['puffer'] })
      r.step(2)
      const n = node(r)
      const f = spawnFoe(r.sim, 'oagos', [0, 0, 7], { passive: true })
      f.hp = f.maxHp = 5000
      r.player().p = [0, 0, z]
      r.player().v = [0, 0, 0]
      r.step(2)
      aimAt(r, [0, 1.3, 0])
      r.press('R', 45)
      r.step(50)
      const p = r.player()
      expect(p.stats.shots).toBeGreaterThan(0)
      expect(p.stats.hits).toBe(p.stats.shots)
      expect(n.hp!).toBeLessThan(1000)
      expect(f.hp).toBe(5000)
    })
  }
})

describe('デンキウナギ chains', () => {
  const setup = (withNode: boolean) => {
    const r = rig({ r: ['eel'] })
    r.step(2)
    if (withNode) node(r)
    const front = spawnFoe(r.sim, 'tsubute', [1.4, 0, -1.5], { passive: true })
    const back = spawnFoe(r.sim, 'tsubute', [1.4, 0, 1.5], { passive: true })
    for (const f of [front, back]) f.hp = f.maxHp = 1000
    r.player().p = [1.4, 0, -8]
    r.step(2)
    aimAt(r, [1.4, 0.4, -1.5])
    r.press('R', 60)
    return { front, back }
  }
  it('do not jump to a foe hidden behind a node', () => {
    const { front, back } = setup(true)
    expect(front.hp).toBeLessThan(1000)
    expect(back.hp).toBe(1000)
  })
  it('still jump when the line between the foes is open', () => {
    const { front, back } = setup(false)
    expect(front.hp).toBeLessThan(1000)
    expect(back.hp).toBeLessThan(1000)
  })
})

describe('blasts obey the same occlusion for every target', () => {
  it('an enemy blast against a ヤドカリ wall does not reach the lighthouse behind it; in the open it does', () => {
    for (const wall of [true, false]) {
      const r = rig({ r: ['bee'] })
      r.step(2)
      const lh = addProp(r.sim, 'lighthouse', [0, 0, 3], 0, 0, { hp: 1000, r: 1.6, data: { h: 7 } })
      if (wall) syncWalls(r.sim, addProp(r.sim, 'hermit', [0, 0, 0], 0, 0, { hp: 1000, until: 100 }))
      r.player().p = [15, 0, 15]
      r.step(1)
      blast(r.sim, [0, 1, -0.7], 5, 100, FOE_SIDE, undefined, 'acid')
      if (wall) expect(lh.hp).toBe(1000)
      else expect(lh.hp!).toBeLessThan(1000)
    }
  })

  it('a boss behind a wall takes no blast damage; in the open it does', () => {
    for (const wall of [true, false]) {
      const map = flatMap()
      if (wall) map.boxes.push({ min: [-20, 0, -0.3], max: [20, 15, 0.3], kind: 'wall' })
      const r = rig({ r: ['bee'], map })
      r.step(2)
      const boss = spawnFoe(r.sim, 'goutetsu', [0, 0, 8], { passive: true })
      r.player().p = [15, 0, 15]
      r.step(2)
      boss.state = 'move'
      const before = boss.hp
      blast(r.sim, [0, 1, 4.5], 5, 85, 0, 'me', 'hippo')
      if (wall) {
        boss.hp = before
        blast(r.sim, [0, 1, -0.7], 5, 85, 0, 'me', 'hippo')
        expect(boss.hp).toBe(before)
      } else expect(boss.hp).toBeLessThan(before)
    }
  })

  it('a player blast hurts a node it touches from outside', () => {
    const r = rig({ r: ['bee'] })
    r.step(2)
    const n = node(r)
    blast(r.sim, [0, 1, -2.4], 3, 50, 0, 'me', 'hippo')
    expect(n.hp!).toBeLessThan(1000)
  })
})

describe('the beam is drawn where the sim stopped it', () => {
  const beamAt = (kind: 'lighthouse' | 'node' | 'gone' | 'none') => {
    const r = rig({ r: ['eel'] })
    r.step(2)
    if (kind === 'lighthouse') addProp(r.sim, 'lighthouse', [0, 0, 0], 0, 0, { hp: 1000, r: 1.6, data: { h: 7 } })
    if (kind === 'node' || kind === 'gone') {
      const n = node(r)
      if (kind === 'gone') {
        destroyProp(r.sim, n, undefined)
        r.step(1)
      }
    }
    r.player().p = [0, 0, -8]
    r.step(1)
    aimAt(r, [0, 1, 20])
    const inp = r.input()
    inp.presses.r++
    inp.held = BTN.R
    r.step(10)
    const hv = r.world.view().players.find((p) => p.id === 'me')!.hands[0]
    return hv
  }
  it('stops at the lighthouse and at a living node, runs on past a destroyed one; the renderer uses that end', () => {
    const lh = beamAt('lighthouse')
    expect(lh.act).toBe('beam')
    // on the near surface of the shaft (r 1.5; the foot r 2.1 is below the beam)
    const radial = (e: number[]) => Math.hypot(e[0], e[2])
    expect(lh.beamEnd![2]).toBeLessThan(0)
    expect(radial(lh.beamEnd!)).toBeCloseTo(1.5, 1)
    const nd = beamAt('node')
    expect(nd.beamEnd![2]).toBeLessThan(0)
    expect(radial(nd.beamEnd!)).toBeCloseTo(1.65, 1) // the pod grown by the beam's 0.05 m
    const gone = beamAt('gone')
    expect(gone.beamEnd![2]).toBeGreaterThan(20)
    // the renderer draws to the sim's end whatever the render grid says
    const grid = { raycast: () => 35 }
    expect(beamEndPoint(lh, [0, 1, -7.5], [0, 0, 1], grid)).toEqual(lh.beamEnd)
    expect(beamEndPoint({}, [0, 1, -7.5], [0, 0, 1], grid)).toEqual([0, 1, 27.5])
  })
})

describe('foe bites and the honey aura', () => {
  it('a foe cannot bite a player through a ヤドカリ wall', () => {
    for (const wall of [true, false]) {
      const r = rig({ r: ['bee'] })
      r.step(2)
      const me = r.player()
      me.p = [0, 0, 0.9]
      if (wall) syncWalls(r.sim, addProp(r.sim, 'hermit', [0, 0, 0], 0, 0, { hp: 1000, until: 100 }))
      r.step(1)
      const f = spawnFoe(r.sim, 'tsubute', [0, 0, -0.9], { passive: true })
      const t: TargetInfo = {
        ref: { k: 'p', id: 'me' },
        pos: me.p,
        center: [0, 0.8, 0.9],
        r: me.r,
        player: me,
        prop: null
      }
      const before = me.anima
      me.invulnUntil = 0
      strike(r.sim, f, t, 2, 10, 'bite')
      if (wall) expect(me.anima).toBe(before)
      else expect(me.anima).toBeLessThan(before)
    }
  })

  it('a honey jar does not heal through a wall', () => {
    for (const wall of [true, false]) {
      const map = flatMap()
      if (wall) map.boxes.push({ min: [-5, 0, -0.3], max: [5, 4, 0.3], kind: 'wall' })
      const r = rig({ r: ['bee'], map })
      r.step(2)
      const me = r.player()
      me.p = [0, 0, 2]
      addProp(r.sim, 'honey', [0, 0, -2], 0, me.side, { r: 4.5, until: 100, data: { heal: 4 } })
      me.anima = 50
      me.lastSpend = me.lastHurt = r.sim.time + 100 // no natural regeneration
      r.step(60)
      if (wall) expect(me.anima).toBeCloseTo(50, 5)
      else expect(me.anima).toBeGreaterThan(53)
    }
  })
})

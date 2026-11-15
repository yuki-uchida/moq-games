/**
 * Cover and collision for every attack, structure and mover (DESIGN §9, §10): effects placed at a point stop at
 * cover, launch bounces stay on the shooter's side, every attack type damages a hostile ヤドカリ wall (never a
 * friendly one), distances go to each target's real shape, chains and big bodies obey the same sight rule, and no
 * mover (walker, flyer, boss) passes through solid terrain. The round-13 review's cases keep their numbers.
 */
import { describe, expect, it } from 'vitest'
import type { FoeKind } from '../src/data/enemies'
import type { ItemId } from '../src/data/items'
import { getMap } from '../src/sim/api'
import { blast, killFoe } from '../src/sim/combat'
import { spawnFoe } from '../src/sim/foes/index'
import { addProp, syncWalls } from '../src/sim/props'
import { FOE_SIDE, type Prop } from '../src/sim/state'
import type { MapBox } from '../src/sim/types'
import { aimAt, rig, type Rig } from './sim-helpers'
import { flatMap } from './sim-maps'

const wallMap = (box: Omit<MapBox, 'kind'>) => {
  const map = flatMap()
  map.boxes.push({ ...box, kind: 'wall' })
  return map
}
const hermit = (r: Rig, side: number, at: number[] = [0, 0, 0]): Prop => {
  const w = addProp(r.sim, 'hermit', at, 0, side, { hp: 250, until: 100, r: 2 })
  syncWalls(r.sim)
  return w
}

describe('effects placed at a point stop at cover', () => {
  it('a マンモス slam cannot place damage beyond a blocking wall', () => {
    const r = rig({ r: ['mammoth'], map: wallMap({ min: [-8, 0, -0.05], max: [8, 4, 0.05] }) })
    r.step(3)
    const p = r.player()
    p.p = [0, 0, -0.7]
    p.yaw = 0
    r.input().yaw = 0
    const f = spawnFoe(r.sim, 'tsubute', [0, 0, 1.3], { passive: true })
    f.hp = f.maxHp = 1000
    f.state = 'move'
    r.step(2)
    r.press('R')
    r.step(35)
    expect(f.hp).toBe(1000)
  })

  it('in the open the same slam hits', () => {
    const r = rig({ r: ['mammoth'] })
    r.step(3)
    const p = r.player()
    p.p = [0, 0, -0.7]
    p.yaw = 0
    r.input().yaw = 0
    const f = spawnFoe(r.sim, 'tsubute', [0, 0, 1.3], { passive: true })
    f.hp = f.maxHp = 1000
    f.state = 'move'
    r.step(2)
    r.press('R')
    r.step(35)
    expect(f.hp).toBeLessThan(1000)
  })

  it('a クイツクシ slam cannot strike a player behind a solid wall', () => {
    const r = rig({ r: ['bee'], map: wallMap({ min: [-30, 0, -0.3], max: [30, 15, 0.3] }) })
    r.step(2)
    const p = r.player()
    p.p = [0, 0, 8]
    p.invulnUntil = 0
    const f = spawnFoe(r.sim, 'kuitsukushi', [0, 0, -8], {})
    f.state = 'idle'
    r.step(240)
    expect(p.anima).toBe(100)
  })

  it('a ダンゴムシ bouncing off the real harbor fence at launch cannot hit an enemy behind it', () => {
    const r = rig({ r: ['pillbug'], map: getMap('harbor') })
    r.step(3)
    const p = r.player()
    p.p = [-79.581, 0, -73]
    p.yaw = Math.PI / 2
    r.input().yaw = Math.PI / 2
    const f = spawnFoe(r.sim, 'tsubute', [-78.37, 0, -72.5], { passive: true })
    f.hp = f.maxHp = 1000
    f.state = 'move'
    r.step(2)
    r.press('R')
    r.step(2)
    expect(f.hp).toBe(1000)
    // the grenade bounced back to the shooter's side of the fence
    for (const s of r.sim.shots) if (s.kind === 'pillbug') expect(s.p[0]).toBeLessThan(-79.2)
  })
})

describe('every attack type damages a hostile ヤドカリ wall and never a friendly one', () => {
  const ATTACKS: ItemId[] = ['bee', 'puffer', 'wood', 'eel', 'claw', 'orca', 'mammoth', 'narwhal']
  for (const weapon of ATTACKS) {
    it(weapon, () => {
      for (const side of [1, 0]) {
        const r = rig({ r: [weapon] })
        r.step(3)
        r.player().p = [0, 0, -1]
        const wall = hermit(r, side)
        r.step(2)
        aimAt(r, [0, 0.6, 4])
        r.press('R', 100)
        r.step(2)
        if (side === 1) expect(wall.hp, `${weapon} vs a hostile wall`).toBeLessThan(250)
        else expect(wall.hp, `${weapon} vs its own side's wall`).toBe(250)
      }
    })
  }
})

describe("distances go to each target's real shape", () => {
  it('a blast is measured from the ヤドカリ wall box, not a wider cylinder', () => {
    const r = rig({ r: ['bee'] })
    r.step(3)
    r.player().p = [10, 0, -10]
    const wall = hermit(r, 1)
    r.step()
    // 4.5 m from the wall's face (z −0.3) with a 4 m radius: out of reach
    blast(r.sim, [0, 1, -4.8], 4, 50, 0, 'me', 'pillbug')
    expect(wall.hp).toBe(250)
    // 3.5 m from it: in reach
    blast(r.sim, [0, 1, -3.8], 4, 50, 0, 'me', 'pillbug')
    expect(wall.hp).toBeLessThan(250)
  })

  // [target, centre, the shape's near surface along −z from it]
  const SHAPES: [string, (r: Rig) => { hp: () => number }, number][] = [
    ['ヤドカリ wall (box, half depth 0.3)', (r) => ((w) => ({ hp: () => w.hp! }))(hermit(r, 1)), 0.3],
    [
      '巣核 (pod r 1.6)',
      (r) =>
        ((n) => ({ hp: () => n.hp! }))(
          addProp(r.sim, 'node', [0, 0, 0], 0, FOE_SIDE, { hp: 1000, r: 2.2, state: 1, data: { h: 4 } })
        ),
      1.6
    ],
    [
      'オオアゴ (body r 1.1)',
      (r) =>
        ((f) => {
          f.hp = f.maxHp = 1000
          f.state = 'move'
          return { hp: () => f.hp }
        })(spawnFoe(r.sim, 'oagos', [0, 0, 0], { passive: true })),
      1.1
    ]
  ]
  for (const [name, make, surface] of SHAPES) {
    it(`${name}: a 3 m blast reaches it from 2.8 m off its surface, not from 3.2 m`, () => {
      for (const off of [3.2, 2.8]) {
        const r = rig({ r: ['bee'] })
        r.step(3)
        r.player().p = [20, 0, 20]
        const t = make(r)
        r.step()
        const before = t.hp()
        blast(r.sim, [0, 1, -(surface + off)], 3, 50, 0, 'me', 'pillbug')
        if (off > 3) expect(t.hp(), `${name} from ${off} m`).toBe(before)
        else expect(t.hp(), `${name} from ${off} m`).toBeLessThan(before)
      }
    })
  }
})

describe('chains and big bodies obey the same sight rule', () => {
  it('a コロガシ chain does not detonate through a wall', () => {
    const r = rig({ r: ['bee'], map: wallMap({ min: [-8, 0, -0.3], max: [8, 5, 0.3] }) })
    r.step(3)
    r.player().p = [0, 0, 2.5]
    r.player().invulnUntil = 0
    const a = spawnFoe(r.sim, 'korogashi', [0, 0, -1], { passive: true })
    const b = spawnFoe(r.sim, 'korogashi', [0, 0, 1], { passive: true })
    a.state = b.state = 'move'
    r.step(2)
    killFoe(r.sim, a, 'me', false, 'bee')
    expect(b.dead).toBe(false)
    expect(r.player().anima).toBe(100)
  })

  it('in the open the chain still sets off its neighbour', () => {
    const r = rig({ r: ['bee'] })
    r.step(3)
    r.player().p = [20, 0, 20]
    const a = spawnFoe(r.sim, 'korogashi', [0, 0, -1], { passive: true })
    const b = spawnFoe(r.sim, 'korogashi', [0, 0, 1], { passive: true })
    a.state = b.state = 'move'
    r.step(2)
    killFoe(r.sim, a, 'me', false, 'bee')
    expect(b.dead).toBe(true)
  })

  it('a blast damages a ゴウテツ flank in its radius around narrow cover; a wide wall covers it entirely', () => {
    for (const wide of [false, true]) {
      const r = rig({
        r: ['bee'],
        map: wallMap(wide ? { min: [-20, 0, -0.3], max: [20, 20, 0.3] } : { min: [-0.5, 0, -0.3], max: [0.5, 20, 0.3] })
      })
      r.step(3)
      r.player().p = [15, 0, -15]
      const f = spawnFoe(r.sim, 'goutetsu', [0, 0, 7], { passive: true })
      f.state = 'move'
      f.hp = f.maxHp = 1000
      r.step()
      if (!wide) expect(r.sim.phys.clear([0, 1.3, -2.1], [2, 1, 2.42], 0)).toBe(true)
      blast(r.sim, [0, 1, -2.1], 5, 85, 0, 'me', 'hippo')
      if (wide) expect(f.hp).toBe(1000)
      else expect(f.hp).toBeLessThan(1000)
    }
  })
})

describe('no mover passes through solid terrain', () => {
  // Every foe kind (walkers, flyers, both bosses' movers) chasing a player behind a 20 m wall for 40 s.
  const KINDS: FoeKind[] = [
    'tsubute',
    'harigane',
    'oagos',
    'kagerou',
    'mitsume',
    'ashinaga',
    'korogashi',
    'tategami',
    'goutetsu'
  ]
  for (const kind of KINDS) {
    it(`${kind} never overlaps the wall`, { timeout: 30_000 }, () => {
      const r = rig({ r: ['bee'], map: wallMap({ min: [-30, 0, -0.5], max: [30, 20, 0.5] }) })
      r.step(2)
      const p = r.player()
      p.p = [0, 0, 30]
      p.invulnUntil = 100
      const f = spawnFoe(r.sim, kind, [0, kind === 'kagerou' || kind === 'mitsume' ? 5 : 0, -12], {})
      f.state = 'idle'
      let overlap = 0
      for (let i = 0; i < 2400; i++) {
        r.step()
        if (!f.dead && r.sim.phys.overlaps(f.p, f.r, f.h, FOE_SIDE)) overlap++
      }
      expect(overlap).toBe(0)
    })
  }

  it('flyers climb over a tall wall to reach their target instead of sticking to it', { timeout: 30_000 }, () => {
    const r = rig({ r: ['bee'], map: wallMap({ min: [-30, 0, -0.5], max: [30, 12, 0.5] }) })
    r.step(2)
    const p = r.player()
    p.p = [0, 0, 20]
    p.invulnUntil = 1000
    const f = spawnFoe(r.sim, 'kagerou', [0, 5, -12], {})
    f.state = 'idle'
    let crossed = false
    for (let i = 0; i < 60 * 30 && !crossed; i++) {
      r.step()
      crossed = f.p[2] > 1
    }
    expect(crossed).toBe(true)
  })

  it('a player dashing and hooking into a wall stays outside it', () => {
    const r = rig({ r: ['bee'], l: ['gecko'], map: wallMap({ min: [-8, 0, -0.3], max: [8, 6, 0.3] }) })
    r.step(2)
    const p = r.player()
    p.p = [0, 0, -3]
    aimAt(r, [0, 2, 5])
    r.press('L')
    r.input().mz = 1
    r.input().presses.dash++
    let overlap = 0
    for (let i = 0; i < 90; i++) {
      r.step()
      if (r.sim.phys.overlaps(p.p, p.r, p.h, p.side)) overlap++
    }
    expect(overlap).toBe(0)
    expect(p.p[2]).toBeLessThan(-0.3)
  })
})

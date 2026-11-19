/**
 * Boss parts against every damage source (DESIGN §11): ゴウテツ's legs take direct hits, beams, blasts and melee at
 * the contact point (area effects also reach the armoured hull), two broken legs make it kneel and expose the core,
 * クイツクシ's open core is a weak point for shots, beams and blasts; and a blast needs one point of a big body that
 * is both within its radius and in sight. The round-14 review's cases keep their numbers.
 */
import { describe, expect, it } from 'vitest'
import { areaHitFoe, blast, damageFoe } from '../src/sim/combat'
import { bossAreaParts, goutetsuLegs } from '../src/sim/foes/bosses'
import { spawnFoe } from '../src/sim/foes/index'
import type { Foe } from '../src/sim/state'
import { aimAt, rig } from './sim-helpers'
import { flatMap } from './sim-maps'

function make() {
  const r = rig({ r: ['bee'] })
  r.step(3)
  r.player().p = [15, 0, -15]
  const f = spawnFoe(r.sim, 'goutetsu', [0, 0, 0])
  f.state = 'idle'
  r.step()
  const leg = goutetsuLegs(f)[0]
  return { r, f, leg }
}

/** A ゴウテツ standing still at the origin, the player `weapon`-armed at `at`. */
function standing(weapon: Parameters<typeof rig>[0]['r'], at: number[]) {
  const r = rig({ r: weapon })
  r.step(3)
  r.player().p = [...at]
  const f = spawnFoe(r.sim, 'goutetsu', [0, 0, 0])
  f.state = 'idle'
  r.step()
  f.passive = true
  return { r, f, leg: goutetsuLegs(f)[0] }
}

describe('ゴウテツ legs take every kind of damage at the contact point', () => {
  it('direct damage at the leg reduces that leg (control)', () => {
    const { r, f, leg } = make()
    const hp = f.parts![0]
    damageFoe(r.sim, f, { amount: 85, kind: 'ranged', side: 0, by: 'me', at: [leg[0], 1, leg[2]], from: [15, 1, -15] })
    expect(f.parts![0]).toBeLessThan(hp)
  })

  it('an explosion directly at the leg reduces that leg (and the armoured hull)', () => {
    const { r, f, leg } = make()
    const hp = f.parts![0]
    const body = f.hp
    blast(r.sim, [leg[0], 1, leg[2]], 5, 85, 0, 'me', 'hippo')
    expect(f.parts![0]).toBeLessThan(hp)
    expect(f.hp).toBeLessThan(body)
  })

  it('a fired カバキャノン aimed at a leg reduces that leg', () => {
    const { r, f, leg } = standing(['hippo'], [0, 0, -12])
    const hp = f.parts![0]
    const bodyHp = f.hp
    aimAt(r, [leg[0], 1, leg[2]])
    r.press('R', 65)
    r.step(100)
    const impact = r.of('blast').find((e) => e.item === 'hippo')
    expect(impact).toBeDefined()
    expect(Math.hypot(impact!.at[0] - leg[0], impact!.at[2] - leg[2])).toBeLessThan(2.5)
    expect(f.hp).toBeLessThan(bodyHp)
    expect(f.parts![0]).toBeLessThan(hp)
  })

  it('a melee strike beside a leg reduces that leg', () => {
    const { r, f, leg } = standing(['mantis'], [0, 0, -10])
    const d = Math.hypot(leg[0] - f.p[0], leg[2] - f.p[2])
    r.player().p = [leg[0] + ((leg[0] - f.p[0]) / d) * 1.5, 0, leg[2] + ((leg[2] - f.p[2]) / d) * 1.5]
    aimAt(r, [leg[0], 1, leg[2]])
    const hp = f.parts![0]
    const bodyHp = f.hp
    r.press('R', 45)
    expect(f.hp).toBeLessThan(bodyHp)
    expect(f.parts![0]).toBeLessThan(hp)
  })

  // Every source against the nearest leg: [name, weapon, how to use it]
  const SOURCES: [string, 'bee' | 'eel' | 'claw' | 'hippo', number][] = [
    ['ミツバチ shots', 'bee', 60],
    ['デンキウナギ beam', 'eel', 60],
    ['ネコノツメ melee', 'claw', 60],
    ['カバキャノン blast', 'hippo', 65]
  ]
  for (const [name, weapon, hold] of SOURCES) {
    it(`${name} wear down the leg it is aimed at`, () => {
      const melee = weapon === 'claw'
      const { r, f, leg } = standing([weapon], [0, 0, -12])
      const d = Math.hypot(leg[0], leg[2])
      // melee from just outside the leg's side of the hull, the others from a distance
      const off = melee ? 5.6 : 12
      r.player().p = [(leg[0] / d) * off, 0, (leg[2] / d) * off]
      r.step(1)
      const hp = f.parts![0]
      aimAt(r, [leg[0], 1, leg[2]])
      r.press('R', hold)
      r.step(80)
      expect(f.parts![0], name).toBeLessThan(hp)
    })
  }

  it('breaking two legs with blasts makes it kneel with the core exposed', () => {
    const { r, f } = make()
    const legs = goutetsuLegs(f)
    for (let k = 0; k < 40 && f.state !== 'stagger'; k++) {
      blast(r.sim, [legs[0][0], 1, legs[0][2]], 3, 85, 0, 'me', 'hippo')
      blast(r.sim, [legs[1][0], 1, legs[1][2]], 3, 85, 0, 'me', 'hippo')
    }
    expect(f.parts!.filter((x) => x <= 0).length).toBeGreaterThanOrEqual(2)
    expect(f.state).toBe('stagger')
    // kneeling: a blast at the core's height counts as a weak-point hit
    const before = r.events.length
    blast(r.sim, [0, f.h * 0.5, -6], 3, 50, 0, 'me', 'hippo')
    r.step(1)
    expect(r.events.slice(before).some((e) => e.type === 'hit' && e.target === f.id && e.weak)).toBe(true)
  })
})

describe('クイツクシ open core is a weak point for shots, beams and blasts', () => {
  const open = (weapon: 'bee' | 'eel') => {
    const r = rig({ r: [weapon] })
    r.step(3)
    r.player().p = [0, 0, -14]
    const f: Foe = spawnFoe(r.sim, 'kuitsukushi', [0, 0, 0])
    f.state = 'idle'
    r.step()
    f.passive = true
    f.parts![0] = 1
    f.mem.coreClose = r.sim.time + 100
    return { r, f }
  }
  it('a blast at the core height', () => {
    const { r, f } = open('bee')
    blast(r.sim, [0, f.h * 0.8, -5], 3, 50, 0, 'me', 'hippo')
    r.step(1)
    expect(r.events.some((e) => e.type === 'hit' && e.target === f.id && e.weak)).toBe(true)
  })
  for (const weapon of ['bee', 'eel'] as const) {
    it(`${weapon} aimed at the core`, () => {
      const { r, f } = open(weapon)
      // high enough that the ray meets the hull above 0.6 × its height (the maw)
      aimAt(r, [0, f.h, 0])
      r.press('R', 40)
      r.step(20)
      expect(r.events.some((e) => e.type === 'hit' && e.target === f.id && e.weak)).toBe(true)
    })
  }
})

describe('a blast needs one point of a big body both in reach and in sight', () => {
  it('cannot hit a boss when every part within the blast radius is behind a wall', () => {
    const map = flatMap()
    map.boxes.push({ min: [-0.85, 0, -0.05], max: [0.85, 20, 0.05], kind: 'wall' })
    const r = rig({ r: ['bee'], map })
    r.step(3)
    r.player().p = [15, 0, -15]
    const f = spawnFoe(r.sim, 'goutetsu', [0, 0, 7.3])
    f.state = 'idle'
    r.step()
    f.passive = true
    f.p = [0, 0, 7.3]
    f.hp = f.maxHp = 1000
    r.step()
    // Explosion centre x/z = (0, −2.1), radius 5; boss circle centre (0, 7.3), radius 5. At z = −0.05 every line from
    // the explosion to a point of the boss within 5 m has |x| < 0.75: the wall covers it, though the far flanks show.
    blast(r.sim, [0, 1, -2.1], 5, 85, 0, 'me', 'hippo')
    expect(f.hp).toBe(1000)
  })

  it('with a narrower post, a flank point inside the radius is visible and takes it', () => {
    const map = flatMap()
    map.boxes.push({ min: [-0.5, 0, -0.3], max: [0.5, 20, 0.3], kind: 'wall' })
    const r = rig({ r: ['bee'], map })
    r.step(3)
    r.player().p = [15, 0, -15]
    const f = spawnFoe(r.sim, 'goutetsu', [0, 0, 7], { passive: true })
    f.state = 'move'
    f.hp = f.maxHp = 1000
    r.step()
    blast(r.sim, [0, 1, -2.1], 5, 85, 0, 'me', 'hippo')
    expect(f.hp).toBeLessThan(1000)
  })
})

describe('each ゴウテツ leg is its own blast target (round 15)', () => {
  const front = () => {
    const r = rig({ r: ['hippo'] })
    r.step(3)
    r.player().p = [15, 0, -15]
    const f = spawnFoe(r.sim, 'goutetsu', [0, 0, 0])
    f.state = 'idle'
    r.step()
    f.passive = true
    f.yaw = 0
    f.p = [0, 0, 0]
    return { r, f }
  }

  it('a cannon blast reaching both front legs damages those legs (and the hull), not the rear ones', () => {
    const { r, f } = front()
    const legs = goutetsuLegs(f)
    const at: [number, number, number] = [0, 1, -5.2]
    const before = [...f.parts!]
    const hp = f.hp
    expect(Math.hypot(at[0] - legs[0][0], at[2] - legs[0][2])).toBeLessThan(5)
    expect(Math.hypot(at[0] - legs[1][0], at[2] - legs[1][2])).toBeLessThan(5)
    blast(r.sim, at, 5, 85, 0, 'me', 'hippo')
    expect(f.parts![0]).toBeLessThan(before[0])
    expect(f.parts![1]).toBeLessThan(before[1])
    expect(f.parts![2]).toBe(before[2])
    expect(f.parts![3]).toBe(before[3])
    expect(f.hp).toBeLessThan(hp)
  })

  it('firing a real cannon at the front centre reaches the front legs', () => {
    const r = rig({ r: ['hippo'] })
    r.step(3)
    r.player().p = [0, 0, -12]
    const f = spawnFoe(r.sim, 'goutetsu', [0, 0, 0])
    f.state = 'idle'
    r.step()
    f.passive = true
    f.p = [0, 0, 0]
    f.yaw = 0
    const before = [...f.parts!]
    aimAt(r, [0, 1, 0])
    r.press('R', 65)
    r.step(100)
    expect(r.of('blast').find((e) => e.item === 'hippo')).toBeDefined()
    expect(f.parts![0]).toBeLessThan(before[0])
    expect(f.parts![1]).toBeLessThan(before[1])
  })

  it('a leg covered from the blast takes nothing while the uncovered one does', () => {
    const map = flatMap()
    // a post between the blast and the leg at (+3, −3) only
    map.boxes.push({ min: [0.3, 0, -4.6], max: [2.8, 8, -4.2], kind: 'wall' })
    const r = rig({ r: ['bee'], map })
    r.step(3)
    r.player().p = [15, 0, -15]
    const f = spawnFoe(r.sim, 'goutetsu', [0, 0, 0])
    f.state = 'idle'
    r.step()
    f.passive = true
    f.yaw = 0
    f.p = [0, 0, 0]
    const legs = goutetsuLegs(f)
    const at: [number, number, number] = [0, 1, -5.2]
    const covered = legs.findIndex((l) => l[0] > 0 && l[2] < 0)
    const open = legs.findIndex((l) => l[0] < 0 && l[2] < 0)
    const before = [...f.parts!]
    blast(r.sim, at, 5, 85, 0, 'me', 'hippo')
    expect(f.parts![covered]).toBe(before[covered])
    expect(f.parts![open]).toBeLessThan(before[open])
  })

  it('a melee sweep in reach of a leg and the hull hits both; a kneeling ゴウテツ has no legs to hit', () => {
    const { r, f } = front()
    const legs = goutetsuLegs(f)
    const before = [...f.parts!]
    const hp = f.hp
    areaHitFoe(r.sim, f, [legs[0][0], 1, legs[0][2] - 1.6], [legs[0][0], 1, legs[0][2] - 1.6], 2, 0, () => 40, {
      kind: 'melee',
      side: 0,
      by: 'me',
      from: [legs[0][0], 1, -6]
    })
    expect(f.parts![0]).toBeLessThan(before[0])
    expect(f.hp).toBeLessThan(hp)
    f.state = 'stagger'
    expect(bossAreaParts(f)).toEqual([])
  })
})

describe('a ゴウテツ that kneels mid-attack (round 16)', () => {
  /** One attack with the legs at `parts`: マンモス slam from the front, or a blast at the front centre. */
  function attack(parts: number[], how: 'slam' | 'blast') {
    const r = rig({ r: ['mammoth'] })
    r.step(3)
    const f = spawnFoe(r.sim, 'goutetsu', [0, 0, 0])
    f.state = 'idle'
    r.step()
    f.passive = true
    f.p = [0, 0, 0]
    f.yaw = 0
    f.parts = [...parts]
    const p = r.player()
    p.p = [0, 0, -1.6]
    p.yaw = 0
    r.input().yaw = 0
    const hp = f.hp
    if (how === 'slam') r.press('R', 45)
    else blast(r.sim, [0, 1, -5.2], 5, 85, 0, 'me', 'hippo')
    return { partsAfter: f.parts!, state: f.state, hpLost: hp - f.hp }
  }

  for (const how of ['slam', 'blast'] as const) {
    it(`${how}: breaking two legs at once hits the hull once; the remaining leg contacts are dropped, not turned into hull hits`, () => {
      const breaksTwo = attack([1, 1, 200, 200], how)
      const standing = attack([200, 200, 200, 200], how)
      expect(breaksTwo.state).toBe('stagger')
      expect(breaksTwo.partsAfter).toEqual([0, 0, 200, 200])
      const inReach = how === 'slam' ? standing.partsAfter : standing.partsAfter.slice(0, 2)
      expect(inReach.every((n) => n < 200)).toBe(true)
      expect(standing.hpLost).toBeGreaterThan(0)
      expect(breaksTwo.hpLost).toBeCloseTo(standing.hpLost, 5)
    })
  }
})

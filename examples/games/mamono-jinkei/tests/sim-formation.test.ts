import { describe, expect, test } from 'vitest'
import { hurtHero, normalAttack } from '../src/sim/combat'
import { spawnEnemy } from '../src/sim/enemies'
import { detectFormations } from '../src/sim/formation'
import { T, Pad, ctrlHero, customWorld, hero, place, run } from './sim-helpers'

const pts = (...xy: [number, number][]) => xy.map(([x, y], slot) => ({ slot, x, y }))

describe('formation detection (DESIGN §6)', () => {
  test('links ≤ 104 px form components of two or more', () => {
    expect(detectFormations(pts([0, 0], [104, 0]))).toEqual([{ slots: [0, 1], x: 52, y: 0 }])
    expect(detectFormations(pts([0, 0], [104.5, 0]))).toEqual([])
    expect(detectFormations(pts([0, 0]))).toEqual([])
    const two = detectFormations(pts([0, 0], [60, 0], [1000, 0], [1050, 0]))
    expect(two.map((f) => f.slots)).toEqual([
      [0, 1],
      [2, 3]
    ])
  })

  test('a square of four is 四方陣; a stretched chain is not a formation', () => {
    const sq = detectFormations(pts([0, 0], [80, 0], [0, 80], [80, 80]))
    expect(sq.length).toBe(1)
    expect(sq[0].slots).toEqual([0, 1, 2, 3])
    expect(sq[0].x).toBe(40)
    // Chain 0-100-200-300: linked, but the ends are 150 px from the centroid → still within (150 exactly).
    expect(detectFormations(pts([0, 0], [100, 0], [200, 0], [300, 0])).length).toBe(1)
    expect(detectFormations(pts([0, 0], [103, 0], [206, 0], [309, 0]))).toEqual([])
  })

  test('the world tags heroes, emits form events and applies multipliers', () => {
    const { world, W } = customWorld([
      '############',
      '#..........#',
      '#.@........#',
      '#..........#',
      '#..........#',
      '############'
    ])
    const pad = new Pad(world)
    pad.mode()
    run(world, 0.05)
    const me = ctrlHero(W)
    const others = W.heroes.filter((h) => h !== me)
    others.forEach((h, i) => place(h, T(8 + i), T(4)))
    others.forEach((h) => (h.anchor = { x: h.body.x, y: h.body.y }))
    place(me, T(2), T(2))
    run(world, 0.1)
    // 8,9,10 in a row: 64 px links → 三角陣 of the companions; the controlled hero is alone.
    expect(W.formations.map((f) => f.slots)).toEqual([[1, 2, 3]])
    expect(me.form).toBe(-1)
    // Damage taken × (1 − 0.1·(n−1)): 3 → 2 in a trio, 3 alone.
    const a = hero(W, 1)
    const hp = a.hp
    hurtHero(W, a, 3, a.body.x, a.body.y - 10)
    expect(hp - a.hp).toBe(2)
    me.hp = 10
    hurtHero(W, me, 3, me.body.x, me.body.y - 10)
    expect(10 - me.hp).toBe(3)
    // Join: four.
    place(me, T(9), T(3))
    run(world, 0.1)
    expect(W.formations[0].slots).toEqual([0, 1, 2, 3])
    const v = world.view()
    expect(v.events.some((e) => e.k === 'form' && e.a === 4)).toBe(true)
    expect(v.events.some((e) => e.k === 'banner' && e.s === '四方陣！')).toBe(true)
    expect(v.formations[0].slots).toEqual([0, 1, 2, 3])
    expect(v.heroes.every((h) => h.form === 0)).toBe(true)
    // Attack × (1 + 0.3·3) = 1.9.
    const e = spawnEnemy(W, 'rookie', me.body.x + 40, me.body.y)
    e.hp = 100
    me.atkReady = 0
    normalAttack(W, me, 0)
    expect(100 - e.hp).toBeCloseTo(2 * 1.9)
  })
})

import { describe, expect, test } from 'vitest'
import { ENEMIES, WEAPONS } from '../src/data'
import {
  Effects,
  FxFeed,
  GAMBLE_SPRITE_LIFE,
  ParticlePool,
  PK,
  Trauma,
  gambleTiming,
  shade,
  type FxView
} from '../src/effects'
import { FX, FX_STRIDE } from '../src/fx'

const view: FxView = { local: 0, px: 0, py: 0, cx: 0, cy: 0, hw: 640, hh: 360 }
const ev = (seq: number, type: number, x = 0, y = 0, a = 0, b = 0) => [seq, type, x, y, a, b]

describe('FxFeed', () => {
  test('hands out every event exactly once, oldest first', () => {
    const feed = new FxFeed()
    const first = [...ev(1, FX.HIT), ...ev(2, FX.KILL)]
    expect(feed.take(first)).toEqual([0, FX_STRIDE])
    expect(feed.take(first)).toEqual([])
    // The window slides: seq 2 is still listed, 3 is new.
    expect(feed.take([...ev(2, FX.KILL), ...ev(3, FX.HIT)])).toEqual([FX_STRIDE])
    expect(feed.take([])).toEqual([])
  })

  test('a sequence that goes backwards (a new game) starts over', () => {
    const feed = new FxFeed()
    feed.take([...ev(40, FX.HIT), ...ev(41, FX.HIT)])
    expect(feed.take(ev(1, FX.HIT))).toEqual([0])
    expect(feed.take(ev(1, FX.HIT))).toEqual([])
  })

  test('a game clock that jumps back also resets the feed', () => {
    const feed = new FxFeed()
    feed.take(ev(5, FX.HIT), 100)
    expect(feed.take(ev(5, FX.HIT), 100)).toEqual([])
    expect(feed.take(ev(5, FX.HIT), 0)).toEqual([0])
  })
})

describe('Trauma', () => {
  test('shake is the square of trauma and drains to zero', () => {
    const t = new Trauma(1)
    t.add(0.5)
    expect(t.shake).toBeCloseTo(0.25)
    t.update(0.25)
    expect(t.value).toBeCloseTo(0.25)
    t.update(10)
    expect(t.value).toBe(0)
    expect(t.shake).toBe(0)
  })

  test('saturates at 1 and atLeast does not stack', () => {
    const t = new Trauma()
    t.add(0.8)
    t.add(0.8)
    expect(t.value).toBe(1)
    const u = new Trauma()
    u.atLeast(0.2)
    u.atLeast(0.2)
    expect(u.value).toBe(0.2)
  })
})

describe('ParticlePool', () => {
  test('recycles finished particles and never exceeds its cap', () => {
    const pool = new ParticlePool(3)
    for (let i = 0; i < 5; i++) pool.spawn(PK.debris, 0, 0, 0.5)
    expect(pool.live).toBe(3)
    expect(pool.spawn(PK.ring, 0, 0, 1)).toBeUndefined()
    // An important particle evicts the oldest debris instead.
    expect(pool.spawn(PK.ring, 0, 0, 1, true)).toBeDefined()
    expect(pool.live).toBe(3)
    pool.update(0.6)
    expect(pool.live).toBe(1)
    pool.update(1)
    expect(pool.live).toBe(0)
  })

  test('delayed particles wait before they age', () => {
    const pool = new ParticlePool()
    const p = pool.spawn(PK.sprite, 0, 0, 0.2)!
    p.delay = 0.3
    pool.update(0.25)
    expect(p.age).toBe(0)
    pool.update(0.1)
    expect(p.delay).toBeLessThanOrEqual(0)
    pool.update(0.1)
    expect(p.age).toBeGreaterThan(0)
  })
})

describe('Effects', () => {
  test('repeated savings blasts do not stack shake or weaken stronger effects', () => {
    const fx = new Effects(() => 0.5)
    const savings = WEAPONS.findIndex((weapon) => weapon.id === 'w_savings')
    for (let seq = 1; seq <= 20; seq++) fx.consume(ev(seq, FX.BLAST, 0, 0, 100, savings), 1, view)
    expect(fx.trauma.value).toBeCloseTo(0.22)
    fx.trauma.add(0.4)
    fx.consume(ev(21, FX.BLAST, 0, 0, 100, savings), 1, view)
    expect(fx.trauma.value).toBeCloseTo(0.62)
  })

  test('a kill pops the enemy, puffs and throws debris in its colour; a repeated snapshot adds nothing', () => {
    const fx = new Effects(() => 0.5)
    const index = ENEMIES.findIndex((e) => e.id === 'overwork')
    const list = ev(1, FX.KILL, 10, 10, index, 0)
    expect(fx.consume(list, 1, view)).toBe(1)
    const kinds = fx.pool.items.map((p) => p.kind)
    expect(kinds).toContain(PK.pop)
    expect(kinds).toContain(PK.sprite)
    expect(kinds.filter((k) => k === PK.debris).length).toBeGreaterThanOrEqual(6)
    const live = fx.pool.live
    expect(fx.consume(list, 1, view)).toBe(0)
    expect(fx.pool.live).toBe(live)
  })

  test('shake and flashes follow who got hurt, and respect reduced motion', () => {
    const fx = new Effects(() => 0.5)
    fx.consume(ev(1, FX.HURT, 0, 0, 1, 10), 1, view)
    expect(fx.trauma.value).toBe(0)
    expect(fx.flashes).toHaveLength(0)
    fx.consume(ev(2, FX.HURT, 0, 0, 0, 10), 1, view)
    expect(fx.trauma.value).toBeGreaterThan(0)
    expect(fx.flashes.map((f) => f.kind)).toEqual(['edge'])
    const calm = new Effects(() => 0.5)
    calm.motion = 0.25
    calm.consume(
      ev(
        1,
        FX.BOSS_KILL,
        0,
        0,
        ENEMIES.findIndex((e) => e.behavior === 'boss')
      ),
      1,
      view
    )
    expect(calm.trauma.value).toBe(1)
    const off = { x: 0, y: 0 }
    calm.shakeOffset(off)
    const loud = new Effects(() => 1)
    loud.trauma.add(1)
    const big = loud.shakeOffset({ x: 0, y: 0 })
    expect(Math.abs(off.x)).toBeLessThan(Math.abs(big.x))
    expect(calm.flashes[0].alpha).toBeLessThan(0.6)
  })

  test('every fx type is handled without throwing, and the pool stays capped', () => {
    const fx = new Effects()
    let seq = 1
    for (let round = 0; round < 40; round++)
      for (let type = 0; type <= FX.ELITE; type++)
        fx.consume(ev(seq++, type, round * 3, round * 2, round % ENEMIES.length, round % 4), round, view)
    expect(fx.pool.live).toBeLessThanOrEqual(fx.pool.cap)
    for (let i = 0; i < 400; i++) fx.update(0.016)
    expect(fx.pool.live).toBe(0)
  })

  test('far-away events are skipped', () => {
    const fx = new Effects()
    fx.consume(ev(1, FX.KILL, 9000, 9000, 0, 0), 1, view)
    expect(fx.pool.live).toBe(0)
  })
})

describe('shade', () => {
  test('lightens toward white and darkens toward black', () => {
    expect(shade('#808080', 1)).toBe('#ffffff')
    expect(shade('#808080', -1)).toBe('#000000')
    expect(shade('#ff0000', 0)).toBe('#ff0000')
  })
})

describe('gambleTiming', () => {
  test('plays the reels in the first 60 % and holds the result frame opaque', () => {
    expect(gambleTiming('gamble_gacha', 0, 6).frame).toBe(0)
    expect(gambleTiming('gamble_gacha', 0.49, 6).frame).toBe(4)
    expect(gambleTiming('gamble_gacha', 0.5, 6).frame).toBe(5)
    expect(gambleTiming('gamble_gacha', 0.99, 6).frame).toBe(5)
    expect(gambleTiming('gamble_gacha', 0.79, 6).alpha).toBe(1)
    expect(gambleTiming('gamble_gacha', 0.9, 6).alpha).toBeCloseTo(0.5)
    expect(gambleTiming('gamble_gacha', 1, 6).alpha).toBe(0)
    // The result frame is fully opaque for 0.3 s or more.
    expect((0.8 - 0.5) * GAMBLE_SPRITE_LIFE).toBeGreaterThanOrEqual(0.4)
  })

  test('pachinko and horse labels wait for their frame; the others show at once', () => {
    expect(gambleTiming('gamble_pachinko', 0.49, 6).label).toBe(false)
    expect(gambleTiming('gamble_pachinko', 0.5, 6)).toMatchObject({ label: true, frame: 5 })
    expect(gambleTiming('gamble_horse', 0.39, 6).label).toBe(false)
    expect(gambleTiming('gamble_horse', 0.4, 6)).toMatchObject({ label: true, frame: 4 })
    expect(gambleTiming('gamble_gacha', 0, 6).label).toBe(true)
    expect(gambleTiming('gamble_poker', 0, 6).label).toBe(true)
  })
})

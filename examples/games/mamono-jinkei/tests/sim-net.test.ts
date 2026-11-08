import { describe, expect, test } from 'vitest'
import { createPredictor, stageInfo } from '../src/sim/api'
import { hurtHero } from '../src/sim/combat'
import { spawnEnemy } from '../src/sim/enemies'
import { DT } from '../src/sim/tables'
import { T, Pad, ctrlHero, customWorld, meadowWorld, place, run } from './sim-helpers'

const map = [
  '####################',
  '#..................#',
  '#.@................#',
  '#..................#',
  '#.....#............#',
  '#..................#',
  '####################'
]

/** One host world, one guest predicting its hero and reporting every frame. */
function session() {
  const { world, W } = customWorld(map, {}, ['host', 'guest'])
  const guest = new Pad(world, 'guest')
  const pred = createPredictor(W.parsed!.info, 'guest')
  const tick = (seconds: number, mx: number, my: number) => {
    const n = Math.round(seconds / DT)
    for (let i = 0; i < n; i++) {
      guest.state.mx = mx
      guest.state.my = my
      const report = pred.update(world.view(), guest.state, DT)
      guest.send({ hero: report })
      world.step(DT)
    }
  }
  return { world, W, guest, pred, tick }
}

describe('guest prediction (DESIGN §13)', () => {
  test('the host accepts plausible reports and the two copies agree', () => {
    const { W, pred, tick } = session()
    const h = ctrlHero(W, 'guest')
    tick(0.5, 0, 0)
    const x0 = pred.current()!.x
    tick(1.5, 1, 0)
    const p = pred.current()!
    expect(p.slot).toBe(h.slot)
    expect(p.x).toBeGreaterThan(x0 + 150)
    expect(Math.hypot(p.x - h.body.x, p.y - h.body.y)).toBeLessThan(8)
    expect(h.accepted).toBeDefined()
    // Walls block the prediction exactly like the host.
    tick(3, 0, 1)
    expect(pred.current()!.y).toBeLessThan(T(5) + 32 - 15)
  })

  test('an implausible report is refused with a warp force, which the predictor applies', () => {
    const { world, W, guest, pred, tick } = session()
    const h = ctrlHero(W, 'guest')
    tick(0.5, 0, 0)
    const seq = h.forceSeq
    const hostX = h.body.x
    guest.send({
      hero: {
        slot: h.slot,
        x: h.body.x + 600,
        y: h.body.y,
        z: 0,
        vx: 0,
        vy: 0,
        facing: 0,
        forceSeq: seq,
        airborne: false
      }
    })
    world.step(DT)
    expect(h.forceSeq).toBe(seq + 1)
    expect(h.body.x).toBeCloseTo(hostX, 0)
    const v = world.view().heroes.find((q) => q.slot === h.slot)!
    expect(v.force).toMatchObject({ seq: seq + 1, kind: 'warp' })
    // A report inside a wall is refused too.
    guest.send({
      hero: { slot: h.slot, x: T(6), y: T(4), z: 0, vx: 0, vy: 0, facing: 0, forceSeq: seq + 1, airborne: false }
    })
    world.step(DT)
    expect(h.forceSeq).toBe(seq + 2)
    // The predictor picks the warp up and reports the new sequence.
    tick(0.1, 0, 0)
    expect(pred.update(world.view(), guest.state, DT)?.forceSeq).toBe(h.forceSeq)
    expect(Math.abs(pred.current()!.x - h.body.x)).toBeLessThan(4)
  })

  test('knockback reaches the guest as an impulse; the speed multiplier while charging', () => {
    const { world, W, guest, pred, tick } = session()
    const h = ctrlHero(W, 'guest')
    tick(0.3, 0, 0)
    const x0 = pred.current()!.x
    hurtHero(W, h, 1, h.body.x - 30, h.body.y)
    expect(world.view().heroes.find((q) => q.slot === h.slot)?.force?.kind).toBe('impulse')
    tick(0.5, 0, 0)
    expect(pred.current()!.x).toBeGreaterThan(x0 + 10)
    guest.state.attackPresses++
    guest.state.attackHeld = true
    tick(0.4, 0, 0)
    expect(world.view().heroes.find((q) => q.slot === h.slot)?.speed).toBe(0.55)
  })
})

describe('snapshot size', () => {
  test('a busy stage-1 view stays well under 64 KiB', () => {
    const { world, W } = meadowWorld(['a', 'b', 'c', 'd', 'e'])
    const pads = W.humans.map((h) => new Pad(world, h.id))
    const me = W.heroes[0]
    for (let i = 0; i < 30; i++)
      spawnEnemy(
        W,
        i % 2 ? 'bowman' : 'rookie',
        me.body.x + 200 + (i % 6) * 40,
        me.body.y - 120 + Math.floor(i / 6) * 40
      )
    run(world, 4, () => {
      for (const p of pads) {
        p.aim(0)
        if (W.seq % 7 === 0) p.tap()
        p.move(Math.sin(W.t), Math.cos(W.t * 0.7))
      }
    })
    const v = world.view()
    const json = JSON.stringify(v)
    expect(v.events.length).toBeLessThanOrEqual(60)
    expect(v.enemies.length).toBeGreaterThan(10)
    expect(json.length).toBeLessThan(48 * 1024)
    for (let i = 1; i < v.events.length; i++) expect(v.events[i].id).toBeGreaterThan(v.events[i - 1].id)
    expect(JSON.parse(json)).toEqual(v)
    expect(stageInfo('meadow').w * stageInfo('meadow').h).toBe(stageInfo('meadow').tiles.length)
    void place
  })
})

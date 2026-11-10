/**
 * Slime hop assist (DESIGN §7): a hop started anywhere from where the 「Space ジャンプ」 hint shows up to the edge
 * clears a one-tile gap (stage 1's broken bridge), for the host and for a guest's prediction alike; two-tile gaps
 * stay out of reach.
 */
import { describe, expect, test } from 'vitest'
import { createPredictor } from '../src/sim/api'
import { DT } from '../src/sim/tables'
import type { WorldImpl } from '../src/sim/world'
import type { Hero } from '../src/sim/state'
import { nearGap } from '../src/ui/hints'
import { TILE } from '../src/vocab'
import { T, Pad, ctrlHero, customWorld, meadowWorld, parkCompanions, place, run } from './sim-helpers'

/** Stage 1 room A: the broken bridge `=~=` on row 57, water on tile 28; walking stops at the edge (centre x). */
const BRIDGE_Y = T(57)
const EDGE = 28 * TILE - 16

/** Runs right from tile 23 at full speed and presses Space `before` px short of `edge`; follows for 1.2 s. */
function runAndHop(
  world: WorldImpl,
  me: Hero,
  step: (jump: boolean) => void,
  edge: number,
  before: number
): { takeoff: number; fell: boolean; hp: number; maxX: number } {
  const hp = me.hp
  let takeoff = -1
  let fell = false
  let maxX = me.body.x
  for (let i = 0; i < 6 * 60 && takeoff < 0; i++) {
    const jump = me.body.x >= edge - before
    if (jump) takeoff = me.body.x
    step(jump)
    if (me.state === 'fall') fell = true
    maxX = Math.max(maxX, me.body.x)
  }
  for (let i = 0; i < 1.2 * 60; i++) {
    step(false)
    if (me.state === 'fall') fell = true
    maxX = Math.max(maxX, me.body.x)
  }
  return { takeoff, fell, hp: hp - me.hp, maxX }
}

function hostRun(before: number) {
  const { world, W } = meadowWorld()
  const pad = new Pad(world)
  parkCompanions(world, W, pad, [
    [20, 55],
    [21, 55],
    [22, 55]
  ])
  const me = ctrlHero(W)
  place(me, T(23), BRIDGE_Y)
  pad.move(1, 0)
  const r = runAndHop(
    world,
    me,
    (jump) => {
      if (jump) pad.jump()
      world.step(DT)
    },
    EDGE,
    before
  )
  return { ...r, me }
}

describe('slime hop over the broken bridge (stage 1 room A)', () => {
  test('the 「Space ジャンプ」 hint shows up about 78 px before the edge', () => {
    const { W } = meadowWorld()
    let x = T(23)
    while (!nearGap(W.parsed!.info, { x, y: BRIDGE_Y } as Parameters<typeof nearGap>[1])) x++
    expect(EDGE - x).toBeGreaterThan(70)
    expect(EDGE - x).toBeLessThanOrEqual(80)
  })

  // 80 px: from where the hint appears (the water tiles beside the bridge come within 1.4 tiles) to the edge.
  for (const before of [80, 60, 40, 24, 4])
    test(`running at full speed, a hop ${before} px before the edge clears the gap`, () => {
      const { takeoff, fell, hp, me } = hostRun(before)
      expect(takeoff).toBeGreaterThan(EDGE - before - 4)
      expect(fell).toBe(false)
      expect(hp).toBe(0)
      expect(me.body.x).toBeGreaterThanOrEqual(29 * TILE)
      expect(Math.abs(me.body.y - BRIDGE_Y)).toBeLessThan(4)
    })

  test('a guest predicting its slime crosses the same way (same stepBody), and the host accepts it', () => {
    const { world, W } = meadowWorld(['host', 'guest'])
    const host = new Pad(world)
    parkCompanions(world, W, host, [
      [20, 55],
      [21, 55]
    ])
    const guest = new Pad(world, 'guest')
    const me = ctrlHero(W, 'guest')
    place(me, T(23), BRIDGE_Y)
    const pred = createPredictor(W.parsed!.info, 'guest')
    guest.state.mx = 1
    let predFell = false
    const r = runAndHop(
      world,
      me,
      (jump) => {
        if (jump) guest.state.actionPresses++
        const report = pred.update(world.view(), guest.state, DT)
        if (report && !report.airborne && Math.floor(report.x / TILE) === 28) predFell = true
        guest.send({ hero: report })
        world.step(DT)
      },
      EDGE,
      50
    )
    expect(r.fell).toBe(false)
    expect(predFell).toBe(false)
    expect(r.hp).toBe(0)
    expect(pred.current()!.x).toBeGreaterThanOrEqual(29 * TILE)
    expect(me.body.x).toBeGreaterThanOrEqual(29 * TILE)
    expect(me.accepted).toBeDefined()
  })
})

describe('two-tile gaps stay out of a hop’s reach', () => {
  // Stage 1 room F: the two-tile moat (tiles 62–63) is crossed with the bounce mushrooms, never by a hop.
  for (const before of [0, 30, 60])
    test(`the room F moat: a hop ${before} px before the edge does not cross`, () => {
      const { world, W } = meadowWorld()
      const pad = new Pad(world)
      parkCompanions(world, W, pad, [
        [56, 37],
        [57, 37],
        [58, 37]
      ])
      const me = ctrlHero(W)
      place(me, T(56), T(35))
      pad.move(1, 0)
      const r = runAndHop(
        world,
        me,
        (jump) => {
          if (jump) pad.jump()
          world.step(DT)
        },
        62 * TILE - 16,
        before
      )
      // Short of the far side: into the water, or (from further back) back onto the near bank.
      expect(r.fell || me.body.x < 62 * TILE).toBe(true)
      if (before <= 30) expect(r.fell).toBe(true)
      expect(r.maxX).toBeLessThan(64 * TILE)
    })

  test('a custom two-tile channel cannot be hopped from the edge, a one-tile one can', () => {
    const map = [
      '##############',
      '#......~.....#',
      '#.@....~.....#',
      '#......~~....#',
      '#............#',
      '##############'
    ]
    const hop = (row: number) => {
      const { world, W } = customWorld(map)
      const pad = new Pad(world)
      parkCompanions(world, W, pad, [
        [1, 4],
        [2, 4],
        [3, 4]
      ])
      const me = ctrlHero(W)
      place(me, T(4), T(row))
      pad.move(1, 0)
      let fell = false
      run(world, 1.2, () => {
        if (me.state === 'fall') fell = true
      })
      expect(me.body.x).toBeCloseTo(7 * TILE - 16, 0)
      pad.jump()
      run(world, 1.2, () => {
        if (me.state === 'fall') fell = true
      })
      return { fell, x: me.body.x }
    }
    expect(hop(2).fell).toBe(false)
    expect(hop(2).x).toBeGreaterThan(8 * TILE)
    expect(hop(3).fell).toBe(true)
  })
})

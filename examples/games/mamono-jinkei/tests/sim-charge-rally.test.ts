import { describe, expect, test } from 'vitest'
import { createWorld } from '../src/sim/api'
import { CHARGE } from '../src/sim/tables'
import type { WorldImpl } from '../src/sim/world'
import { STAGE_DATA } from '../src/stages'
import { TILE, type StageId } from '../src/vocab'
import { Pad, ctrlHero, place, run, until } from './sim-helpers'

/** The stage's boss fight, just started. */
function bossFight(stage: StageId) {
  const world = createWorld({ seed: 5, progress: { cleared: [] }, stage, skipIntro: true }) as WorldImpl
  world.setPlayers([{ id: 'host', name: 'host' }])
  const W = world.W
  const room = STAGE_DATA[stage]!.rooms.find((r) => r.boss)!
  world.command('host', { type: 'warp', to: room.id })
  expect(until(world, () => !!W.boss?.active, 2)).toBe(true)
  return { world, W }
}

/**
 * Repeats: the human stands 3 tiles off the boss while its companions fight at the boss's sides (placed on three
 * sides), then holds a charge to full power (0.9 s). Returns how many tries started with the companions engaged and
 * how many charges came to full power inside a formation of 3+.
 */
function chargeTries(stage: StageId, tries: number) {
  const { world, W } = bossFight(stage)
  const pad = new Pad(world)
  const me = ctrlHero(W)
  const boss = W.boss!
  const g = W.grid!
  const open = (x: number, y: number) => {
    const i = g.idx(Math.floor(x / TILE), Math.floor(y / TILE))
    return (
      g.free(Math.floor(x / TILE), Math.floor(y / TILE)) && !g.flowX[i] && !g.flowY[i] && !g.overlaps(x, y, 17, false)
    )
  }
  // Keep the test about positioning: nobody goes down.
  const guard = () => {
    for (const h of W.heroes) h.hp = h.maxHp
  }
  const settle = () => {
    while (me.chargeLock > W.t || W.techs.length || me.state === 'tech') run(world, 1 / 60, guard)
  }
  let engaged = 0
  let formed = 0
  for (let k = 0; k < tries; k++) {
    settle()
    for (const a of [Math.PI / 2, -Math.PI / 2, 0, Math.PI].map((q) => q + k * 0.4)) {
      const x = boss.x + Math.cos(a) * (boss.r + 3 * TILE)
      const y = boss.y + Math.sin(a) * (boss.r + 3 * TILE)
      if (!open(x, y)) continue
      place(me, x, y)
      break
    }
    W.heroes
      .filter((h) => h !== me)
      .forEach((h, i) => {
        for (const off of [0, 0.4, -0.4, 0.8, -0.8]) {
          const a = Math.atan2(boss.y - me.body.y, boss.x - me.body.x) + ((i - 1) * Math.PI) / 2 + off
          const x = boss.x + Math.cos(a) * (boss.r + 40)
          const y = boss.y + Math.sin(a) * (boss.r + 40)
          if (!open(x, y)) continue
          place(h, x, y)
          break
        }
      })
    // The human swings at the air in place; the companions fight next to the boss meanwhile.
    pad.move(0, 0)
    run(world, 1.5, () => {
      guard()
      pad.aim(Math.atan2(boss.y - me.body.y, boss.x - me.body.x))
      if (W.seq % 15 === 0) pad.tap()
    })
    settle()
    // Engaged: at least two companions out of formation reach (with the boss, not with the human) at the press.
    const away = W.heroes.filter((h) => h !== me && Math.hypot(h.body.x - me.body.x, h.body.y - me.body.y) > 150)
    if (away.length >= 2) engaged++
    pad.attack()
    expect(
      until(world, () => me.chargeFull, CHARGE.full + 0.2, guard),
      `${stage} try ${k}`
    ).toBe(true)
    run(world, 1 / 60, guard)
    if (me.form >= 0 && W.formations[me.form].slots.length >= 3) formed++
    pad.release()
    run(world, 0.5, guard)
  }
  return { engaged, formed }
}

describe('companions regroup while the human charges', () => {
  test.each(['meadow', 'sewer', 'tower', 'forest'] as StageId[])(
    '%s boss room: companions fighting at the boss join a formation of 3+ by the time a charge is full',
    (stage) => {
      const r = chargeTries(stage, 8)
      expect(r.engaged).toBeGreaterThanOrEqual(6)
      expect(r.formed).toBeGreaterThanOrEqual(6)
    }
  )
})

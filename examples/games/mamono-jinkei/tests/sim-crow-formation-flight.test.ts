/**
 * Crow formation flight (DESIGN §4/§7): following companions take off with their flying owner, keep its speed and
 * catch up when lagging, so the formation of 3+ holds over stage 3's windy sea of clouds (「陣形なら風に負けない」).
 */
import { describe, expect, test } from 'vitest'
import { createWorld } from '../src/sim/api'
import { DT } from '../src/sim/tables'
import type { WorldImpl } from '../src/sim/world'
import { TILE } from '../src/vocab'
import { T, Pad, ctrlHero, place, run, until } from './sim-helpers'

function towerParty(behind: number) {
  const world = createWorld({
    seed: 13,
    progress: { cleared: ['meadow', 'sewer'] },
    stage: 'tower',
    skipIntro: true
  }) as WorldImpl
  world.setPlayers([{ id: 'host', name: 'host' }])
  const W = world.W
  const pad = new Pad(world)
  const me = ctrlHero(W)
  // Room B: the vent row (56) over the wind zone x 42–49 that blows south toward the open sea of clouds.
  place(me, T(41), T(56))
  W.heroes.filter((h) => h !== me).forEach((h, i) => place(h, T(41) - 36 - behind, T(55) + i * 32))
  run(world, 0.3)
  return { world, W, pad, me }
}

/** Flies the owner straight east from tile 41 to tile 51 across the wind; returns formation and drift samples. */
function crossWind(world: WorldImpl, pad: Pad, me: ReturnType<typeof ctrlHero>, W: WorldImpl['W']) {
  pad.state.actionHeld = true
  let frames = 0
  let inForm = 0
  let drift = 0
  let fell = false
  for (let i = 0; i < 5 * 60; i++) {
    if (me.body.x >= T(51) - 14) break
    pad.move(1, 0)
    world.step(DT)
    if (W.heroes.some((h) => h.state === 'fall')) fell = true
    if (me.body.x < 42 * TILE || me.body.x >= 50 * TILE) continue
    frames++
    if (me.form >= 0 && W.formations[me.form].slots.length >= 3) inForm++
    drift = Math.max(drift, Math.abs(me.body.y - T(56)))
  }
  pad.state.actionHeld = false
  pad.move(0, 0)
  return { frames, share: inForm / Math.max(1, frames), drift, fell }
}

describe('crow formation flight over the wind (stage 3 room B)', () => {
  test('companions take off with the owner and the formation of 4 holds across the windy vent crossing', () => {
    const { world, W, pad, me } = towerParty(0)
    const r = crossWind(world, pad, me, W)
    expect(r.frames).toBeGreaterThan(60)
    expect(r.share).toBeGreaterThan(0.9)
    expect(r.drift).toBeLessThan(16)
    expect(r.fell).toBe(false)
    // Everyone lands on the far island.
    expect(
      until(world, () => W.heroes.every((h) => h.body.z === 0 && h.body.x > 50 * TILE && h.state !== 'fall'), 6)
    ).toBe(true)
  })

  test('companions lagging two tiles behind catch up in the air before the wind and keep the formation', () => {
    const { world, W, pad, me } = towerParty(2 * TILE)
    const r = crossWind(world, pad, me, W)
    expect(r.share).toBeGreaterThan(0.75)
    expect(r.drift).toBeLessThan(TILE / 2)
    expect(r.fell).toBe(false)
    expect(
      until(world, () => W.heroes.every((h) => h.body.z === 0 && h.body.x > 50 * TILE && h.state !== 'fall'), 6)
    ).toBe(true)
  })
})

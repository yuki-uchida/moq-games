import { describe, expect, test } from 'vitest'
import { createWorld } from '../src/sim/api'
import type { Hero } from '../src/sim/state'
import type { WorldImpl } from '../src/sim/world'
import { TILE } from '../src/vocab'
import { Pad, T, ctrlHero, place, run, until } from './sim-helpers'

// Stage 2 room B 「流れる水路」: the channel runs along rows 56–58 between the start bank (59+) and the far bank (≤ 55).
const NEAR = 59
const FAR = 55

/** The sewer with the party on room B's start bank at column x; `followers` companions follow, the rest wait in A. */
function atChannel(x: number, followers: number) {
  const world = createWorld({
    seed: 5,
    progress: { cleared: ['meadow'] },
    stage: 'sewer',
    skipIntro: true
  }) as WorldImpl
  world.setPlayers([{ id: 'host', name: 'host' }])
  const W = world.W
  run(world, 0.1)
  const me = ctrlHero(W)
  const others = W.heroes.filter((h) => h !== me)
  place(me, T(x), T(NEAR + 1))
  others.forEach((h, i) => place(h, T(x) + (i - 1) * 40, T(NEAR + 2)))
  run(world, 0.8)
  // Companions beyond `followers` are left waiting on the start bank (stay mode, they keep their spot).
  for (const h of others.slice(followers)) {
    place(h, T(40 + others.indexOf(h) * 2), T(62))
    h.owner = '' // ownerless companions hold their position
  }
  run(world, 0.8)
  return { world, W, me }
}

/** Walks straight north (no steering) for `seconds`; returns the northmost tile row reached and whether anyone fell. */
function walkNorth(world: WorldImpl, me: Hero, seconds: number, falls: { n: number }) {
  const pad = new Pad(world)
  let top = Infinity
  run(world, seconds, () => {
    pad.move(0, -1)
    top = Math.min(top, Math.floor(me.body.y / TILE))
    if (me.state === 'fall') falls.n++
  })
  return top
}

describe('stage 2: the current of room B needs a formation', () => {
  test.each([37, 44, 52, 60])('a lone rat walking straight across from column %i is swept back', (x) => {
    const { world, me } = atChannel(x, 0)
    const falls = { n: 0 }
    const top = walkNorth(world, me, 6, falls)
    expect(top).toBeGreaterThan(FAR)
  })

  test.each([37, 52])('a pair walking across from column %i is swept back too', (x) => {
    const { world, W, me } = atChannel(x, 1)
    expect(W.formations.find((f) => f.slots.includes(me.slot))?.slots.length).toBe(2)
    const top = walkNorth(world, me, 6, { n: 0 })
    expect(top).toBeGreaterThan(FAR)
  })

  test.each([
    [3, 44],
    [3, 55],
    [4, 40],
    [4, 60]
  ])('a formation of %i walking across from column %i reaches the far bank', (n, x) => {
    const { world, W, me } = atChannel(x, n - 1)
    expect(W.formations.find((f) => f.slots.includes(me.slot))?.slots.length).toBe(n)
    const pad = new Pad(world)
    const party = W.heroes.filter((h) => h === me || h.owner === 'host')
    let fell = false
    const ok = until(
      world,
      () => party.every((h) => h.body.y < T(FAR) + 20),
      8,
      () => {
        pad.move(0, me.body.y > T(FAR - 1) ? -1 : 0)
        if (party.some((h) => h.state === 'fall')) fell = true
      }
    )
    expect(ok).toBe(true)
    expect(fell).toBe(false)
  })
})

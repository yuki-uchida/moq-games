/**
 * Balance regression (DESIGN §12): one representative seed per mission on 正規, played to the end on the real map by
 * a squad of four skill-0.8 bots with their species' default presets — exactly like a cell of
 * scripts/anima-front-balance.mjs (same player ids, squad rotation and seed), so a failure here can be explored there.
 * Each pin asserts the win and the mission's target duration window; a balance change that moves a pin out of its
 * window should be re-measured with the harness (many seeds) before the pin is updated.
 */
import { describe, expect, it } from 'vitest'
import { presetById } from '../src/data/loadout'
import { MISSIONS, type MissionId } from '../src/data/missions'
import { SPECIES, type SpeciesId } from '../src/data/species'
import type { PlayerConfig } from '../src/sim/types'
import { createWorld, simOf } from '../src/sim/world'

/** The harness's squad rotation (SQUADS[seed % 4]). */
const SQUADS: SpeciesId[][] = [
  ['shiba', 'cat', 'rabbit', 'bear'],
  ['fox', 'penguin', 'hamster', 'owl'],
  ['shiba', 'penguin', 'owl', 'bear'],
  ['cat', 'fox', 'hamster', 'rabbit']
]

interface Pin {
  seed: number
  /** Clear time window in minutes (the 正規 pacing target). */
  minutes: [number, number]
  /** Boss phase window in minutes (from the boss's arrival to its death). */
  boss?: [number, number]
}

const PINS: Record<MissionId, Pin> = {
  sakura: { seed: 4, minutes: [4, 6] },
  // The harness mean is 5.4–6.4 min across seeds; this seed clears a little early.
  harbor: { seed: 2, minutes: [4.5, 7], boss: [1.5, 3] },
  nightraid: { seed: 3, minutes: [4, 6] },
  blight: { seed: 4, minutes: [3.9, 6] },
  maw: { seed: 4, minutes: [2.9, 5], boss: [2.5, 5] }
}

function play(mission: MissionId, seed: number) {
  const m = MISSIONS[mission]
  const players: PlayerConfig[] = SQUADS[seed % SQUADS.length].map((sp, i) => ({
    id: `b${i}`,
    name: `${sp}${i}`,
    species: sp,
    loadout: presetById(SPECIES[sp].preset).loadout,
    team: 0,
    bot: 0.8
  }))
  const w = createWorld({ mode: 'pve', map: m.map, mission, difficulty: 'normal', seed, players })
  const sim = simOf(w)
  const none = new Map()
  let start = -1
  let bossAt = -1
  let bossDead = -1
  for (let i = 0; i < 60 * 900 && !w.over; i++) {
    w.step(none)
    if (start < 0 && sim.phase === 'play') start = sim.time
    for (const e of sim.events) {
      const boss = e.type === 'foeSpawn' || e.type === 'foeDie' ? FOE_BOSSES.has(e.kind) : false
      if (e.type === 'foeSpawn' && boss && bossAt < 0) bossAt = sim.time
      if (e.type === 'foeDie' && boss) bossDead = sim.time
    }
    sim.events = []
  }
  const v = w.view()
  return { v, boss: bossAt >= 0 && bossDead >= 0 ? (bossDead - bossAt) / 60 : null }
}

const FOE_BOSSES = new Set(['goutetsu', 'kuitsukushi'])

describe('balance pins on 正規 (one seed per mission, skill 0.8 squads)', () => {
  for (const id of Object.keys(PINS) as MissionId[]) {
    const pin = PINS[id]
    it(
      `${MISSIONS[id].name}: seed ${pin.seed} is won in ${pin.minutes[0]}–${pin.minutes[1]} min`,
      { timeout: 180_000 },
      () => {
        const { v, boss } = play(id, pin.seed)
        expect(v.phase).toBe('victory')
        const minutes = v.pve!.result!.time / 60
        expect(minutes).toBeGreaterThanOrEqual(pin.minutes[0])
        expect(minutes).toBeLessThanOrEqual(pin.minutes[1])
        if (pin.boss) {
          expect(boss).not.toBeNull()
          expect(boss!).toBeGreaterThanOrEqual(pin.boss[0])
          expect(boss!).toBeLessThanOrEqual(pin.boss[1])
        }
      }
    )
  }
})

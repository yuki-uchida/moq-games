/**
 * One cost pipeline (DESIGN §5, §7): for every antique with a cost, a drain or an upkeep, the anima the sim actually
 * takes equals the editor's per-antique number (itemCosts — the functions sustainEstimate uses) under ナマケモノ ×0..3,
 * with passives online and offline, and for the species traits that change a cost (owl glide, penguin dash).
 */
import { describe, expect, it } from 'vitest'
import { ITEM_IDS, ITEMS, isWeapon, type ItemId } from '../src/data/items'
import { makeLoadout } from '../src/data/loadout'
import type { SpeciesId } from '../src/data/species'
import { DT } from '../src/sim/constants'
import { computeBuild, dashCost, itemCosts, sanitizeLoadout } from '../src/sim/loadout'
import { BTN } from '../src/sim/types'
import { aimAt, rig } from './sim-helpers'

const COSTLY = ITEM_IDS.filter((id) => {
  const d = ITEMS[id]
  return d.cost !== undefined || d.drain !== undefined || d.upkeep !== undefined
})

/** Loadout carrying `id` (in the right paw when active; a ミツバチ in the left one as the weapon) and `sloths`. */
function loadoutWith(id: ItemId, sloths: number) {
  const pas: ItemId[] = Array.from({ length: sloths }, () => 'sloth' as ItemId)
  if (ITEMS[id].active) return makeLoadout([id], isWeapon(id) ? [] : ['bee'], pas)
  return makeLoadout(['bee'], [], [id, ...pas])
}

/**
 * The anima the sim takes for `id`: the first single charge (per-use antiques) or the steady per-second rate
 * (drains, glide, upkeep) while the right paw is used the way the antique works (held, then released).
 */
function measure(species: SpeciesId, id: ItemId, sloths: number, online: boolean) {
  const loadout = loadoutWith(id, sloths)
  const r = rig({ species, loadout })
  const p = r.player()
  const level = online ? p.maxAnima : 10
  const keep = () => {
    p.anima = online ? p.build.maxAnima : level
  }
  keep()
  r.step(5)
  // (a build without passives has nothing to take offline)
  expect(p.online).toBe(online || p.build.passives.length === 0)
  aimAt(r, [p.p[0], 0.5, p.p[2] + 6])
  const def = ITEMS[id]
  const glide = def.passive?.kind === 'glide'
  if (glide) {
    p.p = [0, 40, 0]
    p.v = [0, -2, 0]
    p.grounded = false
  }
  const deltas: number[] = []
  let last = p.stats.byItem[id] ?? 0
  const inp = r.input()
  for (let t = 0; t < 150; t++) {
    keep()
    if (glide) {
      inp.held = BTN.JUMP
      p.p[1] = Math.max(p.p[1], 20)
    } else if (def.active) {
      // hold 70 ticks (charge / zoom / lock / beam / shield), release 10, press again
      const hold = t % 80 < 70
      if (t % 80 === 0) inp.presses.r++
      inp.held = hold ? BTN.R : 0
    }
    r.step(1)
    const now = p.stats.byItem[id] ?? 0
    if (now - last > 1e-12) deltas.push(now - last)
    last = now
  }
  return deltas
}

describe('one cost pipeline: the sim spends what the editor shows', () => {
  for (const id of COSTLY) {
    for (const online of [true, false]) {
      it(`${ITEMS[id].name} (${id}), passives ${online ? 'online' : 'offline'}, ナマケモノ ×0..3`, () => {
        for (let sloths = 0; sloths <= 3; sloths++) {
          const line = itemCosts('shiba', loadoutWith(id, sloths), online).find((l) => l.item === id)!
          expect(line, `${id} has an editor line`).toBeTruthy()
          const deltas = measure('shiba', id, sloths, online)
          const label = `${id} sloth×${sloths} ${online ? 'online' : 'offline'}`
          if (line.perUse !== undefined) {
            expect(deltas.length, label).toBeGreaterThan(0)
            expect(deltas[0], label).toBeCloseTo(line.perUse, 6)
          } else {
            const perSecond = line.perSecond ?? 0
            if (perSecond === 0) expect(deltas, label).toEqual([])
            else {
              expect(deltas.length, label).toBeGreaterThan(10)
              // the steady per-tick drain (the median tick)
              const sorted = deltas.slice().sort((a, b) => a - b)
              expect(sorted[sorted.length >> 1] / DT, label).toBeCloseTo(perSecond, 6)
            }
          }
          // the sloth really lowers it while online (and never while offline)
          if (sloths > 0) {
            const base = itemCosts('shiba', loadoutWith(id, 0), online).find((l) => l.item === id)!
            const a = line.perUse ?? line.perSecond ?? 0
            const b = base.perUse ?? base.perSecond ?? 0
            if (online && b > 0) expect(a, label).toBeLessThan(b)
            else expect(a, label).toBeCloseTo(b, 9)
          }
        }
      })
    }
  }

  it('species traits: the owl glides for free with モモンガ; the editor counts nothing for it', () => {
    for (const sloths of [0, 3]) {
      const lines = itemCosts('owl', loadoutWith('momonga', sloths), true)
      expect(lines.find((l) => l.item === 'momonga')!.perSecond).toBe(0)
      expect(measure('owl', 'momonga', sloths, true)).toEqual([])
    }
  })

  it('species traits: dashes cost dashCost (sloth-scaled); the penguin slides for free', () => {
    for (const species of ['shiba', 'penguin'] as SpeciesId[]) {
      for (const sloths of [0, 3]) {
        const loadout = loadoutWith('bee', sloths)
        const r = rig({ species, loadout })
        const p = r.player()
        p.anima = p.build.maxAnima
        r.step(3)
        const before = p.stats.spent
        r.input().presses.dash++
        r.step(1)
        const m = computeBuild(species, sanitizeLoadout(loadout)).mods
        expect(p.stats.spent - before, `${species} sloth×${sloths}`).toBeCloseTo(dashCost(species, m), 9)
        if (species === 'penguin') expect(p.stats.spent - before).toBe(0)
      }
    }
  })
})

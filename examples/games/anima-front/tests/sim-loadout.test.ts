/** Loadout rules and the sustain estimate (DESIGN §7). */
import { describe, expect, it } from 'vitest'
import { ITEM_IDS, ITEMS, isWeapon, type ItemId } from '../src/data/items'
import { LOADOUT_SLOTS, makeLoadout, PRESETS, type Loadout } from '../src/data/loadout'
import { SPECIES_IDS } from '../src/data/species'
import {
  computeBuild,
  handLists,
  loadoutErrors,
  sanitizeLoadout,
  sustainEstimate,
  weaponRate
} from '../src/sim/loadout'
import { Rng } from '../src/sim/rng'

describe('sanitizeLoadout', () => {
  it('repairs garbage into 16 valid slots with a weapon', () => {
    for (const junk of [null, undefined, 3, 'x', {}, { slots: 'x' }, { slots: [] }, { slots: Array(40).fill(7) }]) {
      const l = sanitizeLoadout(junk)
      expect(l.slots.length).toBe(LOADOUT_SLOTS)
      expect(loadoutErrors(l)).toEqual([])
      expect(l.slots.some((s) => s && isWeapon(s.item))).toBe(true)
    }
  })

  it('drops unknown ids, repairs hands, strips hands from passives and enforces limits', () => {
    const l = sanitizeLoadout({
      slots: [
        { item: 'bee', hand: 'R' },
        { item: 'bee', hand: 'R' },
        { item: 'bee' },
        { item: 'nope', hand: 'R' },
        { item: 'orca', hand: 'Q' },
        { item: 'fang', hand: 'L' },
        { item: 'fang' },
        { item: 'fang' },
        { item: 'fang' },
        { item: 'turtle' },
        { item: 'turtle' },
        { item: 'bee', hand: 'L' },
        ...Array(8).fill({ item: 'koala' })
      ]
    })
    expect(l.slots.length).toBe(16)
    expect(l.slots[0]).toEqual({ item: 'bee', hand: 'R' })
    expect(l.slots[1]).toBeNull()
    expect(l.slots[2]).toEqual({ item: 'bee', hand: 'L' })
    expect(l.slots[3]).toBeNull()
    expect(l.slots[4]).toEqual({ item: 'orca', hand: 'R' })
    expect(l.slots[5]).toEqual({ item: 'fang' })
    expect(l.slots[8]).toBeNull()
    expect(l.slots[10]).toBeNull()
    expect(l.slots[11]).toBeNull()
    expect(l.slots.filter((s) => s?.item === 'koala').length).toBe(3)
    expect(loadoutErrors(l)).toEqual([])
  })

  it('adds a pistol when no weapon is left', () => {
    const l = sanitizeLoadout({ slots: Array(16).fill({ item: 'koala' }) })
    expect(l.slots.filter((s) => s?.item === 'bee').length).toBe(1)
    const full = sanitizeLoadout({
      slots: [...Array(13).fill(null), { item: 'frog', hand: 'L' }, { item: 'turtle' }, { item: 'jelly' }]
    })
    expect(full.slots.some((s) => s?.item === 'bee' && s.hand === 'R')).toBe(true)
  })
})

describe('loadoutErrors', () => {
  it('reports each problem in Japanese', () => {
    expect(loadoutErrors(makeLoadout([], ['frog'], ['koala']))).toContain('武器が1つもありません')
    const bad: Loadout = {
      slots: [
        { item: 'bee', hand: 'R' },
        { item: 'bee', hand: 'R' },
        { item: 'orca' },
        { item: 'turtle', hand: 'L' },
        { item: 'koala' },
        { item: 'koala' },
        { item: 'koala' },
        { item: 'koala' },
        { item: 'jelly' },
        { item: 'jelly' },
        { item: 'zzz' as ItemId },
        null,
        null,
        null,
        null,
        null
      ]
    }
    const e = loadoutErrors(bad)
    expect(e).toContain('ミツバチは同じ手に1つまでです')
    expect(e).toContain('シャチマルを持たせる手（右・左）を決めてください')
    expect(e).toContain('カメノコウラは手に持てません')
    expect(e).toContain('コアラは3個までです')
    expect(e).toContain('クラゲヴェールは1個までです')
    expect(e).toContain('不明なアンティークがあります')
    expect(loadoutErrors({ slots: [{ item: 'bee', hand: 'R' }] })).toContain('スロットは16個にしてください')
  })

  it('every preset is valid', () => {
    for (const p of PRESETS) expect(loadoutErrors(p.loadout)).toEqual([])
  })
})

describe('handLists', () => {
  it('keeps slot order per paw and duplicate passives', () => {
    const l = makeLoadout(['orca', 'bee'], ['frog', 'bee'], ['fang', 'fang'])
    expect(handLists(l)).toEqual({ R: ['orca', 'bee'], L: ['frog', 'bee'], passive: ['fang', 'fang'] })
  })
})

describe('sustainEstimate', () => {
  it('follows the documented fight model', () => {
    const l = makeLoadout(['bee', 'wood'], ['frog'], [])
    const s = sustainEstimate('shiba', l)
    // Mean cost rate of the paw's weapons × 0.15 duty; gadgets: cost / max(cooldown, 15 s); 0.6/s incoming.
    const bee = 0.15 / 0.18
    const wood = 0.35 * 9
    const rate = ((bee + wood) / 2) * 0.15
    expect(s.byCategory.ranged).toBeCloseTo(rate, 2)
    expect(s.byCategory.gadget).toBeCloseTo(3 / 15, 2)
    expect(s.byCategory.damage).toBeCloseTo(0.6, 5)
    expect(s.regen).toBe(1.5)
    expect(s.burn).toBeCloseTo(rate + 0.2 + 0.6, 2)
    // A third (0.33) of the natural regeneration happens during a fight.
    expect(s.sustain).toBeCloseTo(100 / (rate + 0.2 + 0.6 - 1.5 * 0.33), 0)
    expect(s.maxAnima).toBe(100)
    expect(s.cheapest).toEqual({ item: 'bee', cost: 0.15 })
  })

  it('reports long sustains for frugal builds and warns about expensive ones', () => {
    // The best armour/regeneration stack (almost) pays for itself: a very long or endless estimate.
    const tank = makeLoadout(
      ['bee'],
      [],
      ['turtle', 'rhino', 'rhino', 'rhino', 'jelly', 'koala', 'koala', 'koala', 'sloth', 'sloth', 'sloth']
    )
    expect(sustainEstimate('bear', tank).sustain).toBeGreaterThan(300)
    // 火力全開 runs dry within about a minute of fighting (the bot drill measures ~55–65 s on shiba / bear).
    const allout = PRESETS.find((p) => p.id === 'allout')!.loadout
    const s = sustainEstimate('hamster', allout)
    expect(s.sustain).toBeLessThan(60)
    expect(s.warnings).toContain('消費が非常に激しい構成です')
    expect(sustainEstimate('shiba', allout).sustain).toBeGreaterThan(45)
    expect(sustainEstimate('shiba', allout).sustain).toBeLessThan(90)
    // The everyday builds last much longer.
    for (const id of ['attacker', 'support']) {
      const p = PRESETS.find((x) => x.id === id)!.loadout
      expect(sustainEstimate('shiba', p).sustain).toBeGreaterThan(2 * sustainEstimate('shiba', allout).sustain - 20)
    }
    expect(sustainEstimate('shiba', makeLoadout([], ['frog'], [])).warnings).toContain('武器がありません')
  })

  it('is monotonic: a more expensive build never reports a longer sustain', () => {
    const rng = new Rng(7)
    const weapons = ITEM_IDS.filter((id) => isWeapon(id))
    const passives = ITEM_IDS.filter((id) => !ITEMS[id].active)
    for (let n = 0; n < 300; n++) {
      const species = rng.pick(SPECIES_IDS)
      const r = [rng.pick(weapons)]
      const l = [rng.pick(weapons)]
      const pas: ItemId[] = []
      for (let k = 0; k < 6; k++) pas.push(rng.pick(passives))
      const base = sanitizeLoadout(makeLoadout(r, l, pas))
      const s0 = sustainEstimate(species, base).sustain
      const m = computeBuild(species, base).mods
      // Swap the right paw's weapon for a pricier one.
      const pricier = weapons.filter((w) => weaponRate(ITEMS[w], m) >= weaponRate(ITEMS[r[0]], m) && w !== l[0])
      const swapped = sanitizeLoadout(makeLoadout([rng.pick(pricier.length ? pricier : weapons)], l, pas))
      if (weaponRate(ITEMS[handLists(swapped).R[0]], m) >= weaponRate(ITEMS[r[0]], m))
        expect(sustainEstimate(species, swapped).sustain).toBeLessThanOrEqual(s0)
      // Adding a cost-raising enhancement (fang / hawk) never lengthens it.
      const plus = sanitizeLoadout(makeLoadout(r, l, [...pas.slice(0, 5), rng.pick(['fang', 'hawk'] as ItemId[])]))
      const lessPassive = sanitizeLoadout(makeLoadout(r, l, pas.slice(0, 5)))
      expect(sustainEstimate(species, plus).sustain).toBeLessThanOrEqual(sustainEstimate(species, lessPassive).sustain)
    }
  })
})

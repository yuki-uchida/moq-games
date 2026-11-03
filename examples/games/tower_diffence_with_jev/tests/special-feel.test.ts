import { describe, expect, it } from 'vitest'
import { FIELDS, initialState } from '../src/game/model'
import { GameEngine } from '../src/game/GameEngine'
import { freshSave } from '../src/progression/UpgradeSystem'
import { bestSpecialTarget, specialTargetCount } from '../src/game/SpecialTargeting'
import { SPECIALS } from '../src/game/SpecialAbilities'
import {
  FREEZE_MS,
  bandSide,
  MAX_CUT_IN_CHAIN,
  addImpact,
  castTally,
  chainCutIn,
  newAccum,
  placeReadout,
  readoutText,
  stackReadout,
  type CastTally
} from '../src/ui/SpecialFeel'

const tally = (extra: Partial<CastTally> = {}): CastTally => ({ hits: 0, damage: 0, kills: 0, held: 0, heal: 0, allies: 0, ...extra })

describe('special-move presentation rules', () => {
  it('puts the cut-in band in the half opposite the target', () => {
    expect(bandSide(700, 900)).toBe('top')
    expect(bandSide(450.5, 900)).toBe('top')
    expect(bandSide(450, 900)).toBe('bottom')
    expect(bandSide(80, 844)).toBe('bottom')
  })

  it('chains cut-in bands one after another, FREEZE_MS each, at most three deep', () => {
    expect(chainCutIn(1000, [])).toEqual({ start: 1000, end: 1000 + FREEZE_MS })
    const second = chainCutIn(1200, [1000 + FREEZE_MS])!
    expect(second).toEqual({ start: 1000 + FREEZE_MS, end: 1000 + 2 * FREEZE_MS })
    const third = chainCutIn(1300, [1000 + FREEZE_MS, second.end])!
    expect(third.end).toBe(1000 + 3 * FREEZE_MS)
    expect(MAX_CUT_IN_CHAIN).toBe(3)
    // A fourth overlapping cast gets no band, so the freeze does not grow.
    expect(chainCutIn(1400, [1000 + FREEZE_MS, second.end, third.end])).toBeNull()
    // Bands that already ended no longer count.
    expect(chainCutIn(third.end, [1000 + FREEZE_MS, second.end, third.end])).toEqual({
      start: third.end,
      end: third.end + FREEZE_MS
    })
  })

  const impact = (extra: Partial<Parameters<typeof addImpact>[1]> = {}) => ({ targets: [], damage: 0, heal: 0, kills: [], ...extra })
  it('tallies only what the special itself reported: distinct hits, its damage, its kills', () => {
    // A normal attack's 12 never reaches the reports: a special that hit nothing reads as a miss.
    const miss = newAccum()
    addImpact(miss, impact())
    expect(castTally(null, miss)).toEqual(tally())
    // A multi-impact cast: the same enemy hit twice is one hit, damage and kills add up across impacts.
    const runner = newAccum()
    addImpact(runner, impact({ targets: [7, 8], damage: 80 }))
    addImpact(runner, impact({ targets: [7], damage: 40, kills: [7] }))
    expect(castTally(null, runner)).toEqual(tally({ hits: 2, damage: 120, kills: 1 }))
  })
  it('keeps two casts landing in the same step apart and counts field targets and heals from reports', () => {
    const a = newAccum(),
      b = newAccum()
    addImpact(a, impact({ targets: [1], damage: 30, kills: [1] }))
    addImpact(b, impact({ targets: [1, 2, 3], damage: 90 }))
    expect(castTally(null, a)).toEqual(tally({ hits: 1, damage: 30, kills: 1 }))
    expect(castTally(null, b)).toEqual(tally({ hits: 3, damage: 90 }))
    const heal = newAccum()
    addImpact(heal, impact({ targets: [4, 5], heal: 3 }))
    addImpact(heal, impact({ targets: [4, 5], heal: 2.5 }))
    expect(castTally('heal', heal)).toEqual(tally({ allies: 2, heal: 5.5 }))
    const hold = newAccum()
    addImpact(hold, impact({ targets: [9] }))
    addImpact(hold, impact({ targets: [9, 10] }))
    expect(castTally('hold', hold)).toEqual(tally({ held: 2 }))
  })

  it('words the readout for damage, empty, hold and heal specials', () => {
    expect(readoutText('回転斬撃', null, tally({ hits: 3, damage: 245.6, kills: 2 }), false)).toEqual({
      title: '回転斬撃',
      main: '×3 HIT',
      sub: '246 ダメージ',
      kills: '撃破 2'
    })
    expect(readoutText('回転斬撃', null, tally({ hits: 1, damage: 9 }), false).kills).toBe('')
    expect(readoutText('矢の雨', null, tally(), false).main).toBe('命中なし')
    expect(readoutText('氷結場', 'hold', tally({ held: 4 }), false).main).toBe('4体 足止め')
    expect(readoutText('回復の泉', 'heal', tally({ allies: 3 }), false).main).toBe('3体')
    expect(readoutText('回復の泉', 'heal', tally({ heal: 81.4 }), true).main).toBe('回復 +81')
  })

  it('places the readout above the impact, below it near the HUD, always between the HUD and the skill bar', () => {
    const area = { left: 8, right: 382, top: 90, bottom: 700 }
    expect(placeReadout(200, 400, 150, 90, area)).toEqual({ x: 200, y: 366 })
    expect(placeReadout(10, 120, 150, 90, area)).toEqual({ x: 83, y: 244 })
    expect(placeReadout(380, 900, 150, 90, area)).toEqual({ x: 307, y: 700 })
  })

  it('counts real units for the button badge (a boss is one, not three)', () => {
    const engine = new GameEngine({ decide: async () => null }, freshSave(), 'meadow', 42, () => 0)
    expect(engine.place('soldier', FIELDS.meadow.slots[0].id)).toBe(true)
    const base = engine.state.units[0],
      state = initialState()
    state.phase = 'assault'
    state.units = [{ ...base, id: 1, type: 'soldier', hp: 100, maxHp: 100, x: 300, y: 300 }]
    for (const [id, boss] of [[2, true], [3, false]] as const)
      state.units.push({ ...base, id, owner: 'ai', type: 'slime', hp: 100, maxHp: 100, x: 330, y: 300, boss, progress: 0 })
    const aim = bestSpecialTarget(state, 1)!
    expect(aim.score).toBe(4)
    expect(specialTargetCount(state, 'soldier', aim.point)).toBe(2)
    expect(specialTargetCount(state, 'soldier', { x: 300 + SPECIALS.soldier.radius * 3, y: 300 })).toBe(0)
  })

  it('steps a readout past one it would cover, below when there is room, otherwise above', () => {
    const bounds = { left: 0, right: 800, top: 60, bottom: 700 }
    const taken = [{ left: 300, right: 460, top: 200, bottom: 290 }]
    // Same anchor as the existing card: goes below it.
    expect(stackReadout({ x: 380, y: 290 }, 160, 90, taken, bounds)).toBe(290 + 8 + 90)
    // No room below: goes above it.
    expect(stackReadout({ x: 380, y: 290 }, 160, 90, taken, { ...bounds, bottom: 380 })).toBe(200 - 8)
    // Not overlapping: stays where it was placed.
    expect(stackReadout({ x: 620, y: 290 }, 160, 90, taken, bounds)).toBe(290)
  })
})

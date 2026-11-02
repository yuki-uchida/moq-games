import { describe, expect, it } from 'vitest'
import { FIELDS, initialState } from '../src/game/model'
import { GameEngine } from '../src/game/GameEngine'
import { freshSave } from '../src/progression/UpgradeSystem'
import { bestSpecialTarget, specialTargetCount } from '../src/game/SpecialTargeting'
import { SPECIALS } from '../src/game/SpecialAbilities'
import {
  FREEZE_MS,
  bandSide,
  healInArea,
  nextFreezeUntil,
  placeReadout,
  readoutText,
  stackReadout,
  summarizeImpact,
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

  it('freezes for one cut-in length and never stacks a second freeze', () => {
    const first = nextFreezeUntil(1000, 0)
    expect(first).toBe(1000 + FREEZE_MS)
    expect(nextFreezeUntil(1200, first)).toBe(first)
    expect(nextFreezeUntil(first, first)).toBe(first + FREEZE_MS)
  })

  it('sums damage, hits and kills only for enemies inside the circle', () => {
    const drops = [
      { id: 1, x: 100, y: 100, amount: 40 },
      { id: 2, x: 150, y: 100, amount: 60, killed: true },
      { id: 3, x: 400, y: 100, amount: 99 }
    ]
    expect(summarizeImpact(drops, { x: 100, y: 100 }, 95)).toEqual({ hits: 2, damage: 100, kills: 1 })
    expect(summarizeImpact([], { x: 0, y: 0 }, 50)).toEqual({ hits: 0, damage: 0, kills: 0 })
    expect(healInArea([{ id: 1, x: 0, y: 0, amount: 7 }, { id: 2, x: 500, y: 0, amount: 9 }], { x: 0, y: 0 }, 130)).toBe(7)
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

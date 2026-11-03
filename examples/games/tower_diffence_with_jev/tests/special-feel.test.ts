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
  placeCard,
  compactReadoutText,
  compactReadouts,
  COMPACT_MAX_HEIGHT,
  type Box,
  readoutText,
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
})

const boxOf = (p: { x: number; y: number }, w: number, h: number): Box => ({ left: p.x - w / 2, right: p.x + w / 2, top: p.y - h, bottom: p.y })
const meets = (a: Box, b: Box) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top

describe('placeCard', () => {
  // 844 x 390 landscape: top bar, field buttons on the right, coins/pause/speed bottom-left, skill bar bottom-centre.
  const area: Box = { left: 8, right: 836, top: 8, bottom: 382 }
  const hud: Box[] = [
    { left: 8, right: 840, top: 8, bottom: 56 },
    { left: 668, right: 836, top: 62, bottom: 120 },
    { left: 12, right: 212, top: 240, bottom: 290 },
    { left: 300, right: 540, top: 320, bottom: 380 }
  ]
  it('puts a card just above its impact when that spot is free', () => {
    const pos = placeCard({ x: 400, y: 200 }, 200, 34, area, [])!
    expect(pos).toEqual({ x: 400, y: 200 - 34 })
  })
  it('keeps several cards apart, inside the area and clear of the HUD, even for impacts on top of each other', () => {
    const w = 230,
      h = 34,
      cards: Box[] = []
    for (const anchor of [{ x: 100, y: 290 }, { x: 110, y: 290 }, { x: 105, y: 300 }, { x: 120, y: 285 }]) {
      const pos = placeCard(anchor, w, h, area, [...hud, ...cards])
      expect(pos).not.toBeNull()
      const box = boxOf(pos!, w, h)
      expect(box.left).toBeGreaterThanOrEqual(area.left)
      expect(box.right).toBeLessThanOrEqual(area.right)
      expect(box.top).toBeGreaterThanOrEqual(area.top)
      expect(box.bottom).toBeLessThanOrEqual(area.bottom)
      for (const other of [...hud, ...cards]) expect(meets(box, other)).toBe(false)
      cards.push(box)
    }
  })
  it('flows into a second column when the first one is full', () => {
    const w = 200,
      h = 60,
      tight: Box = { left: 0, right: 420, top: 0, bottom: 70 } // one card high, two columns wide
    const first = placeCard({ x: 100, y: 70 }, w, h, tight, [])!,
      second = placeCard({ x: 100, y: 70 }, w, h, tight, [boxOf(first, w, h)])!
    expect(second.x - w / 2).toBeGreaterThanOrEqual(first.x + w / 2)
    expect(meets(boxOf(second, w, h), boxOf(first, w, h))).toBe(false)
    expect(placeCard({ x: 100, y: 70 }, w, h, tight, [boxOf(first, w, h), boxOf(second, w, h)])).toBeNull()
  })
  it('returns null when nothing fits so the caller can retire the oldest card', () => {
    const only: Box = { left: 0, right: 200, top: 0, bottom: 40 }
    const w = 200,
      h = 40,
      first = placeCard({ x: 100, y: 40 }, w, h, only, [])!
    expect(placeCard({ x: 100, y: 40 }, w, h, only, [boxOf(first, w, h)])).toBeNull()
  })
})

describe('compact readout', () => {
  it('applies to short screens only', () => {
    expect(compactReadouts(390)).toBe(true)
    expect(compactReadouts(COMPACT_MAX_HEIGHT)).toBe(true)
    expect(compactReadouts(COMPACT_MAX_HEIGHT + 1)).toBe(false)
  })
  it('says the same numbers as the big card in one line', () => {
    const acc = newAccum()
    addImpact(acc, { targets: [1, 2], damage: 70.6, heal: 0, kills: [2] })
    expect(compactReadoutText('槍連撃', null, castTally(null, acc), false)).toBe('槍連撃 ×2 HIT · 71 · 撃破1')
    expect(compactReadoutText('槍連撃', null, castTally(null, newAccum()), false)).toBe('槍連撃 命中なし')
    expect(compactReadoutText('氷結場', 'hold', castTally('hold', acc), false)).toBe('氷結場 2体 足止め')
    const heal = newAccum()
    addImpact(heal, { targets: [1], damage: 0, heal: 40, kills: [] })
    expect(compactReadoutText('回復の泉', 'heal', castTally('heal', heal), false)).toBe('回復の泉 1体を回復中')
    expect(compactReadoutText('回復の泉', 'heal', castTally('heal', heal), true)).toBe('回復の泉 回復 +40')
  })
})

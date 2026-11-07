import { describe, expect, test } from 'vitest'
import { PASSIVE_BY_ID, WEAPONS, WEAPON_BY_ID, WEAPON_LEVELS } from '../src/data'
import { choiceText, Game, weaponStats } from '../src/game'
import { statusModel } from '../src/status'

describe('in-game descriptions', () => {
  test('a weapon level configuration independently controls its display and calculation', () => {
    const player = new Game(1).addPlayer('a', 'p_edu')!
    const first = { id: 'w_study', lv: 2, cd: 0, held: 0, damage: 0 }
    const second = { ...first, id: 'w_love' }
    player.weapons = [first, second]
    const upgrade = WEAPON_LEVELS.w_study[0]
    const original = { ...upgrade }
    const beforeFirst = weaponStats(player, first)
    const beforeSecond = weaponStats(player, second)
    try {
      upgrade.damage = 2
      upgrade.amount = 4
      upgrade.text = 'テスト強化'
      expect(weaponStats(player, first).damage).toBeCloseTo(beforeFirst.damage * 2)
      expect(weaponStats(player, first).amount).toBe(beforeFirst.amount + 3)
      expect(weaponStats(player, second)).toEqual(beforeSecond)
      first.lv = 1
      expect(choiceText(player, 'w:w_study').text).toBe('テスト強化')
    } finally {
      Object.assign(upgrade, original)
    }
  })
  test('every weapon has an individual description for each level', () => {
    const player = new Game(1).addPlayer('a', 'p_edu')!
    for (const weapon of WEAPONS) {
      player.weapons = [{ id: weapon.id, lv: 1, cd: 0, held: 0, damage: 0 }]
      for (let level = 1; level < 8; level++) {
        player.weapons[0].lv = level
        expect(choiceText(player, `w:${weapon.id}`).text).toBeTruthy()
        expect(choiceText(player, `w:${weapon.id}`).text).not.toContain('undefined')
      }
    }
  })

  test('toxic parent gains damage instead of projectiles at levels 2, 5 and 8', () => {
    const player = new Game(1).addPlayer('a', 'p_toxic')!
    const weapon = player.weapons.find((entry) => entry.id === 'p_toxic')!
    for (const [level, factor] of [
      [2, 1.3],
      [5, 1.3],
      [8, 1.82]
    ] as const) {
      weapon.lv = level - 1
      const before = weaponStats(player, weapon)
      expect(choiceText(player, 'w:p_toxic').text).toBe(`威力 +${Math.round((factor - 1) * 100)}%`)
      weapon.lv = level
      const after = weaponStats(player, weapon)
      expect(after.amount).toBe(1)
      expect(after.damage / before.damage).toBeCloseTo(factor)
    }
  })
  test.each(WEAPONS.filter((weapon) => weapon.strong.length && weapon.behavior !== 'gamble'))(
    '$id labels every effective target',
    (weapon) => {
      const model = statusModel({ weapons: [[weapon.id, 1, 0]], passives: [], petAge: undefined }, 0)
      expect(model.weapons[0].strong).toEqual(weapon.strong)
      expect(model.weapons[0].detail).not.toContain('特攻：')
    }
  )

  test('the shield keeps its defensive limits in a compact status description', () => {
    const model = statusModel({ weapons: [['p_over', 1, 0]], passives: [], petAge: undefined }, 0)
    const detail = model.weapons[0].detail
    expect(WEAPON_BY_ID.get('p_over')!.desc.length).toBeLessThanOrEqual(60)
    for (const effect of [
      '敵を追わず盾で接触攻撃・吹き飛ばす',
      '盾は敵の投射物も1回防ぐ',
      '詳しくは「?」へ',
      '防御 +1'
    ])
      expect(detail).toContain(effect)
  })

  test('toxic-parent exceptions remain visible', () => {
    const perk = WEAPON_BY_ID.get('p_toxic')!.perk!
    for (const effect of [
      '全武器の威力 +5%',
      '最大精神力 -10',
      '自然回復なし（性格・仲間・家庭）',
      '食事・レベルアップで回復可',
      '18歳未満は親を含めて手札3枠'
    ])
      expect(perk).toContain(effect)
  })

  test('new cards use the same descriptions as the status model', () => {
    const player = new Game(1).addPlayer('a', 'p_edu')!
    for (const weapon of WEAPONS.filter((entry) => !entry.parent)) {
      expect(choiceText(player, `w:${weapon.id}`).text).toBe(weapon.desc)
      const model = statusModel({ weapons: [[weapon.id, 1, 0]], passives: [], petAge: undefined }, 0)
      expect(model.weapons[0].detail).toBe(weapon.desc)
    }
    expect(choiceText(player, 'p:p_clever').text).toBe(PASSIVE_BY_ID.get('p_clever')!.desc)
    expect(PASSIVE_BY_ID.get('p_clever')!.desc).toContain('発射・召喚数 +1（Lv1・Lv4／武器による）')
  })
})

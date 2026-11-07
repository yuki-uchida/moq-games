import { describe, expect, test } from 'vitest'
import { PASSIVE_BY_ID, TAG_NAMES, WEAPONS, WEAPON_BY_ID } from '../src/data'
import { choiceText, Game } from '../src/game'
import { statusModel } from '../src/status'

describe('in-game descriptions', () => {
  test.each(WEAPONS.filter((weapon) => weapon.strong.length && weapon.behavior !== 'gamble'))(
    '$id labels every effective target',
    (weapon) => {
      const targets = weapon.desc.split('特攻：')[1]
      expect(targets).toBeTruthy()
      for (const tag of weapon.strong) expect(targets).toContain(TAG_NAMES[tag])
    }
  )

  test('the shield keeps its defensive limits in a compact status description', () => {
    const model = statusModel({ weapons: [['p_over', 1, 0]], passives: [], petAge: undefined }, 0)
    const detail = model.weapons[0].detail
    expect(WEAPON_BY_ID.get('p_over')!.desc.length).toBeLessThanOrEqual(60)
    for (const effect of [
      '盾で迎撃・吹き飛ばす',
      '1枚1回防御＋無敵0.5秒',
      '特攻：事故・病気',
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

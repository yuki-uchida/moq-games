import { describe, expect, it } from 'vitest'
import { MAX_WEAPON_LEVEL } from '../src/data'
import { statusModel } from '../src/status'

describe('status model', () => {
  it('lists weapons and personalities without synergy data', () => {
    const model = statusModel(
      {
        weapons: [
          ['w_reading', 1, 0],
          ['w_invest', MAX_WEAPON_LEVEL, 0]
        ],
        passives: [['p_diligent', 2]],
        petAge: undefined
      } as never,
      20
    )
    expect(model.weapons).toHaveLength(2)
    expect(model.weapons[1].levelText).toBe('MAX')
    expect(model.passives).toEqual([expect.objectContaining({ name: '勤勉', level: 2, kind: 'passive' })])
    expect(model).not.toHaveProperty('synergies')
    expect(model).not.toHaveProperty('personalitySynergies')
    expect(model.weapons.every((item) => !item.detail.includes('発動中'))).toBe(true)
  })
})

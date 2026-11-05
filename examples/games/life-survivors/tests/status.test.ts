import { describe, expect, it } from 'vitest'
import { MAX_WEAPON_LEVEL } from '../src/data'
import { SYNERGIES } from '../src/synergies'
import { statusModel, synergyRows } from '../src/status'

describe('status model', () => {
  it('lists weapons, personalities and every synergy with its activation', () => {
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
    expect(model.total).toBe(SYNERGIES.length)
    expect(model.activeCount).toBe(1)
    expect(model.synergies.find((row) => row.active)?.name).toBe('知識で資産形成')
  })

  it('shows no active synergy for an empty hand', () => {
    expect(synergyRows({ weapons: [] }).every((row) => !row.active)).toBe(true)
  })
})

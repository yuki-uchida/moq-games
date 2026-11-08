import { describe, expect, test } from 'vitest'
import { INHERITED_PASSIVES, PARENT_FLAWS, PASSIVES } from '../src/data'
import { weaponSheets } from '../src/art/weapons'

const inherited = ['p_affection', 'p_acceptance', 'p_patience', 'p_courage', 'p_peoplefear']
const icons = weaponSheets().icons()

describe('inherited personality icons', () => {
  test.each(inherited)('%s is a nonempty 32×32 icon distinct from every other personality', (id) => {
    const frame = icons[id].frames[0]
    expect([frame.w, frame.h]).toEqual([32, 32])
    expect(frame.data.some((pixel) => pixel !== 0)).toBe(true)
    for (const other of [...PASSIVES, ...INHERITED_PASSIVES, ...PARENT_FLAWS]) {
      if (other.id === id) continue
      expect(Array.from(frame.data), id + ' must differ from ' + other.id).not.toEqual(
        Array.from(icons[other.id].frames[0].data)
      )
    }
  })
})

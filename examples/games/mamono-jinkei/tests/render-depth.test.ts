import { describe, expect, test } from 'vitest'
import { propSortY } from '../src/render/depth'
import { parseStage } from '../src/sim/stage-data'
import { STAGE_DATA } from '../src/stages'

describe('depth sort of tall props', () => {
  for (const [id, data] of Object.entries(STAGE_DATA)) {
    test(`${id}: heroes just inside the boss door are drawn in front of it, open or closed`, () => {
      const P = parseStage(data!)
      const door = P.props.find((p) => p.kind === 'bossdoor')!
      for (const state of ['closed', 'opening', 'open']) {
        const key = propSortY({ kind: 'bossdoor', state }, door.y)
        // Heroes sort by their foot y and are drawn after every item with a smaller key.
        for (const dy of [-40, -100, -150, 0, 20, 64]) expect(door.y + dy, `${state} dy ${dy}`).toBeGreaterThan(key)
      }
    })
  }

  test('other props keep their rules', () => {
    expect(propSortY({ kind: 'gate', state: 'open' }, 500)).toBe(460)
    expect(propSortY({ kind: 'gate', state: 'closed' }, 500)).toBe(500)
    expect(propSortY({ kind: 'pot', state: 'lifted', z: 30 }, 500)).toBe(530)
    expect(propSortY({ kind: 'crate', state: 'idle' }, 500)).toBe(500)
  })
})

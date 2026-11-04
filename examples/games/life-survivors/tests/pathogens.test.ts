import { expect, test } from 'vitest'
import { bossSheets } from '../src/art/bosses'
import { germSheet } from '../src/art/enemies'
import { SHEETS } from '../src/art/index'
import { infectionSheet, outbreakSheet } from '../src/art/pathogens'

test('infection and outbreak have animated art distinct from the cold and serious illness', () => {
  for (const [sheet, original, size] of [
    [infectionSheet(), germSheet(), 64],
    [outbreakSheet(), bossSheets['enemy:b_illness'](), 128]
  ] as const) {
    expect(sheet.move.frames).toHaveLength(6)
    for (const frame of sheet.move.frames) expect([frame.w, frame.h]).toEqual([size, size])
    expect(Buffer.from(sheet.move.frames[0].data)).not.toEqual(Buffer.from(original.move.frames[0].data))
    expect(new Set(sheet.move.frames.map((frame) => Buffer.from(frame.data).toString('hex'))).size).toBe(6)
  }
})

test.each([
  ['enemy:infection', infectionSheet],
  ['enemy:b_outbreak', outbreakSheet]
] as const)('%s uses its own art in the game', (id, make) => {
  const actual = SHEETS[id]()
  expect(actual.move.frames[0].data).toEqual(make().move.frames[0].data)
  expect(actual.flash.frames).toHaveLength(actual.move.frames.length)
})

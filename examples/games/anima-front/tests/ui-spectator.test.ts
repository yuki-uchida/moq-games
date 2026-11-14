import { describe, expect, it } from 'vitest'
import { seatButton, stepTeam } from '../src/ui/spectator'

describe('spectator bar', () => {
  it('offers 「空いた席で参加」 only while a seat is free, then waits for it', () => {
    expect(seatButton(0, 'idle')).toEqual({ show: false, enabled: false, label: '', note: '' })
    expect(seatButton(2, 'idle')).toEqual({ show: true, enabled: true, label: '空いた席で参加（2）', note: '' })
    expect(seatButton(1, 'joining')).toMatchObject({ show: true, enabled: false, label: '参加しています…' })
    // the seat went to someone else: back to watching with a short note
    expect(seatButton(0, 'failed')).toEqual({
      show: false,
      enabled: false,
      label: '',
      note: '席が埋まりました。観戦を続けます'
    })
    expect(seatButton(1, 'failed')).toMatchObject({
      show: true,
      enabled: true,
      note: '席が埋まりました。観戦を続けます'
    })
  })

  it('steps through the three teams', () => {
    expect([stepTeam(0, -1), stepTeam(2, 1), stepTeam(1, 1)]).toEqual([2, 0, 2])
  })
})

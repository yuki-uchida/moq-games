import { describe, expect, it } from 'vitest'
import { demoView } from '../src/ui/hud/demo-view'
import { hudYaw, seatButton, stepTeam } from '../src/ui/spectator'

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

  it('draws the HUD against the followed yaw, else the local look', () => {
    const v = demoView('pve', 1)
    const [a, b] = v.players
    const view = { ...v, players: [{ ...a, yaw: 1.25 }, { ...b, yaw: -2 }, ...v.players.slice(2)] }
    expect(hudYaw(view, b.id, 0.3)).toBe(-2)
    expect(hudYaw(view, a.id, 0.3)).toBe(1.25)
    expect(hudYaw(view, undefined, 0.3)).toBe(0.3)
    expect(hudYaw(view, 'gone', 0.3)).toBe(0.3)
  })
})

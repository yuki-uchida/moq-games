/** The briefing lists the local player's own team, not the first seat's. */
import { describe, expect, it } from 'vitest'
import { makeLoadout } from '../src/data/loadout'
import { buildSeats } from '../src/app/match'
import { briefingSquad } from '../src/ui/screens/briefing'

const me = (team: 0 | 1 | 2) => ({
  id: 'h1',
  name: 'ゲスト',
  species: 'cat' as const,
  loadout: makeLoadout(['bee'], [], []),
  loadoutName: 'x',
  team
})

describe('briefing squad', () => {
  it("PvP: a guest on team 1 or 2 sees that team's four members", () => {
    for (const team of [1, 2] as const) {
      const seats = buildSeats({ mode: 'pvp' }, { ...me(team), id: 'h1' }, [], 5)
      // the lobby lists the host first (team 0): the local seat is not seats[0]
      const reordered = [...seats].sort((a, b) => a.team - b.team)
      expect(reordered[0].team).toBe(0)
      const squad = briefingSquad(reordered, 'h1')
      expect(squad.watching).toBe(false)
      expect(squad.seats).toHaveLength(4)
      expect(squad.seats.every((s) => s.team === team)).toBe(true)
      expect(squad.seats.some((s) => s.id === 'h1')).toBe(true)
    }
  })

  it('a spectator gets a neutral list', () => {
    const seats = buildSeats({ mode: 'pvp' }, me(1), [], 5)
    expect(briefingSquad(seats, 'nobody', true).watching).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import { recordMatch } from '../src/app/records'
import { emptyProgress } from '../src/app/saves'
import type { View } from '../src/sim/types'

const pveWin = {
  mode: 'pve',
  phase: 'victory',
  players: [{ id: 'h0', team: 0 }],
  pve: { mission: 'sakura', difficulty: 'normal', result: { rank: 'A', score: 1234.4, time: 300 } }
} as unknown as View

const pvpWin = {
  mode: 'pvp',
  phase: 'victory',
  players: [
    { id: 'h0', team: 1 },
    { id: 'h1', team: 2 }
  ],
  pvp: { scores: [1, 9, 3], winner: 1, lastSpurt: false, suddenDeath: false }
} as unknown as View

const tutorialDone = { mode: 'training', phase: 'victory', players: [] } as unknown as View

describe('what a finished match records', () => {
  it('a player records the mission clear, best rank and unlock', () => {
    const out = recordMatch(emptyProgress(), pveWin, { me: 'h0', spectator: false, tutorial: false })
    expect(out.recorded).toBe(true)
    expect(out.progress.cleared).toContain('sakura')
    expect(out.progress.best.sakura).toMatchObject({ rank: 'A', score: 1234 })
    expect(out.newBest).toBe(true)
    expect(out.unlocked).not.toBeNull()
  })

  it('a player records the PvP result of its own team', () => {
    expect(
      recordMatch(emptyProgress(), pvpWin, { me: 'h0', spectator: false, tutorial: false }).progress
    ).toMatchObject({ pvpPlayed: 1, pvpWins: 1 })
    expect(
      recordMatch(emptyProgress(), pvpWin, { me: 'h1', spectator: false, tutorial: false }).progress
    ).toMatchObject({ pvpPlayed: 1, pvpWins: 0 })
  })

  it('a spectator records nothing: no clear, best, unlock, PvP result or tutorial', () => {
    const before = emptyProgress()
    for (const v of [pveWin, pvpWin, tutorialDone]) {
      const out = recordMatch(before, v, { me: 'h0', spectator: true, tutorial: true })
      expect(out).toEqual({ progress: before, recorded: false, newBest: false, unlocked: null })
    }
  })

  it('the tutorial counts once won', () => {
    expect(
      recordMatch(emptyProgress(), tutorialDone, { me: 'p1', spectator: false, tutorial: true }).progress.trainingDone
    ).toBe(true)
  })
})

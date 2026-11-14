/**
 * What a finished match writes to the saved progress (DESIGN §18): a PvE clear, best rank and unlock, a PvP result,
 * the tutorial's completion. A spectator plays no seat, so watching a match to the end records nothing.
 */
import type { View } from '../sim/types'
import { recordMission, recordPvp, type Progress, type Rank } from './saves'

export interface MatchRecord {
  progress: Progress
  /** False when nothing was recorded (the progress is unchanged). */
  recorded: boolean
  newBest: boolean
  unlocked: string | null
}

export function recordMatch(
  progress: Progress,
  v: View,
  opts: { me: string; spectator: boolean; tutorial: boolean }
): MatchRecord {
  const none: MatchRecord = { progress, recorded: false, newBest: false, unlocked: null }
  if (opts.spectator) return none
  if (v.mode === 'pve' && v.pve) {
    const r = v.pve.result
    const rec = r
      ? { rank: r.rank as Rank, score: Math.round(r.score), difficulty: v.pve.difficulty, time: r.time }
      : null
    const out = recordMission(progress, v.pve.mission, v.phase === 'victory', rec)
    return { progress: out.progress, recorded: true, newBest: out.newBest, unlocked: out.unlocked }
  }
  if (v.mode === 'pvp' && v.pvp) {
    const me = v.players.find((p) => p.id === opts.me)
    return { ...none, progress: recordPvp(progress, v.pvp.winner === me?.team), recorded: true }
  }
  if (v.mode === 'training' && opts.tutorial && v.phase === 'victory')
    return { ...none, progress: { ...progress, trainingDone: true }, recorded: true }
  return none
}

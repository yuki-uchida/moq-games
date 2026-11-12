/** Results, the pure part: the outcome of a finished match and who stands on the plaza doing which emote. */
import type { CastMember } from '../../app/context'
import type { Emote } from '../../models/api'
import type { View } from '../../sim/types'
import { pickMvp, placings } from '../hud/model'

export type Outcome = 'victory' | 'defeat' | 'draw'

export function outcomeOf(args: { view: View; me: string }): Outcome {
  const { view, me } = args
  if (view.mode === 'pvp') {
    const myTeam = view.players.find((p) => p.id === me)?.team ?? 0
    const w = view.pvp?.winner
    if (w === undefined || w === -1) {
      if (view.phase === 'draw' || w === -1) return 'draw'
      const places = placings(view.pvp?.scores ?? [0, 0, 0])
      const mine = places.find((p) => p.team === myTeam)
      if (!mine || mine.place > 1) return 'defeat'
      return places.filter((p) => p.place === 1).length > 1 ? 'draw' : 'victory'
    }
    return w === myTeam ? 'victory' : 'defeat'
  }
  if (view.phase === 'victory') return 'victory'
  if (view.phase === 'draw') return 'draw'
  return view.mode === 'training' ? 'victory' : 'defeat'
}

const CHEERS: readonly Emote[] = ['cheer', 'wave', 'salute']

/**
 * The squad on the results plaza: the local player's team (PvE: the whole squad), the MVP in front when it is
 * one of them. Victory: the MVP strikes the victory pose and the others cheer, wave and salute; defeat: everyone
 * slumps; a draw is a salute.
 */
export function resultsCast(view: View, me: string, outcome: Outcome): CastMember[] {
  const myTeam = view.players.find((p) => p.id === me)?.team ?? 0
  const mvp = pickMvp(view)
  const squad = view.players.filter((p) => p.team === myTeam).slice(0, 4)
  let k = 0
  return squad.map((p) => {
    const isMvp = p.id === mvp
    const emote: Emote =
      outcome === 'defeat' ? 'defeat' : outcome === 'draw' ? 'salute' : isMvp ? 'victory' : CHEERS[k++ % CHEERS.length]
    const member: CastMember = { species: p.species, emote, mvp: isMvp }
    if (view.mode === 'pvp') member.team = p.team
    return member
  })
}

/** Seconds of the PvE score count-up, and when the rank letter is stamped after it. */
export const SCORE_COUNT = { delay: 0.6, duration: 1.4 }
export const RANK_STAMP_AT = SCORE_COUNT.delay + SCORE_COUNT.duration + 0.15

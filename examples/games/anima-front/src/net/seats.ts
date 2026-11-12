/**
 * Seat assignment for online rooms (pure, unit-tested). Members are seated in join order (the host first):
 * PvE fills 4 squad seats, PvP 3 teams × 4 where each member asks for a team (the host may move them). Members
 * beyond the seats spectate; bots fill every empty seat. Human seats are named `h<join order>` in the match.
 */
import { buildSeats, SEATS_PER_TEAM, seatCount, type MatchSelection, type Seat } from '../app/match'
import type { TeamId } from '../sim/types'
import type { Profile } from './validate'

export interface SeatMember {
  /** Network id. */
  id: string
  /** Join order (0 = host); the match player id is `h<order>`. */
  order: number
  profile: Profile
  /** Host override: team `team`, valid while the member still asks for `pref`. */
  hostTeam?: { team: TeamId; pref: TeamId }
}

export interface SeatPlan {
  seats: Seat[]
  /** Member id → match player id (null: spectating). */
  bySeat: Map<string, string | null>
}

export const humanSeatId = (order: number) => `h${order}`

/** The team a member ends up asking for (the host's move wins until the member picks again). */
export function wantedTeam(m: SeatMember): TeamId {
  return m.hostTeam && m.hostTeam.pref === m.profile.team ? m.hostTeam.team : m.profile.team
}

/** Seats for the members (sorted by join order); every seat is `local: false` (the viewer marks its own). */
export function planSeats(sel: MatchSelection, members: readonly SeatMember[]): SeatPlan {
  const ordered = [...members].sort((a, b) => a.order - b.order)
  const bySeat = new Map<string, string | null>()
  const humans: (Omit<Seat, 'bot' | 'local'> & { member: string })[] = []
  if (sel.mode === 'pvp') {
    const count = [0, 0, 0]
    for (const m of ordered) {
      let team = wantedTeam(m)
      if (count[team] >= SEATS_PER_TEAM) {
        const open = ([0, 1, 2] as TeamId[]).filter((t) => count[t] < SEATS_PER_TEAM)
        if (!open.length) {
          bySeat.set(m.id, null)
          continue
        }
        team = open.reduce((a, b) => (count[b] < count[a] ? b : a))
      }
      count[team]++
      humans.push(seatOf(m, team))
    }
  } else {
    const count = seatCount(sel.mode)
    for (const m of ordered) {
      if (humans.length >= count) bySeat.set(m.id, null)
      else humans.push(seatOf(m, 0))
    }
  }
  if (!humans.length) return { seats: [], bySeat }
  const [first, ...rest] = humans
  const seats = buildSeats(sel, { ...first, team: first.team }, rest).map((s) => ({ ...s, local: false }))
  for (const h of humans) {
    bySeat.set(h.member, h.id)
    const seat = seats.find((s) => s.id === h.id)
    if (seat) seat.ready = h.ready
  }
  return { seats, bySeat }
}

function seatOf(m: SeatMember, team: TeamId): Omit<Seat, 'bot' | 'local'> & { member: string } {
  return {
    member: m.id,
    id: humanSeatId(m.order),
    name: m.profile.name,
    species: m.profile.species,
    loadout: m.profile.loadout,
    loadoutName: m.profile.loadoutName,
    team,
    ready: m.profile.ready
  }
}

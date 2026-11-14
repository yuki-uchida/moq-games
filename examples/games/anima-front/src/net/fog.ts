/**
 * Fading for enemies that leave or enter a team's sight (PvP, DESIGN §18). A hidden enemy is a player waiting off
 * the field in the merged view (split.ts hiddenPlayer); drawn as it is, it would vanish in one frame. Fog keeps
 * each enemy's last sighting and, at draw time,
 *
 * - shows an enemy that just went out of sight where it was last seen, frozen, its camouflage rising to 1 over
 *   FADE seconds (then it is gone: no stale ghost stays behind);
 * - lets an enemy that comes into sight fade in over FADE seconds from where it really is (interpolation snaps
 *   from the hidden placeholder, so it never slides in from an old position).
 */
import type { MatchConfig, PlayerView, TeamId, View } from '../sim/types'
import { hiddenPlayer } from './split'

export const FADE = 0.35

export class Fog {
  private readonly last = new Map<string, PlayerView>()
  private readonly lastSeen = new Map<string, number>()
  private readonly shownAt = new Map<string, number>()
  private readonly hidden = new Set<string>()
  private prevTime: number | undefined

  constructor(readonly team: TeamId) {}

  /** The enemy's last sighting (what this team already knew). */
  lastOf(id: string): PlayerView | undefined {
    return this.last.get(id)
  }

  /** Records one snapshot: `view` holds the known players as they are, `hidden` the enemies out of sight. */
  observe(view: View, hidden: ReadonlySet<string>) {
    const t = view.time
    for (const p of view.players) {
      if (p.team === this.team) continue
      if (hidden.has(p.id)) {
        this.hidden.add(p.id)
        continue
      }
      if (this.hidden.delete(p.id) || !this.last.has(p.id))
        this.shownAt.set(p.id, Math.max(this.prevTime ?? t, t - 0.1))
      this.last.set(p.id, p)
      this.lastSeen.set(p.id, t)
    }
    this.prevTime = t
  }

  /** The view drawn at host time `t` (`hidden`: the enemies out of sight in the snapshot at or after t). */
  present(view: View, hidden: ReadonlySet<string>, t: number): View {
    let changed = false
    const players = view.players.map((p) => {
      if (p.team === this.team) return p
      if (hidden.has(p.id)) {
        const last = this.last.get(p.id)
        const seen = this.lastSeen.get(p.id)
        if (!last || seen === undefined || t >= seen + FADE || last.state !== 'alive') return p
        changed = true
        const k = Math.max(0, (t - seen) / FADE)
        return {
          ...last,
          name: p.name,
          bot: p.bot,
          stats: p.stats,
          v: [0, 0, 0],
          move: 'idle',
          revealed: false,
          cloak: Math.max(last.cloak, k)
        } as PlayerView
      }
      const shown = this.shownAt.get(p.id)
      if (shown === undefined || t >= shown + FADE || p.state === 'away') return p
      changed = true
      return { ...p, cloak: Math.max(p.cloak, 1 - Math.max(0, t - shown) / FADE) }
    })
    return changed ? { ...view, players } : view
  }
}

/**
 * The host's own screen in PvP: the same boundary as its guests (enemies its team cannot see are hidden), from
 * the full view the host steps.
 */
export function hideUnknown(view: View, team: TeamId, known: ReadonlySet<string>, fog: Fog): View {
  let changed = false
  const players = view.players.map((p) => {
    if (p.team === team || known.has(p.id)) return p
    changed = true
    const cfg = { id: p.id, name: p.name, team: p.team, species: p.species, bot: p.bot ? 1 : undefined }
    return hiddenPlayer(
      cfg as MatchConfig['players'][number],
      [p.name, p.bot ? 1 : 0, p.stats.kos, p.stats.assists, p.stats.downs],
      fog.lastOf(p.id)
    )
  })
  return changed ? { ...view, players } : view
}

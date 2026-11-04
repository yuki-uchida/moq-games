import type { GameState } from './game'

export const INITIAL_DISCOVERY_SECONDS = 2
export const LEGACY_DISCOVERY_LIMIT = 128

/**
 * New hosts retain one cumulative counter per current player, not an event queue.
 * A delivered increase produces one cue per target even across dropped snapshots;
 * multiple discoveries between updates coalesce and only the latest position survives.
 * First reception replays only recorded discoveries at most two simulation seconds old.
 * Legacy pair counters have a 128-entry LRU dedup window: evicted pairs may replay.
 * Leave/rejoin and restart must reset observers; unseen departures cannot be detected.
 */
export class DiscoveryTracker {
  private previous = new Map<string, number>()
  private legacyEligibleTargets = new Set<string>()
  private time = -Infinity
  private phase: GameState['phase'] | undefined

  reset(): void {
    this.previous.clear()
    this.legacyEligibleTargets.clear()
    this.time = -Infinity
    this.phase = undefined
  }

  update(state: GameState): NonNullable<GameState['discoveries']> {
    if (state.time < this.time) return []
    const initial = this.time === -Infinity
    const previousTime = this.time
    const previousPhase = this.phase
    const justLost = this.phase === 'playing' && state.phase === 'lost'
    this.time = state.time
    this.phase = state.phase
    const players = new Set(state.players.map((player) => player.id))
    for (const key of this.previous.keys()) {
      if (!players.has(JSON.parse(key)[0])) this.previous.delete(key)
    }
    const events: NonNullable<GameState['discoveries']> = []
    for (const entry of state.discoveries ?? []) {
      if (!players.has(entry.targetId)) continue
      const key = JSON.stringify([entry.targetId, entry.time === undefined ? entry.predatorId : null])
      const before = this.previous.get(key) ?? 0
      if (entry.count > before) {
        if (
          (entry.stage === undefined || entry.stage === state.stage) &&
          (state.phase === 'playing' ||
            (state.phase === 'lost' &&
              (previousPhase === 'playing' || previousPhase === 'lost') &&
              entry.time !== undefined &&
              entry.time > previousTime &&
              entry.time <= state.time)) &&
          (!initial || (entry.time !== undefined && state.time - entry.time <= INITIAL_DISCOVERY_SECONDS))
        )
          events.push(entry)
        this.previous.delete(key)
        this.previous.set(key, entry.count)
      }
    }
    if (state.discoveries === undefined && (state.phase === 'playing' || justLost)) {
      for (const predator of state.predators) {
        const target = state.players.find((player) => player.downed && player.id === predator.targetId)
        if (
          predator.state === 'chase' &&
          target &&
          (initial || (previousPhase === 'playing' && this.legacyEligibleTargets.has(target.id))) &&
          !events.some((entry) => entry.targetId === target.id)
        )
          events.push({
            predatorId: predator.id,
            targetId: target.id,
            count: 1,
            time: state.time,
            x: predator.x,
            y: predator.y,
            z: predator.z
          })
      }
    }
    this.legacyEligibleTargets = new Set(
      state.players
        .filter(
          (player) =>
            !player.downed &&
            !state.predators.some((predator) => predator.state === 'chase' && predator.targetId === player.id)
        )
        .map((player) => player.id)
    )
    while (this.previous.size > LEGACY_DISCOVERY_LIMIT) this.previous.delete(this.previous.keys().next().value!)
    return events
  }
}

import { carry, missions, seeded, type Formation, type Game, type Roster } from './game'
import { UNIT_MODEL_CATALOG } from '../../tower_diffence_with_jev/src/rendering/models/catalog'

export type Difficulty = 'casual' | 'classic'
export type Snapshot = Omit<Game, 'rng' | 'rocks' | 'groves'> & { rngState: number; rocks: string[]; groves: string[] }
export type Save = {
  version: 1
  difficulty: Difficulty
  formation: Formation
  checkpoints: (Roster | undefined)[]
  furthest: number
  cleared: number[]
  bestTurns: Record<number, number>
  completedAt?: string
  finale?: Snapshot
  suspend?: Snapshot
}
export const saveKey = 'ember-grid:save:v1'
export const freshSave = (difficulty: Difficulty): Save => ({
  version: 1,
  difficulty,
  formation: 'balanced',
  checkpoints: [],
  furthest: 0,
  cleared: [],
  bestTurns: {}
})
export const unlocked = (save: Save, stage: number) =>
  Number.isInteger(stage) && stage >= 0 && stage < missions.length && stage <= save.furthest
export function snapshotGame(game: Game): Snapshot {
  const { rng, ...rest } = game
  return structuredClone({
    ...rest,
    rocks: [...game.rocks],
    groves: [...game.groves],
    rngState: (rng as { state?: number }).state ?? 0
  })
}
export function restoreGame(snapshot: Snapshot): Game {
  const { rngState, rocks, groves, ...rest } = snapshot
  return { ...structuredClone(rest), rocks: new Set(rocks), groves: new Set(groves), rng: seeded(rngState) }
}
export function carryForDifficulty(game: Game, difficulty: Difficulty): Roster {
  if (difficulty === 'classic') return carry(game)
  return carry({
    ...game,
    units: game.units.map((unit) => (unit.side === 'ally' ? { ...unit, hp: Math.max(1, unit.hp) } : unit))
  })
}
export function readSave(notice: () => void): Save | undefined {
  try {
    const raw = localStorage.getItem(saveKey)
    if (!raw) return undefined
    const save: Save = JSON.parse(raw)
    const numeric = (value: unknown) => typeof value === 'number' && Number.isFinite(value)
    const validRoster = (roster: Roster | undefined) =>
      !roster ||
      (typeof roster === 'object' &&
        !Array.isArray(roster) &&
        Object.values(roster).every(
          (unit) =>
            unit && ['level', 'exp', 'max', 'power', 'def'].every((field) => numeric(unit[field as keyof typeof unit]))
        ))
    const validUnit = (unit: Game['units'][number]) =>
      unit &&
      typeof unit.id === 'string' &&
      typeof unit.name === 'string' &&
      typeof unit.role === 'string' &&
      Object.hasOwn(UNIT_MODEL_CATALOG, unit.role) &&
      ['ally', 'enemy'].includes(unit.side) &&
      [
        'x',
        'y',
        'hp',
        'max',
        'power',
        'range',
        'move',
        'level',
        'exp',
        'def',
        'startLevel',
        'gained',
        'kills',
        'dealt'
      ].every((field) => numeric(unit[field as keyof typeof unit])) &&
      typeof unit.moved === 'boolean' &&
      typeof unit.done === 'boolean'
    const validSnapshot = (snapshot: Snapshot, phase: Game['phase']) =>
      Array.isArray(snapshot.units) &&
      snapshot.units.length > 0 &&
      snapshot.units.every(validUnit) &&
      new Set(snapshot.units.map((unit) => unit.id)).size === snapshot.units.length &&
      numeric(snapshot.turn) &&
      numeric(snapshot.potions) &&
      typeof snapshot.log === 'string' &&
      snapshot.phase === phase &&
      ['balanced', 'guard'].includes(snapshot.formation) &&
      Array.isArray(snapshot.rocks) &&
      Array.isArray(snapshot.groves) &&
      Number.isInteger(snapshot.rngState) &&
      unlocked(save, snapshot.stage)
    if (
      save.version !== 1 ||
      !['casual', 'classic'].includes(save.difficulty) ||
      !['balanced', 'guard'].includes(save.formation) ||
      !Array.isArray(save.checkpoints) ||
      !save.checkpoints.every(validRoster) ||
      !Number.isInteger(save.furthest) ||
      save.furthest < 0 ||
      save.furthest >= missions.length ||
      !Array.isArray(save.cleared) ||
      !save.bestTurns ||
      (save.completedAt !== undefined && typeof save.completedAt !== 'string') ||
      (save.suspend && !validSnapshot(save.suspend, 'ally')) ||
      (save.finale && (!validSnapshot(save.finale, 'won') || save.finale.stage !== missions.length - 1))
    )
      throw new Error('Invalid save')
    return save
  } catch {
    notice()
    return undefined
  }
}
export function writeSave(save: Save, notice: () => void) {
  try {
    localStorage.setItem(
      saveKey,
      JSON.stringify(save, (_key, value: unknown) => (value instanceof Set ? [...value] : value))
    )
  } catch {
    notice()
  }
}

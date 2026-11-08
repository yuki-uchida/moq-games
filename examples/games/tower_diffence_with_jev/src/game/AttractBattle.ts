import { RuleBasedAI } from '../ai/AIController'
import { freshProfile, freshRunFromProfile } from '../progression/ProgressionData'
import { battleFormation, freshStageProgress, stageStartGold } from '../progression/StageProgress'
import type { BreathMouthTracks } from './BreathGeometry'
import { GameEngine } from './GameEngine'
import { DEFINITIONS, fieldFor, type AllyType, stageRules, type GameState, type Point, type UnitType } from './model'
import { specialReady } from './SpecialAbilities'
import { autoShouldCast, bestSpecialTarget, bossInSpecialArea } from './SpecialTargeting'

/** Title-screen demonstration battle. It owns a private engine, save and AI; nothing here is persisted. */
export const ATTRACT_LAYOUT_REVISION = 4
/** Restart a battle that runs this long in game time, even if undecided. */
export const ATTRACT_MAX_BATTLE_SECONDS = 150
/** Keep the finished field on screen briefly before the next battle. */
export const ATTRACT_END_HOLD_SECONDS = 3
/** The simulation never advances more than this per call, however long a frame took. */
export const ATTRACT_MAX_STEP_SECONDS = 0.05
/** Battles open this far in, so the first seconds on screen already show the road being defended. */
export const ATTRACT_WARMUP_SECONDS = 15
const FIRST_SEED = 20261108
const SPECIAL_CHECK_SECONDS = 0.25
const SPECIAL_SPACING_SECONDS = 0.6

/** Loop 0 is fixed (stable for tests); later loops alternate the two lightest stages with new seeds. */
export function attractStage(loop: number): number {
  return loop % 2 === 0 ? 1 : 2
}
export function attractSeed(loop: number): number {
  return loop === 0 ? FIRST_SEED : (FIRST_SEED + Math.imul(loop, 7919)) >>> 0
}

/** Pick a defended ground point per ally: the slot that covers the most road within its reach. */
export function attractPlacements(engine: GameEngine, types: readonly AllyType[]): { type: AllyType; point: Point }[] {
  const field = fieldFor(engine.state),
    samples: Point[] = []
  for (let i = 1; i < field.path.length; i++) {
    const a = field.path[i - 1],
      b = field.path[i],
      steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 16))
    for (let step = 0; step < steps; step++)
      samples.push({ x: a.x + ((b.x - a.x) * step) / steps, y: a.y + ((b.y - a.y) * step) / steps })
  }
  // Melee holds the road first; ranged allies then cover the same stretch from behind.
  const order = [...types].sort((a, b) => DEFINITIONS[a].range - DEFINITIONS[b].range)
  const chosen: { type: AllyType; point: Point }[] = []
  for (const type of order) {
    const definition = DEFINITIONS[type],
      reach = definition.range + definition.leash + 24
    let best: { point: Point; score: number } | null = null
    for (const slot of field.slots) {
      if (chosen.some((other) => Math.hypot(other.point.x - slot.x, other.point.y - slot.y) < 60)) continue
      if (!engine.previewPlacement(type, slot).valid) continue
      let score = 0
      for (const [index, sample] of samples.entries())
        if (Math.hypot(sample.x - slot.x, sample.y - slot.y) <= reach) score += 1 + index / samples.length
      // Stay near the allies already placed, so the defence fights together.
      for (const other of chosen) score -= Math.max(0, Math.hypot(other.point.x - slot.x, other.point.y - slot.y) - 260) * 0.05
      if (!best || score > best.score) best = { point: { x: slot.x, y: slot.y }, score }
    }
    if (best) chosen.push({ type, point: best.point })
  }
  return chosen
}

export interface AttractBattle {
  readonly engine: GameEngine
  readonly loop: number
  /** Game seconds since the assault began, including the end hold. */
  readonly elapsed: number
  readonly specialsCast: number
  /** True once the battle has finished (or timed out) and the end hold has elapsed. */
  readonly finished: boolean
  advance(dt: number): void
}

/** A fresh stage battle with the starter formation, placed and already assaulting. */
export function createAttractBattle(
  loop: number,
  options: { breathMouths?: BreathMouthTracks; specialReady?: (type: AllyType) => boolean } = {}
): AttractBattle {
  const stage = attractStage(loop)
  const save = freshRunFromProfile(freshProfile(), 2)
  save.gold = stageStartGold(stage)
  save.formation = battleFormation(freshStageProgress(), stage)
  let clockMs = 0
  const engine = new GameEngine(
    new RuleBasedAI(),
    save,
    'meadow',
    attractSeed(loop),
    () => clockMs,
    options.breathMouths,
    2,
    ATTRACT_LAYOUT_REVISION
  )
  engine.startAtStage(stage)
  for (const { type, point } of attractPlacements(engine, save.formation)) engine.place(type, point)
  engine.startAssault()
  let elapsed = 0,
    endedAt: number | null = null,
    nextSpecialCheck = 0,
    lastCastAt = -Infinity,
    specialsCast = 0
  const readySince = new Map<number, number>()
  const castReady = (state: Readonly<GameState>) => {
    let best: { id: number; point: Point; score: number } | null = null
    for (const unit of state.units) {
      if (unit.owner !== 'player') continue
      if (!specialReady(state, unit.id)) {
        readySince.delete(unit.id)
        continue
      }
      if (!readySince.has(unit.id)) readySince.set(unit.id, state.time)
      const type = unit.type as AllyType
      if (options.specialReady && !options.specialReady(type)) continue
      const target = bestSpecialTarget(state, unit.id)
      if (
        !target ||
        !autoShouldCast(type, target.score, bossInSpecialArea(state, type, target.point), state.time - readySince.get(unit.id)!)
      )
        continue
      if (!best || target.score > best.score) best = { id: unit.id, point: target.point, score: target.score }
    }
    if (best && engine.castSpecial(best.id, best.point)) {
      lastCastAt = elapsed
      specialsCast++
    }
  }
  return {
    engine,
    loop,
    get elapsed() {
      return elapsed
    },
    get specialsCast() {
      return specialsCast
    },
    get finished() {
      return endedAt !== null && elapsed - endedAt >= ATTRACT_END_HOLD_SECONDS
    },
    advance(dt: number) {
      if (!Number.isFinite(dt) || dt <= 0) return
      const step = Math.min(dt, ATTRACT_MAX_STEP_SECONDS)
      elapsed += step
      clockMs += step * 1000
      const state = engine.state
      if (state.phase === 'assault') {
        engine.update(step)
        if (elapsed >= nextSpecialCheck && elapsed - lastCastAt >= SPECIAL_SPACING_SECONDS) {
          nextSpecialCheck = elapsed + SPECIAL_CHECK_SECONDS
          if (state.phase === 'assault') castReady(state)
        }
      }
      // The demo is silent and has no HUD: discard presentation queues the real game would consume.
      engine.takeCombatSounds()
      engine.takeSpecialImpacts()
      if (endedAt === null && (state.phase !== 'assault' || elapsed >= ATTRACT_MAX_BATTLE_SECONDS)) endedAt = elapsed
    }
  }
}

/** Every unit type a demo battle can show, so its renderer prepares only those. */
export function attractUnitTypes(state: Readonly<GameState>): Set<UnitType> {
  const wave = stageRules(state.stage, state.waveBossPolicy)
  const types = new Set<UnitType>([...state.units.map((unit) => unit.type), ...wave.enemyTypes])
  if (wave.bossType) types.add(wave.bossType)
  return types
}

/** Advance a fresh battle off screen, yielding so rule-AI decisions resolve and the page stays responsive. */
export async function warmUpAttractBattle(
  battle: AttractBattle,
  seconds = ATTRACT_WARMUP_SECONDS,
  signal?: AbortSignal,
  yieldToPage: () => Promise<void> = () => new Promise((resolve) => setTimeout(resolve, 0))
): Promise<void> {
  for (let step = 0; battle.elapsed < seconds - 1e-9 && battle.engine.state.phase === 'assault'; step++) {
    signal?.throwIfAborted()
    battle.advance(ATTRACT_MAX_STEP_SECONDS)
    await Promise.resolve()
    await Promise.resolve()
    if (step % 20 === 19) await yieldToPage()
  }
}

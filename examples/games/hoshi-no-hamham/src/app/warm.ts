/**
 * Warm-up: the game's pixel art is drawn by code the first time it is used, which costs a few to tens of
 * milliseconds per clip. Everything a screen or a stage will draw is built here instead, in slices with a yield to the
 * browser between them, so a splash or a story page keeps moving and the first frames of play stay cheap.
 *
 * `stageArt` lists what a stage draws (pure, unit-tested against the stage data and the art contract),
 * `stageWarmSteps` turns it into slices, `runSteps` runs slices and reports progress, `warmStage` ties them
 * together and remembers a finished or running warm-up per stage.
 */
import { backdrop, sheet, type ThemeId } from '../art'
import { themedProp } from '../art/contract'
import { World } from '../game/sim'
import type { StageDef } from '../game/types'
import { bakeBackdrop, warmClip } from '../view/bake'

/** What a stage draws: sheet ids, which of them also need hit-flash silhouettes, and the world's backdrop. */
export interface StageArt {
  sheets: string[]
  flash: string[]
  backdrop: ThemeId
}

/** The shot sprite a boss throws (mirrors the simulation's `bossSkin`). */
const bossShot = (art: string) =>
  art === 'crowBoss' ? 'feather' : art === 'beeBoss' ? 'stinger' : art === 'foxBoss' || art === 'king' ? 'orb' : 'seed'

export function stageArt(stage: StageDef): StageArt {
  const world = new World(stage, { seed: stage.no * 7919 + 101 })
  const sheets = new Set<string>(['ui', 'fx', 'hero'])
  const flash = new Set<string>(['hero'])
  const enemyKinds = new Set<string>(world.enemies.map((enemy) => enemy.kind))
  const boss = stage.boss
  for (const kind of boss.minions) enemyKinds.add(kind)
  for (const kind of enemyKinds) {
    sheets.add(kind)
    flash.add(kind)
  }
  sheets.add(boss.art)
  flash.add(boss.art)

  for (const prop of world.props) {
    switch (prop.kind) {
      case 'tree':
      case 'pine':
        // Each world draws its own tree and log (see `themedProp`).
        sheets.add(themedProp(`prop:${prop.kind}`, stage.theme))
        sheets.add(themedProp('prop:log', stage.theme))
        break
      case 'switch':
        sheets.add(`prop:switch${prop.data === 2 ? 2 : 1}`)
        break
      case 'door':
        sheets.add(`prop:door${prop.data === 2 ? 2 : 1}`)
        break
      case 'princess':
        sheets.add('princess')
        sheets.add('prop:cage')
        break
      case 'hive':
        sheets.add('prop:hive')
        sheets.add('prop:bee')
        break
      default:
        sheets.add(`prop:${prop.kind}`)
    }
  }
  if (boss.kind !== 'chaser') sheets.add('prop:gate')
  if (boss.projectiles > 0) sheets.add(`prop:${bossShot(boss.art)}`)
  if (boss.shockwave) sheets.add('prop:shock')
  if (enemyKinds.has('spitter')) sheets.add('prop:seed')
  if (boss.art === 'beeBoss') sheets.add('prop:bee')
  return { sheets: [...sheets], flash: [...flash], backdrop: stage.theme }
}

/** One slice of warm-up work: drawing one animation clip (and its hit-flash silhouette) and baking the result. */
export interface WarmStep {
  label: string
  /** Rough cost relative to a small clip, so the progress bar moves evenly in time. */
  weight: number
  run: () => void
}

/** Relative cost of drawing one clip of a sheet (measured: a boss or king clip 20–80 ms, a small clip a few ms). */
const clipWeight = (id: string) => (id.endsWith('Boss') || id === 'king' ? 4 : 1)

/** One slice per clip of every sheet the stage draws, then the backdrop; no slice is longer than a clip. */
export function stageWarmSteps(stage: StageDef): WarmStep[] {
  const art = stageArt(stage)
  const steps: WarmStep[] = art.sheets.flatMap((id) =>
    Object.keys(sheet(id)).map((name) => ({
      label: `${id}.${name}`,
      weight: clipWeight(id),
      run: () => void warmClip(id, name, art.flash.includes(id))
    }))
  )
  steps.push({ label: `backdrop:${art.backdrop}`, weight: 3, run: () => void bakeBackdrop(backdrop(art.backdrop)) })
  return steps
}

/**
 * Yields to the browser with a macrotask, so input, timers and (at least once per ~50 ms) a rendering
 * opportunity run between two slices. A microtask would not let anything in.
 */
let lastFrameYield = 0
export function yieldToBrowser(): Promise<void> {
  const now = performance.now()
  if (typeof document !== 'undefined' && !document.hidden && now - lastFrameYield > 50) {
    lastFrameYield = now
    return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))
  }
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/** User-timing marks (visible in the performance panel and to the loading measurements). */
export const mark = (name: string) => void performance.mark?.(name)

export type Progress = (fraction: number) => void

/**
 * How long slices may run back to back before the browser gets a turn. Most clips take a few milliseconds, so
 * yielding after each one would spend more time in the yields than in the drawing; a slice is never longer than
 * one clip plus this budget.
 */
export const SLICE_BUDGET_MS = 8

/**
 * Runs the slices one after another, yielding to the browser whenever `budgetMs` has passed since the last
 * yield (and once at the end); reports the finished weight as 0..1.
 */
export async function runSteps(
  steps: readonly WarmStep[],
  onProgress?: Progress,
  yielder: () => Promise<void> = yieldToBrowser,
  budgetMs = SLICE_BUDGET_MS,
  now: () => number = () => performance.now()
): Promise<void> {
  const total = steps.reduce((sum, step) => sum + step.weight, 0) || 1
  let done = 0
  let sliceStart = now()
  onProgress?.(0)
  for (const [index, step] of steps.entries()) {
    step.run()
    mark(`hamham:warm:${step.label}`)
    done += step.weight
    onProgress?.(Math.min(1, done / total))
    if (index === steps.length - 1 || now() - sliceStart >= budgetMs) {
      await yielder()
      sliceStart = now()
    }
  }
  onProgress?.(1)
}

const warming = new Map<number, Promise<void>>()
const listeners = new Map<number, Set<Progress>>()
const finished = new Set<number>()

/** True once the stage's warm-up has completed. */
export const isWarm = (stage: StageDef) => finished.has(stage.no)

/**
 * Warms everything a stage will draw. Safe to call again for the same stage (a story screen and a retry may
 * both ask): the running or finished warm-up is shared, and every caller gets progress reports.
 */
export function warmStage(stage: StageDef, onProgress?: Progress): Promise<void> {
  const subscribers = listeners.get(stage.no) ?? new Set<Progress>()
  listeners.set(stage.no, subscribers)
  if (onProgress) {
    subscribers.add(onProgress)
    if (isWarm(stage)) onProgress(1)
  }
  let promise = warming.get(stage.no)
  if (!promise) {
    promise = runSteps(stageWarmSteps(stage), (fraction) => {
      for (const subscriber of subscribers) subscriber(fraction)
    }).then(
      () => {
        finished.add(stage.no)
        subscribers.clear()
      },
      (error) => {
        // A failed warm-up can be asked for again; the stage still plays (art then builds on first use).
        warming.delete(stage.no)
        subscribers.clear()
        throw error
      }
    )
    warming.set(stage.no, promise)
  }
  return promise
}

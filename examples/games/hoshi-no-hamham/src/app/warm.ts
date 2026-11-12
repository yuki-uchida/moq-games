/**
 * Warm-up: the game's pixel art is drawn by code the first time it is used, which costs a few to tens of
 * milliseconds per clip and a few per terrain tile. Everything a screen or a stage will draw is made ready here
 * instead: painted by the art workers and adopted and baked on the page in small slices (or, without workers,
 * painted on the page in slices with a yield to the browser between them), so a splash or a story page keeps moving
 * and play never paints.
 *
 * `stageArt` lists what a stage draws (pure, unit-tested against the stage data and the art contract),
 * `stageWarmSteps` turns it into slices, `runSteps` runs slices and reports progress, `warmStage` ties them
 * together and remembers a finished or running warm-up per stage.
 */
import { backdrop, backdropReady, clipReady, decor, flashReady, hasTile, sheet, tile, type ThemeId } from '../art'
import { themedProp } from '../art/contract'
import { adopt, sharedArtSource, type ArtReply, type ArtRequest, type ArtSource } from '../art/remote'
import { TILE, World } from '../game/sim'
import type { StageDef } from '../game/types'
import { bake, bakeBackdrop, warmClip } from '../view/bake'
import { stageTileQueries } from '../view/terrain'

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
      case 'rock':
        // A broken rock may drop a fruit.
        sheets.add('prop:rock')
        sheets.add('prop:fruit')
        break
      default:
        sheets.add(`prop:${prop.kind}`)
    }
  }
  // On the nest stage digging and felled trees drop building material.
  if (stage.objective === 'collect') {
    sheets.add('prop:twig')
    sheets.add('prop:berry')
  }
  if (boss.kind !== 'chaser') sheets.add('prop:gate')
  if (boss.projectiles > 0) sheets.add(`prop:${bossShot(boss.art)}`)
  if (boss.shockwave) sheets.add('prop:shock')
  if (enemyKinds.has('spitter')) sheets.add('prop:seed')
  if (boss.art === 'beeBoss') sheets.add('prop:bee')
  return { sheets: [...sheets], flash: [...flash], backdrop: stage.theme }
}

/** Sheets the App draws as soon as it is built, besides its first stage's (the nest-material icon of the HUD). */
export const APP_SHEETS = ['prop:twig']

/** One slice of warm-up work: one animation clip, the backdrop, the decorations or a batch of terrain tiles. */
export interface WarmStep {
  label: string
  /** Rough cost relative to a small clip, so the progress bar moves evenly in time. */
  weight: number
  /** Bakes the step's art; whatever was not adopted from a worker is painted here first. */
  run: () => void
  /** What a worker can paint for this step (adopted before `run`). */
  request?: ArtRequest
  /** True when the step's art is already here, so nothing has to be asked for. */
  ready?: () => boolean
}

/** Relative cost of drawing one clip of a sheet (measured: a boss or king clip 20–80 ms, a small clip a few ms). */
const clipWeight = (id: string) => (id.endsWith('Boss') || id === 'king' ? 4 : 1)

/** Tiles asked for per request: enough to keep a worker busy, few enough that progress moves. */
export const TILES_PER_STEP = 32
/** A batch of tiles costs about as much as a few small clips (a dirt tile 4–5 ms, a solid one about 1 ms). */
const TILES_WEIGHT = 6

/** One slice per clip of the sheets (with hit-flash silhouettes for those in `flash`). */
export function clipSteps(sheets: readonly string[], flash: readonly string[] = []): WarmStep[] {
  return sheets.flatMap((id) =>
    Object.keys(sheet(id)).map((name) => {
      const withFlash = flash.includes(id)
      return {
        label: `${id}.${name}`,
        weight: clipWeight(id),
        run: () => void warmClip(id, name, withFlash),
        request: { kind: 'clip', sheet: id, clip: name, flash: withFlash } as const,
        ready: () => clipReady(id, name) && (!withFlash || flashReady(id, name))
      }
    })
  )
}

/**
 * One slice per clip of every sheet the stage draws, then the backdrop, the world's decorations and every terrain
 * tile of the map as it starts (nearest to the hero first); no slice is longer than a clip.
 */
export function stageWarmSteps(stage: StageDef): WarmStep[] {
  const art = stageArt(stage)
  const theme = art.backdrop
  const steps = clipSteps(art.sheets, art.flash)
  steps.push({
    label: `backdrop:${theme}`,
    weight: 3,
    run: () => void bakeBackdrop(backdrop(theme)),
    request: { kind: 'backdrop', theme },
    ready: () => backdropReady(theme)
  })
  steps.push({
    label: `decor:${theme}`,
    weight: 1,
    // Small: drawn and baked here.
    run: () => {
      for (const d of decor(theme)) bake(d.image)
    }
  })
  const world = new World(stage, { seed: stage.no * 7919 + 101 })
  const queries = stageTileQueries(world, Math.floor(world.player.x / TILE))
  for (let from = 0; from < queries.length; from += TILES_PER_STEP) {
    const batch = queries.slice(from, from + TILES_PER_STEP)
    steps.push({
      label: `tiles:${theme}:${from / TILES_PER_STEP}`,
      weight: TILES_WEIGHT,
      run: () => {
        for (const q of batch) bake(tile(q))
      },
      request: { kind: 'tiles', queries: batch },
      ready: () => batch.every(hasTile)
    })
  }
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

interface Asked {
  request: ArtRequest
  promise: Promise<ArtReply>
  settled: boolean
}

/**
 * Runs the slices one after another, yielding to the browser whenever `budgetMs` has passed since the last
 * yield (and once at the end); reports the finished weight as 0..1.
 *
 * With a `source`, every request goes out at once (the workers work through them meanwhile) and each answer is
 * adopted and baked here in order as it arrives. A step whose art is already here asks for nothing; one whose
 * request fails is painted here by its `run`.
 */
export async function runSteps(
  steps: readonly WarmStep[],
  onProgress?: Progress,
  yielder: () => Promise<void> = yieldToBrowser,
  budgetMs = SLICE_BUDGET_MS,
  now: () => number = () => performance.now(),
  source?: ArtSource
): Promise<void> {
  const total = steps.reduce((sum, step) => sum + step.weight, 0) || 1
  const asked = steps.map((step): Asked | undefined => {
    if (!source || !step.request || step.ready?.()) return undefined
    const entry: Asked = { request: step.request, promise: source.request(step.request), settled: false }
    const settle = () => void (entry.settled = true)
    entry.promise.then(settle, settle)
    return entry
  })
  let done = 0
  let sliceStart = now()
  onProgress?.(0)
  for (const [index, step] of steps.entries()) {
    const entry = asked[index]
    if (entry) {
      // Waiting for a worker is not work: the answer arrives in a task of its own, which starts a new slice.
      const waited = !entry.settled
      try {
        adopt(entry.request, await entry.promise)
      } catch {
        // Painted here by `run` below.
      }
      if (waited) sliceStart = now()
    }
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

/** True once the stage's warm-up has completed: everything it draws, terrain tiles included, is baked. */
export const isWarm = (stage: StageDef) => finished.has(stage.no)

/**
 * Warms everything a stage will draw, through the app's art source when the boot has made one. Safe to call again
 * for the same stage (a story screen and a retry may both ask): the running or finished warm-up is shared, and
 * every caller gets progress reports.
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
    const source = sharedArtSource()
    promise = runSteps(
      stageWarmSteps(stage),
      (fraction) => {
        for (const subscriber of subscribers) subscriber(fraction)
      },
      yieldToBrowser,
      SLICE_BUDGET_MS,
      () => performance.now(),
      source
    ).then(
      () => {
        finished.add(stage.no)
        subscribers.clear()
        // The page holds everything now: the workers need not keep their copies.
        if (source?.remote) void source.request({ kind: 'trim' }).catch(() => {})
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

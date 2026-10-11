import { getField, type GameState, type LayoutRevision } from '../game/model'
import { AUTHORED_ROSTER, DIRECTIONS, MOTIONS } from './AuthoredRoster'
import { environmentMatchesField, loadEnvironmentArt, type EnvironmentArt } from './EnvironmentArt'
import { RuntimeAtlasCache } from './RuntimeAtlasCache'
import {
  ALL_TRIAL_TYPES,
  unitTrialClips,
  unitTrialOwner,
  type UnitTrialArt,
  type UnitTrials,
  type UnitTrialType
} from './UnitArtTrial'
import type { SpriteDirection } from './UnitSprites'

export type ArtMode = '2d' | '3d'
export interface ArtSwitchStatus {
  readonly target?: ArtMode
  readonly status: 'idle' | 'loading' | 'ready' | 'error'
  readonly error?: string
}
export interface ArtSwitchBody {
  readonly type: UnitTrialType
  readonly direction: SpriteDirection
}
interface PreparedArt {
  readonly mode: ArtMode
  readonly cache: RuntimeAtlasCache
  readonly trials: UnitTrials
  readonly clips: Readonly<Record<string, string>>
  readonly environment?: EnvironmentArt
}
interface ArtSwitchOptions {
  readonly mode: ArtMode
  readonly state: Readonly<GameState>
  readonly standardClips: Readonly<Record<string, string>>
  readonly catalog: Readonly<Record<UnitTrialType, UnitTrialArt>>
  readonly base: URL
  readonly portraits: readonly string[]
  readonly cache: RuntimeAtlasCache
  readonly loadEnvironment?: typeof loadEnvironmentArt
  readonly loadPortraits?: typeof loadArtPortraits
}

export function loadArtPortraits(urls: readonly string[], signal: AbortSignal): Promise<void> {
  return Promise.all(
    urls.map(
      (url) =>
        new Promise<void>((resolve, reject) => {
          const image = new Image()
          const cleanup = () => {
            signal.removeEventListener('abort', abort)
            image.onload = image.onerror = null
          }
          const abort = () => {
            cleanup()
            image.src = ''
            reject(signal.reason)
          }
          if (signal.aborted) return abort()
          signal.addEventListener('abort', abort, { once: true })
          image.onload = () => {
            cleanup()
            resolve()
          }
          image.onerror = () => {
            cleanup()
            reject(new Error(`Portrait could not be loaded: ${url}`))
          }
          image.src = url
        })
    )
  ).then(() => undefined)
}

export class BulkArtSwitch {
  private readonly controller = new AbortController()
  private readonly state: Readonly<GameState>
  private readonly stage: number
  private readonly fieldId: GameState['fieldId']
  private readonly battlefieldVersion: GameState['battlefieldVersion']
  private readonly layoutRevision: LayoutRevision
  private readonly trials: UnitTrials
  private readonly clips: Readonly<Record<string, string>>
  private environment?: EnvironmentArt
  private dependenciesReady = false
  private released = false
  private currentStatus: ArtSwitchStatus

  constructor(private readonly options: ArtSwitchOptions) {
    this.state = options.state
    this.stage = options.state.stage
    this.fieldId = options.state.fieldId
    this.battlefieldVersion = options.state.battlefieldVersion
    this.layoutRevision = options.state.layoutRevision === undefined ? 1 : options.state.layoutRevision
    this.trials = options.mode === '3d' ? { ...options.catalog } : {}
    this.clips = unitTrialClips(options.standardClips, this.trials)
    this.currentStatus = { target: options.mode, status: 'loading' }
    if (
      (this.layoutRevision !== 1 && this.layoutRevision !== 2 && this.layoutRevision !== 3) ||
      (this.layoutRevision > 1 && this.battlefieldVersion !== 2)
    ) {
      this.fail(new Error('Invalid battlefield layout revision'))
      return
    }
    const environment =
      options.mode === '3d' && this.battlefieldVersion === 2 && this.layoutRevision !== 3
        ? (options.loadEnvironment ?? loadEnvironmentArt)(
            options.base,
            this.fieldId,
            this.controller.signal,
            this.layoutRevision
          ).then((art) => {
            if (this.released) art.dispose()
            else if (
              !environmentMatchesField(art, getField(this.fieldId, this.battlefieldVersion, this.layoutRevision))
            ) {
              art.dispose()
              throw new Error('Environment art does not match the selected battlefield layout')
            } else this.environment = art
          })
        : Promise.resolve()
    void Promise.all([
      environment,
      (options.loadPortraits ?? loadArtPortraits)(options.portraits, this.controller.signal)
    ]).then(
      () => {
        if (!this.released) this.dependenciesReady = true
      },
      (error: unknown) => this.fail(error)
    )
    // A Paladin source is a complete 32-clip set, including its separate healing action.
    if (options.mode === '3d')
      for (const direction of DIRECTIONS)
        if (!this.clips[`player:paladin:attack:${direction}:heal`]) {
          this.fail(new Error(`Missing paladin heal ${direction} art`))
          return
        }
    for (const type of ALL_TRIAL_TYPES)
      for (const direction of DIRECTIONS)
        for (const motion of MOTIONS)
          if (!this.clips[`${unitTrialOwner(type)}:${type}:${motion}:${direction}`]) {
            this.fail(new Error(`Missing ${type} ${motion} ${direction} art`))
            return
          }
  }

  get status(): ArtSwitchStatus {
    return this.currentStatus
  }

  compatible(state: Readonly<GameState>): boolean {
    return (
      (this.layoutRevision === 1 || this.layoutRevision === 2 || this.layoutRevision === 3) &&
      state === this.state &&
      state.phase === 'preparation' &&
      state.stage === this.stage &&
      state.fieldId === this.fieldId &&
      state.battlefieldVersion === this.battlefieldVersion &&
      (state.layoutRevision === undefined ? 1 : state.layoutRevision) === this.layoutRevision
    )
  }

  prepare(state: Readonly<GameState>, bodies: readonly ArtSwitchBody[]): void {
    if (this.released || this.currentStatus.status === 'error') return
    if (!this.compatible(state)) {
      this.dispose()
      return
    }
    const cache = this.options.cache,
      requests: readonly ArtSwitchBody[] = [
        ...ALL_TRIAL_TYPES.map((type) => ({ type, direction: 'se' as const })),
        ...bodies
      ]
    let ready = true
    cache.beginFrame()
    for (const { type, direction } of requests) {
      const url = this.clips[`${unitTrialOwner(type)}:${type}:idle:${direction}`]
      if (!url) {
        this.fail(new Error(`Missing ${type} idle ${direction} art`))
        return
      }
      const atlas = cache.get(url),
        error = cache.error(url)
      if (error) {
        this.fail(new Error(error))
        return
      }
      if (!atlas) ready = false
      else if (
        atlas.manifest.motion !== 'idle' ||
        atlas.manifest.direction !== direction ||
        atlas.manifest.character !== (this.trials[type]?.character ?? AUTHORED_ROSTER[type].character)
      ) {
        this.fail(new Error(`Invalid ${type} idle ${direction} art`))
        return
      }
    }
    cache.endFrame()
    this.currentStatus = {
      target: this.options.mode,
      status: ready && this.dependenciesReady ? 'ready' : 'loading'
    }
  }

  take(): PreparedArt | undefined {
    if (this.released || this.currentStatus.status !== 'ready') return undefined
    this.released = true
    return {
      mode: this.options.mode,
      cache: this.options.cache,
      trials: this.trials,
      clips: this.clips,
      environment: this.environment
    }
  }

  dispose(): void {
    if (this.released) return
    this.released = true
    this.controller.abort()
    this.options.cache.dispose()
    this.environment?.dispose()
    this.environment = undefined
  }

  private fail(error: unknown): void {
    if (this.released) return
    this.currentStatus = {
      target: this.options.mode,
      status: 'error',
      error: error instanceof Error ? error.message : String(error)
    }
    this.dispose()
  }
}

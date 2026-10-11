import {
  UNIT_TRIAL_DEFAULTS,
  unitTrialFor,
  unitTrialOwner,
  unitTrialScale,
  type UnitTrialArt,
  type UnitTrials,
  type UnitTrialType
} from './UnitArtTrial'
import * as THREE from 'three'
import type { Corpse, GameState, Unit } from '../game/model'
import { AUTHORED_ROSTER } from './AuthoredRoster'
import { AUTHORED_DEATH_ROLES, deathEntryOffset } from './DeathArt'
import { RuntimeAtlasCache } from './RuntimeAtlasCache'
import type { SpriteDirection } from './UnitSprites'
import { isSoldierAttackOverscan, loadRuntimeWholeFrameAtlas, type WholeFrameAtlas } from './WholeFrameAtlas'

export const ENEMY_CORPSE_FADE_MS = 450

export interface LastAuthoredFrame {
  readonly atlas: WholeFrameAtlas
  readonly elapsedMs: number
}

export interface CorpseDeathAnimation {
  readonly terminalBehavior?: 'remove-after-duration'
  readonly durationMs: number
  readonly stillAtMs: number
  readonly clips: Readonly<Record<SpriteDirection, string>>
}

export interface CorpseVisualOptions {
  readonly deathAnimations?: Readonly<Record<string, CorpseDeathAnimation>>
  readonly clips: Readonly<Record<string, string>>
  readonly cache?: RuntimeAtlasCache
  readonly soldierTrialIdleClips?: Readonly<Record<SpriteDirection, string>>
  readonly unitTrials?: UnitTrials
}

export interface CorpseRenderOptions {
  readonly lastFrames?: ReadonlyMap<number, LastAuthoredFrame>
  readonly nowMs?: number
  readonly lastRenderedSimulationTime?: number
}

type PixelMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
type FacingUnit = Pick<Unit, 'owner' | 'type' | 'facingX' | 'facingY'>
interface FrameSnapshot {
  texture: THREE.CanvasTexture
  frameIndex: number
  worldSize: WholeFrameAtlas['worldSize']
  anchorOffset: WholeFrameAtlas['anchorOffset']
}
interface CorpseView {
  group: THREE.Group
  body: PixelMesh
  shadow: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>
  snapshot?: FrameSnapshot
  initialAgeMs: number
  firstSeenAtMs: number
  startedAtMs?: number
  observedWaiting: boolean
  mayCatchUp: boolean
  fallen: boolean
  terminalFade?: { startedAtMs: number; initialAgeMs: number }
}

function facingDirection(unit: FacingUnit): SpriteDirection {
  if (unit.facingX === 0 && unit.facingY === 0) return 's'
  const directions: readonly SpriteDirection[] = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne']
  return directions[(Math.round(Math.atan2(unit.facingY, unit.facingX) / (Math.PI / 4)) + 8) % 8]
}

function isCorpseFrameSize(atlas: WholeFrameAtlas): boolean {
  const { frameSize, pixelsPerWorldUnit } = atlas.manifest
  return (
    frameSize.width === 128 &&
    (frameSize.height === 112 || isSoldierAttackOverscan(atlas.manifest)) &&
    frameSize.pivot.x === 64 &&
    frameSize.pivot.y === 94 &&
    pixelsPerWorldUnit === 1
  )
}

function isTrialFrame(atlas: WholeFrameAtlas, trial: UnitTrialArt): boolean {
  return (
    atlas.manifest.character === trial.character &&
    ['idle', 'walk', 'attack'].includes(atlas.manifest.motion) &&
    isCorpseFrameSize(atlas)
  )
}

function copyWholeFrame({ atlas, elapsedMs }: LastAuthoredFrame, trial?: UnitTrialArt): FrameSnapshot {
  if (trial && !isTrialFrame(atlas, trial)) throw new Error('Trial frame does not match its complete-frame contract')
  const { frame, texture } = atlas.sample(elapsedMs)
  if (
    trial &&
    texture.name !== `${trial.character}/${atlas.manifest.direction}/${atlas.manifest.motion}/${frame.index}`
  )
    throw new Error('Trial frame texture does not match its character, direction, motion and cell')
  const canvas = document.createElement('canvas')
  canvas.width = frame.width
  canvas.height = frame.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('A 2D canvas is required to retain a complete corpse frame')
  context.imageSmoothingEnabled = false
  // Runtime ImageBitmaps are vertically flipped at decode, before their UV views are made.
  context.setTransform(1, 0, 0, -1, 0, frame.height)
  context.drawImage(
    texture.image as CanvasImageSource,
    frame.x,
    atlas.manifest.textureHeight - frame.y - frame.height,
    frame.width,
    frame.height,
    0,
    0,
    frame.width,
    frame.height
  )
  const snapshot = new THREE.CanvasTexture(canvas)
  snapshot.name = `${texture.name}/corpse-snapshot`
  snapshot.magFilter = THREE.NearestFilter
  snapshot.minFilter = THREE.NearestFilter
  snapshot.generateMipmaps = false
  snapshot.colorSpace = THREE.SRGBColorSpace
  snapshot.repeat.set((frame.width - 1) / frame.width, (frame.height - 1) / frame.height)
  snapshot.offset.set(0.5 / frame.width, 0.5 / frame.height)
  snapshot.updateMatrix()
  const density = atlas.manifest.pixelsPerWorldUnit
  return {
    texture: snapshot,
    frameIndex: frame.index,
    worldSize: { width: frame.width / density, height: frame.height / density },
    anchorOffset: { x: (frame.width / 2 - frame.pivot.x) / density, y: (frame.height / 2 - frame.pivot.y) / density }
  }
}

export class CorpseVisual {
  readonly assetErrors: Record<string, string> = {}
  private readonly cache: RuntimeAtlasCache
  private readonly views = new Map<string, CorpseView>()
  private readonly enemyAtlasUrls = new Set<string>()
  private readonly completedDeaths = new Set<string>()
  private context?: string
  private previousSimulationTime?: number
  private previousPhase?: GameState['phase']
  private disposed = false
  private unitTrials: Partial<Record<UnitTrialType, UnitTrialArt>> = {}

  constructor(
    private readonly scene: THREE.Scene,
    private readonly options: CorpseVisualOptions
  ) {
    this.cache = options.cache ?? new RuntimeAtlasCache(loadRuntimeWholeFrameAtlas, 32 * 1024 * 1024, 2)
    if (options.soldierTrialIdleClips) this.setSoldierTrialIdleClips(options.soldierTrialIdleClips)
    Object.assign(this.unitTrials, options.unitTrials)
  }

  setSoldierTrialIdleClips(clips?: Readonly<Record<SpriteDirection, string>>): void {
    if (this.unitTrials.soldier?.idleClips === clips) return
    this.setUnitTrial(
      'soldier',
      clips ? { ...UNIT_TRIAL_DEFAULTS.soldier, clips: {}, idleClips: clips, portrait: '' } : undefined
    )
  }

  setUnitTrial(type: UnitTrialType, art?: UnitTrialArt): void {
    if (this.disposed || this.unitTrials[type] === art) return
    for (const [key, view] of this.views) {
      if (view.group.userData.unitOwner !== unitTrialOwner(type) || view.group.userData.unitType !== type) continue
      this.disposeView(view)
      this.views.delete(key)
    }
    const urls = [
      ...Object.values(this.unitTrials[type]?.idleClips ?? {}),
      ...Object.values(art?.idleClips ?? {}),
      ...Object.values(this.options.deathAnimations?.[this.unitTrials[type]?.character ?? '']?.clips ?? {}),
      ...Object.values(this.options.deathAnimations?.[art?.character ?? '']?.clips ?? {}),
      ...Object.entries(this.options.clips)
        .filter(([key]) => key.startsWith(`${unitTrialOwner(type)}:${type}:death:`))
        .map(([, url]) => url)
    ]
    for (const url of urls) delete this.assetErrors[url]
    this.cache.invalidate(urls)
    if (art) this.unitTrials[type] = art
    else delete this.unitTrials[type]
  }

  prepareLiving(unit: FacingUnit & Pick<Unit, 'hp'>, direction = facingDirection(unit)): void {
    if (this.disposed || unit.hp <= 0 || unitTrialFor(unit, this.unitTrials)) return
    const url = this.clipUrl(unit, direction)
    if (url) this.atlas(url, unit, direction, false)
  }

  render(state: Readonly<GameState>, options: CorpseRenderOptions = {}): ReadonlySet<number> {
    const handled = new Set<number>()
    if (this.disposed) return handled
    const context = `${state.battleId}:${state.fieldId}:${state.stage}`
    const changedContext = this.context !== undefined && context !== this.context
    if (context !== this.context) {
      this.clearViews()
      this.previousSimulationTime = undefined
      this.previousPhase = undefined
      this.context = context
    }
    const nowMs = options.nowMs ?? performance.now()
    const previousTime = options.lastRenderedSimulationTime ?? this.previousSimulationTime
    const active = new Set<string>()
    const waitingEnemyAtlases = new Set<string>()
    this.cache.beginFrame()
    for (const corpse of state.corpses) {
      if (corpse.fieldId !== state.fieldId || corpse.stage !== state.stage || handled.has(corpse.id)) continue
      if (this.completedDeaths.has(corpse.key)) {
        handled.add(corpse.id)
        continue
      }
      const deathCharacter = unitTrialFor(corpse, this.unitTrials)?.character ?? AUTHORED_ROSTER[corpse.type].character
      const death = this.options.deathAnimations?.[deathCharacter]
      if (death) {
        handled.add(corpse.id)
        if (active.size >= 33) continue
        let view = this.views.get(corpse.key)
        const terminal = ['cleared', 'victory', 'defeat'].includes(state.phase)
        const witnessed =
          !changedContext &&
          this.previousPhase === 'assault' &&
          previousTime !== undefined &&
          previousTime <= corpse.diedAt &&
          options.lastFrames?.has(corpse.id)
        if (terminal && !view && !witnessed) continue
        if (!view) {
          view = this.createView(corpse, state.time, nowMs, previousTime)
          this.views.set(corpse.key, view)
          const last = changedContext ? undefined : options.lastFrames?.get(corpse.id)
          if (last?.atlas.manifest.character === deathCharacter) this.capture(view, last, corpse.key)
        }
        active.add(corpse.key)
        const direction = facingDirection(corpse)
        const url = death.clips[direction]
        if (!url) {
          this.assetErrors[corpse.key] = 'Death presentation is missing its direction clip'
          view.group.visible = !!view.body.material.map
          continue
        }
        if (!view.fallen) {
          this.enemyAtlasUrls.add(url)
          const atlas = this.cache.get(url, true)
          if (atlas) {
            const manifest = atlas.manifest
            if (
              !Number.isFinite(death.durationMs) ||
              death.durationMs <= 0 ||
              !Number.isFinite(death.stillAtMs) ||
              death.stillAtMs < 0 ||
              death.stillAtMs > death.durationMs ||
              manifest.character !== deathCharacter ||
              manifest.direction !== direction ||
              manifest.motion !== 'death' ||
              manifest.loop ||
              manifest.events.length ||
              manifest.durationMs !== death.durationMs ||
              !isCorpseFrameSize(atlas)
            ) {
              this.assetErrors[url] = 'Death presentation metadata does not match its nonloop complete-frame clip'
              view.group.userData.state = 'error'
            } else {
              view.startedAtMs ??= nowMs
              const ageMs = Math.max(0, nowMs - view.startedAtMs)
              if (ageMs >= death.durationMs && death.terminalBehavior === 'remove-after-duration') {
                this.completedDeaths.add(corpse.key)
                active.delete(corpse.key)
                continue
              }
              const elapsedMs = Math.min(ageMs, death.stillAtMs)
              const sampled = atlas.sample(elapsedMs)
              this.setFrameGeometry(view, atlas)
              view.body.material.map = sampled.texture
              view.body.userData = { frameIndex: sampled.frame.index, elapsedMs, direction, source: 'metadata-death' }
              view.group.userData.state = ageMs >= death.stillAtMs ? 'still' : 'death'
              view.group.userData.ageMs = ageMs
              if (ageMs >= death.durationMs && this.capture(view, { atlas, elapsedMs }, url)) {
                view.fallen = true
                view.group.userData.state = 'fallen'
              }
            }
          } else {
            const error = this.cache.error(url)
            if (error) this.assetErrors[url] = error
            view.group.userData.state = error ? 'error' : 'loading'
          }
          if (!view.fallen) waitingEnemyAtlases.add(url)
        }
        view.group.visible = !!view.body.material.map
        continue
      }
      if (corpse.owner === 'ai' && AUTHORED_ROSTER[corpse.type].owner === 'ai') {
        handled.add(corpse.id)
        let view = this.views.get(corpse.key)
        let ageMs = Math.max(0, (state.time - corpse.diedAt) * 1000)
        const terminal = ['cleared', 'victory', 'defeat'].includes(state.phase)
        const witnessedKO =
          !changedContext &&
          this.previousPhase === 'assault' &&
          previousTime !== undefined &&
          previousTime <= corpse.diedAt &&
          options.lastFrames?.has(corpse.id)
        if (terminal && !view && !witnessedKO) continue
        if (terminal && view?.terminalFade)
          ageMs = Math.max(ageMs, view.terminalFade.initialAgeMs + Math.max(0, nowMs - view.terminalFade.startedAtMs))
        if (ageMs >= ENEMY_CORPSE_FADE_MS || active.size >= 33) continue
        active.add(corpse.key)
        if (!view) {
          view = this.createView(corpse, state.time, nowMs, previousTime)
          this.views.set(corpse.key, view)
          const lastFrame = changedContext ? undefined : options.lastFrames?.get(corpse.id)
          const trial = unitTrialFor(corpse, this.unitTrials)
          const character = trial?.character ?? AUTHORED_ROSTER[corpse.type].character
          if (
            lastFrame?.atlas.manifest.character === character &&
            ['idle', 'walk', 'attack'].includes(lastFrame.atlas.manifest.motion)
          )
            this.captureEnemyFrame(view, lastFrame, corpse.key, trial, false)
        }
        if (terminal) view.terminalFade ??= { startedAtMs: nowMs, initialAgeMs: ageMs }
        else view.terminalFade = undefined
        this.updateEnemyView(view, corpse, ageMs, waitingEnemyAtlases)
        continue
      }
      if (handled.size >= 33) break
      const direction = facingDirection(corpse)
      const trial = unitTrialFor(corpse, this.unitTrials)
      const url = this.clipUrl(corpse, direction)
      if (!url) continue
      handled.add(corpse.id)
      active.add(corpse.key)
      let view = this.views.get(corpse.key)
      if (!view) {
        view = this.createView(corpse, state.time, nowMs, previousTime)
        this.views.set(corpse.key, view)
        const lastFrame = changedContext ? undefined : options.lastFrames?.get(corpse.id)
        if (trial) {
          view.group.userData.presentation = `${corpse.type}-3d-trial-held-pose`
          view.body.material.opacity = 0.55
          if (lastFrame && isTrialFrame(lastFrame.atlas, trial)) this.holdTrialFrame(view, lastFrame, url, trial, false)
        } else if (lastFrame?.atlas.manifest.character === AUTHORED_ROSTER[corpse.type].character)
          this.capture(view, lastFrame, url)
      }
      if (!view.fallen) {
        if (trial) this.updateTrialView(view, corpse, url, direction)
        else this.updateView(view, corpse, url, direction, nowMs)
      }
      view.group.visible = !!view.body.material.map
    }
    for (const [key, view] of this.views) {
      if (!active.has(key)) {
        this.disposeView(view)
        this.views.delete(key)
      }
    }
    const releasedEnemyAtlases = [...this.enemyAtlasUrls].filter((url) => !waitingEnemyAtlases.has(url))
    this.cache.invalidate(releasedEnemyAtlases)
    for (const url of releasedEnemyAtlases) {
      this.enemyAtlasUrls.delete(url)
      delete this.assetErrors[url]
    }
    if (this.completedDeaths.size) {
      const recordedCorpses = new Set(state.corpses.map((corpse) => corpse.key))
      for (const key of this.completedDeaths) if (!recordedCorpses.has(key)) this.completedDeaths.delete(key)
    }
    for (const unit of state.units) this.prepareLiving(unit)
    this.cache.endFrame()
    this.previousSimulationTime = state.time
    this.previousPhase = state.phase
    return handled
  }

  private updateEnemyView(view: CorpseView, corpse: Corpse, ageMs: number, waitingAtlases: Set<string>): void {
    if (!view.snapshot) {
      const direction = facingDirection(corpse)
      const trial = unitTrialFor(corpse, this.unitTrials)
      const url = trial?.idleClips[direction] ?? this.options.clips[`ai:${corpse.type}:idle:${direction}`]
      if (url) {
        this.enemyAtlasUrls.add(url)
        const atlas = this.cache.get(url, false)
        const error = this.cache.error(url)
        if (error) this.assetErrors[url] = error
        if (atlas) {
          if (
            atlas.manifest.character !== (trial?.character ?? AUTHORED_ROSTER[corpse.type].character) ||
            atlas.manifest.direction !== direction ||
            atlas.manifest.motion !== 'idle' ||
            atlas.manifest.events.length !== 0
          )
            this.assetErrors[url] = 'Enemy fade requires its direction-matched complete idle frame'
          else this.captureEnemyFrame(view, { atlas, elapsedMs: 0 }, url, trial)
        }
        if (!view.snapshot) waitingAtlases.add(url)
      }
    }
    const opacity = 1 - ageMs / ENEMY_CORPSE_FADE_MS
    view.group.userData.presentation = 'enemy-ko-fade'
    view.group.userData.state = 'fading'
    view.group.userData.ageMs = ageMs
    view.body.material.opacity = opacity
    view.shadow.material.opacity = 0.24 * opacity
    view.group.visible = !!view.snapshot
  }

  private captureEnemyFrame(
    view: CorpseView,
    frame: LastAuthoredFrame,
    errorKey: string,
    trial?: UnitTrialArt,
    reportError = true
  ): boolean {
    if (!this.capture(view, frame, errorKey, trial, reportError)) return false
    const { atlas, elapsedMs } = frame
    view.body.userData = {
      frameIndex: view.snapshot!.frameIndex,
      elapsedMs,
      direction: atlas.manifest.direction,
      motion: atlas.manifest.motion,
      source: 'enemy-fade-frame'
    }
    return true
  }

  private clipUrl(unit: FacingUnit, direction: SpriteDirection): string | undefined {
    const trial = unitTrialFor(unit, this.unitTrials)
    if (trial) return trial.idleClips[direction]
    if (!AUTHORED_DEATH_ROLES.some((role) => role === unit.type)) return undefined
    if (AUTHORED_ROSTER[unit.type].owner !== unit.owner) return undefined
    return this.options.clips[`${unit.owner}:${unit.type}:death:${direction}`]
  }

  private atlas(url: string, unit: FacingUnit, direction: SpriteDirection, pin: boolean): WholeFrameAtlas | undefined {
    const atlas = this.cache.get(url, pin)
    const error = this.cache.error(url)
    if (error) this.assetErrors[url] = error
    if (!atlas) return undefined
    const manifest = atlas.manifest
    const trial = unitTrialFor(unit, this.unitTrials)
    if (
      manifest.direction !== direction ||
      manifest.events.length !== 0 ||
      !isCorpseFrameSize(atlas) ||
      (trial
        ? !isTrialFrame(atlas, trial) || manifest.motion !== 'idle'
        : manifest.character !== AUTHORED_ROSTER[unit.type].character ||
          manifest.motion !== 'death' ||
          manifest.loop ||
          manifest.activePoseStartFrame !== 1 ||
          manifest.terminalBehavior !== 'hold-final-frame-until-new-stage-or-retry')
    ) {
      this.assetErrors[url] = trial
        ? `${unit.type} 3D trial held pose requires its direction-matched complete idle frame`
        : 'Approved corpse atlas does not match its complete-frame death registry entry'
      return undefined
    }
    return atlas
  }

  private createView(corpse: Corpse, simulationTime: number, nowMs: number, previousTime?: number): CorpseView {
    const group = new THREE.Group()
    const body = new THREE.Mesh(
      new THREE.PlaneGeometry(128, 112),
      new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide })
    )
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1, 24),
      new THREE.MeshBasicMaterial({
        color: 0x183d3c,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    )
    const scale = (corpse.boss ? 1.35 : 1) * unitTrialScale(corpse, this.unitTrials)
    group.name = `corpse:${corpse.key}`
    group.userData = {
      presentationOnly: true,
      unitId: corpse.id,
      corpseKey: corpse.key,
      unitType: corpse.type,
      unitOwner: corpse.owner
    }
    group.position.set(corpse.x, corpse.y, (corpse.y - 24) / 10)
    body.name = `corpse-body:${corpse.key}`
    body.position.set(0, -38 * scale, 0)
    body.scale.set(scale, -scale, 1)
    shadow.name = `corpse-shadow:${corpse.key}`
    shadow.position.z = -0.5
    shadow.scale.set(17 * scale, 5 * scale, 1)
    group.add(shadow, body)
    this.scene.add(group)
    return {
      group,
      body,
      shadow,
      initialAgeMs: Math.max(0, (simulationTime - corpse.diedAt) * 1000),
      firstSeenAtMs: nowMs,
      observedWaiting: false,
      mayCatchUp: previousTime === undefined || previousTime <= corpse.diedAt,
      fallen: false
    }
  }

  private updateTrialView(view: CorpseView, corpse: Corpse, url: string, direction: SpriteDirection): void {
    const atlas = this.atlas(url, corpse, direction, true)
    if (!atlas) {
      view.group.userData.state = this.assetErrors[url] ? 'error' : 'loading'
      return
    }
    this.holdTrialFrame(view, { atlas, elapsedMs: 0 }, url, unitTrialFor(corpse, this.unitTrials)!)
  }

  private holdTrialFrame(
    view: CorpseView,
    frame: LastAuthoredFrame,
    url: string,
    trial: UnitTrialArt,
    reportError = true
  ): void {
    if (!this.capture(view, frame, url, trial, reportError)) {
      view.group.userData.state = 'error'
      return
    }
    view.fallen = true
    view.group.userData.state = 'trial-held-pose'
    view.body.userData = {
      frameIndex: view.snapshot!.frameIndex,
      elapsedMs: frame.elapsedMs,
      direction: frame.atlas.manifest.direction,
      motion: frame.atlas.manifest.motion,
      attackVariant: frame.atlas.manifest.attackVariant,
      resourceKey: frame.atlas.resourceKey,
      source: 'trial-held-frame'
    }
  }

  private updateView(view: CorpseView, corpse: Corpse, url: string, direction: SpriteDirection, nowMs: number): void {
    const atlas = this.atlas(url, corpse, direction, true)
    if (!atlas) {
      view.observedWaiting = true
      view.body.material.map = view.snapshot?.texture ?? null
      view.group.userData.state = this.assetErrors[url] ? 'error' : 'loading'
      return
    }
    const entryOffset = deathEntryOffset(atlas.manifest, corpse.activePose)
    if (view.startedAtMs === undefined) {
      const missedEntireClip = view.mayCatchUp && view.initialAgeMs + entryOffset >= atlas.manifest.durationMs
      view.startedAtMs = view.observedWaiting && !missedEntireClip ? nowMs : view.firstSeenAtMs - view.initialAgeMs
    }
    const elapsedMs = Math.max(0, nowMs - view.startedAtMs) + entryOffset
    const { frame, texture } = atlas.sample(elapsedMs)
    this.setFrameGeometry(view, atlas)
    view.body.material.map = texture
    view.body.userData = { frameIndex: frame.index, elapsedMs, direction, source: 'death' }
    view.group.userData.state = 'death'
    view.shadow.scale.x = (17 + 4 * Math.min(1, elapsedMs / atlas.manifest.durationMs)) * (corpse.boss ? 1.35 : 1)
    if (elapsedMs >= atlas.manifest.durationMs && this.capture(view, { atlas, elapsedMs }, url)) {
      view.fallen = true
      view.group.userData.state = 'fallen'
    }
  }

  private capture(
    view: CorpseView,
    frame: LastAuthoredFrame,
    errorKey: string,
    trial?: UnitTrialArt,
    reportError = true
  ): boolean {
    try {
      const snapshot = copyWholeFrame(frame, trial)
      view.snapshot?.texture.dispose()
      view.snapshot = snapshot
      view.body.material.map = snapshot.texture
      this.setFrameGeometry(view, snapshot)
      view.body.userData.frameIndex = snapshot.frameIndex
      view.body.userData.source = 'snapshot'
      return true
    } catch (error) {
      if (reportError) this.assetErrors[errorKey] = `Could not retain complete corpse frame: ${String(error)}`
      return false
    }
  }

  private setFrameGeometry(view: CorpseView, frame: Pick<WholeFrameAtlas, 'worldSize' | 'anchorOffset'>): void {
    const { width, height } = frame.worldSize
    if (view.body.geometry.parameters.width !== width || view.body.geometry.parameters.height !== height) {
      view.body.geometry.dispose()
      view.body.geometry = new THREE.PlaneGeometry(width, height)
    }
    view.body.position.set(frame.anchorOffset.x * view.body.scale.x, frame.anchorOffset.y * view.body.scale.x, 0)
  }

  private disposeView(view: CorpseView): void {
    this.scene.remove(view.group)
    view.snapshot?.texture.dispose()
    view.body.geometry.dispose()
    view.body.material.dispose()
    view.shadow.geometry.dispose()
    view.shadow.material.dispose()
  }

  private clearViews(): void {
    for (const view of this.views.values()) this.disposeView(view)
    this.views.clear()
    this.completedDeaths.clear()
    this.cache.invalidate(this.enemyAtlasUrls)
    this.enemyAtlasUrls.clear()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.clearViews()
    this.cache.dispose()
  }
}

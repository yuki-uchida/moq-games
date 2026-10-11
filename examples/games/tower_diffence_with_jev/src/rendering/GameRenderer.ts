import { ModelUnitLayer, type ModelRoster } from './ModelUnitLayer'
import { expressiveMotion } from './ExpressiveMotion'
import { canInitiateDamage, healingAction, HEALING_ACTIONS, temporaryPaladinHeal } from '../game/HealingActions'
import { BulkArtSwitch, type ArtMode, type ArtSwitchBody, type ArtSwitchStatus } from './BulkArtSwitch'
import { authoredPortrait } from './AuthoredRoster'
import { soldierTrialConfiguration, type SoldierTrialArt } from './SoldierArtTrial'
import {
  UNIT_TRIAL_TYPES,
  ALL_TRIAL_TYPES,
  ENEMY_TRIAL_TYPES,
  unitTrialOwner,
  type AlliedTrialType,
  type EnemyTrialType,
  unitTrialClips,
  unitTrialFor,
  unitTrialScale,
  type UnitTrialArt,
  type UnitTrials,
  type UnitTrialType
} from './UnitArtTrial'
import { HeavyImpactVisual } from './HeavyImpactVisual'
import { DragonSplashVisual } from './DragonSplashVisual'
import { FortificationVisual } from './FortificationVisual'
import {
  environmentDirection,
  environmentMatchesField,
  loadEnvironmentArt,
  type EnvironmentArt,
  type EnvironmentArtBundle,
  type EnvironmentSprite
} from './EnvironmentArt'
import type { RoadItemPlacement } from '../game/Fortifications'
import { CorpseVisual, type LastAuthoredFrame, type CorpseDeathAnimation } from './CorpseVisual'
import { CommanderVisual } from './CommanderVisual'
import { CommanderSupportVisual } from './CommanderSupportVisual'
import { BREATH_TIMING, BREATH_SOURCE_GEOMETRY, mouthAt } from '../game/BreathGeometry'
import { previewGroundPlacement, groundPlacementLabel, type GroundPlacement } from '../game/GroundPlacement'
import * as THREE from 'three'
import {
  entranceFacing,
  ANIMATION,
  CONFIG,
  DEFINITIONS,
  getField,
  fieldFor,
  type BattlefieldVersion,
  type LayoutRevision,
  stageRules,
  pointOnPath,
  type AllyType,
  type CombatAttack,
  type FieldId,
  type Placement,
  type GameState,
  type Point,
  type SandbagPlacement,
  type RoadItemKind,
  type Unit
} from '../game/model'
import { nearestRoadEdge, type RoadAnchor } from '../game/BattlefieldRoutes'
import type { SpriteMotion, SpriteDirection } from './UnitSprites'
import { AnimationTimer, attackPose, hitPose } from './CombatMotion'
import { AttackPlayback } from './AttackPlayback'
import { ATTACK_PROFILES, attackTimeScale, attackAssetElapsedMs, ENEMY_ACTION_TIME_SCALE } from '../game/AttackProfiles'
import { createBaseArt, createFieldArt, createSandbagArt } from './WorldArt'
import { RuntimeAtlasCache } from './RuntimeAtlasCache'
import {
  authoredEmitter,
  projectilePose,
  projectileDisplayScale,
  authoredAxisProjectilePose,
  arrowArcHeight,
  arrowProjectilePose
} from './ProjectileMotion'
import { loadEffectWholeFrameAtlas, loadRuntimeWholeFrameAtlas, type WholeFrameAtlas } from './WholeFrameAtlas'
type Paint = (c: CanvasRenderingContext2D) => void
type PixelMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
type CombatArt =
  | 'dust'
  | 'slash'
  | 'arrow'
  | 'hit'
  | 'orb'
  | 'splash'
  | 'shadow'
  | 'cannonball'
  | 'fireball'
  | 'ice'
  | 'heal'
const PROJECTILES: Partial<Record<Unit['type'], CombatArt>> = {
  archer: 'arrow',
  ranger: 'arrow',
  cannon: 'cannonball',
  dragon: 'fireball',
  frost: 'ice'
}
interface UnitVisual {
  group: THREE.Group
  body: PixelMesh
  strike: PixelMesh
  impact: PixelMesh
  coldMist: PixelMesh
  dust: PixelMesh
  attackTimer: AnimationTimer
  hitTimer: AnimationTimer
  playback: AttackPlayback
  lastAttackSequence: number
  attackAtlasUrl?: string
  lastAtlasUrl?: string
  restAtlasUrl?: string
  lastFrame?: LastAuthoredFrame
  defenderHandle?: HTMLButtonElement
}
export interface AuthoredAtlasOptions {
  readonly models?: ModelRoster
  readonly deathAnimations?: Readonly<Record<string, CorpseDeathAnimation>>
  readonly environmentTrial?: boolean
  readonly environmentBase?: URL
  readonly clips?: Readonly<Record<string, string>>
  readonly effectClips?: Readonly<Record<string, string>>
  readonly cache?: RuntimeAtlasCache
  readonly commanderBase?: URL
  readonly deathClips?: Readonly<Record<string, string>>
  readonly soldierTrial?: SoldierTrialArt
  readonly unitTrials?: UnitTrials
}
export interface DefenderPlacementPreview {
  readonly battle?: boolean
  readonly placement: GroundPlacement
  readonly type: AllyType
  readonly redeploy?: { readonly anchor: Point; readonly radius: number }
}
export function authoredClipKey(
  unit: Pick<Unit, 'owner' | 'type'>,
  motion: SpriteMotion,
  direction: SpriteDirection,
  variant?: 'breath' | 'heal'
): string {
  return `${unit.owner}:${unit.type}:${motion}:${direction}${variant ? `:${variant}` : ''}`
}

function bodyScale(unit: { readonly boss?: boolean }): number {
  return unit.boss ? 1.35 : 1
}

function updateDataset(element: HTMLElement, values: Record<string, string>): void {
  for (const [key, value] of Object.entries(values)) if (element.dataset[key] !== value) element.dataset[key] = value
}

function canvas(w: number, h: number, paint: Paint): HTMLCanvasElement {
  const el = document.createElement('canvas')
  el.width = w
  el.height = h
  const c = el.getContext('2d')!
  c.imageSmoothingEnabled = false
  paint(c)
  return el
}
function rect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  c.fillStyle = color
  c.fillRect(x, y, w, h)
}
function combatArt(kind: CombatArt): HTMLCanvasElement {
  return canvas(32, 32, (c) => {
    if (kind === 'dust') {
      for (const [x, y, radius] of [
        [8, 20, 5],
        [17, 17, 6],
        [24, 22, 4]
      ]) {
        c.fillStyle = '#d7bd91'
        c.beginPath()
        c.arc(x, y, radius, 0, Math.PI * 2)
        c.fill()
      }
    } else if (kind === 'shadow') {
      for (let y = -3; y <= 3; y++) {
        const half = Math.round(14 * Math.sqrt(1 - (y / 4) ** 2))
        rect(c, 16 - half, 16 + y, half * 2, 1, '#183d3c')
      }
    } else if (kind === 'cannonball') {
      rect(c, 4, 13, 11, 6, '#cdb994')
      rect(c, 7, 10, 10, 12, '#ddcda3')
      c.fillStyle = '#253943'
      c.beginPath()
      c.arc(19, 16, 9, 0, Math.PI * 2)
      c.fill()
      c.fillStyle = '#62727a'
      c.beginPath()
      c.arc(18, 14, 6, 0, Math.PI * 2)
      c.fill()
      rect(c, 16, 10, 4, 3, '#c0c9c4')
    } else if (kind === 'fireball') {
      rect(c, 2, 12, 19, 8, '#b85345')
      rect(c, 7, 7, 15, 18, '#e77e40')
      rect(c, 12, 10, 16, 12, '#f4b75f')
      rect(c, 16, 7, 9, 18, '#f5cb70')
      rect(c, 18, 11, 9, 10, '#fff0ae')
      rect(c, 5, 4, 3, 3, '#e79954')
      rect(c, 3, 24, 4, 3, '#e79954')
    } else if (kind === 'ice') {
      c.fillStyle = '#527fad'
      c.beginPath()
      c.moveTo(4, 16)
      c.lineTo(18, 7)
      c.lineTo(29, 16)
      c.lineTo(18, 25)
      c.closePath()
      c.fill()
      c.fillStyle = '#b3e7eb'
      c.beginPath()
      c.moveTo(9, 16)
      c.lineTo(18, 10)
      c.lineTo(29, 16)
      c.lineTo(18, 17)
      c.closePath()
      c.fill()
      rect(c, 2, 10, 3, 2, '#a9d2e4')
      rect(c, 3, 23, 4, 2, '#a9d2e4')
    } else if (kind === 'heal') {
      rect(c, 11, 2, 10, 28, '#164e38')
      rect(c, 2, 11, 28, 10, '#164e38')
      rect(c, 13, 4, 6, 24, '#baffd1')
      rect(c, 4, 13, 24, 6, '#baffd1')
      rect(c, 14, 5, 2, 21, '#fffce4')
    } else if (kind === 'orb') {
      rect(c, 2, 14, 14, 4, '#607dba')
      rect(c, 6, 11, 11, 10, '#769bc2')
      rect(c, 12, 9, 13, 14, '#73c3b4')
      rect(c, 15, 7, 8, 18, '#a7e2ba')
      rect(c, 11, 12, 17, 8, '#a7e2ba')
      rect(c, 15, 11, 9, 10, '#e1efb2')
      rect(c, 17, 12, 5, 6, '#fff7d9')
      rect(c, 4, 6, 3, 3, '#b3d9c5')
      rect(c, 8, 24, 2, 2, '#b3d9c5')
    } else if (kind === 'splash') {
      for (const [x, y, size] of [
        [4, 18, 5],
        [10, 8, 7],
        [19, 5, 5],
        [23, 15, 6]
      ]) {
        rect(c, x, y, size, size + 4, '#489ea3')
        rect(c, x + 1, y, size - 1, size, '#8dddd0')
        rect(c, x + 1, y + 1, 2, 3, '#e0f2c4')
      }
    } else if (kind === 'arrow') {
      rect(c, 2, 15, 24, 2, '#d8b779')
      rect(c, 22, 13, 4, 6, '#eff6d6')
      rect(c, 26, 15, 3, 2, '#eff6d6')
      rect(c, 2, 12, 5, 2, '#b5e1d8')
      rect(c, 4, 14, 4, 4, '#b5e1d8')
      rect(c, 2, 18, 5, 2, '#b5e1d8')
    } else if (kind === 'slash') {
      for (let i = 0; i < 9; i++) {
        const x = 10 + Math.round(Math.sin((i / 8) * Math.PI) * 14)
        rect(c, x - 4, 2 + i * 3, 5, 4, '#e5bd72')
        rect(c, x, 2 + i * 3, 3, 4, '#fff9d9')
      }
    } else {
      rect(c, 14, 3, 3, 9, '#fff3ce')
      rect(c, 14, 20, 3, 9, '#fff3ce')
      rect(c, 3, 14, 9, 3, '#ffe4a1')
      rect(c, 20, 14, 9, 3, '#ffe4a1')
      for (const [x, y] of [
        [6, 6],
        [23, 6],
        [6, 23],
        [23, 23]
      ])
        rect(c, x, y, 3, 3, '#eea080')
    }
  })
}
export function spriteDirection(facing: Point): SpriteDirection {
  if (facing.x === 0 && facing.y === 0) return 's'
  const directions: SpriteDirection[] = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne']
  return directions[(Math.round(Math.atan2(facing.y, facing.x) / (Math.PI / 4)) + 8) % 8]
}
function movementEdgeGeometry(radius: number, dashed: boolean): THREE.RingGeometry {
  const geometry = new THREE.RingGeometry(Math.max(0, 1 - (dashed ? 3 : 5) / radius), 1, 64)
  if (dashed) geometry.setIndex(Array.from(geometry.index!.array).filter((_, index) => Math.floor(index / 6) % 8 < 5))
  return geometry
}
function redeploymentEdgeGeometry(radius: number, dotted: boolean): THREE.RingGeometry {
  const segments = Math.max(64, Math.ceil((Math.PI * radius) / 4) * 2)
  const geometry = new THREE.RingGeometry(Math.max(0, 1 - (dotted ? 3 : 5) / radius), 1, segments)
  if (dotted) geometry.setIndex(Array.from(geometry.index!.array).filter((_, index) => Math.floor(index / 6) % 2 === 0))
  return geometry
}
export class GameRenderer {
  private renderer: THREE.WebGLRenderer
  private disposed = false
  private models?: ModelUnitLayer
  private modelsActive = false
  private modelSelected: AllyType = 'soldier'
  private commander?: CommanderVisual
  private commanderMode = false
  private commanderSupport: CommanderSupportVisual
  private corpses?: CorpseVisual
  private lastRenderedSimulationTime?: number
  private atlasCache: RuntimeAtlasCache
  private bulkArtSwitch?: BulkArtSwitch
  private clips: Readonly<Record<string, string>>
  private readonly standardClips: Readonly<Record<string, string>>
  private soldierTrial?: SoldierTrialArt
  private unitTrials: Partial<Record<UnitTrialType, UnitTrialArt>> = {}
  private trialByClip = new Map<string, UnitTrialArt>()
  private effectClips: Readonly<Record<string, string>>
  private previousState?: Readonly<GameState>
  private previousStage?: number
  private frameNumber = 0
  readonly assetErrors: Record<string, string> = {}
  private scene = new THREE.Scene()
  private heavyImpacts = new HeavyImpactVisual(this.scene)
  private dragonSplashes = new DragonSplashVisual(this.scene)
  private fortifications: FortificationVisual
  private field = getField('meadow')
  private camera = new THREE.OrthographicCamera(0, this.field.width, 0, this.field.height, -200, 200)
  private units = new Map<number, UnitVisual>()

  private drawTiming = { frames: 0, firstMs: 0, lastMs: 0, maxMs: 0 }

  diagnostics() {
    const state = this.previousState
    const frustum = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse)
    )
    return {
      frame: this.frameNumber,
      gpu: { ...this.drawTiming, programs: this.renderer.info.programs?.length ?? 0 },
      modelRendering: this.models?.diagnostics() ?? null,
      artSwitch: this.artSwitchStatus,
      soldierArt: this.models ? 'gltf-mesh' : this.unitTrials.soldier ? '3d-trial' : '2d',
      unitArt: Object.fromEntries(
        UNIT_TRIAL_TYPES.map((type) => [type, this.unitTrials[type] ? '3d-trial' : '2d'])
      ) as Record<AlliedTrialType, '3d-trial' | '2d'>,
      enemyArt: Object.fromEntries(
        ENEMY_TRIAL_TYPES.map((type) => [type, this.unitTrials[type] ? '3d-trial' : '2d'])
      ) as Record<EnemyTrialType, '3d-trial' | '2d'>,
      stage: state?.stage,
      battlefield: {
        id: this.field.id,
        version: this.field.version,
        layoutRevision: this.field.layoutRevision,
        width: this.field.width,
        height: this.field.height
      },
      phase: state?.phase,
      environment: this.environmentStatus(),
      simulationTime: state?.time,
      assetStatus: this.assetStatus,
      assetErrors: { ...this.assetErrors },
      fortifications: this.fortifications.diagnostics(),
      commander: this.commander?.diagnostics() ?? null,
      commanderSupport: this.commanderSupport.diagnostics(),
      cache: { residentBytes: this.atlasCache.residentBytes, inFlight: this.atlasCache.inFlight },
      placementPreview: this.displayedPlacementPreview
        ? {
            type: this.displayedPlacementPreview.type,
            ...this.displayedPlacementPreview.placement,
            point: { ...this.displayedPlacementPreview.placement.point },
            redeploy: this.displayedPlacementPreview.redeploy
              ? {
                  anchor: { ...this.displayedPlacementPreview.redeploy.anchor },
                  radius: this.displayedPlacementPreview.redeploy.radius
                }
              : null,
            ghostVisible: this.placementBody?.visible ?? false,
            facing: this.placementCursor.dataset.facing,
            label: this.placementStatus.textContent
          }
        : null,
      units: [...this.units].map(([id, { body, group, lastFrame }]) => {
        const unit = state?.units.find((value) => value.id === id)
        const texture = body.material.map
        return {
          id,
          type: unit?.type,
          character: lastFrame?.atlas.manifest.character ?? null,
          attackVariant: lastFrame?.atlas.manifest.attackVariant ?? null,
          renderedDirection: lastFrame?.atlas.manifest.direction ?? null,
          owner: unit?.owner,
          hp: unit?.hp,
          maxHp: unit?.maxHp,
          attack: unit && canInitiateDamage(unit) ? unit.attack : 0,
          healing: unit ? healingAction(unit) : undefined,
          healCooldown: unit?.healCooldown,
          actionKind:
            state?.attacks.find((action) => action.attackerId === id && action.sequence === unit?.attackSequence)
              ?.kind ?? null,
          healingAnimation:
            unit && healingAction(unit) && unit.type === 'paladin'
              ? lastFrame?.atlas.manifest.attackVariant === 'heal'
                ? 'dedicated-heal'
                : 'neutral-whole-body-fallback'
              : undefined,
          attackRange: unit?.attackRange,
          boss: unit?.boss,
          scale: body.scale.toArray(),
          attackSequence: unit?.attackSequence,
          attackStartedAt: unit?.attackStartedAt,
          attackElapsedMs: unit && state ? (state.time - unit.attackStartedAt) * 1000 : null,
          attackStatus:
            state?.attacks.find((attack) => attack.attackerId === id && attack.sequence === unit?.attackSequence)
              ?.status ?? null,
          visible: this.models ? this.models.visible(id) : body.visible,
          groupVisible: group.visible,
          drawnThisFrame: body.userData.drawnFrame === this.frameNumber,
          inFrustum: frustum.intersectsObject(body),
          worldPosition: body.getWorldPosition(new THREE.Vector3()).toArray(),
          groundPosition: unit ? { x: unit.x, y: unit.y } : null,
          opacity: body.material.opacity,
          depthTest: body.material.depthTest,
          depthWrite: body.material.depthWrite,
          texture: texture
            ? {
                name: texture.name,
                uuid: texture.uuid,
                version: texture.version,
                sourceVersion: texture.source.version,
                width: texture.image?.width,
                height: texture.image?.height,
                offset: texture.offset.toArray(),
                repeat: texture.repeat.toArray()
              }
            : null,
          presentation: { ...this.healthLabels.get(id)?.element.dataset }
        }
      })
    }
  }
  private attackEffects = new Map<string, PixelMesh>()
  private projectileLaunches = new Map<string, Point>()
  private textures = new Map<string, THREE.CanvasTexture>()
  private background?: PixelMesh
  private environmentEnabled = false
  private environmentLoading = false
  private environmentError?: string
  private environmentBase?: URL
  private environmentArt?: EnvironmentArt
  private environmentBundle?: EnvironmentArtBundle
  private pendingEnvironment?: EnvironmentArt
  private environmentRequest?: AbortController
  private environmentLoad?: Promise<void>
  private sandbagVisuals = new Map<number, { mesh: PixelMesh; label: HTMLDivElement; button: HTMLButtonElement }>()
  private selectedSandbagId: number | null = null
  private sandbagGhost?: PixelMesh
  private sandbagPreview: SandbagPlacement | null = null
  private sandbagPreviewLabel = document.createElement('div')
  private baseVisual?: PixelMesh
  private baseHpTier = -1
  private previousBaseHp?: number
  private baseHitAt = -Infinity
  private fieldId?: FieldId
  private range: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>
  private movement: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>
  private movementEdges: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[] = []
  private defenderPlacementPreview: DefenderPlacementPreview | null = null
  private displayedPlacementPreview: DefenderPlacementPreview | null = null
  private redeploymentEdges: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[] = []
  private redeploymentAnchor = new THREE.Mesh(
    new THREE.CircleGeometry(4, 16),
    new THREE.MeshBasicMaterial({
      color: 0xe7b5ff,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  )
  private placementMarker = new THREE.Mesh(
    new THREE.CircleGeometry(6, 24),
    new THREE.MeshBasicMaterial({
      color: 0xffecae,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  )
  private placementBody?: PixelMesh
  private previewLabel = document.createElement('div')
  private movementLabel = document.createElement('span')
  private attackLabel = document.createElement('span')
  private placementStatus = document.createElement('span')
  private redeploymentLabel = document.createElement('span')
  private placementCursor = document.createElement('div')
  private slots: {
    target: { slotId: number }
    element: HTMLButtonElement
    marker: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>
  }[] = []
  private healthLabels = new Map<number, { element: HTMLDivElement; hp: number }>()
  constructor(
    private host: HTMLElement,
    authored: AuthoredAtlasOptions = {}
  ) {
    if (authored.models) {
      this.models = new ModelUnitLayer(this.scene, authored.models)
      this.scene.add(new THREE.HemisphereLight(0xf4ffe3, 0x244352, 2.5))
      const light = new THREE.DirectionalLight(0xffe0ad, 3)
      light.position.set(-120, -240, 100)
      this.scene.add(light)
    }
    this.environmentEnabled = authored.environmentTrial ?? false
    this.environmentBase = authored.environmentBase
    this.standardClips = authored.clips ?? {}
    this.soldierTrial = authored.soldierTrial
    this.unitTrials = {
      ...(authored.soldierTrial ? { soldier: soldierTrialConfiguration(authored.soldierTrial) } : {}),
      ...authored.unitTrials
    }
    this.indexTrialClips()
    this.clips = unitTrialClips(this.standardClips, this.unitTrials)
    if (!this.models)
      this.corpses = new CorpseVisual(this.scene, {
        clips: { ...this.standardClips, ...authored.deathClips },
        unitTrials: this.unitTrials,
        deathAnimations: authored.deathAnimations
      })
    this.effectClips = authored.effectClips ?? {}
    const effectUrls = new Set(Object.values(this.effectClips))
    this.atlasCache =
      authored.cache ??
      new RuntimeAtlasCache((url, signal) =>
        effectUrls.has(url) ? loadEffectWholeFrameAtlas(url, signal) : loadRuntimeWholeFrameAtlas(url, signal)
      )
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false })
    if (this.models) {
      this.renderer.debug.onShaderError = (gl, program) => {
        this.assetErrors['model:shader'] =
          `3D shader compilation failed: ${gl.getProgramInfoLog(program) ?? 'unknown driver error'}`
        this.assetStatus = 'error'
      }
    }
    this.renderer.setSize(this.field.width, this.field.height, false)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.domElement.setAttribute(
      'aria-label',
      '曲がりくねった一本道の戦場。道の外の地面を選んで仲間を自由に配置できます。'
    )
    host.append(this.renderer.domElement)
    this.fortifications = new FortificationVisual(this.scene, host)
    this.commanderSupport = new CommanderSupportVisual(this.scene, host)
    if (authored.commanderBase) this.commander = new CommanderVisual(host, this.scene, authored.commanderBase)
    for (const kind of [
      'slash',
      'dust',
      'arrow',
      'hit',
      'orb',
      'splash',
      'shadow',
      'cannonball',
      'fireball',
      'ice',
      'heal'
    ] as const) {
      const texture = this.texture(combatArt(kind))
      texture.name = `effect:${kind}`
      this.textures.set(kind, texture)
    }
    this.range = new THREE.Mesh(
      new THREE.RingGeometry(0.985, 1, 64),
      new THREE.MeshBasicMaterial({
        color: 0xffd97b,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    )
    this.range.visible = false
    this.range.name = 'attack-range'
    this.scene.add(this.range)
    this.movement = new THREE.Mesh(
      new THREE.CircleGeometry(1, 64),
      new THREE.MeshBasicMaterial({
        color: 0x67cce9,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    )
    this.movement.visible = false
    this.movement.name = 'movement-area'
    for (const dashed of [false, true]) {
      const edge = new THREE.Mesh(
        movementEdgeGeometry(1, dashed),
        new THREE.MeshBasicMaterial({
          color: dashed ? 0xc6f7ff : 0x102d36,
          transparent: true,
          side: THREE.DoubleSide,
          depthWrite: false
        })
      )
      edge.name = dashed ? 'movement-boundary' : 'movement-backing'
      edge.position.z = dashed ? 0.2 : 0.1
      this.movement.add(edge)
      this.movementEdges.push(edge)
    }
    this.scene.add(this.movement)
    for (const dotted of [false, true]) {
      const edge = new THREE.Mesh(
        redeploymentEdgeGeometry(1, dotted),
        new THREE.MeshBasicMaterial({
          color: dotted ? 0xe7b5ff : 0x301c42,
          transparent: true,
          opacity: dotted ? 0.95 : 0.8,
          side: THREE.DoubleSide,
          depthWrite: false
        })
      )
      edge.name = dotted ? 'redeployment-boundary' : 'redeployment-backing'
      edge.visible = false
      this.scene.add(edge)
      this.redeploymentEdges.push(edge)
    }
    this.redeploymentAnchor.name = 'redeployment-anchor'
    this.redeploymentAnchor.visible = false
    this.scene.add(this.redeploymentAnchor)
    this.previewLabel.className = 'range-preview'
    this.previewLabel.hidden = true
    this.movementLabel.className = 'movement-key'
    this.attackLabel.className = 'attack-key'
    this.placementStatus.className = 'placement-status'
    this.redeploymentLabel.className = 'redeployment-key'
    this.redeploymentLabel.hidden = true
    this.redeploymentLabel.style.color = '#e7b5ff'
    this.redeploymentLabel.style.pointerEvents = 'none'
    this.redeploymentLabel.style.whiteSpace = 'normal'
    this.previewLabel.append(this.movementLabel, this.attackLabel, this.placementStatus, this.redeploymentLabel)
    this.placementMarker.name = 'placement-marker'
    this.placementMarker.visible = false
    this.scene.add(this.placementMarker)
    this.placementCursor.className = 'placement-cursor'
    this.placementCursor.hidden = true
    this.host.append(this.placementCursor)
    this.host.append(this.previewLabel)
    this.sandbagPreviewLabel.className = 'sandbag-preview'
    this.sandbagPreviewLabel.hidden = true
    this.host.append(this.sandbagPreviewLabel)
    this.textures.set(
      'cold-mist',
      this.texture(
        canvas(96, 80, (c) => {
          for (const [x, y, radius] of [
            [20, 47, 16],
            [76, 45, 17],
            [34, 65, 18],
            [62, 63, 18]
          ]) {
            const gradient = c.createRadialGradient(x, y, 2, x, y, radius)
            gradient.addColorStop(0, '#d6faff90')
            gradient.addColorStop(0.55, '#a5e8fa50')
            gradient.addColorStop(1, '#a5e8fa00')
            c.fillStyle = gradient
            c.fillRect(x - radius, y - radius, radius * 2, radius * 2)
          }
          c.strokeStyle = '#d0f6ffb0'
          c.lineWidth = 1.5
          for (const y of [45, 58]) {
            c.beginPath()
            c.ellipse(48, y, 32, 7, 0, 0.2, Math.PI * 0.85)
            c.stroke()
          }
        })
      )
    )
  }
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.cancelArtSwitch()
    this.models?.dispose()
    this.environmentRequest?.abort()
    this.environmentArt?.dispose()
    this.pendingEnvironment?.dispose()
    this.atlasCache.dispose()
    this.commander?.dispose()
    this.commanderSupport.dispose()
    this.corpses?.dispose()
    this.dragonSplashes.dispose()
    this.fortifications.dispose()
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose()
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        for (const material of materials) material.dispose()
      }
    })
    for (const texture of this.textures.values()) texture.dispose()
    this.background?.material.map?.dispose()
    for (const slot of this.slots) slot.element.remove()
    for (const label of this.healthLabels.values()) label.element.remove()
    for (const visual of this.units.values()) visual.defenderHandle?.remove()
    this.previewLabel.remove()
    this.placementCursor.remove()
    for (const visual of this.sandbagVisuals.values()) {
      visual.label.remove()
      visual.button.remove()
    }
    this.sandbagVisuals.clear()
    this.sandbagPreviewLabel.remove()
    this.renderer.domElement.remove()
    this.renderer.dispose()
    this.scene.clear()
    this.units.clear()
    this.attackEffects.clear()
    this.projectileLaunches.clear()
    this.textures.clear()
    this.healthLabels.clear()
    this.slots = []
  }

  get artSwitchStatus(): ArtSwitchStatus {
    return this.bulkArtSwitch?.status ?? { status: 'idle' }
  }

  prepareArtMode(
    mode: ArtMode,
    state: Readonly<GameState>,
    catalog: Readonly<Record<UnitTrialType, UnitTrialArt>>,
    base: URL
  ): void {
    this.cancelArtSwitch()
    if (this.models || this.disposed || state.phase !== 'preparation') return
    const effectUrls = new Set(Object.values(this.effectClips))
    this.bulkArtSwitch = new BulkArtSwitch({
      mode,
      state,
      loadEnvironment: (base, fieldId, signal, layoutRevision) =>
        this.loadEnvironment(base, fieldId, signal, layoutRevision),
      standardClips: this.standardClips,
      catalog,
      base,
      portraits: ALL_TRIAL_TYPES.map((type) =>
        mode === '3d' ? catalog[type].portrait : authoredPortrait(type, base)!
      ),
      cache: new RuntimeAtlasCache((url, signal) =>
        effectUrls.has(url) ? loadEffectWholeFrameAtlas(url, signal) : loadRuntimeWholeFrameAtlas(url, signal)
      )
    })
  }

  cancelArtSwitch(): void {
    this.bulkArtSwitch?.dispose()
    this.bulkArtSwitch = undefined
  }

  commitArtSwitch(state: Readonly<GameState>): ArtMode | undefined {
    const transaction = this.bulkArtSwitch
    if (!transaction) return undefined
    if (!transaction.compatible(state)) {
      this.cancelArtSwitch()
      return undefined
    }
    if (
      this.fieldId !== state.fieldId ||
      this.field.version !== state.battlefieldVersion ||
      this.field.layoutRevision !== (state.layoutRevision === undefined ? 1 : state.layoutRevision)
    )
      return undefined
    const bodies: ArtSwitchBody[] = state.units
      .filter((unit) => unit.hp > 0 && ALL_TRIAL_TYPES.some((type) => type === unit.type))
      .map((unit) => ({
        type: unit.type as UnitTrialType,
        direction: spriteDirection({ x: unit.facingX, y: unit.facingY })
      }))
    const preview = this.defenderPlacementPreview
    if (preview)
      bodies.push({
        type: preview.type,
        direction: spriteDirection(
          entranceFacing(state.fieldId, preview.placement.point, state.battlefieldVersion, state.layoutRevision)
        )
      })
    transaction.prepare(state, bodies)
    const prepared = transaction.take()
    if (!prepared) return undefined
    this.bulkArtSwitch = undefined
    this.environmentRequest?.abort()
    this.environmentRequest = undefined
    this.environmentLoading = false
    this.environmentError = undefined
    this.pendingEnvironment?.dispose()
    this.pendingEnvironment = undefined
    this.environmentEnabled = prepared.mode === '3d'
    for (const [id, visual] of this.units) this.removeUnitVisual(id, visual)
    if (this.placementBody) {
      this.placementBody.visible = false
      this.placementBody.material.map = null
    }
    for (const type of ALL_TRIAL_TYPES) this.corpses?.setUnitTrial(type, prepared.trials[type])
    this.unitTrials = { ...prepared.trials }
    this.indexTrialClips()
    this.soldierTrial = undefined
    this.clips = prepared.clips
    this.projectileLaunches.clear()
    this.atlasCache.dispose()
    this.atlasCache = prepared.cache
    for (const key of Object.keys(this.assetErrors)) delete this.assetErrors[key]
    this.installEnvironment(prepared.environment)
    return prepared.mode
  }

  environmentStatus() {
    return {
      enabled: this.environmentEnabled,
      active:
        this.field.layoutRevision === 3 ||
        (!!this.environmentArt && environmentMatchesField(this.environmentArt, this.field)),
      layoutRevision: this.field.layoutRevision,
      loading: this.environmentLoading,
      waitingForPreparation: !!this.pendingEnvironment,
      error: this.environmentError
    }
  }

  async setEnvironmentTrial(enabled: boolean): Promise<void> {
    this.cancelArtSwitch()
    if (this.disposed) return
    if (
      enabled === this.environmentEnabled &&
      (this.environmentLoading || this.environmentArt || this.pendingEnvironment)
    )
      return this.environmentLoad
    this.environmentEnabled = enabled
    this.environmentRequest?.abort()
    this.environmentRequest = undefined
    this.pendingEnvironment?.dispose()
    this.pendingEnvironment = undefined
    this.environmentError = undefined
    this.environmentLoading = false
    this.installEnvironment(undefined)
    if (enabled && this.field.version === 2) await this.requestEnvironment()
  }

  setEnvironmentBundle(bundle: EnvironmentArtBundle | undefined): void {
    this.environmentBundle = bundle
  }

  private async loadEnvironment(
    base: URL,
    fieldId: FieldId,
    signal?: AbortSignal,
    layoutRevision: LayoutRevision = 1
  ): Promise<EnvironmentArt> {
    signal?.throwIfAborted()
    const bundle = this.environmentBundle
    if (bundle && !bundle.disposed && bundle.layoutRevision === layoutRevision && bundle.fieldIds.includes(fieldId))
      return bundle.acquire(fieldId)
    return loadEnvironmentArt(base, fieldId, signal, layoutRevision)
  }

  private installEnvironment(art: EnvironmentArt | undefined): void {
    if (art && !environmentMatchesField(art, this.field)) {
      art.dispose()
      this.environmentError = 'Environment art does not match the current battlefield layout'
      return
    }
    this.environmentArt?.dispose()
    this.environmentArt = art
    this.fortifications.setEnvironmentArt(art)
    this.baseHpTier = -1
    if (this.fieldId) this.refreshBackground()
  }

  private requestEnvironment(): Promise<void> {
    // Compact terrain is drawn from its own geometry, never a revision-2 baked road.
    if (this.field.layoutRevision === 3) return Promise.resolve()
    const request = new AbortController(),
      field = this.field.id,
      version = this.field.version,
      layoutRevision = this.field.layoutRevision
    this.environmentRequest = request
    this.environmentLoading = true
    const base = this.environmentBase ?? new URL('../../../tower-defense-art/', document.baseURI)
    const load = this.loadEnvironment(base, field, request.signal, layoutRevision)
      .then((art) => {
        if (
          this.disposed ||
          request !== this.environmentRequest ||
          !this.environmentEnabled ||
          this.field.id !== field ||
          this.field.version !== version ||
          this.field.layoutRevision !== layoutRevision
        ) {
          art.dispose()
          return
        }
        if (!environmentMatchesField(art, this.field)) {
          art.dispose()
          throw new Error('Environment art does not match the current battlefield layout')
        }
        if (this.previousState?.phase === 'assault') {
          this.pendingEnvironment?.dispose()
          this.pendingEnvironment = art
        } else this.installEnvironment(art)
      })
      .catch((error) => {
        if (!request.signal.aborted && request === this.environmentRequest)
          this.environmentError = error instanceof Error ? error.message : '環境画像を読み込めませんでした'
      })
      .finally(() => {
        if (request === this.environmentRequest) this.environmentLoading = false
      })
    this.environmentLoad = load
    return load
  }

  private refreshBackground(): void {
    const { width, height, id, version, layoutRevision } = this.field
    if (this.background) {
      this.scene.remove(this.background)
      this.background.geometry.dispose()
      this.background.material.map?.dispose()
      this.background.material.dispose()
    }
    const texture = this.texture(createFieldArt(id, false, version, this.environmentArt?.field, layoutRevision))
    texture.name = this.environmentArt
      ? `environment:field:${id}:${version}:${layoutRevision}`
      : `field:${id}:${version}:${layoutRevision}`
    this.background = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })
    )
    this.background.scale.y = -1
    this.background.position.set(width / 2, height / 2, -20)
    this.scene.add(this.background)
  }

  private paintEnvironmentProp(mesh: PixelMesh, sprite: EnvironmentSprite, anchor: Point): void {
    if (mesh.geometry.parameters.width !== sprite.width || mesh.geometry.parameters.height !== sprite.height) {
      mesh.geometry.dispose()
      mesh.geometry = new THREE.PlaneGeometry(sprite.width, sprite.height)
    }
    mesh.material.map = sprite.texture
    mesh.rotation.z = 0
    mesh.position.x = anchor.x + sprite.width / 2 - sprite.pivot.x
    mesh.position.y = anchor.y + sprite.height / 2 - sprite.pivot.y
    mesh.userData.environment = sprite.texture.name
  }

  private removeUnitVisual(id: number, visual: UnitVisual): void {
    this.scene.remove(visual.group)
    visual.group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose()
        ;(object.material as THREE.Material).dispose()
      }
    })
    this.units.delete(id)
    visual.defenderHandle?.remove()
    this.healthLabels.get(id)?.element.remove()
    this.healthLabels.delete(id)
  }

  private texture(c: HTMLCanvasElement) {
    const texture = new THREE.CanvasTexture(c)
    texture.magFilter = THREE.NearestFilter
    texture.minFilter = THREE.NearestFilter
    texture.colorSpace = THREE.SRGBColorSpace
    return texture
  }
  get presentationAssetErrors(): Readonly<Record<string, string>> {
    return this.corpses?.assetErrors ?? {}
  }

  private renderCorpses(s: Readonly<GameState>): ReadonlySet<number> {
    const frames = new Map<number, LastAuthoredFrame>()
    for (const [id, visual] of this.units) if (visual.lastFrame) frames.set(id, visual.lastFrame)
    return (
      this.corpses?.render(s, {
        lastFrames: frames,
        nowMs: performance.now(),
        lastRenderedSimulationTime: this.lastRenderedSimulationTime
      }) ?? new Set<number>()
    )
  }

  setSoldierTrial(art?: SoldierTrialArt): void {
    if (this.soldierTrial === art && (art ? this.unitTrials.soldier?.clips === art.clips : !this.unitTrials.soldier))
      return
    this.setUnitTrial('soldier', art ? soldierTrialConfiguration(art) : undefined)
    this.soldierTrial = art
  }

  setUnitTrial(type: UnitTrialType, art?: UnitTrialArt): void {
    this.cancelArtSwitch()
    if (this.models || this.disposed || this.unitTrials[type] === art) return
    const prefix = `${unitTrialOwner(type)}:${type}:`
    const urls = new Set(
      [...Object.entries(this.standardClips), ...Object.entries(this.clips), ...Object.entries(art?.clips ?? {})]
        .filter(([key]) => key.startsWith(prefix))
        .map(([, url]) => url)
    )
    for (const key of Object.keys(this.assetErrors))
      if (key.startsWith(prefix) || urls.has(key)) delete this.assetErrors[key]
    if (art) this.unitTrials[type] = art
    else delete this.unitTrials[type]
    if (type === 'soldier') this.soldierTrial = undefined
    this.indexTrialClips()
    this.clips = unitTrialClips(this.standardClips, this.unitTrials)
    for (const [id, visual] of this.units) {
      const unit = this.previousState?.units.find((unit) => unit.id === id)
      if (unit?.owner === unitTrialOwner(type) && unit.type === type) this.removeUnitVisual(id, visual)
    }
    for (const attack of this.previousState?.attacks ?? [])
      if (attack.owner === unitTrialOwner(type) && attack.type === type)
        for (const id of [attack.id, `${attack.id}:heal`, `${attack.id}:muzzle`]) this.projectileLaunches.delete(id)
    if (this.displayedPlacementPreview?.type === type && this.placementBody) {
      this.placementBody.visible = false
      this.placementBody.material.map = null
    }
    if (art && !this.corpses) this.corpses = new CorpseVisual(this.scene, { clips: {} })
    this.corpses?.setUnitTrial(type, art)
    this.atlasCache.invalidate(urls)
  }

  setCommanderMode(enabled: boolean): void {
    this.commanderMode = enabled
  }

  assetStatus: 'ready' | 'loading' | 'error' = 'loading'

  assetsReady(s: Readonly<GameState>): boolean {
    this.renderCorpses(s)
    this.atlasCache.beginFrame()
    const ready = this.requireCurrentAtlases(s)
    this.atlasCache.endFrame()
    this.assetStatus = Object.keys(this.assetErrors).length ? 'error' : ready ? 'ready' : 'loading'
    return this.assetStatus === 'ready'
  }

  private requireCurrentAtlases(s: Readonly<GameState>): boolean {
    let ready =
      this.models && this.modelsActive
        ? this.models.ready(
            s,
            this.defenderPlacementPreview?.type ?? (s.phase === 'preparation' ? this.modelSelected : undefined)
          )
        : true
    if (this.models) Object.assign(this.assetErrors, this.models.errors)
    for (const unit of this.models ? [] : s.units) {
      if (unit.hp <= 0) continue
      const attack = s.attacks.find((value) => value.attackerId === unit.id && value.sequence === unit.attackSequence)
      const active = this.attackActive(s, unit, attack)
      const direction = spriteDirection((active && attack?.aim) || { x: unit.facingX, y: unit.facingY })
      if (active && temporaryPaladinHeal(attack)) {
        // Keep neutral whole-body art available while the dedicated action loads or fails.
        const trial = unitTrialFor(unit, this.unitTrials)
        const key = authoredClipKey(unit, 'attack', direction, 'heal')
        const heal = trial ? this.approvedAttack(unit, direction, 'heal', false) : undefined
        if (heal) this.atlasCache.get(this.clips[key])
        else {
          const idleUrl = this.clips[authoredClipKey(unit, 'idle', direction)]
          if (!this.approvedAtlas(idleUrl, 'idle', direction)) ready = false
          if (trial) {
            if (!this.clips[key]) this.assetErrors[key] = 'Missing dedicated Paladin healing atlas'
            ready = false
          }
        }
        continue
      }
      const motion = active ? 'attack' : s.phase === 'assault' && unit.moving ? 'walk' : 'idle'
      const key = authoredClipKey(unit, motion, direction, active ? attack?.variant : undefined)
      const url = this.clips[key]
      if (!url) this.assetErrors[key] = 'Missing character atlas'
      if (
        !(motion === 'attack'
          ? this.approvedAttack(unit, direction, attack?.variant)
          : this.approvedAtlas(url, motion, direction))
      )
        ready = false
      if (active && attack?.breath && !this.breathEffect()) ready = false
    }
    if (s.phase === 'assault')
      for (const attack of s.attacks) {
        if (this.models && attack.breath && s.time < attack.endsAt && !this.breathEffect()) ready = false
        if (
          !attack.projectile ||
          (attack.status !== 'windup' && attack.status !== 'released') ||
          s.time < attack.startedAt ||
          s.time >= attack.impactAt
        )
          continue
        const url = this.effectClips[`${attack.type}:${attack.healing ? 'heal' : 'projectile'}`]
        if (url) {
          const atlas = this.atlasCache.get(url)
          const error = this.atlasCache.error(url)
          if (error) this.assetErrors[url] = error
          if (!atlas || error) ready = false
        }
        if (
          !s.units.some(
            (unit) => unit.id === attack.attackerId && unit.hp > 0 && unit.attackSequence === attack.sequence
          )
        ) {
          if (!this.models && this.clips[this.cueKey(attack)] && !this.cueAtlas(attack, true)) ready = false
        }
      }
    const preview =
      s.phase === 'preparation' || (s.phase === 'assault' && this.defenderPlacementPreview?.battle)
        ? this.defenderPlacementPreview
        : null
    if (preview && !this.models) {
      const direction = spriteDirection(
        entranceFacing(s.fieldId, preview.placement.point, s.battlefieldVersion, s.layoutRevision)
      )
      const key = authoredClipKey({ owner: 'player', type: preview.type }, 'idle', direction)
      const url = this.clips[key]
      if (!url) this.assetErrors[key] = 'Missing character atlas'
      if (!this.approvedAtlas(url, 'idle', direction)) ready = false
    }
    return ready
  }

  private indexTrialClips(): void {
    this.trialByClip.clear()
    for (const type of ALL_TRIAL_TYPES) {
      const art = this.unitTrials[type]
      if (art)
        for (const url of Object.values(art.clips)) if (!this.trialByClip.has(url)) this.trialByClip.set(url, art)
    }
  }

  private approvedAtlas(
    url: string | undefined,
    motion: SpriteMotion,
    direction: SpriteDirection,
    pin = true
  ): WholeFrameAtlas | undefined {
    if (!url || this.assetErrors[url]) return undefined
    const atlas = this.atlasCache.get(url, pin)
    const error = this.atlasCache.error(url)
    if (error) this.assetErrors[url] = error
    const trial = this.trialByClip.get(url)
    if (atlas && trial && atlas.manifest.character !== trial.character) {
      this.assetErrors[url] = 'Trial atlas character does not match its registry entry'
      return undefined
    }
    if (
      atlas &&
      (atlas.manifest.motion !== motion ||
        atlas.manifest.direction !== direction ||
        (motion === 'attack' && atlas.manifest.loop))
    ) {
      this.assetErrors[url] = 'Approved atlas motion/direction/loop does not match its registry key'
      return undefined
    }
    return atlas
  }

  private approvedAttack(
    unit: Pick<Unit, 'owner' | 'type'> & Partial<Pick<Unit, 'attackSpeed'>>,
    direction: SpriteDirection,
    variant?: 'breath' | 'heal',
    pin = true
  ): WholeFrameAtlas | undefined {
    const url = this.clips[authoredClipKey(unit, 'attack', direction, variant)]
    const atlas = this.approvedAtlas(url, 'attack', direction, pin)
    if (!atlas) return undefined
    if ((atlas.manifest.attackVariant ?? 'primary') !== (variant ?? 'primary')) {
      this.assetErrors[url!] = 'Attack variant does not match its registry key'
      return undefined
    }
    const profile =
      variant === 'heal'
        ? (healingAction(unit) ??
          (unit.owner === 'player' && unit.type === 'paladin' ? HEALING_ACTIONS.paladin : undefined))
        : variant === 'breath'
          ? { durationMs: BREATH_TIMING.durationMs, cue: 'release', cueMs: BREATH_TIMING.startMs }
          : ATTACK_PROFILES[unit.type]
    if (variant !== 'heal' && unit.attackSpeed && atlas.manifest.durationMs > 1000 / unit.attackSpeed) {
      this.assetErrors[url!] = 'Attack clip duration exceeds the unit attack cadence'
      return undefined
    }
    if (
      profile &&
      (atlas.manifest.durationMs !== profile.durationMs ||
        atlas.manifest.events.length !== 1 ||
        atlas.manifest.events[0].type !== profile.cue ||
        atlas.manifest.events[0].atMs !== profile.cueMs)
    ) {
      this.assetErrors[url!] = 'Attack clip cue does not match authoritative combat timing'
      return undefined
    }
    return atlas
  }

  private locomotionElapsed(atlas: WholeFrameAtlas, unit: Readonly<Unit>, nowMs: number): number {
    if (unit.hp <= 0) return 0
    const { motion, strideWorldUnits, durationMs } = atlas.manifest
    const override = unitTrialFor(unit, this.unitTrials)?.walkCycleTravelOverride
    if (motion === 'walk' && override) return (unit.travelled / override) * durationMs
    return motion === 'walk' && strideWorldUnits
      ? (unit.travelled / (strideWorldUnits * bodyScale(unit))) * durationMs
      : nowMs
  }

  private attackActive(
    s: Readonly<GameState>,
    unit: Readonly<Unit>,
    attack: Readonly<CombatAttack> | undefined
  ): boolean {
    const elapsed = s.time - unit.attackStartedAt
    return (
      s.phase === 'assault' &&
      unit.hp > 0 &&
      unit.attackSequence > 0 &&
      elapsed >= 0 &&
      s.time + 1e-9 <
        (attack?.endsAt ??
          unit.attackStartedAt +
            (ATTACK_PROFILES[unit.type].durationMs * (unit.owner === 'ai' ? ENEMY_ACTION_TIME_SCALE : 1)) / 1000) &&
      (attack?.status !== 'cancelled' || unit.owner === 'ai')
    )
  }

  private authoredFrame(s: Readonly<GameState>, unit: Readonly<Unit>, visual: UnitVisual, nowMs: number) {
    const attack = s.attacks.find((value) => value.attackerId === unit.id && value.sequence === unit.attackSequence)
    const lockedAim =
      attack && (attack.status !== 'cancelled' || unit.owner === 'ai') && s.time + 1e-9 < attack.endsAt
        ? attack.aim
        : undefined
    const direction = spriteDirection(lockedAim ?? { x: unit.facingX, y: unit.facingY })
    if (temporaryPaladinHeal(attack) && this.attackActive(s, unit, attack)) {
      // The simulation clock/recipient are authoritative. Never use a sword clip for healing.
      visual.playback.cancel()
      visual.attackAtlasUrl = undefined
      visual.lastAttackSequence = unit.attackSequence
      const healUrl = this.clips[authoredClipKey(unit, 'attack', direction, 'heal')]
      const heal = unitTrialFor(unit, this.unitTrials) ? this.approvedAttack(unit, direction, 'heal') : undefined
      if (heal) {
        visual.lastAtlasUrl = healUrl
        return { atlas: heal, elapsedMs: Math.max(0, (s.time - attack!.startedAt) * 1000) }
      }
      const url = this.clips[authoredClipKey(unit, 'idle', direction)]
      const atlas = this.approvedAtlas(url, 'idle', direction)
      if (!atlas) return undefined
      visual.lastAtlasUrl = visual.restAtlasUrl = url
      return { atlas, elapsedMs: 0 }
    }
    // An explicit finished/cancelled heal must not request a sword atlas either.
    const variant = temporaryPaladinHeal(attack) ? 'heal' : attack?.variant
    const attackUrl = this.clips[authoredClipKey(unit, 'attack', direction, variant)]
    const candidate = unit.hp > 0 ? this.approvedAttack(unit, direction, variant, false) : undefined
    if (unit.attackSequence > visual.lastAttackSequence) {
      visual.lastAttackSequence = unit.attackSequence
      visual.attackAtlasUrl = undefined
      visual.playback.cancel()
    }
    const attackActive = this.attackActive(s, unit, attack)
    if (attackActive && !visual.attackAtlasUrl && candidate) {
      const elapsed = Math.max(0, ((s.time - unit.attackStartedAt) * 1000) / attackTimeScale(attack))
      if (
        elapsed < candidate.manifest.durationMs &&
        visual.playback.start(
          unit.attackSequence,
          candidate.manifest,
          unit.attackStartedAt * 1000,
          attackTimeScale(attack)
        )
      )
        visual.attackAtlasUrl = attackUrl
    }
    if (s.phase !== 'assault' || unit.hp <= 0 || (attack?.status === 'cancelled' && unit.owner === 'player'))
      visual.playback.cancel()
    const playback = visual.playback.sample(s.time * 1000)
    if (playback.active && visual.attackAtlasUrl) {
      const atlas = this.atlasCache.get(visual.attackAtlasUrl)
      if (atlas) {
        visual.lastAtlasUrl = visual.attackAtlasUrl
        const restUrl = this.clips[authoredClipKey(unit, 'idle', atlas.manifest.direction)]
        if (this.approvedAtlas(restUrl, 'idle', atlas.manifest.direction, false)) visual.restAtlasUrl = restUrl
        return { atlas, elapsedMs: playback.elapsedMs }
      }
    }
    if (attackActive) return undefined
    const motion = s.phase === 'assault' && unit.moving ? 'walk' : 'idle'
    const url = this.clips[authoredClipKey(unit, motion, direction)]
    const atlas = this.approvedAtlas(url, motion, direction)
    if (atlas) {
      visual.lastAtlasUrl = visual.restAtlasUrl = url
      return { atlas, elapsedMs: this.locomotionElapsed(atlas, unit, nowMs) }
    }
    const rest = visual.restAtlasUrl ? this.atlasCache.get(visual.restAtlasUrl) : undefined
    if (rest) {
      visual.lastAtlasUrl = visual.restAtlasUrl
      return { atlas: rest, elapsedMs: this.locomotionElapsed(rest, unit, nowMs) }
    }
    const held = visual.lastAtlasUrl ? this.atlasCache.get(visual.lastAtlasUrl) : undefined
    return held
      ? {
          atlas: held,
          elapsedMs: held.manifest.motion === 'attack' ? 0 : this.locomotionElapsed(held, unit, nowMs)
        }
      : undefined
  }

  private effectMesh(id: string): PixelMesh {
    let mesh = this.attackEffects.get(id)
    if (!mesh) {
      mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(32, 32),
        new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false })
      )
      mesh.name = `attack-effect:${id}`
      this.attackEffects.set(id, mesh)
      this.scene.add(mesh)
    }
    mesh.visible = false
    return mesh
  }

  private cueKey(attack: Readonly<CombatAttack>): string {
    const direction = spriteDirection(
      attack.aim ?? { x: attack.target.x - attack.origin.x, y: attack.target.y - attack.origin.y }
    )
    return authoredClipKey(attack, 'attack', direction, temporaryPaladinHeal(attack) ? 'heal' : attack.variant)
  }

  private cueAtlas(attack: Readonly<CombatAttack>, pin = false): WholeFrameAtlas | undefined {
    if (this.models) return undefined
    const direction = spriteDirection(
      attack.aim ?? {
        x: attack.target.x - attack.origin.x,
        y: attack.target.y - attack.origin.y
      }
    )
    return this.approvedAttack(attack, direction, temporaryPaladinHeal(attack) ? 'heal' : attack.variant, pin)
  }

  private cuePoint(attack: Readonly<CombatAttack>, id: string): Point {
    let point = this.projectileLaunches.get(id)
    if (!point) {
      if (this.models) {
        if (!attack.projectile && !attack.breath) return { x: attack.target.x, y: attack.target.y - 18 }
        point = this.models.emitter(attack)
        if (point) {
          this.projectileLaunches.set(id, point)
          return point
        }
        this.assetErrors[`${attack.type}:emitter`] = 'Missing verified 3D projectile emitter'
        return { x: attack.origin.x, y: attack.origin.y - 16 }
      }
      const atlas = this.cueAtlas(attack)
      const contact = atlas && unitTrialFor(attack, this.unitTrials)?.impactOffsets?.[atlas.manifest.direction]
      const scale = bodyScale(attack) * unitTrialScale(attack, this.unitTrials)
      point = contact
        ? { x: attack.origin.x + contact.x * scale, y: attack.origin.y + contact.y * scale }
        : atlas
          ? authoredEmitter(attack.origin, atlas.manifest, attackAssetElapsedMs(attack, attack.releaseAt), scale)
          : undefined
      point ??= { x: attack.origin.x, y: attack.origin.y - 16 }
      this.projectileLaunches.set(id, point)
    }
    return point
  }

  private paintAtlasEffect(
    mesh: PixelMesh,
    atlas: WholeFrameAtlas,
    elapsedMs: number,
    point: Point,
    angle: number,
    scale = 1,
    lateralScale = scale
  ): void {
    const { width, height } = atlas.worldSize
    if (mesh.geometry.parameters.width !== width || mesh.geometry.parameters.height !== height) {
      mesh.geometry.dispose()
      mesh.geometry = new THREE.PlaneGeometry(width, height)
    }
    const offset = atlas.anchorOffset
    mesh.visible = true
    mesh.material.map = atlas.sample(elapsedMs).texture
    mesh.material.opacity = 1
    mesh.position.set(
      point.x + scale * offset.x * Math.cos(angle) - lateralScale * offset.y * Math.sin(angle),
      point.y + scale * offset.x * Math.sin(angle) + lateralScale * offset.y * Math.cos(angle),
      point.y / 10 + 4
    )
    mesh.rotation.z = angle
    mesh.scale.set(scale, -lateralScale, 1)
  }

  private breathEffect(): WholeFrameAtlas | undefined {
    const url = this.effectClips['dragon:breath']
    if (!url) {
      this.assetErrors['dragon:breath'] = 'Missing authored breath effect'
      return undefined
    }
    const atlas = this.atlasCache.get(url)
    const error = this.atlasCache.error(url)
    if (error) this.assetErrors[url] = error
    if (
      atlas &&
      (atlas.manifest.direction !== 'e' ||
        atlas.manifest.motion !== 'idle' ||
        !atlas.manifest.loop ||
        atlas.manifest.events.length ||
        atlas.manifest.frameSize.pivot.x !== 8 ||
        atlas.manifest.frameSize.pivot.y !== 56)
    ) {
      this.assetErrors[url] = 'Breath effect contract mismatch'
      return undefined
    }
    return atlas
  }

  private renderAttackEffects(s: Readonly<GameState>): void {
    const active = new Set(
      s.phase === 'assault'
        ? s.attacks.flatMap((attack) => [
            attack.id,
            `${attack.id}:heal`,
            `${attack.id}:muzzle`,
            `${attack.id}:heal-cast`
          ])
        : []
    )
    for (const [id, mesh] of this.attackEffects) {
      mesh.visible = false
      if (!active.has(id)) {
        this.scene.remove(mesh)
        mesh.geometry.dispose()
        mesh.material.dispose()
        this.attackEffects.delete(id)
        this.projectileLaunches.delete(id)
      }
    }
    if (s.phase !== 'assault') return
    for (const attack of s.attacks) {
      if (!ATTACK_PROFILES[attack.type]) continue
      if (!this.models && !temporaryPaladinHeal(attack) && this.clips[this.cueKey(attack)] && !this.cueAtlas(attack))
        continue
      if (temporaryPaladinHeal(attack) && attack.status !== 'cancelled' && s.time < attack.endsAt) {
        const caster = s.units.find((unit) => unit.id === attack.attackerId && unit.hp > 0)
        if (caster) {
          const effect = this.effectMesh(`${attack.id}:heal-cast`)
          effect.visible = true
          effect.material.map = this.textures.get('heal')!
          effect.material.color.setHex(0xffffff)
          effect.material.opacity = 0.8
          effect.position.set(caster.x, caster.y - 62, caster.y / 10 + 5)
          effect.rotation.z = 0
          effect.scale.set(0.7, -0.7, 1)
        }
      }
      if (attack.breath) {
        const mesh = this.effectMesh(attack.id),
          shape = attack.breath.shape
        const elapsedMs = attackAssetElapsedMs(attack, s.time)
        const atlas = this.breathEffect()
        if (
          shape &&
          atlas &&
          attack.status !== 'cancelled' &&
          elapsedMs >= BREATH_TIMING.startMs - 1e-6 &&
          elapsedMs < BREATH_TIMING.endMs - 1e-6
        ) {
          const trial = unitTrialFor(attack, this.unitTrials)
          const origin = this.models
            ? (this.models.emitter(attack, s.time) ?? shape.origin)
            : trial?.breathMouths
              ? mouthAt(
                  attack.origin,
                  trial.breathMouths[attack.breath.direction],
                  elapsedMs,
                  bodyScale(attack) * trial.displayScale
                )
              : shape.origin
          this.paintAtlasEffect(
            mesh,
            atlas,
            elapsedMs - BREATH_TIMING.startMs,
            origin,
            Math.atan2(shape.direction.y, shape.direction.x),
            shape.length / BREATH_SOURCE_GEOMETRY.mouthToTipLength,
            shape.endHalfWidth / BREATH_SOURCE_GEOMETRY.terminalHalfWidth
          )
          mesh.material.color.setHex(0xffffff)
          mesh.material.opacity = 0.75
          if (
            attack.breath.direction === 'n' ||
            (trial?.breathMouths && ['ne', 'nw'].includes(attack.breath.direction))
          )
            mesh.position.z = Math.min(mesh.position.z, (attack.origin.y - 24) / 10 - 0.1)
        }
        continue
      }
      const effects = [
        {
          id: attack.id,
          target: attack.target,
          active: attack.damageActive,
          hit: attack.damageHit,
          healing: false
        }
      ]
      if (attack.healing)
        effects.push({
          id: `${attack.id}:heal`,
          target: attack.healing.target,
          active: attack.healing.active,
          hit: attack.healing.hit,
          healing: true
        })
      for (const effect of effects) {
        const mesh = this.effectMesh(effect.id)
        if (!effect.active || attack.status === 'windup' || attack.status === 'cancelled') continue
        mesh.material.color.setHex(effect.healing ? 0x91ffae : 0xffffff)
        const impactAge = s.time - attack.impactAt
        const targetUnit = s.units.find(
          (unit) => unit.id === (effect.healing ? attack.healing?.targetId : attack.targetId)
        )
        const target = {
          x: effect.target.x,
          y:
            effect.target.y -
            (attack.base ? 22 : attack.barrierId !== undefined && !effect.healing ? 6 : 18) *
              (targetUnit?.boss ? 1.35 : 1)
        }
        if (attack.projectile && impactAge < 0) {
          const origin = this.cuePoint(attack, effect.id)
          const duration = attack.impactAt - attack.releaseAt
          const flight = (s.time - attack.releaseAt) / duration
          const axisAtlas =
            ['archer', 'ranger', 'cannon', 'shaman', 'wraith', 'dragon'].includes(attack.type) &&
            unitTrialFor(attack, this.unitTrials)
              ? this.cueAtlas(attack)
              : undefined
          const isArrow = !effect.healing && (attack.type === 'archer' || attack.type === 'ranger')
          const pose = isArrow
            ? arrowProjectilePose(
                origin,
                target,
                flight,
                duration,
                attack.targetVelocity,
                arrowArcHeight(attack.aim ? Math.hypot(attack.aim.x, attack.aim.y) : attack.range)
              )
            : axisAtlas
              ? authoredAxisProjectilePose(
                  origin,
                  target,
                  flight,
                  duration,
                  axisAtlas.manifest.direction,
                  attack.targetVelocity
                )
              : projectilePose(
                  origin,
                  target,
                  flight,
                  duration,
                  effect.healing && attack.kind !== 'heal' ? undefined : attack.targetVelocity
                )
          const effectUrl = this.effectClips[`${attack.type}:${effect.healing ? 'heal' : 'projectile'}`]
          const effectAtlas = effectUrl ? this.atlasCache.get(effectUrl) : undefined
          if (effectUrl && !effectAtlas) continue
          if (effectAtlas) {
            const flightAgeMs = (s.time - attack.releaseAt) * 1000
            this.paintAtlasEffect(
              mesh,
              effectAtlas,
              flightAgeMs,
              pose.position,
              pose.angle,
              projectileDisplayScale(
                attack.type,
                flightAgeMs,
                Math.hypot(pose.position.x - origin.x, pose.position.y - origin.y)
              )
            )
          } else {
            if (mesh.geometry.parameters.width !== 32 || mesh.geometry.parameters.height !== 32) {
              mesh.geometry.dispose()
              mesh.geometry = new THREE.PlaneGeometry(32, 32)
            }
            mesh.visible = true
            mesh.material.map = this.textures.get(effect.healing ? 'orb' : (PROJECTILES[attack.type] ?? 'orb'))!
            mesh.material.opacity = 1
            mesh.position.set(pose.position.x, pose.position.y, pose.position.y / 10 + 4)
            mesh.rotation.z = pose.angle
            mesh.scale.set(0.85, -0.85, 1)
          }
          const groundY = attack.origin.y + (effect.target.y - attack.origin.y) * flight
          const projectedY = origin.y + (target.y - origin.y) * flight
          // Arrow altitude affects its screen position, never its ground-plane
          // occlusion. A tiny directional tie-break keeps release behind/front
          // of the caster for upward/downward shots, including the first frame.
          mesh.position.z = isArrow
            ? (groundY - 24) / 10 + Math.sign(effect.target.y - attack.origin.y) * 0.01
            : (groundY + pose.position.y - projectedY - 24) / 10
        } else if (effect.hit && impactAge >= 0) {
          const impactUrl = this.effectClips[`${attack.type}:${effect.healing ? 'heal-impact' : 'impact'}`]
          const impactAtlas = impactUrl ? this.atlasCache.get(impactUrl) : undefined
          if (impactAtlas) {
            if (impactAge * 1000 < impactAtlas.manifest.durationMs) {
              const point = !attack.projectile && !effect.healing ? this.cuePoint(attack, effect.id) : target
              const aim = attack.aim ?? { x: target.x - attack.origin.x, y: target.y - attack.origin.y }
              this.paintAtlasEffect(
                mesh,
                impactAtlas,
                impactAge * 1000,
                point,
                Math.atan2(aim.y, aim.x),
                bodyScale(attack) * unitTrialScale(attack, this.unitTrials)
              )
            }
            continue
          }
          if (impactAge >= 0.12) continue
          if (mesh.geometry.parameters.width !== 32 || mesh.geometry.parameters.height !== 32) {
            mesh.geometry.dispose()
            mesh.geometry = new THREE.PlaneGeometry(32, 32)
          }
          mesh.visible = true
          mesh.material.map = this.textures.get(effect.healing ? 'heal' : 'hit')!
          mesh.material.opacity = 1 - impactAge / 0.12
          const point =
            !attack.projectile && !effect.healing && unitTrialFor(attack, this.unitTrials)?.impactOffsets
              ? this.cuePoint(attack, effect.id)
              : target
          mesh.position.set(point.x, point.y, point.y / 10 + 4)
          mesh.rotation.z = 0
          const scale = 0.7 + impactAge / 0.12
          mesh.scale.set(scale, -scale, 1)
        }
      }
      const muzzleUrl = this.effectClips[`${attack.type}:muzzle`]
      if (!muzzleUrl) continue
      const muzzle = this.effectMesh(`${attack.id}:muzzle`)
      const muzzleAtlas = this.atlasCache.get(muzzleUrl)
      const releaseAgeMs = (s.time - attack.releaseAt) * 1000
      if (
        muzzleAtlas &&
        attack.projectile &&
        attack.damageActive &&
        attack.status !== 'windup' &&
        attack.status !== 'cancelled' &&
        releaseAgeMs >= 0 &&
        releaseAgeMs < muzzleAtlas.manifest.durationMs
      ) {
        const origin = this.cuePoint(attack, attack.id)
        const aim = attack.aim ?? {
          x: attack.target.x - attack.origin.x,
          y: attack.target.y - attack.origin.y
        }
        this.paintAtlasEffect(muzzle, muzzleAtlas, releaseAgeMs, origin, Math.atan2(aim.y, aim.x), bodyScale(attack))
        muzzle.position.z = (attack.origin.y - 24) / 10 + Math.sign(aim.y) * 0.01
        muzzle.material.color.setHex(0xffffff)
      }
    }
  }

  private prepareEntryArt(s: Readonly<GameState>, selected: AllyType): void {
    if (s.phase !== 'preparation') return
    if (this.models && !this.modelsActive) return
    this.models?.ready(s, selected)
    const path = fieldFor(s).path
    const direction = spriteDirection({ x: path[1].x - path[0].x, y: path[1].y - path[0].y })
    const rules = stageRules(s.stage, s.waveBossPolicy)
    const enemies = new Set(rules.enemyTypes)
    if (rules.bossType) enemies.add(rules.bossType)
    const requests = [
      { owner: 'player' as const, type: selected, direction: 's' as SpriteDirection },
      ...[...enemies].map((type) => ({ owner: 'ai' as const, type, direction }))
    ]
    for (const unit of this.models ? [] : requests)
      for (const motion of ['idle', 'walk', 'attack'] as const) {
        const url = this.clips[authoredClipKey(unit, motion, unit.direction)]
        if (url) this.atlasCache.get(url, false)
      }
    for (const unit of requests) {
      if (!this.models && unit.owner === 'player' && unit.type === 'paladin') {
        const heal = this.clips[authoredClipKey(unit, 'attack', unit.direction, 'heal')]
        if (heal) this.atlasCache.get(heal, false)
      }
      for (const kind of ['projectile', 'heal', 'muzzle', 'impact', 'heal-impact', 'breath']) {
        const url = this.effectClips[`${unit.type}:${kind}`]
        if (url) this.atlasCache.get(url, false)
      }
    }
  }

  setField(id: FieldId, version: BattlefieldVersion = 1, layoutRevision: LayoutRevision = 1): void {
    if (
      this.disposed ||
      (this.fieldId === id && this.field.version === version && this.field.layoutRevision === layoutRevision)
    )
      return
    const field = getField(id, version, layoutRevision)
    this.environmentRequest?.abort()
    this.environmentRequest = undefined
    this.environmentLoading = false
    this.environmentError = undefined
    this.environmentArt?.dispose()
    this.pendingEnvironment?.dispose()
    this.environmentArt = this.pendingEnvironment = undefined
    this.fortifications.setEnvironmentArt(undefined)
    this.fieldId = id
    this.field = field
    const { width, height } = this.field
    this.renderer.setSize(width, height, false)
    this.camera.right = width
    this.camera.bottom = height
    this.camera.updateProjectionMatrix()
    this.renderer.domElement.setAttribute(
      'aria-label',
      version === 2
        ? '侵入口から二つに分かれ、王国の門へ合流する縦長の戦場。道の外の地面に仲間を配置できます。'
        : '曲がりくねった一本道の戦場。道の外の地面を選んで仲間を自由に配置できます。'
    )
    this.setSandbagPreview(null)
    this.setRoadItemPreview(null)
    this.setGateSelected(false)
    this.baseHpTier = -1
    this.previousBaseHp = undefined
    this.baseHitAt = -Infinity
    this.refreshBackground()
    if (!this.baseVisual) {
      this.baseVisual = new THREE.Mesh(
        new THREE.PlaneGeometry(192, 256),
        new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide })
      )
      this.baseVisual.name = 'defended-base'
      this.baseVisual.scale.y = -1
      this.scene.add(this.baseVisual)
    }
    for (const slot of this.slots) {
      slot.element.remove()
      this.scene.remove(slot.marker)
      slot.marker.geometry.dispose()
      slot.marker.material.dispose()
    }
    this.slots = []
    if (this.environmentEnabled && version === 2) void this.requestEnvironment()
  }

  private renderBase(s: Readonly<GameState>): void {
    const ratio = s.playerBaseHp / CONFIG.baseHp,
      tier = ratio < 0.34 ? 0 : ratio < 0.67 ? 1 : 2
    if (this.previousBaseHp !== undefined && s.playerBaseHp < this.previousBaseHp) this.baseHitAt = s.time
    this.previousBaseHp = s.playerBaseHp
    if (tier !== this.baseHpTier) {
      const key = `base:${s.fieldId}:${s.battlefieldVersion}:${s.layoutRevision === undefined ? 1 : s.layoutRevision}:${tier}`
      let texture = this.textures.get(key)
      if (!texture) {
        texture = this.texture(createBaseArt(s.fieldId, [0.2, 0.5, 1][tier]))
        texture.name = key
        this.textures.set(key, texture)
      }
      this.baseVisual!.material.map =
        this.environmentArt?.props[`gate-${['critical', 'damaged', 'intact'][tier]}`].texture ?? texture
      this.baseHpTier = tier
    }
    const age = s.time - this.baseHitAt
    const shake = s.phase === 'assault' && age >= 0 && age < 0.18 ? Math.sin(age * 90) * 2.5 * (1 - age / 0.18) : 0
    const base = fieldFor(s).gate
    this.baseVisual!.position.set(base.x + shake, base.y - 56, base.y / 10 - 1)
  }
  worldPointAt(clientX: number, clientY: number): Point | null {
    const bounds = this.host.getBoundingClientRect(),
      x = ((clientX - bounds.left) / bounds.width) * this.field.width,
      y = ((clientY - bounds.top) / bounds.height) * this.field.height
    return Number.isFinite(x) &&
      Number.isFinite(y) &&
      x >= 0 &&
      x <= this.field.width &&
      y >= 0 &&
      y <= this.field.height
      ? { x, y }
      : null
  }

  setRoadItemPreview(preview: RoadItemPlacement | null, label = '', kind: RoadItemKind = 'spike'): void {
    this.fortifications.setPreview(preview, label, kind)
  }

  setRoadItemSelection(id: number | null): void {
    this.fortifications.setSelection(id)
  }

  setGateSelected(selected: boolean): void {
    this.fortifications.setGateSelected(selected)
  }

  setSandbagSelection(id: number | null): void {
    this.selectedSandbagId = id
  }

  setDefenderPlacementPreview(preview: DefenderPlacementPreview | null): void {
    this.defenderPlacementPreview = preview
      ? {
          type: preview.type,
          battle: preview.battle,
          placement: { ...preview.placement, point: { ...preview.placement.point } },
          redeploy: preview.redeploy
            ? { anchor: { ...preview.redeploy.anchor }, radius: preview.redeploy.radius }
            : undefined
        }
      : null
    if (preview) return
    this.displayedPlacementPreview = null
    for (const edge of this.redeploymentEdges) edge.visible = false
    this.redeploymentAnchor.visible = false
    this.redeploymentLabel.hidden = true
  }

  setSandbagPreview(preview: SandbagPlacement | null, label = ''): void {
    this.sandbagPreview = preview
    this.sandbagPreviewLabel.textContent = label
    if (!preview) {
      if (this.sandbagGhost) this.sandbagGhost.visible = false
      this.sandbagPreviewLabel.hidden = true
    }
  }

  private sandbagMesh(name: string): PixelMesh {
    let texture = this.textures.get('sandbag')
    if (!texture) {
      texture = this.texture(createSandbagArt())
      texture.name = 'sandbag'
      this.textures.set('sandbag', texture)
    }
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(64, 40),
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    )
    mesh.name = name
    mesh.renderOrder = -1
    mesh.scale.y = -1
    this.scene.add(mesh)
    return mesh
  }

  private positionSandbag(
    mesh: PixelMesh,
    point: Point,
    progress: number,
    anchor: Partial<RoadAnchor>,
    healthRatio = 1
  ): void {
    const projection = this.field.version === 2 ? nearestRoadEdge(this.field, point) : undefined,
      edge = this.field.edges.find((edge) => edge.id === (anchor.edgeId ?? projection?.edgeId)),
      path = edge?.points ?? this.field.path,
      offset = edge ? (anchor.offset ?? projection?.offset ?? progress) : progress,
      before = pointOnPath(path, offset - 1),
      after = pointOnPath(path, offset + 1)
    mesh.position.set(point.x, point.y, point.y / 10)
    const angle = Math.atan2(after.y - before.y, after.x - before.x) + Math.PI / 2,
      sprite =
        this.environmentArt?.props[`sandbag-${healthRatio < 0.5 ? 'damaged' : 'intact'}-${environmentDirection(angle)}`]
    if (sprite) this.paintEnvironmentProp(mesh, sprite, point)
    else {
      if (mesh.geometry.parameters.width !== 64 || mesh.geometry.parameters.height !== 40) {
        mesh.geometry.dispose()
        mesh.geometry = new THREE.PlaneGeometry(64, 40)
      }
      mesh.material.map = this.textures.get('sandbag')!
      mesh.rotation.z = angle
      delete mesh.userData.environment
    }
  }

  private renderSandbag(s: Readonly<GameState>, interactive: boolean): void {
    const barriers = s.sandbags.filter((bag) => bag.hp > 0)
    for (const [id, visual] of this.sandbagVisuals)
      if (!barriers.some((bag) => bag.id === id)) {
        this.scene.remove(visual.mesh)
        visual.mesh.geometry.dispose()
        visual.mesh.material.dispose()
        visual.label.remove()
        visual.button.remove()
        this.sandbagVisuals.delete(id)
      }
    if (!barriers.some((bag) => bag.id === this.selectedSandbagId)) this.selectedSandbagId = null
    for (const barrier of barriers) {
      let visual = this.sandbagVisuals.get(barrier.id)
      if (!visual) {
        const mesh = this.sandbagMesh(`road-sandbag:${barrier.id}`),
          label = document.createElement('div'),
          button = document.createElement('button')
        label.className = 'sandbag-health'
        label.textContent = ''
        label.innerHTML = '<i aria-hidden="true"><b></b></i>'
        label.setAttribute('role', 'progressbar')
        label.setAttribute('aria-label', '土のうの耐久')
        label.setAttribute('aria-valuemin', '0')
        label.dataset.sandbagId = String(barrier.id)
        button.type = 'button'
        button.className = 'sandbag-handle'
        button.dataset.sandbag = String(barrier.id)
        this.host.append(label, button)
        visual = { mesh, label, button }
        this.sandbagVisuals.set(barrier.id, visual)
      }
      this.positionSandbag(visual.mesh, barrier, barrier.progress, barrier, barrier.hp / barrier.maxHp)
      visual.label.title = `土のう ${Math.ceil(barrier.hp)} / ${barrier.maxHp} HP`
      visual.label.setAttribute('aria-valuenow', String(barrier.hp))
      visual.label.setAttribute('aria-valuemax', String(barrier.maxHp))
      visual.label.style.setProperty('--sandbag-hp', `${100 * Math.max(0, Math.min(1, barrier.hp / barrier.maxHp))}%`)
      visual.label.dataset.health = barrier.hp / barrier.maxHp <= 0.25 ? 'low' : 'normal'
      visual.label.dataset.hp = String(barrier.hp)
      visual.label.dataset.progress = String(barrier.progress)
      visual.label.style.left = `${Math.max(30, Math.min(this.field.width - 30, barrier.x))}px`
      visual.label.style.top = `${Math.min(this.field.height - 10, barrier.y + 30)}px`
      visual.button.style.left = `${barrier.x}px`
      visual.button.style.top = `${barrier.y}px`
      visual.button.hidden = !interactive || s.phase !== 'preparation'
      visual.button.disabled = s.phase !== 'preparation'
      visual.button.setAttribute('aria-pressed', String(this.selectedSandbagId === barrier.id))
      visual.button.setAttribute('aria-label', `土のう ${Math.ceil(barrier.hp)} / ${barrier.maxHp} HP を選択`)
    }
    const preview = interactive && s.phase === 'preparation' ? this.sandbagPreview : null
    this.sandbagPreviewLabel.hidden = !preview
    if (this.sandbagGhost) this.sandbagGhost.visible = !!preview
    if (!preview) return
    this.sandbagGhost ??= this.sandbagMesh('road-sandbag-preview')
    this.sandbagGhost.visible = true
    this.sandbagGhost.material.opacity = 0.72
    this.sandbagGhost.material.color.setHex(preview.valid ? 0x82ffae : 0xff766b)
    this.positionSandbag(this.sandbagGhost, preview.point, preview.progress, preview)
    this.sandbagGhost.position.z = this.field.height / 10 + 14
    this.sandbagPreviewLabel.dataset.valid = String(preview.valid)
    this.sandbagPreviewLabel.style.left = `${Math.max(116, Math.min(this.field.width - 116, preview.point.x))}px`
    this.sandbagPreviewLabel.style.top = `${Math.min(this.field.height - 62, preview.point.y + 30)}px`
  }

  slotAt(clientX: number, clientY: number): Placement | null {
    const host = this.host.getBoundingClientRect()
    if (clientX < host.left || clientX > host.right || clientY < host.top || clientY > host.bottom) return null
    for (const slot of this.slots) {
      const bounds = slot.element.getBoundingClientRect()
      if (
        !slot.element.hidden &&
        clientX >= bounds.left &&
        clientX <= bounds.right &&
        clientY >= bounds.top &&
        clientY <= bounds.bottom
      )
        return slot.target
    }
    return null
  }
  render(
    s: Readonly<GameState>,
    dropTarget: Placement | null = null,
    interactive = true,
    selected: AllyType = 'soldier',
    roadPlacementActive = false
  ): void {
    if (this.disposed) return
    this.modelsActive = interactive
    this.frameNumber++
    const corpseIds = this.renderCorpses(s)
    this.atlasCache.beginFrame()
    if (
      (s.phase !== 'preparation' && !(s.phase === 'assault' && this.defenderPlacementPreview?.battle)) ||
      (s.phase === 'preparation' && this.defenderPlacementPreview?.battle) ||
      (this.previousState &&
        (this.previousState !== s ||
          this.previousStage !== s.stage ||
          this.fieldId !== s.fieldId ||
          this.field.version !== s.battlefieldVersion ||
          this.field.layoutRevision !== (s.layoutRevision === undefined ? 1 : s.layoutRevision)))
    ) {
      this.setSandbagPreview(null)
      this.setRoadItemPreview(null)
      this.setDefenderPlacementPreview(null)
    }
    if (!interactive || roadPlacementActive || this.sandbagPreview || this.fortifications.placementActive)
      this.setDefenderPlacementPreview(null)
    if (this.defenderPlacementPreview) selected = this.defenderPlacementPreview.type
    this.modelSelected = selected
    this.requireCurrentAtlases(s)
    if (this.previousState && this.previousState !== s) {
      this.projectileLaunches.clear()
      this.previousBaseHp = undefined
      this.baseHitAt = -Infinity
      for (const [id, visual] of this.units) this.removeUnitVisual(id, visual)
    }
    if (this.previousState && this.previousStage !== s.stage) {
      this.previousBaseHp = undefined
      this.baseHitAt = -Infinity
      for (const [id, visual] of this.units) {
        visual.lastAttackSequence =
          this.previousState !== s ? 0 : (s.units.find((unit) => unit.id === id)?.attackSequence ?? 0)
        visual.playback = new AttackPlayback()
        visual.attackAtlasUrl = undefined
        visual.lastAtlasUrl = visual.restAtlasUrl = undefined
        visual.lastFrame = undefined
      }
    }
    this.previousState = s
    this.previousStage = s.stage
    this.setField(s.fieldId, s.battlefieldVersion, s.layoutRevision)
    if (this.pendingEnvironment && s.phase === 'preparation') {
      const art = this.pendingEnvironment
      this.pendingEnvironment = undefined
      this.installEnvironment(art)
    }
    this.renderBase(s)
    this.renderSandbag(s, interactive)
    const defenders = s.units.filter((unit) => unit.owner === 'player')
    for (const slot of this.slots)
      if (!defenders.some((unit) => unit.slotId === slot.target.slotId)) {
        slot.element.remove()
        this.scene.remove(slot.marker)
        slot.marker.geometry.dispose()
        slot.marker.material.dispose()
      }
    this.slots = this.slots.filter((slot) => defenders.some((unit) => unit.slotId === slot.target.slotId))
    for (const unit of defenders) {
      let slot = this.slots.find((slot) => slot.target.slotId === unit.slotId)
      if (!slot) {
        const element = document.createElement('button')
        element.className = 'placement occupied'
        element.type = 'button'
        element.dataset.slot = String(unit.slotId)
        this.host.append(element)
        const marker = new THREE.Mesh(
          new THREE.CircleGeometry(6, 24),
          new THREE.MeshBasicMaterial({
            color: 0xffecae,
            transparent: true,
            opacity: 0.75,
            depthWrite: false,
            side: THREE.DoubleSide
          })
        )
        marker.name = `home-marker:${unit.slotId}`
        this.scene.add(marker)
        slot = { target: { slotId: unit.slotId! }, element, marker }
        this.slots.push(slot)
      }
      slot.marker.position.set(unit.homeX, unit.homeY, -7)
      slot.marker.visible = interactive
      const selectedHome = !!dropTarget && 'slotId' in dropTarget && dropTarget.slotId === unit.slotId
      slot.marker.material.opacity = selectedHome ? 1 : 0.65
      slot.marker.scale.setScalar(selectedHome ? 1.2 : 1)
      slot.element.style.left = `${unit.homeX}px`
      slot.element.style.top = `${unit.homeY}px`
      slot.element.dataset.unitId = String(unit.id)
      slot.element.classList.toggle(
        'drop-target',
        !!dropTarget && 'slotId' in dropTarget && dropTarget.slotId === unit.slotId
      )
      slot.element.hidden = !interactive
      slot.element.disabled = s.phase !== 'preparation' || roadPlacementActive
      slot.element.classList.toggle('battle-home', s.phase !== 'preparation')
      slot.element.setAttribute('aria-label', `${DEFINITIONS[unit.type].name}を変更または撤去`)
    }
    const anchor =
      dropTarget && 'slotId' in dropTarget ? defenders.find((unit) => unit.slotId === dropTarget.slotId) : undefined
    if (dropTarget && 'slotId' in dropTarget && !anchor) this.setDefenderPlacementPreview(null)
    const suppliedPreview = this.defenderPlacementPreview
    const preview = suppliedPreview
      ? suppliedPreview.placement.point
      : dropTarget && 'slotId' in dropTarget
        ? anchor
          ? { x: anchor.homeX, y: anchor.homeY }
          : fieldFor(s).slots.find((slot) => slot.id === dropTarget.slotId)
        : dropTarget
    const placement =
      suppliedPreview?.placement ?? (preview ? previewGroundPlacement(s, selected, preview, anchor?.slotId) : null)
    const definition = DEFINITIONS[selected]
    const previewVisible =
      !!preview &&
      interactive &&
      (s.phase === 'preparation' || (s.phase === 'assault' && !!suppliedPreview?.battle)) &&
      !roadPlacementActive
    this.range.visible = previewVisible
    this.movement.visible = previewVisible && s.phase === 'preparation' && definition.leash > 0
    this.previewLabel.hidden = !previewVisible
    this.placementCursor.hidden = !previewVisible
    this.placementMarker.visible = previewVisible
    this.displayedPlacementPreview =
      previewVisible && placement ? { type: selected, placement, redeploy: suppliedPreview?.redeploy } : null
    const redeploy = previewVisible ? suppliedPreview?.redeploy : undefined
    for (const edge of this.redeploymentEdges) {
      edge.visible = !!redeploy
      if (!redeploy) continue
      if (edge.scale.x !== redeploy.radius) {
        edge.geometry.dispose()
        edge.geometry = redeploymentEdgeGeometry(redeploy.radius, edge.name === 'redeployment-boundary')
      }
      edge.position.set(redeploy.anchor.x, redeploy.anchor.y, edge.name === 'redeployment-boundary' ? -9.9 : -10)
      edge.scale.set(redeploy.radius, redeploy.radius, 1)
    }
    this.redeploymentAnchor.visible = !!redeploy
    this.redeploymentLabel.hidden = !redeploy
    if (redeploy) {
      this.redeploymentAnchor.position.set(redeploy.anchor.x, redeploy.anchor.y, -9.8)
      this.redeploymentLabel.textContent =
        s.phase === 'assault' ? `↦ 1 · ${redeploy.radius}` : `再配置 · 半径 ${redeploy.radius}（起点固定）`
    }
    if (placement) {
      this.placementMarker.position.set(placement.point.x, placement.point.y, -6.9)
      this.placementMarker.material.color.setHex(placement.valid ? 0xffecae : 0xff7468)
      this.previewLabel.dataset.valid = this.placementCursor.dataset.valid = String(placement.valid)
      this.placementStatus.textContent =
        s.phase === 'assault' && placement.valid ? '✓ 移動' : groundPlacementLabel(placement)
      this.placementCursor.style.left = `${placement.point.x}px`
      this.placementCursor.style.top = `${placement.point.y}px`
    }
    this.movementLabel.hidden = s.phase === 'assault'
    for (const edge of this.movementEdges) edge.visible = this.movement.visible
    if (this.placementBody) this.placementBody.visible = false
    this.models?.setPreview(
      previewVisible ? selected : undefined,
      preview ?? undefined,
      preview ? entranceFacing(s.fieldId, preview, s.battlefieldVersion, s.layoutRevision) : undefined,
      placement?.valid ?? true
    )
    if (
      !this.models &&
      previewVisible &&
      preview &&
      (!anchor || preview.x !== anchor.homeX || preview.y !== anchor.homeY)
    ) {
      const facing = entranceFacing(s.fieldId, preview, s.battlefieldVersion, s.layoutRevision),
        direction = spriteDirection(facing)
      const atlas = this.approvedAtlas(
        this.clips[authoredClipKey({ owner: 'player', type: selected }, 'idle', direction)],
        'idle',
        direction
      )
      this.placementCursor.dataset.facing = direction
      if (!this.placementBody) {
        this.placementBody = new THREE.Mesh(
          new THREE.PlaneGeometry(96, 80),
          new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false })
        )
        this.placementBody.name = 'placement-ghost'
        this.scene.add(this.placementBody)
      }
      const body = this.placementBody,
        width = atlas?.worldSize.width ?? 96,
        height = atlas?.worldSize.height ?? 80
      if (body.geometry.parameters.width !== width || body.geometry.parameters.height !== height) {
        body.geometry.dispose()
        body.geometry = new THREE.PlaneGeometry(width, height)
      }
      body.material.map = atlas ? atlas.sample(0).texture : null
      body.material.opacity = 0.55
      body.material.color.setHex(placement?.valid ? 0xffffff : 0xff9d92)
      const scale = unitTrialScale({ owner: 'player', type: selected }, this.unitTrials)
      body.position.set(
        preview.x + (atlas?.anchorOffset.x ?? 0) * scale,
        preview.y + (atlas?.anchorOffset.y ?? -24) * scale,
        this.field.height / 10 + 9
      )
      body.scale.set(scale, -scale, 1)
      body.visible = !!atlas
    }
    if (preview) {
      this.range.position.set(preview.x, preview.y, -8)
      this.range.scale.set(definition.range, definition.range, 1)
      this.movement.position.set(preview.x, preview.y, -9)
      if (definition.leash > 0 && this.movement.scale.x !== definition.leash)
        for (const edge of this.movementEdges) {
          edge.geometry.dispose()
          edge.geometry = movementEdgeGeometry(definition.leash, edge.name === 'movement-boundary')
        }
      this.movement.scale.set(definition.leash, definition.leash, 1)
      const labelTop = preview.y + Math.max(36, definition.leash + 10)
      this.previewLabel.style.left = `${Math.max(8, Math.min(this.field.width - 248, preview.x - 120))}px`
      const labelHeight = redeploy ? 112 : 90
      this.previewLabel.style.top = `${Math.max(8, Math.min(this.field.height - labelHeight - 8, labelTop + labelHeight > this.field.height - 8 ? preview.y - 160 : labelTop))}px`
      this.movementLabel.textContent =
        definition.leash > 0 ? `移動上限 · 半径 ${definition.leash}` : '移動上限 · 0（固定）'
      this.attackLabel.textContent =
        selected === 'healer'
          ? `回復 · 半径 ${definition.range}`
          : ['soldier', 'runner', 'tank', 'paladin'].includes(selected)
            ? `近接接触 · 半径 ${definition.range}（索敵 ${definition.range + definition.leash}）`
            : `攻撃・回復 · 半径 ${definition.range}`
    }
    if (this.modelsActive) this.models?.render(s)
    const visualTime = performance.now() / 1000
    const active = new Set(s.units.map((unit) => unit.id))
    for (const [id, visual] of this.units)
      if (!active.has(id) || s.units.some((unit) => unit.id === id && unit.owner === 'ai' && unit.hp <= 0))
        this.removeUnitVisual(id, visual)
    for (const unit of s.units) {
      if (unit.owner === 'ai' && unit.hp <= 0) continue
      let visual = this.units.get(unit.id)
      const ranged = unit.attackRange >= 160
      const heavy = DEFINITIONS[unit.type].hp >= 250
      const attackEffect: CombatArt = ranged
        ? unit.owner === 'ai' || ['mage', 'healer', 'frost'].includes(unit.type)
          ? 'orb'
          : 'arrow'
        : 'slash'
      if (!visual) {
        const group = new THREE.Group()
        const shadow = new THREE.Mesh(
          new THREE.PlaneGeometry(heavy ? 42 : 34, 32),
          new THREE.MeshBasicMaterial({
            map: this.textures.get('shadow'),
            transparent: true,
            opacity: 0.28,
            depthWrite: false,
            side: THREE.DoubleSide
          })
        )
        shadow.scale.y = -1
        shadow.position.set(0, 24, -0.5)
        group.add(shadow)
        const body = new THREE.Mesh(
          new THREE.PlaneGeometry(96, 80),
          new THREE.MeshBasicMaterial({
            transparent: true,
            side: THREE.DoubleSide
          })
        )
        body.material.alphaTest = 0.01
        body.scale.y = -1
        body.onAfterRender = () => {
          body.userData.drawnFrame = this.frameNumber
        }
        group.add(body)
        const effects: PixelMesh[] = []
        for (const kind of [attackEffect, 'hit']) {
          const effect = new THREE.Mesh(
            new THREE.PlaneGeometry(32, 32),
            new THREE.MeshBasicMaterial({
              map: this.textures.get(kind),
              transparent: true,
              side: THREE.DoubleSide,
              depthWrite: false
            })
          )
          effect.scale.y = -1
          effect.position.z = 1
          effect.visible = false
          group.add(effect)
          effects.push(effect)
        }
        const coldMist = new THREE.Mesh(
          new THREE.PlaneGeometry(96, 80),
          new THREE.MeshBasicMaterial({
            map: this.textures.get('cold-mist'),
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide
          })
        )
        coldMist.name = 'frost-debuff-mist'
        coldMist.scale.y = -1
        coldMist.position.z = 1
        coldMist.visible = false
        group.add(coldMist)
        const dust = new THREE.Mesh(
          new THREE.PlaneGeometry(38, 24),
          new THREE.MeshBasicMaterial({
            map: this.textures.get('dust'),
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false
          })
        )
        dust.scale.y = -1
        dust.name = 'motion-foot-dust'
        dust.visible = false
        dust.position.set(0, 20, -0.25)
        group.add(dust)
        visual = {
          dust,
          coldMist,
          group,
          body,
          strike: effects[0],
          impact: effects[1],
          attackTimer: new AnimationTimer(ANIMATION.attack),
          hitTimer: new AnimationTimer(ANIMATION.hit),
          playback: new AttackPlayback(),
          lastAttackSequence: 0
        }
        if (unit.owner === 'player') {
          const handle = document.createElement('button')
          handle.className = 'defender-handle'
          handle.type = 'button'
          handle.dataset.unitId = String(unit.id)
          handle.dataset.slot = String(unit.slotId)
          handle.setAttribute('aria-label', `${DEFINITIONS[unit.type].name}を選択または移動`)
          Object.assign(handle.style, {
            position: 'absolute',
            padding: '0',
            minHeight: '0',
            border: '0',
            borderRadius: '0',
            background: 'transparent',
            boxShadow: 'none',
            touchAction: 'none',
            zIndex: '2'
          })
          visual.defenderHandle = handle
          this.host.append(handle)
        }
        const label = document.createElement('div')
        label.className = `unit-health ${unit.owner}${unit.boss ? ' boss' : ''}`
        label.title = DEFINITIONS[unit.type].name
        label.innerHTML =
          '<span></span><i><b></b></i>' +
          (unit.owner === 'player' ? '<em class="battle-relocation-status" hidden></em>' : '')
        this.host.append(label)
        this.healthLabels.set(unit.id, { element: label, hp: -1 })
        this.scene.add(group)
        this.units.set(unit.id, visual)
      }
      visual.group.visible = !corpseIds.has(unit.id)
      this.healthLabels.get(unit.id)!.element.hidden = corpseIds.has(unit.id)
      if (visual.defenderHandle)
        visual.defenderHandle.hidden =
          !interactive || !['preparation', 'assault'].includes(s.phase) || roadPlacementActive || unit.hp <= 0
      if (corpseIds.has(unit.id)) continue
      const slowed = unit.owner === 'ai' && unit.hp > 0 && unit.slowUntil > s.time && unit.slowFactor < 1
      visual.coldMist.visible = slowed
      visual.coldMist.material.opacity = 0.65 + Math.sin(s.time * 3 + unit.id) * 0.12
      visual.coldMist.position.y = Math.sin(s.time * 2 + unit.id) * 2
      visual.coldMist.scale.set(bodyScale(unit), -bodyScale(unit), 1)
      const authored = this.models ? undefined : this.authoredFrame(s, unit, visual, visualTime * 1000)
      if (authored && unit.hp > 0) visual.lastFrame = { atlas: authored.atlas, elapsedMs: authored.elapsedMs }
      const x = unit.x,
        y = unit.y - 24
      visual.group.position.set(x, y, y / 10)
      const health = this.healthLabels.get(unit.id)!,
        label = health.element
      const currentAttack = s.attacks.find(
        (attack) => attack.attackerId === unit.id && attack.sequence === unit.attackSequence
      )
      updateDataset(label, {
        facing: spriteDirection({ x: unit.facingX, y: unit.facingY }),
        slowed: String(slowed),
        unitId: String(unit.id),
        owner: unit.owner,
        unitType: unit.type,
        worldX: String(unit.x),
        worldY: String(unit.y),
        progress: String(unit.progress),
        homeX: String(unit.homeX),
        homeY: String(unit.homeY),
        attackRange: String(unit.attackRange),
        attackTargetId: String(currentAttack?.targetId ?? ''),
        attackSequence: String(unit.attackSequence),
        motion:
          unit.hp <= 0
            ? 'down'
            : currentAttack && s.time + 1e-9 < currentAttack.endsAt
              ? 'attack'
              : unit.moving
                ? 'walk'
                : 'idle'
      })
      const relocationBadge = label.querySelector<HTMLElement>('.battle-relocation-status')
      if (relocationBadge) {
        const remaining =
            unit.hp > 0 && unit.battleRelocation?.usedStage !== s.stage && DEFINITIONS[unit.type].leash > 0 ? 1 : 0,
          relocating = !!unit.battleRelocation?.destination
        relocationBadge.hidden = s.phase !== 'assault' || unit.hp <= 0
        const text = relocating ? '↝' : `↦ ${remaining}`
        if (relocationBadge.textContent !== text) relocationBadge.textContent = text
        const title = relocating ? '移動中' : `戦闘移動 残り${remaining}回`
        if (relocationBadge.title !== title) relocationBadge.title = title
        updateDataset(label, { relocation: relocating ? 'moving' : remaining ? 'ready' : 'used' })
        if (visual.defenderHandle)
          visual.defenderHandle.setAttribute(
            'aria-label',
            s.phase === 'assault'
              ? `${DEFINITIONS[unit.type].name} · ${relocationBadge.title}`
              : `${DEFINITIONS[unit.type].name}を選択または移動`
          )
      }
      label.style.left = `${x}px`
      label.style.top = `${Math.max(18, unit.y - (authored ? 82 * bodyScale(unit) : 58))}px`
      if (health.hp !== unit.hp) {
        health.hp = unit.hp
        label.querySelector('span')!.textContent =
          `${unit.boss ? '★ ' : ''}${Math.ceil(unit.hp)}/${Math.ceil(unit.maxHp)}`
        label.querySelector('b')!.style.width = `${100 * Math.max(0, unit.hp / unit.maxHp)}%`
        label.style.setProperty(
          '--health',
          unit.hp / unit.maxHp > 0.5 ? '#b8e79b' : unit.hp / unit.maxHp > 0.25 ? '#edcf72' : '#f58b73'
        )
      }
      const attackAnimation = visual.attackTimer.sample(unit.attackAnimation, visualTime),
        hitAnimation = visual.hitTimer.sample(unit.hitAnimation, visualTime)
      const { body, strike, impact } = visual
      updateDataset(label, {
        artSource: authored ? 'authored' : 'unavailable',
        renderedMotion: authored ? authored.atlas.manifest.motion : 'unavailable',
        renderedElapsedMs: String(authored?.elapsedMs ?? 0),
        actionKind:
          s.attacks.find((action) => action.attackerId === unit.id && action.sequence === unit.attackSequence)?.kind ??
          '',
        healingAnimation:
          healingAction(unit) && unit.type === 'paladin'
            ? authored?.atlas.manifest.attackVariant === 'heal'
              ? 'dedicated-heal'
              : 'neutral-whole-body-fallback'
            : ''
      })
      body.visible = !!authored
      body.material.map = authored ? authored.atlas.sample(authored.elapsedMs).texture : null
      const dx = unit.attackTargetX - unit.x,
        dy = unit.attackTargetY - unit.y
      const length = Math.hypot(dx, dy) || 1,
        directionX = dx / length,
        directionY = dy / length
      const facing = Math.sign(unit.facingX) || 1
      const attackProgress = 1 - attackAnimation / ANIMATION.attack,
        hitProgress = 1 - hitAnimation / ANIMATION.hit
      const attack = attackPose(attackProgress),
        hit = hitPose(hitProgress)
      const reach = ranged ? -2 : heavy ? 4 : 7
      const displacement = attack.contact * reach - attack.anticipation * 2 - hit.recoil * 3
      body.position.set(directionX * displacement, directionY * displacement, 0)
      body.rotation.z = facing * (attack.anticipation * 0.025 - attack.contact * 0.035 + hit.recoil * 0.045)
      const bossScale = bodyScale(unit) * unitTrialScale(unit, this.unitTrials)
      body.scale.set(
        (1 + attack.anticipation * 0.025 - hit.recoil * 0.025) * bossScale,
        -(1 - attack.anticipation * 0.025 + attack.contact * 0.02) * bossScale,
        1
      )
      body.material.color.setRGB(1, 1 - hit.flash * 0.28, 1 - hit.flash * 0.32)
      body.material.opacity = unit.hp > 0 ? 1 : 0.35
      label.classList.toggle('hit', hitAnimation > 0)
      strike.material.map = this.textures.get(attackEffect)!
      if (ranged) {
        const startX = facing * 18,
          startY = 8,
          travelX = dx - startX,
          travelY = dy - startY
        const arcRadius = Math.min(15, Math.hypot(travelX, travelY) * 0.08),
          arc = Math.sin(attack.flight * Math.PI) * arcRadius
        const arriving = attack.impact > 0
        strike.visible = attackAnimation > 0 && attackProgress >= 0.34
        strike.position.set(
          startX + travelX * attack.flight,
          startY + travelY * attack.flight - arc,
          (travelY * attack.flight) / 10 + 3
        )
        strike.rotation.z = arriving
          ? attack.impact * 0.3
          : Math.atan2(travelY - Math.cos(attack.flight * Math.PI) * Math.PI * arcRadius, travelX)
        const scale = arriving ? 0.45 + attack.impact * 0.75 : unit.owner === 'ai' ? 0.7 : 0.85
        strike.scale.set(scale, -scale, 1)
        strike.material.opacity = arriving ? 1 - attack.impact : 1
        if (arriving) strike.material.map = this.textures.get('hit')!
      } else {
        strike.visible = attackAnimation > 0 && attack.slash > 0 && attack.slash < 1
        strike.position.set(directionX * (18 + attack.contact * 8), directionY * (18 + attack.contact * 8), 2)
        strike.rotation.z = Math.atan2(directionY, directionX) - 0.85 + attack.slash * 1.6
        const scale = (heavy ? 1.25 : 1) * (0.75 + attack.slash * 0.4)
        strike.scale.set(scale, -scale, 1)
        strike.material.opacity = Math.min(1, attack.slash * 8) * (1 - attack.slash) ** 0.5
      }
      impact.visible = hitAnimation > 0
      impact.material.opacity = hit.burst
      const impactScale = 0.4 + (1 - (1 - hitProgress) ** 3) * 0.65
      impact.scale.set(impactScale, -impactScale, 1)
      impact.position.set(0, -3 - hitProgress * 3, 3)
      impact.rotation.z = hitProgress * 0.18
      visual.dust.visible = false
      let motionTrail = 0
      if (authored) {
        const { atlas } = authored
        if (
          body.geometry.parameters.width !== atlas.worldSize.width ||
          body.geometry.parameters.height !== atlas.worldSize.height
        ) {
          body.geometry.dispose()
          body.geometry = new THREE.PlaneGeometry(atlas.worldSize.width, atlas.worldSize.height)
        }
        body.position.set(atlas.anchorOffset.x * bossScale, 24 + atlas.anchorOffset.y * bossScale, 0)
        body.rotation.z = 0
        body.scale.set(bossScale, -bossScale, 1)
        if (unit.hp > 0 && unitTrialFor(unit, this.unitTrials)) {
          const pose = expressiveMotion({
            type: unit.type,
            motion: atlas.manifest.motion,
            elapsedMs: authored.elapsedMs,
            durationMs: atlas.manifest.durationMs,
            cueMs: atlas.manifest.events?.find((event) => event.type === 'hit' || event.type === 'release')?.atMs
          })
          const directionLength = Math.hypot(unit.facingX, unit.facingY) || 1,
            facingX = unit.facingX / directionLength,
            facingY = unit.facingY / directionLength
          const angle = pose.lean * (Math.sign(unit.facingX) || 1),
            anchorX = atlas.anchorOffset.x * bossScale * pose.scaleX,
            anchorY = atlas.anchorOffset.y * bossScale * pose.scaleY
          body.position.set(
            Math.cos(angle) * anchorX -
              Math.sin(angle) * anchorY +
              (facingX * pose.forward - facingY * pose.sway) * bossScale,
            24 +
              Math.sin(angle) * anchorX +
              Math.cos(angle) * anchorY +
              (facingY * pose.forward + facingX * pose.sway - pose.lift) * bossScale,
            0
          )
          body.rotation.z = angle
          body.scale.set(bossScale * pose.scaleX, -bossScale * pose.scaleY, 1)
          visual.dust.visible = pose.dust > 0.01 && body.visible
          visual.dust.material.opacity = pose.dust
          visual.dust.scale.set(bossScale * (1 + pose.dust), -bossScale, 1)
          motionTrail = pose.trail
          label.dataset.expressiveMotion = atlas.manifest.motion
          label.dataset.motionOffset = `${pose.forward},${pose.lift},${pose.sway}`
        } else {
          label.dataset.expressiveMotion = ''
          label.dataset.motionOffset = '0,0,0'
        }
      }
      if (visual.defenderHandle) {
        const width = Math.min(72, body.geometry.parameters.width * Math.abs(body.scale.x)),
          height = Math.min(88, body.geometry.parameters.height * Math.abs(body.scale.y))
        visual.defenderHandle.style.left = `${visual.group.position.x + body.position.x - width / 2}px`
        visual.defenderHandle.style.top = `${visual.group.position.y + body.position.y - height / 2}px`
        visual.defenderHandle.style.width = `${width}px`
        visual.defenderHandle.style.height = `${height}px`
        visual.defenderHandle.hidden ||= !body.visible
      }
      if (ATTACK_PROFILES[unit.type] && s.attacks.some((attack) => attack.attackerId === unit.id))
        strike.visible = false
      if (
        motionTrail > 0.01 &&
        currentAttack?.kind === 'attack' &&
        !currentAttack.projectile &&
        !currentAttack.base &&
        unit.hp > 0
      ) {
        strike.visible = true
        strike.material.map = this.textures.get(
          unit.type === 'runner' ? 'arrow' : ['ogre', 'brute', 'beetle'].includes(unit.type) ? 'hit' : 'slash'
        )!
        strike.material.opacity = motionTrail
        strike.position.set(directionX * 24, directionY * 24, 2)
        strike.scale.set(bossScale * (unit.type === 'paladin' ? 1.5 : 1.15), -bossScale, 1)
      }
      if (this.models) {
        body.visible = false
        const visible = this.models.visible(unit.id)
        updateDataset(label, {
          artSource: visible ? 'gltf-mesh' : 'loading',
          renderedMotion: this.models.motion(unit.id) ?? '',
          healingAnimation: unit.type === 'paladin' && currentAttack?.kind === 'heal' ? 'neutral-held-3d-pose' : ''
        })
        label.style.top = `${Math.max(18, unit.y - 76 * bodyScale(unit))}px`
        if (visual.defenderHandle) {
          visual.defenderHandle.hidden =
            !visible ||
            !interactive ||
            !['preparation', 'assault'].includes(s.phase) ||
            roadPlacementActive ||
            unit.hp <= 0
          visual.defenderHandle.style.left = `${unit.x - 36}px`
          visual.defenderHandle.style.top = `${unit.y - 72}px`
          visual.defenderHandle.style.width = '72px'
          visual.defenderHandle.style.height = '80px'
        }
      }
    }
    this.fortifications.render(
      s,
      interactive,
      new Set(
        [...this.units]
          .filter(
            ([id, visual]) => visual.group.visible && (this.models ? this.models.visible(id) : visual.body.visible)
          )
          .map(([id]) => id)
      )
    )
    this.heavyImpacts.render(s)
    this.dragonSplashes.render(s)
    this.renderAttackEffects(s)
    if (interactive) this.commander?.render(s, this.commanderMode)
    this.commanderSupport.render(s, this.commanderMode)
    this.prepareEntryArt(s, selected)
    this.atlasCache.endFrame()
    // Title/launch dialogs cover the battlefield. Do not upload textures or compile
    // its shaders before the player starts; this also keeps cold startup responsive.
    if (interactive) {
      const drawStarted = performance.now()
      this.renderer.render(this.scene, this.camera)
      const elapsed = performance.now() - drawStarted
      if (!this.drawTiming.frames) this.drawTiming.firstMs = elapsed
      this.drawTiming.frames++
      this.drawTiming.lastMs = elapsed
      this.drawTiming.maxMs = Math.max(this.drawTiming.maxMs, elapsed)
    }
    this.lastRenderedSimulationTime = s.time
  }
}

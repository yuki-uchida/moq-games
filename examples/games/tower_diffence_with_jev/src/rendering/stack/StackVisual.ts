import * as THREE from 'three'
import { MODEL_BOSS_SCALE, modelGroundDepth } from '../BoardCamera'
import type { StackDesign, StackMotion } from './StackDesign'
import { fallPose } from './StackDesign'
import { STACK_SPACING, STACK_SQUASH } from './SliceSheet'
import { buildStackFrameAtlas, buildStackModel, type StackFrameAtlas, type StackModel } from './StackModel'
import { createStackMaterial, createStackShadowMaterial, partPoint, type StackPose } from './StackRig'

/** Equivalent elevation angle matching `sin(e) = STACK_SQUASH = 0.75` (~48.6°). */
export const STACK_ELEVATION = Math.asin(STACK_SQUASH)
/** Whole stacks sort by ground `pos.y`; no slice-by-slice depth competition across objects. */
export const STACK_DEPTH_SCALE = 0.006

const models = new Map<StackDesign, StackModel>()
const atlases = new Map<StackDesign, StackFrameAtlas>()

/** Built once per design for the lifetime of the page; geometry and slice-sheet atlas are tiny. */
export function stackModel(design: StackDesign): StackModel {
  let model = models.get(design)
  if (!model) {
    model = buildStackModel(design.blueprint)
    model.softShade = design.softShade === true
    model.simpleShadow = design.simpleShadow === true
    models.set(design, model)
  }
  return model
}

/** Multi-frame SpriteCook slice-sheet atlas for a design, built lazily once per page. */
export function stackFrameAtlas(design: StackDesign): StackFrameAtlas {
  let atlas = atlases.get(design)
  if (!atlas) {
    atlas = buildStackFrameAtlas(design, stackModel(design))
    atlases.set(design, atlas)
  }
  return atlas
}

/**
 * Board matrix projecting voxel cells `(x, y, z)` to board space using SpriteCook's exact
 * `turn`, `squash = 0.75`, and `spacing = 1.0` rules (used for emitter points and tests).
 *
 * Notice the sign convention:
 * - `yaw` is the heading angle in radians (`0` = facing `+y` down on screen, `-PI/2` = right, `+PI/2` = left).
 * - Voxel `+z` (forward) maps to slice `+y` (down).
 * - Voxel `+y` (height) lifts UP (`-y` on screen) by `spacing`.
 */
export function stackBoardMatrix(
  out: THREE.Matrix4,
  x: number,
  y: number,
  yaw: number,
  cell: number,
  presentation = 1,
  aspect = 1,
  depthBias = 0,
  squash = STACK_SQUASH,
  spacing = STACK_SPACING
): THREE.Matrix4 {
  const ct = Math.cos(yaw),
    st = Math.sin(yaw),
    k = cell * presentation,
    d = STACK_DEPTH_SCALE
  // Forward slice mapping:
  //   screenX = (lx * ct - lz * st) * k / aspect + x
  //   screenY = (lx * st + lz * ct) * squash * k - ly * spacing * k + y
  //   depthZ  = modelGroundDepth(y) + depthBias (+ tiny intra-figure order)
  // prettier-ignore
  return out.set(
    (k * ct) / aspect, 0, (-k * st) / aspect, x,
    k * st * squash, -k * spacing, k * ct * squash, y,
    d * k * st, d * k, d * k * ct, modelGroundDepth(y) + depthBias,
    0, 0, 0, 1
  )
}

export interface StackSample {
  readonly motion: StackMotion
  readonly seconds: number
  readonly cycle?: number
  readonly time?: number
  readonly loop?: boolean
  readonly facingX: number
  readonly facingY: number
  readonly boss: boolean
  readonly durationMs?: number
  readonly cueMs?: number
}

const quadGeometry = new THREE.PlaneGeometry(1, 1)

/** Compute integer art-pixel quad envelope covering any 360° turn, squash, fall, outline, and shadow. */
function artBoundsFor(atlas: StackFrameAtlas): THREE.Vector4 {
  const halfDiag = Math.ceil(Math.hypot(atlas.sliceWidth, atlas.sliceHeight) / 2) + 3
  const topLift = Math.ceil((atlas.baseLift + Math.max(0, atlas.sliceCount - 1)) * STACK_SPACING) + 3
  const maxSpan = Math.max(halfDiag, topLift) + 3
  return new THREE.Vector4(-maxSpan, -maxSpan, maxSpan * 2, maxSpan * 2)
}

/**
 * One SpriteCook sprite-stacked figure:
 * - Single opaque body quad running the exact top-down slice loop + crisp 1-art-px silhouette outline.
 * - Single ground shadow quad sampling the rotated, squashed union footprint at a crisp pixel offset.
 * - Whole-pixel snapping and ground-Y depth sorting (`modelGroundDepth(y)`).
 */
export class StackVisual {
  readonly root = new THREE.Group()
  readonly model: StackModel
  readonly atlas: StackFrameAtlas
  private readonly mesh: THREE.Mesh
  private readonly shadow: THREE.Mesh
  private readonly material: ReturnType<typeof createStackMaterial>
  private readonly shadowMaterial: ReturnType<typeof createStackShadowMaterial>
  private readonly artBounds: THREE.Vector4
  private x = -10000
  private y = -10000
  private turn = 0
  private squash = STACK_SQUASH
  private spacing = STACK_SPACING
  private viewOverride?: { turn: number; squash: number }
  private boss = false
  private fall = 0
  private presentation = 1
  private aspect = 1
  private frame = 0
  readonly seed: number
  motion?: StackMotion
  seconds = 0
  lastPose: StackPose = {}

  constructor(
    readonly design: StackDesign,
    seed = Math.random()
  ) {
    this.seed = seed
    this.model = stackModel(design)
    this.atlas = stackFrameAtlas(design)
    this.artBounds = artBoundsFor(this.atlas)
    this.material = createStackMaterial(this.atlas, this.artBounds)
    this.shadowMaterial = createStackShadowMaterial(this.atlas, this.artBounds)

    this.mesh = new THREE.Mesh(quadGeometry, this.material)
    this.mesh.matrixAutoUpdate = false
    this.mesh.frustumCulled = false
    this.mesh.name = `stack:${design.type}`

    this.shadow = new THREE.Mesh(quadGeometry, this.shadowMaterial)
    this.shadow.matrixAutoUpdate = false
    this.shadow.frustumCulled = false
    this.shadow.renderOrder = -1
    this.shadow.name = `stack-shadow:${design.type}`

    this.root.add(this.shadow, this.mesh)
    this.root.name = 'stack-unit'
    this.root.visible = false
  }

  setPresentation(scale: number, aspect: number): void {
    this.presentation = scale
    this.aspect = aspect
    this.updateMatrices()
  }

  setPosition(x: number, y: number): void {
    this.x = x
    this.y = y
    this.updateMatrices()
  }

  setShadowVisible(visible: boolean): void {
    this.shadow.visible = visible
  }

  /** World-space height of the sprite's visible top edge above the unit's feet. */
  headroom(): number {
    // Projected top of the current frame and turn. The nameplate keeps a constant screen gap in
    // GameRenderer, so no art-pixel padding is baked in here (that varied with each cell size).
    const tops = this.atlas.frameTops[this.frame]
    if (tops) {
      const buckets = tops.length
      const bucket = ((Math.round((this.turn / (Math.PI * 2)) * buckets) % buckets) + buckets) % buckets
      return Math.max(0, tops[bucket]) * this.cell() * this.presentation
    }
    const height = this.atlas.frameHeights[this.frame] ?? this.atlas.sliceHeight * 0.5
    return Math.max(0, height) * this.cell() * this.presentation
  }

  /** Optional interactive camera override (used by EXTRA viewer to orbit turn & squash). */
  setViewOverride(turn?: number, squash?: number): void {
    if (turn === undefined || squash === undefined) {
      this.viewOverride = undefined
    } else {
      this.viewOverride = { turn, squash: Math.max(0.35, Math.min(1.0, squash)) }
    }
    this.updateUniforms()
  }

  /**
   * SpriteCook turn angle in radians:
   * In the slice sheet, the object faces DOWN (`+y`). Turning by `atan2(dy / squash, dx) - PI / 2`
   * points the character's visual front (`+z`) strictly along `(facingX, facingY)` on screen.
   */
  headingYaw(facingX: number, facingY: number): number {
    if (!facingX && !facingY) return this.turn
    return Math.atan2(facingY / this.squash, facingX * this.aspect) - Math.PI / 2
  }

  /** Stride cycles per world unit relative to 1 / walkDistance, so planted feet keep pace on screen. */
  walkRate(facingX: number, facingY: number, boss: boolean): number {
    const turn = this.headingYaw(facingX, facingY)
    const body = Math.hypot(facingX * this.aspect, facingY) / (Math.hypot(facingX, facingY) || 1)
    const foot =
      this.presentation *
      (boss ? MODEL_BOSS_SCALE : 1) *
      Math.hypot(Math.sin(turn), this.squash * Math.cos(turn))
    return Math.max(0.6, Math.min(1.35, body / foot))
  }

  private cell(): number {
    return this.design.voxel * (this.boss ? MODEL_BOSS_SCALE : 1)
  }

  private updateUniforms(): void {
    const turn = this.viewOverride ? this.viewOverride.turn : this.turn
    const squash = this.viewOverride ? this.viewOverride.squash : this.squash
    this.material.uniforms.uTurn.value = turn
    this.material.uniforms.uSquash.value = squash
    this.material.uniforms.uSpacing.value = this.spacing
    this.material.uniforms.uFall.value = this.fall

    // Flying sprites use a screen-aligned ellipse so the shadow never rotates beside the body.
    this.shadowMaterial.uniforms.uTurn.value = this.model.simpleShadow ? 0 : turn
    this.shadowMaterial.uniforms.uSquash.value = this.model.simpleShadow ? 1 : squash
  }

  private updateMatrices(): void {
    const artPxY = this.cell() * this.presentation
    const artPxX = artPxY / this.aspect
    // Keep every stack snapped to whole art pixels to prevent sub-pixel shimmer (SpriteCook Pitfall #6).
    const snapX = Math.round(this.x / artPxX) * artPxX
    const snapY = Math.round(this.y / artPxY) * artPxY
    const quadW = this.artBounds.z * artPxX
    const quadH = this.artBounds.w * artPxY
    const centerOffsetX = (this.artBounds.x + this.artBounds.z * 0.5) * artPxX
    const centerOffsetY = (this.artBounds.y + this.artBounds.w * 0.5) * artPxY

    this.mesh.matrix
      .makeScale(quadW, quadH, 1)
      .setPosition(snapX + centerOffsetX, snapY + centerOffsetY, modelGroundDepth(this.y))
    this.mesh.matrixWorldNeedsUpdate = true

    // Crisp stepped pixel-art shadow lies flat above the ground (-20) and below all stacked bodies (>= 4).
    this.shadow.matrix
      .makeScale(quadW, quadH, 1)
      .setPosition(snapX + centerOffsetX, snapY + centerOffsetY, -17)
    this.shadow.matrixWorldNeedsUpdate = true
  }

  private frameIndexFor(sample: StackSample): number {
    const band = this.atlas.bands[sample.motion] ?? this.atlas.bands.idle
    if (band.frames <= 1) return band.offset
    if (sample.motion === 'idle') {
      const phase = (((sample.time ?? sample.seconds) / 1.5 + this.seed) % 1 + 1) % 1
      return band.offset + Math.min(band.frames - 1, Math.floor(phase * band.frames))
    }
    if (sample.motion === 'walk') {
      const cycle = sample.cycle ?? sample.seconds * 1.6
      const phase = ((cycle % 1) + 1) % 1
      return band.offset + Math.min(band.frames - 1, Math.floor(phase * band.frames))
    }
    if (sample.motion === 'special') {
      const frac = Math.max(0, Math.min(0.999, sample.seconds / 1.3))
      return band.offset + Math.min(band.frames - 1, Math.floor(frac * band.frames))
    }
    // Attack / heal / breath: align frame 2 with cueMs so weapon impact matches simulation cue exactly.
    const ms = sample.seconds * 1000
    const cue = sample.cueMs ?? 450
    const end = sample.durationMs ?? 900
    const frac =
      ms <= cue
        ? 0.5 * Math.max(0, Math.min(1, ms / Math.max(1, cue)))
        : 0.5 + 0.5 * Math.max(0, Math.min(1, (ms - cue) / Math.max(1, end - cue)))
    return band.offset + Math.min(band.frames - 1, Math.floor(frac * band.frames))
  }

  sample(sample: StackSample): boolean {
    this.boss = sample.boss
    this.turn = this.headingYaw(sample.facingX, sample.facingY)
    this.fall = 0
    this.motion = sample.motion
    this.seconds = sample.seconds
    const pose = this.design.pose({
      motion: sample.motion,
      seconds: sample.seconds,
      cycle: sample.cycle ?? sample.seconds * 1.6,
      time: sample.time ?? sample.seconds,
      durationMs: sample.durationMs ?? 900,
      cueMs: sample.cueMs ?? 450,
      seed: this.seed
    })
    this.lastPose = pose
    const frame = this.frameIndexFor(sample)
    this.frame = frame
    this.material.uniforms.uFrame.value = frame
    this.shadowMaterial.uniforms.uFrame.value = frame
    this.updateUniforms()
    this.updateMatrices()
    this.root.visible = true
    return true
  }

  /** Allies fall sideways and keep their last pose. */
  sampleFall(seconds: number): void {
    this.motion = 'death'
    this.seconds = Math.min(seconds, 0.82)
    const { rz } = fallPose(seconds)
    this.fall = rz
    this.updateUniforms()
    this.updateMatrices()
  }

  setAppearance(opacity = 1, tint = 0xffffff, flash = 0): void {
    this.material.uniforms.uOpacity.value = opacity
    this.material.uniforms.uTint.value.setHex(tint)
    this.material.uniforms.uFlash.value = flash
    this.shadowMaterial.uniforms.uOpacity.value = Math.min(1, opacity)
  }

  /** Board point of the design's emitter in the last sampled pose. */
  emitterPoint(pose: StackPose = this.lastPose): THREE.Vector3 | undefined {
    const emitter = this.design.emitter
    if (!emitter) return undefined
    const local = partPoint(this.model, pose, emitter.part, emitter.at)
    const m = stackBoardMatrix(
      new THREE.Matrix4(),
      this.x,
      this.y,
      this.turn,
      this.cell(),
      this.presentation,
      this.aspect,
      0,
      this.squash,
      this.spacing
    )
    return local.applyMatrix4(m)
  }

  diagnostics() {
    return {
      renderer: 'sprite-stack',
      design: this.design.type,
      motion: this.motion ?? null,
      seconds: this.seconds,
      visible: this.root.visible,
      opacity: this.material.uniforms.uOpacity.value,
      slices: this.atlas.sliceCount,
      parts: this.model.parts.length
    }
  }

  dispose(): void {
    this.root.removeFromParent()
    this.material.dispose()
    this.shadowMaterial.dispose()
  }
}

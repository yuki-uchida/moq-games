import * as THREE from 'three'
import { MODEL_BOSS_SCALE, modelGroundDepth } from '../BoardCamera'
import type { StackDesign, StackMotion } from './StackDesign'
import { fallPose } from './StackDesign'
import type { StackModel } from './StackModel'
import { buildStackModel } from './StackModel'
import { createStackMaterial, partPoint, poseMatrices, type StackPose } from './StackRig'

/** Camera elevation above the horizon used by every stacked figure and prop. */
export const STACK_ELEVATION = 0.7
/**
 * Ortho depth only orders fragments. A figure's own depth is compressed into a thin band
 * so a figure lower on the board always draws over one behind it, while each figure still
 * depth-sorts its own slices exactly.
 */
export const STACK_DEPTH_SCALE = 0.006

const models = new Map<StackDesign, StackModel>()
/** Built once per design for the lifetime of the page; geometry and atlas are tiny. */
export function stackModel(design: StackDesign): StackModel {
  let model = models.get(design)
  if (!model) {
    model = buildStackModel(design.blueprint)
    models.set(design, model)
  }
  return model
}

/** Board matrix for a point on the ground, facing yaw, before the figure's own cell scale. */
export function stackBoardMatrix(
  out: THREE.Matrix4,
  x: number,
  y: number,
  yaw: number,
  cell: number,
  presentation = 1,
  aspect = 1,
  depthBias = 0
): THREE.Matrix4 {
  const c = Math.cos(STACK_ELEVATION),
    s = Math.sin(STACK_ELEVATION),
    cy = Math.cos(yaw),
    sy = Math.sin(yaw),
    k = cell * presentation,
    d = STACK_DEPTH_SCALE
  // Board(x right, y down, z toward camera) * RotY(yaw) * Scale(k), with a per-axis widening undo.
  // prettier-ignore
  return out.set(
    (k * cy) / aspect, 0, (k * sy) / aspect, x,
    -s * sy * k, -c * k, s * cy * k, y,
    d * c * -sy * k, d * s * k, d * c * cy * k, modelGroundDepth(y) + depthBias,
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

let shadowTexture: THREE.DataTexture | undefined
function contactShadow(): THREE.DataTexture {
  if (shadowTexture) return shadowTexture
  const size = 32
  const pixels = new Uint8Array(size * size * 4)
  for (let row = 0; row < size; row++)
    for (let column = 0; column < size; column++) {
      const distance = Math.hypot(((column + 0.5) / size) * 2 - 1, ((row + 0.5) / size) * 2 - 1)
      const i = (row * size + column) * 4
      pixels[i] = 0x15
      pixels[i + 1] = 0x22
      pixels[i + 2] = 0x1c
      pixels[i + 3] = Math.round(150 * Math.max(0, 1 - distance ** 2) ** 1.6)
    }
  shadowTexture = new THREE.DataTexture(pixels, size, size)
  shadowTexture.magFilter = shadowTexture.minFilter = THREE.LinearFilter
  shadowTexture.needsUpdate = true
  return shadowTexture
}
const shadowGeometry = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2)

const fallMatrix = new THREE.Matrix4()
const scratch = new THREE.Matrix4()

/** One sprite-stacked figure: a single draw call whose parts move through shader matrices. */
export class StackVisual {
  readonly root = new THREE.Group()
  readonly model: StackModel
  private readonly mesh: THREE.Mesh
  private readonly material: ReturnType<typeof createStackMaterial>
  private readonly shadow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  private x = -10000
  private y = -10000
  private yaw = 0
  private boss = false
  private fall = 0
  private fallLift = 0
  private presentation = 1
  private aspect = 1
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
    this.material = createStackMaterial(this.model)
    this.mesh = new THREE.Mesh(this.model.geometry, this.material)
    this.mesh.matrixAutoUpdate = false
    this.mesh.frustumCulled = false
    this.mesh.name = `stack:${design.type}`
    this.shadow = new THREE.Mesh(
      shadowGeometry,
      new THREE.MeshBasicMaterial({ map: contactShadow(), transparent: true, depthWrite: false, toneMapped: false })
    )
    this.shadow.matrixAutoUpdate = false
    this.shadow.frustumCulled = false
    this.shadow.renderOrder = -1
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
  /** The board is widened horizontally; turn so the figure's front points along the game aim on screen. */
  headingYaw(facingX: number, facingY: number): number {
    if (!facingX && !facingY) return this.yaw
    return Math.atan2(facingX * this.aspect * Math.sin(STACK_ELEVATION), facingY)
  }
  /** Stride cycles per world unit relative to 1 / walkDistance, so planted feet keep pace on screen. */
  walkRate(facingX: number, facingY: number, boss: boolean): number {
    const yaw = this.headingYaw(facingX, facingY)
    const body = Math.hypot(facingX * this.aspect, facingY) / (Math.hypot(facingX, facingY) || 1)
    const foot =
      this.presentation *
      (boss ? MODEL_BOSS_SCALE : 1) *
      Math.hypot(Math.sin(yaw), Math.sin(STACK_ELEVATION) * Math.cos(yaw))
    return Math.max(0.6, Math.min(1.35, body / foot))
  }
  private cell(): number {
    return this.design.voxel * (this.boss ? MODEL_BOSS_SCALE : 1)
  }
  private updateMatrices(): void {
    const matrix = stackBoardMatrix(
      this.mesh.matrix,
      this.x,
      this.y,
      this.yaw,
      this.cell(),
      this.presentation,
      this.aspect
    )
    if (this.fall) {
      fallMatrix.makeRotationZ(this.fall).setPosition(0, this.fallLift, 0)
      matrix.multiply(fallMatrix)
    }
    this.mesh.matrixWorldNeedsUpdate = true
    const [rx, rz] = this.design.shadow
    stackBoardMatrix(this.shadow.matrix, this.x, this.y, this.yaw, this.cell(), this.presentation, this.aspect, -0.05)
    this.shadow.matrix.multiply(scratch.makeScale(rx, 1, rz).setPosition(0, 0.05, 0))
    this.shadow.matrixWorldNeedsUpdate = true
  }
  sample(sample: StackSample): boolean {
    this.boss = sample.boss
    this.yaw = this.headingYaw(sample.facingX, sample.facingY)
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
    poseMatrices(this.model, pose, this.material.uniforms.uParts.value)
    this.updateMatrices()
    this.root.visible = true
    return true
  }
  /** Allies fall sideways and keep their last pose. */
  sampleFall(seconds: number): void {
    this.motion = 'death'
    this.seconds = Math.min(seconds, 0.82)
    const { rz, y } = fallPose(seconds)
    this.fall = rz
    this.fallLift = y
    this.updateMatrices()
  }
  setAppearance(opacity = 1, tint = 0xffffff, flash = 0): void {
    this.material.uniforms.uOpacity.value = opacity
    this.material.uniforms.uTint.value.setHex(tint)
    this.material.uniforms.uFlash.value = flash
    this.shadow.material.opacity = Math.min(1, opacity * 1.2)
  }
  /** Board point of the design's emitter in the last sampled pose. */
  emitterPoint(pose: StackPose = this.lastPose): THREE.Vector3 | undefined {
    const emitter = this.design.emitter
    if (!emitter) return undefined
    const local = partPoint(this.model, pose, emitter.part, emitter.at)
    return local.applyMatrix4(this.mesh.matrix)
  }
  /** Height of the figure's top on screen in board units (for HUD placement). */
  diagnostics() {
    return {
      renderer: 'sprite-stack',
      design: this.design.type,
      motion: this.motion ?? null,
      seconds: this.seconds,
      visible: this.root.visible,
      opacity: this.material.uniforms.uOpacity.value,
      slices: this.model.sliceCount,
      parts: this.model.parts.length
    }
  }
  dispose(): void {
    this.root.removeFromParent()
    this.material.dispose()
    this.shadow.material.dispose()
  }
}

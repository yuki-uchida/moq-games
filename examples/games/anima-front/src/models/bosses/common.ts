/**
 * Shared pieces of the two bosses: the baked asset, a builder that turns baked parts into meshes (one toon foe
 * material per part and uniform set, single-draw outline hulls with a shadow pass that skips them), and small
 * allocation-free animation helpers (exponential smoothing, hit flash, eased curves, two-bone IK).
 */
import * as THREE from 'three'
import type { Quality } from '../api'
import type { BakedPart, PartRecipe } from '../foes/bake'
import { createFoeMaterial, createFoeUniforms, type FoeLook, type FoeUniforms } from '../foes/material'
import { hullDepthMaterial } from '../hull'
import { regionsOf } from '../materials'

export type BossKind = 'kuitsukushi' | 'goutetsu'

/** A part recipe plus how many meshes draw it (shared geometry: petals, tentacle segments, legs). */
export interface BossPartRecipe extends PartRecipe {
  uses: number
}

export interface BossAsset {
  kind: BossKind
  quality: Quality
  /** Baked parts by name. */
  parts: Record<string, BakedPart>
  /** Triangles drawn by one boss (every mesh, without outline hulls) and generation time. */
  triangles: number
  /** Meshes of one boss (draw calls). */
  meshes: number
  ms: number
}

/** Fraction of the way to a target after `dt` at `rate` (1/s): x += (target − x) · approach(dt, rate). */
export const approach = (dt: number, rate: number) => 1 - Math.exp(-rate * dt)

/** Moves `x` towards `target` with exponential smoothing. */
export const toward = (x: number, target: number, dt: number, rate: number) => x + (target - x) * approach(dt, rate)

export const ease = (t: number) => {
  const x = Math.min(1, Math.max(0, t))
  return x * x * (3 - 2 * x)
}
export const easeOut = (t: number) => {
  const x = Math.min(1, Math.max(0, t))
  return 1 - (1 - x) * (1 - x) * (1 - x)
}
/** Ease out with a small overshoot (bursts, unfolds). */
export const easeOutBack = (t: number, s = 1.6) => {
  const x = Math.min(1, Math.max(0, t)) - 1
  return 1 + x * x * ((s + 1) * x + s)
}

/**
 * White hit flash: rises with each hp drop in proportion to the damage (a boss under sustained fire flickers
 * instead of turning white), capped, and fades in ~0.1 s.
 */
export class HitFlash {
  value = 0
  private last = NaN
  update(dt: number, hp: number, cap = 0.4): number {
    const drop = this.last - hp
    if (drop > 1e-4) this.value = Math.min(cap, this.value + Math.min(Math.max(drop * 40, 0.12), cap))
    this.last = hp
    this.value = Math.max(0, this.value - dt * 5)
    return this.value
  }
}

/** Makes meshes from a boss asset's parts; owns their materials and the hull depth material. */
export class BossBuilder {
  readonly uniforms: FoeUniforms[] = []
  private readonly materials = new Map<string, THREE.Material>()
  private readonly depth = hullDepthMaterial()
  private readonly extra: { dispose(): void }[] = []
  /** Vein pulse phase and angular speed per uniform set (the shader pulses with sin(uTime · uPulse.x)). */
  private readonly phase: number[] = []
  private readonly freq: number[] = []
  meshCount = 0

  constructor(private readonly asset: BossAsset) {}

  /** A uniform set (parts sharing it glow and flash together); `outline` is the ink width (m). */
  look(look: FoeLook, outline = 0.03): FoeUniforms {
    const u = createFoeUniforms(look)
    u.uOutline.value = outline
    this.uniforms.push(u)
    this.phase.push(0)
    this.freq.push(u.uPulse.value.x)
    u.uPulse.value.x = 1
    return u
  }

  /** A mesh of part `name` with uniforms `u`, added to `parent`; `mirror` flips it across its local YZ plane. */
  mesh(name: string, u: FoeUniforms, parent: THREE.Object3D, mirror = false): THREE.Mesh {
    const part = this.asset.parts[name]
    if (!part) throw new Error(`boss part ${name} missing`)
    const key = `${name}#${this.uniforms.indexOf(u)}`
    let mat = this.materials.get(key)
    if (!mat) {
      mat = createFoeMaterial(u, part.model.regions.count ? regionsOf(part.model) : null, { hull: part.hull })
      this.materials.set(key, mat)
    }
    const m = new THREE.Mesh(part.geometry, mat)
    m.name = name
    if (part.hull) m.customDepthMaterial = this.depth
    if (mirror) m.scale.x = -1
    parent.add(m)
    this.meshCount++
    return m
  }

  /** Registers something else to dispose with the model (effect geometry/materials). */
  own<T extends { dispose(): void }>(x: T): T {
    this.extra.push(x)
    return x
  }

  /** Vein pulse speed (rad/s) of a uniform set; the phase stays continuous when it changes. */
  setPulse(u: FoeUniforms, freq: number) {
    const i = this.uniforms.indexOf(u)
    if (i >= 0) this.freq[i] = freq
  }

  /**
   * Per-frame values shared by every uniform set. The pulse phase is accumulated here (uTime = phase, uPulse.x = 1)
   * so a changing pulse speed never sweeps the phase of a large global time (strobing).
   */
  tick(dt: number, flash: number, dim: number) {
    for (let i = 0; i < this.uniforms.length; i++) {
      const u = this.uniforms[i]
      this.phase[i] = (this.phase[i] + dt * this.freq[i]) % (Math.PI * 2000)
      u.uTime.value = this.phase[i]
      u.uFlash.value = flash
      u.uDim.value = dim
    }
  }

  dispose() {
    for (const m of this.materials.values()) m.dispose()
    this.materials.clear()
    this.depth.dispose()
    for (const x of this.extra) x.dispose()
    this.extra.length = 0
  }
}

/** A pivot group at `p` (parent space) holding a mesh baked around `bakedAt` (so the mesh turns about `p`). */
export function pivot(parent: THREE.Object3D, p: readonly [number, number, number], name?: string): THREE.Group {
  const g = new THREE.Group()
  g.position.set(p[0], p[1], p[2])
  if (name) g.name = name
  parent.add(g)
  return g
}

const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _c = new THREE.Vector3()
const _m = new THREE.Matrix4()

/**
 * Two-bone IK: from hip `h` to the foot target `f` with segment lengths l1, l2, bending towards `pole`
 * (a direction). Writes the knee to `knee` and returns the reach ratio (1 = fully stretched).
 */
export function solveTwoBone(
  h: THREE.Vector3,
  f: THREE.Vector3,
  l1: number,
  l2: number,
  pole: THREE.Vector3,
  knee: THREE.Vector3
): number {
  const n = _a.subVectors(f, h)
  let d = n.length()
  if (d < 1e-5) {
    n.set(0, -1, 0)
    d = 1e-5
  } else n.multiplyScalar(1 / d)
  const dc = Math.min(Math.max(d, Math.abs(l1 - l2) + 1e-3), l1 + l2 - 1e-3)
  const a = (l1 * l1 + dc * dc - l2 * l2) / (2 * dc)
  const hh = Math.sqrt(Math.max(0, l1 * l1 - a * a))
  const p = _b.copy(pole).addScaledVector(n, -pole.dot(n))
  if (p.lengthSq() < 1e-8) p.set(0, 0, 1).addScaledVector(n, -n.z)
  p.normalize()
  knee.copy(h).addScaledVector(n, a).addScaledVector(p, hh)
  return d / (l1 + l2)
}

/**
 * Orients `obj` (a segment baked along its local +Y from its origin) to run from `from` towards `to`, with its
 * local +Z turned towards `pole`; positions it at `from`. Allocation-free.
 */
export function aimSegment(obj: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, pole: THREE.Vector3) {
  const y = _a.subVectors(to, from)
  if (y.lengthSq() < 1e-10) y.set(0, 1, 0)
  y.normalize()
  const z = _b.copy(pole).addScaledVector(y, -pole.dot(y))
  if (z.lengthSq() < 1e-8) z.set(0, 0, 1).addScaledVector(y, -y.z)
  z.normalize()
  const x = _c.crossVectors(y, z)
  _m.makeBasis(x, y, z)
  obj.quaternion.setFromRotationMatrix(_m)
  obj.position.copy(from)
}

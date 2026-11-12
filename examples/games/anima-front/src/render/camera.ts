/**
 * The shoulder camera (DESIGN §9, §15). The pivot is the sim's aim pivot (feet + eye height + right × shoulder
 * offset × side) and the camera sits behind it on the aim line, so the screen centre is exactly the sim's aim
 * ray. Spring-arm collision, FOV (options, owl zoom, dash kick), recoil and trauma shake, down/away and spectate
 * cameras, and a cinematic camera for the title demo and results. Math is allocation-free per frame.
 */
import * as THREE from 'three'
import { SPECIES, eyeHeight, shoulderOffset, type SpeciesId } from '../data/species'
import type { V3 } from '../sim/types'
import type { BoxGrid } from './core/box-grid'

export const ARM_LENGTH = 3.2
export const ZOOM_FOV = 24
export const DASH_FOV_KICK = 7
const REFERENCE_ASPECT = 16 / 9
const ARM_PAD = 0.22
const ARM_MIN = 0.35

/** Species scale of the camera arm (the shiba is the reference). */
export const armScale = (species: SpeciesId) => SPECIES[species].height / SPECIES.shiba.height

/** Aim direction (DESIGN §2): (sin yaw·cos pitch, sin pitch, cos yaw·cos pitch). */
export function aimDirection(yaw: number, pitch: number, out: THREE.Vector3): THREE.Vector3 {
  const cp = Math.cos(pitch)
  return out.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp)
}

/** Sim aim pivot: feet + (0, eye height, 0) + right × shoulder offset × side; right = (−cos yaw, 0, sin yaw). */
export function aimPivot(
  feet: V3,
  yaw: number,
  species: SpeciesId,
  shoulder: 1 | -1,
  out: THREE.Vector3
): THREE.Vector3 {
  const def = SPECIES[species]
  const side = shoulderOffset(def) * shoulder
  return out.set(feet[0] - Math.cos(yaw) * side, feet[1] + eyeHeight(def), feet[2] + Math.sin(yaw) * side)
}

/** Vertical FOV (deg) for a horizontal-ish FOV: Hor+ above 16:9, constant horizontal below it. */
export function verticalFov(horizontalDeg: number, aspect: number): number {
  const h = THREE.MathUtils.degToRad(horizontalDeg)
  const a = Math.max(0.3, Math.min(aspect, REFERENCE_ASPECT))
  return THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(h / 2) / a))
}

/** Frame-rate independent exponential approach. */
export const damp = (current: number, target: number, rate: number, dt: number) =>
  target + (current - target) * Math.exp(-rate * dt)

/** Shortest signed angle from a to b. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

/**
 * Spring arm: shortens immediately when something blocks the line from the pivot back to the camera and eases
 * back out when the obstacle clears.
 */
export class SpringArm {
  length = ARM_LENGTH

  update(target: number, blocked: number, dt: number): number {
    const want = Math.max(ARM_MIN, Math.min(target, blocked - ARM_PAD))
    if (want < this.length) this.length = damp(this.length, want, 40, dt)
    else this.length = damp(this.length, want, 3.5, dt)
    if (this.length < ARM_MIN) this.length = ARM_MIN
    return this.length
  }
}

export interface ShoulderParams {
  feet: V3
  species: SpeciesId
  yaw: number
  pitch: number
  shoulder: 1 | -1
  /** 0..1 owl zoom. */
  zoom: number
}

export interface CinematicSubject {
  p: V3
}

type Mode = 'shoulder' | 'down' | 'away' | 'cinematic'

/**
 * Owns the THREE camera's transform and projection. One instance per renderer.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera
  readonly arm = new SpringArm()
  baseFov = 75
  reducedMotion = false
  /** Additive FOV kick (deg), decays. */
  private kick = 0
  /** Recoil pitch offset (rad) and its velocity. */
  private recoil = 0
  private recoilVel = 0
  /** 0..1 shake. */
  private trauma = 0
  private time = 0
  private mode: Mode = 'shoulder'
  private zoom = 0
  private shotTime = 0
  private shot = 0
  private readonly pivot = new THREE.Vector3()
  private readonly dir = new THREE.Vector3()
  private readonly look = new THREE.Vector3()
  private readonly tmp = new THREE.Vector3()
  private readonly smoothPos = new THREE.Vector3()
  private readonly smoothLook = new THREE.Vector3()
  private hasSmooth = false
  private grid: BoxGrid | null = null

  constructor(aspect = 16 / 9) {
    this.camera = new THREE.PerspectiveCamera(verticalFov(75, aspect), aspect, 0.06, 320)
  }

  setGrid(grid: BoxGrid | null) {
    this.grid = grid
  }

  setAspect(aspect: number) {
    this.camera.aspect = aspect
    this.applyFov()
  }

  /** FOV kick on dash (deg). */
  dashKick() {
    if (!this.reducedMotion) this.kick = Math.max(this.kick, DASH_FOV_KICK)
  }

  /** Recoil on the local player's shots (rad of upward kick). */
  recoilKick(amount: number) {
    this.recoilVel += amount * 30
  }

  /** Adds screen shake (0..1); ignored with reduced motion. */
  addTrauma(amount: number) {
    if (!this.reducedMotion) this.trauma = Math.min(1, this.trauma + amount)
  }

  private applyFov() {
    const h = THREE.MathUtils.lerp(this.baseFov, ZOOM_FOV, this.zoom) + this.kick * (1 - this.zoom)
    const v = verticalFov(h, this.camera.aspect)
    if (Math.abs(v - this.camera.fov) > 1e-4) {
      this.camera.fov = v
      this.camera.updateProjectionMatrix()
    }
  }

  private tick(dt: number) {
    this.time += dt
    this.kick = damp(this.kick, 0, 5, dt)
    // Critically damped spring back to zero recoil.
    const k = 160
    const c = 2 * Math.sqrt(k)
    this.recoilVel += (-k * this.recoil - c * this.recoilVel) * dt
    this.recoil += this.recoilVel * dt
    this.trauma = Math.max(0, this.trauma - dt * 1.3)
  }

  /** The shoulder camera on the given player's aim (local or spectated). */
  shoulder(p: ShoulderParams, dt: number) {
    this.tick(dt)
    this.mode = 'shoulder'
    this.zoom = damp(this.zoom, p.zoom, 14, dt)
    this.applyFov()
    aimPivot(p.feet, p.yaw, p.species, p.shoulder, this.pivot)
    aimDirection(p.yaw, p.pitch, this.dir)
    const target = ARM_LENGTH * armScale(p.species) * (1 - 0.35 * this.zoom)
    const blocked = this.grid
      ? this.grid.raycast(
          this.pivot.x,
          this.pivot.y,
          this.pivot.z,
          -this.dir.x,
          -this.dir.y,
          -this.dir.z,
          target + ARM_PAD,
          0.12
        )
      : target + ARM_PAD
    // Looking up swings the camera down: shorten the arm (staying on the aim line) before it reaches the ground.
    const ground = this.dir.y > 1e-3 ? (this.pivot.y - 0.2) / this.dir.y + ARM_PAD : Infinity
    const len = this.arm.update(target, Math.min(blocked, ground), dt)
    const cam = this.camera
    cam.position.copy(this.pivot).addScaledVector(this.dir, -len)
    this.look.copy(this.pivot).add(this.dir)
    cam.up.set(0, 1, 0)
    cam.lookAt(this.look)
    if (this.recoil !== 0) cam.rotateX(this.recoil)
    this.applyShake()
    this.smoothPos.copy(cam.position)
    this.smoothLook.copy(this.look)
    this.hasSmooth = true
  }

  /** Downed: a slow orbit around the dazed body. */
  down(feet: V3, dt: number) {
    this.tick(dt)
    this.mode = 'down'
    this.zoom = damp(this.zoom, 0, 10, dt)
    this.applyFov()
    const a = this.time * 0.25
    this.tmp.set(feet[0] + Math.sin(a) * 4.2, feet[1] + 2.6, feet[2] + Math.cos(a) * 4.2)
    this.look.set(feet[0], feet[1] + 0.6, feet[2])
    this.ease(this.tmp, this.look, dt, 3)
  }

  /** Warped away: rises and watches the warp column. */
  away(at: V3, dt: number) {
    this.tick(dt)
    this.mode = 'away'
    this.applyFov()
    this.tmp.set(at[0] + 6, at[1] + 7, at[2] + 6)
    this.look.set(at[0], at[1] + 4, at[2])
    this.ease(this.tmp, this.look, dt, 1.2)
  }

  /**
   * Cinematic: cycles slow orbits, fly-bys and low cranes across the subjects (squad or fight centre).
   */
  cinematic(subjects: readonly CinematicSubject[], dt: number) {
    this.tick(dt)
    if (this.mode !== 'cinematic') {
      this.mode = 'cinematic'
      this.shotTime = 0
      this.hasSmooth = false
    }
    this.zoom = 0
    this.kick = 0
    this.applyFov()
    // Centre of interest.
    let cx = 0
    let cy = 0
    let cz = 0
    const n = Math.max(1, subjects.length)
    for (const s of subjects) {
      cx += s.p[0]
      cy += s.p[1]
      cz += s.p[2]
    }
    cx /= n
    cy /= n
    cz /= n
    this.shotTime += dt
    const SHOT = 7
    if (this.shotTime > SHOT) {
      this.shotTime = 0
      this.shot = (this.shot + 1) % 4
      this.hasSmooth = false
    }
    const u = this.shotTime / SHOT
    const seed = this.shot * 1.7
    switch (this.shot) {
      case 0: {
        // Slow orbit at mid height.
        const a = seed + u * 0.9
        this.tmp.set(cx + Math.sin(a) * 11, cy + 4.5, cz + Math.cos(a) * 11)
        this.look.set(cx, cy + 1.2, cz)
        break
      }
      case 1: {
        // Low fly-by across the fight.
        const a = seed + 0.8
        const side = THREE.MathUtils.lerp(-9, 9, u)
        this.tmp.set(cx + Math.cos(a) * side + Math.sin(a) * 6, cy + 1.3, cz - Math.sin(a) * side + Math.cos(a) * 6)
        this.look.set(cx, cy + 1.1, cz)
        break
      }
      case 2: {
        // Crane up from behind.
        const a = seed + 2.4
        this.tmp.set(cx + Math.sin(a) * 8, cy + 1.5 + u * 7, cz + Math.cos(a) * 8)
        this.look.set(cx, cy + 0.8, cz)
        break
      }
      default: {
        // Wide high establishing orbit.
        const a = seed - u * 0.5
        this.tmp.set(cx + Math.sin(a) * 22, cy + 12, cz + Math.cos(a) * 22)
        this.look.set(cx, cy, cz)
      }
    }
    if (this.grid) {
      const floor = this.grid.groundAt(this.tmp.x, this.tmp.z) + 0.6
      if (this.tmp.y < floor) this.tmp.y = floor
    }
    this.ease(this.tmp, this.look, dt, 6)
  }

  private ease(pos: THREE.Vector3, look: THREE.Vector3, dt: number, rate: number) {
    if (!this.hasSmooth) {
      this.smoothPos.copy(pos)
      this.smoothLook.copy(look)
      this.hasSmooth = true
    } else {
      const k = 1 - Math.exp(-rate * dt)
      this.smoothPos.lerp(pos, k)
      this.smoothLook.lerp(look, k)
    }
    const cam = this.camera
    cam.position.copy(this.smoothPos)
    cam.up.set(0, 1, 0)
    cam.lookAt(this.smoothLook)
    this.applyShake()
  }

  private applyShake() {
    if (this.trauma <= 0 || this.reducedMotion) return
    const s = this.trauma * this.trauma
    const t = this.time * 31
    const cam = this.camera
    cam.rotateX(s * 0.03 * Math.sin(t * 1.1 + 0.3))
    cam.rotateY(s * 0.03 * Math.sin(t * 0.9 + 1.7))
    cam.rotateZ(s * 0.025 * Math.sin(t * 1.3 + 4.1))
  }

  get currentMode(): Mode {
    return this.mode
  }

  /** The aim pivot of the last shoulder frame (world). */
  get lastPivot(): THREE.Vector3 {
    return this.pivot
  }
}

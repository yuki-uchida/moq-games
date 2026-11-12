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
  /** Stable identity (player id, foe id) so a shot keeps following the same hero. */
  key?: string
  /**
   * 1 = squad member (shots are built around one), between 0 and 1 = foe or other team (framed when close),
   * 0 = obstacle only (a big prop the camera must not sit in or look through).
   */
  weight?: number
  /** Radius (m) the camera keeps clear of; default 1.2. */
  r?: number
  /** Height (m) of the body above p; default 2. */
  h?: number
}

/** Seconds per cinematic shot. */
export const CINEMATIC_SHOT = 6.5
const SHOT_KINDS = 5
/** Subjects within this radius of the hero are framed with it. */
const CLUSTER_R = 16

type Mode = 'shoulder' | 'down' | 'away' | 'cinematic'

/**
 * Owns the THREE camera's transform and projection. One instance per renderer.
 */
/**
 * Fraction along the segment a→b where it first enters the sphere (centre c, radius r), or −1 when it misses.
 * Allocation-free.
 */
export function segmentSphere(a: THREE.Vector3, b: THREE.Vector3, cx: number, cy: number, cz: number, r: number) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const dz = b.z - a.z
  const fx = a.x - cx
  const fy = a.y - cy
  const fz = a.z - cz
  const A = dx * dx + dy * dy + dz * dz
  if (A < 1e-9) return -1
  const B = 2 * (fx * dx + fy * dy + fz * dz)
  const C = fx * fx + fy * fy + fz * fz - r * r
  if (C < 0) return -1
  const disc = B * B - 4 * A * C
  if (disc < 0) return -1
  const t = (-B - Math.sqrt(disc)) / (2 * A)
  return t >= 0 && t <= 1 ? t : -1
}

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
  private spheres: readonly number[] = []
  private hero = ''
  private heroTurn = 0
  private azimuth = 0
  private readonly centre = new THREE.Vector3()
  private readonly facing = new THREE.Vector3(0, 0, 1)
  private hasCentre = false
  /** Free fraction of the current shot's look-to-camera line, eased (no popping when it changes). */
  private clear = 1

  constructor(aspect = 16 / 9) {
    this.camera = new THREE.PerspectiveCamera(verticalFov(75, aspect), aspect, 0.06, 320)
  }

  setGrid(grid: BoxGrid | null) {
    this.grid = grid
  }

  /** Static camera obstacles without collision (tree crowns) as [x, y, z, r] quadruples. */
  setObstacles(spheres: readonly number[]) {
    this.spheres = spheres
  }

  /**
   * Free fraction (0..1) of the segment look → pos against the grid, the static spheres and the big props among
   * the subjects; 1 when nothing is in the way.
   */
  private freeLine(look: THREE.Vector3, pos: THREE.Vector3, subjects: readonly CinematicSubject[]): number {
    let free = 1
    this.dir.subVectors(pos, look)
    const len = this.dir.length()
    if (len < 0.01) return 1
    if (this.grid) {
      this.dir.divideScalar(len)
      const hit = this.grid.raycast(look.x, look.y, look.z, this.dir.x, this.dir.y, this.dir.z, len, 0.35)
      if (hit < len) free = Math.max(0.15, (hit - 0.4) / len)
    }
    const sp = this.spheres
    for (let i = 0; i < sp.length; i += 4) {
      const t = segmentSphere(look, pos, sp[i], sp[i + 1], sp[i + 2], sp[i + 3] + 0.5)
      if (t >= 0) free = Math.min(free, Math.max(0.15, t - 0.4 / len))
    }
    for (const s of subjects) {
      if ((s.weight ?? 1) > 0 || !s.r) continue
      // Tall props as a stack of spheres from the base to the top.
      const h = s.h ?? 2
      const r = s.r + 0.4
      for (let y = Math.min(r, h / 2); y <= h; y += r) {
        const t = segmentSphere(look, pos, s.p[0], s.p[1] + y, s.p[2], r)
        if (t >= 0) free = Math.min(free, Math.max(0.15, t - 0.4 / len))
      }
    }
    return free
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
   * Cinematic (title demo, results): slow shots built around one squad member at a time (orbit, low tracking
   * dolly, crane, over-the-shoulder towards the foes, high establishing orbit), framing the foes near it. Each
   * shot picks the azimuth with the clearest line of sight and pulls in smoothly when a building gets in the way,
   * so the camera never clips into the city; cuts between shots are clean.
   */
  cinematic(subjects: readonly CinematicSubject[], dt: number) {
    this.tick(dt)
    if (this.mode !== 'cinematic') {
      this.mode = 'cinematic'
      this.shotTime = CINEMATIC_SHOT
      this.hasSmooth = false
      this.hasCentre = false
    }
    this.zoom = 0
    this.kick = 0
    this.applyFov()
    this.shotTime += dt
    let cut = false
    let hero = subjects.find((s) => s.key !== undefined && s.key === this.hero)
    if (this.shotTime >= CINEMATIC_SHOT || !hero) {
      cut = true
      this.shotTime = 0
      this.shot = (this.shot + 1) % SHOT_KINDS
      const squad = subjects.filter((s) => (s.weight ?? 1) >= 1)
      const pool = squad.length ? squad : subjects.filter((s) => (s.weight ?? 1) > 0)
      hero = pool.length ? pool[this.heroTurn++ % pool.length] : undefined
      this.hero = hero?.key ?? ''
    }
    // Weighted centre of the hero's cluster, and the direction from the hero towards nearby foes.
    const h = hero?.p ?? [0, 0, 0]
    let cx = 0
    let cy = 0
    let cz = 0
    let w = 0
    let fx = 0
    let fz = 0
    for (const s of subjects) {
      const dx = s.p[0] - h[0]
      const dz = s.p[2] - h[2]
      const k = s.weight ?? 1
      if (k <= 0 || dx * dx + dz * dz > CLUSTER_R * CLUSTER_R) continue
      cx += s.p[0] * k
      cy += s.p[1] * k
      cz += s.p[2] * k
      w += k
      if (k < 1) {
        fx += dx
        fz += dz
      }
    }
    if (w > 0) this.tmp.set(cx / w, cy / w, cz / w)
    else this.tmp.set(h[0], h[1], h[2])
    // Keep the hero in frame: the centre never drifts more than 5 m from it.
    this.dir.set(this.tmp.x - h[0], 0, this.tmp.z - h[2])
    if (this.dir.length() > 5) {
      this.dir.setLength(5)
      this.tmp.set(h[0] + this.dir.x, this.tmp.y, h[2] + this.dir.z)
    }
    if (!this.hasCentre || cut) {
      this.centre.copy(this.tmp)
      this.hasCentre = true
    } else this.centre.lerp(this.tmp, 1 - Math.exp(-1.5 * dt))
    if (cut) {
      const fl = Math.hypot(fx, fz)
      if (fl > 0.5) this.facing.set(fx / fl, 0, fz / fl)
      this.azimuth = this.pickAzimuth(subjects)
      this.clear = 1
      this.hasSmooth = false
    }
    const u = Math.min(1, this.shotTime / CINEMATIC_SHOT)
    this.pose(this.shot, u, this.azimuth, this.tmp, this.look)
    // Pull in towards the subject when a box, a tree crown or a big prop blocks the line, eased out again slowly.
    const free = this.freeLine(this.look, this.tmp, subjects)
    this.clear = free < this.clear || cut ? free : damp(this.clear, free, 1.5, dt)
    this.tmp.sub(this.look).multiplyScalar(this.clear).add(this.look)
    // Crane over anyone standing right at the camera instead of filling the frame with them.
    let lift = 0
    for (const s of subjects) {
      const dx = this.tmp.x - s.p[0]
      const dz = this.tmp.z - s.p[2]
      const keep = (s.r ?? 1.2) + 1.3
      const d = Math.hypot(dx, dz)
      if (d < keep && this.tmp.y < s.p[1] + (s.h ?? 2) + 1.5) lift = Math.max(lift, (keep - d) * 1.6)
    }
    this.tmp.y += lift
    if (this.grid) {
      const floor = this.grid.groundAt(this.tmp.x, this.tmp.z, this.tmp.y + 0.5) + 0.6
      if (this.tmp.y < floor) this.tmp.y = floor
    }
    this.ease(this.tmp, this.look, dt, 4)
  }

  /** Camera pose for a shot kind at progress u (0..1) around the eased centre. */
  private pose(kind: number, u: number, az: number, pos: THREE.Vector3, look: THREE.Vector3) {
    const c = this.centre
    const e = u * u * (3 - 2 * u)
    switch (kind) {
      case 0: {
        // Slow orbit at shoulder-to-rooftop height.
        const a = az + (e - 0.5) * 0.7
        pos.set(c.x + Math.sin(a) * 10, c.y + 3.6, c.z + Math.cos(a) * 10)
        look.set(c.x, c.y + 1.2, c.z)
        break
      }
      case 1: {
        // Low tracking dolly alongside the action.
        const side = THREE.MathUtils.lerp(-6, 6, e)
        const sx = Math.cos(az)
        const sz = -Math.sin(az)
        pos.set(c.x + Math.sin(az) * 7 + sx * side, c.y + 1.1, c.z + Math.cos(az) * 7 + sz * side)
        look.set(c.x + sx * side * 0.3, c.y + 1.2, c.z + sz * side * 0.3)
        break
      }
      case 2: {
        // Crane up and back.
        pos.set(c.x + Math.sin(az) * (6 + e * 4), c.y + 1.4 + e * 6.5, c.z + Math.cos(az) * (6 + e * 4))
        look.set(c.x, c.y + 0.9, c.z)
        break
      }
      case 3: {
        // Over the squad's shoulder towards the foes (slow push-in); the azimuth picks the shoulder side.
        const f = this.facing
        const back = 6.5 - e * 1.5
        const s = Math.sin(az) >= 0 ? 1 : -1
        pos.set(c.x - f.x * back + f.z * 2.2 * s, c.y + 2.2, c.z - f.z * back - f.x * 2.2 * s)
        look.set(c.x + f.x * 8, c.y + 1.4, c.z + f.z * 8)
        break
      }
      default: {
        // High establishing orbit.
        const a = az - e * 0.4
        pos.set(c.x + Math.sin(a) * 20, c.y + 11, c.z + Math.cos(a) * 20)
        look.set(c.x, c.y + 0.5, c.z)
      }
    }
  }

  /** The azimuth (of 12) whose shot start, middle and end have the most free line of sight to the centre. */
  private pickAzimuth(subjects: readonly CinematicSubject[]): number {
    const base = Math.atan2(this.facing.x, this.facing.z) + Math.PI * 0.75
    let best = base
    let bestScore = -1
    for (let i = 0; i < 12; i++) {
      const az = base + (i / 12) * Math.PI * 2
      let score = i === 0 ? 0.02 : 0
      for (const u of [0, 0.5, 1]) {
        this.pose(this.shot, u, az, this.tmp, this.look)
        score += this.freeLine(this.look, this.tmp, subjects)
      }
      if (score > bestScore + 1e-6) {
        bestScore = score
        best = az
      }
    }
    return best
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

  /** Where the camera is looking (eased), for the shadow focus during cinematics. */
  get lastLook(): THREE.Vector3 {
    return this.smoothLook
  }

  /** The aim pivot of the last shoulder frame (world). */
  get lastPivot(): THREE.Vector3 {
    return this.pivot
  }
}

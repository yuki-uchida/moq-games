/**
 * Hero movement shared by the host world and the guest predictor (DESIGN §7): species speeds and accelerations,
 * the slime hop and bounce pads, knockback decay and tile collision. Pure: no world access besides the Grid.
 */
import { TILE, type Species } from '../vocab'
import type { Grid } from './grid'

export const HERO_R = 16

export interface Body {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  /** Knockback velocity (decays). */
  kx: number
  ky: number
  facing: number
  /** Jump elapsed time (< 0 = on the ground), duration, height. */
  jt: number
  jd: number
  jh: number
  /** Jump velocity is fixed (bounce pads). */
  jfix: boolean
  /** Continuous movement time (wolf sprint). */
  moveT: number
  /** Crow flight stamina (s) and flying flag; rat dash end time. */
  stamina: number
  flying: boolean
  dashT: number
}

export function newBody(x: number, y: number, facing = Math.PI / 2): Body {
  return {
    x,
    y,
    z: 0,
    vx: 0,
    vy: 0,
    kx: 0,
    ky: 0,
    facing,
    jt: -1,
    jd: 0,
    jh: 0,
    jfix: false,
    moveT: 0,
    stamina: 1.5,
    flying: false,
    dashT: -1
  }
}

export interface SpeciesMove {
  speed: number
  /** Acceleration rate (1/s, exponential approach). */
  accel: number
  airAccel: number
}

/** Species movement table (DESIGN §7). */
export const SPECIES_MOVE: Record<Species, SpeciesMove> = {
  slime: { speed: 150, accel: 6, airAccel: 3 },
  rat: { speed: 190, accel: 18, airAccel: 18 },
  crow: { speed: 165, accel: 10, airAccel: 6 },
  wolf: { speed: 180, accel: 9, airAccel: 9 }
}

/** Upper bound of a hero's ground speed (host plausibility check). */
export const MAX_SPEED: Record<Species, number> = { slime: 215, rat: 570, crow: 205, wolf: 240 }

export const SLIME_HOP = { dur: 0.5, height: 36, boost: 1.2 }
export const BOUNCE_HOP = { dur: 0.9, height: 80, dist: 3 * TILE }

export interface MoveInput {
  mx: number
  my: number
  /** Species action pressed this tick. */
  action: boolean
  actionHeld: boolean
}

export interface MoveResult {
  jumped: boolean
  bounced: boolean
  landed: boolean
  /** On the ground over a non-walkable tile (fall). */
  fell: boolean
  dashed: boolean
  flew: boolean
}

export const airborne = (b: Body) => b.z > 0.01 || b.jt >= 0 || b.flying

/**
 * One movement step. `speedMul` is the host-imposed multiplier (charging 0.55, carrying 0.6) and `locked`
 * freezes voluntary movement (attacks keep momentum only).
 */
export function stepBody(
  b: Body,
  input: MoveInput,
  grid: Grid,
  species: Species,
  speedMul: number,
  dt: number,
  canAct = true
): MoveResult {
  const res: MoveResult = { jumped: false, bounced: false, landed: false, fell: false, dashed: false, flew: false }
  const spec = SPECIES_MOVE[species]
  let len = Math.hypot(input.mx, input.my)
  let mx = input.mx
  let my = input.my
  if (len > 1) (mx /= len), (my /= len), (len = 1)
  let speed = spec.speed * speedMul
  const inAir = b.jt >= 0
  // Species actions.
  if (species === 'slime' && input.action && canAct && !inAir && b.z <= 0) {
    b.jt = 0
    b.jd = SLIME_HOP.dur
    b.jh = SLIME_HOP.height
    b.jfix = false
    const s = spec.speed * speedMul * SLIME_HOP.boost
    if (len > 0.1) (b.vx = (mx / len) * s), (b.vy = (my / len) * s)
    else (b.vx *= SLIME_HOP.boost), (b.vy *= SLIME_HOP.boost)
    res.jumped = true
  }
  if (species === 'rat' && input.action && canAct && b.dashT < 0) {
    b.dashT = 0
    const a = len > 0.1 ? Math.atan2(my, mx) : b.facing
    b.vx = Math.cos(a) * spec.speed * 3
    b.vy = Math.sin(a) * spec.speed * 3
    res.dashed = true
  }
  if (species === 'crow') {
    const wantFly = input.actionHeld && canAct && b.stamina > 0
    if (wantFly && !b.flying) res.flew = true
    b.flying = wantFly
    if (b.flying) b.stamina = Math.max(0, b.stamina - dt)
    else b.stamina = Math.min(1.5, b.stamina + dt)
    b.z = b.flying ? Math.min(24, b.z + dt * 120) : Math.max(0, b.z - dt * 120)
    if (b.flying) speed = 205 * speedMul
  }
  if (species === 'wolf') {
    b.moveT = len > 0.3 ? b.moveT + dt : 0
    if (b.moveT > 0.6) speed *= 240 / 180
  }
  // Velocity.
  if (b.dashT >= 0) {
    b.dashT += dt
    if (b.dashT > 0.22) b.dashT = b.dashT > 0.6 ? -1 : b.dashT
  }
  const dashing = b.dashT >= 0 && b.dashT <= 0.22
  if (b.jt >= 0) {
    if (!b.jfix) {
      const k = 1 - Math.exp(-spec.airAccel * dt)
      const s = spec.speed * speedMul * SLIME_HOP.boost
      if (len > 0.1) {
        b.vx += (mx * s - b.vx) * k
        b.vy += (my * s - b.vy) * k
      }
    }
  } else if (!dashing) {
    const k = 1 - Math.exp(-spec.accel * dt)
    b.vx += (mx * speed - b.vx) * k
    b.vy += (my * speed - b.vy) * k
  }
  // Knockback decays.
  const kd = Math.exp(-10 * dt)
  b.kx *= kd
  b.ky *= kd
  if (Math.abs(b.kx) < 1) b.kx = 0
  if (Math.abs(b.ky) < 1) b.ky = 0
  const air = airborne(b)
  const out = grid.move(b.x, b.y, (b.vx + b.kx) * dt, (b.vy + b.ky) * dt, HERO_R, air)
  if (out.hit && !air) {
    // Lose the velocity component into the wall.
    const ax = out.x - b.x
    const ay = out.y - b.y
    if (Math.abs(ax) < Math.abs(b.vx * dt) * 0.5) b.vx *= 0.5
    if (Math.abs(ay) < Math.abs(b.vy * dt) * 0.5) b.vy *= 0.5
  }
  b.x = out.x
  b.y = out.y
  const sp = Math.hypot(b.vx, b.vy)
  if (len > 0.1) b.facing = Math.atan2(my, mx)
  else if (sp > 30 && b.jt < 0) b.facing = Math.atan2(b.vy, b.vx)
  // Jump arc and landing.
  if (b.jt >= 0) {
    b.jt += dt
    const p = Math.min(1, b.jt / b.jd)
    b.z = 4 * b.jh * p * (1 - p)
    if (b.jt >= b.jd) {
      b.jt = -1
      b.z = 0
      b.jfix = false
      res.landed = true
      if (species === 'slime') {
        b.vx /= SLIME_HOP.boost
        b.vy /= SLIME_HOP.boost
      }
    }
  }
  const tx = Math.floor(b.x / TILE)
  const ty = Math.floor(b.y / TILE)
  if (!airborne(b)) {
    if (grid.inside(tx, ty) && grid.bounce[grid.idx(tx, ty)] && canAct) {
      // Bounce pad: snap to its centre and launch three tiles along the cardinal movement direction.
      const a = sp > 20 ? Math.atan2(b.vy, b.vx) : b.facing
      const c = Math.cos(a)
      const s = Math.sin(a)
      const [dx, dy] = Math.abs(c) >= Math.abs(s) ? [Math.sign(c), 0] : [0, Math.sign(s)]
      b.x = tx * TILE + TILE / 2
      b.y = ty * TILE + TILE / 2
      b.jt = 0
      b.jd = BOUNCE_HOP.dur
      b.jh = BOUNCE_HOP.height
      b.jfix = true
      b.vx = (dx * BOUNCE_HOP.dist) / BOUNCE_HOP.dur
      b.vy = (dy * BOUNCE_HOP.dist) / BOUNCE_HOP.dur
      b.kx = b.ky = 0
      res.bounced = true
    } else if (!grid.walkable(tx, ty)) res.fell = true
  }
  return res
}

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
  /** Dash direction. */
  dashA: number
  /** Blown by a gust (s left): knockback crosses air tiles, so a shove can push you off a cliff. */
  blown: number
  /** Wolf howl cooldown (s left). */
  howlCd: number
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
    dashT: -1,
    dashA: 0,
    blown: 0,
    howlCd: 0
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
export const MAX_SPEED: Record<Species, number> = { slime: 215, rat: 570, crow: 400, wolf: 260 }

/** Crow flight (DESIGN §7). */
export const CROW_FLIGHT = { stamina: 1.5, speed: 205, z: 28, ventZ: 44, rise: 160, sink: 120 }
/** Wolf (DESIGN §7). */
export const WOLF = { sprintAfter: 0.6, sprint: 1.35, howlCd: 2.5, howlTime: 0.5 }
/** Acceleration on ice (1/s): heroes slide. */
export const ICE_ACCEL = 1.2
/** Walking heroes feel this share of a wind zone's strength. */
export const WIND_WALK = 0.3

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
  /** Wolf howled this tick. */
  howled?: boolean
  /** Flying over a vent (stamina refilled). */
  vented?: boolean
  /** Went through a mouse hole: entrance and exit centres. */
  holed?: { fromX: number; fromY: number; toX: number; toY: number }
}

/** Extra movement context: a formation of 3+ resists currents; nothing carried fits through a mouse hole. */
export interface MoveOptions {
  resist?: boolean
  carrying?: boolean
}

export const RAT_DASH = { time: 0.22, mul: 3, cooldown: 0.6 }

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
  canAct = true,
  opts: MoveOptions = {}
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
    b.dashA = a
    b.vx = Math.cos(a) * spec.speed * RAT_DASH.mul
    b.vy = Math.sin(a) * spec.speed * RAT_DASH.mul
    res.dashed = true
  }
  if (species === 'crow') {
    // 羽ばたき: fly while held on 1.5 s of stamina (vents refill it and lift you); glide down when it runs out.
    const ctx = Math.floor(b.x / TILE)
    const cty = Math.floor(b.y / TILE)
    const overVent = grid.inside(ctx, cty) && grid.vent[grid.idx(ctx, cty)] === 1
    const wantFly = input.actionHeld && canAct && (b.stamina > 0 || (b.flying && overVent))
    if (wantFly && !b.flying) res.flew = true
    const wasUp = b.z > 0.01 || b.flying
    b.flying = wantFly
    if (b.flying) {
      b.moveT += dt
      b.stamina = overVent ? CROW_FLIGHT.stamina : Math.max(0, b.stamina - dt)
      if (overVent) res.vented = true
    } else if (b.z <= 0.01) b.stamina = Math.min(CROW_FLIGHT.stamina, b.stamina + dt)
    const target = b.flying ? (overVent ? CROW_FLIGHT.ventZ : CROW_FLIGHT.z + Math.sin(b.moveT * 7) * 4) : 0
    b.z += Math.max(-CROW_FLIGHT.sink * dt, Math.min(CROW_FLIGHT.rise * dt, target - b.z))
    if (b.flying) speed = CROW_FLIGHT.speed * speedMul
    if (wasUp && !b.flying && b.z <= 0.01) {
      b.z = 0
      res.landed = true
    }
  }
  if (species === 'wolf') {
    // Sprint after 0.6 s of continuous movement; 遠吠え on Space (cooldown 2.5 s).
    b.moveT = len > 0.3 ? b.moveT + dt : 0
    if (b.moveT > WOLF.sprintAfter) speed *= WOLF.sprint
    if (b.howlCd > 0) b.howlCd = Math.max(0, b.howlCd - dt)
    if (input.action && canAct && b.howlCd <= 0) {
      b.howlCd = WOLF.howlCd
      res.howled = true
    }
  }
  // Velocity.
  if (b.dashT >= 0) {
    b.dashT += dt
    if (b.dashT > RAT_DASH.time) b.dashT = b.dashT > RAT_DASH.cooldown ? -1 : b.dashT
  }
  const dashing = b.dashT >= 0 && b.dashT <= RAT_DASH.time
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
    // Ice: low friction, momentum carries you.
    const ctx = Math.floor(b.x / TILE)
    const cty = Math.floor(b.y / TILE)
    const onIce = b.z <= 0.01 && grid.inside(ctx, cty) && grid.ice[grid.idx(ctx, cty)] === 1
    const k = 1 - Math.exp(-(onIce ? ICE_ACCEL : spec.accel) * dt)
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
  // A gust's shove carries even walkers over the edge.
  const out = grid.move(b.x, b.y, (b.vx + b.kx) * dt, (b.vy + b.ky) * dt, HERO_R, air || b.blown > 0)
  if (b.blown > 0) b.blown = Math.max(0, b.blown - dt)
  if (out.hit && !air) {
    // Lose the velocity component into the wall.
    const ax = out.x - b.x
    const ay = out.y - b.y
    if (Math.abs(ax) < Math.abs(b.vx * dt) * 0.5) b.vx *= 0.5
    if (Math.abs(ay) < Math.abs(b.vy * dt) * 0.5) b.vy *= 0.5
  }
  b.x = out.x
  b.y = out.y
  // Mouse holes: dashing into one comes out of its partner (nothing carried fits).
  if (dashing && !opts.carrying) {
    const hx = Math.floor((b.x + Math.cos(b.dashA) * (HERO_R + 8)) / TILE)
    const hy = Math.floor((b.y + Math.sin(b.dashA) * (HERO_R + 8)) / TILE)
    const exit = grid.inside(hx, hy) ? grid.holeExit.get(grid.idx(hx, hy)) : undefined
    if (exit !== undefined) {
      const toX = (exit % grid.w) * TILE + TILE / 2
      const toY = Math.floor(exit / grid.w) * TILE + TILE / 2
      res.holed = { fromX: hx * TILE + TILE / 2, fromY: hy * TILE + TILE / 2, toX, toY }
      const [ex, ey] = grid.holeDir.get(exit) ?? [0, 0]
      b.x = toX
      b.y = toY
      b.dashT = RAT_DASH.time + 0.01
      b.vx = ex * spec.speed
      b.vy = ey * spec.speed
      b.kx = b.ky = 0
      b.dashA = Math.atan2(ey, ex)
    }
  }
  // Currents push walking heroes downstream (into sludge if they let it); a formation of 3+ resists.
  if (!air && !dashing) {
    const ctx = Math.floor(b.x / TILE)
    const cty = Math.floor(b.y / TILE)
    const ti = grid.inside(ctx, cty) ? grid.idx(ctx, cty) : -1
    if (ti >= 0 && (grid.flowX[ti] || grid.flowY[ti]) && (!opts.resist || grid.flowStrong[ti])) {
      const f = grid.move(b.x, b.y, grid.flowX[ti] * dt, grid.flowY[ti] * dt, HERO_R, true)
      b.x = f.x
      b.y = f.y
    }
  }
  // Wind zones: flyers are pushed hard, walkers gently; a formation of 3+ resists.
  {
    const ctx = Math.floor(b.x / TILE)
    const cty = Math.floor(b.y / TILE)
    const ti = grid.inside(ctx, cty) ? grid.idx(ctx, cty) : -1
    if (ti >= 0 && (grid.windX[ti] || grid.windY[ti]) && !opts.resist) {
      const k = airborne(b) ? 1 : WIND_WALK
      const f = grid.move(b.x, b.y, grid.windX[ti] * k * dt, grid.windY[ti] * k * dt, HERO_R, airborne(b))
      b.x = f.x
      b.y = f.y
    }
  }
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

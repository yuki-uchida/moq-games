// Predator perception, steering and scent tracking as plain-data functions.
// Terrain height and sight-line blocking come in through `Terrain`, so a richer map module can replace the flat field.

export interface Point {
  x: number
  z: number
}

export interface Terrain {
  heightAt(x: number, z: number): number
  /** Fraction of a rabbit that stays visible along the line from eye to target: 1 is clear, 0 is fully blocked. */
  sightLine(from: Point, to: Point): number
}

export type PredatorKind =
  | 'fox'
  | 'wolf'
  | 'hawk'
  | 'snake'
  | 'crocodile'
  | 'human'
  | 'child'
  | 'cat'
  | 'dog'
  | 'rat'
  | 'crow'

/**
 * Per-kind traits. `sight` m of clear view; `eye` height of the eyes above the feet (flyers use their own y);
 * `chase` speed; `body` radius; `height` the clearance an overhang needs for it to walk under; `smell` scales
 * the sniff radius (0: ignores droppings); `peek`: sees a rabbit under an overhang from within 4 m;
 * `catch`: 'bite' drains health, 'grab' picks the rabbit up (stage script `caught`); `range` home range.
 */
export const KINDS: Record<
  PredatorKind,
  {
    sight: number
    eye: number
    chase: number
    body: number
    height: number
    smell: number
    peek: boolean
    flies: boolean
    catch: 'bite' | 'grab'
    range: number
  }
> = {
  fox: {
    sight: 13,
    eye: 0.8,
    chase: 4.3,
    body: 0.6,
    height: 1,
    smell: 1,
    peek: true,
    flies: false,
    catch: 'bite',
    range: 30
  },
  wolf: {
    sight: 13,
    eye: 0.8,
    chase: 7.2,
    body: 0.75,
    height: 1.3,
    smell: 1,
    peek: true,
    flies: false,
    catch: 'bite',
    range: 38
  },
  hawk: {
    sight: 18,
    eye: 0,
    chase: 8,
    body: 0,
    height: 0,
    smell: 0,
    peek: false,
    flies: true,
    catch: 'bite',
    range: 45
  },
  snake: {
    sight: 7,
    eye: 0.8,
    chase: 4.3,
    body: 0.25,
    height: 0.3,
    smell: 1,
    peek: true,
    flies: false,
    catch: 'bite',
    range: 20
  },
  crocodile: {
    sight: 13,
    eye: 0.8,
    chase: 4.3,
    body: 0.8,
    height: 0.8,
    smell: 0,
    peek: false,
    flies: false,
    catch: 'bite',
    range: 40
  },
  human: {
    sight: 15,
    eye: 5.6,
    chase: 6,
    body: 0.7,
    height: 6,
    smell: 0,
    peek: false,
    flies: false,
    catch: 'grab',
    range: 40
  },
  child: {
    sight: 12,
    eye: 3.9,
    chase: 6.4,
    body: 0.5,
    height: 4.2,
    smell: 0,
    peek: false,
    flies: false,
    catch: 'grab',
    range: 30
  },
  cat: {
    sight: 11,
    eye: 0.9,
    chase: 7,
    body: 0.4,
    height: 1,
    smell: 0.6,
    peek: true,
    flies: false,
    catch: 'bite',
    range: 25
  },
  dog: {
    sight: 12,
    eye: 1.3,
    chase: 7.4,
    body: 0.55,
    height: 1.5,
    smell: 1.8,
    peek: true,
    flies: false,
    catch: 'bite',
    range: 30
  },
  rat: {
    sight: 6,
    eye: 0.3,
    chase: 5,
    body: 0.2,
    height: 0.4,
    smell: 1.6,
    peek: true,
    flies: false,
    catch: 'bite',
    range: 18
  },
  crow: {
    sight: 16,
    eye: 0,
    chase: 7,
    body: 0,
    height: 0,
    smell: 0,
    peek: false,
    flies: true,
    catch: 'bite',
    range: 40
  }
}
export const PREDATOR_KINDS = Object.keys(KINDS) as PredatorKind[]
export const flies = (kind: string) => KINDS[kind as PredatorKind]?.flies === true
export type PredatorState = 'patrol' | 'search' | 'suspicious' | 'chase'

export interface PredatorBody extends Point {
  id: string
  kind: PredatorKind
  y: number
  angle: number
  state: PredatorState
  targetId: string | null
  /** 0..1 suspicion meter shown as "?"; reaching 1 means spotted. */
  suspicion: number
}

/** A rabbit as one predator perceives it. `visibility` already includes crouching, grass and hiding. */
export interface Target extends Point {
  id: string
  y: number
  visibility: number
}

export interface Dropping extends Point {
  id: string
  y: number
  /** Game time when dropped. */
  t: number
}

/** Host-only scent identity of a dropping; a new chain starts after water or a dust bath. */
export interface Scent {
  owner: string
  chain: number
}

export interface Mind {
  speed: number
  climb: number
  lastKnown: Point | null
  linger: number
  trail: string | null
  sniffed: Set<string>
  /** Seconds left walking away from `giveUp` with the nose off, so a spot it gave up on can't hold it forever. */
  bored: number
  giveUp: Point | null
}

export const STEALTH = {
  sightRange: Object.fromEntries(PREDATOR_KINDS.map((kind) => [kind, KINDS[kind].sight])) as Record<
    PredatorKind,
    number
  >,
  /** Within this share of the effective range a rabbit is spotted at once. */
  closeFraction: 0.4,
  /** Between the effective range and this multiple, a predator only notices something and comes to look. */
  farFraction: 1.6,
  touchRange: 2,
  fieldOfView: -0.15,
  chaseKeepFactor: 1.3,
  crouch: 0.6,
  grass: 0.7,
  treeCover: 0.45,
  /** Seconds to fill the meter at the inner edge of the "?" band; the outer edge takes about three times longer. */
  suspicionSeconds: 1.6,
  suspicionDecay: 0.35,
  searchSeconds: 4.5,
  boredSeconds: 12,
  droppingInterval: [5, 12] as const,
  maxDroppings: 32,
  droppingExpiry: 90,
  scentLifetime: 40,
  sniffRadius: 4.5,
  trailRange: 22,
  /** Chance that a trail survives a water crossing or dust bath. */
  chainCarry: 0.2,
  bathSeconds: 2
} as const

const limits = (kind: PredatorKind) =>
  flies(kind)
    ? { turn: 2.4, accel: 7, climb: 2.5, dive: 5, vAccel: 6 }
    : { turn: kind === 'snake' ? 4 : 5, accel: 12, climb: 0, dive: 0, vAccel: 0 }
export const HAWK_ALTITUDE = { patrol: 5, suspicious: 5.5, search: 6.5 } as const

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle))
const heading = (from: Point, to: Point) => Math.atan2(to.x - from.x, to.z - from.z)
export const distance = (first: Point, second: Point) => Math.hypot(first.x - second.x, first.z - second.z)

export function segmentDistance(point: Point, from: Point, to: Point): number {
  const dx = to.x - from.x
  const dz = to.z - from.z
  const length = dx * dx + dz * dz
  const t = length ? clamp(((point.x - from.x) * dx + (point.z - from.z) * dz) / length, 0, 1) : 0
  return Math.hypot(from.x + dx * t - point.x, from.z + dz * t - point.z)
}

export const newMind = (): Mind => ({
  speed: 0,
  climb: 0,
  lastKnown: null,
  linger: 0,
  trail: null,
  sniffed: new Set(),
  bored: 0,
  giveUp: null
})

export function visibility(rabbit: { hidden: boolean; crouch: boolean; inGrass: boolean }, sightLine: number): number {
  if (rabbit.hidden) return 0
  return (rabbit.crouch ? STEALTH.crouch : 1) * (rabbit.inGrass ? STEALTH.grass : 1) * clamp(sightLine, 0, 1)
}

export type Zone = 'none' | 'far' | 'near' | 'close'
const rank: Record<Zone, number> = { none: 0, far: 1, near: 2, close: 3 }

/** Distance band of a rabbit: close is spotted at once, near raises "?", far draws a slow search. */
export function sightZone(range: number, reach: number, facing: number, chasing: boolean): Zone {
  if (reach <= 0) return 'none'
  if (range < STEALTH.touchRange) return 'close'
  if (chasing) return range < reach * STEALTH.chaseKeepFactor ? 'close' : 'none'
  if (facing <= STEALTH.fieldOfView) return 'none'
  if (range < reach * STEALTH.closeFraction) return 'close'
  if (range < reach) return 'near'
  return range < reach * STEALTH.farFraction ? 'far' : 'none'
}

export const scentStrength = (dropping: Dropping, time: number) =>
  clamp(1 - (time - dropping.t) / STEALTH.scentLifetime, 0, 1)

/** Freshest unsniffed dropping a predator can smell from here (`nose` scales the sniff radius). */
export function sniff(
  from: Point,
  droppings: readonly Dropping[],
  time: number,
  ignore: ReadonlySet<string>,
  nose = 1
): Dropping | undefined {
  let best: Dropping | undefined
  for (const dropping of droppings)
    if (
      !ignore.has(dropping.id) &&
      scentStrength(dropping, time) > 0 &&
      distance(from, dropping) < STEALTH.sniffRadius * nose &&
      (!best || dropping.t > best.t)
    )
      best = dropping
  return best
}

/** The next newer dropping from the same rabbit. Trails across water or a dust bath usually go cold. */
export function nextOnTrail(
  current: Dropping,
  droppings: readonly Dropping[],
  scents: ReadonlyMap<string, Scent>,
  time: number,
  random: () => number
): Dropping | undefined {
  const scent = scents.get(current.id)
  if (!scent) return undefined
  let next: Dropping | undefined
  for (const dropping of droppings)
    if (dropping.t > current.t && scents.get(dropping.id)?.owner === scent.owner && (!next || dropping.t < next.t))
      next = dropping
  if (!next || scentStrength(next, time) <= 0 || distance(current, next) > STEALTH.trailRange) return undefined
  return scents.get(next.id)!.chain === scent.chain || random() < STEALTH.chainCarry ? next : undefined
}

export interface Roll {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
}

/** Advances a falling or rolling dropping. Returns false once it has come to rest on the ground. */
export function rollDropping(roll: Roll, terrain: Terrain, dt: number): boolean {
  const ground = terrain.heightAt(roll.x, roll.z)
  const grounded = roll.y <= ground + 0.02
  if (!grounded) {
    roll.vy -= 18 * dt
    roll.y = Math.max(ground, roll.y + roll.vy * dt)
  } else {
    const slopeX = (terrain.heightAt(roll.x + 0.1, roll.z) - terrain.heightAt(roll.x - 0.1, roll.z)) / 0.2
    const slopeZ = (terrain.heightAt(roll.x, roll.z + 0.1) - terrain.heightAt(roll.x, roll.z - 0.1)) / 0.2
    roll.vx -= 6 * slopeX * dt
    roll.vz -= 6 * slopeZ * dt
    const friction = Math.exp(-1.8 * dt)
    roll.vx *= friction
    roll.vz *= friction
    roll.vy = 0
  }
  roll.x += roll.vx * dt
  roll.z += roll.vz * dt
  const floor = terrain.heightAt(roll.x, roll.z)
  if (grounded || roll.y <= floor) roll.y = floor
  return roll.y > floor || Math.hypot(roll.vx, roll.vz) > 0.03
}

function steer(
  body: PredatorBody,
  mind: Mind,
  goal: { heading: number; speed: number; altitude: number },
  terrain: Terrain,
  dt: number
) {
  const limit = limits(body.kind)
  body.angle += clamp(wrap(goal.heading - body.angle), -limit.turn * dt, limit.turn * dt)
  mind.speed += clamp(goal.speed - mind.speed, -limit.accel * dt, limit.accel * dt)
  body.x += Math.sin(body.angle) * mind.speed * dt
  body.z += Math.cos(body.angle) * mind.speed * dt
  const ground = terrain.heightAt(body.x, body.z)
  if (!flies(body.kind)) {
    body.y = ground
    return
  }
  const wanted = clamp((Math.max(goal.altitude, ground + 0.4) - body.y) * 2, -limit.dive, limit.climb)
  mind.climb += clamp(wanted - mind.climb, -limit.vAccel * dt, limit.vAccel * dt)
  body.y = Math.max(ground + 0.3, body.y + mind.climb * dt)
}

/** One perception/decision/movement step. Returns the rabbit being chased, if any. */
export function updatePredator(
  body: PredatorBody,
  mind: Mind,
  targets: readonly Target[],
  context: {
    dt: number
    time: number
    droppings: readonly Dropping[]
    scents: ReadonlyMap<string, Scent>
    terrain: Terrain
    random: () => number
    /** Heading and speed while patrolling a route; otherwise the predator wanders. */
    patrol?: { heading: number; speed: number }
  }
): Target | undefined {
  const { dt, time } = context
  const sight = STEALTH.sightRange[body.kind]
  let best: { target: Target; zone: Zone; range: number; reach: number } | undefined
  for (const target of targets) {
    const range = distance(body, target)
    const reach = sight * target.visibility
    const facing = Math.cos(heading(body, target) - body.angle)
    const zone = sightZone(range, reach, facing, body.state === 'chase' && body.targetId === target.id)
    if (zone !== 'none' && (!best || rank[zone] > rank[best.zone] || (zone === best.zone && range < best.range)))
      best = { target, zone, range, reach }
  }

  if (best && (best.zone === 'close' || (best.zone === 'near' && body.state !== 'chase'))) {
    body.targetId = best.target.id
    mind.lastKnown = { x: best.target.x, z: best.target.z }
    mind.trail = null
    if (best.zone === 'close') body.suspicion = 1
    else
      body.suspicion = Math.min(1, body.suspicion + (dt / STEALTH.suspicionSeconds) * (1.5 - best.range / best.reach))
    body.state = body.suspicion >= 1 ? 'chase' : 'suspicious'
  } else {
    if (body.state === 'chase' || body.state === 'suspicious') {
      body.state = 'search'
      mind.linger = STEALTH.searchSeconds
    }
    body.targetId = null
    body.suspicion = Math.max(0, body.suspicion - dt * STEALTH.suspicionDecay)
    if (best?.zone === 'far') {
      body.state = 'search'
      mind.lastKnown = { x: best.target.x, z: best.target.z }
      mind.linger = STEALTH.searchSeconds
      mind.trail = null
    } else if (!mind.trail && mind.bored <= 0 && KINDS[body.kind].smell > 0) {
      const found = sniff(body, context.droppings, time, mind.sniffed, KINDS[body.kind].smell)
      if (found) {
        body.state = 'search'
        mind.trail = found.id
        mind.linger = STEALTH.searchSeconds
      }
    }
  }

  let trail = mind.trail ? context.droppings.find((dropping) => dropping.id === mind.trail) : undefined
  if (mind.trail && (!trail || scentStrength(trail, time) <= 0)) mind.trail = null
  if (trail && distance(body, trail) < 1.2) {
    mind.sniffed.add(trail.id)
    mind.lastKnown = { x: trail.x, z: trail.z }
    mind.linger = STEALTH.searchSeconds
    trail = nextOnTrail(trail, context.droppings, context.scents, time, context.random)
    mind.trail = trail?.id ?? null
  }
  if (mind.sniffed.size > STEALTH.maxDroppings * 2) {
    const live = new Set(context.droppings.map((dropping) => dropping.id))
    for (const id of mind.sniffed) if (!live.has(id)) mind.sniffed.delete(id)
  }

  const hawk = flies(body.kind)
  const chased = body.state === 'chase' ? targets.find((target) => target.id === body.targetId) : undefined
  const goal = { heading: body.angle + dt * 0.28, speed: 1.5, altitude: HAWK_ALTITUDE.patrol as number }
  if (chased) {
    const range = distance(body, chased)
    goal.heading = heading(body, chased)
    goal.speed = hawk ? Math.min(KINDS[body.kind].chase, 2 + range * 1.5) : KINDS[body.kind].chase
    goal.altitude = chased.y + 0.5 + clamp((range - 1.5) * 0.4, 0, 5)
  } else if (body.state === 'suspicious' && mind.lastKnown) {
    goal.heading = heading(body, mind.lastKnown)
    goal.speed = 0.8
    goal.altitude = HAWK_ALTITUDE.suspicious
  } else if (body.state === 'search') {
    const point = trail ?? mind.lastKnown
    goal.altitude = HAWK_ALTITUDE.search
    // A trail point counts as reached at 1.2, so stop short of that only when there's no trail to finish.
    const near = !point || distance(body, point) < (hawk ? 4 : trail ? 1 : 1.5)
    if (!near) {
      // Meander toward the point instead of beelining.
      goal.heading = heading(body, point!) + Math.sin(time * 1.3 + body.x * 0.1) * 0.5
      goal.speed = trail ? 2.2 : 1.8
    } else {
      // Look around (ground) or circle overhead (hawk) before giving up.
      goal.heading = body.angle + dt * (hawk ? 1.2 : 1.6)
      goal.speed = hawk ? 3 : 0.4
    }
    // Travelling also wears patience down slowly, so a circling hawk drifting off the point still gives up.
    mind.linger -= dt * (near ? 1 : 0.2)
    if (!trail && mind.linger <= 0) {
      body.state = 'patrol'
      mind.bored = STEALTH.boredSeconds
      mind.giveUp = mind.lastKnown
      mind.lastKnown = null
    }
  } else if (context.patrol) {
    goal.heading = context.patrol.heading
    goal.speed = context.patrol.speed
  } else if (mind.bored > 0 && mind.giveUp) {
    goal.heading = heading(mind.giveUp, body)
  }
  // Cruising heights follow the ground so hawks glide over hills instead of into them.
  if (!chased) goal.altitude += context.terrain.heightAt(body.x, body.z)
  mind.bored = Math.max(0, mind.bored - dt)
  steer(body, mind, goal, context.terrain, dt)
  return chased
}

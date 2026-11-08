/**
 * Companion AI (DESIGN §4): follow (formation spots behind the owner, A* with slime hops, mimicry, self-defence,
 * catch-up puff) and stay (hold position, defend, act on the せーの GO).
 */
import { TILE } from '../vocab'
import { angleDiff, dist, fx, heroBy, sfx, tileOf, warpHero, freeSpotNear } from './core'
import { tileCentre } from './stage-data'
import { HOLE_STEP } from './grid'

/** Tile index of a path step (walk, slime hop or mouse-hole exit). */
const stepTile = (p: number) => (p <= HOLE_STEP ? HOLE_STEP - p : p < 0 ? -p - 1 : p)
import type { Hero, Human, Intent, WorldState } from './state'
import type { Telegraph } from './types'
import { NO_INTENT } from './state'
import { JOB_STATS } from './tables'

const SPOTS: [number, number][] = [
  [-36, -32],
  [-36, 32],
  [-66, 0]
]

const RANGE: Record<Hero['job'], number> = { sword: 70, cleric: 62, mage: 5 * TILE, archer: 6 * TILE }

/** Queues the owner's attack/charge onto its following companions (staggered 0.04 s each). */
export function mimic(W: WorldState, owner: Hero, kind: 'attack' | 'hold' | 'release', aim: number): void {
  const comps = companionsOf(W, owner.owner).filter((c) => c !== owner)
  comps.forEach((c, i) => {
    if (dist(c.body.x, c.body.y, owner.body.x, owner.body.y) > 6 * TILE) return
    c.ai.queue.push({ at: W.t + 0.04 * (i + 1), kind, aim })
  })
}

export function companionsOf(W: WorldState, ownerId: string): Hero[] {
  const human = W.humans.find((h) => h.id === ownerId)
  return W.heroes.filter((h) => h.owner === ownerId && (!human || human.ctrl !== h.slot))
}

function nearestEnemy(W: WorldState, h: Hero, range: number): { x: number; y: number; d: number } | undefined {
  let best: { x: number; y: number; d: number } | undefined
  for (const e of W.enemies) {
    if (e.dead || e.state === 'death') continue
    const d = dist(e.x, e.y, h.body.x, h.body.y)
    if (d < range && (!best || d < best.d)) best = { x: e.x, y: e.y, d }
  }
  const b = W.boss
  if (b && b.active && !b.dead) {
    const d = dist(b.x, b.y, h.body.x, h.body.y) - b.r
    if (d < range && (!best || d < best.d)) best = { x: b.x, y: b.y, d }
  }
  return best
}

export function companionIntent(W: WorldState, h: Hero, human: Human | undefined): Intent {
  const it: Intent = { ...NO_INTENT, aim: h.aim }
  const t = W.t
  h.ai.boost = 1
  // Mimicry queue.
  for (const q of h.ai.queue)
    if (q.at <= t) {
      it.aim = q.aim
      if (q.kind === 'attack') it.press = true
      if (q.kind === 'hold') (it.press = true), (h.ai.ownerHeld = true)
      if (q.kind === 'release') (it.release = true), (h.ai.ownerHeld = false)
    }
  h.ai.queue = h.ai.queue.filter((q) => q.at > t)
  it.held = h.ai.ownerHeld
  if (h.ai.goPending) {
    // GO: turn a valve or pull a lever right here, otherwise attack once in the facing direction.
    h.ai.goPending = false
    const part = W.props.find(
      (p) =>
        !p.gone &&
        ((p.kind === 'valve' && p.state === 'off') || (p.kind === 'lever' && p.state === 'off')) &&
        dist(p.x, p.y, h.body.x, h.body.y) < 84
    )
    if (part) it.interact = true
    else {
      it.press = true
      it.aim = h.aim
    }
  }
  if (h.state === 'down' || h.state === 'fall' || h.state === 'tech') return it
  // Step out of danger markers (unless busy with a heavy object or a valve).
  if (h.state !== 'grip' && h.state !== 'carry') {
    const esc = escapeTelegraph(W, h.body.x, h.body.y)
    if (esc) {
      it.mx = esc[0]
      it.my = esc[1]
      return it
    }
  }
  const owner = human ? heroBy(W, human.ctrl) : undefined
  const mode = human?.mode ?? 'stay'
  const ready = t >= h.atkReady
  if (mode === 'stay' || !owner) {
    const anchor = h.anchor ?? { x: h.body.x, y: h.body.y }
    h.anchor = anchor
    const foe = nearestEnemy(W, h, 1.5 * TILE + 16)
    if (foe && ready && !it.press && h.hold === undefined) {
      it.aim = Math.atan2(foe.y - h.body.y, foe.x - h.body.x)
      it.press = true
    }
    if (dist(anchor.x, anchor.y, h.body.x, h.body.y) > 10) steer(W, h, anchor.x, anchor.y, it)
    return it
  }
  h.anchor = undefined
  // Heavy objects: grip with the owner, carry along, release with it.
  const ownerProp = owner.hold !== undefined ? W.props.find((p) => p.id === owner.hold) : undefined
  if (h.hold !== undefined && h.holdKind === 'grip') {
    if (owner.hold !== h.hold) it.interact = true
    else if (ownerProp?.state === 'lifted') (it.mx = owner.intent.mx), (it.my = owner.intent.my)
    return it
  }
  if (h.hold !== undefined && h.holdKind === 'lift') {
    if (owner.hold === undefined) it.interact = true
  }
  if (ownerProp && owner.holdKind === 'grip' && ownerProp.grips.length < 4) {
    const d = dist(ownerProp.x, ownerProp.y, h.body.x, h.body.y)
    if (d < 90) it.interact = true
    else steer(W, h, ownerProp.x, ownerProp.y, it)
    return it
  }
  // Pushing with the owner.
  const formPush = owner.form >= 0 && W.formations[owner.form]?.slots.some((s) => heroBy(W, s)?.pushing)
  if (formPush && h.form === owner.form && Math.hypot(owner.intent.mx, owner.intent.my) > 0.5) {
    it.mx = owner.intent.mx
    it.my = owner.intent.my
    return it
  }
  // Revive a downed ally nearby when no enemy threatens.
  const downed = W.heroes.find((m) => m.state === 'down' && dist(m.body.x, m.body.y, h.body.x, h.body.y) < 6 * TILE)
  if (downed && !nearestEnemy(W, h, 3 * TILE)) {
    if (dist(downed.body.x, downed.body.y, h.body.x, h.body.y) > 20) steer(W, h, downed.body.x, downed.body.y, it)
    return it
  }
  // Self-defence when the owner is idle.
  const ownerIdle = Math.hypot(owner.intent.mx, owner.intent.my) < 0.1
  if (ownerIdle && h.hold === undefined) {
    const foe = nearestEnemy(W, h, 2 * TILE + (h.job === 'mage' || h.job === 'archer' ? 3 * TILE : 0))
    if (foe) {
      it.aim = Math.atan2(foe.y - h.body.y, foe.x - h.body.x)
      if (foe.d > RANGE[h.job]) steer(W, h, foe.x, foe.y, it)
      else if (ready && !it.press && t - h.st > JOB_STATS[h.job].cooldown) it.press = true
      return it
    }
  }
  // Formation spot behind the owner.
  const comps = companionsOf(W, owner.owner)
    .filter((c) => c !== owner)
    .sort((a, b) => a.slot - b.slot)
  const i = Math.max(0, comps.indexOf(h)) % SPOTS.length
  const f = owner.body.facing
  const [bx, by] = SPOTS[i]
  const sx = owner.body.x + Math.cos(f) * bx - Math.sin(f) * by
  const sy = owner.body.y + Math.sin(f) * bx + Math.cos(f) * by
  const dOwner = dist(owner.body.x, owner.body.y, h.body.x, h.body.y)
  // Catch-up puff when far (or stuck) and the owner is reachable.
  const moved = dist(h.ai.lastX, h.ai.lastY, h.body.x, h.body.y)
  if (moved > 24 || dOwner < 2 * TILE) {
    h.ai.stuckT = 0
    h.ai.lastX = h.body.x
    h.ai.lastY = h.body.y
  } else h.ai.stuckT += 1 / 60
  if ((dOwner > 12 * TILE || h.ai.stuckT > 3) && owner.body.z <= 0 && owner.state !== 'fall' && h.hold === undefined) {
    const g = W.grid!
    const reachable = g.path(
      tileOf(h.body.x),
      tileOf(h.body.y),
      tileOf(owner.body.x),
      tileOf(owner.body.y),
      W.species === 'slime',
      6000,
      W.species === 'rat'
    )
    if (reachable || dOwner > 12 * TILE) {
      if (reachable) {
        const spot = g.overlaps(sx, sy, 16, false) ? freeSpotNear(W, owner.body.x, owner.body.y, 2) : { x: sx, y: sy }
        fx(W, 'smoke', h.body.x, h.body.y)
        warpHero(h, spot.x, spot.y)
        fx(W, 'smoke', spot.x, spot.y)
        sfx(W, 'step', spot.x, spot.y)
      }
      h.ai.stuckT = 0
      h.ai.lastX = h.body.x
      h.ai.lastY = h.body.y
      h.ai.path = undefined
      return it
    }
  }
  const dSpot = dist(sx, sy, h.body.x, h.body.y)
  h.ai.boost = dSpot > 90 ? 1.45 : dSpot > 30 ? 1.25 : 1
  if (dSpot > 14) {
    // Aim the spot at the owner when the spot itself is inside a wall.
    const g = W.grid!
    const tx = g.overlaps(sx, sy, 15, false) ? owner.body.x : sx
    const ty = g.overlaps(sx, sy, 15, false) ? owner.body.y : sy
    if (dist(tx, ty, h.body.x, h.body.y) > (tx === sx ? 14 : 40)) steer(W, h, tx, ty, it)
  }
  if (Math.hypot(it.mx, it.my) < 0.1 && !it.press) it.aim = owner.aim
  return it
}

/**
 * The direction out of the nearest active danger marker covering (x, y) (enemy, boss and pet telegraphs), or
 * undefined when the spot is safe.
 */
export function escapeTelegraph(W: WorldState, x: number, y: number): [number, number] | undefined {
  const teles: Telegraph[] = []
  for (const e of W.enemies) if (e.tele && !e.dead) teles.push(e.tele)
  if (W.boss?.active && !W.boss.dead) teles.push(...W.boss.tele)
  if (W.pet && !W.pet.dead) teles.push(...W.pet.tele)
  for (const tl of teles) {
    if (W.t < tl.from || W.t > tl.until) continue
    const pad = 18
    if (tl.kind === 'circle') {
      const d = dist(x, y, tl.x, tl.y)
      if (d < tl.r + pad) return d > 1 ? [(x - tl.x) / d, (y - tl.y) / d] : [1, 0]
    } else if (tl.kind === 'cone') {
      const d = dist(x, y, tl.x, tl.y)
      const a = Math.atan2(y - tl.y, x - tl.x)
      if (d < tl.r + pad && Math.abs(angleDiff(a, tl.a ?? 0)) <= (tl.spread ?? 0) + 0.3)
        return [Math.cos(a), Math.sin(a)]
    } else {
      const a = tl.a ?? 0
      const dx = x - tl.x
      const dy = y - tl.y
      const along = dx * Math.cos(a) + dy * Math.sin(a)
      const side = -dx * Math.sin(a) + dy * Math.cos(a)
      if (along > -pad && along < (tl.len ?? 0) + pad && Math.abs(side) < tl.r / 2 + pad) {
        const s = side >= 0 ? 1 : -1
        return [-Math.sin(a) * s, Math.cos(a) * s]
      }
    }
  }
  return undefined
}

/** Steers toward (x, y): straight when clear, else along an A* path with slime hops. */
export function steer(W: WorldState, h: Hero, x: number, y: number, it: Intent): void {
  const g = W.grid!
  const { body } = h
  const set = (tx: number, ty: number, slow = 1) => {
    const d = dist(tx, ty, body.x, body.y)
    if (d < 1) return
    const k = Math.min(1, d / 24) * slow
    it.mx = ((tx - body.x) / d) * k
    it.my = ((ty - body.y) / d) * k
  }
  if (body.jt >= 0) {
    // Keep the hop going toward its target.
    const p = h.ai.path?.[0]
    if (p !== undefined) set(tileCentre(stepTile(p) % g.w), tileCentre(Math.floor(stepTile(p) / g.w)))
    else set(x, y)
    return
  }
  if (g.lineClear(body.x, body.y, x, y, 15)) {
    h.ai.path = undefined
    set(x, y)
    return
  }
  const goal = g.idx(tileOf(x), tileOf(y))
  if (!h.ai.path || h.ai.goalTile !== goal || W.t - h.ai.pathAt > 0.6) {
    h.ai.path =
      g.path(
        tileOf(body.x),
        tileOf(body.y),
        tileOf(x),
        tileOf(y),
        W.species === 'slime',
        4000,
        W.species === 'rat' && h.hold === undefined
      ) ?? []
    h.ai.goalTile = goal
    h.ai.pathAt = W.t
  }
  const path = h.ai.path
  const here = g.idx(tileOf(body.x), tileOf(body.y))
  while (path.length && stepTile(path[0]) === here) path.shift()
  // Skip ahead when a later waypoint is in straight view.
  while (path.length > 1 && path[0] >= 0 && path[1] >= 0) {
    const n = path[1]
    if (!g.lineClear(body.x, body.y, tileCentre(n % g.w), tileCentre(Math.floor(n / g.w)), 15)) break
    path.shift()
  }
  const next = path[0]
  if (next === undefined) {
    set(x, y)
    return
  }
  const ni = stepTile(next)
  const nx = tileCentre(ni % g.w)
  const ny = tileCentre(Math.floor(ni / g.w))
  if (next >= 0) {
    set(nx, ny)
    return
  }
  if (next <= HOLE_STEP) {
    // Mouse hole: line up with the hole next to this tile and dash into it.
    const hole = (g.holeEntry.get(here) ?? []).find(([, exit]) => exit === ni)?.[0]
    if (hole === undefined) {
      h.ai.path = undefined
      return
    }
    const hx = tileCentre(hole % g.w)
    const hy = tileCentre(Math.floor(hole / g.w))
    const ox = tileCentre(tileOf(body.x))
    const oy = tileCentre(tileOf(body.y))
    const ddx = Math.sign(hx - ox)
    const ddy = Math.sign(hy - oy)
    const lateral = ddx !== 0 ? body.y - oy : body.x - ox
    if (Math.abs(lateral) > 6) {
      set(ddx !== 0 ? body.x : ox, ddy !== 0 ? body.y : oy)
      return
    }
    it.mx = ddx
    it.my = ddy
    if (dist(hx, hy, body.x, body.y) < 70 && body.dashT < 0) it.action = true
    return
  }
  // Slime hop: line up on the take-off tile, then jump toward the landing tile.
  const ox = tileCentre(tileOf(body.x))
  const oy = tileCentre(tileOf(body.y))
  const dx = Math.sign(nx - ox)
  const dy = Math.sign(ny - oy)
  const lateral = dx !== 0 ? body.y - oy : body.x - ox
  if (Math.abs(lateral) > 6) {
    set(dx !== 0 ? body.x : ox, dy !== 0 ? body.y : oy)
    if (dx !== 0) it.mx = 0
    else it.my = 0
    return
  }
  it.mx = dx
  it.my = dy
  const mid = { x: ox + dx * TILE, y: oy + dy * TILE }
  if (dist(mid.x, mid.y, body.x, body.y) < 54) it.action = true
}

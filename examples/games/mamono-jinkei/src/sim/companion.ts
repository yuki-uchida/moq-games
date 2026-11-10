/**
 * Companion AI (DESIGN §4): follow (formation spots behind the owner, A* with slime hops, mimicry, self-defence,
 * catch-up puff) and stay (hold position, defend, act on the せーの GO).
 */
import { TILE } from '../vocab'
import { angleDiff, dist, fx, heroBy, roomOf, sfx, tileOf, warpHero, freeSpotNear } from './core'
import { tileCentre } from './stage-data'
import { FLY_STEP, HOLE_STEP, inRoom } from './grid'

/** Tile index of a path step (walk, slime hop or mouse-hole exit). */
const stepTile = (p: number) => (p <= FLY_STEP ? FLY_STEP - p : p <= HOLE_STEP ? HOLE_STEP - p : p < 0 ? -p - 1 : p)
import type { Hero, Human, Intent, WorldState } from './state'
import type { Telegraph } from './types'
import { NO_INTENT } from './state'
import { DOWN, JOB_STATS } from './tables'

const SPOTS: [number, number][] = [
  [-36, -32],
  [-36, 32],
  [-66, 0]
]

const RANGE: Record<Hero['job'], number> = { sword: 70, cleric: 62, mage: 5 * TILE, archer: 6 * TILE }

/** Queues the owner's attack/charge onto its following companions (staggered 0.04 s each). */
export function mimic(W: WorldState, owner: Hero, kind: 'attack' | 'hold' | 'release' | 'howl', aim: number): void {
  const comps = companionsOf(W, owner.owner).filter((c) => c !== owner)
  const human = W.humans.find((q) => q.id === owner.owner)
  // Howls are echoed only by following companions (a pack answers its leader).
  if (kind === 'howl' && human?.mode !== 'follow') return
  comps.forEach((c, i) => {
    if (dist(c.body.x, c.body.y, owner.body.x, owner.body.y) > 6 * TILE) return
    c.ai.queue.push({ at: W.t + 0.04 * (i + 1), kind, aim })
  })
}

export function companionsOf(W: WorldState, ownerId: string): Hero[] {
  const human = W.humans.find((h) => h.id === ownerId)
  return W.heroes.filter((h) => h.owner === ownerId && (!human || human.ctrl !== h.slot))
}

/** True while the hero stands in an arena room whose fight is on. */
function inActiveArena(W: WorldState, h: Hero): boolean {
  const rooms = W.parsed?.info.rooms
  if (!rooms) return false
  for (const [id, a] of W.arenas) {
    if (a.state !== 'active') continue
    const r = rooms.find((q) => q.id === id)
    if (r && inRoom(r, h.body.x, h.body.y)) return true
  }
  return false
}

function nearestEnemy(W: WorldState, h: Hero, range: number): { x: number; y: number; d: number } | undefined {
  let best: { x: number; y: number; d: number } | undefined
  for (const e of W.enemies) {
    if (e.dead || e.state === 'death') continue
    const d = dist(e.x, e.y, h.body.x, h.body.y)
    if (d < range && (!best || d < best.d)) best = { x: e.x, y: e.y, d }
  }
  for (const m of W.minions) {
    if (m.dead || m.state === 'death') continue
    const d = dist(m.x, m.y, h.body.x, h.body.y)
    if (d < range && (!best || d < best.d)) best = { x: m.x, y: m.y, d }
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
      if (q.kind === 'howl') it.action = true
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
    const stone =
      W.species === 'wolf' &&
      W.props.some(
        (p) =>
          !p.gone &&
          (p.kind === 'moonstone' || p.kind === 'bigmoon') &&
          !p.on &&
          dist(p.x, p.y, h.body.x, h.body.y) < 160
      )
    if (part) it.interact = true
    else if (stone) it.action = true
    else {
      // Crystals and bells within reach: face the nearest one so the strike lands (else the left-behind facing).
      let strike: { x: number; y: number } | undefined
      let best = RANGE[h.job] + 24
      for (const p of W.props) {
        if (p.gone || (p.kind !== 'crystal' && p.kind !== 'bell')) continue
        const d = dist(p.x, p.y, h.body.x, h.body.y)
        if (d < best) (best = d), (strike = p)
      }
      it.press = true
      it.aim = strike ? Math.atan2(strike.y - h.body.y, strike.x - h.body.x) : h.aim
    }
  }
  if (h.state === 'down' || h.state === 'fall' || h.state === 'tech') return it
  // Step out of danger markers (unless busy with a heavy object or a valve).
  if (h.state !== 'grip' && h.state !== 'carry') {
    const esc = escapeTelegraph(W, h.body.x, h.body.y)
    if (esc) {
      it.mx = esc[0]
      it.my = esc[1]
      // Regrouping for the owner's charge: leave the marker on the owner's side (sideways when it lies beyond).
      const lead = human?.mode === 'follow' ? heroBy(W, human.ctrl) : undefined
      if (lead && lead !== h && lead.holdAt >= 0 && lead.intent.held) {
        const d = dist(lead.body.x, lead.body.y, h.body.x, h.body.y) || 1
        const ox = (lead.body.x - h.body.x) / d
        const oy = (lead.body.y - h.body.y) / d
        const side = -esc[1] * ox + esc[0] * oy >= 0 ? 1 : -1
        let vx = esc[0] + ox
        let vy = esc[1] + oy
        if (vx * esc[0] + vy * esc[1] < 0.3) (vx = esc[0] * 0.3 - esc[1] * side), (vy = esc[1] * 0.3 + esc[0] * side)
        const n = Math.hypot(vx, vy) || 1
        it.mx = vx / n
        it.my = vy / n
        if (!(lead.form >= 0 && h.form === lead.form)) h.ai.boost = 2
      }
      return it
    }
  }
  const owner = human ? heroBy(W, human.ctrl) : undefined
  const mode = human?.mode ?? 'stay'
  const ready = t >= h.atkReady
  if (mode === 'stay' || !owner) {
    // Puffed into a locked arena: fight it out inside (no walking back to a wait spot behind the wind wall), then
    // wait wherever the fight ends.
    if (inActiveArena(W, h)) {
      h.anchor = undefined
      const foe = nearestEnemy(W, h, 16 * TILE)
      if (foe) {
        it.aim = Math.atan2(foe.y - h.body.y, foe.x - h.body.x)
        if (foe.d > RANGE[h.job]) steer(W, h, foe.x, foe.y, it)
        else if (ready && !it.press && h.hold === undefined && t - h.st > JOB_STATS[h.job].cooldown) it.press = true
      }
      return it
    }
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
  // The owner is charging and this companion is out of its formation: regroup so the technique can go off (a revive
  // under way comes first). Companions already in the formation carry on as usual.
  const rally =
    owner.holdAt >= 0 &&
    owner.intent.held &&
    owner.hold === undefined &&
    h.hold === undefined &&
    !(owner.form >= 0 && h.form === owner.form)
  // Revive a downed ally nearby when no enemy threatens.
  const downed = W.heroes.find((m) => m.state === 'down' && dist(m.body.x, m.body.y, h.body.x, h.body.y) < 6 * TILE)
  const reviving = !!downed && dist(downed.body.x, downed.body.y, h.body.x, h.body.y) <= DOWN.reviveDist + 8
  if (downed && (!rally || reviving) && !nearestEnemy(W, h, 3 * TILE)) {
    if (dist(downed.body.x, downed.body.y, h.body.x, h.body.y) > 20) steer(W, h, downed.body.x, downed.body.y, it)
    return it
  }
  // Self-defence when the owner is idle (not while regrouping for a charge).
  const ownerIdle = Math.hypot(owner.intent.mx, owner.intent.my) < 0.1
  if (ownerIdle && h.hold === undefined && !rally) {
    const foe = nearestEnemy(W, h, 2 * TILE + (h.job === 'mage' || h.job === 'archer' ? 3 * TILE : 0))
    if (foe) {
      it.aim = Math.atan2(foe.y - h.body.y, foe.x - h.body.x)
      if (foe.d > RANGE[h.job]) steer(W, h, foe.x, foe.y, it)
      else if (ready && !it.press && t - h.st > JOB_STATS[h.job].cooldown) it.press = true
      return it
    }
  }
  // Formation spot behind the owner (tile spots around it where the open-room spots do not fit).
  const comps = companionsOf(W, owner.owner)
    .filter((c) => c !== owner)
    .sort((a, b) => a.slot - b.slot)
  const dOwner = dist(owner.body.x, owner.body.y, h.body.x, h.body.y)
  // Regrouping from afar for a charge: the nearest way into the formation (just inside its reach, on this side).
  const { x: sx, y: sy } =
    rally && dOwner > 2 * TILE ? rallySpot(W, owner, h, comps.indexOf(h)) : followSpot(W, owner, comps, h)
  // Catch-up puff when far, or stuck (no headway toward the spot for 3 s) and the owner is reachable on foot (or the
  // companion is cut off in the owner's room, e.g. left on a ledge the owner bounced off).
  const headway = dist(h.ai.lastX, h.ai.lastY, sx, sy) - dist(h.body.x, h.body.y, sx, sy)
  if (headway > 24 || dOwner < 2 * TILE || dist(sx, sy, h.body.x, h.body.y) < 30) {
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
      W.species === 'rat',
      W.species === 'crow'
    )
    const ownerRoom = roomOf(W, owner.body.x, owner.body.y)
    const cutOff =
      !reachable && h.ai.stuckT > 3 && ownerRoom !== undefined && roomOf(W, h.body.x, h.body.y)?.id === ownerRoom.id
    if (reachable || cutOff || dOwner > 12 * TILE) {
      if (reachable || cutOff) {
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
  if (rally) {
    // Run back first: no swings and no slow echoed charge on the way.
    it.press = false
    it.held = false
    h.ai.boost = 2
  }
  if (dSpot > 14) steer(W, h, sx, sy, it)
  if (Math.hypot(it.mx, it.my) < 0.1 && !it.press) it.aim = owner.aim
  return it
}

/** Where a far companion heads while the owner charges: 60 px from the owner toward it (spread a little). */
function rallySpot(W: WorldState, owner: Hero, h: Hero, i: number): { x: number; y: number } {
  const a = Math.atan2(h.body.y - owner.body.y, h.body.x - owner.body.x) + (i - 1) * 0.5
  const x = owner.body.x + Math.cos(a) * 60
  const y = owner.body.y + Math.sin(a) * 60
  return W.grid!.overlaps(x, y, 15, false) ? holdBack(owner, h) : { x, y }
}

/** A point 48 px from the owner on the companion's side (it stops there instead of walking into the owner). */
function holdBack(owner: Hero, h: Hero): { x: number; y: number } {
  const d = dist(owner.body.x, owner.body.y, h.body.x, h.body.y)
  if (d <= 48) return { x: h.body.x, y: h.body.y }
  return {
    x: owner.body.x + ((h.body.x - owner.body.x) / d) * 48,
    y: owner.body.y + ((h.body.y - owner.body.y) / d) * 48
  }
}

/** The open-room formation spot of the i-th following companion (rotated with the owner's facing). */
function openSpot(owner: Hero, i: number): { x: number; y: number } {
  const f = owner.body.facing
  const [bx, by] = SPOTS[i % SPOTS.length]
  return {
    x: owner.body.x + Math.cos(f) * bx - Math.sin(f) * by,
    y: owner.body.y + Math.sin(f) * bx + Math.cos(f) * by
  }
}

/**
 * Where a following companion stands. In the open: its spot of the formation behind the owner. Where two of those
 * spots are in a wall or out of the owner's sight (corridors, bridges, doorways), the companions near the owner
 * instead share the free tiles nearest to it (walking distance), each keeping to its own side so that nobody walks
 * through (and shoves) the owner. Pure in the positions, so every companion of the owner computes the same
 * assignment.
 */
export function followSpot(W: WorldState, owner: Hero, comps: readonly Hero[], h: Hero): { x: number; y: number } {
  const g = W.grid!
  const i = Math.max(0, comps.indexOf(h))
  const open = openSpot(owner, i)
  const n = Math.min(comps.length, SPOTS.length)
  let blocked = 0
  for (let k = 0; k < n; k++) {
    const s = openSpot(owner, k)
    if (g.overlaps(s.x, s.y, 15, false) || !g.lineClear(owner.body.x, owner.body.y, s.x, s.y, 15)) blocked++
  }
  // One spot against a wall is fine (that companion just stays clear of the owner); two or more: narrow ground.
  if (blocked < Math.min(2, n)) return g.overlaps(open.x, open.y, 15, false) ? holdBack(owner, h) : open
  // Breadth-first over free tiles around the owner (4-neighbour); each tile remembers its first step (its side).
  const ox = tileOf(owner.body.x)
  const oy = tileOf(owner.body.y)
  if (!g.free(ox, oy)) return open
  const start = g.idx(ox, oy)
  const depth = new Map<number, number>([[start, 0]])
  const side = new Map<number, number>([[start, -1]])
  const tiles: number[] = []
  const queue = [start]
  const DIRS: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ]
  while (queue.length) {
    const cur = queue.shift()!
    const d = depth.get(cur)!
    if (d >= 4) continue
    const cx = cur % g.w
    const cy = Math.floor(cur / g.w)
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx
      const ny = cy + dy
      if (!g.free(nx, ny)) continue
      const ni = g.idx(nx, ny)
      if (depth.has(ni)) continue
      depth.set(ni, d + 1)
      side.set(ni, cur === start ? ni : side.get(cur)!)
      queue.push(ni)
      // Never park on a current or a bounce pad.
      if (!g.flowX[ni] && !g.flowY[ni] && !g.bounce[ni]) tiles.push(ni)
    }
  }
  const centre = (t: number) => ({ x: tileCentre(t % g.w), y: tileCentre(Math.floor(t / g.w)) })
  const tileHere = (c: Hero) => g.idx(tileOf(c.body.x), tileOf(c.body.y))
  // A companion outside this neighbourhood (far behind, or cut off) first walks up to the owner as in the open.
  if (!depth.has(tileHere(h)) || !tiles.length) return g.overlaps(open.x, open.y, 15, false) ? holdBack(owner, h) : open
  const near = comps.filter((c) => depth.has(tileHere(c)))
  // A companion's side: that of its tile (on the owner's tile: of the nearest tile around).
  const sideOf = (c: Hero) => {
    const own = side.get(tileHere(c))!
    if (own >= 0) return own
    let best = -1
    let bd = Infinity
    for (const t of tiles) {
      const p = centre(t)
      const d = dist(p.x, p.y, c.body.x, c.body.y)
      if (d < bd) (bd = d), (best = side.get(t)!)
    }
    return best
  }
  const fx0 = Math.cos(owner.body.facing)
  const fy0 = Math.sin(owner.body.facing)
  const pairs: { c: number; t: number; cost: number }[] = []
  const sides = near.map(sideOf)
  near.forEach((c, ci) => {
    for (const t of tiles) {
      const p = centre(t)
      const ahead = (p.x - owner.body.x) * fx0 + (p.y - owner.body.y) * fy0 > 8 ? 12 : 0
      const cost =
        depth.get(t)! * TILE +
        dist(p.x, p.y, c.body.x, c.body.y) * 0.25 +
        (side.get(t) !== sides[ci] ? 3 * TILE : 0) +
        ahead +
        ci * 0.01
      pairs.push({ c: ci, t, cost })
    }
  })
  pairs.sort((a, b) => a.cost - b.cost || a.c - b.c || a.t - b.t)
  const doneC = new Set<number>()
  const doneT = new Set<number>()
  for (const p of pairs) {
    if (doneC.has(p.c) || doneT.has(p.t)) continue
    doneC.add(p.c)
    doneT.add(p.t)
    if (near[p.c] === h) return centre(p.t)
  }
  return open
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
  for (const m of W.minions) if (m.tele && !m.dead) teles.push(m.tele)
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
  // Over a gap: keep flying (and keep the current route).
  const overGap = !g.walkable(tileOf(body.x), tileOf(body.y))
  if (overGap && W.species === 'crow') it.actionHeld = true
  const aloft = overGap || body.flying
  if ((!h.ai.path || h.ai.goalTile !== goal || W.t - h.ai.pathAt > 0.6) && !aloft) {
    h.ai.path =
      g.path(
        tileOf(body.x),
        tileOf(body.y),
        tileOf(x),
        tileOf(y),
        W.species === 'slime',
        4000,
        W.species === 'rat' && h.hold === undefined,
        W.species === 'crow' && h.hold === undefined
      ) ?? []
    h.ai.goalTile = goal
    h.ai.pathAt = W.t
  }
  const path = h.ai.path ?? []
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
  if (next <= FLY_STEP) {
    // Crow flight: hold Space and head for the landing tile (or vent).
    it.actionHeld = true
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

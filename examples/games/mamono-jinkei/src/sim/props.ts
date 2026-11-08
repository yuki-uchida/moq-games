/**
 * Props: heavy objects (push, lift/throw, grip/carry, DESIGN §8), puzzle parts and conditions (§9), grass and
 * pots, dialogs with E.
 */
import { TILE } from '../vocab'
import { banner, burst, dist, emit, freeSpotNear, fx, heroBy, pop, sfx, shake, tileOf, warpHero } from './core'
import { hitBoss, hitEnemy, hurtHero, setState } from './combat'
import { ACCEPTORS, GRIPPABLE, LIFTABLE, PUSHABLE, footOf, tileCentre, type Cond } from './stage-data'
import { dropItems, rollDrop } from './items'
import type { Enemy, Hero, Prop, Shot, WorldState } from './state'
import { CARRY_SPEED } from './tables'

export { tileCentre }

export function propRect(p: Pick<Prop, 'kind' | 'x' | 'y'>): { x0: number; y0: number; x1: number; y1: number } {
  const [fw, fh] = footOf(p.kind)
  return { x0: p.x - (fw * TILE) / 2, y0: p.y - (fh * TILE) / 2, x1: p.x + (fw * TILE) / 2, y1: p.y + (fh * TILE) / 2 }
}

/** Tiles of a footprint centred at (x, y). */
export function footTiles(kind: string, x: number, y: number): [number, number][] {
  const [fw, fh] = footOf(kind)
  const tx0 = Math.round((x - (fw * TILE) / 2) / TILE)
  const ty0 = Math.round((y - (fh * TILE) / 2) / TILE)
  const out: [number, number][] = []
  for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) out.push([tx0 + i, ty0 + j])
  return out
}

const circleRect = (x: number, y: number, r: number, R: ReturnType<typeof propRect>) => {
  const nx = Math.max(R.x0, Math.min(x, R.x1))
  const ny = Math.max(R.y0, Math.min(y, R.y1))
  return (nx - x) ** 2 + (ny - y) ** 2 < r * r
}

export const partOf = (W: WorldState, id: string) => W.props.find((p) => p.part === id)

export function evalCond(W: WorldState, c: Cond): boolean {
  if ('all' in c) return c.all.every((x) => evalCond(W, x))
  if ('any' in c) return c.any.some((x) => evalCond(W, x))
  if ('on' in c) return !!partOf(W, c.on)?.on
  if ('bells' in c) return W.flags.has(`bells:${c.bells}`)
  if ('clear' in c) return W.arenas.get(c.clear)?.state === 'cleared'
  return W.flags.has(c.flag)
}

export function rebuildSolids(W: WorldState): void {
  W.grid!.setSolidProps(
    W.props
      .filter((p) => !p.gone)
      .map((p) => ({ kind: p.kind, state: p.state, x: p.x, y: p.y, from: p.slide?.from, to: p.slide?.to }))
  )
}

/* ------------------------------------------------------------------------------------------------- hits */

export function hitProp(W: WorldState, p: Prop, slot: number, tech: boolean): boolean {
  if (p.kind === 'grass' && p.state === 'idle') {
    cutGrass(W, p)
    return true
  }
  if (p.kind === 'crystal') {
    hitCrystal(W, p)
    return true
  }
  void slot
  void tech
  return false
}

function cutGrass(W: WorldState, p: Prop): void {
  p.state = 'cut'
  p.st = W.t
  p.goneAt = W.t + 4 / 14
  sfx(W, 'grassCut', p.x, p.y)
  burst(W, 'leaf', p.x, p.y - 16, 6)
  if (p.drop.length) dropItems(W, p.x, p.y, p.drop)
  else rollDrop(W, p.x, p.y, 'grass')
}

function hitCrystal(W: WorldState, p: Prop): void {
  const solved = p.group !== undefined && W.flags.has(`crystals:${p.group}`)
  p.state = 'hit'
  p.st = W.t
  fx(W, 'hit', p.x, p.y - 40)
  if (solved) return
  if (!p.on) sfx(W, 'crystalOn', p.x, p.y)
  p.on = true
  p.onUntil = W.t + 1.5
  if (p.group === undefined) return
  const group = W.props.filter((q) => q.kind === 'crystal' && q.group === p.group)
  if (group.every((q) => q.on)) {
    W.flags.add(`crystals:${p.group}`)
    for (const q of group) q.onUntil = Infinity
    emit(W, 'solve', p.x, p.y, { s: '水晶がそろった！' })
    sfx(W, 'secret', p.x, p.y)
  }
}

/** Technique landing at (x, y) with radius r: breaks crackrocks, presses bigplates. */
export function techImpact(W: WorldState, x: number, y: number, r: number): void {
  for (const p of W.props) {
    if (p.gone) continue
    const R = propRect(p)
    if (p.kind === 'crackrock' && p.state === 'idle' && circleRect(x, y, r, R)) {
      p.state = 'break'
      p.st = W.t
      p.goneAt = W.t + 7 / 14
      sfx(W, 'rockBreak', p.x, p.y)
      burst(W, 'rubble', p.x, p.y, 16)
      shake(W, 8)
      emit(W, 'solve', p.x, p.y, { s: 'ひび割れた岩がくだけた！' })
    }
    if (p.kind === 'bigplate' && !p.on && dist(x, y, p.x, p.y) <= r) pressPlate(W, p, true)
  }
}

function pressPlate(W: WorldState, p: Prop, latch: boolean): void {
  if (!p.on) {
    p.on = true
    p.state = 'on'
    p.st = W.t
    sfx(W, 'plateOn', p.x, p.y)
    if (p.kind === 'bigplate') emit(W, 'solve', p.x, p.y, { s: '大きなスイッチが沈んだ！' })
  }
  if (latch) p.latched = true
}

/* ------------------------------------------------------------------------------------------------- pots */

export function breakPotAt(W: WorldState, p: Prop, x: number, y: number): void {
  p.x = x
  p.y = y
  p.z = 0
  p.state = 'break'
  p.st = W.t
  p.goneAt = W.t + 5 / 16
  p.holder = undefined
  sfx(W, 'potBreak', x, y)
  // Thrown on a mousetrap: it snaps shut harmlessly.
  for (const q of W.props) if (q.kind === 'mousetrap' && q.state === 'idle' && dist(q.x, q.y, x, y) < 48) snapTrap(W, q)
  burst(W, 'shard', x, y, 8)
  if (p.drop.length) dropItems(W, x, y, p.drop)
  else rollDrop(W, x, y, 'pot')
}

/** A thrown pot hit something or landed. */
export function potShotEnd(W: WorldState, s: Shot, target?: Enemy): void {
  const p = W.props.find((q) => q.id === s.prop)
  const o = { slot: s.slot, dmg: 2, kb: 160, sx: s.x - s.vx * 0.05, sy: s.y - s.vy * 0.05 }
  if (target) hitEnemy(W, target, o)
  else if (W.boss && dist(s.x, s.y, W.boss.x, W.boss.y) < W.boss.r + 16) hitBoss(W, W.boss, o)
  if (p) breakPotAt(W, p, s.x, s.y)
}

/* ------------------------------------------------------------------------------------------------- hold */

export function releaseHold(W: WorldState, h: Hero): void {
  if (h.hold === undefined) return
  const p = W.props.find((q) => q.id === h.hold)
  const kind = h.holdKind
  h.hold = undefined
  h.holdKind = undefined
  if (h.state === 'grip' || h.state === 'carry') setState(W, h, 'idle')
  if (!p) return
  if (kind === 'lift') {
    // Dropped in place (downed or switched away).
    const spot = freeSpotNear(W, h.body.x, h.body.y, 2)
    placePot(W, p, spot.x, spot.y)
    return
  }
  p.grips = p.grips.filter((s) => s !== h.slot)
  if (p.state === 'lifted' && p.grips.length < p.weight) dropHeavy(W, p)
}

function placePot(W: WorldState, p: Prop, x: number, y: number): void {
  p.x = x
  p.y = y
  p.z = 0
  p.state = 'idle'
  p.st = W.t
  p.holder = undefined
  sfx(W, 'putDown', x, y)
}

function dropHeavy(W: WorldState, p: Prop): void {
  for (const s of p.grips) {
    const m = heroBy(W, s)
    if (m && m.hold === p.id) {
      m.hold = undefined
      m.holdKind = undefined
      if (m.state === 'carry' || m.state === 'grip') setState(W, m, 'idle')
    }
  }
  p.grips = []
  p.z = 0
  p.state = 'idle'
  p.st = W.t
  sfx(W, 'putDown', p.x, p.y)
  shake(W, 3)
  fx(W, 'dust', p.x, p.y)
  if (!tryDeliver(W, p, 48)) {
    const spot = freeSpotNear(W, p.x, p.y, 4)
    p.x = spot.x
    p.y = spot.y
  }
}

function tryDeliver(W: WorldState, p: Prop, margin: number): boolean {
  for (const ped of W.props) {
    if (!ACCEPTORS.has(ped.kind) || ped.on) continue
    if (ped.accepts && ped.accepts !== p.part) continue
    const R = propRect(ped)
    if (p.x < R.x0 - margin || p.x > R.x1 + margin || p.y < R.y0 - margin || p.y > R.y1 + margin) continue
    p.x = ped.x
    p.y = ped.y
    p.z = 0
    p.state = 'idle'
    p.delivered = true
    p.grips = []
    ped.on = true
    ped.state = 'on'
    ped.st = W.t
    sfx(W, 'secret', ped.x, ped.y)
    burst(W, 'spark', ped.x, ped.y, 12)
    emit(W, 'solve', ped.x, ped.y, { s: 'どんぐりを台座にのせた！' })
    return true
  }
  return false
}

const GRIP_SPOTS: [number, number][] = [
  [0, 1],
  [-1, 0],
  [1, 0],
  [0, -1]
]

function startGrip(W: WorldState, h: Hero, p: Prop): boolean {
  const taken = new Set(
    p.grips.map((s) => heroBy(W, s)).map((m) => (m ? `${Math.round(m.body.x)},${Math.round(m.body.y)}` : ''))
  )
  let best: { x: number; y: number } | undefined
  let bd = Infinity
  for (const [dx, dy] of GRIP_SPOTS) {
    const x = p.x + dx * 46
    const y = p.y + dy * 46
    if (taken.has(`${Math.round(x)},${Math.round(y)}`)) continue
    if (W.grid!.overlaps(x, y, 14, false)) continue
    const d = dist(x, y, h.body.x, h.body.y)
    if (d < bd) (bd = d), (best = { x, y })
  }
  if (!best || p.grips.length >= 4) return false
  p.grips.push(h.slot)
  h.hold = p.id
  h.holdKind = 'grip'
  h.holdAt = -1
  h.charging = h.chargeFull = false
  warpHero(h, best.x, best.y)
  h.body.facing = Math.atan2(p.y - best.y, p.x - best.x)
  setState(W, h, 'grip')
  sfx(W, 'lift', p.x, p.y)
  if (p.grips.length >= p.weight && p.state !== 'lifted') {
    p.state = 'lifted'
    p.st = W.t
    p.z = 40
    for (const s of p.grips) {
      const m = heroBy(W, s)
      if (m) setState(W, m, 'carry')
    }
    sfx(W, 'lift', p.x, p.y)
    pop(W, 'もちあげた！', p.x, p.y - 90, h.slot)
  } else if (p.state === 'lifted') setState(W, h, 'carry')
  else pop(W, `おもい！ ${p.grips.length}/${p.weight}`, p.x, p.y - 80, -1)
  return true
}

/* --------------------------------------------------------------------------------------------- interact */

/** E pressed by a hero. Returns what happened (for the AI and tests). */
export function interact(W: WorldState, h: Hero): string {
  if (h.hold !== undefined) {
    const p = W.props.find((q) => q.id === h.hold)
    if (h.holdKind === 'lift' && p) {
      const a = h.body.facing
      const tx = tileOf(h.body.x + Math.cos(a) * 48)
      const ty = tileOf(h.body.y + Math.sin(a) * 48)
      const g = W.grid!
      const spot =
        g.free(tx, ty) && !heroOn(W, tx, ty)
          ? { x: tileCentre(tx), y: tileCentre(ty) }
          : freeSpotNear(W, h.body.x, h.body.y, 2)
      h.hold = undefined
      h.holdKind = undefined
      placePot(W, p, spot.x, spot.y)
      setState(W, h, 'idle')
      return 'putdown'
    }
    releaseHold(W, h)
    return 'release'
  }
  const P = W.parsed!
  const { x, y } = h.body
  // Talk / read.
  let talk: { key: string; speaker: string; pages: string[]; x: number; y: number } | undefined
  let td = 84
  P.npcs.forEach((n, i) => {
    const d = dist(x, y, n.x, n.y)
    if (d < td) (td = d), (talk = { key: `npc${i}`, speaker: P.info.npcs[i].name, pages: n.pages, x: n.x, y: n.y })
  })
  P.signs.forEach((s, i) => {
    const d = dist(x, y, s.x, s.y)
    if (d < td) (td = d), (talk = { key: `sign${i}`, speaker: 'かんばん', pages: s.pages, x: s.x, y: s.y })
  })
  if (talk) {
    advanceDialog(W, talk)
    return 'talk'
  }
  let best: Prop | undefined
  let bd = Infinity
  for (const p of W.props) {
    if (p.gone) continue
    const d = dist(x, y, p.x, p.y)
    const ok =
      (p.kind === 'lever' && p.state === 'off' && d < 80) ||
      (p.kind === 'chest' && p.state === 'closed' && !p.cond && d < 80) ||
      (LIFTABLE.has(p.kind) && p.state === 'idle' && d < 76) ||
      (GRIPPABLE.has(p.kind) && !p.delivered && p.grips.length < 4 && d < 96) ||
      (p.kind === 'valve' && p.state === 'off' && d < 84)
    if (ok && d < bd) (bd = d), (best = p)
  }
  if (!best) return 'none'
  const p = best
  switch (p.kind) {
    case 'lever':
      p.state = 'pull'
      p.st = W.t
      sfx(W, 'lever', p.x, p.y)
      return 'lever'
    case 'chest':
      openChest(W, p)
      return 'chest'
    case 'barrel':
    case 'pot':
      p.state = 'lifted'
      p.st = W.t
      p.holder = h.slot
      p.z = 40
      h.hold = p.id
      h.holdKind = 'lift'
      h.holdAt = -1
      h.charging = h.chargeFull = false
      sfx(W, 'lift', p.x, p.y)
      return 'lift'
    case 'acorn':
    case 'cheese':
      return startGrip(W, h, p) ? 'grip' : 'none'
    case 'valve':
      startValve(W, h, p)
      return 'valve'
  }
  return 'none'
}

function heroOn(W: WorldState, tx: number, ty: number): boolean {
  return W.heroes.some((m) => tileOf(m.body.x) === tx && tileOf(m.body.y) === ty)
}

function advanceDialog(
  W: WorldState,
  s: { key: string; speaker: string; pages: string[]; x: number; y: number }
): void {
  const d = W.dialogs.find((q) => q.key === s.key)
  sfx(W, 'dialogBlip', s.x, s.y)
  if (!d) {
    W.dialogs.push({
      key: s.key,
      speaker: s.speaker,
      pages: s.pages,
      page: 0,
      text: s.pages[0],
      x: s.x,
      y: s.y - 64,
      until: W.t + 10
    })
    return
  }
  d.page++
  if (d.page >= d.pages.length) W.dialogs = W.dialogs.filter((q) => q !== d)
  else (d.text = d.pages[d.page]), (d.until = W.t + 10)
}

function openChest(W: WorldState, p: Prop): void {
  p.state = 'opening'
  p.st = W.t
  sfx(W, 'chestOpen', p.x, p.y)
}

/** Throws the lifted pot toward `aim`. */
export function throwPot(W: WorldState, h: Hero, aim: number): void {
  const p = W.props.find((q) => q.id === h.hold)
  h.hold = undefined
  h.holdKind = undefined
  if (!p) return
  p.state = 'lifted'
  p.holder = undefined
  W.shots.push({
    id: p.id + 100000,
    kind: p.kind === 'barrel' ? 'barrel' : 'pot',
    x: h.body.x + Math.cos(aim) * 10,
    y: h.body.y + Math.sin(aim) * 10,
    z: 40,
    z0: 40,
    vx: Math.cos(aim) * 380,
    vy: Math.sin(aim) * 380,
    range: 3 * TILE,
    dmg: 2,
    pierce: 0,
    hits: new Set(),
    from: 'hero',
    slot: h.slot,
    burst: 0,
    burstDmg: 0,
    prop: p.id,
    dist: 0,
    dead: false
  })
  p.gone = false
  p.state = 'thrown'
  setState(W, h, 'attack', 0.2)
  sfx(W, 'throw', h.body.x, h.body.y)
}

/** Lifted pots follow their carrier; heavy objects follow their carriers' centroid. */
export function updateHeld(W: WorldState): void {
  for (const p of W.props) {
    if (p.gone) continue
    if (LIFTABLE.has(p.kind) && p.state === 'lifted' && p.holder !== undefined) {
      const h = heroBy(W, p.holder)
      if (!h || h.hold !== p.id) {
        p.holder = undefined
        placePot(W, p, tileCentre(tileOf(p.x)), tileCentre(tileOf(p.y)))
        continue
      }
      p.x = h.body.x
      p.y = h.body.y
      p.z = 40 + h.body.z
    }
    if (!GRIPPABLE.has(p.kind) || p.delivered || !p.grips.length) continue
    // Drop out carriers who went down or strayed.
    for (const s of [...p.grips]) {
      const m = heroBy(W, s)
      const gone = !m || m.hold !== p.id || m.state === 'down' || m.state === 'fall'
      const far = m && p.state === 'lifted' && dist(m.body.x, m.body.y, p.x, p.y) > 120
      if (gone || far) {
        p.grips = p.grips.filter((q) => q !== s)
        if (m && m.hold === p.id) {
          m.hold = undefined
          m.holdKind = undefined
          if (m.state === 'carry' || m.state === 'grip') setState(W, m, 'idle')
        }
      }
    }
    if (p.state === 'lifted') {
      if (p.grips.length < p.weight) {
        dropHeavy(W, p)
        continue
      }
      let cx = 0
      let cy = 0
      for (const s of p.grips) {
        const m = heroBy(W, s)!
        cx += m.body.x
        cy += m.body.y
      }
      p.x = cx / p.grips.length
      p.y = cy / p.grips.length
      p.z = 40
      if (tryDeliverLifted(W, p)) continue
    }
  }
}

function tryDeliverLifted(W: WorldState, p: Prop): boolean {
  const ped = W.props.find((q) => ACCEPTORS.has(q.kind) && !q.on && (!q.accepts || q.accepts === p.part))
  if (!ped || dist(p.x, p.y, ped.x, ped.y) > 56) return false
  for (const s of p.grips) {
    const m = heroBy(W, s)
    if (m) {
      m.hold = undefined
      m.holdKind = undefined
      setState(W, m, 'idle')
    }
  }
  return tryDeliver(W, p, 64)
}

/** Speed multiplier of a hero from what it holds. */
export function holdSpeed(W: WorldState, h: Hero): number {
  if (h.holdKind === 'grip') {
    const p = W.props.find((q) => q.id === h.hold)
    return p?.state === 'lifted' ? CARRY_SPEED : 0
  }
  return h.holdKind === 'lift' ? 0.9 : 1
}

/* ------------------------------------------------------------------------------------------------- push */

const CARD: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1]
]

export function updatePush(W: WorldState, dt: number): void {
  const g = W.grid!
  for (const h of W.heroes) h.pushing = false
  for (const p of W.props) {
    if (p.gone || !PUSHABLE.has(p.kind)) continue
    if (p.state === 'sliding') {
      const s = p.slide!
      const k = Math.min(1, (W.t - s.t0) / s.dur)
      p.x = s.from[0] + (s.to[0] - s.from[0]) * k
      p.y = s.from[1] + (s.to[1] - s.from[1]) * k
      if (k >= 1) {
        p.slide = undefined
        p.x = s.to[0]
        p.y = s.to[1]
        if (s.sink) {
          for (const [tx, ty] of footTiles(p.kind, p.x, p.y)) if (g.sink[g.idx(tx, ty)]) g.fill(g.idx(tx, ty))
          p.gone = true
          p.state = 'idle'
          sfx(W, 'blockSink', p.x, p.y)
          fx(W, 'splash', p.x, p.y)
          burst(W, 'splash', p.x, p.y, 12)
          emit(W, 'solve', p.x, p.y, { s: '岩が沈んで道ができた！' })
        } else {
          p.state = 'idle'
          // A pushed crate springs any mousetrap it lands on.
          for (const q of W.props)
            if (q.kind === 'mousetrap' && q.state === 'idle' && circleRect(q.x, q.y, 8, propRect(p))) snapTrap(W, q)
        }
      }
      continue
    }
    const R = propRect(p)
    let best = -1
    let bestStr = 0
    let pushers: Hero[] = []
    CARD.forEach(([dx, dy], di) => {
      const ps: Hero[] = []
      for (const h of W.heroes) {
        if (!canPush(h)) continue
        const dot = h.intent.mx * dx + h.intent.my * dy
        if (dot < 0.7) continue
        const { x, y } = h.body
        const r = 16 + 6
        const touching =
          dx === 1
            ? x < R.x0 && x + r >= R.x0 && y > R.y0 - 8 && y < R.y1 + 8
            : dx === -1
              ? x > R.x1 && x - r <= R.x1 && y > R.y0 - 8 && y < R.y1 + 8
              : dy === 1
                ? y < R.y0 && y + r >= R.y0 && x > R.x0 - 8 && x < R.x1 + 8
                : y > R.y1 && y - r <= R.y1 && x > R.x0 - 8 && x < R.x1 + 8
        if (touching) ps.push(h)
      }
      if (!ps.length) return
      const set = new Set(ps.map((h) => h.slot))
      for (const h of ps) {
        if (h.form < 0) continue
        for (const s of W.formations[h.form].slots) {
          const m = heroBy(W, s)
          if (m && canPush(m) && m.intent.mx * dx + m.intent.my * dy >= 0.7) set.add(s)
        }
      }
      const str = Math.min(4, set.size)
      if (str > bestStr) (bestStr = str), (best = di), (pushers = ps)
    })
    p.strength = bestStr
    if (best < 0) {
      p.pushT = 0
      continue
    }
    for (const h of pushers) h.pushing = true
    if (best !== p.pushDir) (p.pushDir = best), (p.pushT = 0)
    if (bestStr < p.weight) {
      p.pushT = 0
      if (W.t - p.strainAt > 1) {
        p.strainAt = W.t
        pop(W, `おもい！ ${bestStr}/${p.weight}`, p.x, p.y - 80, -1)
        sfx(W, 'pushStrain', p.x, p.y)
      }
      continue
    }
    p.pushT += dt
    if (p.pushT < 0.3) continue
    p.pushT = 0
    const [dx, dy] = CARD[best]
    const nx = p.x + dx * TILE
    const ny = p.y + dy * TILE
    const old = new Set(footTiles(p.kind, p.x, p.y).map(([a, b]) => `${a},${b}`))
    const entered = footTiles(p.kind, nx, ny).filter(([a, b]) => !old.has(`${a},${b}`))
    let sink = 0
    let ok = true
    for (const [tx, ty] of entered) {
      if (!g.inside(tx, ty)) ok = false
      else {
        const i = g.idx(tx, ty)
        if (g.staticSolid[i] || g.solid[i]) ok = false
        else if (g.sink[i]) sink++
        else if (!g.walk[i]) ok = false
      }
    }
    if (!ok || (sink > 0 && sink < entered.length)) continue
    p.state = 'sliding'
    p.st = W.t
    p.slide = { from: [p.x, p.y], to: [nx, ny], t0: W.t, dur: 0.4, sink: sink > 0 }
    sfx(W, 'blockSlide', p.x, p.y)
    fx(W, 'dust', p.x - dx * 32, p.y - dy * 32)
  }
}

const canPush = (h: Hero) =>
  h.hold === undefined &&
  h.body.z <= 0.01 &&
  h.body.jt < 0 &&
  (h.state === 'idle' || h.state === 'walk' || h.state === 'push')

/* ---------------------------------------------------------------------------------------------- puzzles */

export function updatePuzzles(W: WorldState): void {
  const t = W.t
  for (const p of W.props) {
    if (p.gone) continue
    if (p.goneAt > 0 && t >= p.goneAt) {
      p.gone = true
      continue
    }
    switch (p.kind) {
      case 'plate':
      case 'plate2':
      case 'bigplate': {
        const press = platePressed(W, p)
        if (press) pressPlate(W, p, p.kind === 'bigplate')
        else if (p.on && !p.latched) {
          p.on = false
          p.state = 'off'
          p.st = t
          sfx(W, 'plateOff', p.x, p.y)
        }
        break
      }
      case 'crystal':
        if (p.state === 'hit' && t - p.st >= 0.25) (p.state = p.on ? 'on' : 'off'), (p.st = t)
        if (p.on && t > p.onUntil) {
          p.on = false
          p.state = 'off'
          p.st = t
          sfx(W, 'crystalOff', p.x, p.y)
        }
        break
      case 'lever':
        if (p.state === 'pull' && t - p.st >= 4 / 12) {
          p.state = 'on'
          p.st = t
          p.on = true
          p.latched = true
          emit(W, 'solve', p.x, p.y, { s: 'レバーをひいた！' })
        }
        break
      case 'gate':
      case 'bossdoor':
        updateGate(W, p)
        break
      case 'chest':
        if (p.state === 'closed' && p.cond && evalCond(W, p.cond)) openChest(W, p)
        if (p.state === 'opening' && t - p.st >= 0.4) {
          p.state = 'open'
          p.st = t
          dropItems(W, p.x, p.y + 56, p.drop.length ? p.drop : ['gem'])
          sfx(W, 'secret', p.x, p.y)
        }
        break
      case 'bounce':
        if (p.state === 'boing' && t - p.st >= 0.25) p.state = 'idle'
        break
      case 'valve':
        updateValve(W, p)
        break
      case 'sluice':
        updateSluice(W, p)
        break
      case 'scale':
        break
      case 'mousetrap':
        if (p.state === 'idle') updateMousetrap(W, p)
        break
    }
  }
  // Open sluices stop their current channels.
  const off = W.props.filter((p) => p.kind === 'sluice' && p.state === 'open').flatMap((p) => p.stops)
  const key = [...new Set(off)].sort().join()
  if (key !== W.currentsOff.join()) {
    W.currentsOff = key ? key.split(',') : []
    W.grid!.setStopped(W.currentsOff)
  }
}

function platePressed(W: WorldState, p: Prop): boolean {
  const R = propRect(p)
  let heroes = 0
  for (const h of W.heroes) {
    if (h.state === 'fall' || h.state === 'tech' || h.body.z > 0.01) continue
    if (h.body.x >= R.x0 && h.body.x < R.x1 && h.body.y >= R.y0 && h.body.y < R.y1) heroes++
  }
  let block = 0
  for (const q of W.props) {
    if (q.gone || q === p || !(PUSHABLE.has(q.kind) || GRIPPABLE.has(q.kind)) || q.state === 'lifted') continue
    if (q.x > R.x0 && q.x < R.x1 && q.y > R.y0 && q.y < R.y1) block = Math.max(block, q.weight)
  }
  if (p.kind === 'plate') return heroes > 0 || block > 0
  if (p.kind === 'plate2') return heroes >= 2 || block > 0
  return block >= 4
}

function gateOpenWanted(W: WorldState, p: Prop): boolean {
  if (p.latched) return true
  if (p.lock && W.arenas.get(p.lock)?.state === 'active') return false
  if (p.cond && !evalCond(W, p.cond)) return false
  return true
}

function updateGate(W: WorldState, p: Prop): void {
  const want = gateOpenWanted(W, p)
  const dur = p.kind === 'bossdoor' ? 6 / 8 : 5 / 12
  if (want && p.latch && p.cond) p.latched = true
  if (want && p.state === 'closed') {
    p.state = 'opening'
    p.st = W.t
    sfx(W, p.kind === 'bossdoor' ? 'bossDoor' : 'gateOpen', p.x, p.y)
    if (p.cond && !p.lock)
      emit(W, 'solve', p.x, p.y, { s: p.kind === 'bossdoor' ? 'ボスのとびらがひらいた！' : 'とびらがひらいた！' })
    if (p.kind === 'bossdoor') shake(W, 6)
  } else if (want && p.state === 'opening' && W.t - p.st >= dur) {
    p.state = 'open'
    p.st = W.t
  } else if (!want && p.state !== 'closed') {
    const R = propRect(p)
    const blocked =
      W.heroes.some((h) => circleRect(h.body.x, h.body.y, 16, R)) ||
      W.enemies.some((e) => !e.dead && circleRect(e.x, e.y, e.r, R))
    if (!blocked) {
      p.state = 'closed'
      p.st = W.t
      sfx(W, 'gateClose', p.x, p.y)
    }
  }
}

export function bounceAt(W: WorldState, x: number, y: number): void {
  const tx = tileOf(x)
  const ty = tileOf(y)
  for (const p of W.props)
    if (p.kind === 'bounce' && tileOf(p.x) === tx && tileOf(p.y) === ty) {
      p.state = 'boing'
      p.st = W.t
      sfx(W, 'bounce', p.x, p.y)
    }
}

export { banner }

/* ------------------------------------------------------------------------------------------- stage 2 parts */

export const VALVE = { turn: 1, window: 1.5 }

/** E on a valve: the hero turns it for 1 s (moving away or letting go cancels). */
function startValve(W: WorldState, h: Hero, p: Prop): void {
  p.state = 'turn'
  p.st = W.t
  p.holder = h.slot
  h.holdAt = -1
  h.charging = h.chargeFull = false
  h.body.vx = h.body.vy = 0
  h.body.facing = Math.atan2(p.y - h.body.y, p.x - h.body.x)
  setState(W, h, 'grip')
  sfx(W, 'lever', p.x, p.y)
}

function updateValve(W: WorldState, p: Prop): void {
  const t = W.t
  if (p.state === 'turn') {
    const h = p.holder !== undefined ? heroBy(W, p.holder) : undefined
    const human = h ? W.humans.find((q) => q.id === h.owner) : undefined
    const letGo = human && human.ctrl === h!.slot && human.input.interactHeld === false
    if (!h || h.state !== 'grip' || Math.hypot(h.intent.mx, h.intent.my) > 0.5 || letGo) {
      p.state = 'off'
      p.st = t
      p.holder = undefined
      if (h && h.state === 'grip' && h.hold === undefined) setState(W, h, 'idle')
      return
    }
    if (t - p.st >= VALVE.turn) {
      p.state = 'on'
      p.st = t
      p.on = true
      p.onUntil = p.group ? t + VALVE.window : Infinity
      p.holder = undefined
      setState(W, h, 'idle')
      sfx(W, 'lever', p.x, p.y)
      fx(W, 'drip', p.x, p.y)
      if (p.group) {
        const group = W.props.filter((q) => q.kind === 'valve' && q.group === p.group)
        if (group.every((q) => q.on)) {
          W.flags.add(`valves:${p.group}`)
          for (const q of group) q.onUntil = Infinity
          emit(W, 'solve', p.x, p.y, { s: 'バルブがそろった！' })
          sfx(W, 'secret', p.x, p.y)
        }
      } else emit(W, 'solve', p.x, p.y, { s: 'バルブをまわした！' })
    }
    return
  }
  if (p.state === 'on' && t > p.onUntil) {
    p.state = 'off'
    p.st = t
    p.on = false
    sfx(W, 'crystalOff', p.x, p.y)
  }
}

function updateSluice(W: WorldState, p: Prop): void {
  const want = p.latched || (p.cond ? evalCond(W, p.cond) : false)
  if (want && p.latch) p.latched = true
  if (want && p.state === 'closed') {
    p.state = 'opening'
    p.st = W.t
    sfx(W, 'gateOpen', p.x, p.y)
    emit(W, 'solve', p.x, p.y, { s: '水門がひらいて流れが止まった！' })
    burst(W, 'splash', p.x, p.y, 10)
  } else if (p.state === 'opening' && W.t - p.st >= 5 / 10) {
    p.state = 'open'
    p.st = W.t
  } else if (!want && p.state === 'open') {
    p.state = 'closed'
    p.st = W.t
    sfx(W, 'gateClose', p.x, p.y)
  }
}

function snapTrap(W: WorldState, p: Prop): void {
  p.state = 'snap'
  p.st = W.t
  sfx(W, 'stun', p.x, p.y)
  fx(W, 'snare_snap', p.x, p.y)
}

function updateMousetrap(W: WorldState, p: Prop): void {
  const R = propRect(p)
  for (const h of W.heroes) {
    if (h.state === 'tech' || h.state === 'down' || h.state === 'fall' || h.body.z > 0.01) continue
    if (h.body.dashT >= 0 && h.body.dashT <= 0.22) continue
    const { x, y } = h.body
    if (x < R.x0 + 8 || x > R.x1 - 8 || y < R.y0 + 8 || y > R.y1 - 8) continue
    snapTrap(W, p)
    h.inv = 0
    hurtHero(W, h, 1, p.x, p.y - 10, 0)
    h.snared = Math.max(h.snared, W.t + 1.5)
    pop(W, 'パチン！', p.x, p.y - 60, -1)
    return
  }
}

/** The stampede's head at (x, y): gnaws through barricades within r. Returns true when one broke. */
export function gnawAt(W: WorldState, x: number, y: number, r: number): boolean {
  let any = false
  for (const p of W.props) {
    if (p.gone || p.kind !== 'barricade' || p.state !== 'idle') continue
    if (!circleRect(x, y, r, propRect(p))) continue
    p.state = 'break'
    p.st = W.t
    p.goneAt = W.t + 7 / 14
    sfx(W, 'gnaw', p.x, p.y)
    emit(W, 'fx', p.x, p.y, { s: 'gnaw_chips' })
    burst(W, 'rubble', p.x, p.y, 12)
    emit(W, 'solve', p.x, p.y, { s: 'バリケードをかじりやぶった！' })
    any = true
  }
  return any
}

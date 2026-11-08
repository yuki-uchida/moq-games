/**
 * Co-op technique framework (DESIGN §7) and the slime's ジャンボ・プレス (`jumbo`). Other species' techniques
 * plug into TECHS with the same start/update shape.
 */
import { TILE } from '../vocab'
import { dist, emit, freeSpotNear, fx, heroBy, newId, sfx, shake, stop, turnOf, warpHero } from './core'
import { healHero, hitArc, hitBoss, hitEnemy, setState } from './combat'
import { gnawAt, packImpact, propRect, releaseHold, spinWindmills, techImpact } from './props'
import { packBoss } from './boss4'
import { pullDown } from './boss3'
import { hitMinions } from './minions'
import { hitPet } from './boss2'
import { hitSnares } from './enemies'
import type { Hero, Tech, WorldState } from './state'
import { CHARGE, JUMBO, PACK, SPECIES_TECH, STAMPEDE, TECH_NAMES, TORNADO } from './tables'
import type { TechKind } from './types'

interface TechImpl {
  /** Start point (cx, cy) and target (tx, ty) for a formation centred at (fx, fy), released by `h`. */
  aim(
    W: WorldState,
    fx: number,
    fy: number,
    h: Hero,
    aim: number,
    aimDist: number
  ): { cx: number; cy: number; tx: number; ty: number }
  update(W: WorldState, t: Tech): boolean
}

/** Starts the species technique for `h`'s formation. Returns false when not possible. */
export function startTech(W: WorldState, h: Hero, aim: number, aimDist: number): boolean {
  if (h.form < 0) return false
  const f = W.formations[h.form]
  if (f.slots.length < 2 || W.techs.some((t) => t.slots.some((s) => f.slots.includes(s)))) return false
  const kind: TechKind = SPECIES_TECH[W.species]
  const impl = TECHS[kind]
  if (!impl) return false
  const tier = Math.min(4, f.slots.length) as 2 | 3 | 4
  const members = f.slots.map((s) => heroBy(W, s)!).filter(Boolean)
  for (const m of members) {
    releaseHold(W, m)
    m.holdAt = -1
    m.charging = m.chargeFull = false
    m.body.jt = -1
    m.body.z = 0
    m.body.vx = m.body.vy = m.body.kx = m.body.ky = 0
    setState(W, m, 'tech')
    m.stats.techs++
  }
  const { cx, cy, tx, ty } = impl.aim(W, f.x, f.y, h, aim, aimDist)
  const t: Tech = {
    id: newId(W),
    kind,
    tier,
    slots: [...f.slots],
    stage: 'form',
    st: W.t,
    x: cx,
    y: cy,
    z: 0,
    cx,
    cy,
    tx,
    ty,
    a: aim,
    starts: members.map((m) => ({ slot: m.slot, x: m.body.x, y: m.body.y })),
    landed: false
  }
  if (kind === 'stampede') {
    t.line = [
      h.slot,
      ...members
        .filter((m) => m !== h)
        .sort((a, b) => dist(a.body.x, a.body.y, cx, cy) - dist(b.body.x, b.body.y, cx, cy))
        .map((m) => m.slot)
    ]
    t.hit = new Set()
    t.dur = STAMPEDE.dur[tier] * Math.max(0.3, dist(cx, cy, tx, ty) / STAMPEDE.len[tier])
  }
  W.techs.push(t)
  W.party.techs++
  emit(W, 'tech', f.x, f.y, { a: tier, s: TECH_NAMES[kind] })
  emit(W, 'banner', f.x, f.y, { s: TECH_NAMES[kind] })
  sfx(W, 'coopStart', f.x, f.y)
  sfx(
    W,
    kind === 'stampede' ? 'ratSqueak' : kind === 'tornado' ? 'crowCaw' : kind === 'pack' ? 'wolfHowl' : 'jumboForm',
    f.x,
    f.y
  )
  return true
}

export function updateTechs(W: WorldState): void {
  W.techs = W.techs.filter((t) => TECHS[t.kind]!.update(W, t))
}

const jumbo: TechImpl = {
  aim(W, fx, fy, _h, aim, aimDist) {
    // Aim point ≤ 4 tiles from the centroid, pulled back to the last free ground point along the ray.
    const want = Math.max(TILE, Math.min(JUMBO.range, aimDist))
    const g = W.grid!
    let tx = fx
    let ty = fy
    for (let d = 8; d <= want; d += 8) {
      const x = fx + Math.cos(aim) * d
      const y = fy + Math.sin(aim) * d
      if (g.shotBlocked(x, y)) break
      if (!g.overlaps(x, y, 20, false)) (tx = x), (ty = y)
    }
    return { cx: fx, cy: fy, tx, ty }
  },
  update(W, t) {
    const el = W.t - t.st
    const members = t.slots.map((s) => heroBy(W, s)).filter((m): m is Hero => !!m)
    if (t.stage === 'form') {
      const k = Math.min(1, el / JUMBO.form)
      for (const m of members) {
        const s = t.starts.find((q) => q.slot === m.slot)!
        m.body.x = s.x + (t.cx - s.x) * k
        m.body.y = s.y + (t.cy - s.y) * k
      }
      if (el >= JUMBO.form) {
        t.stage = 'jump'
        t.st = W.t
        sfx(W, 'slimeJump', t.x, t.y)
      }
    } else if (t.stage === 'jump') {
      const k = Math.min(1, el / JUMBO.jump)
      t.x = t.cx + (t.tx - t.cx) * k
      t.y = t.cy + (t.ty - t.cy) * k
      t.z = 4 * JUMBO.height * k * (1 - k)
      for (const m of members) (m.body.x = t.x), (m.body.y = t.y), (m.body.z = t.z)
      if (el >= JUMBO.jump) {
        t.stage = 'land'
        t.st = W.t
        t.z = 0
        land(W, t, members)
      }
    } else {
      for (const m of members) (m.body.x = t.x), (m.body.y = t.y), (m.body.z = 0)
      if (el >= JUMBO.land) {
        finish(W, t, members)
        return false
      }
    }
    return true
  }
}

function land(W: WorldState, t: Tech, members: Hero[]): void {
  const r = JUMBO.radius[t.tier]
  const jobs = new Set(members.map((m) => m.job))
  const dmg = JUMBO.dmg[t.tier] * (jobs.has('sword') ? 1.2 : 1)
  const slot = t.slots[0]
  hitArc(W, t.x, t.y, r, 0, Math.PI, {
    slot,
    dmg,
    kb: 260,
    sx: t.x,
    sy: t.y,
    tech: true,
    heavy: true,
    stun: JUMBO.stun
  })
  techImpact(W, t.x, t.y, r)
  sfx(W, 'jumboSlam', t.x, t.y)
  fx(W, 'shock', t.x, t.y)
  fx(W, 'bigburst', t.x, t.y - 20)
  emit(W, 'burst', t.x, t.y, { s: 'dust', a: 20 })
  shake(W, 6 + t.tier * 3)
  stop(W, 90)
  // Job contributions.
  if (jobs.has('archer')) {
    const targets = W.enemies
      .filter((e) => !e.dead && e.state !== 'death' && dist(e.x, e.y, t.x, t.y) < 6 * TILE)
      .slice(0, 4)
    for (const e of targets) {
      hitArc(W, e.x, e.y, 4, 0, Math.PI, {
        slot: heroOf(members, 'archer'),
        dmg: 2,
        kb: 60,
        sx: e.x,
        sy: e.y - 1,
        tech: true
      })
      fx(W, 'arrow_4', e.x, e.y - 30)
    }
    if (targets.length) sfx(W, 'arrowHit', t.x, t.y)
  }
}

const heroOf = (members: Hero[], job: Hero['job']) => members.find((m) => m.job === job)?.slot ?? members[0].slot

function finish(W: WorldState, t: Tech, members: Hero[]): void {
  const jobs = new Set(members.map((m) => m.job))
  if (jobs.has('mage')) {
    hitArc(W, t.x, t.y, 70, 0, Math.PI, {
      slot: heroOf(members, 'mage'),
      dmg: 3,
      kb: 160,
      sx: t.x,
      sy: t.y,
      tech: true
    })
    fx(W, 'burst', t.x, t.y - 20)
    sfx(W, 'magicHit', t.x, t.y)
  }
  const g = W.grid!
  members.forEach((m, i) => {
    const a = t.a + Math.PI + (i / members.length) * Math.PI * 2
    let x = t.x
    let y = t.y
    for (const d of [48, 36, 24, 12, 0]) {
      const px = t.x + Math.cos(a) * d
      const py = t.y + Math.sin(a) * d
      if (!g.overlaps(px, py, 16, false)) {
        x = px
        y = py
        break
      }
    }
    const out = g.pushOut(x, y, 16, false)
    warpHero(m, out.x, out.y)
    m.body.z = 0
    m.chargeLock = W.t + CHARGE.lockout
    m.inv = Math.max(m.inv, W.t + 0.4)
    setState(W, m, 'idle')
    fx(W, 'dust', out.x, out.y)
  })
  if (jobs.has('cleric')) {
    const c = members.find((m) => m.job === 'cleric')
    for (const m of members) healHero(W, m, 2, c)
    sfx(W, 'heal', t.x, t.y)
  }
  sfx(W, 'coopFinish', t.x, t.y)
}

const stampede: TechImpl = {
  aim(W, _fx, _fy, h, aim) {
    // Runs from the releaser along the aim; walls and solids stop it, barricades are gnawed through.
    const g = W.grid!
    const tier = Math.min(4, W.formations[h.form].slots.length)
    const cx = h.body.x
    const cy = h.body.y
    let tx = cx
    let ty = cy
    const bars = W.props.filter((p) => p.kind === 'barricade' && p.state === 'idle' && !p.gone).map(propRect)
    const inBar = (x: number, y: number) =>
      bars.some((R) => x > R.x0 - 20 && x < R.x1 + 20 && y > R.y0 - 20 && y < R.y1 + 20)
    for (let d = 8; d <= STAMPEDE.len[tier]; d += 8) {
      const x = cx + Math.cos(aim) * d
      const y = cy + Math.sin(aim) * d
      if (g.overlaps(x, y, 14, false) && !inBar(x, y)) break
      tx = x
      ty = y
    }
    // Do not end inside a barricade.
    while (inBar(tx, ty) && dist(tx, ty, cx, cy) > 8) (tx -= Math.cos(aim) * 8), (ty -= Math.sin(aim) * 8)
    return { cx, cy, tx, ty }
  },
  update(W, t) {
    const el = W.t - t.st
    const line = (t.line ?? t.slots).map((s) => heroBy(W, s)).filter((m): m is Hero => !!m)
    const dx = Math.cos(t.a)
    const dy = Math.sin(t.a)
    const place = (head: number) =>
      line.forEach((m, i) => {
        const d = Math.max(0, head - i * STAMPEDE.spacing)
        m.body.x = t.cx + dx * d
        m.body.y = t.cy + dy * d
        m.body.z = 0
        m.body.facing = t.a
      })
    const total = dist(t.cx, t.cy, t.tx, t.ty)
    if (t.stage === 'form') {
      // Line up behind the releaser.
      const k = Math.min(1, el / STAMPEDE.form)
      line.forEach((m, i) => {
        const s = t.starts.find((q) => q.slot === m.slot)!
        const gx = t.cx - dx * i * STAMPEDE.spacing
        const gy = t.cy - dy * i * STAMPEDE.spacing
        m.body.x = s.x + (gx - s.x) * k
        m.body.y = s.y + (gy - s.y) * k
      })
      if (el >= STAMPEDE.form) {
        t.stage = 'run'
        t.st = W.t
        sfx(W, 'stampede', t.x, t.y)
      }
    } else if (t.stage === 'run') {
      const k = Math.min(1, el / (t.dur ?? 1))
      const head = total * k
      t.x = t.cx + dx * head
      t.y = t.cy + dy * head
      place(head)
      gnawAt(W, t.x + dx * 24, t.y + dy * 24, 36)
      runHits(W, t, line)
      if (W.seq % 4 === 0)
        emit(W, 'fx', t.x - dx * 40, t.y - dy * 40, { s: 'stampede_dust', a: Math.round(t.a * 100) / 100 })
      if (k >= 1) {
        t.stage = 'end'
        t.st = W.t
      }
    } else {
      place(total)
      if (el >= STAMPEDE.end) {
        finishStampede(W, t, line)
        return false
      }
    }
    return true
  }
}

function runHits(W: WorldState, t: Tech, members: Hero[]): void {
  const jobs = new Set(members.map((m) => m.job))
  const dmg = STAMPEDE.dmg[t.tier] * (jobs.has('sword') ? 1.2 : 1)
  const reach = STAMPEDE.width[t.tier] / 2
  const o = {
    slot: t.slots[0],
    dmg,
    kb: 240,
    sx: t.x - Math.cos(t.a) * 30,
    sy: t.y - Math.sin(t.a) * 30,
    tech: true,
    heavy: true,
    stun: 0.6
  }
  for (const e of W.enemies) {
    if (e.dead || e.state === 'death' || t.hit!.has(e.id)) continue
    if (dist(e.x, e.y, t.x, t.y) > reach + e.r) continue
    t.hit!.add(e.id)
    hitEnemy(W, e, o)
  }
  const c = W.pet
  if (c && !c.dead && !t.hit!.has(c.id) && dist(c.x, c.y, t.x, t.y) <= reach + c.r) {
    t.hit!.add(c.id)
    hitPet(W, c, o)
  }
  const b = W.boss
  if (b && !b.dead && b.active && !t.hit!.has(b.id) && dist(b.x, b.y, t.x, t.y) <= reach + b.r) {
    t.hit!.add(b.id)
    hitBoss(W, b, o)
  }
  if (W.snares.length) hitSnares(W, t.x, t.y, reach, -2)
}

function finishStampede(W: WorldState, t: Tech, members: Hero[]): void {
  const jobs = new Set(members.map((m) => m.job))
  if (jobs.has('mage')) {
    hitArc(W, t.x, t.y, 70, 0, Math.PI, {
      slot: heroOf(members, 'mage'),
      dmg: 3,
      kb: 160,
      sx: t.x,
      sy: t.y,
      tech: true
    })
    fx(W, 'burst', t.x, t.y - 20)
    sfx(W, 'magicHit', t.x, t.y)
  }
  if (jobs.has('archer')) {
    const targets = W.enemies
      .filter((e) => !e.dead && e.state !== 'death' && dist(e.x, e.y, t.x, t.y) < 6 * TILE)
      .slice(0, 4)
    for (const e of targets) {
      hitEnemy(W, e, { slot: heroOf(members, 'archer'), dmg: 2, kb: 60, sx: e.x, sy: e.y - 1, tech: true })
      fx(W, 'arrow_4', e.x, e.y - 30)
    }
  }
  const g = W.grid!
  for (const m of members) {
    const out = g.pushOut(m.body.x, m.body.y, 16, false)
    warpHero(m, out.x, out.y)
    m.body.facing = t.a
    m.chargeLock = W.t + CHARGE.lockout
    m.inv = Math.max(m.inv, W.t + 0.4)
    setState(W, m, 'idle')
  }
  if (jobs.has('cleric')) {
    const c = members.find((m) => m.job === 'cleric')
    for (const m of members) healHero(W, m, 2, c)
    sfx(W, 'heal', t.x, t.y)
  }
  sfx(W, 'coopFinish', t.x, t.y)
}

const tornado: TechImpl = {
  aim(W, fx0, fy0, _h, aim, aimDist) {
    // Centred on the aim point ≤ 5 tiles away (it may hang over the sky); walls stop the ray.
    const g = W.grid!
    const want = Math.max(TILE, Math.min(TORNADO.range, aimDist))
    let tx = fx0
    let ty = fy0
    for (let d = 8; d <= want; d += 8) {
      const x = fx0 + Math.cos(aim) * d
      const y = fy0 + Math.sin(aim) * d
      if (g.shotBlocked(x, y)) break
      tx = x
      ty = y
    }
    return { cx: fx0, cy: fy0, tx, ty }
  },
  update(W, t) {
    const el = W.t - t.st
    const members = t.slots.map((s) => heroBy(W, s)).filter((m): m is Hero => !!m)
    const r = TORNADO.radius[t.tier]
    const circle = (k: number, z: number) =>
      members.forEach((m, i) => {
        const a = W.t * 8 + (i / members.length) * Math.PI * 2
        m.body.x = t.tx + Math.cos(a) * r * 0.5 * k
        m.body.y = t.ty + Math.sin(a) * r * 0.5 * k
        m.body.z = z
      })
    if (t.stage === 'form') {
      // 'rise': members fly up and gather around the aim point.
      t.stage = 'rise'
    }
    if (t.stage === 'rise') {
      const k = Math.min(1, el / TORNADO.rise)
      t.x = t.cx + (t.tx - t.cx) * k
      t.y = t.cy + (t.ty - t.cy) * k
      members.forEach((m) => {
        const s = t.starts.find((q) => q.slot === m.slot)!
        m.body.x = s.x + (t.tx - s.x) * k
        m.body.y = s.y + (t.ty - s.y) * k
        m.body.z = 40 * k
      })
      if (el >= TORNADO.rise) {
        t.stage = 'spin'
        t.st = W.t
        t.x = t.tx
        t.y = t.ty
        t.hit = new Set()
        sfx(W, 'tornado', t.x, t.y)
      }
    } else if (t.stage === 'spin') {
      circle(1, 40)
      const ticks = Math.floor(el / TORNADO.tick)
      if (ticks > (t.hit!.size ? Math.max(...[...t.hit!]) : -1)) {
        t.hit!.add(ticks)
        tornadoTick(W, t, members, r, ticks === 0)
      }
      // Pull enemies in.
      for (const e of W.enemies) {
        if (e.dead || e.state === 'death') continue
        const d = dist(e.x, e.y, t.x, t.y)
        if (d > r * 1.8 || d < 8) continue
        e.kx += ((t.x - e.x) / d) * TORNADO.pull * (1 / 60) * 6
        e.ky += ((t.y - e.y) / d) * TORNADO.pull * (1 / 60) * 6
      }
      if (W.seq % 5 === 0) emit(W, 'burst', t.x, t.y - 40, { s: 'feather', a: 4 })
      if (el >= TORNADO.spin[t.tier]) {
        t.stage = 'end'
        t.st = W.t
      }
    } else {
      circle(1 + el / TORNADO.end, 40 * (1 - el / TORNADO.end))
      if (el >= TORNADO.end) {
        finishTornado(W, t, members)
        return false
      }
    }
    return true
  }
}

function tornadoTick(W: WorldState, t: Tech, members: Hero[], r: number, first: boolean): void {
  const jobs = new Set(members.map((m) => m.job))
  const dmg = TORNADO.dmg * (jobs.has('sword') ? 1.2 : 1)
  hitArc(W, t.x, t.y, r, 0, Math.PI, { slot: t.slots[0], dmg, kb: 0, sx: t.x, sy: t.y + 1, tech: true, heavy: first })
  hitMinions(W, t.x, t.y, r, { slot: t.slots[0], dmg, kb: 0, sx: t.x, sy: t.y, tech: true })
  spinWindmills(W, t.x, t.y, r)
  pullDown(W, t.x, t.y, r)
  if (W.snares.length) hitSnares(W, t.x, t.y, r, -2)
}

function finishTornado(W: WorldState, t: Tech, members: Hero[]): void {
  const jobs = new Set(members.map((m) => m.job))
  if (jobs.has('mage')) {
    hitArc(W, t.x, t.y, 70, 0, Math.PI, {
      slot: heroOf(members, 'mage'),
      dmg: 3,
      kb: 160,
      sx: t.x,
      sy: t.y,
      tech: true
    })
    fx(W, 'burst', t.x, t.y - 20)
    sfx(W, 'magicHit', t.x, t.y)
  }
  if (jobs.has('archer')) {
    const targets = W.enemies
      .filter((e) => !e.dead && e.state !== 'death' && dist(e.x, e.y, t.x, t.y) < 6 * TILE)
      .slice(0, 4)
    for (const e of targets) {
      hitEnemy(W, e, { slot: heroOf(members, 'archer'), dmg: 2, kb: 60, sx: e.x, sy: e.y - 1, tech: true })
      fx(W, 'arrow_4', e.x, e.y - 30)
    }
  }
  // Land around the centre on solid ground.
  members.forEach((m, i) => {
    const a = (i / members.length) * Math.PI * 2
    const spot = freeSpotNear(W, t.x + Math.cos(a) * 40, t.y + Math.sin(a) * 40, 6)
    warpHero(m, spot.x, spot.y)
    m.body.z = 0
    m.body.flying = false
    m.chargeLock = W.t + CHARGE.lockout
    m.inv = Math.max(m.inv, W.t + 0.4)
    setState(W, m, 'idle')
  })
  if (jobs.has('cleric')) {
    const c = members.find((m) => m.job === 'cleric')
    for (const m of members) healHero(W, m, 2, c)
    sfx(W, 'heal', t.x, t.y)
  }
  sfx(W, 'coopFinish', t.x, t.y)
}

const pack: TechImpl = {
  aim(_W, fx0, fy0, _h, aim, aimDist) {
    const d = Math.max(TILE, Math.min(PACK.range, aimDist))
    return { cx: fx0, cy: fy0, tx: fx0 + Math.cos(aim) * d, ty: fy0 + Math.sin(aim) * d }
  },
  update(W, t) {
    const el = W.t - t.st
    const members = t.slots.map((s) => heroBy(W, s)).filter((m): m is Hero => !!m)
    const jobs = new Set(members.map((m) => m.job))
    const bonus = jobs.has('sword') ? 1.2 : 1
    const home = (m: Hero) => t.starts.find((q) => q.slot === m.slot)!
    if (t.stage === 'form') {
      // 'howl': the joint howl at the centroid.
      t.stage = 'howl'
      for (const e of W.enemies)
        if (!e.dead && e.state !== 'death' && dist(e.x, e.y, t.cx, t.cy) <= PACK.range) {
          e.stun = Math.max(e.stun, W.t + PACK.stun)
          e.tele = undefined
        }
      for (const m of W.minions) if (dist(m.x, m.y, t.cx, t.cy) <= PACK.range) m.tele = undefined
      packImpact(W, t.cx, t.cy, PACK.range, t.tier)
      packBoss(W, t.cx, t.cy)
      emit(W, 'fx', t.cx, t.cy, { s: 'howl_wave' })
      emit(W, 'fx', t.cx, t.cy - 60, { s: 'moon' })
      sfx(W, 'packHowl', t.cx, t.cy)
      shake(W, 6)
      // Lunge targets: up to n distinct enemies in range, nearest first (the boss counts as one).
      const cands: { id: number; x: number; y: number; d: number }[] = []
      for (const e of W.enemies)
        if (!e.dead && e.state !== 'death') {
          const d = dist(e.x, e.y, t.cx, t.cy)
          if (d <= PACK.range) cands.push({ id: e.id, x: e.x, y: e.y, d })
        }
      const b = W.boss
      if (b && b.active && !b.dead && dist(b.x, b.y, t.cx, t.cy) <= PACK.range)
        cands.push({ id: b.id, x: b.x, y: b.y, d: dist(b.x, b.y, t.cx, t.cy) - 1000 })
      cands.sort((p, q) => p.d - q.d)
      const pick = cands.slice(0, t.tier)
      t.targets = pick.map((c) => c.id)
      t.points = pick.map((c) => [c.x, c.y])
      t.hit = new Set()
    }
    if (t.stage === 'howl') {
      if (el >= PACK.howl) {
        t.stage = t.points!.length ? 'lunge' : 'wave'
        t.st = W.t
        t.index = 0
      }
      return true
    }
    if (t.stage === 'lunge') {
      const i = Math.min(t.points!.length - 1, Math.floor(el / PACK.lunge))
      const k = (el - i * PACK.lunge) / PACK.lunge
      t.index = i
      const m = members[i % members.length]
      const [px, py] = t.points![i]
      const s = home(m)
      m.body.x = s.x + (px - s.x) * Math.min(1, k)
      m.body.y = s.y + (py - s.y) * Math.min(1, k)
      m.body.facing = Math.atan2(py - s.y, px - s.x)
      // Arrival: strike the target.
      for (let j = 0; j <= i; j++) {
        if (t.hit!.has(j) || (j === i && k < 1)) continue
        t.hit!.add(j)
        const id = t.targets![j]
        const o = {
          slot: members[j % members.length].slot,
          dmg: PACK.lungeDmg[t.tier] * bonus,
          kb: 200,
          sx: t.cx,
          sy: t.cy,
          tech: true,
          heavy: true
        }
        const e = W.enemies.find((q) => q.id === id)
        if (e) hitEnemy(W, e, o)
        else if (W.boss && W.boss.id === id) hitBoss(W, W.boss, o)
        const [tx, ty] = t.points![j]
        emit(W, 'fx', tx, ty - 20, {
          s: `lunge_${turnOf(Math.atan2(ty - home(members[j % members.length]).y, tx - home(members[j % members.length]).x))}`
        })
        sfx(W, 'lunge', tx, ty)
      }
      if (el >= PACK.lunge * t.points!.length) {
        t.stage = 'wave'
        t.st = W.t
        for (const q of members) {
          const s2 = home(q)
          q.body.x = s2.x
          q.body.y = s2.y
        }
      }
      return true
    }
    if (t.stage === 'wave') {
      if (!t.landed) {
        t.landed = true
        const o = {
          slot: t.slots[0],
          dmg: PACK.waveDmg[t.tier] * bonus,
          kb: 240,
          sx: t.cx,
          sy: t.cy,
          tech: true,
          heavy: true
        }
        hitArc(W, t.cx, t.cy, PACK.waveR, t.a, PACK.waveSpread, o)
        packImpact(W, t.cx + Math.cos(t.a) * 60, t.cy + Math.sin(t.a) * 60, PACK.waveR, t.tier)
        emit(W, 'fx', t.cx + Math.cos(t.a) * 80, t.cy + Math.sin(t.a) * 80 - 20, { s: `crescent_${turnOf(t.a)}` })
        sfx(W, 'crescent', t.cx, t.cy)
      }
      if (el >= PACK.wave) {
        t.stage = 'end'
        t.st = W.t
      }
      return true
    }
    if (el >= PACK.end) {
      finishPack(W, t, members)
      return false
    }
    return true
  }
}

function finishPack(W: WorldState, t: Tech, members: Hero[]): void {
  const jobs = new Set(members.map((m) => m.job))
  if (jobs.has('mage')) {
    const x = t.cx + Math.cos(t.a) * 80
    const y = t.cy + Math.sin(t.a) * 80
    hitArc(W, x, y, 70, 0, Math.PI, { slot: heroOf(members, 'mage'), dmg: 3, kb: 160, sx: x, sy: y, tech: true })
    fx(W, 'burst', x, y - 20)
    sfx(W, 'magicHit', x, y)
  }
  if (jobs.has('archer')) {
    const targets = W.enemies
      .filter((e) => !e.dead && e.state !== 'death' && dist(e.x, e.y, t.cx, t.cy) < 6 * TILE)
      .slice(0, 4)
    for (const e of targets) {
      hitEnemy(W, e, { slot: heroOf(members, 'archer'), dmg: 2, kb: 60, sx: e.x, sy: e.y - 1, tech: true })
      fx(W, 'arrow_4', e.x, e.y - 30)
    }
  }
  const g = W.grid!
  for (const m of members) {
    const s = t.starts.find((q) => q.slot === m.slot)!
    const out = g.pushOut(s.x, s.y, 16, false)
    warpHero(m, out.x, out.y)
    m.body.facing = t.a
    m.chargeLock = W.t + CHARGE.lockout
    m.inv = Math.max(m.inv, W.t + 0.4)
    setState(W, m, 'idle')
  }
  if (jobs.has('cleric')) {
    const c = members.find((m) => m.job === 'cleric')
    for (const m of members) healHero(W, m, 2, c)
    sfx(W, 'heal', t.cx, t.cy)
  }
  sfx(W, 'coopFinish', t.cx, t.cy)
}

const TECHS: Partial<Record<TechKind, TechImpl>> = { jumbo, stampede, tornado, pack }

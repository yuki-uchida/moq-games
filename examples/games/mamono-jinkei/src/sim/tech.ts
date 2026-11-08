/**
 * Co-op technique framework (DESIGN §7) and the slime's ジャンボ・プレス (`jumbo`). Other species' techniques
 * plug into TECHS with the same start/update shape.
 */
import { TILE } from '../vocab'
import { dist, emit, fx, heroBy, newId, sfx, shake, stop, warpHero } from './core'
import { healHero, hitArc, setState } from './combat'
import { releaseHold, techImpact } from './props'
import type { Hero, Tech, WorldState } from './state'
import { CHARGE, JUMBO, SPECIES_TECH, TECH_NAMES } from './tables'
import type { TechKind } from './types'

interface TechImpl {
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
  // Aim point ≤ 4 tiles from the centroid, pulled back to the last free ground point along the ray.
  const want = Math.max(TILE, Math.min(JUMBO.range, aimDist))
  const g = W.grid!
  let tx = f.x
  let ty = f.y
  for (let d = 8; d <= want; d += 8) {
    const x = f.x + Math.cos(aim) * d
    const y = f.y + Math.sin(aim) * d
    if (g.shotBlocked(x, y)) break
    if (!g.overlaps(x, y, 20, false)) (tx = x), (ty = y)
  }
  const t: Tech = {
    id: newId(W),
    kind,
    tier,
    slots: [...f.slots],
    stage: 'form',
    st: W.t,
    x: f.x,
    y: f.y,
    z: 0,
    cx: f.x,
    cy: f.y,
    tx,
    ty,
    a: aim,
    starts: members.map((m) => ({ slot: m.slot, x: m.body.x, y: m.body.y })),
    landed: false
  }
  W.techs.push(t)
  W.party.techs++
  emit(W, 'tech', f.x, f.y, { a: tier, s: TECH_NAMES[kind] })
  emit(W, 'banner', f.x, f.y, { s: TECH_NAMES[kind] })
  sfx(W, 'coopStart', f.x, f.y)
  sfx(W, 'jumboForm', f.x, f.y)
  return true
}

export function updateTechs(W: WorldState): void {
  W.techs = W.techs.filter((t) => TECHS[t.kind]!.update(W, t))
}

const jumbo: TechImpl = {
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

const TECHS: Partial<Record<TechKind, TechImpl>> = { jumbo }

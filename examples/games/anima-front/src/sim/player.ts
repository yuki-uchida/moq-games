/**
 * Player bodies (DESIGN §4, §5, §9): creation, movement (accel, jump with coyote time/buffer, dash, species
 * traits, gliding, pads, hook pull), aim pivot and muzzles, revive and the alive/down/away state helpers.
 */
import { ITEMS } from '../data/items'
import type { Hand } from '../data/loadout'
import { BASE_JUMP_VELOCITY, BASE_SPEED, eyeHeight, GRAVITY, SPECIES, shoulderOffset } from '../data/species'
import { drain, spend, syncMaxAnima } from './anima'
import {
  ACCEL_AIR,
  ACCEL_GROUND,
  COYOTE_TIME,
  DASH_COOLDOWN,
  DASH_COST,
  DASH_SPEED,
  DASH_TIME,
  DOWN_SPEED_FACTOR,
  DT,
  GLIDE_FALL,
  GLIDE_FORWARD,
  HARD_LANDING_SPEED,
  HOOK_ARRIVE,
  JUMP_BUFFER,
  LANDING_SLOW_FACTOR,
  LANDING_SLOW_TIME,
  LEAF_DECOY_TIME,
  MAX_PITCH,
  MUZZLE,
  PAD_HEIGHT,
  PAD_RADIUS,
  PAD_RELAUNCH,
  REVIVE_ANIMA,
  REVIVE_COST,
  REVIVE_INVULN,
  REVIVE_RANGE,
  REVIVE_TIME,
  SHIBA_DASH_FACTOR,
  SLIDE_SPEED,
  SLIDE_TIME,
  ZOOM_SPEED_FACTOR
} from './constants'
import { computeBuild, modsOf, sanitizeLoadout } from './loadout'
import { lungeVelocity } from './items/weapons'
import { addProp } from './props'
import { emit, makeStats, type HandSt, type Player, type Side, type Sim } from './state'
import { BTN, neutralPlayerInput, type PlayerConfig } from './types'
import { aimDir, clamp, forwardOf, r3v, rightOf, vdist, type Vec } from './vec'

export function makeHand(hand: Hand, items: (typeof ITEMS)[keyof typeof ITEMS]['id'][]): HandSt {
  return {
    hand,
    items,
    sel: items.length ? 0 : -1,
    want: items.length ? 0 : -1,
    swap: 0,
    seen: 0,
    queue: 0,
    held: false,
    holdT: 0,
    tapRelease: false,
    act: 'idle',
    charge: 0,
    readyAt: 0,
    uses: 0,
    combo: 0,
    comboAt: -10,
    mode: 'idle',
    modeT: 0,
    locks: [],
    lockRef: null,
    lockT: 0,
    bloom: 0,
    emptyAt: -10,
    dir: [0, 0, 1],
    hitSet: null,
    beam: [],
    armed: false,
    until: 0,
    beamTick: 0
  }
}

export function createPlayer(sim: Sim, cfg: PlayerConfig, at: { p: Vec; yaw: number }, side: Side = cfg.team): Player {
  const species = SPECIES[cfg.species] ?? SPECIES.shiba
  const loadout = sanitizeLoadout(cfg.loadout)
  const build = computeBuild(species.id, loadout)
  const input = neutralPlayerInput()
  input.yaw = at.yaw
  const p: Player = {
    id: cfg.id,
    name: cfg.name,
    team: cfg.team,
    side,
    species,
    loadout,
    build,
    bot: cfg.bot,
    brain: null,
    input,
    seenJump: 0,
    seenDash: 0,
    p: [at.p[0], at.p[1], at.p[2]],
    v: [0, 0, 0],
    yaw: at.yaw,
    pitch: 0,
    shoulder: 1,
    r: species.radius,
    h: species.height,
    grounded: true,
    anima: build.maxAnima,
    maxAnima: build.maxAnima,
    online: true,
    infinite: false,
    state: 'alive',
    timer: 0,
    revive: 0,
    revivedBy: undefined,
    reviving: undefined,
    invulnUntil: 0,
    move: 'idle',
    coyote: 0,
    jumpBuf: 0,
    airJumps: 0,
    airDash: true,
    dashT: 0,
    dashReadyAt: 0,
    dashDir: [0, 0, 1],
    slide: false,
    landSlowUntil: 0,
    gliding: false,
    hook: null,
    launched: false,
    padLockUntil: 0,
    hands: [makeHand('R', build.R), makeHand('L', build.L)],
    cloakOn: false,
    cloak: 0,
    attackRevealUntil: 0,
    revealedUntil: 0,
    negateAt: -1,
    lastSpend: -100,
    lastHurt: -100,
    burnLog: [],
    stats: makeStats(),
    damagers: new Map(),
    foe: null,
    spawnP: [at.p[0], at.p[1], at.p[2]],
    spawnYaw: at.yaw,
    walked: 0,
    turned: 0,
    healAcc: { honey: 0, base: 0, at: 0 },
    removed: false
  }
  return p
}

/** Aim pivot (DESIGN §9): feet + eye height + right × shoulder offset × side. */
export function pivotOf(p: Player): Vec {
  const r = rightOf(p.yaw)
  const off = shoulderOffset(p.species) * p.shoulder
  return [p.p[0] + r[0] * off, p.p[1] + eyeHeight(p.species), p.p[2] + r[2] * off]
}

export function aimOf(p: Player): Vec {
  return aimDir(p.yaw, p.pitch)
}

/** Paw muzzle position (offsets in constants.ts, scaled by body height). */
export function muzzleOf(p: Player, hand: Hand): Vec {
  const piv = pivotOf(p)
  const s = p.h / 1.25
  const fromPivot = (hand === 'R' ? 1 : -1) * (p.r + MUZZLE.side * s) - shoulderOffset(p.species) * p.shoulder
  const r = rightOf(p.yaw)
  const f = forwardOf(p.yaw)
  return [
    piv[0] + r[0] * fromPivot + f[0] * MUZZLE.forward * s,
    piv[1] + MUZZLE.up * s,
    piv[2] + r[2] * fromPivot + f[2] * MUZZLE.forward * s
  ]
}

export const wishDir = (p: Player): Vec => {
  let mx = p.input.mx
  let mz = p.input.mz
  const l = Math.hypot(mx, mz)
  if (l > 1) {
    mx /= l
    mz /= l
  }
  const f = forwardOf(p.yaw)
  const r = rightOf(p.yaw)
  return [r[0] * mx + f[0] * mz, 0, r[2] * mx + f[2] * mz]
}

export function maxSpeed(p: Player): number {
  const b = p.build
  let k = p.species.speed * (1 + modsOf(p).speed + (p.online ? b.armorSpeed : 0))
  for (const h of p.hands) {
    if (h.mode === 'shield') {
      const u = ITEMS[h.items[h.sel]]?.use
      if (u?.kind === 'shield') k *= u.moveFactor
    }
    if (h.mode === 'zoom') k *= ZOOM_SPEED_FACTOR
  }
  if (p.state === 'down') k *= DOWN_SPEED_FACTOR
  return BASE_SPEED * Math.max(0.2, k)
}

export function dashCooldown(p: Player): number {
  const shiba = p.species.trait === 'eager' ? SHIBA_DASH_FACTOR : 1
  return Math.max(0.25, DASH_COOLDOWN * shiba * (1 + modsOf(p).dashCooldown))
}

const accelToward = (v: Vec, tx: number, tz: number, a: number) => {
  const dx = tx - v[0]
  const dz = tz - v[2]
  const l = Math.hypot(dx, dz)
  if (l <= a) {
    v[0] = tx
    v[2] = tz
  } else {
    v[0] += (dx / l) * a
    v[2] += (dz / l) * a
  }
}

/** Reads look and edge counters from the input (once per tick, before movement and paws). */
export function readInput(p: Player) {
  const inp = p.input
  const yaw = Number.isFinite(inp.yaw) ? inp.yaw : p.yaw
  const pitch = Number.isFinite(inp.pitch) ? inp.pitch : p.pitch
  p.turned += Math.abs(yaw - p.yaw)
  p.yaw = yaw
  p.pitch = clamp(pitch, -MAX_PITCH, MAX_PITCH)
  p.shoulder = inp.shoulder === -1 ? -1 : 1
  const jd = inp.presses.jump - p.seenJump
  if (jd > 0) p.jumpBuf = JUMP_BUFFER + (jd > 1 ? DT : 0)
  if (jd !== 0) p.seenJump = inp.presses.jump
  const dd = inp.presses.dash - p.seenDash
  if (dd !== 0) p.seenDash = inp.presses.dash
  return { dash: dd > 0 }
}

/** One movement step for a living or downed body. */
export function movePlayer(sim: Sim, p: Player, wantDash: boolean) {
  if (p.state === 'away') return
  const alive = p.state === 'alive'
  const wish = wishDir(p)
  const moving = Math.hypot(wish[0], wish[2]) > 0.05
  const ms = maxSpeed(p) * (sim.time < p.landSlowUntil ? LANDING_SLOW_FACTOR : 1)
  const startP: Vec = [p.p[0], p.p[1], p.p[2]]

  // Dash start.
  if (wantDash && alive && sim.time >= p.dashReadyAt && (p.grounded || p.airDash) && !p.hook) {
    const penguin = p.species.trait === 'bellySlide'
    if (penguin || spend(sim, p, DASH_COST)) {
      const d = moving ? wish : forwardOf(p.yaw)
      const l = Math.hypot(d[0], d[2]) || 1
      p.dashDir = [d[0] / l, 0, d[2] / l]
      p.slide = penguin
      p.dashT = penguin ? SLIDE_TIME : DASH_TIME
      p.dashReadyAt = sim.time + dashCooldown(p) + (penguin ? SLIDE_TIME - DASH_TIME : 0)
      if (!p.grounded) p.airDash = false
      p.gliding = false
      emit(sim, { type: 'dash', who: p.id, slide: penguin })
      if (p.species.trait === 'leafDecoy') {
        addProp(sim, 'leafDecoy', p.p, p.yaw, p.side, {
          until: sim.time + LEAF_DECOY_TIME,
          owner: p.id,
          species: p.species.id
        })
      }
    }
  }

  // Hook pull.
  if (p.hook) {
    const to = p.hook.to
    const c: Vec = [p.p[0], p.p[1] + p.h * 0.5, p.p[2]]
    const d = vdist(c, to)
    p.hook.t += DT
    const gecko = ITEMS.gecko.use
    const pull = gecko?.kind === 'hook' ? gecko.pull : 26
    const maxTime = gecko?.kind === 'hook' ? gecko.maxTime : 1.8
    if (d < HOOK_ARRIVE || p.hook.t > maxTime || p.state !== 'alive') {
      endHook(sim, p)
    } else {
      p.v = [((to[0] - c[0]) / d) * pull, ((to[1] - c[1]) / d) * pull, ((to[2] - c[2]) / d) * pull]
      p.grounded = false
      const before: Vec = [p.p[0], p.p[1], p.p[2]]
      const res = sim.phys.move(p, DT, p.side)
      if ((res.wall || res.ceiling) && vdist(before, p.p) < pull * DT * 0.3) endHook(sim, p)
      finishMove(sim, p, startP)
      return
    }
  }

  const lv = lungeVelocity(p)
  if (lv) {
    p.v[0] = lv[0]
    p.v[2] = lv[2]
    p.v[1] = Math.max(0, p.v[1])
  } else if (p.dashT > 0) {
    p.dashT -= DT
    const sp = p.slide ? SLIDE_SPEED : DASH_SPEED
    p.v[0] = p.dashDir[0] * sp
    p.v[2] = p.dashDir[2] * sp
    if (!p.slide) p.v[1] = 0
    else p.v[1] -= GRAVITY * DT
  } else {
    // Jump (ground / coyote) or the cat's air jump.
    if (p.jumpBuf > 0 && alive) {
      if (p.grounded || p.coyote > 0) {
        p.v[1] = BASE_JUMP_VELOCITY * Math.sqrt(p.species.jump)
        p.grounded = false
        p.coyote = 0
        p.jumpBuf = 0
        p.launched = false
        emit(sim, { type: 'jump', who: p.id, air: false })
      } else if (p.airJumps > 0) {
        p.v[1] = BASE_JUMP_VELOCITY * Math.sqrt(p.species.jump) * 0.92
        p.airJumps--
        p.jumpBuf = 0
        p.launched = false
        if (p.gliding) setGlide(sim, p, false)
        emit(sim, { type: 'jump', who: p.id, air: true })
      }
    }
    p.jumpBuf = Math.max(0, p.jumpBuf - DT)

    // Glide: hold jump while falling (owl free, momonga drains while online).
    const holdJump = (p.input.held & BTN.JUMP) !== 0
    let glide = false
    if (alive && !p.grounded && p.v[1] < 0 && holdJump) {
      if (p.species.trait === 'glide') glide = true
      else if (p.build.glider && p.online) glide = drain(sim, p, ITEMS.momonga.drain ?? 1.2, 'momonga')
    }
    if (glide !== p.gliding) setGlide(sim, p, glide)

    if (p.gliding) {
      const g = ITEMS.momonga.passive
      const fall = g?.kind === 'glide' ? g.fall : GLIDE_FALL
      const fwd = g?.kind === 'glide' ? g.forward : GLIDE_FORWARD
      const d = moving ? wish : forwardOf(p.yaw)
      const l = Math.hypot(d[0], d[2]) || 1
      accelToward(p.v, (d[0] / l) * fwd, (d[2] / l) * fwd, ACCEL_AIR * 1.5 * DT)
      p.v[1] = Math.max(p.v[1] - GRAVITY * DT, -fall)
    } else {
      if (p.grounded) accelToward(p.v, wish[0] * ms, wish[2] * ms, ACCEL_GROUND * DT)
      else if (moving) {
        // Air control never brakes momentum the player is not steering against.
        const cur = Math.hypot(p.v[0], p.v[2])
        const tx = wish[0] * Math.max(ms, cur)
        const tz = wish[2] * Math.max(ms, cur)
        accelToward(p.v, tx, tz, ACCEL_AIR * DT)
      }
      p.v[1] -= GRAVITY * DT
    }
  }

  const wasGrounded = p.grounded
  const res = sim.phys.move(p, DT, p.side)
  if (res.landed) {
    const hard = res.impact > HARD_LANDING_SPEED
    emit(sim, { type: 'land', who: p.id, hard })
    if (hard && p.species.trait !== 'bigJump') p.landSlowUntil = sim.time + LANDING_SLOW_TIME
    p.launched = false
    if (p.gliding) setGlide(sim, p, false)
  }
  if (p.grounded) {
    p.coyote = COYOTE_TIME
    p.airJumps = p.species.trait === 'doubleJump' ? 1 : 0
    p.airDash = true
  } else if (wasGrounded) p.coyote = COYOTE_TIME - DT
  else p.coyote = Math.max(0, p.coyote - DT)

  // Pads (fixed map pads and frog gadgets of this side).
  if (alive && sim.time >= p.padLockUntil && p.v[1] <= 0.5) {
    for (const r of sim.props) {
      if (r.gone || (r.kind !== 'frog' && r.kind !== 'pad')) continue
      if (r.side !== -1 && r.side !== p.side) continue
      const dy = p.p[1] - r.p[1]
      if (dy < -0.2 || dy > PAD_HEIGHT) continue
      if (Math.hypot(p.p[0] - r.p[0], p.p[2] - r.p[2]) > PAD_RADIUS + p.r * 0.5) continue
      launch(sim, p, r.id, r.launchUp, r.launchForward, r.yaw)
      break
    }
  }
  finishMove(sim, p, startP)
}

function finishMove(sim: Sim, p: Player, startP: Vec) {
  p.walked += Math.hypot(p.p[0] - startP[0], p.p[2] - startP[2])
  const hs = Math.hypot(p.v[0], p.v[2])
  p.move = p.hook
    ? 'hook'
    : p.dashT > 0
      ? p.slide
        ? 'slide'
        : 'dash'
      : p.gliding
        ? 'glide'
        : p.launched && !p.grounded
          ? 'launch'
          : !p.grounded
            ? 'air'
            : hs > 0.5
              ? 'run'
              : 'idle'
  void sim
}

export function launch(sim: Sim, p: Player, padId: number, up: number, forward: number, yaw: number) {
  p.v[1] = Math.sqrt(2 * GRAVITY * up)
  const f = forwardOf(yaw)
  p.v[0] = f[0] * forward
  p.v[2] = f[2] * forward
  p.grounded = false
  p.launched = true
  p.airDash = true
  p.airJumps = p.species.trait === 'doubleJump' ? 1 : 0
  p.padLockUntil = sim.time + PAD_RELAUNCH
  p.dashT = 0
  if (p.hook) endHook(sim, p)
  emit(sim, { type: 'launch', who: p.id, pad: padId })
}

function setGlide(sim: Sim, p: Player, on: boolean) {
  p.gliding = on
  emit(sim, { type: 'glide', who: p.id, on })
}

export function endHook(sim: Sim, p: Player) {
  if (!p.hook) return
  emit(sim, { type: 'hook', who: p.id, to: r3v(p.hook.to), done: true })
  p.hook = null
  p.v[0] *= 0.45
  p.v[2] *= 0.45
  p.v[1] = Math.max(p.v[1] * 0.5, 3)
}

// ---------------------------------------------------------------------------------------------------------------
// Revive and state helpers

/** Revive progress for every downed player (DESIGN §5). */
export function reviveTick(sim: Sim) {
  for (const d of sim.players) {
    if (d.state !== 'down') continue
    let rv = d.revivedBy ? sim.players.find((q) => q.id === d.revivedBy) : undefined
    const valid = (q: Player | undefined): boolean =>
      !!q &&
      q.state === 'alive' &&
      q.side === d.side &&
      q !== d &&
      (q.input.held & BTN.INTERACT) !== 0 &&
      vdist(q.p, d.p) <= REVIVE_RANGE
    if (!valid(rv)) {
      if (rv) rv.reviving = undefined
      rv = sim.players.find((q) => valid(q) && (q.reviving === undefined || q.reviving === d.id))
      d.revive = 0
      d.revivedBy = undefined
      if (rv) {
        d.revivedBy = rv.id
        rv.reviving = d.id
        emit(sim, { type: 'reviveStart', who: d.id, by: rv.id })
      }
    }
    if (!rv) continue
    d.revive += DT / REVIVE_TIME
    if (d.revive >= 1) {
      const cost = Math.min(REVIVE_COST, Math.max(0, rv.anima - 1))
      if (!rv.infinite) {
        rv.anima -= cost
        rv.stats.spent += cost
      }
      rv.reviving = undefined
      rv.stats.revives++
      d.state = 'alive'
      d.revive = 0
      d.revivedBy = undefined
      d.anima = Math.max(1, d.build.maxAnima * REVIVE_ANIMA)
      d.invulnUntil = sim.time + REVIVE_INVULN
      d.online = d.anima / d.build.maxAnima > 0.2
      syncMaxAnima(d)
      emit(sim, { type: 'revive', who: d.id, by: rv.id })
    }
  }
  // Clear stale reviving flags.
  for (const q of sim.players) {
    if (q.reviving && !sim.players.some((d) => d.id === q.reviving && d.state === 'down' && d.revivedBy === q.id))
      q.reviving = undefined
  }
}

/** Stops every hand action and movement extras (on down / warp). */
export function resetActions(sim: Sim, p: Player) {
  for (const h of p.hands) {
    h.mode = 'idle'
    h.act = 'idle'
    h.charge = 0
    h.locks = []
    h.lockRef = null
    h.queue = 0
    h.beam = []
    h.hitSet = null
  }
  if (p.hook) endHook(sim, p)
  p.dashT = 0
  if (p.gliding) setGlide(sim, p, false)
  if (p.cloakOn) {
    p.cloakOn = false
    emit(sim, { type: 'cloak', who: p.id, on: false })
  }
}

export function setDown(sim: Sim, p: Player, time: number) {
  resetActions(sim, p)
  p.state = 'down'
  p.timer = time
  p.revive = 0
  p.revivedBy = undefined
  emit(sim, { type: 'down', who: p.id })
}

export function warpAway(sim: Sim, p: Player, timer: number) {
  resetActions(sim, p)
  emit(sim, { type: 'warp', who: p.id, at: r3v(p.p) })
  p.state = 'away'
  p.timer = timer
  p.revive = 0
  p.revivedBy = undefined
  p.v = [0, 0, 0]
}

export function respawn(sim: Sim, p: Player, at: { p: Vec; yaw: number }, protect: number) {
  p.state = 'alive'
  p.p = [at.p[0], at.p[1], at.p[2]]
  p.v = [0, 0, 0]
  p.yaw = at.yaw
  p.anima = p.maxAnima
  p.online = true
  p.timer = 0
  p.grounded = true
  p.invulnUntil = sim.time + protect
  p.lastHurt = -100
  p.lastSpend = -100
  p.burnLog = []
  p.damagers.clear()
  p.negateAt = -1
  for (const h of p.hands) h.readyAt = sim.time
  emit(sim, { type: 'respawn', who: p.id, at: r3v(p.p) })
}

/**
 * Where a player dropping into a running match appears (DESIGN §18): PvE next to a living squadmate (a free spot
 * on a ring around it), PvP / training the mode's own spawn (the team's base), as a respawn would.
 */
export function dropInSpot(sim: Sim, p: Player): { p: Vec; yaw: number } {
  if (sim.cfg.mode === 'pve') {
    const mates = sim.players.filter((q) => q !== p && q.state === 'alive')
    for (const m of mates) {
      for (let i = 0; i < 8; i++) {
        const a = m.yaw + Math.PI + (i * Math.PI) / 4
        const at = settle(sim, [m.p[0] + Math.sin(a) * 2, m.p[1], m.p[2] + Math.cos(a) * 2], p.r)
        if (Math.abs(at[1] - m.p[1]) > 1.5 || sim.phys.overlaps(at, p.r, p.h)) continue
        return { p: at, yaw: m.yaw }
      }
    }
  }
  return sim.mode.spawnFor(sim, p)
}

/** Squad/team spawn points from the map (with a ring fallback around the first base or the origin). */
export function spawnPoints(sim: Sim, team: number | 'squad'): { p: Vec; yaw: number }[] {
  const list = sim.map.spawns.filter((s) => s.team === team)
  if (list.length) return list.map((s) => ({ p: [s.p[0], s.p[1], s.p[2]] as Vec, yaw: s.yaw }))
  const base = sim.map.bases.find((b) => b.team === team) ?? sim.map.bases[0]
  const c: Vec = base ? [base.p[0], base.p[1], base.p[2]] : [0, 0, 0]
  const out: { p: Vec; yaw: number }[] = []
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + (typeof team === 'number' ? team * 2.1 : 0)
    out.push({ p: [c[0] + Math.sin(a) * 2.5, c[1], c[2] + Math.cos(a) * 2.5], yaw: a + Math.PI })
  }
  return out
}

/** Makes sure a spawn position does not overlap boxes (raises it onto the highest box top under it). */
export function settle(sim: Sim, at: Vec, r: number): Vec {
  const g = sim.phys.groundHeight(at[0], at[2], r, at[1] + 0.5)
  return [at[0], Math.max(at[1], g), at[2]]
}

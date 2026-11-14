/**
 * The deterministic match (DESIGN §1–§2): a fixed 60 Hz step over players, foes, projectiles, props and shards,
 * the mode rules and the bots. `view()` returns a JSON snapshot plus the events since the previous call.
 */
import { DIFFICULTIES } from '../data/enemies'
import { ITEMS } from '../data/items'
import { MISSIONS } from '../data/missions'
import type { World } from './api'
import { animaTick, burnOf } from './anima'
import { botThink } from './bots/index'
import { damageFoe } from './combat'
import { DEFAULT_COUNTDOWN, DT, MAX_PITCH, PVE_PROTECT, PVP_PROTECT, RESULT_HOLD } from './constants'
import { foesTick } from './foes/index'
import { stepBody } from './body'
import { handsTick } from './items/hands'
import { getMap } from './maps'
import { setPhase } from './modes/common'
import { createMode } from './modes/index'
import { Physics, SpatialHash } from './physics'
import { createPlayer, dropInSpot, movePlayer, readInput, resetActions, respawn, reviveTick, warpAway } from './player'
import { hazardsTick, shotsTick } from './projectiles'
import { addProp, propsTick } from './props'
import { Rng } from './rng'
import { shardsTick } from './anima'
import { emit, isOver, type Foe, type Sim } from './state'
import type { MapDef, MatchConfig, PlayerConfig, PlayerInput, View } from './types'
import { buildView } from './view'
import { clamp } from './vec'

/** Field-by-field repair of an input (never trusts the sender). */
export function sanitizeInput(raw: PlayerInput, prev: PlayerInput): PlayerInput {
  const num = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) ? x : d)
  const cnt = (x: unknown, d: number) => {
    const n = num(x, d)
    return n >= 0 ? Math.floor(n) : d
  }
  let mx = clamp(num(raw?.mx, 0), -1, 1)
  let mz = clamp(num(raw?.mz, 0), -1, 1)
  const l = Math.hypot(mx, mz)
  if (l > 1) {
    mx /= l
    mz /= l
  }
  const pr = (raw?.presses ?? {}) as Partial<PlayerInput['presses']>
  return {
    mx,
    mz,
    yaw: num(raw?.yaw, prev.yaw),
    pitch: clamp(num(raw?.pitch, prev.pitch), -MAX_PITCH, MAX_PITCH),
    held: num(raw?.held, 0) & 31,
    presses: {
      r: cnt(pr.r, prev.presses.r),
      l: cnt(pr.l, prev.presses.l),
      jump: cnt(pr.jump, prev.presses.jump),
      dash: cnt(pr.dash, prev.presses.dash)
    },
    selR: Math.floor(num(raw?.selR, prev.selR)),
    selL: Math.floor(num(raw?.selL, prev.selL)),
    shoulder: raw?.shoulder === -1 ? -1 : 1
  }
}

class WorldImpl implements World {
  readonly config: MatchConfig
  readonly map: MapDef
  readonly sim: Sim
  private countdownLeft: number
  private lastCount = -1

  constructor(config: MatchConfig, map?: MapDef) {
    this.config = config
    const variant =
      config.variant ?? (config.mode === 'pve' ? MISSIONS[config.mission ?? 'sakura']?.variant : undefined)
    this.map = map ?? getMap(config.map, variant)
    const diffKey = config.difficulty ?? 'normal'
    const phys = new Physics(this.map)
    const sim: Sim = {
      cfg: config,
      map: this.map,
      phys,
      rng: new Rng(config.seed >>> 0),
      tick: 0,
      time: 0,
      phase: 'countdown',
      phaseAt: 0,
      events: [],
      nextEvent: 1,
      players: [],
      foes: [],
      shots: [],
      props: [],
      shards: [],
      hazards: [],
      nextFoe: 1,
      nextShot: 1,
      nextProp: 1,
      nextShard: 1,
      diff: DIFFICULTIES[diffKey] ?? DIFFICULTIES.normal,
      mode: null as unknown as Sim['mode'],
      foeHash: new SpatialHash<Foe>(6),
      nav: null,
      flow: null,
      variant,
      humans: Math.max(1, config.players.filter((p) => p.bot === undefined).length)
    }
    this.sim = sim
    sim.mode = createMode(config)
    const fu = ITEMS.frog.use
    const frog = fu?.kind === 'pad' ? fu : { launchUp: 13, launchForward: 6 }
    for (const pad of this.map.pads) {
      addProp(sim, 'pad', pad.p, pad.yaw, -1, { launchUp: frog.launchUp, launchForward: frog.launchForward, r: 0.9 })
    }
    for (const cfg of config.players) this.addPlayer(cfg)
    sim.mode.start(sim)
    const cd = config.countdown ?? (config.mode === 'training' ? 0 : DEFAULT_COUNTDOWN)
    this.countdownLeft = Math.max(0, cd)
    if (this.countdownLeft <= 0) setPhase(sim, 'play')
    else emit(sim, { type: 'phase', phase: 'countdown' })
  }

  get tick() {
    return this.sim.tick
  }
  get time() {
    return this.sim.time
  }
  get over() {
    return isOver(this.sim) && this.sim.time - this.sim.phaseAt >= RESULT_HOLD
  }

  /** Seconds left in the countdown (for the view clock). */
  get countdown() {
    return this.countdownLeft
  }

  step(inputs: ReadonlyMap<string, PlayerInput>) {
    const sim = this.sim
    for (const p of sim.players) {
      const inp = inputs.get(p.id)
      if (inp && p.bot === undefined) p.input = sanitizeInput(inp, p.input)
    }
    sim.tick++
    sim.time = sim.tick * DT
    if (sim.phase === 'countdown') {
      this.countdownLeft = Math.max(0, this.countdownLeft - DT)
      const n = Math.ceil(this.countdownLeft)
      if (n !== this.lastCount && n > 0) {
        this.lastCount = n
        emit(sim, { type: 'countdown', n })
      }
      for (const p of sim.players) {
        if (p.bot !== undefined) botThink(sim, p)
        readInput(p)
        for (const h of p.hands) h.seen = h.hand === 'R' ? p.input.presses.r : p.input.presses.l
      }
      if (this.countdownLeft <= 0) setPhase(sim, 'play')
      return
    }
    const playing = sim.phase === 'play'
    for (const p of sim.players) {
      if (p.bot !== undefined && playing) botThink(sim, p)
      if (p.state === 'away') {
        readInput(p)
        handsTick(sim, p)
        continue
      }
      if (playing) {
        stepBody(sim, p)
        animaTick(sim, p)
      } else {
        const { dash } = readInput(p)
        for (const h of p.hands) h.seen = h.hand === 'R' ? p.input.presses.r : p.input.presses.l
        movePlayer(sim, p, dash)
      }
    }
    if (!playing) {
      sim.mode.update(sim)
      return
    }
    this.contactDamage()
    reviveTick(sim)
    foesTick(sim)
    shotsTick(sim)
    hazardsTick(sim)
    propsTick(sim)
    shardsTick(sim)
    sim.mode.update(sim)
    if (sim.tick % 60 === 0) for (const p of sim.players) burnOf(sim, p)
  }

  /** ハリネズミ: foes touching the player take contact damage (0.25 s chunks). */
  private contactDamage() {
    const sim = this.sim
    if (sim.tick % 15 !== 0) return
    for (const p of sim.players) {
      if (p.state !== 'alive' || !p.online || p.build.contactDps <= 0) continue
      for (const f of sim.foeHash.query(p.p[0], p.p[2], 4)) {
        if (f.dead || f.def.boss) continue
        if (Math.hypot(f.p[0] - p.p[0], f.p[2] - p.p[2]) > p.r + f.r + 0.25) continue
        if (Math.abs(f.p[1] - p.p[1]) > 2) continue
        damageFoe(sim, f, {
          amount: p.build.contactDps * 0.25,
          kind: 'contact',
          side: p.side,
          by: p.id,
          item: 'hedgehog',
          at: [f.p[0], f.p[1] + f.h * 0.5, f.p[2]],
          from: p.p
        })
      }
    }
  }

  view(): View {
    const v = buildView(this.sim)
    if (this.sim.phase === 'countdown') v.clock = Math.round(this.countdownLeft * 100) / 100
    return v
  }

  setBot(playerId: string, skill: number | undefined) {
    const p = this.sim.players.find((q) => q.id === playerId)
    if (!p) return
    p.bot = skill === undefined ? undefined : clamp(Number.isFinite(skill) ? skill : 0.5, 0, 1)
    p.brain = null
    this.sim.humans = Math.max(1, this.sim.players.filter((q) => q.bot === undefined).length)
  }

  addPlayer(cfg: PlayerConfig) {
    const sim = this.sim
    if (sim.players.some((p) => p.id === cfg.id)) return
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(cfg.id)) return
    const tmp = createPlayer(sim, cfg, { p: [0, 0, 0], yaw: 0 })
    sim.players.push(tmp)
    const at = sim.mode.spawnFor(sim, tmp)
    tmp.p = [at.p[0], at.p[1], at.p[2]]
    tmp.spawnP = [at.p[0], at.p[1], at.p[2]]
    tmp.yaw = at.yaw
    tmp.spawnYaw = at.yaw
    tmp.input.yaw = at.yaw
    if (sim.cfg.mode === 'training' && sim.cfg.training?.infiniteAnima) tmp.infinite = true
  }

  replace(playerId: string, cfg: PlayerConfig) {
    const sim = this.sim
    const p = sim.players.find((q) => q.id === playerId)
    if (!p) return
    const was = { state: p.state, timer: p.timer }
    // A living body warps out where it stands; a downed / away one keeps its state (no free revive or ticket).
    if (p.state === 'alive') warpAway(sim, p, 0)
    else resetActions(sim, p)
    const { bot: _bot, ...rest } = cfg
    void _bot
    const fresh = createPlayer(sim, { ...rest, id: p.id, team: p.team }, { p: p.p, yaw: p.yaw }, p.side)
    Object.assign(p, fresh, { spawnP: p.spawnP, spawnYaw: p.spawnYaw, infinite: p.infinite })
    for (const q of sim.players) if (q.reviving === p.id) q.reviving = undefined
    this.sim.humans = Math.max(1, sim.players.filter((q) => q.bot === undefined).length)
    if (was.state === 'alive') {
      const protect = sim.cfg.mode === 'pvp' ? PVP_PROTECT : sim.cfg.mode === 'pve' ? PVE_PROTECT : 1
      respawn(sim, p, dropInSpot(sim, p), protect)
      p.input.yaw = p.yaw
    } else {
      p.state = was.state
      p.timer = was.timer
    }
  }

  removePlayer(id: string) {
    const sim = this.sim
    const p = sim.players.find((q) => q.id === id)
    if (!p) return
    p.removed = true
    sim.players = sim.players.filter((q) => q !== p)
    for (const q of sim.players) if (q.reviving === id) q.reviving = undefined
  }
}

export function createWorld(config: MatchConfig): World {
  return new WorldImpl(config)
}

/** Builds a world on a given MapDef (tests and tools; the game uses createWorld). */
export function createWorldOnMap(config: MatchConfig, map: MapDef): World {
  return new WorldImpl(config, map)
}

/** Test/bot access to the internal state (not part of the public contract). */
export function simOf(world: World): Sim {
  return (world as WorldImpl).sim
}

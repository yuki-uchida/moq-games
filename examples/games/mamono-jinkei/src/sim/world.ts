/**
 * The host world: phases, the fixed-step update order and commands. See api.ts for the public surface.
 */
import { JOBS, STAGES, STAGE_NAMES, STAGE_SPECIES, TILE, type StageId } from '../vocab'
import { STAGE_DATA } from '../stages'
import { activateBoss, createBoss, resetBoss, updateBoss } from './boss'
import {
  hitArc,
  hurtHero,
  jobSkill,
  normalAttack,
  setPotHit,
  setReleaseHold,
  setState,
  updateShots,
  healHero,
  heroDown
} from './combat'
import { companionIntent, mimic } from './companion'
import {
  active,
  banner,
  burst,
  dist,
  emit,
  freeSpotNear,
  fx,
  heroBy,
  leader,
  pop,
  pruneEvents,
  roomOf,
  sfx,
  tileOf,
  warpHero
} from './core'
import { spawnEnemy, updateEnemies } from './enemies'
import { updateFormations } from './formation'
import { Grid } from './grid'
import { dropItems, updatePickups } from './items'
import { airborne, MAX_SPEED, newBody, stepBody } from './move'
import { assignSlots, newHuman, pickJob, switchHero, syncPlayers, toggleMode } from './party'
import {
  bounceAt,
  holdSpeed,
  interact,
  potShotEnd,
  rebuildSolids,
  releaseHold,
  throwPot,
  updateHeld,
  updatePuzzles,
  updatePush
} from './props'
import { createRng } from './rng'
import { parseStage, type ParsedStage, type StageData } from './stage-data'
import type { Hero, Human, Prop, WorldState } from './state'
import { NO_INTENT } from './state'
import { CHARGE, CHARGE_SPEED, DOWN, FALL, JOB_STATS } from './tables'
import { startTech, updateTechs } from './tech'
import type { NetInput, InputState, View } from './types'
import { buildView } from './view'
import type { Command, Progress, World, WorldOptions } from './api'

setReleaseHold(releaseHold)
setPotHit((W, s, e) => potShotEnd(W, s, e))

const parsedCache = new Map<StageData, ParsedStage>()
export function parsedOf(data: StageData): ParsedStage {
  let p = parsedCache.get(data)
  if (!p) parsedCache.set(data, (p = parseStage(data)))
  return p
}

export class WorldImpl implements World {
  readonly W: WorldState
  private readonly stages: Partial<Record<StageId, StageData>>
  private readonly skipIntro: boolean

  constructor(options: WorldOptions, stages: Partial<Record<StageId, StageData>> = STAGE_DATA) {
    this.stages = stages
    this.skipIntro = !!options.skipIntro
    this.W = {
      seed: options.seed,
      rng: createRng(options.seed),
      t: 0,
      seq: 0,
      phase: 'lobby',
      phaseAt: 0,
      stage: options.stage ?? 'meadow',
      species: STAGE_SPECIES[options.stage ?? 'meadow'],
      lobbyStage: options.stage ?? 'meadow',
      humans: [],
      heroes: [],
      enemies: [],
      props: [],
      shots: [],
      pickups: [],
      techs: [],
      formations: [],
      prevForms: new Map(),
      events: [],
      nextEvent: 0,
      nextId: 1000,
      party: { gems: 0, keys: 0, techs: 0, kos: 0, time: 0, wipes: 0 },
      dialogs: [],
      flags: new Set(),
      arenas: new Map(),
      checkpoint: '',
      checkpointsReached: new Set(),
      roomsSeen: new Set(),
      bigFormRooms: new Set(),
      cleared: [...options.progress.cleared],
      orbTaken: false
    }
    if (options.stage) this.pendingStart = options.stage
  }

  private pendingStart?: StageId

  /* ------------------------------------------------------------------------------------------- public */

  setPlayers(players: readonly { id: string; name: string }[]): void {
    syncPlayers(this.W, players)
    if (this.pendingStart && this.W.humans.length) {
      const s = this.pendingStart
      this.pendingStart = undefined
      this.startStage(s)
    }
  }

  setInput(playerId: string, input: NetInput | InputState): void {
    const h = this.W.humans.find((q) => q.id === playerId)
    if (!h) return
    const net = input as NetInput
    h.input = { ...input }
    if (net.menu !== undefined) h.menu = net.menu
    if (net.name) h.name = net.name.slice(0, 12)
    if (net.job && this.W.phase === 'lobby') pickJob(this.W, h, net.job)
    if (net.hero) (h.report = net.hero), (h.reportFresh = true)
  }

  command(playerId: string, c: Command): void {
    const W = this.W
    const host = W.humans[0]
    const isHost = host?.id === playerId
    if (c.type === 'warp') {
      if (W.phase === 'play' || W.phase === 'intro') this.warpTo(c.to)
      return
    }
    if (!isHost) return
    if (c.type === 'stage' && W.phase === 'lobby' && this.unlocked().includes(c.stage)) W.lobbyStage = c.stage
    else if (c.type === 'start' && W.phase === 'lobby') this.startStage(W.lobbyStage)
    else if (c.type === 'next' && W.phase === 'clear') {
      const i = STAGES.indexOf(W.stage)
      const next = STAGES[i + 1]
      if (!next) this.setPhase('ending')
      else if (this.stages[next]) this.startStage(next)
      else this.toLobby()
    } else if (c.type === 'lobby' && (W.phase === 'clear' || W.phase === 'ending' || W.phase === 'play')) this.toLobby()
  }

  step(dt: number): void {
    const W = this.W
    W.t += dt
    W.seq++
    switch (W.phase) {
      case 'intro':
        if (W.t >= W.phaseAt + 2.5) this.setPhase('play')
        break
      case 'wipe':
        if (W.t >= W.phaseAt + DOWN.wipeTime) this.respawn()
        break
      case 'play':
        this.play(dt)
        break
      case 'clear':
        for (const h of W.heroes) if (h.state !== 'victory') setState(W, h, 'victory')
        break
    }
    pruneEvents(W)
    W.dialogs = W.dialogs.filter((d) => d.until > W.t)
  }

  view(): View {
    return buildView(this.W, this.unlocked())
  }

  progress(): Progress {
    return { cleared: [...this.W.cleared] }
  }

  /* ------------------------------------------------------------------------------------------- phases */

  unlocked(): StageId[] {
    return STAGES.filter((s, i) => this.stages[s] && (i === 0 || this.W.cleared.includes(STAGES[i - 1])))
  }

  private setPhase(p: WorldState['phase']): void {
    this.W.phase = p
    this.W.phaseAt = this.W.t
  }

  private toLobby(): void {
    const W = this.W
    W.heroes = []
    W.enemies = []
    W.props = []
    W.shots = []
    W.pickups = []
    W.techs = []
    W.boss = undefined
    W.parsed = undefined
    W.grid = undefined
    W.results = undefined
    for (const h of W.humans) (h.ctrl = -1), (h.spectator = false)
    this.setPhase('lobby')
  }

  startStage(stage: StageId): void {
    const W = this.W
    const data = this.stages[stage]
    if (!data) return
    const P = parsedOf(data)
    W.stage = stage
    W.lobbyStage = stage
    W.species = STAGE_SPECIES[stage]
    W.parsed = P
    W.grid = new Grid(P.info)
    W.rng = createRng(W.seed ^ (STAGES.indexOf(stage) * 7919))
    W.party = { gems: 0, keys: 0, techs: 0, kos: 0, time: 0, wipes: 0 }
    W.flags = new Set()
    W.arenas = new Map()
    for (const r of data.rooms) if (r.waves) W.arenas.set(r.id, { state: 'idle', wave: 0 })
    W.checkpointsReached = new Set()
    W.roomsSeen = new Set()
    W.bigFormRooms = new Set()
    W.events = []
    W.shots = []
    W.pickups = []
    W.techs = []
    W.dialogs = []
    W.formations = []
    W.prevForms = new Map()
    W.results = undefined
    W.orbTaken = false
    W.orb = undefined
    W.props = P.props.map(
      (p): Prop => ({
        id: p.id,
        kind: p.kind,
        x: p.x,
        y: p.y,
        z: 0,
        state: initialState(p.kind),
        st: 0,
        part: p.spec.id,
        weight: p.spec.weight ?? defaultWeight(p.kind),
        strength: 0,
        cond: p.spec.cond,
        latch: !!p.spec.latch,
        latched: false,
        lock: p.spec.lock,
        drop: p.spec.drop ?? [],
        group: p.spec.group,
        accepts: p.spec.accepts,
        on: false,
        gone: false,
        goneAt: 0,
        pushT: 0,
        pushDir: -1,
        strainAt: -10,
        onUntil: 0,
        grips: [],
        delivered: false
      })
    )
    W.enemies = []
    for (const e of P.enemies) spawnEnemy(W, e.kind, e.x, e.y)
    W.boss = P.boss ? createBoss(W, P.boss.kind, P.boss.x, P.boss.y) : undefined
    for (const p of P.pickups) dropItems(W, p.x, p.y, [p.kind])
    for (const p of W.pickups) (p.vx = 0), (p.vy = 0)
    const startRoom = roomOf(W, P.spawn.x, P.spawn.y)?.id ?? ''
    W.checkpoint = startRoom
    W.leaderRoom = startRoom
    W.checkpointsReached.add(startRoom)
    W.heroes = JOBS.map((job, slot) => newHero(slot, job, P.spawn.x, P.spawn.y))
    rebuildSolids(W)
    this.placeParty(P.spawn.x, P.spawn.y, false)
    assignSlots(W)
    banner(W, STAGE_NAMES[stage])
    this.setPhase(this.skipIntro ? 'play' : 'intro')
  }

  private placeParty(x: number, y: number, force: boolean): void {
    const W = this.W
    const offs = [
      [0, 0],
      [-44, 30],
      [44, 30],
      [0, 60]
    ]
    W.heroes.forEach((h, i) => {
      const [dx, dy] = offs[i]
      let px = x + dx
      let py = y + dy
      if (W.grid!.overlaps(px, py, 16, false) || !W.grid!.walkable(tileOf(px), tileOf(py)))
        ({ x: px, y: py } = freeSpotNear(W, x + dx, y + dy, 4))
      if (force) warpHero(h, px, py)
      else (h.body.x = px), (h.body.y = py)
      h.safeX = px
      h.safeY = py
      h.ai.lastX = px
      h.ai.lastY = py
      h.anchor = undefined
    })
  }

  private warpTo(to: string): void {
    const W = this.W
    const P = W.parsed
    if (!P) return
    const room = P.info.rooms.find((r) => r.id === to)
    const cp = P.checkpoints[to]
    let x: number
    let y: number
    if (cp) ({ x, y } = cp)
    else if (room) ({ x, y } = freeSpotNear(W, (room.x + room.w / 2) * TILE, (room.y + room.h / 2) * TILE, 8))
    else return
    for (const h of W.heroes) {
      releaseHold(W, h)
      if (h.state === 'down' || h.state === 'fall') h.hp = Math.max(h.hp, 2)
      setState(W, h, 'idle')
      h.body.jt = -1
      h.body.z = 0
    }
    W.techs = []
    this.placeParty(x, y, true)
    if (cp) W.checkpoint = to
    if (W.phase === 'intro') this.setPhase('play')
  }

  private respawn(): void {
    const W = this.W
    const P = W.parsed!
    W.party.wipes++
    W.techs = []
    W.shots = []
    // Arenas that were not cleared start over; the boss fight resets.
    for (const [id, a] of W.arenas)
      if (a.state === 'active') {
        a.state = 'idle'
        a.wave = 0
        W.enemies = W.enemies.filter((e) => e.room !== id || e.wave === undefined)
      }
    resetBoss(W)
    W.enemies = W.enemies.filter((e) => !e.summoned)
    for (const h of W.heroes) {
      h.hp = h.maxHp
      h.hold = undefined
      h.holdKind = undefined
      h.holdAt = -1
      h.charging = h.chargeFull = false
      h.inv = W.t + 1.5
      h.body.jt = -1
      h.body.z = 0
      setState(W, h, 'idle')
    }
    for (const p of W.props)
      if (p.kind === 'acorn' && p.state === 'lifted') {
        p.grips = []
        p.state = 'idle'
        p.z = 0
        const s = freeSpotNear(W, p.x, p.y, 4)
        p.x = s.x
        p.y = s.y
      }
    const cp = P.checkpoints[W.checkpoint] ?? P.spawn
    rebuildSolids(W)
    this.placeParty(cp.x, cp.y, true)
    emit(W, 'notice', cp.x, cp.y, { s: 'チェックポイントからやりなおし' })
    this.setPhase('play')
  }

  /* --------------------------------------------------------------------------------------------- play */

  private play(dt: number): void {
    const W = this.W
    W.party.time += dt
    rebuildSolids(W)
    updateFormations(W, dt)
    this.applyReports()
    // Intents.
    for (const human of W.humans) this.humanInput(human)
    for (const h of W.heroes) {
      const human = W.humans.find((q) => q.id === h.owner)
      if (!human || human.ctrl !== h.slot) h.intent = companionIntent(W, h, human)
    }
    this.signal()
    for (const h of W.heroes) this.control(h)
    for (const h of W.heroes) this.move(h, dt)
    this.separate()
    updateHeld(W)
    updateTechs(W)
    updatePush(W, dt)
    updateEnemies(W, dt)
    updateBoss(W, dt)
    updateShots(W, dt, (W2, s) => potShotEnd(W2, s))
    updatePickups(W, dt)
    updatePuzzles(W)
    this.downs(dt)
    this.rooms()
    if (W.boss?.dead && W.orb === undefined) this.spawnOrb()
    if (W.orbTaken) this.clear()
    else if (W.heroes.length && W.heroes.every((h) => h.state === 'down')) {
      banner(W, '全滅…')
      sfx(W, 'heroDown', 0, 0)
      this.setPhase('wipe')
    }
  }

  private applyReports(): void {
    const W = this.W
    for (const human of W.humans) {
      if (!human.reportFresh || !human.report) continue
      human.reportFresh = false
      const r = human.report
      const h = heroBy(W, r.slot)
      if (!h || h.owner !== human.id || human.ctrl !== h.slot) continue
      if (r.forceSeq < h.forceSeq) continue
      if (['tech', 'grip', 'down', 'fall', 'victory'].includes(h.state)) continue
      const base = h.accepted ?? { x: h.body.x, y: h.body.y, t: W.t - 0.1 }
      const elapsed = Math.max(1 / 60, W.t - base.t)
      const maxD = MAX_SPEED[W.species] * elapsed * 1.5 + 24
      const ok =
        Number.isFinite(r.x) &&
        Number.isFinite(r.y) &&
        dist(r.x, r.y, base.x, base.y) <= maxD &&
        !W.grid!.overlaps(r.x, r.y, 15, r.airborne || airborne(h.body))
      if (ok) {
        h.body.x = r.x
        h.body.y = r.y
        h.body.vx = r.vx
        h.body.vy = r.vy
        h.body.facing = r.facing
        h.accepted = { x: r.x, y: r.y, t: W.t }
        h.reportAirborne = r.airborne
      } else warpHero(h, h.body.x, h.body.y)
    }
  }

  private humanInput(human: Human): void {
    const W = this.W
    const inp = human.input
    const s = human.seen
    const edge = (k: keyof Human['seen']) => {
      const v = inp[k]
      const fired = v > s[k]
      s[k] = v
      return fired
    }
    const press = edge('attackPresses')
    const release = edge('attackReleases')
    const action = edge('actionPresses')
    const interactP = edge('interactPresses')
    const sw = edge('switchPresses')
    const mode = edge('modePresses')
    const sig = edge('signalPresses')
    if (human.spectator) return
    if (sw) switchHero(W, human)
    if (mode) toggleMode(W, human)
    const h = heroBy(W, human.ctrl)
    if (!h) return
    if (sig && !W.signal) {
      W.signal = { at: W.t, slot: h.slot, ticks: 0 }
      sfx(W, 'signalTick', h.body.x, h.body.y)
      pop(W, 'せーの！', h.body.x, h.body.y - 80, h.slot)
    }
    const aimDist = (inp as NetInput & { aimDist?: number }).aimDist ?? 4 * TILE
    const len = Math.hypot(inp.mx, inp.my)
    h.intent = {
      mx: len > 1 ? inp.mx / len : inp.mx || 0,
      my: len > 1 ? inp.my / len : inp.my || 0,
      aim: Number.isFinite(inp.aim) ? inp.aim : h.aim,
      aimDist,
      held: inp.attackHeld,
      press,
      release: release || (!inp.attackHeld && h.holdAt >= 0),
      action,
      actionHeld: inp.actionHeld,
      interact: interactP
    }
    h.aim = h.intent.aim
    if (press) mimic(W, h, 'hold', h.intent.aim)
    if (h.intent.release && (h.holdAt >= 0 || press)) mimic(W, h, 'release', h.intent.aim)
  }

  private signal(): void {
    const W = this.W
    const s = W.signal
    if (!s) return
    const el = W.t - s.at
    while (s.ticks < 3 && el >= s.ticks + 1) {
      s.ticks++
      if (s.ticks < 3) sfx(W, 'signalTick', 0, 0)
      else {
        sfx(W, 'signalGo', 0, 0)
        emit(W, 'pop', 0, 0, { s: 'GO！', a: s.slot })
        for (const h of W.heroes) {
          const human = W.humans.find((q) => q.id === h.owner)
          if (human && human.ctrl !== h.slot && human.mode === 'stay') h.ai.goPending = true
        }
      }
    }
    if (el >= 3.5) W.signal = undefined
  }

  /** Actions (attack, charge, interact) from the hero's intent. */
  private control(h: Hero): void {
    const W = this.W
    const it = h.intent
    const t = W.t
    if (h.until > 0 && t >= h.until && ['attack', 'skill', 'hurt', 'revive'].includes(h.state)) setState(W, h, 'idle')
    if (['down', 'fall', 'tech', 'victory'].includes(h.state)) return
    const stunned = h.stun > t
    if (it.interact && !stunned) interact(W, h)
    if (h.state === 'grip') return
    if (it.press && !stunned) {
      if (h.holdKind === 'lift') throwPot(W, h, it.aim)
      else if (h.holdKind !== 'grip') {
        if (t >= h.atkReady) normalAttack(W, h, it.aim)
        if (h.chargeLock <= t) {
          h.holdAt = t
          h.charging = false
          h.chargeFull = false
        }
      }
    }
    if (h.holdAt >= 0) {
      const el = t - h.holdAt
      if (it.held && !it.release) {
        if (el >= CHARGE.start && !h.charging) {
          h.charging = true
          sfx(W, 'chargeStart', h.body.x, h.body.y)
        }
        if (el >= CHARGE.full && !h.chargeFull) {
          h.chargeFull = true
          sfx(W, 'chargeFull', h.body.x, h.body.y)
          fx(W, 'charge_full', h.body.x, h.body.y)
        }
        if (h.charging && h.state !== 'attack') {
          if (h.state !== 'charge') setState(W, h, 'charge')
          h.body.facing = it.aim
        }
      } else {
        // Released.
        if (h.chargeFull) {
          const inForm = h.form >= 0 && W.formations[h.form].slots.length >= 2
          if (!(inForm && startTech(W, h, it.aim, it.aimDist))) jobSkill(W, h, it.aim)
        } else if (h.charging) {
          sfx(W, 'chargeCancel', h.body.x, h.body.y)
          if (h.state === 'charge') setState(W, h, 'idle')
        }
        h.holdAt = -1
        h.charging = false
        h.chargeFull = false
      }
    }
  }

  private move(h: Hero, dt: number): void {
    const W = this.W
    const g = W.grid!
    const t = W.t
    if (h.state === 'tech' || h.state === 'victory') return
    if (h.state === 'down') {
      h.body.vx = h.body.vy = 0
      return
    }
    if (h.state === 'fall') {
      if (t >= h.fallUntil) {
        warpHero(h, h.safeX, h.safeY)
        h.hp -= FALL.dmg
        h.stats.hurt += FALL.dmg
        pop(W, `${FALL.dmg}`, h.safeX, h.safeY - 48, -1)
        if (h.hp <= 0) heroDown(W, h)
        else {
          setState(W, h, 'idle')
          h.inv = t + 1
        }
      }
      return
    }
    if (h.state === 'grip') {
      h.body.vx = h.body.vy = 0
      return
    }
    const it = h.intent
    const stunned = h.stun > t
    let mul = holdSpeed(W, h)
    if (h.charging) mul *= CHARGE_SPEED
    if (stunned) mul = 0
    const human = W.humans.find((q) => q.id === h.owner)
    if (!human || human.ctrl !== h.slot) mul *= h.ai.boost
    const res = stepBody(
      h.body,
      { mx: it.mx, my: it.my, action: it.action, actionHeld: it.actionHeld },
      g,
      W.species,
      mul,
      dt,
      h.hold === undefined && !stunned
    )
    if (res.jumped) {
      sfx(W, 'slimeJump', h.body.x, h.body.y)
      setState(W, h, 'action')
    }
    if (res.bounced) {
      bounceAt(W, h.body.x, h.body.y)
      setState(W, h, 'action')
    }
    if (res.landed) {
      sfx(W, 'slimeLand', h.body.x, h.body.y)
      fx(W, 'dust', h.body.x, h.body.y)
      hitArc(W, h.body.x, h.body.y, 40, 0, Math.PI, { slot: h.slot, dmg: 1, kb: 200, sx: h.body.x, sy: h.body.y })
      if (h.state === 'action') setState(W, h, 'idle')
    }
    const guestAir = h.accepted !== undefined && h.reportAirborne
    if (res.fell && !guestAir) {
      releaseHold(W, h)
      setState(W, h, 'fall')
      h.fallUntil = t + FALL.time
      h.holdAt = -1
      h.charging = h.chargeFull = false
      h.body.vx = h.body.vy = h.body.kx = h.body.ky = 0
      sfx(W, 'fall', h.body.x, h.body.y)
      const tile = W.parsed!.info.tiles[g.idx(tileOf(h.body.x), tileOf(h.body.y))]
      if (tile === 'water') {
        fx(W, 'splash', h.body.x, h.body.y)
        sfx(W, 'splash', h.body.x, h.body.y)
      }
      return
    }
    if (!airborne(h.body)) {
      const tx = tileOf(h.body.x)
      const ty = tileOf(h.body.y)
      if (g.free(tx, ty)) (h.safeX = tx * TILE + TILE / 2), (h.safeY = ty * TILE + TILE / 2)
    }
    // Locomotion state.
    if (['idle', 'walk', 'push', 'carry', 'charge'].includes(h.state)) {
      const moving = Math.hypot(h.body.vx, h.body.vy) > 25
      const want = h.charging
        ? 'charge'
        : h.hold !== undefined
          ? 'carry'
          : h.pushing
            ? 'push'
            : moving
              ? 'walk'
              : 'idle'
      if (want !== h.state) setState(W, h, want)
    }
  }

  /** Heroes don't block each other: soft separation (host-simulated heroes only). */
  private separate(): void {
    const W = this.W
    const hs = W.heroes.filter(
      (h) => !['tech', 'grip', 'down', 'fall'].includes(h.state) && h.body.z <= 0 && !h.accepted
    )
    for (let i = 0; i < hs.length; i++)
      for (let j = i + 1; j < hs.length; j++) {
        const a = hs[i].body
        const b = hs[j].body
        const d = dist(a.x, a.y, b.x, b.y)
        if (d >= 24 || d < 0.01) continue
        const k = ((24 - d) / d) * 0.15
        const ox = (a.x - b.x) * k
        const oy = (a.y - b.y) * k
        const pa = W.grid!.pushOut(a.x + ox, a.y + oy, 16, false)
        const pb = W.grid!.pushOut(b.x - ox, b.y - oy, 16, false)
        a.x = pa.x
        a.y = pa.y
        b.x = pb.x
        b.y = pb.y
      }
  }

  private downs(dt: number): void {
    const W = this.W
    const up = W.heroes.filter((h) => active(h) && h.state !== 'tech')
    for (const h of W.heroes) {
      if (h.state !== 'down') continue
      const near = up.some((m) => dist(m.body.x, m.body.y, h.body.x, h.body.y) <= DOWN.reviveDist + 8)
      h.revive = near ? h.revive + dt : Math.max(0, h.revive - dt * 0.5)
      if (h.revive >= DOWN.reviveTime) this.revive(h, DOWN.reviveHp)
      else if (W.t - h.downAt >= DOWN.selfTime && up.length) this.revive(h, DOWN.selfHp)
    }
  }

  private revive(h: Hero, hp: number): void {
    const W = this.W
    h.hp = hp
    h.revive = 0
    h.inv = W.t + 1.5
    setState(W, h, 'revive', 0.4)
    fx(W, 'revive', h.body.x, h.body.y)
    sfx(W, 'revive', h.body.x, h.body.y)
  }

  private rooms(): void {
    const W = this.W
    const P = W.parsed!
    const lead = leader(W)
    W.leaderRoom = lead ? roomOf(W, lead.body.x, lead.body.y)?.id : undefined
    for (const h of W.heroes) {
      if (!active(h)) continue
      const room = roomOf(W, h.body.x, h.body.y)
      if (!room) continue
      const data = P.data.rooms.find((r) => r.id === room.id)!
      const human = W.humans.find((q) => q.id === h.owner)
      const controlled = human?.ctrl === h.slot
      if (!W.roomsSeen.has(room.id) && controlled) {
        W.roomsSeen.add(room.id)
        emit(W, 'notice', h.body.x, h.body.y, { s: room.name ?? room.id })
      }
      if (P.checkpoints[room.id] && !data.checkpointOnClear && !W.checkpointsReached.has(room.id))
        this.reachCheckpoint(room.id)
      const inset =
        tileOf(h.body.x) > room.x &&
        tileOf(h.body.x) < room.x + room.w - 1 &&
        tileOf(h.body.y) > room.y &&
        tileOf(h.body.y) < room.y + room.h - 1
      const arena = W.arenas.get(room.id)
      if (arena?.state === 'idle' && inset && controlled) this.startArena(room.id, h)
      if (data.boss && inset && W.boss && !W.boss.active && !W.boss.dead) {
        activateBoss(W, W.boss)
        this.gather(room.id, h)
      }
    }
    for (const [id, a] of W.arenas) {
      if (a.state !== 'active') continue
      const left = W.enemies.filter((e) => e.room === id && e.wave === a.wave && !e.dead)
      if (left.length) continue
      const data = P.data.rooms.find((r) => r.id === id)!
      if (a.wave + 1 < (data.waves?.length ?? 0)) {
        a.wave++
        this.spawnWave(id, a.wave)
      } else {
        a.state = 'cleared'
        const cx = (data.x + data.w / 2) * TILE
        const cy = (data.y + data.h / 2) * TILE
        emit(W, 'solve', cx, cy, { s: '広場を制圧した！' })
        banner(W, 'クリア！')
        if (data.checkpointOnClear) this.reachCheckpoint(id)
      }
    }
  }

  private reachCheckpoint(id: string): void {
    const W = this.W
    W.checkpointsReached.add(id)
    W.checkpoint = id
    const cp = W.parsed!.checkpoints[id]
    if (cp) {
      sfx(W, 'checkpoint', cp.x, cp.y)
      emit(W, 'notice', cp.x, cp.y, { s: 'チェックポイント！' })
      burst(W, 'spark', cp.x, cp.y, 10)
    }
  }

  private startArena(id: string, trigger: Hero): void {
    const W = this.W
    const a = W.arenas.get(id)!
    a.state = 'active'
    a.wave = 0
    this.gather(id, trigger)
    this.spawnWave(id, 0)
    banner(W, '敵があらわれた！')
  }

  /** Puffs heroes outside a locking room in next to the hero who entered it. */
  private gather(id: string, trigger: Hero): void {
    const W = this.W
    for (const h of W.heroes) {
      if (h === trigger || h.state === 'down') continue
      if (roomOf(W, h.body.x, h.body.y)?.id === id) continue
      releaseHold(W, h)
      const s = freeSpotNear(W, trigger.body.x, trigger.body.y, 3)
      fx(W, 'smoke', h.body.x, h.body.y)
      if (h.state === 'fall') setState(W, h, 'idle')
      warpHero(h, s.x, s.y)
      fx(W, 'smoke', s.x, s.y)
    }
  }

  private spawnWave(id: string, wave: number): void {
    const W = this.W
    const data = W.parsed!.data.rooms.find((r) => r.id === id)!
    for (const s of data.waves?.[wave] ?? []) {
      const e = spawnEnemy(W, s.kind, s.x * TILE + TILE / 2, s.y * TILE + TILE / 2, wave)
      e.room = id
      e.alertAt = W.t
      fx(W, 'smoke', e.x, e.y)
    }
  }

  private spawnOrb(): void {
    const W = this.W
    const altar = W.parsed!.info.decor.find((d) => d.kind === 'altar')
    const at = altar ?? { x: W.boss!.x, y: W.boss!.y }
    W.pickups.push({ id: (W.nextId += 1), kind: 'orb', x: at.x, y: at.y + 8, st: W.t, vx: 0, vy: 0, taken: false })
    W.orb = W.nextId
    emit(W, 'solve', at.x, at.y, { s: '祭壇に宝珠があらわれた！' })
  }

  private clear(): void {
    const W = this.W
    if (!W.cleared.includes(W.stage)) W.cleared.push(W.stage)
    W.results = results(W)
    banner(W, 'ステージクリア！')
    for (const h of W.heroes) setState(W, h, 'victory')
    this.setPhase('clear')
  }
}

function initialState(kind: Prop['kind']): string {
  switch (kind) {
    case 'plate':
    case 'plate2':
    case 'bigplate':
    case 'crystal':
    case 'lever':
    case 'pedestal':
      return 'off'
    case 'gate':
    case 'bossdoor':
    case 'chest':
      return 'closed'
    default:
      return 'idle'
  }
}

function defaultWeight(kind: Prop['kind']): number {
  return { block: 2, boulder: 4, acorn: 3, pot: 1 }[kind as string] ?? 0
}

export function newHero(slot: number, job: Hero['job'], x: number, y: number): Hero {
  const hp = JOB_STATS[job].hp
  return {
    slot,
    job,
    body: newBody(x, y),
    state: 'idle',
    st: 0,
    until: 0,
    hp,
    maxHp: hp,
    owner: '',
    aim: Math.PI / 2,
    atkReady: 0,
    holdAt: -1,
    charging: false,
    chargeFull: false,
    chargeLock: 0,
    inv: 0,
    stun: 0,
    downAt: 0,
    revive: 0,
    fallUntil: 0,
    safeX: x,
    safeY: y,
    forceSeq: 0,
    clericHits: 0,
    intent: { ...NO_INTENT },
    stats: { kos: 0, dmg: 0, heals: 0, techs: 0, formTime: 0, hurt: 0 },
    form: -1,
    ai: {
      boost: 1,
      pathAt: -10,
      goalTile: -1,
      stuckT: 0,
      lastX: x,
      lastY: y,
      queue: [],
      ownerHeld: false,
      goPending: false
    },
    pushing: false,
    reportAirborne: false
  }
}

function results(W: WorldState): View['results'] {
  const p = W.party
  const rank: 'S' | 'A' | 'B' | 'C' =
    p.time < 600 && p.wipes === 0 && p.techs >= 4
      ? 'S'
      : p.time < 900 && p.wipes <= 1 && p.techs >= 2
        ? 'A'
        : p.wipes <= 3
          ? 'B'
          : 'C'
  const titles: [string, (h: Hero) => number][] = [
    ['KO王', (h) => h.stats.kos],
    ['陣形の要', (h) => h.stats.formTime],
    ['回復役', (h) => h.stats.heals],
    ['協力技マスター', (h) => h.stats.techs],
    ['ダメージ王', (h) => h.stats.dmg],
    ['タフネス', (h) => h.stats.hurt]
  ]
  const used = new Set<number>()
  const badges: { slot: number; title: string }[] = []
  for (const [title, f] of titles) {
    const cand = W.heroes.filter((h) => !used.has(h.slot)).sort((a, b) => f(b) - f(a))[0]
    if (!cand || f(cand) <= 0) continue
    used.add(cand.slot)
    badges.push({ slot: cand.slot, title })
  }
  for (const h of W.heroes) if (!used.has(h.slot)) badges.push({ slot: h.slot, title: 'がんばったで賞' })
  badges.sort((a, b) => a.slot - b.slot)
  return {
    stage: W.stage,
    time: Math.round(p.time * 10) / 10,
    gems: p.gems,
    techs: p.techs,
    kos: p.kos,
    wipes: p.wipes,
    rank,
    badges
  }
}

export { newHuman, healHero, hurtHero, jobSkill }

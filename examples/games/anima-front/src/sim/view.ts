/**
 * Builds the JSON View (src/sim/types.ts) from the sim state: plain objects and arrays only, numbers rounded to
 * ~3 decimals (velocities 2), empty optional fields omitted. Events since the previous view are moved out.
 */
import { burnOf } from './anima'
import { SWAP_TIME } from './constants'
import { sideTeam, type Foe, type HandSt, type Player, type Prop, type Sim } from './state'
import type { FoeView, HandView, PlayerStats, PlayerView, PropView, ShardView, ShotView, TeamId, View } from './types'
import { r2, r2v, r3, r3v } from './vec'

function handView(sim: Sim, h: HandSt): HandView {
  const v: HandView = {
    items: h.items.slice(),
    sel: h.sel,
    swap: r3(h.swap / SWAP_TIME),
    act: h.act,
    charge: r3(h.charge),
    cooldown: r3(Math.max(0, h.readyAt - sim.time)),
    uses: h.uses,
    combo: h.combo
  }
  if (h.locks.length) v.locks = h.locks.map((l) => l.ref)
  return v
}

function statsView(s: PlayerStats): PlayerStats {
  const byItem: PlayerStats['byItem'] = {}
  for (const k of Object.keys(s.byItem) as (keyof PlayerStats['byItem'])[]) byItem[k] = r2(s.byItem[k] ?? 0)
  return {
    kos: s.kos,
    assists: s.assists,
    downs: s.downs,
    revives: s.revives,
    damage: r2(s.damage),
    taken: r2(s.taken),
    spent: r2(s.spent),
    gathered: r2(s.gathered),
    shots: s.shots,
    hits: s.hits,
    byItem
  }
}

export function playerView(sim: Sim, p: Player): PlayerView {
  const v: PlayerView = {
    id: p.id,
    name: p.name,
    team: p.team,
    species: p.species.id,
    bot: p.bot !== undefined,
    p: r3v(p.p),
    v: r2v(p.v),
    yaw: r3(p.yaw),
    pitch: r3(p.pitch),
    shoulder: p.shoulder,
    anima: r2(p.anima),
    maxAnima: p.maxAnima,
    state: p.state,
    timer: p.timer === Infinity ? -1 : r2(Math.max(0, p.timer)),
    revive: r3(p.revive),
    invuln: sim.time < p.invulnUntil,
    grounded: p.grounded,
    move: p.move,
    hands: [handView(sim, p.hands[0]), handView(sim, p.hands[1])],
    passives: p.build.passives.slice(),
    passivesOnline: p.online,
    cloak: r3(p.cloak),
    revealed: sim.time < p.revealedUntil,
    burn: r2(burnOf(sim, p)),
    dashCooldown: r2(Math.max(0, p.dashReadyAt - sim.time)),
    negateAt: p.negateAt < 0 ? -1 : r3(p.negateAt),
    stats: statsView(p.stats)
  }
  if (p.reviving) v.reviving = p.reviving
  if (p.revealedBy) {
    const to: TeamId[] = []
    for (let s = 0; s < 3; s++) if (sim.time < (p.revealedBy[s] ?? 0)) to.push(s as TeamId)
    if (to.length) v.revealedTo = to
  }
  return v
}

function foeView(sim: Sim, f: Foe): FoeView {
  const v: FoeView = {
    id: f.id,
    kind: f.kind,
    p: r3v(f.p),
    yaw: r3(f.yaw),
    hp: r2(f.hp),
    maxHp: r2(f.maxHp),
    state: f.state,
    st: r2(f.st),
    revealed: sim.time < f.revealedUntil,
    shielded: f.shielded
  }
  if (f.attack) v.attack = f.attack.id
  if (f.aim) v.aim = r3v(f.aim)
  if (f.parts) v.parts = f.parts.map(r2)
  if (f.avatar) {
    const a = f.avatar
    v.animal = {
      species: a.species.id,
      hands: [handView(sim, a.hands[0]), handView(sim, a.hands[1])],
      pitch: r3(a.pitch),
      move: a.move,
      grounded: a.grounded
    }
  }
  return v
}

function propView(sim: Sim, r: Prop): PropView {
  const v: PropView = {
    id: r.id,
    kind: r.kind,
    p: r3v(r.p),
    yaw: r3(r.yaw),
    team: r.side === -1 ? -1 : sideTeam(r.side),
    t: r2(sim.time - r.born)
  }
  if (r.hp !== undefined) v.hp = r2(r.hp)
  if (r.maxHp !== undefined) v.maxHp = r2(r.maxHp)
  if (r.r !== undefined) v.r = r3(r.r)
  if (r.until !== undefined) v.life = r2(Math.max(0, r.until - sim.time))
  if (r.owner !== undefined) v.owner = r.owner
  if (r.state !== undefined) v.state = r3(r.state)
  if (r.label !== undefined) v.label = r.label
  if (r.species !== undefined) v.species = r.species
  return v
}

export function buildView(sim: Sim): View {
  const shots: ShotView[] = sim.shots.map((s) => {
    const v: ShotView = { id: s.id, kind: s.kind, team: sideTeam(s.side), p: r3v(s.p), v: r2v(s.v) }
    if (s.owner !== undefined) v.owner = s.owner
    return v
  })
  const shards: ShardView[] = sim.shards.map((s) => {
    const v: ShardView = { id: s.id, p: r3v(s.p), amount: r2(s.amount) }
    if (s.to) v.to = s.to
    return v
  })
  const view: View = {
    tick: sim.tick,
    time: r3(sim.time),
    mode: sim.cfg.mode,
    map: sim.map.id,
    phase: sim.phase,
    clock: r2(sim.mode.clock(sim)),
    players: sim.players.map((p) => playerView(sim, p)),
    foes: sim.foes.map((f) => foeView(sim, f)),
    shots,
    props: [
      ...sim.props.filter((r) => !r.gone).map((r) => propView(sim, r)),
      ...sim.hazards.map(
        (h): PropView => ({
          id: h.id,
          kind: 'puddle',
          p: r3v(h.p),
          yaw: 0,
          team: sideTeam(h.side),
          r: r2(h.r),
          t: r2(sim.time - h.at),
          life: r2(Math.max(0, h.until - sim.time))
        })
      )
    ],
    shards,
    events: sim.events
  }
  if (sim.variant) view.variant = sim.variant
  const pve = sim.mode.pve?.(sim)
  if (pve) view.pve = pve
  const pvp = sim.mode.pvp?.(sim)
  if (pvp) view.pvp = pvp
  const tr = sim.mode.training?.(sim)
  if (tr) view.training = tr
  sim.events = []
  return view
}

/** Builds the JSON snapshot (View) from the world state: rounded numbers, dynamic props only, bounded events. */
import { BOSS_NAMES, STAGE_SPECIES, dirOf, type StageId } from '../vocab'
import { CAT_DIR_ANIMS, MILDA_DIR_ANIMS } from './boss2'
import { VALK_DIR_ANIMS } from './boss3'
import { LEON_DIR_ANIMS } from './boss4'
import { BOSS_DIR_ANIMS } from './boss'
import { r1, r2 } from './core'
import { GRIPPABLE, PUSHABLE } from './stage-data'
import { holdSpeed } from './props'
import { CROW_FLIGHT } from './move'
import { ownedSlots } from './party'
import type { WorldState } from './state'
import { CHARGE, CHARGE_SPEED, GUARDED } from './tables'
import type { BossView, EnemyView, HeroView, MinionView, PetView, PlayerView, PropView, SnareView, View } from './types'

export function buildView(W: WorldState, unlocked: StageId[]): View {
  const t = W.t
  const heroes: HeroView[] = W.heroes.map((h) => {
    const human = W.humans.find((q) => q.id === h.owner)
    const charge =
      h.holdAt >= 0 && h.charging
        ? Math.min(1, Math.max(0, (t - h.holdAt - CHARGE.start) / (CHARGE.full - CHARGE.start)))
        : 0
    const v: HeroView = {
      slot: h.slot,
      job: h.job,
      x: r1(h.body.x),
      y: r1(h.body.y),
      z: r1(h.body.z),
      facing: r2(h.body.facing),
      aim: r2(h.aim),
      state: h.state,
      st: r2(h.st),
      hp: h.hp,
      maxHp: h.maxHp,
      charge: r2(charge),
      inv: r2(h.inv),
      owner: h.owner,
      ctrl: !!human && human.ctrl === h.slot,
      mode: human?.mode ?? 'follow'
    }
    if (h.hold !== undefined) v.hold = h.hold
    if (h.form >= 0) v.form = h.form
    if (h.stun > t) v.stun = r2(h.stun)
    if (h.snared > t) v.snared = r2(h.snared)
    if (W.species === 'crow') v.stamina = r2(h.body.stamina / CROW_FLIGHT.stamina)
    if (h.state === 'down') v.revive = r2(Math.min(1, h.revive / 1.5))
    if (h.force) v.force = h.force
    const speed = (h.charging ? CHARGE_SPEED : 1) * (W.grid ? holdSpeed(W, h) : 1)
    if (speed !== 1) v.speed = r2(speed)
    return v
  })
  const enemies: EnemyView[] = W.enemies.map((e) => {
    const guard = GUARDED.has(e.kind) && (e.state === 'idle' || e.state === 'walk') && e.guardOff <= t && e.stun <= t
    const v: EnemyView = {
      id: e.id,
      kind: e.kind,
      x: r1(e.x),
      y: r1(e.y),
      facing: r2(e.facing),
      state: guard ? 'guard' : e.state,
      st: r2(e.st),
      hp: r1(e.hp),
      maxHp: e.maxHp
    }
    if (e.hitAt !== undefined) v.hitAt = r2(e.hitAt)
    if (e.stun > t) v.stun = r2(e.stun)
    if (e.alertAt !== undefined) v.alertAt = r2(e.alertAt)
    if (e.tele) v.tele = e.tele
    if (e.ward > t) v.ward = r2(e.ward)
    return v
  })
  let boss: BossView | undefined
  const b = W.boss
  if (b && (!b.dead || b.act === 'death') && W.parsed) {
    const dir = dirOf(b.facing).dir
    boss = {
      id: b.id,
      kind: b.kind,
      x: r1(b.x),
      y: r1(b.y),
      z: r1(b.z),
      facing: r2(b.facing),
      anim: b.anim,
      animKey: (b.kind === 'milda'
        ? MILDA_DIR_ANIMS
        : b.kind === 'valk'
          ? VALK_DIR_ANIMS
          : b.kind === 'leon'
            ? LEON_DIR_ANIMS
            : BOSS_DIR_ANIMS
      ).has(b.anim)
        ? `${b.anim}_${dir}`
        : b.anim,
      st: r2(b.st),
      hp: r1(b.hp),
      maxHp: b.maxHp,
      phase: b.phase,
      guard: b.active && b.broken <= t && b.act !== 'death'
    }
    if (b.broken > t) boss.broken = r2(b.broken)
    if (b.steel > t && b.kind !== 'leon') boss.steel = r2(b.steel)
    if (b.kind === 'leon' && b.act === 'parry') boss.parry = r2(b.until)
    if (b.hitAt !== undefined) boss.hitAt = r2(b.hitAt)
    if (b.tele.length) boss.tele = b.tele
    if (b.dead) boss = undefined
  }
  let pet: PetView | undefined
  const c = W.pet
  if (c && !c.dead && W.parsed) {
    pet = {
      id: c.id,
      kind: c.kind,
      x: r1(c.x),
      y: r1(c.y),
      z: r1(c.z),
      facing: r2(c.facing),
      anim: c.anim,
      animKey: CAT_DIR_ANIMS.has(c.anim) ? `${c.anim}_${dirOf(c.facing).dir}` : c.anim,
      st: r2(c.st),
      hp: 1,
      maxHp: 1,
      phase: W.boss?.phase ?? 1,
      guard: c.stun <= t
    }
    if (c.stun > t) pet.broken = r2(c.stun)
    if (c.hitAt !== undefined) pet.hitAt = r2(c.hitAt)
    if (c.tele.length) pet.tele = c.tele
  }
  const props: PropView[] = []
  const gone: number[] = []
  for (const p of W.props) {
    if (p.gone) {
      gone.push(p.id)
      continue
    }
    if (p.state === 'thrown') continue
    const v: PropView = { id: p.id, kind: p.kind, x: r1(p.x), y: r1(p.y), state: p.state, st: r2(p.st) }
    if (p.z) v.z = r1(p.z)
    if ((p.kind === 'moonstone' || p.kind === 'crystal' || p.kind === 'valve') && p.group !== undefined)
      v.group = p.group
    if (PUSHABLE.has(p.kind)) {
      v.weight = p.weight
      v.strength = p.strength
    }
    if (GRIPPABLE.has(p.kind)) {
      v.weight = p.weight
      v.strength = p.grips.length
      if (p.state === 'lifted') v.state = 'lifted'
      else if (p.grips.length) v.state = 'gripped'
    }
    if (p.slide) {
      v.from = [r1(p.slide.from[0]), r1(p.slide.from[1])]
      v.to = [r1(p.slide.to[0]), r1(p.slide.to[1])]
      v.dur = p.slide.dur
    }
    props.push(v)
  }
  const players: PlayerView[] = W.humans.map((h) => {
    const v: PlayerView = {
      id: h.id,
      name: h.name,
      slots: W.heroes.length ? ownedSlots(W, h) : [],
      ctrl: h.spectator ? -1 : h.ctrl
    }
    if (h.spectator && W.heroes.length) v.spectator = true
    if (h.menu) v.menu = true
    if (h.job) v.job = h.job
    return v
  })
  const view: View = {
    v: 1,
    t: r2(t),
    seq: W.seq,
    stage: W.phase === 'lobby' ? W.lobbyStage : W.stage,
    species: STAGE_SPECIES[W.phase === 'lobby' ? W.lobbyStage : W.stage],
    phase: W.phase,
    heroes,
    enemies,
    props,
    gone,
    shots: W.shots.map((s) => {
      const v: View['shots'][number] = {
        id: s.id,
        kind: s.kind,
        x: r1(s.x),
        y: r1(s.y),
        z: r1(s.z),
        vx: r1(s.vx),
        vy: r1(s.vy)
      }
      if (s.kind === 'pot' || s.kind === 'barrel') v.prop = s.kind
      return v
    }),
    pickups: W.pickups.map((p) => ({ id: p.id, kind: p.kind, x: r1(p.x), y: r1(p.y), st: r2(p.st) })),
    techs: W.techs.map((x) => {
      const v: View['techs'][number] = {
        id: x.id,
        kind: x.kind,
        tier: x.tier,
        slots: x.slots,
        stage: x.stage,
        st: r2(x.st),
        x: r1(x.x),
        y: r1(x.y),
        z: r1(x.z),
        tx: r1(x.tx),
        ty: r1(x.ty),
        a: r2(x.a)
      }
      if (x.points) v.points = x.points.map(([px, py]) => [r1(px), r1(py)] as [number, number])
      if (x.index !== undefined) v.index = x.index
      return v
    }),
    formations: W.formations.map((f) => ({
      slots: f.slots,
      x: r1(f.x),
      y: r1(f.y),
      ready: f.slots.some((s) => W.heroes.find((h) => h.slot === s)?.chargeFull)
    })),
    events: W.events.slice(-60),
    players,
    party: { ...W.party, time: r1(W.party.time) },
    dialogs: W.dialogs.map((d) => ({ speaker: d.speaker, text: d.text, x: d.x, y: d.y, until: r2(d.until) })),
    objective: objective(W)
  }
  if (boss) view.boss = boss
  if (pet) view.bossPet = pet
  if (W.minions.length)
    view.minions = W.minions.map((m) => {
      const v: MinionView = {
        id: m.id,
        kind: m.kind,
        x: r1(m.x),
        y: r1(m.y),
        z: r1(m.z),
        facing: r2(m.facing),
        state: m.state,
        st: r2(m.st),
        hp: r1(m.hp),
        maxHp: m.maxHp
      }
      if (m.hitAt !== undefined) v.hitAt = r2(m.hitAt)
      if (m.tele) v.tele = m.tele
      return v
    })
  if (W.signal) view.signal = { at: r2(W.signal.at), slot: W.signal.slot }
  if (W.leaderRoom) view.room = W.leaderRoom
  if (W.phase === 'lobby') view.lobby = { stage: W.lobbyStage, unlocked }
  if (W.results) view.results = W.results
  if (W.grid?.fills.size) view.fills = [...W.grid.fills]
  if (W.currentsOff.length) view.currentsOff = [...W.currentsOff]
  if (W.grid?.barrierKey) view.barrier = W.grid.barrierKey.split(',')
  if (W.snares.length)
    view.snares = W.snares.map((q) => {
      const v: SnareView = { id: q.id, x: r1(q.x), y: r1(q.y), st: r2(q.st) }
      if (q.slot !== undefined) v.slot = q.slot
      return v
    })
  return view
}

function objective(W: WorldState): string {
  if (W.phase === 'lobby') return 'ステージをえらんで出発しよう'
  if (W.phase === 'clear') return 'ステージクリア！'
  if (!W.parsed) return ''
  if (W.orb !== undefined && !W.orbTaken) return '祭壇の宝珠にふれよう'
  if (W.boss?.active && !W.boss.dead)
    return W.boss.kind === 'milda' && W.boss.broken <= W.t && W.pet && !W.pet.dead
      ? 'チューチュー大行進でねこを止めて、ミルダをたたこう！'
      : `${BOSS_NAMES[W.boss.kind]}をたおせ！`
  for (const [id, a] of W.arenas)
    if (a.state === 'active') {
      const n = W.enemies.filter((e) => e.room === id && !e.dead).length
      return `敵をぜんぶたおせ！ のこり ${n}`
    }
  const room = W.parsed.data.rooms.find((r) => r.id === W.leaderRoom)
  return room?.objective ?? ''
}

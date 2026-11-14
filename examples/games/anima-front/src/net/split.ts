/**
 * The PvP snapshot split (DESIGN §18): one public part that says nothing about any player's whereabouts, plus one
 * part per team with exactly what that team may know (its own members, the enemies in its visibility set, the
 * events about them and its members' input acks). The host seals each team part with the team's key
 * (src/net/seal.ts); a guest opens its own and merges it with the public part (mergeView).
 *
 * Public: tick/time/phase/clock, scores, map props (no owner), events that are neither about a player nor
 * positional, the kill feed (`ko`: names, no positions) and a roster aligned with the match config (name, bot
 * flag, KOs, assists, downs) for the scoreboard. Per team: its known players, shots fired by them (or by nobody)
 * plus any shot within SHOT_NEAR of a living member (incoming fire), the player-placed props and resting shards it
 * may know about (visibility.ts `objects`; an enemy prop keeps its owner only when that owner is known), shards
 * flying to known players, events about them, impacts and blasts of known players (others' only near a living
 * member, without `by`), hits on the props it knows, its acks. Enemies a team cannot see are drawn from the
 * roster as players waiting off the field (`state: 'away'`).
 */
import type { MatchConfig, PlayerView, PropView, ShardView, ShotView, SimEvent, TeamId, View } from '../sim/types'
import type { ObjectSets } from './visibility'

/** Shots by unseen enemies reach a team only this close to one of its living members (metres). */
export const SHOT_NEAR = 45

/** Per human seat: [input session nonce, guest prediction tick] (SnapMsg.ack). */
export type Acks = Record<string, [number, number]>

export interface TeamPart {
  /** Players this team knows about (revealed rewritten for the team). */
  p: PlayerView[]
  /** Events about them. */
  e: SimEvent[]
  /** Input acks of this team's seats. */
  a: Acks
  /** Shots this team may see. */
  s?: ShotView[]
  /** Shards flying to its known players and the resting shards it may know about. */
  d?: ShardView[]
  /** Player-placed props it may know about. */
  r?: PropView[]
}

/** One row per config player (same order): name, bot (0/1), KOs, assists, downs. */
export type RosterRow = [string, number, number, number, number]

/** The player as one team sees it: `revealed` means revealed to that team; who else revealed it stays out. */
export function playerForTeam(p: PlayerView, team: TeamId): PlayerView {
  const revealed = !!p.revealedTo?.includes(team)
  if (p.revealedTo === undefined && p.revealed === revealed) return p
  const out = { ...p, revealed }
  delete out.revealedTo
  return out
}

/** The whole view as one team's screen shows it (PvP): sonar reveals only count when that team made them. */
export function viewForTeam(view: View, team: TeamId): View {
  return { ...view, players: view.players.map((p) => playerForTeam(p, team)) }
}

/** The player ids an event names: the subject (dropped when unknown) and others (removed when unknown). */
function refsOf(e: SimEvent): { subject?: string; others: 'by'[] } | null {
  // A radio line is spoken by the operator (a Speaker), not by a player: it names no one.
  if (e.type === 'radio') return null
  const r = e as Record<string, unknown>
  let subject: string | undefined
  if (typeof r.who === 'string') subject = r.who
  else if (e.type === 'hit' && e.targetKind === 'player' && typeof e.target === 'string') subject = e.target
  const others: 'by'[] = typeof r.by === 'string' ? ['by'] : []
  if (subject === undefined && !others.length) return null
  return { subject, others }
}

/** Where a team is and which props it knows: for events that carry a position. */
export interface EventScope {
  /** Within SHOT_NEAR + `extra` of one of the team's members on the field (incoming fire). */
  near(at: readonly number[], extra: number): boolean
  /** The team may know this prop (map props and its own team's included). */
  prop(id: number): boolean
}

/** The prop an event is about, if any. */
function propOf(e: SimEvent): number | undefined {
  if (e.type === 'propHit' || e.type === 'propBreak') return e.prop
  if (e.type === 'hit' && e.targetKind === 'prop' && typeof e.target === 'number') return e.target
  return undefined
}

/** Events for a team that knows the players in `known`, or undefined when the event must not reach it. */
export function eventForTeam(e: SimEvent, known: ReadonlySet<string>, scope: EventScope): SimEvent | undefined {
  if (e.type === 'impact' || e.type === 'blast') {
    const by = e.by
    if (typeof by === 'string' && known.has(by)) return e
    if (!scope.near(e.at, e.type === 'blast' ? e.radius : 0)) return undefined
    if (typeof by !== 'string') return e
    const out = { ...e }
    delete out.by
    return out
  }
  const prop = propOf(e)
  if (prop !== undefined && !scope.prop(prop)) return undefined
  const refs = refsOf(e)
  if (!refs) return e
  if (refs.subject !== undefined && !known.has(refs.subject)) return undefined
  const r = e as Record<string, unknown>
  let out: Record<string, unknown> | undefined
  for (const k of refs.others)
    if (!known.has(r[k] as string)) {
      out ??= { ...r }
      delete out[k]
    }
  return (out ?? e) as SimEvent
}

/**
 * True when the event goes in the public part: the kill feed (no positions), or an event that names no player
 * and says nothing about where one is or was (impacts and blasts never; prop damage only on map props).
 */
export function isPublicEvent(e: SimEvent, mapProps: ReadonlySet<number>): boolean {
  if (e.type === 'ko') return true
  if (e.type === 'impact' || e.type === 'blast') return false
  const prop = propOf(e)
  if (prop !== undefined && !mapProps.has(prop)) return false
  return refsOf(e) === null
}

/** A visible player with references to unknown players (locks, the revive target) taken out. */
function scrubPlayer(p: PlayerView, known: ReadonlySet<string>, team: TeamId): PlayerView {
  let out = playerForTeam(p, team)
  if (out.reviving !== undefined && !known.has(out.reviving)) {
    out = { ...out }
    delete out.reviving
  }
  const locked = (h: PlayerView['hands'][number]) => h.locks?.some((l) => typeof l === 'string' && !known.has(l))
  if (out.hands.some(locked)) {
    out = {
      ...out,
      hands: out.hands.map((h) =>
        locked(h) ? { ...h, locks: h.locks!.filter((l) => typeof l !== 'string' || known.has(l)) } : h
      ) as PlayerView['hands']
    }
  }
  return out
}

/** The shots a team may see: by known players or by nobody, and anything else close to one of its members. */
export function shotsForTeam(view: View, team: TeamId, known: ReadonlySet<string>): ShotView[] {
  const members = view.players.filter((p) => p.team === team && p.state !== 'away')
  const near = (at: readonly number[]) =>
    members.some((m) => Math.hypot(m.p[0] - at[0], m.p[1] - at[1], m.p[2] - at[2]) <= SHOT_NEAR)
  const out: ShotView[] = []
  for (const shot of view.shots) {
    const owner = shot.owner
    if (typeof owner !== 'string' || known.has(owner)) out.push(shot)
    else if (near(shot.p)) {
      const x = { ...shot }
      delete x.owner
      out.push(x)
    }
  }
  return out
}

/** Map props (no owner) of this view and those the visibility already knew (events about gone ones). */
export function mapPropsOf(view: View, objects?: ObjectSets): Set<number> {
  const out = new Set(objects?.mapProps)
  for (const r of view.props) if (r.owner === undefined) out.add(r.id)
  return out
}

/**
 * What one team may see of the player-placed props, the shards and the positional events: its own team's props,
 * enemy props in its `objects` set (the owner kept only when known), resting shards in its set, shards flying to
 * known players. Without `objects` (no visibility memory yet): own team's props and props of known owners only.
 */
export function teamObjects(
  view: View,
  team: TeamId,
  known: ReadonlySet<string>,
  mapProps: ReadonlySet<number>,
  objects?: ObjectSets
): { props: PropView[]; shards: ShardView[]; scope: EventScope } {
  const seenProps = objects?.props.get(team)
  const seenShards = objects?.shards.get(team)
  const props: PropView[] = []
  const mine = new Set<number>()
  for (const r of view.props) {
    if (r.owner === undefined) continue
    const own = r.team === team
    if (own) mine.add(r.id)
    if (!own && !(seenProps ? seenProps.has(r.id) : known.has(r.owner))) continue
    if (known.has(r.owner)) props.push(r)
    else {
      const out = { ...r }
      delete out.owner
      props.push(out)
    }
  }
  const shards = view.shards.filter((s) => (s.to === undefined ? !!seenShards?.has(s.id) : known.has(s.to)))
  const members = view.players.filter((p) => p.team === team && p.state !== 'away')
  const scope: EventScope = {
    near: (at, extra) =>
      members.some((m) => Math.hypot(m.p[0] - at[0], m.p[1] - at[1], m.p[2] - at[2]) <= SHOT_NEAR + extra),
    prop: (id) => mapProps.has(id) || mine.has(id) || !!seenProps?.has(id)
  }
  return { props, shards, scope }
}

export interface Split {
  pub: View
  roster: RosterRow[]
  parts: Map<TeamId, TeamPart>
}

/**
 * Splits a PvP view (its `events` are the events since the previous snapshot). `objects`: the props and resting
 * shards each team may know about (TeamVisibility.objects for the same update).
 */
export function splitView(
  view: View,
  visible: ReadonlyMap<TeamId, ReadonlySet<string>>,
  acks: Acks,
  config: MatchConfig,
  objects?: ObjectSets
): Split {
  const byId = new Map(view.players.map((p) => [p.id, p]))
  const roster: RosterRow[] = config.players.map((c) => {
    const p = byId.get(c.id)
    return p
      ? [p.name, p.bot ? 1 : 0, p.stats.kos, p.stats.assists, p.stats.downs]
      : [c.name, c.bot !== undefined ? 1 : 0, 0, 0, 0]
  })
  const mapProps = mapPropsOf(view, objects)
  const pub: View = {
    ...view,
    players: [],
    shots: [],
    props: view.props.filter((r) => r.owner === undefined),
    shards: [],
    events: view.events.filter((e) => isPublicEvent(e, mapProps))
  }
  if (pub.pvp?.mvp !== undefined && !['victory', 'defeat', 'draw'].includes(view.phase)) {
    pub.pvp = { ...pub.pvp }
    delete pub.pvp.mvp
  }
  const teamOf = new Map(config.players.map((c) => [c.id, c.team]))
  const parts = new Map<TeamId, TeamPart>()
  for (const [team, known] of visible) {
    const a: Acks = {}
    for (const [seat, ack] of Object.entries(acks)) if (teamOf.get(seat) === team) a[seat] = ack
    const { props, shards, scope } = teamObjects(view, team, known, mapProps, objects)
    const e: SimEvent[] = []
    for (const ev of view.events) {
      if (isPublicEvent(ev, mapProps)) continue
      const x = eventForTeam(ev, known, scope)
      if (x) e.push(x)
    }
    const s = shotsForTeam(view, team, known)
    const part: TeamPart = {
      p: view.players.filter((p) => known.has(p.id)).map((p) => scrubPlayer(p, known, team)),
      e,
      a
    }
    if (s.length) part.s = s
    if (shards.length) part.d = shards
    if (props.length) part.r = props
    parts.set(team, part)
  }
  return { pub, roster, parts }
}

const idleHand = (): PlayerView['hands'][number] => ({
  items: [],
  sel: -1,
  swap: 0,
  act: 'idle',
  charge: 0,
  cooldown: 0,
  uses: 0,
  combo: 0
})

/**
 * A player the team cannot see: off the field (`away`, no respawn timer), drawn nowhere. Keeps what the team
 * already knew (its last sighting) apart from anything that moves; name, bot flag and the scoreboard numbers
 * come from the public roster.
 */
export function hiddenPlayer(
  cfg: MatchConfig['players'][number],
  row: RosterRow | undefined,
  last: PlayerView | undefined
): PlayerView {
  const base: PlayerView = last
    ? { ...last }
    : {
        id: cfg.id,
        name: cfg.name,
        team: cfg.team,
        species: cfg.species,
        bot: cfg.bot !== undefined,
        p: [0, 0, 0],
        v: [0, 0, 0],
        yaw: 0,
        pitch: 0,
        shoulder: 1,
        anima: 0,
        maxAnima: 100,
        state: 'away',
        timer: -1,
        revive: 0,
        invuln: false,
        grounded: true,
        move: 'idle',
        hands: [idleHand(), idleHand()],
        passives: [],
        passivesOnline: false,
        cloak: 0,
        revealed: false,
        burn: 0,
        dashCooldown: 0,
        negateAt: -1,
        stats: {
          kos: 0,
          assists: 0,
          downs: 0,
          revives: 0,
          damage: 0,
          taken: 0,
          spent: 0,
          gathered: 0,
          shots: 0,
          hits: 0,
          byItem: {}
        }
      }
  const out: PlayerView = {
    ...base,
    v: [0, 0, 0],
    state: 'away',
    timer: -1,
    revive: 0,
    invuln: false,
    move: 'idle',
    revealed: false,
    hands: [
      { ...base.hands[0], act: 'idle', charge: 0 },
      { ...base.hands[1], act: 'idle', charge: 0 }
    ]
  }
  delete out.reviving
  delete out.revealedTo
  if (row) {
    out.name = row[0]
    out.bot = row[1] === 1
    out.stats = { ...base.stats, kos: row[2], assists: row[3], downs: row[4] }
  }
  return out
}

/** A guest's view: the public part with its team part, unknown enemies as hidden players. */
export function mergeView(
  pub: View,
  roster: readonly RosterRow[],
  part: TeamPart,
  config: MatchConfig,
  last: (id: string) => PlayerView | undefined
): { view: View; hidden: Set<string> } {
  const seen = new Map(part.p.map((p) => [p.id, p]))
  const hidden = new Set<string>()
  const players = config.players.map((c, i) => {
    const p = seen.get(c.id)
    if (p) return p
    hidden.add(c.id)
    return hiddenPlayer(c, roster[i], last(c.id))
  })
  const events = [...pub.events, ...part.e].sort((a, b) => a.id - b.id)
  const shots = Array.isArray(part.s) ? part.s : []
  const shards = Array.isArray(part.d) ? [...pub.shards, ...part.d] : pub.shards
  const props =
    Array.isArray(part.r) && Array.isArray(pub.props)
      ? [...pub.props, ...part.r].sort((a, b) => a.id - b.id)
      : pub.props
  return { view: { ...pub, players, events, shots, shards, props }, hidden }
}

/**
 * Pure HUD logic (formatting, geometry, classification) so the DOM layer only applies results. No DOM here.
 */
import { FOES } from '../../data/enemies'
import { ITEMS, type ItemId } from '../../data/items'
import { affordable, effectiveCost } from '../../sim/loadout'
import { SPEAKERS, type Speaker } from '../../data/missions'
import { SPECIES, type SpeciesId } from '../../data/species'
import type { ActorRef, HandView, PlayerView, ShotKind, SimEvent, V3, View } from '../../sim/types'

/** Critical anima share (DESIGN §5). */
export const CRITICAL_FRACTION = 0.15

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : Number.isFinite(v) ? v : 0)

/** m:ss (rounded up while counting down so 0:00 means done). */
export function formatClock(seconds: number, countDown = false): string {
  if (!Number.isFinite(seconds)) return '--:--'
  const s = Math.max(0, countDown ? Math.ceil(seconds) : Math.floor(seconds))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

/** Gauge number: whole anima, rounded up so a living animal never shows 0. */
export const formatAnima = (anima: number) => String(anima > 0 ? Math.max(1, Math.ceil(anima)) : 0)

export interface AnimaGauge {
  fraction: number
  /** Where the burn ghost ends (fraction + burn share). */
  ghost: number
  critical: boolean
  /** Warning banner: passives are really offline (DESIGN §5 hysteresis) or the share is critical. */
  warn: boolean
  label: string
  max: string
}

export function animaGauge(p: Pick<PlayerView, 'anima' | 'maxAnima' | 'burn' | 'passivesOnline'>): AnimaGauge {
  const max = Math.max(1, p.maxAnima)
  const fraction = clamp01(p.anima / max)
  return {
    fraction,
    ghost: clamp01((p.anima + Math.max(0, p.burn)) / max),
    critical: fraction <= CRITICAL_FRACTION,
    warn: !p.passivesOnline || fraction <= CRITICAL_FRACTION,
    label: formatAnima(p.anima),
    max: String(Math.round(max))
  }
}

/** Crosshair style for the active antique (DESIGN §17.8). */
export type CrosshairKind = 'dot' | 'spread' | 'ring' | 'scope' | 'lock' | 'arc' | 'beam' | 'charge' | 'gadget' | 'none'

export function crosshairFor(item: ItemId | null | undefined): CrosshairKind {
  if (!item) return 'dot'
  const use = ITEMS[item].use
  switch (use?.kind) {
    case 'semi':
    case 'auto':
      return 'spread'
    case 'spread':
      return 'ring'
    case 'zoom':
      return 'scope'
    case 'lock':
      return 'lock'
    case 'combo':
    case 'slash':
    case 'lunge':
    case 'slam':
      return 'arc'
    case 'beam':
      return 'beam'
    case 'charge':
    case 'lob':
      return 'charge'
    case 'shield':
      return 'none'
    default:
      return 'gadget'
  }
}

/** Spread circle radius in px for a given spread (degrees) and vertical FOV. */
export function spreadRadius(spreadDeg: number, fovDeg: number, viewportHeight: number): number {
  const half = (fovDeg * Math.PI) / 360
  const s = (Math.max(0, spreadDeg) * Math.PI) / 180
  return Math.max(4, (Math.tan(s) / Math.tan(half)) * (viewportHeight / 2))
}

/** Base spread of an antique in degrees (cone for shotguns/lock), 0 for others. */
export function itemSpread(item: ItemId | null | undefined): number {
  if (!item) return 0
  const use = ITEMS[item].use
  if (!use) return 0
  if (use.kind === 'semi' || use.kind === 'auto') return use.spread
  if (use.kind === 'spread' || use.kind === 'lock') return use.cone
  return 0
}

export interface PawCard {
  item: ItemId | null
  name: string
  cost: string
  /** Effective anima per use (or per second for draining antiques); 0 when free. */
  costValue: number
  /** True for held antiques that drain per second (beam, camouflage, shield). */
  drains: boolean
  /** 0..1 of the cooldown ring still to go (0 = ready): remaining / total of the current cooldown. */
  cooldown: number
  /** 0..1 charge / zoom / lock / guard. */
  charge: number
  swapping: boolean
  /** Whether the sim would let this use happen now (anima rule, DESIGN §5). */
  affordable: boolean
  list: { item: ItemId; active: boolean }[]
}

/** What the sim's build applies to costs: the enhancement mods only while the passives are online. */
export interface PawContext {
  passives: readonly ItemId[]
  online: boolean
  anima: number
  /** One tracker per paw so a cooldown remembers its own total. */
  ring?: CooldownRing
}

/** Effective cost (per use, or per second for drains) with the player's enhancement mods, as the sim charges it. */
export function pawCost(item: ItemId, passives: readonly ItemId[], online: boolean): number {
  const c = effectiveCost(passives, online, item)
  return c.cost ?? c.drain ?? 0
}

/** The sim's affordability rule, straight from the sim module. */
export function pawCanUse(item: ItemId, anima: number, passives: readonly ItemId[], online: boolean): boolean {
  return affordable(anima, effectiveCost(passives, online, item))
}

/** Remembers the total of the cooldown that is currently running so the ring sweeps from full to empty. */
export class CooldownRing {
  private total = 0
  private last = 0
  private item: ItemId | null = null
  update(item: ItemId | null, remaining: number): number {
    if (item !== this.item) {
      this.item = item
      this.total = 0
      this.last = 0
    }
    if (remaining <= 0) {
      this.total = 0
      this.last = 0
      return 0
    }
    // A new cooldown starts (from ready) or restarts (the value jumped up): its first value is the total.
    if (this.last <= 0 || remaining > this.last + 1e-4) this.total = remaining
    this.last = remaining
    return clamp01(remaining / Math.max(1e-4, this.total))
  }
}

export function pawCard(hand: HandView | undefined, ctx?: PawContext): PawCard {
  if (!hand || hand.sel < 0 || hand.items.length === 0) {
    ctx?.ring?.update(null, 0)
    return {
      item: null,
      name: '—',
      cost: '',
      costValue: 0,
      drains: false,
      cooldown: 0,
      charge: 0,
      swapping: false,
      affordable: true,
      list: []
    }
  }
  const item = hand.items[Math.min(hand.sel, hand.items.length - 1)]
  const def = ITEMS[item]
  const passives = ctx?.passives ?? []
  const online = ctx?.online ?? true
  const priced = def.cost != null || def.drain != null
  const value = priced ? pawCost(item, passives, online) : 0
  const drains = def.cost == null && def.drain != null
  let cooldown: number
  if (ctx?.ring) cooldown = ctx.ring.update(item, hand.cooldown)
  else {
    const total = def.cooldown ?? useInterval(item)
    cooldown = total > 0 ? clamp01(hand.cooldown / total) : hand.cooldown > 0 ? 1 : 0
  }
  return {
    item,
    name: def.name,
    cost: priced ? (drains ? `${trim(value)}/秒` : trim(value)) : '',
    costValue: value,
    drains,
    cooldown,
    charge: clamp01(hand.charge),
    swapping: hand.swap > 0,
    affordable: ctx ? pawCanUse(item, ctx.anima, passives, online) : true,
    list: hand.items.map((id, i) => ({ item: id, active: i === hand.sel }))
  }
}

function useInterval(item: ItemId): number {
  const use = ITEMS[item].use as { interval?: number } | undefined
  return use?.interval ?? 0
}

const trim = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100))

/** Point on the radar: rotates with the local yaw so "forward" is up. Returns null outside the range. */
export function radarPoint(me: V3, yaw: number, target: V3, range: number, clampEdge = false): [number, number] | null {
  const dx = target[0] - me[0]
  const dz = target[2] - me[2]
  // forward = (sin yaw, cos yaw); right = (−cos yaw, sin yaw)
  const fwd = dx * Math.sin(yaw) + dz * Math.cos(yaw)
  const right = -dx * Math.cos(yaw) + dz * Math.sin(yaw)
  let x = right / range
  let y = -fwd / range
  const len = Math.hypot(x, y)
  if (len > 1) {
    if (!clampEdge) return null
    x /= len
    y /= len
  }
  return [x, y]
}

/** Screen angle (radians, 0 = up/front, clockwise positive) of a world point seen from `me` facing `yaw`. */
export function directionAngle(me: V3, yaw: number, source: V3): number {
  const dx = source[0] - me[0]
  const dz = source[2] - me[2]
  const fwd = dx * Math.sin(yaw) + dz * Math.cos(yaw)
  const right = -dx * Math.cos(yaw) + dz * Math.sin(yaw)
  return Math.atan2(right, fwd)
}

/** Display name of any actor (players by name, foes by kind). */
export function actorName(view: View, ref: ActorRef | undefined): string {
  if (ref == null) return '？'
  if (typeof ref === 'string') return view.players.find((p) => p.id === ref)?.name ?? ref
  const foe = view.foes.find((f) => f.id === ref)
  return foe ? FOES[foe.kind].name : '蝕'
}

export function actorTeam(view: View, ref: ActorRef | undefined): number | 'foe' | null {
  if (ref == null) return null
  if (typeof ref === 'string') return view.players.find((p) => p.id === ref)?.team ?? null
  return 'foe'
}

export function weaponName(item: ShotKind | string | undefined): string {
  if (!item) return ''
  if (item in ITEMS) return ITEMS[item as ItemId].name
  const names: Record<string, string> = {
    acid: '酸',
    laser: '光線',
    plasma: 'プラズマ',
    missile: 'ミサイル',
    acidRain: '酸の雨'
  }
  return names[item] ?? ''
}

export interface FeedEntry {
  id: number
  killer: string
  killerTeam: number | 'foe' | null
  victim: string
  victimTeam: number | 'foe' | null
  weapon: string
  points?: number
  mine: boolean
}

/** Kill feed line from a `ko` event (DESIGN §17.8, top right). Foes killed by bots are skipped in PvE (noise). */
export function feedEntry(view: View, e: Extract<SimEvent, { type: 'ko' }>, me: string): FeedEntry | null {
  const mine = e.by === me || e.who === me
  if (view.mode === 'pve' && typeof e.who === 'number' && !mine) {
    const foe = view.foes.find((f) => f.id === e.who)
    const big = foe ? FOES[foe.kind].hp >= 150 : false
    if (!big) return null
  }
  return {
    id: e.id,
    killer: e.by != null ? actorName(view, e.by) : '',
    killerTeam: actorTeam(view, e.by),
    victim: actorName(view, e.who),
    victimTeam: actorTeam(view, e.who),
    weapon: weaponName(e.item),
    points: e.points,
    mine
  }
}

export function speakerInfo(who: Speaker): { name: string; title: string } {
  if (who === 'genbu' || who === 'ruri' || who === 'kurozume') return SPEAKERS[who]
  const s = SPECIES[who as SpeciesId]
  return s ? { name: s.name, title: s.kind } : { name: '？', title: '' }
}

/** Typewriter: characters shown after `t` seconds at `cps` characters per second. */
export const typedLength = (text: string, t: number, cps = 28) =>
  Math.min(text.length, Math.max(0, Math.floor(t * cps)))

/** Seconds a radio subtitle stays on screen. */
export const radioDuration = (text: string) => Math.min(9, 2.4 + text.length * 0.09)

export interface HitMarker {
  kind: 'hit' | 'head' | 'ko'
  t: number
}

/** Hit marker kind for the local player's hits within one view (ko > head > hit), or null. */
export function hitMarkerFor(events: readonly SimEvent[], me: string): HitMarker['kind'] | null {
  let kind: HitMarker['kind'] | null = null
  for (const e of events) {
    if (e.type === 'ko' && e.by === me) return 'ko'
    if (e.type === 'foeDie' && e.by === me) return 'ko'
    if (e.type === 'hit' && e.by === me && e.targetKind !== 'prop' && !e.negated && e.amount > 0) {
      if (e.head || e.weak) kind = 'head'
      else if (!kind) kind = 'hit'
    }
  }
  return kind
}

/** Sources of hits taken by the local player in this view (for damage direction arcs). */
export function damageSources(view: View, me: string): { at: V3; amount: number }[] {
  const out: { at: V3; amount: number }[] = []
  for (const e of view.events) {
    if (e.type !== 'hit' || e.target !== me || e.amount <= 0 || e.negated) continue
    let at: V3 | undefined
    if (typeof e.by === 'string') at = view.players.find((p) => p.id === e.by)?.p
    else if (typeof e.by === 'number') at = view.foes.find((f) => f.id === e.by)?.p
    out.push({ at: at ?? e.at, amount: e.amount })
  }
  return out
}

export const TEAM_COLORS = ['#e5484d', '#3e8ed0', '#f2b33d'] as const
export const TEAM_NAMES = ['アカネ隊', 'アオイ隊', 'キハダ隊'] as const

/** PvP placings: team indices sorted by score (ties share a place). */
export function placings(scores: readonly number[]): { team: number; score: number; place: number }[] {
  const sorted = scores.map((score, team) => ({ team, score })).sort((a, b) => b.score - a.score || a.team - b.team)
  return sorted.map((s) => ({ ...s, place: 1 + sorted.filter((o) => o.score > s.score).length }))
}

export type StatRow = {
  id: string
  name: string
  species: SpeciesId
  team: number
  bot: boolean
  kos: number
  assists: number
  downs: number
  revives: number
  damage: number
  spent: number
  gathered: number
  favorite: string
}

export function statRows(view: View): StatRow[] {
  return view.players.map((p) => {
    let favorite = '—'
    let best = 0
    for (const [id, amount] of Object.entries(p.stats.byItem ?? {})) {
      if ((amount ?? 0) > best && id in ITEMS) {
        best = amount ?? 0
        favorite = ITEMS[id as ItemId].name
      }
    }
    return {
      id: p.id,
      name: p.name,
      species: p.species,
      team: p.team,
      bot: p.bot,
      kos: p.stats.kos,
      assists: p.stats.assists,
      downs: p.stats.downs,
      revives: p.stats.revives,
      damage: Math.round(p.stats.damage),
      spent: Math.round(p.stats.spent),
      gathered: Math.round(p.stats.gathered),
      favorite
    }
  })
}

/** MVP: the view's choice when given, else the best weighted score. */
export function pickMvp(view: View): string | undefined {
  const given = view.pve?.result?.mvp ?? view.pvp?.mvp
  if (given && view.players.some((p) => p.id === given)) return given
  let best: string | undefined
  let bestScore = -Infinity
  for (const p of view.players) {
    const s =
      p.stats.kos * 100 + p.stats.assists * 40 + p.stats.revives * 80 + p.stats.damage * 0.5 - p.stats.downs * 60
    if (s > bestScore) {
      bestScore = s
      best = p.id
    }
  }
  return best
}

/** Local fallback rank when the sim has none (keeps the results screen meaningful). */
export function fallbackRank(victory: boolean, downs: number): 'S' | 'A' | 'B' | 'C' {
  if (!victory) return 'C'
  return downs === 0 ? 'S' : downs <= 2 ? 'A' : 'B'
}

/** Count-up value for an animated number. */
export const countUp = (target: number, t: number, duration = 1.2) =>
  t >= duration ? target : Math.round(target * (1 - Math.pow(1 - clamp01(t / duration), 3)))

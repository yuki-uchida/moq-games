import {
  BULLET_INDEX,
  BULLET_KINDS,
  ENEMIES,
  ENEMY_BY_ID,
  ENEMY_INDEX,
  EVENTS,
  ITEM_KINDS,
  MAX_GAME_PLAYERS,
  PASSIVE_BY_ID,
  TALENT_CATEGORIES,
  WEAPONS,
  WEAPON_BY_ID,
  WEAPON_INDEX
} from './data'
import { FX_STRIDE, FX_TYPES } from './fx'
import type { GameState } from './game'
import { historyOk, type LifeDecision } from './history'

export { BULLET_KINDS, ITEM_KINDS }

/** What the renderer and HUD draw. Hosts build it locally and broadcast it; guests receive it. */
export interface ViewPlayer {
  id: string
  name: string
  color: string
  x: number
  y: number
  fx: number
  fy: number
  hp: number
  maxHp: number
  downed: boolean
  revive: number
  married: boolean
  hasChild: boolean
  hurt: boolean
  /** Enemy id of the final blow while downed. */
  killer?: string
  parent: string
  weapons: [string, number, number][]
  passives: [string, number][]
  choices: string[]
  choiceSeq: number
  /** Only revealed once a life is over. */
  talents?: Record<string, number>
  history?: LifeDecision[]
}

export interface View {
  v: 4
  time: number
  phase: GameState['phase']
  level: number
  xp: number
  xpNext: number
  kills: number
  players: ViewPlayer[]
  /** Flat: id, enemy index, x, y, hp %, flash, flags (ENEMY_FLAG bits) */
  enemies: number[]
  /** Flat: weapon index, x, y, radius, angle×100, life %, owner index, variant */
  shots: number[]
  /** Flat: x, y, BULLET_KINDS index, angle×100 */
  bullets: number[]
  /** Flat: x, y, value */
  gems: number[]
  /** Flat: kind index, x, y */
  items: number[]
  /** Flat: x, y, value, bits (POPUP_BIT), owner index, life % */
  popups: number[]
  /** Flat: seq, type (FX), x, y, a, b — events of the last fraction of a second, oldest first */
  fx: number[]
  log: { t: number; text: string; to?: string }[]
  reaper: [number, number] | null
}

export const STRIDE = { enemies: 7, shots: 8, bullets: 4, gems: 3, items: 3, popups: 6, fx: FX_STRIDE } as const
/** Bits of an enemy's flags field. */
export const ENEMY_FLAG = { elite: 1, windup: 2, blink: 4, ghost: 8 } as const
/** Bits of a popup's third field. */
export const POPUP_BIT = { strong: 1, crit: 2 } as const
/** Upper bounds a snapshot may carry. */
export const VIEW_CAPS = { enemies: 600, shots: 600, bullets: 200, gems: 400, items: 40, popups: 100, fx: 160 } as const
const r = Math.round

export function toView(state: GameState): View {
  const over = state.phase === 'won' || state.phase === 'lost'
  const ownerIndex = new Map(state.players.map((player, index) => [player.id, index]))
  const enemies: number[] = []
  for (const e of state.enemies) {
    const flags =
      (e.elite ? ENEMY_FLAG.elite : 0) |
      (e.windup > 0 ? ENEMY_FLAG.windup : 0) |
      (e.blink > 0 ? ENEMY_FLAG.blink : 0) |
      (ENEMY_BY_ID.get(e.kind)!.behavior === 'ghost' ? ENEMY_FLAG.ghost : 0)
    enemies.push(
      e.id,
      ENEMY_INDEX.get(e.kind)!,
      r(e.x),
      r(e.y),
      Math.max(0, r((e.hp / e.maxHp) * 100)),
      e.flash > 0 ? 1 : 0,
      flags
    )
  }
  const shots: number[] = []
  for (const s of state.shots) {
    // Staples waiting for their turn do not exist yet.
    if (s.delay > 0) continue
    shots.push(
      WEAPON_INDEX.get(s.weapon)!,
      r(s.x),
      r(s.y),
      r(s.r),
      r(s.angle * 100) % 100000,
      r((s.life / s.maxLife) * 100),
      ownerIndex.get(s.owner) ?? 0,
      r(s.v)
    )
  }
  const bullets: number[] = []
  for (const b of state.bullets) bullets.push(r(b.x), r(b.y), b.kind, r(Math.atan2(b.vy, b.vx) * 100))
  const fx: number[] = []
  for (const e of state.fx) fx.push(e.seq, e.type, e.x, e.y, e.a, e.b)
  const gems: number[] = []
  for (const g of state.gems) gems.push(r(g.x), r(g.y), r(g.v))
  const items: number[] = []
  for (const i of state.items) items.push(ITEM_KINDS.indexOf(i.kind), r(i.x), r(i.y))
  const popups: number[] = []
  for (const p of state.popups)
    popups.push(
      r(p.x),
      r(p.y),
      p.v,
      (p.strong ? POPUP_BIT.strong : 0) | (p.crit ? POPUP_BIT.crit : 0),
      ownerIndex.get(p.owner) ?? 0,
      r((p.life / 0.6) * 100)
    )
  return {
    v: 4,
    time: Math.round(state.time * 100) / 100,
    phase: state.phase,
    level: state.level,
    xp: Math.floor(state.xp),
    xpNext: state.xpNext,
    kills: state.kills,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      x: r(p.x),
      y: r(p.y),
      fx: Math.round(p.fx * 100) / 100,
      fy: Math.round(p.fy * 100) / 100,
      hp: r(p.hp),
      maxHp: r(p.maxHp),
      downed: p.downed,
      revive: Math.round(p.revive * 100) / 100,
      married: p.married,
      hasChild: p.hasChild,
      hurt: p.hurt > 0,
      ...(p.downed && p.killer ? { killer: p.killer } : {}),
      parent: p.parent,
      weapons: p.weapons.map((w) => [w.id, w.lv, r(w.damage)]),
      passives: p.passives.map((s) => [s.id, s.lv]),
      choices: p.choices,
      choiceSeq: p.choiceSeq,
      ...(over ? { talents: { ...p.talents }, history: p.history.map((decision) => ({ ...decision })) } : {})
    })),
    enemies,
    shots,
    bullets,
    gems,
    items,
    popups,
    fx,
    log: state.log.slice(),
    reaper: state.reaper ? [r(state.reaper.x), r(state.reaper.y)] : null
  }
}

const finite = (value: unknown, lo = -1e7, hi = 1e7): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= lo && value <= hi
const text = (value: unknown, max = 160): value is string => typeof value === 'string' && value.length <= max
const flat = (value: unknown, stride: number, max: number) =>
  Array.isArray(value) && value.length % stride === 0 && value.length <= stride * max && value.every((n) => finite(n))
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object'
const choiceOk = (value: unknown) => {
  if (!text(value, 40)) return false
  const [kind, id, replacement] = value.split(':')
  if (kind === 's') return WEAPON_BY_ID.has(id) && replacement === undefined
  if (kind === 'r') return WEAPON_BY_ID.has(id) && WEAPON_BY_ID.has(replacement)
  return kind === 'w'
    ? WEAPON_BY_ID.has(id)
    : kind === 'p'
      ? PASSIVE_BY_ID.has(id)
      : value === 'x:meal' || value === 'x:coin' || value === 'x:skip'
}

function playerOk(value: unknown): value is ViewPlayer {
  if (!record(value)) return false
  const p = value
  return (
    text(p.id, 64) &&
    text(p.name, 16) &&
    text(p.color, 16) &&
    /^#[0-9a-f]{6}$/i.test(p.color) &&
    [p.x, p.y, p.fx, p.fy, p.hp, p.maxHp, p.revive, p.choiceSeq].every((n) => finite(n)) &&
    typeof p.downed === 'boolean' &&
    typeof p.hurt === 'boolean' &&
    typeof p.married === 'boolean' &&
    typeof p.hasChild === 'boolean' &&
    (!p.hasChild || p.married) &&
    (p.killer === undefined || (text(p.killer, 40) && ENEMY_BY_ID.has(p.killer))) &&
    text(p.parent) &&
    WEAPON_BY_ID.has(p.parent) &&
    Array.isArray(p.weapons) &&
    p.weapons.length <= 12 &&
    p.weapons.every((w) => Array.isArray(w) && WEAPON_BY_ID.has(w[0]) && finite(w[1], 1, 8) && finite(w[2], 0, 1e12)) &&
    Array.isArray(p.passives) &&
    p.passives.length <= 12 &&
    p.passives.every((s) => Array.isArray(s) && PASSIVE_BY_ID.has(s[0]) && finite(s[1], 1, 5)) &&
    Array.isArray(p.choices) &&
    p.choices.length <= 8 &&
    p.choices.every(choiceOk) &&
    (p.talents === undefined ||
      (record(p.talents) && TALENT_CATEGORIES.every((c) => finite((p.talents as Record<string, unknown>)[c], 0, 5))))
  )
}

/** Validates an untrusted snapshot from the relay before anything reads it. */
export function readView(value: unknown): View | undefined {
  if (!record(value) || value.v !== 4) return undefined
  const v = value
  const ok =
    [v.time, v.level, v.xp, v.xpNext, v.kills].every((n) => finite(n, 0, 1e9)) &&
    ['playing', 'reaper', 'won', 'lost'].includes(v.phase as string) &&
    Array.isArray(v.players) &&
    v.players.length <= MAX_GAME_PLAYERS &&
    v.players.every(
      (p) =>
        playerOk(p) &&
        (v.phase === 'won' || v.phase === 'lost'
          ? p.history === undefined || historyOk(p.history, v.time as number)
          : p.talents === undefined && p.history === undefined)
    ) &&
    flat(v.enemies, STRIDE.enemies, VIEW_CAPS.enemies) &&
    flat(v.shots, STRIDE.shots, VIEW_CAPS.shots) &&
    flat(v.bullets, STRIDE.bullets, VIEW_CAPS.bullets) &&
    flat(v.gems, STRIDE.gems, VIEW_CAPS.gems) &&
    flat(v.items, STRIDE.items, VIEW_CAPS.items) &&
    flat(v.popups, STRIDE.popups, VIEW_CAPS.popups) &&
    flat(v.fx, STRIDE.fx, VIEW_CAPS.fx) &&
    Array.isArray(v.log) &&
    v.log.length <= 12 &&
    v.log.every((e) => record(e) && finite(e.t) && text(e.text) && (e.to === undefined || text(e.to, 64))) &&
    (v.reaper === null || (Array.isArray(v.reaper) && v.reaper.length === 2 && v.reaper.every((n) => finite(n))))
  if (!ok) return undefined
  if (new Set((v.players as ViewPlayer[]).map((player) => player.id)).size !== (v.players as ViewPlayer[]).length)
    return undefined
  const weddingAt = Math.round(EVENTS.find((event) => event.boss === 'b_wedding')!.at * 100) / 100
  const birthAt = Math.round(EVENTS.find((event) => event.swarm === 'nightcry')!.at * 100) / 100
  if (
    (v.players as ViewPlayer[]).some(
      (player) =>
        (player.married && (v.time as number) < weddingAt) || (player.hasChild && (v.time as number) < birthAt)
    )
  )
    return undefined
  const enemies = v.enemies as number[]
  for (let i = 0; i < enemies.length; i += STRIDE.enemies)
    if (!ENEMIES[enemies[i + 1]] || !Number.isInteger(enemies[i + 6]) || enemies[i + 6] < 0 || enemies[i + 6] > 15)
      return undefined
  const shots = v.shots as number[]
  for (let i = 0; i < shots.length; i += STRIDE.shots)
    if (!WEAPONS[shots[i]] || !Number.isInteger(shots[i + 7]) || shots[i + 7] < 0 || shots[i + 7] > 99) return undefined
  const bullets = v.bullets as number[]
  for (let i = 0; i < bullets.length; i += STRIDE.bullets) if (!BULLET_KINDS[bullets[i + 2]]) return undefined
  const popups = v.popups as number[]
  for (let i = 0; i < popups.length; i += STRIDE.popups)
    if (!Number.isInteger(popups[i + 3]) || popups[i + 3] < 0 || popups[i + 3] > 3) return undefined
  const fx = v.fx as number[]
  let last = -1
  for (let i = 0; i < fx.length; i += STRIDE.fx) {
    if (!Number.isInteger(fx[i]) || fx[i] <= last || !FX_TYPES.includes(fx[i + 1])) return undefined
    last = fx[i]
  }
  const items = v.items as number[]
  for (let i = 0; i < items.length; i += STRIDE.items) if (!ITEM_KINDS[items[i]]) return undefined
  return v as unknown as View
}

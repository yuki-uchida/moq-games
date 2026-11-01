import { ENEMIES, ENEMY_INDEX, MAX_GAME_PLAYERS, PASSIVE_BY_ID, TALENT_CATEGORIES, WEAPONS, WEAPON_BY_ID } from './data'
import type { GameState } from './game'

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
  hurt: boolean
  parent: string
  weapons: [string, number, number][]
  passives: [string, number][]
  choices: string[]
  choiceSeq: number
  /** Only revealed once a life is over. */
  talents?: Record<string, number>
}

export interface View {
  v: 1
  time: number
  phase: GameState['phase']
  level: number
  xp: number
  xpNext: number
  kills: number
  players: ViewPlayer[]
  /** Flat: id, enemy index, x, y, hp %, flash */
  enemies: number[]
  /** Flat: weapon index, x, y, radius, angle×100, life %, owner index */
  shots: number[]
  /** Flat: x, y, value */
  gems: number[]
  /** Flat: kind index, x, y */
  items: number[]
  /** Flat: x, y, value, strong, owner index, life % */
  popups: number[]
  log: { t: number; text: string; to?: string }[]
  reaper: [number, number] | null
}

export const STRIDE = { enemies: 6, shots: 7, gems: 3, items: 3, popups: 6 } as const
export const ITEM_KINDS = ['meal', 'chest', 'magnet'] as const
const WEAPON_INDEX = new Map(WEAPONS.map((def, index) => [def.id, index]))
const r = Math.round

export function toView(state: GameState): View {
  const over = state.phase === 'won' || state.phase === 'lost'
  const ownerIndex = new Map(state.players.map((player, index) => [player.id, index]))
  const enemies: number[] = []
  for (const e of state.enemies)
    enemies.push(
      e.id,
      ENEMY_INDEX.get(e.kind)!,
      r(e.x),
      r(e.y),
      Math.max(0, r((e.hp / e.maxHp) * 100)),
      e.flash > 0 ? 1 : 0
    )
  const shots: number[] = []
  for (const s of state.shots)
    shots.push(
      WEAPON_INDEX.get(s.weapon)!,
      r(s.x),
      r(s.y),
      r(s.r),
      r(s.angle * 100) % 100000,
      r((s.life / s.maxLife) * 100),
      ownerIndex.get(s.owner) ?? 0
    )
  const gems: number[] = []
  for (const g of state.gems) gems.push(r(g.x), r(g.y), r(g.v))
  const items: number[] = []
  for (const i of state.items) items.push(ITEM_KINDS.indexOf(i.kind), r(i.x), r(i.y))
  const popups: number[] = []
  for (const p of state.popups)
    popups.push(r(p.x), r(p.y), p.v, p.strong ? 1 : 0, ownerIndex.get(p.owner) ?? 0, r((p.life / 0.6) * 100))
  return {
    v: 1,
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
      hurt: p.hurt > 0,
      parent: p.parent,
      weapons: p.weapons.map((w) => [w.id, w.lv, r(w.damage)]),
      passives: p.passives.map((s) => [s.id, s.lv]),
      choices: p.choices,
      choiceSeq: p.choiceSeq,
      ...(over ? { talents: { ...p.talents } } : {})
    })),
    enemies,
    shots,
    gems,
    items,
    popups,
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
  const [kind, id] = value.split(':')
  return kind === 'w'
    ? WEAPON_BY_ID.has(id)
    : kind === 'p'
      ? PASSIVE_BY_ID.has(id)
      : value === 'x:meal' || value === 'x:coin'
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
    text(p.parent) &&
    WEAPON_BY_ID.has(p.parent) &&
    Array.isArray(p.weapons) &&
    p.weapons.length <= 12 &&
    p.weapons.every((w) => Array.isArray(w) && WEAPON_BY_ID.has(w[0]) && finite(w[1], 1, 8) && finite(w[2], 0, 1e12)) &&
    Array.isArray(p.passives) &&
    p.passives.length <= 12 &&
    p.passives.every((s) => Array.isArray(s) && PASSIVE_BY_ID.has(s[0]) && finite(s[1], 1, 5)) &&
    Array.isArray(p.choices) &&
    p.choices.length <= 4 &&
    p.choices.every(choiceOk) &&
    (p.talents === undefined ||
      (record(p.talents) && TALENT_CATEGORIES.every((c) => finite((p.talents as Record<string, unknown>)[c], 0, 5))))
  )
}

/** Validates an untrusted snapshot from the relay before anything reads it. */
export function readView(value: unknown): View | undefined {
  if (!record(value) || value.v !== 1) return undefined
  const v = value
  const ok =
    [v.time, v.level, v.xp, v.xpNext, v.kills].every((n) => finite(n, 0, 1e9)) &&
    ['playing', 'reaper', 'won', 'lost'].includes(v.phase as string) &&
    Array.isArray(v.players) &&
    v.players.length <= MAX_GAME_PLAYERS &&
    v.players.every(playerOk) &&
    flat(v.enemies, STRIDE.enemies, 600) &&
    flat(v.shots, STRIDE.shots, 600) &&
    flat(v.gems, STRIDE.gems, 400) &&
    flat(v.items, STRIDE.items, 40) &&
    flat(v.popups, STRIDE.popups, 100) &&
    Array.isArray(v.log) &&
    v.log.length <= 12 &&
    v.log.every((e) => record(e) && finite(e.t) && text(e.text) && (e.to === undefined || text(e.to, 64))) &&
    (v.reaper === null || (Array.isArray(v.reaper) && v.reaper.length === 2 && v.reaper.every((n) => finite(n))))
  if (!ok) return undefined
  const enemies = v.enemies as number[]
  for (let i = 1; i < enemies.length; i += STRIDE.enemies) if (!ENEMIES[enemies[i]]) return undefined
  const shots = v.shots as number[]
  for (let i = 0; i < shots.length; i += STRIDE.shots) if (!WEAPONS[shots[i]]) return undefined
  const items = v.items as number[]
  for (let i = 0; i < items.length; i += STRIDE.items) if (!ITEM_KINDS[items[i]]) return undefined
  return v as unknown as View
}

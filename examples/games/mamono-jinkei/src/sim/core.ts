/** Small helpers every sim module uses: events, forces, lookups. */
import type { SfxName } from '../audio/api'
import { TILE } from '../vocab'
import { roomAt } from './stage-data'
import type { Hero, WorldState } from './state'
import type { EventKind } from './types'

export const EVENT_WINDOW = 2
export const EVENT_MAX = 60

export function emit(
  W: WorldState,
  k: EventKind,
  x: number,
  y: number,
  extra: { a?: number; b?: number; s?: string } = {}
): void {
  W.events.push({ id: ++W.nextEvent, t: r2(W.t), k, x: Math.round(x), y: Math.round(y), ...extra })
  while (W.events.length > EVENT_MAX) W.events.shift()
}
export const sfx = (W: WorldState, name: SfxName, x: number, y: number) => emit(W, 'sfx', x, y, { s: name })
export const fx = (W: WorldState, name: string, x: number, y: number, a?: number) =>
  emit(W, 'fx', x, y, a === undefined ? { s: name } : { s: name, a: r2(a) })
export const pop = (W: WorldState, text: string, x: number, y: number, colour = -1) =>
  emit(W, 'pop', x, y, { s: text, a: colour })
export const burst = (W: WorldState, kind: string, x: number, y: number, n = 8) =>
  emit(W, 'burst', x, y, { s: kind, a: n })
export const shake = (W: WorldState, px: number) => emit(W, 'shake', 0, 0, { a: px })
export const stop = (W: WorldState, ms: number) => emit(W, 'stop', 0, 0, { a: ms })
export const banner = (W: WorldState, text: string) => emit(W, 'banner', 0, 0, { s: text })

export function pruneEvents(W: WorldState): void {
  while (W.events.length && W.events[0].t < W.t - EVENT_WINDOW) W.events.shift()
}

export const r1 = (v: number) => Math.round(v * 10) / 10
export const r2 = (v: number) => Math.round(v * 100) / 100

export const newId = (W: WorldState) => ++W.nextId

/** Slash direction index for `slash_<turn>` (16 turns, 0 = right, clockwise on screen). */
export const turnOf = (a: number) => ((Math.round(a / (Math.PI / 8)) % 16) + 16) % 16

export function angleDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

/** Host-imposed position (the owner's predictor must apply it). */
export function warpHero(h: Hero, x: number, y: number): void {
  h.body.x = x
  h.body.y = y
  h.body.vx = h.body.vy = h.body.kx = h.body.ky = 0
  h.force = { seq: ++h.forceSeq, kind: 'warp', x: r1(x), y: r1(y), vx: 0, vy: 0 }
  h.accepted = undefined
}

/** Host-imposed knockback velocity. */
export function impulseHero(h: Hero, vx: number, vy: number): void {
  h.body.kx += vx
  h.body.ky += vy
  h.force = { seq: ++h.forceSeq, kind: 'impulse', x: r1(h.body.x), y: r1(h.body.y), vx: r1(vx), vy: r1(vy) }
}

export const heroBy = (W: WorldState, slot: number) => W.heroes.find((h) => h.slot === slot)

/** Heroes that count for formations, plates, revives (alive and on the field). */
export const active = (h: Hero) => h.state !== 'down' && h.state !== 'fall'

export function formSize(W: WorldState, h: Hero): number {
  return h.form >= 0 ? (W.formations[h.form]?.slots.length ?? 1) : 1
}

export function roomOf(W: WorldState, x: number, y: number) {
  return W.parsed ? roomAt(W.parsed.info.rooms, x, y) : undefined
}

export const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by)
export const tileOf = (v: number) => Math.floor(v / TILE)

/** Nearest free ground tile centre to (x, y) (spiral search). */
export function freeSpotNear(
  W: WorldState,
  x: number,
  y: number,
  maxR = 6,
  ok?: (tx: number, ty: number) => boolean
): { x: number; y: number } {
  const g = W.grid!
  const tx = tileOf(x)
  const ty = tileOf(y)
  for (let r = 0; r <= maxR; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        if (g.free(tx + dx, ty + dy) && (!ok || ok(tx + dx, ty + dy)))
          return { x: (tx + dx) * TILE + TILE / 2, y: (ty + dy) * TILE + TILE / 2 }
      }
  return { x, y }
}

/** The hero a human controls, else the first hero. */
export function leader(W: WorldState): Hero | undefined {
  const host = W.humans.find((h) => !h.spectator)
  return (host && heroBy(W, host.ctrl)) ?? W.heroes[0]
}

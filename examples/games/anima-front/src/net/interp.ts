/**
 * View interpolation (DESIGN §18), pure and unit-tested:
 *
 * - interpolateView: blends two views of the same match (positions, velocities, yaw/pitch, anima, hp, timers) by
 *   id; anything that exists only in the newer view appears as it is there.
 * - SnapshotBuffer: guests keep the last snapshots and draw remote entities ~100 ms behind the estimated host
 *   time, so 20 Hz snapshots look like 60+ Hz motion.
 * - EventQueue: hands out every event exactly once (by id), when the drawn time reaches it.
 */
import type { FoeView, PlayerView, PropView, ShardView, ShotView, SimEvent, V3, View } from '../sim/types'

/** Remote entities are drawn this far behind the estimated host time. */
export const RENDER_DELAY = 0.1
const KEEP = 10
/** Teleports (respawn, warp, pads) are not blended across more than this distance per snapshot gap. */
const SNAP_DISTANCE = 6

export const lerp = (a: number, b: number, k: number) => a + (b - a) * k

/** Interpolates angles along the shorter arc. */
export function lerpAngle(a: number, b: number, k: number): number {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return a + d * k
}

export function lerpV3(a: readonly number[], b: readonly number[], k: number): V3 {
  return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)]
}

const far = (a: readonly number[], b: readonly number[]) =>
  Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) > SNAP_DISTANCE

function byId<T extends { id: string | number }>(list: readonly T[]): Map<string | number, T> {
  const m = new Map<string | number, T>()
  for (const x of list) m.set(x.id, x)
  return m
}

function blendPlayer(a: PlayerView, b: PlayerView, k: number): PlayerView {
  if (a.state !== b.state || far(a.p, b.p)) return b
  return {
    ...b,
    p: lerpV3(a.p, b.p, k),
    v: lerpV3(a.v, b.v, k),
    yaw: lerpAngle(a.yaw, b.yaw, k),
    pitch: lerp(a.pitch, b.pitch, k),
    anima: lerp(a.anima, b.anima, k),
    cloak: lerp(a.cloak, b.cloak, k),
    revive: b.revive >= a.revive ? lerp(a.revive, b.revive, k) : b.revive
  }
}

function blendFoe(a: FoeView, b: FoeView, k: number): FoeView {
  if (far(a.p, b.p)) return b
  const out: FoeView = { ...b, p: lerpV3(a.p, b.p, k), yaw: lerpAngle(a.yaw, b.yaw, k), hp: lerp(a.hp, b.hp, k) }
  if (a.state === b.state) out.st = lerp(a.st, b.st, k)
  if (a.animal && b.animal) out.animal = { ...b.animal, pitch: lerp(a.animal.pitch, b.animal.pitch, k) }
  return out
}

function blendShot(a: ShotView, b: ShotView, k: number): ShotView {
  if (far(a.p, b.p)) return b
  return { ...b, p: lerpV3(a.p, b.p, k) }
}

function blendProp(a: PropView, b: PropView, k: number): PropView {
  const out: PropView = { ...b, t: lerp(a.t, b.t, k) }
  if (!far(a.p, b.p)) out.p = lerpV3(a.p, b.p, k)
  if (a.yaw !== b.yaw) out.yaw = lerpAngle(a.yaw, b.yaw, k)
  if (a.hp !== undefined && b.hp !== undefined) out.hp = lerp(a.hp, b.hp, k)
  if (a.life !== undefined && b.life !== undefined) out.life = lerp(a.life, b.life, k)
  if (a.state !== undefined && b.state !== undefined && a.kind !== 'tutorial') out.state = lerp(a.state, b.state, k)
  return out
}

function blendShard(a: ShardView, b: ShardView, k: number): ShardView {
  return far(a.p, b.p) ? b : { ...b, p: lerpV3(a.p, b.p, k) }
}

function blendList<T extends { id: string | number }>(
  a: readonly T[],
  b: readonly T[],
  k: number,
  blend: (x: T, y: T, k: number) => T
): T[] {
  if (!a.length) return b.slice()
  const prev = byId(a)
  return b.map((y) => {
    const x = prev.get(y.id)
    return x ? blend(x, y, k) : y
  })
}

/**
 * The view between `a` (k = 0) and `b` (k = 1): everything listed in `b`, blended with its counterpart in `a`.
 * Discrete state (phase, hands, mode views, events) comes from `b`; `events` is left empty.
 */
export function interpolateView(a: View, b: View, k: number): View {
  const t = k <= 0 ? 0 : k >= 1 ? 1 : k
  if (t === 1) return { ...b, events: [] }
  return {
    ...b,
    time: lerp(a.time, b.time, t),
    clock: Math.abs(b.clock - a.clock) < 2 ? lerp(a.clock, b.clock, t) : b.clock,
    players: blendList(a.players, b.players, t, blendPlayer),
    foes: blendList(a.foes, b.foes, t, blendFoe),
    shots: blendList(a.shots, b.shots, t, blendShot),
    props: blendList(a.props, b.props, t, blendProp),
    shards: blendList(a.shards, b.shards, t, blendShard),
    events: []
  }
}

/** Keeps recent snapshots and estimates the host clock from their arrival times. */
export class SnapshotBuffer {
  private snaps: View[] = []
  /** host time − local seconds, smoothed. */
  private offset: number | undefined

  get latest(): View | undefined {
    return this.snaps[this.snaps.length - 1]
  }

  get size() {
    return this.snaps.length
  }

  clear() {
    this.snaps = []
    this.offset = undefined
  }

  /** Adds a snapshot received at local time `now` (seconds). Out-of-order or duplicate snapshots are dropped. */
  push(view: View, now: number): boolean {
    const last = this.latest
    if (last && view.tick <= last.tick) return false
    this.snaps.push(view)
    if (this.snaps.length > KEEP) this.snaps.shift()
    const o = view.time - now
    // Track the earliest arrival (least delayed), drifting slowly so jitter does not shake the clock.
    if (this.offset === undefined || Math.abs(o - this.offset) > 0.5) this.offset = o
    else this.offset = o > this.offset ? this.offset + (o - this.offset) * 0.05 : o * 0.3 + this.offset * 0.7
    return true
  }

  /** Estimated current host time. */
  hostTime(now: number): number {
    const last = this.latest
    if (!last) return 0
    return this.offset === undefined ? last.time : now + this.offset
  }

  /** The interpolated view at host time `t` (clamped to the buffered range; events are left empty). */
  sample(t: number): View | undefined {
    const n = this.snaps.length
    if (!n) return undefined
    const last = this.snaps[n - 1]
    if (n === 1 || t >= last.time) return { ...last, events: [] }
    if (t <= this.snaps[0].time) return { ...this.snaps[0], events: [] }
    let i = n - 2
    while (i > 0 && this.snaps[i].time > t) i--
    const a = this.snaps[i]
    const b = this.snaps[i + 1]
    const k = b.time > a.time ? (t - a.time) / (b.time - a.time) : 1
    return interpolateView(a, b, k)
  }
}

/** Events in id order, each handed out once when the drawn time reaches it. */
export class EventQueue {
  private pending: SimEvent[] = []
  private lastId = 0
  /** Events this far behind the newest one are dropped (late joiners, hidden tabs). */
  constructor(private readonly maxAge = 1) {}

  /** Adds events; duplicates and anything at or below the last id handed out are ignored. */
  add(events: readonly SimEvent[], newest?: number) {
    const top = this.pending.length ? this.pending[this.pending.length - 1].id : this.lastId
    let sorted = true
    for (const e of events) {
      if (!e || typeof e.id !== 'number' || e.id <= this.lastId) continue
      if (this.pending.some((p) => p.id === e.id)) continue
      if (e.id < top) sorted = false
      this.pending.push(e)
    }
    if (!sorted) this.pending.sort((x, y) => x.id - y.id)
    if (newest !== undefined) this.skipBefore(newest - this.maxAge)
  }

  /** Hands out the events whose time is ≤ t. */
  take(t: number): SimEvent[] {
    const out: SimEvent[] = []
    let i = 0
    while (i < this.pending.length && this.pending[i].t <= t + 1e-6) {
      out.push(this.pending[i])
      i++
    }
    if (i) {
      this.pending.splice(0, i)
      this.lastId = Math.max(this.lastId, out[out.length - 1].id)
    }
    return out
  }

  /** Drops everything older than t. */
  skipBefore(t: number) {
    let i = 0
    while (i < this.pending.length && this.pending[i].t < t) i++
    if (i) {
      this.lastId = Math.max(this.lastId, this.pending[i - 1].id)
      this.pending.splice(0, i)
    }
  }

  get size() {
    return this.pending.length
  }
}

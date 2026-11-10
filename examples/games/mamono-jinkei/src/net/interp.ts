/**
 * Guest-side snapshot interpolation (DESIGN §13): snapshots arrive at ~20 Hz; remote entities are drawn between the
 * two snapshots that bracket `render time ≈ estimated host time − 0.1 s`. Pure (no DOM) for unit tests.
 */
import type { BossView, EnemyView, HeroView, ShotView, TechView, View } from '../sim/types'

export const RENDER_DELAY = 0.1
const KEEP = 8

export const lerp = (a: number, b: number, k: number) => a + (b - a) * k

/** Interpolates angles along the shorter arc. */
export function lerpAngle(a: number, b: number, k: number): number {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return a + d * k
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
    if (last && (view.seq <= last.seq || view.t < last.t)) {
      // A world restart (new host session) resets time; accept it as a fresh start.
      if (view.t < last.t - 2) this.clear()
      else return false
    }
    this.snaps.push(view)
    if (this.snaps.length > KEEP) this.snaps.shift()
    const o = view.t - now
    // Track the earliest arrival (least delayed), drifting slowly so jitter does not shake the clock.
    if (this.offset === undefined || Math.abs(o - this.offset) > 0.5) this.offset = o
    else this.offset = o > this.offset ? this.offset + (o - this.offset) * 0.05 : o * 0.3 + this.offset * 0.7
    return true
  }

  /** Estimated current host time. */
  hostTime(now: number): number {
    const last = this.latest
    if (!last) return 0
    return this.offset === undefined ? last.t : now + this.offset
  }

  /** The interpolated view at render time `t` (clamped to the buffered range, small extrapolation allowed). */
  sample(t: number): View | undefined {
    const n = this.snaps.length
    if (!n) return undefined
    const last = this.snaps[n - 1]
    if (n === 1 || t >= last.t) return withTime(last, Math.min(t, last.t + 0.1))
    if (t <= this.snaps[0].t) return this.snaps[0]
    let i = n - 2
    while (i > 0 && this.snaps[i].t > t) i--
    const a = this.snaps[i]
    const b = this.snaps[i + 1]
    const k = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1
    return interpolateView(a, b, k, t)
  }
}

function withTime(v: View, t: number): View {
  if (t === v.t) return v
  const dt = t - v.t
  return { ...v, t, shots: v.shots.map((s) => ({ ...s, x: s.x + s.vx * dt, y: s.y + s.vy * dt })) }
}

function byKey<T>(list: readonly T[], key: (x: T) => number): Map<number, T> {
  const m = new Map<number, T>()
  for (const x of list) m.set(key(x), x)
  return m
}

const lerpHero = (a: HeroView | undefined, b: HeroView, k: number): HeroView =>
  !a
    ? b
    : {
        ...b,
        x: lerp(a.x, b.x, k),
        y: lerp(a.y, b.y, k),
        z: lerp(a.z, b.z, k),
        facing: lerpAngle(a.facing, b.facing, k),
        aim: lerpAngle(a.aim, b.aim, k)
      }

const lerpEnemy = (a: EnemyView | undefined, b: EnemyView, k: number): EnemyView =>
  !a ? b : { ...b, x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), facing: lerpAngle(a.facing, b.facing, k) }

const lerpBoss = (a: BossView | undefined, b: BossView, k: number): BossView =>
  !a || a.id !== b.id
    ? b
    : {
        ...b,
        x: lerp(a.x, b.x, k),
        y: lerp(a.y, b.y, k),
        z: lerp(a.z, b.z, k),
        facing: lerpAngle(a.facing, b.facing, k)
      }

const lerpShot = (a: ShotView | undefined, b: ShotView, k: number, dt: number): ShotView =>
  a
    ? { ...b, x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), z: lerp(a.z, b.z, k) }
    : { ...b, x: b.x + b.vx * dt, y: b.y + b.vy * dt }

const lerpTech = (a: TechView | undefined, b: TechView, k: number): TechView =>
  !a || a.stage !== b.stage ? b : { ...b, x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), z: lerp(a.z, b.z, k) }

/** Entities of `b` with positions blended from `a` by `k`; discrete state comes from `b`. */
export function interpolateView(a: View, b: View, k: number, t: number): View {
  if (a.stage !== b.stage || a.phase !== b.phase) return k < 0.5 ? { ...a, t } : { ...b, t }
  const ah = byKey(a.heroes, (h) => h.slot)
  const ae = byKey(a.enemies, (e) => e.id)
  const as = byKey(a.shots, (s) => s.id)
  const at = byKey(a.techs, (x) => x.id)
  const ap = byKey(a.props, (p) => p.id)
  const dt = t - b.t
  return {
    ...b,
    t,
    heroes: b.heroes.map((h) => lerpHero(ah.get(h.slot), h, k)),
    enemies: b.enemies.map((e) => lerpEnemy(ae.get(e.id), e, k)),
    boss: b.boss ? lerpBoss(a.boss, b.boss, k) : undefined,
    shots: b.shots.map((s) => lerpShot(as.get(s.id), s, k, dt)),
    techs: b.techs.map((x) => lerpTech(at.get(x.id), x, k)),
    props: b.props.map((p) => {
      const q = ap.get(p.id)
      // Carried/lifted props move with their carriers; sliding blocks animate from their own from/to.
      if (!q || p.from || (q.x === p.x && q.y === p.y && q.z === p.z)) return p
      return { ...p, x: lerp(q.x, p.x, k), y: lerp(q.y, p.y, k), z: lerp(q.z ?? 0, p.z ?? 0, k) }
    }),
    formations: b.formations.map((f, i) => {
      const q = a.formations[i]
      return q && q.slots.join() === f.slots.join() ? { ...f, x: lerp(q.x, f.x, k), y: lerp(q.y, f.y, k) } : f
    })
  }
}

/** Plays each event id once, in order, when its time has been reached. */
export class EventQueue<E extends { id: number; t: number }> {
  private last = -1
  private pending: E[] = []

  /** Forgets everything (new world/session). `skipBefore` drops events older than a host time. */
  reset(): void {
    this.last = -1
    this.pending = []
  }

  get lastId() {
    return this.last
  }

  /** Adds unseen events; on the first batch, events older than `freshAfter` are skipped (late joins). */
  add(events: readonly E[], freshAfter = -Infinity): void {
    const first = this.last < 0
    for (const e of events) {
      if (e.id <= this.last) continue
      this.last = e.id
      if (first && e.t < freshAfter) continue
      this.pending.push(e)
    }
  }

  /** Drops pending events older than host time `t` (their ids stay seen, so they never come back). */
  skipBefore(t: number): void {
    this.pending = this.pending.filter((e) => e.t >= t)
  }

  /** Removes and returns the events due at time `t`. */
  take(t: number, out: E[]): E[] {
    out.length = 0
    let keep = 0
    for (const e of this.pending) {
      if (e.t <= t) out.push(e)
      else this.pending[keep++] = e
    }
    this.pending.length = keep
    return out
  }
}

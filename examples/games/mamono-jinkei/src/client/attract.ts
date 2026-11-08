/**
 * The attract demo behind the title: a real World on stage 1 with a scripted leader that wanders the starting
 * meadow, cuts grass, fights the rookies and now and then fires the King Slime press with its formation.
 */
import { demoSession, type Session } from '../net/session'
import type { World } from '../sim/api'
import { NO_INPUT, type InputState, type View } from '../sim/types'
import { TILE, TILE_KINDS, type StageId } from '../vocab'

const T = (n: number) => n * TILE + TILE / 2
const WAYPOINTS: [number, number][] = [
  [6, 57],
  [11, 55],
  [15, 54],
  [19, 56],
  [21, 59],
  [16, 61],
  [10, 60],
  [5, 59],
  [4, 54],
  [8, 53]
]
/** Seconds per stage before the demo fades to the next one (slime → rat → crow → wolf). */
const STAGE_TIME = 26
const FADE = 0.8
const ORDER: StageId[] = ['meadow', 'sewer', 'tower', 'forest']
/**
 * Where each later stage's demo plays: an open room away from the map's left edge, so the camera can keep the party
 * in the clear right part of the screen beside the title menu.
 */
const DEMO_ROOM: Partial<Record<StageId, string>> = { sewer: 'B', tower: 'C', forest: 'B' }

export class Attract {
  session!: Session & { world: World }
  private input: InputState & { aimDist?: number } = { ...NO_INPUT }
  private wp = 0
  private age = 0
  private nextTap = 0
  private releaseNext = false
  private chargeUntil = -1
  private nextPress = 9
  private stuck = 0
  private lastPos = { x: 0, y: 0 }
  private stageIndex = 0
  /** Wander targets for stages without hand-placed waypoints (around the spawn, on walkable ground). */
  private home?: { x: number; y: number }
  private goal?: { x: number; y: number }

  constructor() {
    this.restart()
  }

  get stage(): StageId {
    return ORDER[this.stageIndex % ORDER.length]
  }

  /** 0..1 black fade at the start and end of each stage's turn. */
  get fade(): number {
    if (this.age < FADE) return 1 - this.age / FADE
    if (this.age > STAGE_TIME - FADE) return Math.min(1, (this.age - (STAGE_TIME - FADE)) / FADE)
    return 0
  }

  private restart() {
    this.session?.dispose()
    this.session = demoSession(this.stage)
    const room = DEMO_ROOM[this.stage]
    if (room) this.session.world.command(this.session.myId, { type: 'warp', to: room })
    this.home = undefined
    this.goal = undefined
    this.input = { ...NO_INPUT }
    this.wp = 0
    this.age = 0
    this.nextPress = 9
    this.chargeUntil = -1
  }

  /** Steps the demo world and returns its view. */
  frame(dt: number): View | undefined {
    this.age += dt
    const view = this.session.latest()
    if (this.age > STAGE_TIME) {
      this.stageIndex++
      this.restart()
    } else if (view && view.phase !== 'play' && this.age > 12) this.restart()
    if (view) this.drive(view, dt)
    return this.session.frame(dt, this.input, { paused: false, name: 'demo', menu: false })
  }

  private drive(view: View, dt: number) {
    const s = this.input
    if (this.releaseNext) {
      s.attackReleases++
      s.attackHeld = false
      this.releaseNext = false
    }
    const me = view.heroes.find((h) => h.ctrl)
    if (!me) return
    const t = this.age
    // Charging a press: hold still, then release toward the aim.
    if (this.chargeUntil > 0) {
      s.mx = s.my = 0
      if (t >= this.chargeUntil) {
        s.attackReleases++
        s.attackHeld = false
        this.chargeUntil = -1
        this.nextPress = t + 14
      }
      return
    }
    let goal: { x: number; y: number } | undefined
    let fight = false
    let best = 230
    for (const e of view.enemies) {
      if (e.state === 'death') continue
      const d = Math.hypot(e.x - me.x, e.y - me.y)
      if (d < best) (best = d), (goal = e), (fight = true)
    }
    if (!goal) {
      best = 170
      for (const p of view.props) {
        if (p.kind !== 'grass' || p.state !== 'idle') continue
        const d = Math.hypot(p.x - me.x, p.y - me.y)
        if (d < best) (best = d), (goal = p), (fight = true)
      }
    }
    const form = me.form !== undefined ? view.formations[me.form] : undefined
    if (form && form.slots.length >= 3 && t > this.nextPress && me.state !== 'tech') {
      const target = goal ?? { x: me.x + Math.cos(s.aim) * 160, y: me.y + Math.sin(s.aim) * 160 }
      s.aim = Math.atan2(target.y - me.y, target.x - me.x)
      s.aimDist = Math.min(220, Math.hypot(target.x - me.x, target.y - me.y))
      s.attackPresses++
      s.attackHeld = true
      s.mx = s.my = 0
      this.chargeUntil = t + 1.1
      return
    }
    if (fight && goal) {
      const d = Math.hypot(goal.x - me.x, goal.y - me.y)
      s.aim = Math.atan2(goal.y - me.y, goal.x - me.x)
      s.aimDist = d
      const k = d > 60 ? 0.85 : 0
      s.mx = Math.cos(s.aim) * k
      s.my = Math.sin(s.aim) * k
      if (d < 120 && t > this.nextTap && !s.attackHeld) {
        s.attackPresses++
        s.attackHeld = true
        this.releaseNext = true
        this.nextTap = t + 0.32
      }
      return
    }
    const [gx, gy] = this.waypoint(view, me.x, me.y)
    const d = Math.hypot(gx - me.x, gy - me.y)
    // Skip waypoints we cannot reach (blocked by a bush or a companion).
    if (Math.hypot(me.x - this.lastPos.x, me.y - this.lastPos.y) < 0.5) this.stuck += dt
    else this.stuck = 0
    this.lastPos = { x: me.x, y: me.y }
    if (d < 28 || this.stuck > 1.2) {
      this.wp = (this.wp + 1) % WAYPOINTS.length
      this.goal = undefined
      this.stuck = 0
    }
    const a = Math.atan2(gy - me.y, gx - me.x)
    // Amble: a slow, slightly wavy walk so the formation keeps up.
    const wobble = Math.sin(t * 0.9) * 0.35
    s.mx = Math.cos(a + wobble) * 0.62
    s.my = Math.sin(a + wobble) * 0.62
    s.aim = a
  }

  /** The next place to amble to: the meadow tour, or random walkable spots near the spawn elsewhere. */
  private waypoint(view: View, x: number, y: number): [number, number] {
    if (view.stage === 'meadow') {
      const [wx, wy] = WAYPOINTS[this.wp]
      return [T(wx), T(wy)]
    }
    this.home ??= { x, y }
    const info = this.session.info
    if (!this.goal && info) {
      for (let k = 0; k < 20 && !this.goal; k++) {
        const room = info.rooms.find((r) => r.id === DEMO_ROOM[this.stage])
        let tx = Math.floor(this.home.x / TILE) + Math.round((Math.random() - 0.5) * 9)
        let ty = Math.floor(this.home.y / TILE) + Math.round((Math.random() - 0.5) * 7)
        if (room) {
          tx = Math.max(room.x + 1, Math.min(room.x + room.w - 2, tx))
          ty = Math.max(room.y + 1, Math.min(room.y + room.h - 2, ty))
        }
        const kind = info.tiles[ty * info.w + tx]
        // Only solid, walkable ground with walkable neighbours (no falls into the sky or sludge).
        const ok = (i: number) => {
          const k2 = info.tiles[i]
          return !!k2 && TILE_KINDS[k2].walk && k2 !== 'ice' && k2 !== 'current'
        }
        if (
          kind &&
          ok(ty * info.w + tx) &&
          ok(ty * info.w + tx + 1) &&
          ok(ty * info.w + tx - 1) &&
          ok((ty + 1) * info.w + tx)
        )
          this.goal = { x: T(tx), y: T(ty) }
      }
    }
    return this.goal ? [this.goal.x, this.goal.y] : [this.home.x, this.home.y]
  }

  dispose() {
    this.session.dispose()
  }
}

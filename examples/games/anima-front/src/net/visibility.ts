/**
 * Team visibility for PvP snapshots (DESIGN §18): which enemy players each team may know about right now. The
 * host recomputes it for every snapshot; a team's guests only ever receive the players in its set. Pure apart
 * from its own short memory (hysteresis, recent noise and hits), unit-tested in tests/net-visibility.test.ts.
 *
 * Enemy E is visible to team T when
 *   (a) E is within NEAR of a living T member;
 *   (b) a living T member sees E's head or chest (map boxes, ヤドカリ walls and ink clouds block the line) from
 *       its eye, its aim pivot or its camera, within RANGE, unless E's camouflage (cloak ≥ 0.5) hides it beyond
 *       CAMO_NEAR — and for LINGER seconds after that sight is lost, so corners do not flicker;
 *   (c) sonar reveals E to T;
 *   (d) E fired or used an antique within HEARD_TIME seconds and is within HEARD_RANGE of a living T member;
 *   (e) E stands inside T's base;
 *   (f) a T member hit E within HIT_TIME seconds.
 * Allies are always visible. Players waiting to respawn are never visible to enemies; in the results everyone is.
 */
import { ITEMS } from '../data/items'
import { eyeHeight, shoulderOffset, SPECIES } from '../data/species'
// The sim's static collision world (no sim state): the same boxes the host's world collides with.
import { Physics } from '../sim/physics'
import type { MapDef, PlayerView, PropView, SimEvent, TeamId, View } from '../sim/types'

export const VIS = {
  NEAR: 6,
  RANGE: 150,
  CAMO: 0.5,
  CAMO_NEAR: 5,
  HEARD_TIME: 1.5,
  HEARD_RANGE: 45,
  HIT_TIME: 1,
  LINGER: 0.4,
  /** Camera arm behind the aim pivot (render/camera.ts ARM_LENGTH × species scale). */
  ARM: 3.2
} as const

const TEAMS: readonly TeamId[] = [0, 1, 2]
const RESULT = new Set(['victory', 'defeat', 'draw'])
/** Events that mean "fired or used an antique" (heard). */
const NOISY = new Set<SimEvent['type']>(['fire', 'swing', 'deploy', 'reveal', 'hook'])

type V = [number, number, number]

const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

/** Distance from the centre c to the segment a–b is within r. */
function segmentNear(a: V, b: V, c: V, r: number): boolean {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    dz = b[2] - a[2]
  const l2 = dx * dx + dy * dy + dz * dz
  let t = l2 > 0 ? ((c[0] - a[0]) * dx + (c[1] - a[1]) * dy + (c[2] - a[2]) * dz) / l2 : 0
  t = Math.max(0, Math.min(1, t))
  const px = a[0] + dx * t - c[0],
    py = a[1] + dy * t - c[1],
    pz = a[2] + dz * t - c[2]
  return px * px + py * py + pz * pz <= r * r
}

/** The axis-aligned box of a ヤドカリ wall (as src/sim/props.ts wallBox). */
function wallBox(r: PropView): { min: V; max: V } {
  const u = ITEMS.hermit.use
  const w = u?.kind === 'wall' ? u.width : 4
  const hgt = u?.kind === 'wall' ? u.height : 2.5
  const alongX = Math.abs(Math.sin(r.yaw)) < 0.5
  const hw = alongX ? w / 2 : 0.3
  const hd = alongX ? 0.3 : w / 2
  return { min: [r.p[0] - hw, r.p[1], r.p[2] - hd], max: [r.p[0] + hw, r.p[1] + hgt, r.p[2] + hd] }
}

/** Where a player's screen can see from: eye, aim pivot and the camera behind it (pulled in by walls). */
function viewpoints(phys: Physics, p: PlayerView): V[] {
  const def = SPECIES[p.species]
  const eh = eyeHeight(def)
  const eye: V = [p.p[0], p.p[1] + eh, p.p[2]]
  const side = shoulderOffset(def) * (p.shoulder === -1 ? -1 : 1)
  const pivot: V = [p.p[0] - Math.cos(p.yaw) * side, p.p[1] + eh, p.p[2] + Math.sin(p.yaw) * side]
  const cp = Math.cos(p.pitch)
  const back: V = [-Math.sin(p.yaw) * cp, -Math.sin(p.pitch), -Math.cos(p.yaw) * cp]
  let arm = VIS.ARM * (def.height / SPECIES.shiba.height)
  const hit = phys.raycast(pivot, back, arm, 0, -1)
  if (hit) arm = Math.max(0.35, hit.t - 0.22)
  const cam: V = [pivot[0] + back[0] * arm, pivot[1] + back[1] * arm, pivot[2] + back[2] * arm]
  return [eye, pivot, cam]
}

function targets(p: PlayerView): V[] {
  const def = SPECIES[p.species]
  return [
    [p.p[0], p.p[1] + def.height - def.headRadius, p.p[2]],
    [p.p[0], p.p[1] + def.height * 0.55, p.p[2]]
  ]
}

export type TeamSets = Map<TeamId, Set<string>>

export class TeamVisibility {
  private readonly phys: Physics
  private readonly bases: { team: TeamId; p: readonly number[]; r: number }[]
  /** Player id → time of its last antique use. */
  private readonly noiseAt = new Map<string, number>()
  private readonly uses = new Map<string, number>()
  /** `team:id` → time a member of team last hit player id. */
  private readonly hitAt = new Map<string, number>()
  /** `team:id` → last time team saw player id (line of sight). */
  private readonly seenAt = new Map<string, number>()
  /** Line-of-sight tests in the last update (diagnostics). */
  rays = 0

  constructor(map: MapDef) {
    this.phys = new Physics(map)
    this.bases = map.bases.filter((b) => b.team !== 'squad') as { team: TeamId; p: readonly number[]; r: number }[]
  }

  /** The sets for this view; `events` are the events since the previous update (noise and hits). */
  update(view: View, events: readonly SimEvent[]): TeamSets {
    const t = view.time
    const teamOf = new Map<string, TeamId>()
    for (const p of view.players) teamOf.set(p.id, p.team)
    for (const e of events) {
      if (NOISY.has(e.type) && 'who' in e && typeof e.who === 'string') this.noiseAt.set(e.who, e.t)
      if (e.type === 'hit' && e.targetKind === 'player' && typeof e.by === 'string' && typeof e.target === 'string') {
        const team = teamOf.get(e.by)
        if (team !== undefined) this.hitAt.set(`${team}:${e.target}`, e.t)
      }
    }
    for (const p of view.players) {
      const uses = p.hands[0].uses + p.hands[1].uses
      const before = this.uses.get(p.id)
      this.uses.set(p.id, uses)
      if ((before !== undefined && uses !== before) || p.hands.some((h) => h.act === 'beam' || h.act === 'fire'))
        this.noiseAt.set(p.id, t)
    }
    this.phys.dyn = view.props.filter((r) => r.kind === 'hermit').map((r, i) => ({ ...wallBox(r), pass: -2, tag: i }))
    const inks = view.props.filter((r) => r.kind === 'ink')
    const out: TeamSets = new Map()
    const all = RESULT.has(view.phase)
    this.rays = 0
    for (const team of TEAMS) {
      const set = new Set<string>()
      out.set(team, set)
      const eyes = view.players.filter((p) => p.team === team && p.state !== 'away')
      let points: V[][] | undefined
      for (const e of view.players) {
        if (e.team === team || all) {
          set.add(e.id)
          continue
        }
        if (e.state === 'away') continue
        if (this.known(team, e, eyes, t)) {
          set.add(e.id)
          continue
        }
        points ??= eyes.map((m) => viewpoints(this.phys, m))
        const key = `${team}:${e.id}`
        if (this.sees(e, eyes, points, inks)) this.seenAt.set(key, t)
        const seen = this.seenAt.get(key)
        if (seen !== undefined && t - seen <= VIS.LINGER) set.add(e.id)
      }
    }
    return out
  }

  /** Rules (a), (c), (d), (e), (f): no ray needed. */
  private known(team: TeamId, e: PlayerView, eyes: PlayerView[], t: number): boolean {
    if (e.revealedTo?.includes(team)) return true
    for (const b of this.bases) if (b.team === team && Math.hypot(e.p[0] - b.p[0], e.p[2] - b.p[2]) <= b.r) return true
    const hit = this.hitAt.get(`${team}:${e.id}`)
    if (hit !== undefined && t - hit <= VIS.HIT_TIME) return true
    const noise = this.noiseAt.get(e.id)
    const heard = noise !== undefined && t - noise <= VIS.HEARD_TIME
    for (const m of eyes) {
      const d = dist(m.p, e.p)
      if (d <= VIS.NEAR || (heard && d <= VIS.HEARD_RANGE)) return true
    }
    return false
  }

  /** Rule (b): line of sight from any member's viewpoint to E's head or chest. */
  private sees(e: PlayerView, eyes: PlayerView[], points: V[][], inks: PropView[]): boolean {
    const camo = e.cloak >= VIS.CAMO
    const aims = targets(e)
    for (let i = 0; i < eyes.length; i++) {
      const d = dist(eyes[i].p, e.p)
      if (d > VIS.RANGE || (camo && d > VIS.CAMO_NEAR)) continue
      for (const from of points[i])
        for (const to of aims) {
          if (d > 4 && inks.some((r) => segmentNear(from, to, [r.p[0], r.p[1] + 1, r.p[2]], r.r ?? 6))) continue
          this.rays++
          if (this.phys.clear(from, to, -1)) return true
        }
    }
    return false
  }
}

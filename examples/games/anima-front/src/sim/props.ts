/**
 * Props: deployables (frog pads, hermit walls, honey jars, decoys, ink), fixed map pads and mode objects
 * (lighthouse, zones, cart, nodes, targets, bases, tutorial markers). Per-tick upkeep of deployables lives here.
 */
import { ITEMS } from '../data/items'
import type { SpeciesId } from '../data/species'
import { heal } from './anima'
import { DT } from './constants'
import { emit, type Prop, type Side, type Sim } from './state'
import type { PropKind } from './types'
import { r3v, vdist, type Vec } from './vec'

export interface PropOpts {
  hp?: number
  r?: number
  until?: number
  owner?: string
  state?: number
  label?: string
  species?: SpeciesId
  launchUp?: number
  launchForward?: number
  data?: Record<string, number>
  dir?: Vec
}

export function addProp(
  sim: Sim,
  kind: PropKind,
  p: readonly number[],
  yaw: number,
  side: Side | -1,
  o: PropOpts = {}
) {
  const prop: Prop = {
    id: sim.nextProp++,
    kind,
    p: [p[0], p[1], p[2]],
    yaw,
    side,
    hp: o.hp,
    maxHp: o.hp,
    r: o.r,
    born: sim.time,
    until: o.until,
    owner: o.owner,
    state: o.state,
    label: o.label,
    species: o.species,
    launchUp: o.launchUp ?? 0,
    launchForward: o.launchForward ?? 0,
    data: o.data ?? {},
    dir: o.dir ?? [0, 0, 1],
    gone: false
  }
  sim.props.push(prop)
  return prop
}

/** Removes a prop silently (expiry) and its collision box. */
export function removeProp(sim: Sim, r: Prop) {
  r.gone = true
}

/** Snaps a yaw to the nearest quarter turn (walls are axis-aligned boxes). */
export const snapYaw = (yaw: number) => Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2)

/** Axis-aligned box of a hermit wall (width across its facing, 0.6 m thick). */
export function wallBox(r: Prop): { min: Vec; max: Vec } {
  const u = ITEMS.hermit.use
  const w = u?.kind === 'wall' ? u.width : 4
  const hgt = u?.kind === 'wall' ? u.height : 2.5
  const alongX = Math.abs(Math.sin(r.yaw)) < 0.5 // facing ±Z → wide along X
  const hw = alongX ? w / 2 : 0.3
  const hd = alongX ? 0.3 : w / 2
  return { min: [r.p[0] - hw, r.p[1], r.p[2] - hd], max: [r.p[0] + hw, r.p[1] + hgt, r.p[2] + hd] }
}

/** Keeps the physics' dynamic boxes in sync with the live hermit walls. */
export function syncWalls(sim: Sim) {
  sim.phys.dyn = []
  for (const r of sim.props) {
    if (r.gone || r.kind !== 'hermit') continue
    const b = wallBox(r)
    sim.phys.dyn.push({ min: b.min, max: b.max, pass: r.side as number, tag: r.id })
  }
}

/** Per-tick deployable behaviour; drops expired/gone props. */
export function propsTick(sim: Sim) {
  let wallsChanged = false
  for (const r of sim.props) {
    if (r.gone) continue
    if (r.until !== undefined && sim.time >= r.until) {
      r.gone = true
      if (r.kind === 'hermit') wallsChanged = true
      continue
    }
    if (r.kind === 'honey') {
      const rate = r.data.heal ?? 4
      for (const p of sim.players) {
        if (p.state !== 'alive' || p.side !== r.side) continue
        if (vdist(p.p, r.p) <= (r.r ?? 4.5)) heal(sim, p, rate * DT, 'honey')
      }
    } else if (r.kind === 'decoy') {
      // The hologram runs forward and stops at walls.
      const sp = r.data.speed ?? 6
      const body = { p: r.p, v: [r.dir[0] * sp, -10, r.dir[2] * sp] as Vec, r: 0.35, h: 1.1, grounded: true }
      sim.phys.move(body, DT, r.side as number)
    }
  }
  if (sim.props.some((r) => r.gone)) {
    for (const r of sim.props) if (r.gone && r.kind === 'hermit') wallsChanged = true
    sim.props = sim.props.filter((r) => !r.gone)
  }
  if (wallsChanged) syncWalls(sim)
}

/** Live props of a kind owned by a player, oldest first. */
export const ownedProps = (sim: Sim, owner: string, kind: PropKind) =>
  sim.props.filter((r) => !r.gone && r.owner === owner && r.kind === kind)

export function deployEvent(sim: Sim, who: string, item: (typeof ITEMS)[keyof typeof ITEMS]['id'], r: Prop) {
  emit(sim, { type: 'deploy', who, item, prop: r.id, at: r3v(r.p) })
}

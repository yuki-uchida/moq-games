/** Test helpers: a driven world with one or more scripted human inputs. */
import { makeLoadout, type Loadout } from '../src/data/loadout'
import type { ItemId } from '../src/data/items'
import type { SpeciesId } from '../src/data/species'
import type { World } from '../src/sim/api'
import { pivotOf } from '../src/sim/player'
import { addProp } from '../src/sim/props'
import type { Player, Prop, Sim } from '../src/sim/state'
import {
  BTN,
  neutralPlayerInput,
  type MapDef,
  type MatchConfig,
  type PlayerInput,
  type SimEvent
} from '../src/sim/types'
import { createWorldOnMap, simOf } from '../src/sim/world'
import { cfg, flatMap, playerCfg } from './sim-maps'

export interface Rig {
  world: World
  sim: Sim
  inputs: Map<string, PlayerInput>
  events: SimEvent[]
  input(id?: string): PlayerInput
  player(id?: string): Player
  step(n?: number): void
  /** Presses a paw once (counter +1) and holds it for `hold` ticks (0 = tap between samples). */
  press(hand: 'R' | 'L', hold?: number, id?: string): void
  of<T extends SimEvent['type']>(type: T): Extract<SimEvent, { type: T }>[]
}

export function rig(opts: {
  r?: ItemId[]
  l?: ItemId[]
  passive?: ItemId[]
  loadout?: Loadout
  species?: SpeciesId
  map?: MapDef
  config?: Partial<MatchConfig>
  extra?: MatchConfig['players']
}): Rig {
  const loadout = opts.loadout ?? makeLoadout(opts.r ?? ['bee'], opts.l ?? [], opts.passive ?? [])
  const players = [playerCfg('me', { species: opts.species ?? 'shiba', loadout }), ...(opts.extra ?? [])]
  const world = createWorldOnMap(
    cfg({ mode: 'training', map: 'range', players, countdown: 0, ...(opts.config ?? {}) }),
    opts.map ?? flatMap()
  )
  const sim = simOf(world)
  const inputs = new Map<string, PlayerInput>()
  for (const p of sim.players) if (p.bot === undefined) inputs.set(p.id, { ...neutralPlayerInput(), yaw: p.yaw })
  const events: SimEvent[] = []
  const r: Rig = {
    world,
    sim,
    inputs,
    events,
    input: (id = 'me') => inputs.get(id)!,
    player: (id = 'me') => sim.players.find((p) => p.id === id)!,
    step(n = 1) {
      for (let i = 0; i < n; i++) {
        world.step(inputs)
        events.push(...world.view().events)
      }
    },
    press(hand, hold = 0, id = 'me') {
      const inp = inputs.get(id)!
      const bit = hand === 'R' ? BTN.R : BTN.L
      if (hand === 'R') inp.presses.r++
      else inp.presses.l++
      if (hold > 0) {
        inp.held |= bit
        r.step(hold)
        inp.held &= ~bit
      }
      r.step(1)
    },
    of(type) {
      return events.filter((e) => e.type === type) as never
    }
  }
  return r
}

/** Points the player's aim ray (from the aim pivot) at a world point; also sets the body yaw immediately. */
export function aimAt(r: Rig, target: readonly number[], id = 'me') {
  const p = r.player(id)
  const inp = r.input(id)
  for (let k = 0; k < 4; k++) {
    const o = pivotOf(p)
    const dx = target[0] - o[0]
    const dy = target[1] - o[1]
    const dz = target[2] - o[2]
    inp.yaw = Math.atan2(dx, dz)
    inp.pitch = Math.atan2(dy, Math.hypot(dx, dz))
    p.yaw = inp.yaw
    p.pitch = inp.pitch
  }
}

/** A shootable training target prop (side −1, hp). */
export function target(r: Rig, at: [number, number, number], hp = 1000): Prop {
  return addProp(r.sim, 'target', at, 0, -1, { hp, r: 0.6, data: { h: 1.8 } })
}

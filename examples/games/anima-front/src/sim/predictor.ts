/**
 * Client-side movement prediction for one player (DESIGN §18): a guest runs the sim's own movement code
 * (readInput + movePlayer on the static map's Physics, fixed pads and frog gadgets) for its own body so walking,
 * jumping, dashing, gliding and pad launches respond at once. Everything else (paws, damage, hooks, lunges,
 * hermit walls) stays on the host; the session reconciles the predicted body against the host's snapshots.
 */
import { ITEMS } from '../data/items'
import { DT } from './constants'
import { Physics } from './physics'
import { createPlayer, movePlayer, readInput } from './player'
import { addProp } from './props'
import type { HandMode, Player, Prop, Sim } from './state'
import type { MapDef, MoveState, PlayerConfig, PlayerInput, PlayerView, PropView, V3 } from './types'

export interface PredictedBody {
  p: V3
  v: V3
  grounded: boolean
  move: MoveState
  yaw: number
  pitch: number
}

export interface Predictor {
  /** Predicted sim time (ticks × 1/60 since creation). */
  readonly time: number
  /** The current predicted body (live object; copy it to keep it). */
  readonly body: PredictedBody
  /** Moves the body to an authoritative state (spawn, respawn, a correction too large to blend). */
  reset(view: PlayerView): void
  /**
   * Copies what movement depends on but prediction does not simulate: anima (dash cost), alive/down, passives
   * online, active paw modes (shield / zoom slow the walk) and the gadget pads of the latest snapshot.
   */
  sync(view: PlayerView, props?: readonly PropView[]): void
  /** Advances one fixed step (1/60 s) with this input. */
  step(input: PlayerInput): void
  /** Shifts the body (reconciliation): position by `dp`, velocity by `dv`. */
  correct(dp: readonly number[], dv?: readonly number[]): void
  /** Sets the press counters already consumed (before replaying recorded inputs). */
  setSeen(presses: PlayerInput['presses']): void
}

/** Builds a predictor for `player` on `map` (the same MapDef the host world uses). */
export function createPredictor(map: MapDef, player: PlayerConfig): Predictor {
  const sim = {
    cfg: { mode: 'training', map: map.id, seed: 0, players: [player] },
    map,
    phys: new Physics(map),
    tick: 0,
    time: 0,
    phase: 'play',
    phaseAt: 0,
    events: [],
    nextEvent: 1,
    players: [],
    foes: [],
    shots: [],
    props: [],
    shards: [],
    hazards: [],
    nextFoe: 1,
    nextShot: 1,
    nextProp: 1,
    nextShard: 1,
    humans: 1
  } as unknown as Sim
  const frog = ITEMS.frog.use
  const launchUp = frog?.kind === 'pad' ? frog.launchUp : 13
  const launchForward = frog?.kind === 'pad' ? frog.launchForward : 6
  for (const pad of map.pads) addProp(sim, 'pad', pad.p, pad.yaw, -1, { launchUp, launchForward, r: 0.9 })
  const fixed: Prop[] = sim.props.slice()
  const spawn = map.spawns.find((s) => s.team === player.team || s.team === 'squad') ?? map.spawns[0]
  const p: Player = createPlayer(sim, player, {
    p: spawn ? [spawn.p[0], spawn.p[1], spawn.p[2]] : [0, 0, 0],
    yaw: spawn?.yaw ?? 0
  })
  sim.players.push(p)
  let seeded = false

  const body: PredictedBody = { p: p.p as V3, v: p.v as V3, grounded: true, move: 'idle', yaw: p.yaw, pitch: 0 }
  const publish = () => {
    body.p = [p.p[0], p.p[1], p.p[2]]
    body.v = [p.v[0], p.v[1], p.v[2]]
    body.grounded = p.grounded
    body.move = p.move
    body.yaw = p.yaw
    body.pitch = p.pitch
  }
  publish()

  return {
    get time() {
      return sim.time
    },
    body,
    reset(view) {
      p.p = [view.p[0], view.p[1], view.p[2]]
      p.v = [view.v[0], view.v[1], view.v[2]]
      p.grounded = view.grounded
      p.yaw = view.yaw
      p.pitch = view.pitch
      p.hook = null
      p.gliding = view.move === 'glide'
      p.launched = view.move === 'launch'
      p.dashT = 0
      p.dashReadyAt = sim.time + Math.max(0, view.dashCooldown)
      p.coyote = 0
      p.jumpBuf = 0
      this.sync(view)
      publish()
    },
    sync(view, props) {
      p.anima = view.anima
      p.maxAnima = view.maxAnima
      p.state = view.state
      p.online = view.passivesOnline
      for (let i = 0; i < 2; i++) {
        const hv = view.hands[i]
        const hs = p.hands[i]
        const item = hv.sel >= 0 ? hv.items[hv.sel] : undefined
        const use = item ? ITEMS[item]?.use : undefined
        let mode: HandMode = 'idle'
        if (hv.act === 'guard' && use?.kind === 'shield') mode = 'shield'
        else if (hv.act === 'charge' && use?.kind === 'zoom') mode = 'zoom'
        hs.mode = mode
        if (hv.sel >= 0 && hv.sel < hs.items.length) hs.sel = hv.sel
      }
      if (props) {
        const gadgets: Prop[] = []
        for (const r of props) {
          if (r.kind !== 'frog') continue
          const side = typeof r.team === 'number' ? r.team : -1
          gadgets.push({
            id: r.id,
            kind: 'frog',
            p: [r.p[0], r.p[1], r.p[2]],
            yaw: r.yaw,
            side,
            hp: undefined,
            maxHp: undefined,
            r: undefined,
            born: 0,
            until: undefined,
            owner: r.owner,
            state: undefined,
            label: undefined,
            species: undefined,
            launchUp,
            launchForward,
            data: {},
            dir: [0, 0, 1],
            gone: false
          })
        }
        sim.props = [...fixed, ...gadgets]
      }
    },
    step(input) {
      if (!seeded) {
        // The first input's counters are the baseline: presses made before the match never fire here.
        seeded = true
        p.seenJump = input.presses.jump
        p.seenDash = input.presses.dash
      }
      p.input = input
      sim.tick++
      sim.time = sim.tick * DT
      const { dash } = readInput(p)
      if (p.state !== 'away') movePlayer(sim, p, dash)
      sim.events.length = 0
      // Fox leaf decoys and other side effects belong to the host; keep only the pads.
      if (sim.props.length && sim.props[sim.props.length - 1].kind === 'leafDecoy')
        sim.props = sim.props.filter((r) => r.kind === 'pad' || r.kind === 'frog')
      publish()
    },
    setSeen(presses) {
      seeded = true
      p.seenJump = presses.jump
      p.seenDash = presses.dash
    },
    correct(dp, dv) {
      p.p[0] += dp[0]
      p.p[1] += dp[1]
      p.p[2] += dp[2]
      if (dv) {
        p.v[0] += dv[0]
        p.v[1] += dv[1]
        p.v[2] += dv[2]
      }
      publish()
    }
  }
}

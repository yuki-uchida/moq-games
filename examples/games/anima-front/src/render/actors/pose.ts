/**
 * View → CharacterPose (pure). The visual body yaw turns smoothly toward the aim yaw while moving, or once the aim
 * is more than ~60° off; aim yaw/pitch are then relative to the body. Hands come from HandView.
 */
import type { CharacterPose, Emote, HandPose } from '../../models/api'
import type { HandView, MoveState, Phase, PlayerView, TeamId, View } from '../../sim/types'
import { angleDelta } from '../camera'

export const TURN_THRESHOLD = (60 * Math.PI) / 180
const TURN_RATE = 10
const SETTLE = (6 * Math.PI) / 180

export interface BodyYaw {
  yaw: number
  /** Turning to catch up with the aim (hysteresis between the threshold and settling). */
  turning: boolean
}

/** Advances the visual body yaw toward the aim yaw. */
export function stepBodyYaw(state: BodyYaw, aimYaw: number, speed: number, dt: number): number {
  const d = angleDelta(state.yaw, aimYaw)
  if (speed > 0.6 || Math.abs(d) > TURN_THRESHOLD) state.turning = true
  if (state.turning) {
    const rate = speed > 0.6 ? TURN_RATE * 1.4 : TURN_RATE
    const step = d * (1 - Math.exp(-rate * dt))
    state.yaw += step
    if (Math.abs(angleDelta(state.yaw, aimYaw)) < SETTLE && speed <= 0.6) state.turning = false
  }
  // Keep the aim inside what the upper body can follow.
  const rest = angleDelta(state.yaw, aimYaw)
  const limit = TURN_THRESHOLD * 1.5
  if (rest > limit) state.yaw = aimYaw - limit
  else if (rest < -limit) state.yaw = aimYaw + limit
  return state.yaw
}

export const emptyHand = (): HandPose => ({ item: null, act: 'idle', charge: 0, uses: 0, combo: 0, swap: 0 })

export function handPose(h: HandView, out: HandPose): HandPose {
  out.item = h.sel >= 0 ? (h.items[h.sel] ?? null) : null
  out.act = h.act
  out.charge = h.charge
  out.uses = h.uses
  out.combo = h.combo
  out.swap = h.swap
  return out
}

export function newPose(): CharacterPose {
  return {
    localVel: [0, 0],
    grounded: true,
    vy: 0,
    move: 'idle',
    aimYaw: 0,
    aimPitch: 0,
    hands: [emptyHand(), emptyHand()],
    state: 'alive',
    revive: 0,
    reviving: false,
    hurt: 0
  }
}

/** Victory/defeat emote for a team in a result phase (undefined while playing). */
export function emoteFor(phase: Phase, view: View, team: TeamId | 'foe'): Emote | undefined {
  if (phase === 'victory' || phase === 'defeat') {
    if (view.mode === 'pvp' && view.pvp?.winner !== undefined && team !== 'foe') {
      return view.pvp.winner === team ? 'victory' : 'defeat'
    }
    if (team === 'foe') return phase === 'victory' ? 'defeat' : 'victory'
    return phase
  }
  if (phase === 'draw') return 'salute'
  return undefined
}

export interface PoseSource {
  v: readonly number[]
  yaw: number
  pitch: number
  grounded: boolean
  move: MoveState
  hands: [HandView, HandView]
  state: PlayerView['state']
  revive: number
  reviving: boolean
}

/** Fills `out` from the source and the visual body yaw. */
export function derivePose(
  src: PoseSource,
  bodyYaw: number,
  hurt: number,
  emote: Emote | undefined,
  out: CharacterPose
) {
  const fx = Math.sin(bodyYaw)
  const fz = Math.cos(bodyYaw)
  // right = (−cos yaw, 0, sin yaw)
  out.localVel[0] = src.v[0] * -fz + src.v[2] * fx
  out.localVel[1] = src.v[0] * fx + src.v[2] * fz
  out.grounded = src.grounded
  out.vy = src.v[1]
  out.move = src.move
  out.aimYaw = angleDelta(bodyYaw, src.yaw)
  out.aimPitch = src.pitch
  handPose(src.hands[0], out.hands[0])
  handPose(src.hands[1], out.hands[1])
  out.state = src.state
  out.revive = src.revive
  out.reviving = src.reviving
  out.hurt = hurt
  out.emote = emote
  return out
}

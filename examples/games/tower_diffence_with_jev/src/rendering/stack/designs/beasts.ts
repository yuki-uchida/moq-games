import { actionClock, strike, TAU, track, type StackMotionInput } from '../StackDesign'
import type { StackPose } from '../StackRig'

/**
 * Four-legged gait: body (root, at shoulder height) > head (> jaw), tail, legFL/legFR/legBL/legBR.
 * The attack is a lunge with a bite that closes on the cue.
 */
export function quadrupedPose(
  input: StackMotionInput,
  style: { stride?: number; bob?: number; lunge?: number } = {}
): StackPose {
  const pose: StackPose = {}
  const breathe = Math.sin(input.time * 3 + input.seed * TAU)
  pose.body = { y: breathe * 0.15 }
  pose.head = { rx: 0.05 * Math.sin(input.time * 1.3 + input.seed * 3) }
  pose.jaw = { rx: 0.05 }
  pose.tail = { ry: 0.3 * Math.sin(input.time * 2.4 + input.seed * 5), rx: -0.2 }
  if (input.motion === 'walk') {
    const p = input.cycle * TAU
    const swing = style.stride ?? 0.7
    pose.legFL = { rx: Math.sin(p) * swing }
    pose.legBR = { rx: Math.sin(p) * swing }
    pose.legFR = { rx: -Math.sin(p) * swing }
    pose.legBL = { rx: -Math.sin(p) * swing }
    pose.body = { y: Math.abs(Math.sin(p)) * (style.bob ?? 0.8), rx: Math.sin(p * 2) * 0.04 }
    pose.head = { rx: Math.sin(p * 2) * 0.08 }
    pose.tail = { ry: Math.sin(p) * 0.5, rx: -0.4 }
  } else if (input.motion === 'attack' || input.motion === 'breath') {
    const { ms, cue, end } = actionClock(input)
    const lunge = strike(ms, [
      [0, 0],
      [cue * 0.6, -2],
      [cue, style.lunge ?? 5],
      [cue + (end - cue) * 0.5, 3],
      [end, 0]
    ])
    pose.body = {
      z: lunge,
      rx: track(ms, [
        [0, 0],
        [cue * 0.6, -0.15],
        [cue, 0.12],
        [end, 0]
      ]),
      y: track(ms, [
        [0, 0],
        [cue * 0.8, 1.5],
        [cue, 0.2],
        [end, 0]
      ])
    }
    pose.head = {
      rx: track(ms, [
        [0, 0],
        [cue * 0.6, -0.35],
        [cue, 0.25],
        [end, 0]
      ])
    }
    pose.jaw = {
      rx: track(ms, [
        [0, 0],
        [cue * 0.7, 0.8],
        [cue, 0],
        [end, 0]
      ])
    }
    pose.legFL = {
      rx: track(ms, [
        [0, 0],
        [cue * 0.6, 0.4],
        [cue, -0.7],
        [end, 0]
      ])
    }
    pose.legFR = {
      rx: track(ms, [
        [0, 0],
        [cue * 0.6, 0.4],
        [cue, -0.7],
        [end, 0]
      ])
    }
    pose.legBL = {
      rx: track(ms, [
        [0, 0],
        [cue, 0.5],
        [end, 0]
      ])
    }
    pose.legBR = {
      rx: track(ms, [
        [0, 0],
        [cue, 0.5],
        [end, 0]
      ])
    }
    pose.tail = {
      rx: track(ms, [
        [0, -0.2],
        [cue, 0.3],
        [end, -0.2]
      ])
    }
  }
  return pose
}

/** Fliers: body (root, hovering) with wingL/wingR flapping about the body's length. */
export function flyerPose(input: StackMotionInput, style: { hover: number; flap: number; rate: number }): StackPose {
  const pose: StackPose = {}
  const rate = input.motion === 'walk' ? style.rate * 1.25 : style.rate
  const beat = Math.sin(input.time * rate * TAU + input.seed * TAU)
  pose.body = { y: style.hover + beat * 0.9, rx: input.motion === 'walk' ? 0.18 : 0.05 }
  pose.wingL = { rz: -beat * style.flap }
  pose.wingR = { rz: beat * style.flap }
  pose.head = {}
  pose.jaw = {}
  if (input.motion === 'attack' || input.motion === 'breath') {
    const { ms, cue, end } = actionClock(input)
    const dive = strike(ms, [
      [0, 0],
      [cue * 0.55, -2],
      [cue, 5],
      [cue + (end - cue) * 0.5, 3],
      [end, 0]
    ])
    pose.body = {
      y:
        style.hover +
        track(ms, [
          [0, 0],
          [cue * 0.55, 3],
          [cue, -style.hover * 0.45],
          [end, 0]
        ]),
      z: dive,
      rx: track(ms, [
        [0, 0],
        [cue * 0.55, -0.3],
        [cue, 0.45],
        [end, 0.05]
      ])
    }
    const fast = Math.sin(ms * 0.045)
    pose.wingL = {
      rz:
        -fast * style.flap * 1.2 -
        track(ms, [
          [0, 0],
          [cue * 0.55, 0.6],
          [cue, -0.4],
          [end, 0]
        ])
    }
    pose.wingR = {
      rz:
        fast * style.flap * 1.2 +
        track(ms, [
          [0, 0],
          [cue * 0.55, 0.6],
          [cue, -0.4],
          [end, 0]
        ])
    }
    pose.jaw = {
      rx: track(ms, [
        [0, 0],
        [cue * 0.7, 0.7],
        [cue, 0],
        [end, 0]
      ])
    }
  }
  return pose
}

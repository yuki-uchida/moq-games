import type { UnitType } from '../../game/model'
import type { StackBlueprint } from './StackModel'
import type { StackPose } from './StackRig'

export type StackMotion = 'idle' | 'walk' | 'attack' | 'heal' | 'breath' | 'death' | 'special'

export interface StackMotionInput {
  readonly motion: StackMotion
  /** Seconds into the motion; attacks use the asset clock (scaled by enemy pacing). */
  readonly seconds: number
  /** Distance-driven stride cycles while walking. */
  readonly cycle: number
  /** Free-running simulation seconds for idle breathing and floating. */
  readonly time: number
  /** Authored action length and its hit/release cue, both in milliseconds. */
  readonly durationMs: number
  readonly cueMs: number
  /** Per-actor phase so a crowd never breathes in lockstep. */
  readonly seed: number
}

export interface StackDesign {
  readonly type: UnitType | 'commander' | `prop:${string}`
  readonly blueprint: StackBlueprint
  /** World units per voxel cell before board presentation scaling. */
  readonly voxel: number
  /** World units travelled per full stride cycle. */
  readonly walkDistance: number
  /** Contact shadow radii in cells (x, z). */
  readonly shadow: readonly [number, number]
  /** Projectile origin: a part and a cell offset in that part. */
  readonly emitter?: { readonly part: string; readonly at: readonly [number, number, number] }
  /** UI bust framing: fraction of the figure height from the top, and the figure's turn. */
  readonly portraitCrop?: number
  readonly portraitYaw?: number
  pose(input: StackMotionInput): StackPose
}

// ---------- timing helpers ----------
export const TAU = Math.PI * 2
export const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
export const smooth = (v: number) => {
  const t = clamp01(v)
  return t * t * (3 - 2 * t)
}
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
/** Piecewise track through [time, value] keys with smoothstep easing between keys. */
export function track(t: number, keys: readonly (readonly [number, number])[]): number {
  if (t <= keys[0][0]) return keys[0][1]
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i]
    const [t0, v0] = keys[i - 1]
    if (t <= t1) return lerp(v0, v1, smooth((t - t0) / (t1 - t0 || 1)))
  }
  return keys[keys.length - 1][1]
}
/** Snappy track: ease-out into each key, for strikes that must land on the cue. */
export function strike(t: number, keys: readonly (readonly [number, number])[]): number {
  if (t <= keys[0][0]) return keys[0][1]
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i]
    const [t0, v0] = keys[i - 1]
    if (t <= t1) {
      const u = clamp01((t - t0) / (t1 - t0 || 1))
      return lerp(v0, v1, 1 - (1 - u) ** 3)
    }
  }
  return keys[keys.length - 1][1]
}

/** Attack phase in ms with the cue as the anchor: returns [ms, cue, end]. */
export function actionClock(input: StackMotionInput): { ms: number; cue: number; end: number } {
  return { ms: input.seconds * 1000, cue: input.cueMs, end: input.durationMs }
}

// ---------- biped ----------
export type BipedAttack =
  | 'slash'
  | 'thrust'
  | 'bash'
  | 'bow'
  | 'crossbow'
  | 'cast'
  | 'smash'
  | 'sweep'
  | 'punch'
  | 'stab'

export interface BipedStyle {
  readonly attack: BipedAttack
  /** Radians of leg swing at full stride. */
  readonly stride?: number
  /** Cells of vertical bob per step. */
  readonly bob?: number
  /** Idle breathing in cells. */
  readonly breathe?: number
  /** Heavier figures lean and sway more slowly. */
  readonly heavy?: boolean
  /** Arms held out from the body in radians. */
  readonly armSpread?: number
}

/**
 * Standard biped: hips (root, at hip height) > torso > head, armL (+x), armR (-x, weapon hand),
 * legL, legR. Optional parts: cape, weapon (child of armR), offhand (child of armL).
 */
export function bipedPose(input: StackMotionInput, style: BipedStyle): StackPose {
  const pose: StackPose = {}
  const spread = style.armSpread ?? 0.12
  const breathe = (style.breathe ?? 0.85) * Math.sin(input.time * (style.heavy ? 2.1 : 2.8) + input.seed * TAU)
  pose.hips = { y: breathe > 0.25 ? 1 : 0 }
  pose.torso = { y: breathe * 0.35, sy: 1 + breathe * 0.04 }
  pose.head = { y: breathe * 0.7, rx: 0.04 * Math.sin(input.time * 1.7 + input.seed * 5) }
  pose.armL = { y: breathe * 0.4, rz: spread + breathe * 0.06 }
  pose.armR = { y: breathe * 0.4, rz: -spread - breathe * 0.06 }
  pose.legL = {}
  pose.legR = {}
  pose.cape = { rx: 0.08 + 0.03 * Math.sin(input.time * 2 + input.seed) }
  if (input.motion === 'walk') {
    const phase = input.cycle * TAU
    const swing = style.stride ?? 0.55
    const s = Math.sin(phase)
    pose.legL = { rx: -s * swing }
    pose.legR = { rx: s * swing }
    pose.armL = { rx: s * swing * 0.7, rz: spread }
    pose.armR = { rx: -s * swing * 0.7, rz: -spread }
    const bob = style.bob ?? 0.9
    pose.hips = { y: Math.abs(Math.cos(phase)) * bob - bob * 0.3, rz: s * (style.heavy ? 0.06 : 0.035), ry: s * 0.08 }
    pose.torso = { rx: style.heavy ? 0.1 : 0.06 }
    pose.head = { rx: -0.04 }
    pose.cape = { rx: 0.32 + 0.1 * Math.abs(s) }
  } else if (input.motion === 'attack' || input.motion === 'heal' || input.motion === 'breath') {
    bipedAttack(input, style.attack, pose)
  } else if (input.motion === 'special') {
    // A raised rally pose for the duration of the special.
    const t = input.seconds
    const up = track(t, [
      [0, 0],
      [0.18, 1],
      [1.1, 1],
      [1.4, 0.4]
    ])
    pose.armR = { rx: -2.6 * up, rz: -0.2 }
    pose.armL = { rx: -0.6 * up, rz: 0.5 * up + spread }
    pose.torso = { rx: -0.12 * up }
    pose.head = { rx: -0.2 * up }
    pose.hips = { y: 0.6 * Math.sin(Math.min(1, t / 0.25) * Math.PI) }
    pose.cape = { rx: 0.5 * up }
  }
  return pose
}

function bipedAttack(input: StackMotionInput, attack: BipedAttack, pose: StackPose): void {
  const { ms, cue, end } = actionClock(input)
  const wind = cue * 0.55
  const after = cue + (end - cue) * 0.45
  switch (attack) {
    case 'slash': {
      // Overhead diagonal cut that lands on the cue.
      const arm = strike(ms, [
        [0, 0],
        [wind, -2.4],
        [cue, -0.5],
        [after, -0.2],
        [end, 0]
      ])
      const twist = strike(ms, [
        [0, 0],
        [wind, 0.45],
        [cue, -0.5],
        [after, -0.35],
        [end, 0]
      ])
      pose.armR = { rx: arm, rz: -0.25 }
      pose.torso = {
        ry: twist,
        rx: track(ms, [
          [0, 0],
          [cue, 0.18],
          [end, 0]
        ])
      }
      pose.weapon = {
        rx: strike(ms, [
          [0, 0],
          [wind, -0.4],
          [cue, 0.35],
          [end, 0]
        ])
      }
      pose.armL = {
        rx: track(ms, [
          [0, 0],
          [wind, 0.4],
          [cue, -0.5],
          [end, 0]
        ]),
        rz: 0.35
      }
      pose.hips = {
        z: track(ms, [
          [0, 0],
          [cue, 1.5],
          [end, 0]
        ])
      }
      pose.legL = {
        rx: track(ms, [
          [0, 0],
          [cue, -0.45],
          [end, 0]
        ])
      }
      pose.legR = {
        rx: track(ms, [
          [0, 0],
          [cue, 0.3],
          [end, 0]
        ])
      }
      break
    }
    case 'stab': {
      const arm = strike(ms, [
        [0, -0.3],
        [wind, 0.4],
        [cue, -1.55],
        [after, -1.3],
        [end, -0.3]
      ])
      pose.armR = { rx: arm, rz: -0.1 }
      pose.weapon = {
        rx: track(ms, [
          [0, 0],
          [cue, 0],
          [end, 0]
        ])
      }
      pose.torso = {
        ry: strike(ms, [
          [0, 0],
          [wind, 0.35],
          [cue, -0.3],
          [end, 0]
        ]),
        rx: track(ms, [
          [0, 0],
          [cue, 0.2],
          [end, 0]
        ])
      }
      pose.hips = {
        z: strike(ms, [
          [0, 0],
          [wind, -0.6],
          [cue, 2],
          [end, 0]
        ])
      }
      pose.legL = {
        rx: track(ms, [
          [0, 0],
          [cue, -0.5],
          [end, 0]
        ])
      }
      break
    }
    case 'thrust': {
      // Two-handed spear: pull back, drive forward on the cue.
      const reach = strike(ms, [
        [0, 0],
        [wind, -2.5],
        [cue, 4],
        [after, 3],
        [end, 0]
      ])
      pose.armR = { rx: -1.45, z: reach * 0.5, rz: -0.05 }
      pose.armL = { rx: -1.3, z: reach * 0.5, rz: 0.35 }
      // Keep the spear level instead of letting the raised arm point it at the sky.
      pose.weapon = { rx: 1.4, ry: 0.06 }
      pose.torso = {
        rx: track(ms, [
          [0, 0],
          [wind, -0.08],
          [cue, 0.25],
          [end, 0]
        ]),
        ry: strike(ms, [
          [0, 0],
          [wind, 0.3],
          [cue, -0.15],
          [end, 0]
        ])
      }
      pose.hips = {
        z: strike(ms, [
          [0, 0],
          [wind, -1],
          [cue, 2.5],
          [end, 0]
        ])
      }
      pose.legL = {
        rx: track(ms, [
          [0, 0],
          [cue, -0.55],
          [end, 0]
        ])
      }
      pose.legR = {
        rx: track(ms, [
          [0, 0],
          [cue, 0.35],
          [end, 0]
        ])
      }
      break
    }
    case 'bash': {
      // Shield shove with a short sword chop following.
      const shove = strike(ms, [
        [0, 0],
        [wind, -1.2],
        [cue, 3.5],
        [after, 2.5],
        [end, 0]
      ])
      pose.armL = { rx: -1.2, z: shove, rz: 0.15 }
      pose.offhand = { rx: 1.2 }
      pose.armR = {
        rx: strike(ms, [
          [0, 0],
          [wind, -2.2],
          [cue, -0.9],
          [end, 0]
        ]),
        rz: -0.2
      }
      pose.torso = {
        rx: track(ms, [
          [0, 0],
          [cue, 0.22],
          [end, 0]
        ]),
        ry: strike(ms, [
          [0, 0],
          [wind, -0.25],
          [cue, 0.2],
          [end, 0]
        ])
      }
      pose.hips = {
        z: strike(ms, [
          [0, 0],
          [wind, -0.8],
          [cue, 2.4],
          [end, 0]
        ]),
        y: track(ms, [
          [0, 0],
          [cue, -0.6],
          [end, 0]
        ])
      }
      pose.legL = {
        rx: track(ms, [
          [0, 0],
          [cue, -0.5],
          [end, 0]
        ])
      }
      pose.legR = {
        rx: track(ms, [
          [0, 0],
          [cue, 0.35],
          [end, 0]
        ])
      }
      break
    }
    case 'bow': {
      // Bow arm (left) up and forward, string hand draws back, releases on the cue.
      const raise = track(ms, [
        [0, 0],
        [cue * 0.45, 1],
        [cue + (end - cue) * 0.6, 1],
        [end, 0]
      ])
      const draw = track(ms, [
        [0, 0],
        [cue * 0.35, 0],
        [cue * 0.95, 1],
        [cue, 1]
      ])
      const release =
        ms >= cue
          ? track(ms, [
              [cue, 1],
              [cue + 40, 0]
            ])
          : draw
      pose.armL = { rx: -1.55 * raise, rz: 0.08 }
      pose.armR = { rx: -1.45 * raise, rz: -0.2 * raise, z: -2.6 * release }
      pose.offhand = { rz: 0 }
      pose.torso = { ry: 0.5 * raise, rx: -0.05 * raise }
      pose.head = { ry: -0.35 * raise }
      if (ms > cue)
        pose.torso.rx = track(ms, [
          [cue, -0.12],
          [cue + 120, 0]
        ])
      break
    }
    case 'crossbow': {
      const raise = track(ms, [
        [0, 0],
        [cue * 0.5, 1],
        [cue + (end - cue) * 0.55, 1],
        [end, 0]
      ])
      const kick =
        ms >= cue
          ? track(ms, [
              [cue, 1],
              [cue + 90, 0.2],
              [cue + 260, 0]
            ])
          : 0
      pose.armR = { rx: -1.5 * raise + kick * 0.35, rz: -0.05, z: -kick * 1.2 }
      pose.armL = { rx: -1.45 * raise + kick * 0.35, rz: 0.4 * raise, z: -kick * 1.2 }
      pose.weapon = { rx: 1.5 * raise - kick * 0.35 }
      pose.torso = { rx: -0.08 * raise - kick * 0.12, ry: 0.15 * raise }
      pose.head = { rx: 0.12 * raise, ry: -0.12 * raise }
      pose.hips = { z: -kick * 0.8 }
      break
    }
    case 'cast': {
      // Staff hand rises, then thrusts toward the target as the spell leaves on the cue.
      const lift = strike(ms, [
        [0, 0],
        [wind, -2.6],
        [cue * 0.92, -2.5],
        [cue, -1.35],
        [after, -1.2],
        [end, 0]
      ])
      pose.armR = { rx: lift, rz: -0.12 }
      pose.armL = {
        rx: track(ms, [
          [0, 0],
          [wind, -1.1],
          [cue, -1.4],
          [after, -0.9],
          [end, 0]
        ]),
        rz: 0.5
      }
      pose.torso = {
        rx: track(ms, [
          [0, 0],
          [wind, -0.18],
          [cue, 0.16],
          [end, 0]
        ]),
        ry: track(ms, [
          [0, 0],
          [wind, 0.2],
          [cue, -0.1],
          [end, 0]
        ])
      }
      pose.head = {
        rx: track(ms, [
          [0, 0],
          [wind, -0.2],
          [cue, 0.1],
          [end, 0]
        ])
      }
      pose.hips = {
        y: track(ms, [
          [0, 0],
          [wind, 0.8],
          [cue, -0.3],
          [end, 0]
        ])
      }
      pose.cape = {
        rx: track(ms, [
          [0, 0.1],
          [cue, 0.6],
          [end, 0.1]
        ])
      }
      break
    }
    case 'smash': {
      // Two arms overhead, slammed down on the cue.
      const arms = strike(ms, [
        [0, 0],
        [wind, -2.9],
        [cue * 0.9, -3.0],
        [cue, -0.7],
        [after, -0.6],
        [end, 0]
      ])
      pose.armR = { rx: arms, rz: -0.12 }
      pose.armL = { rx: arms, rz: 0.12 }
      pose.torso = {
        rx: strike(ms, [
          [0, 0],
          [wind, -0.25],
          [cue, 0.4],
          [after, 0.3],
          [end, 0]
        ])
      }
      pose.hips = {
        y: strike(ms, [
          [0, 0],
          [wind, 1],
          [cue, -1.2],
          [after, -0.8],
          [end, 0]
        ]),
        z: track(ms, [
          [0, 0],
          [cue, 1.2],
          [end, 0]
        ])
      }
      pose.legL = {
        rx: track(ms, [
          [0, 0],
          [cue, -0.35],
          [end, 0]
        ])
      }
      pose.legR = {
        rx: track(ms, [
          [0, 0],
          [cue, 0.25],
          [end, 0]
        ])
      }
      break
    }
    case 'sweep': {
      // Horizontal club sweep from the weapon side across the front.
      const twist = strike(ms, [
        [0, 0],
        [wind, 0.9],
        [cue, -0.7],
        [after, -0.85],
        [end, 0]
      ])
      pose.torso = {
        ry: twist,
        rx: track(ms, [
          [0, 0],
          [cue, 0.15],
          [end, 0]
        ])
      }
      pose.armR = {
        rx: strike(ms, [
          [0, 0],
          [wind, -1.6],
          [cue, -1.35],
          [end, 0]
        ]),
        rz: strike(ms, [
          [0, 0],
          [wind, -0.9],
          [cue, -0.2],
          [end, 0]
        ])
      }
      pose.armL = {
        rx: track(ms, [
          [0, 0],
          [cue, -0.4],
          [end, 0]
        ]),
        rz: 0.4
      }
      pose.hips = {
        ry: twist * 0.35,
        z: track(ms, [
          [0, 0],
          [cue, 1],
          [end, 0]
        ])
      }
      break
    }
    case 'punch': {
      const right = strike(ms, [
        [0, 0],
        [wind, 0.9],
        [cue, -1.6],
        [after, -1.4],
        [end, 0]
      ])
      pose.armR = {
        rx: right,
        z: track(ms, [
          [0, 0],
          [cue, 2],
          [end, 0]
        ])
      }
      pose.armL = {
        rx: track(ms, [
          [0, 0],
          [wind, -1.2],
          [cue, -0.2],
          [end, 0]
        ]),
        rz: 0.3
      }
      pose.torso = {
        ry: strike(ms, [
          [0, 0],
          [wind, 0.5],
          [cue, -0.45],
          [end, 0]
        ]),
        rx: track(ms, [
          [0, 0],
          [cue, 0.2],
          [end, 0]
        ])
      }
      pose.hips = {
        z: strike(ms, [
          [0, 0],
          [cue, 1.6],
          [end, 0]
        ])
      }
      break
    }
  }
}

/** Ally side-fall used by every design without its own death. */
export function fallPose(seconds: number): { rz: number; y: number } {
  const t = clamp01(seconds / 0.82)
  const fall = t < 0.75 ? smooth(t / 0.75) : 1 - Math.sin(((t - 0.75) / 0.25) * Math.PI) * 0.04
  return { rz: (Math.PI / 2) * 0.92 * fall, y: -0.5 * fall }
}

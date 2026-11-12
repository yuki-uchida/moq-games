/**
 * Paw motion library: how each antique is held (ready pose) and what each use looks like, as short keyframe
 * tracks in the aim frame (x right, y up, z forward; units of body height H). The animator samples a track,
 * converts it to body space and solves two-bone IK for the arm.
 */
import type { ItemId } from '../data/items'
import type { HandAct } from '../sim/types'

export type V = [number, number, number]

export interface Key {
  t: number
  pos: V
  fwd: V
  up?: V
  /** Body accents: spine twist (yaw, + = towards the paw's side), lean (+ forward), hips drop (H). */
  twist?: number
  lean?: number
  drop?: number
}

export interface Track {
  dur: number
  keys: Key[]
}

export type Hold =
  | 'gun'
  | 'rifle'
  | 'heavy'
  | 'blade'
  | 'lance'
  | 'hammer'
  | 'scythe'
  | 'gauntlet'
  | 'shield'
  | 'device'
  | 'ball'
  | 'emblem'

export const HOLD: Record<ItemId, Hold> = {
  claw: 'gauntlet',
  orca: 'blade',
  narwhal: 'lance',
  mammoth: 'hammer',
  mantis: 'scythe',
  bee: 'gun',
  wood: 'rifle',
  humming: 'gun',
  puffer: 'gun',
  owl: 'rifle',
  swallow: 'rifle',
  pillbug: 'gun',
  eel: 'gun',
  hippo: 'heavy',
  turtle: 'emblem',
  armadillo: 'shield',
  hedgehog: 'emblem',
  jelly: 'emblem',
  fang: 'emblem',
  hawk: 'emblem',
  rhino: 'emblem',
  sloth: 'emblem',
  koala: 'emblem',
  cheetah: 'emblem',
  camel: 'emblem',
  frog: 'device',
  gecko: 'gun',
  momonga: 'emblem',
  leaf: 'device',
  bat: 'device',
  octopus: 'ball',
  pigeon: 'device',
  hermit: 'device',
  honeyant: 'device'
}

/** Recoil strength of one shot (0 = none). */
export const RECOIL: Partial<Record<ItemId, number>> = {
  bee: 0.55,
  wood: 0.35,
  humming: 0.22,
  puffer: 1.1,
  owl: 1.3,
  swallow: 0.8,
  pillbug: 0.7,
  hippo: 1.8,
  gecko: 0.6
}

const n = (x: number, y: number, z: number): V => {
  const l = Math.hypot(x, y, z) || 1
  return [x / l, y / l, z / l]
}

/** Ready pose (no action): position and item direction in the aim frame. */
export function readyKey(hold: Hold, act: HandAct, charge: number, id: ItemId): Key {
  switch (hold) {
    case 'gun':
      return { t: 0, pos: [0.1, -0.03, 0.22], fwd: [0, 0, 1] }
    case 'rifle':
      if (id === 'owl' && (act === 'charge' || charge > 0))
        return { t: 0, pos: [0.045, 0.03 + 0.01 * charge, 0.17], fwd: [0, 0, 1] }
      return { t: 0, pos: [0.09, -0.04, 0.2], fwd: [0, 0, 1] }
    case 'heavy':
      if (act === 'charge')
        return { t: 0, pos: [0.13, -0.1 - 0.03 * charge, 0.13], fwd: n(0, 0.12, 1), drop: 0.05 * charge }
      return { t: 0, pos: [0.12, -0.08, 0.16], fwd: n(0, 0.06, 1) }
    case 'blade':
      if (act === 'guard')
        return { t: 0, pos: [0.02, 0.02 + 0.03 * charge, 0.2], fwd: n(-1, 0.25, 0.2), up: [0, 0, 1], twist: -0.15 }
      return { t: 0, pos: [0.17, -0.1, 0.1], fwd: n(0.5, 0.3, 0.8) }
    case 'lance':
      return { t: 0, pos: [0.12, -0.08, 0.1], fwd: n(0, 0.12, 1) }
    case 'hammer':
      if (act === 'charge') return { t: 0, pos: [0.05, 0.18, -0.02], fwd: n(0, 0.65, -0.75), lean: -0.25 }
      return { t: 0, pos: [0.13, -0.02, 0.06], fwd: n(0.1, 0.9, -0.35) }
    case 'scythe':
      return { t: 0, pos: [0.14, -0.06, 0.12], fwd: n(-0.1, 0.85, 0.5) }
    case 'gauntlet':
      return { t: 0, pos: [0.1, 0.0, 0.15], fwd: n(0, 0.35, 1) }
    case 'shield':
      if (act === 'guard' || charge > 0) {
        const c = act === 'guard' ? Math.max(charge, 0.6) : charge
        return { t: 0, pos: [0.15 - 0.11 * c, -0.07 + 0.08 * c, 0.1 + 0.1 * c], fwd: [0, 0, 1], drop: 0.02 * c }
      }
      return { t: 0, pos: [0.16, -0.08, 0.1], fwd: n(0.3, 0, 1) }
    case 'device':
      return { t: 0, pos: [0.1, -0.07, 0.15], fwd: n(0, 0.3, 1) }
    case 'ball':
      return { t: 0, pos: [0.11, -0.06, 0.14], fwd: n(0, 0.2, 1) }
    case 'emblem':
      return { t: 0, pos: [0.12, -0.09, 0.12], fwd: n(0, 0.3, 1) }
  }
}

const T = (dur: number, keys: Key[]): Track => ({ dur, keys })

/** The one-shot track played when `uses` changes (null = recoil only). */
export function useTrack(id: ItemId, combo: number): Track | null {
  const flip = combo % 2 === 1
  switch (id) {
    case 'claw': {
      if (combo % 3 === 2)
        return T(0.3, [
          { t: 0, pos: [0.12, 0.0, 0.08], fwd: n(0, 0.3, 1), twist: 0.25 },
          { t: 0.35, pos: [0.03, 0.02, 0.27], fwd: [0, 0, 1], twist: -0.2, lean: 0.25 },
          { t: 1, pos: [0.1, 0.0, 0.15], fwd: n(0, 0.35, 1) }
        ])
      const s = flip ? -1 : 1
      return T(0.26, [
        { t: 0, pos: [0.14 * s + 0.02, 0.1, 0.1], fwd: n(0.3 * s, 0.7, 0.6), twist: 0.3 * s },
        { t: 0.45, pos: [-0.06 * s, -0.04, 0.24], fwd: n(-0.4 * s, -0.2, 1), twist: -0.3 * s, lean: 0.15 },
        { t: 1, pos: [0.1, 0.0, 0.15], fwd: n(0, 0.35, 1) }
      ])
    }
    case 'orca': {
      const s = flip ? -1 : 1
      return T(0.42, [
        { t: 0, pos: [0.15 * s + 0.02, 0.14, 0.04], fwd: n(0.5 * s, 0.75, -0.35), twist: 0.35 * s },
        { t: 0.3, pos: [0.0, 0.02, 0.24], fwd: n(-0.2 * s, 0.15, 1), twist: 0, lean: 0.15 },
        { t: 0.55, pos: [-0.13 * s, -0.1, 0.13], fwd: n(-0.85 * s, -0.35, 0.4), twist: -0.4 * s, lean: 0.2 },
        { t: 1, pos: [0.17, -0.1, 0.1], fwd: n(0.5, 0.3, 0.8) }
      ])
    }
    case 'narwhal':
      return T(0.5, [
        { t: 0, pos: [0.13, -0.06, 0.02], fwd: n(0, 0.1, 1), lean: -0.1 },
        { t: 0.2, pos: [0.05, -0.02, 0.26], fwd: [0, 0, 1], lean: 0.5, drop: 0.04 },
        { t: 0.7, pos: [0.05, -0.02, 0.25], fwd: [0, 0, 1], lean: 0.45, drop: 0.04 },
        { t: 1, pos: [0.12, -0.08, 0.1], fwd: n(0, 0.12, 1) }
      ])
    case 'mammoth':
      return T(0.8, [
        { t: 0, pos: [0.13, -0.02, 0.06], fwd: n(0.1, 0.9, -0.35) },
        { t: 0.38, pos: [0.04, 0.2, -0.03], fwd: n(0, 0.6, -0.8), lean: -0.3 },
        { t: 0.5, pos: [0.03, -0.1, 0.22], fwd: n(0, -0.75, 0.65), lean: 0.5, drop: 0.07 },
        { t: 0.75, pos: [0.04, -0.12, 0.21], fwd: n(0, -0.8, 0.6), lean: 0.45, drop: 0.06 },
        { t: 1, pos: [0.13, -0.02, 0.06], fwd: n(0.1, 0.9, -0.35) }
      ])
    case 'mantis':
      return T(0.55, [
        { t: 0, pos: [0.2, 0.02, 0.04], fwd: n(1, 0.35, 0.1), twist: 0.6 },
        { t: 0.45, pos: [-0.02, -0.02, 0.24], fwd: n(0.1, 0.25, 1), twist: 0, lean: 0.15 },
        { t: 0.75, pos: [-0.2, -0.04, 0.08], fwd: n(-1, 0.25, 0.2), twist: -0.6, lean: 0.1 },
        { t: 1, pos: [0.14, -0.06, 0.12], fwd: n(-0.1, 0.85, 0.5) }
      ])
    case 'pillbug':
    case 'octopus':
      return T(0.5, [
        { t: 0, pos: [0.15, 0.14, -0.04], fwd: n(0, 0.8, -0.6), twist: 0.3, lean: -0.1 },
        { t: 0.4, pos: [0.06, 0.08, 0.24], fwd: n(0, 0.4, 1), twist: -0.15, lean: 0.2 },
        { t: 0.7, pos: [-0.02, -0.08, 0.18], fwd: n(-0.2, -0.3, 1), twist: -0.2, lean: 0.15 },
        { t: 1, pos: [0.11, -0.06, 0.14], fwd: n(0, 0.2, 1) }
      ])
    case 'frog':
    case 'hermit':
    case 'honeyant':
      return T(0.6, [
        { t: 0, pos: [0.1, -0.07, 0.15], fwd: n(0, 0.3, 1) },
        { t: 0.4, pos: [0.06, -0.3, 0.22], fwd: n(0, -0.4, 1), lean: 0.45, drop: 0.08 },
        { t: 0.65, pos: [0.06, -0.3, 0.22], fwd: n(0, -0.4, 1), lean: 0.45, drop: 0.08 },
        { t: 1, pos: [0.1, -0.07, 0.15], fwd: n(0, 0.3, 1) }
      ])
    case 'bat':
      return T(0.6, [
        { t: 0, pos: [0.1, -0.07, 0.15], fwd: n(0, 0.3, 1) },
        { t: 0.3, pos: [0.06, 0.2, 0.12], fwd: n(0, 1, 0.3), lean: -0.1 },
        { t: 0.7, pos: [0.06, 0.2, 0.12], fwd: n(0, 1, 0.3), lean: -0.1 },
        { t: 1, pos: [0.1, -0.07, 0.15], fwd: n(0, 0.3, 1) }
      ])
    case 'pigeon':
      return T(0.5, [
        { t: 0, pos: [0.1, -0.07, 0.15], fwd: n(0, 0.3, 1) },
        { t: 0.35, pos: [0.04, 0.03, 0.25], fwd: n(0, 0.1, 1), lean: 0.15 },
        { t: 1, pos: [0.1, -0.07, 0.15], fwd: n(0, 0.3, 1) }
      ])
    case 'leaf':
      return T(0.45, [
        { t: 0, pos: [0.1, -0.07, 0.15], fwd: n(0, 0.3, 1) },
        { t: 0.4, pos: [0.02, -0.01, 0.12], fwd: n(0, 1, 0.2), lean: -0.05 },
        { t: 1, pos: [0.1, -0.07, 0.15], fwd: n(0, 0.3, 1) }
      ])
    default:
      return null
  }
}

/** Samples a track at time t (s), with eased segments; `fallback` is used past the end. */
export function sampleTrack(track: Track, t: number, out: Key): Key {
  const u = Math.min(Math.max(t / track.dur, 0), 1)
  const keys = track.keys
  let i = 0
  while (i < keys.length - 2 && u > keys[i + 1].t) i++
  const a = keys[i],
    b = keys[i + 1]
  const span = Math.max(b.t - a.t, 1e-4)
  let s = Math.min(Math.max((u - a.t) / span, 0), 1)
  s = s * s * (3 - 2 * s)
  for (let c = 0; c < 3; c++) {
    out.pos[c] = a.pos[c] + (b.pos[c] - a.pos[c]) * s
    out.fwd[c] = a.fwd[c] + (b.fwd[c] - a.fwd[c]) * s
  }
  const l = Math.hypot(out.fwd[0], out.fwd[1], out.fwd[2]) || 1
  out.fwd[0] /= l
  out.fwd[1] /= l
  out.fwd[2] /= l
  out.up = a.up && b.up ? [a.up[0], a.up[1], a.up[2]] : undefined
  out.twist = (a.twist ?? 0) + ((b.twist ?? 0) - (a.twist ?? 0)) * s
  out.lean = (a.lean ?? 0) + ((b.lean ?? 0) - (a.lean ?? 0)) * s
  out.drop = (a.drop ?? 0) + ((b.drop ?? 0) - (a.drop ?? 0)) * s
  return out
}

/**
 * Paw motion library: how each antique is held (ready pose) and what each use looks like, as short keyframe
 * tracks in the aim frame (x right, y up, z forward; units of body height H; origin on the body's centre line at
 * shoulder height). The animator samples a track, converts it to body space and solves two-bone IK for the arm.
 *
 * Guns are held pointing along the aim. Melee antiques have a stance of their own instead (the orca blade on
 * the shoulder, the narwhal lance upright, the mammoth hammer on the shoulder, the mantis scythe like a reaper,
 * the cat-paw gauntlet raised in a guard): their frame follows the aim yaw but only a little of its pitch, the
 * paw swings with the run and lifts in the air, and every use track starts and ends on the stance.
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

const MELEE_HOLDS: ReadonlySet<Hold> = new Set(['blade', 'lance', 'hammer', 'scythe', 'gauntlet'])
export const isMelee = (hold: Hold) => MELEE_HOLDS.has(hold)

/** How much of the aim pitch a hold follows (melee stances stay level; their hits are horizontal). */
export const pitchFollow = (hold: Hold) => (isMelee(hold) ? 0.25 : 1)

/** The idle stance of each melee hold (also the first and last key of its use tracks). */
export const STANCE: Partial<Record<Hold, Key>> = {
  // Resting on the shoulder: the paw in front of the shoulder, the orca rising up and back past the head.
  blade: { t: 0, pos: [0.17, -0.07, 0.12], fwd: n(0.45, 0.72, -0.52), up: n(-0.17, -0.28, 0.94) },
  // Upright at the side, leaning forward: tip up-forward, the narwhal by the paw.
  lance: { t: 0, pos: [0.25, -0.17, 0.1], fwd: n(0.32, 0.9, 0.28), up: n(0, 0.3, -0.9) },
  // On the shoulder, the mammoth head behind it.
  hammer: { t: 0, pos: [0.18, -0.06, 0.1], fwd: n(0.32, 0.55, -0.77), up: n(0, 0.81, 0.58) },
  // A reaper: the handle upright beside the body, the blade at the top reaching out and back.
  scythe: { t: 0, pos: [0.23, -0.13, 0.1], fwd: n(0.2, 0.95, 0.18), up: n(0.75, -0.1, -0.65) },
  // Paw raised in a guard, claws up, toe beans to the front.
  gauntlet: { t: 0, pos: [0.16, 0.0, 0.16], fwd: n(0.1, 0.9, 0.42), up: n(0, 0.42, -0.9), twist: 0.08 }
}

/** Whole-body motion the melee stances react to (weights 0..1). */
export interface StanceMotion {
  /** Run weight. */
  run: number
  /** Arm swing −1..1 of this paw's side (+ = paw forward). */
  swing: number
  /** Vertical bob −1..1 (twice per stride). */
  bob: number
  /** Airborne weight. */
  air: number
}

const SWING: Partial<Record<Hold, { z: number; y: number; tilt: number }>> = {
  blade: { z: 0.035, y: 0.012, tilt: 0.1 },
  hammer: { z: 0.03, y: 0.014, tilt: 0.08 },
  lance: { z: 0.06, y: 0.012, tilt: 0.2 },
  scythe: { z: 0.055, y: 0.012, tilt: 0.12 },
  gauntlet: { z: 0.05, y: 0.018, tilt: 0.15 }
}

/** Adds the run swing, the run lean and the air lift to a melee stance key (in place). */
export function stanceMotion(hold: Hold, key: Key, m: StanceMotion): Key {
  const sw = SWING[hold]
  if (!sw) return key
  const p = key.pos
  p[2] += sw.z * m.swing + 0.025 * m.run
  p[1] += sw.y * m.bob - 0.015 * m.run + 0.05 * m.air
  p[0] += 0.03 * m.air
  const f = key.fwd
  f[2] += sw.tilt * m.swing
  f[0] += 0.15 * m.air
  const l = Math.hypot(f[0], f[1], f[2]) || 1
  f[0] /= l
  f[1] /= l
  f[2] /= l
  return key
}

const copyKey = (k: Key): Key => ({ ...k, pos: [...k.pos], fwd: [...k.fwd], up: k.up ? [...k.up] : undefined })

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
      return copyKey(STANCE.blade!)
    case 'hammer':
      if (act === 'charge') return { t: 0, pos: [0.05, 0.18, -0.02], fwd: n(0, 0.65, -0.75), lean: -0.25 }
      return copyKey(STANCE.hammer!)
    case 'lance':
    case 'scythe':
    case 'gauntlet':
      return copyKey(STANCE[hold]!)
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
const AIM_UP: V = [0, 1, 0]

/** The one-shot track played when `uses` changes (null = recoil only). */
export function useTrack(id: ItemId, combo: number): Track | null {
  const flip = combo % 2 === 1
  const stance = (hold: Hold, t: number): Key => ({ ...copyKey(STANCE[hold]!), t })
  switch (id) {
    case 'claw': {
      // Swipes alternate sides out of the raised guard; every third hit is a pouncing thrust.
      if (combo % 3 === 2)
        return T(0.3, [
          stance('gauntlet', 0),
          { t: 0.15, pos: [0.12, 0.0, 0.06], fwd: n(0, 0.5, 1), up: n(0, 1, -0.5), twist: 0.25 },
          { t: 0.4, pos: [0.03, 0.02, 0.28], fwd: [0, 0, 1], up: [0, 1, 0], twist: -0.2, lean: 0.25 },
          stance('gauntlet', 1)
        ])
      const s = flip ? -1 : 1
      return T(0.28, [
        stance('gauntlet', 0),
        { t: 0.2, pos: [0.14 * s + 0.02, 0.08, 0.12], fwd: n(0.3 * s, 0.8, 0.4), up: n(0, 0.4, -1), twist: 0.3 * s },
        {
          t: 0.55,
          pos: [-0.06 * s, -0.06, 0.24],
          fwd: n(-0.4 * s, -0.3, 1),
          up: [0, 1, 0.3],
          twist: -0.3 * s,
          lean: 0.15
        },
        stance('gauntlet', 1)
      ])
    }
    case 'orca': {
      // From the shoulder the blade is already cocked: lift, cut across the front, follow through low.
      const s = flip ? -1 : 1
      return T(0.44, [
        stance('blade', 0),
        {
          t: 0.14,
          pos: [0.15 * s + 0.02, 0.08, 0.06],
          fwd: n(0.45 * s, 0.8, -0.4),
          up: n(0.8 * s, -0.2, 0.5),
          twist: 0.35 * s
        },
        { t: 0.38, pos: [0.0, 0.0, 0.25], fwd: n(-0.25 * s, 0.1, 1), up: [0, 1, 0], twist: 0, lean: 0.15 },
        {
          t: 0.6,
          pos: [-0.13 * s, -0.1, 0.13],
          fwd: n(-0.85 * s, -0.35, 0.4),
          up: [0, 1, 0],
          twist: -0.4 * s,
          lean: 0.2
        },
        // Flourish: the blade comes up in front before it settles back on the shoulder.
        { t: 0.8, pos: [0.16 * s, -0.03, 0.17], fwd: n(0.25 * s, 0.95, 0.05), up: n(0.9 * s, -0.1, 0.4) },
        stance('blade', 1)
      ])
    }
    case 'narwhal':
      // Drop the lance from upright to couched, thrust through the lunge, then stand it up again.
      return T(0.52, [
        stance('lance', 0),
        { t: 0.12, pos: [0.15, -0.08, 0.02], fwd: n(0, 0.08, 1), up: [0, 1, 0], lean: -0.1 },
        { t: 0.26, pos: [0.05, -0.03, 0.26], fwd: [0, 0, 1], up: [0, 1, 0], lean: 0.5, drop: 0.04 },
        { t: 0.72, pos: [0.05, -0.03, 0.25], fwd: [0, 0, 1], up: [0, 1, 0], lean: 0.45, drop: 0.04 },
        stance('lance', 1)
      ])
    case 'mammoth':
      // Off the shoulder overhead, the mammoth's face slams the ground, then back on the shoulder.
      return T(0.8, [
        stance('hammer', 0),
        { t: 0.36, pos: [0.05, 0.2, -0.02], fwd: n(0, 0.62, -0.78), up: [0, 1, 0], lean: -0.3 },
        { t: 0.48, pos: [0.03, -0.1, 0.22], fwd: n(0, -0.75, 0.65), up: [0, 1, 0], lean: 0.5, drop: 0.07 },
        { t: 0.7, pos: [0.04, -0.12, 0.21], fwd: n(0, -0.8, 0.6), up: [0, 1, 0], lean: 0.45, drop: 0.06 },
        // Heave it up in front, then back onto the shoulder.
        { t: 0.86, pos: [0.19, -0.07, 0.15], fwd: n(0.3, 0.9, 0.2), up: n(0, -0.25, 1) },
        stance('hammer', 1)
      ])
    case 'mantis':
      // A wide reaping sweep right to left; the blade leads (it points along the sweep).
      return T(0.56, [
        stance('scythe', 0),
        { t: 0.2, pos: [0.2, 0.02, 0.04], fwd: n(1, 0.35, 0.1), up: n(-0.1, -0.2, 1), twist: 0.6 },
        { t: 0.46, pos: [-0.02, -0.02, 0.24], fwd: n(0.1, 0.25, 1), up: n(-1, -0.2, 0.1), twist: 0, lean: 0.15 },
        { t: 0.72, pos: [-0.2, -0.04, 0.08], fwd: n(-1, 0.25, 0.2), up: n(-0.2, -0.2, -1), twist: -0.6, lean: 0.1 },
        // Bring it round low in front, then stand it up again at the side.
        { t: 0.86, pos: [0.06, -0.14, 0.18], fwd: n(0.15, 0.3, 1), up: n(0.4, -0.2, -0.3) },
        stance('scythe', 1)
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
  if (a.up || b.up) {
    const ua = a.up ?? AIM_UP,
      ub = b.up ?? AIM_UP
    const up: V = out.up ?? [0, 1, 0]
    for (let c = 0; c < 3; c++) up[c] = ua[c] + (ub[c] - ua[c]) * s
    out.up = up
  } else out.up = undefined
  out.twist = (a.twist ?? 0) + ((b.twist ?? 0) - (a.twist ?? 0)) * s
  out.lean = (a.lean ?? 0) + ((b.lean ?? 0) - (a.lean ?? 0)) * s
  out.drop = (a.drop ?? 0) + ((b.drop ?? 0) - (a.drop ?? 0)) * s
  return out
}

/** A key with every field set (blend targets and sources). */
export const newKey = (): Key => ({ t: 0, pos: [0, 0, 0], fwd: [0, 0, 1], up: [0, 1, 0], twist: 0, lean: 0, drop: 0 })

/** Copies src into dst (an undefined up becomes the aim up). */
export function copyInto(dst: Key, src: Key) {
  for (let c = 0; c < 3; c++) {
    dst.pos[c] = src.pos[c]
    dst.fwd[c] = src.fwd[c]
    dst.up![c] = src.up ? src.up[c] : c === 1 ? 1 : 0
  }
  dst.twist = src.twist ?? 0
  dst.lean = src.lean ?? 0
  dst.drop = src.drop ?? 0
}

/** dst = a → b at s (directions renormalised); b.up undefined means the aim's up. */
export function blendInto(dst: Key, a: Key, b: Key, s: number) {
  for (let c = 0; c < 3; c++) {
    const bu = b.up ? b.up[c] : c === 1 ? 1 : 0
    dst.pos[c] = a.pos[c] + (b.pos[c] - a.pos[c]) * s
    dst.fwd[c] = a.fwd[c] + (b.fwd[c] - a.fwd[c]) * s
    dst.up![c] = a.up![c] + (bu - a.up![c]) * s
  }
  normalise(dst.fwd, 2)
  normalise(dst.up!, 1)
  dst.twist = (a.twist ?? 0) + ((b.twist ?? 0) - (a.twist ?? 0)) * s
  dst.lean = (a.lean ?? 0) + ((b.lean ?? 0) - (a.lean ?? 0)) * s
  dst.drop = (a.drop ?? 0) + ((b.drop ?? 0) - (a.drop ?? 0)) * s
}

/** Normalises v in place (falls back to the unit axis `axis` when it vanishes). */
function normalise(v: [number, number, number], axis: number) {
  const l = Math.hypot(v[0], v[1], v[2])
  for (let c = 0; c < 3; c++) v[c] = l > 1e-4 ? v[c] / l : c === axis ? 1 : 0
}

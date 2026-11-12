/** Sculpt recipes of the furry animals: 柴犬, 三毛猫, ウサギ, ヒグマ, キツネ, ハムスター. */
import { SPECIES } from '../../data/species'
import { bodyPlan } from '../rig'
import { cone, ellipsoid, scaled, Sculpt, sphere } from '../sdf/sculpt'
import {
  arms,
  blush,
  chainTail,
  curlJoints,
  curlTail,
  head,
  legs,
  nose,
  pomTail,
  scaler,
  torso,
  triEar,
  uniform,
  type Look
} from './body'
import type { SpeciesRecipe } from './recipes'

const CREAM = 0xfaebd3
const WHITE = 0xfaf6f0
const PINK = 0xf7b3c0
const DARK = 0x2c2226

export function shiba(): SpeciesRecipe {
  const H = SPECIES.shiba.height
  const P = scaler(H)
  // The curl: from the rump straight back, over the top and forward until the tip touches the back.
  const curl = curlJoints(H, [0.02, 0.335, -0.21], 0.082, (225 * Math.PI) / 180, (505 * Math.PI) / 180, 0.035)
  const plan = bodyPlan({ H, ear1: [0.125, 0.92, -0.01], ear2: [0.16, 1.0, 0], tail: curl.joints })
  const look: Look = { fur: 0xe38b4b, belly: CREAM }
  const s = new Sculpt()
  torso(s, plan, look)
  legs(s, plan, look)
  arms(s, plan, look)
  head(s, plan, look)
  s.add(ellipsoid(P(0, 0.712, 0.158), P(0.088, 0.062, 0.07)), { color: CREAM, bone: 'head', k: 0.05 * H })
  nose(s, P(0, 0.742, 0.222), P(0.03, 0.021, 0.02), DARK)
  triEar(s, plan, {
    base: [0.125, 0.905, -0.015],
    tip: [0.195, 1.075, 0.01],
    r0: 0.082,
    r1: 0.016,
    color: look.fur,
    inner: CREAM
  })
  // Curled tail over the rump.
  curlTail(s, plan, curl.at, (t) => 0.046 + 0.024 * Math.sin(Math.PI * Math.min(1, t * 1.4)) - 0.012 * t, look.fur)
  // Markings: cream belly, lower face, eyebrow dots (maro) and the inner side of the curl.
  s.paint(ellipsoid(P(0, 0.38, 0.12), P(0.115, 0.2, 0.09)), { color: CREAM })
  s.paint(ellipsoid(P(0, 0.675, 0.12), P(0.21, 0.085, 0.14)), { color: CREAM })
  s.mirror((side) => s.paint(ellipsoid(P(0.07 * side, 0.862, 0.17), P(0.024, 0.017, 0.03)), { color: CREAM }))
  s.paint(sphere(P(0.035, 0.335, -0.21), 0.074 * H), { color: CREAM, bones: ['tail1', 'tail2', 'tail3'] })
  const parts = uniform(s, plan)
  blush(s, plan, [0.135, 0.715, 0.15])
  return {
    plan,
    sculpt: s,
    parts,
    look,
    face: {
      eyeYaw: 0.42,
      eyePitch: -0.03,
      eyeW: 0.05,
      eyeH: 0.062,
      iris: 0x9a5a2e,
      irisDark: 0x2a160e,
      pupil: 0.42,
      brow: 0x9a5530,
      mouthPitch: -0.3,
      mouth: 'w',
      mouthColor: 0x3a2228
    }
  }
}

export function cat(): SpeciesRecipe {
  const H = SPECIES.cat.height
  const P = scaler(H)
  const ORANGE = 0xf0a050
  const BLACK = 0x3d3638
  const plan = bodyPlan({
    H,
    ear1: [0.13, 0.92, -0.01],
    ear2: [0.165, 1.01, 0],
    tail: [
      [0, 0.25, -0.13],
      [0.07, 0.3, -0.26],
      [0.14, 0.44, -0.3]
    ]
  })
  const look: Look = { fur: WHITE }
  const s = new Sculpt()
  torso(s, plan, look)
  legs(s, plan, look)
  arms(s, plan, look)
  head(s, plan, look, { cheekR: 0.095 })
  s.add(ellipsoid(P(0, 0.712, 0.16), P(0.075, 0.052, 0.06)), { color: WHITE, bone: 'head', k: 0.045 * H })
  nose(s, P(0, 0.738, 0.212), P(0.022, 0.015, 0.016), 0xf08e9e)
  triEar(s, plan, {
    base: [0.13, 0.9, -0.01],
    tip: [0.2, 1.09, 0.005],
    r0: 0.08,
    r1: 0.014,
    color: WHITE,
    inner: PINK
  })
  // Long tail curving up to the left.
  chainTail(s, plan, P(0.12, 0.62, -0.26), [0.04, 0.037, 0.036, 0.032], WHITE)
  // Calico patches: orange over the left eye and ear, black over the right ear, patches on the back and tail.
  s.paint(ellipsoid(P(0.14, 0.9, 0.03), P(0.13, 0.13, 0.2)), { color: ORANGE })
  s.paint(ellipsoid(P(-0.15, 0.94, -0.03), P(0.12, 0.12, 0.2)), { color: BLACK })
  s.paint(ellipsoid(P(0.07, 0.46, -0.15), P(0.13, 0.13, 0.09)), { color: ORANGE })
  s.paint(ellipsoid(P(-0.09, 0.3, -0.13), P(0.09, 0.08, 0.08)), { color: BLACK })
  s.paint(sphere(P(0.07, 0.3, -0.26), 0.065 * H), { color: ORANGE, bones: ['tail1', 'tail2'] })
  s.paint(sphere(P(0.12, 0.6, -0.26), 0.07 * H), { color: BLACK, bones: ['tail3'] })
  const parts = uniform(s, plan)
  blush(s, plan, [0.135, 0.715, 0.15], 0.04)
  return {
    plan,
    sculpt: s,
    parts,
    look,
    face: {
      eyeYaw: 0.43,
      eyePitch: -0.02,
      eyeW: 0.052,
      eyeH: 0.062,
      iris: 0x7fdc6a,
      irisDark: 0x1d5a2c,
      pupil: 0.36,
      brow: 0xb89a8a,
      mouthPitch: -0.29,
      mouth: 'w',
      mouthColor: 0x5a3038
    }
  }
}

export function rabbit(): SpeciesRecipe {
  const H = SPECIES.rabbit.height
  const P = scaler(H)
  const plan = bodyPlan({
    H,
    ear1: [0.07, 0.95, -0.02],
    ear2: [0.085, 1.15, -0.035],
    tail: [
      [0, 0.24, -0.15],
      [0, 0.26, -0.18],
      [0, 0.28, -0.2]
    ]
  })
  const look: Look = { fur: 0xfbf8f6 }
  const s = new Sculpt()
  torso(s, plan, look)
  legs(s, plan, look, { foot: [0.07, 0.05, 0.115], footOff: [0, -0.008, 0.05] })
  arms(s, plan, look)
  head(s, plan, look, { cheekR: 0.1 })
  // Muzzle puffs and a pink nose.
  s.mirror((side) =>
    s.add(sphere(P(0.03 * side, 0.705, 0.18), 0.04 * H), { color: look.fur, bone: 'head', k: 0.03 * H })
  )
  nose(s, P(0, 0.735, 0.21), P(0.02, 0.015, 0.016), 0xf27f97)
  // Long ears (two bones each) with pink insides, leaning slightly back and out.
  s.mirror((side, S) => {
    const a = P(0.07 * side, 0.93, -0.02)
    const m = P(0.09 * side, 1.15, -0.04)
    const b = P(0.1 * side, 1.37, -0.05)
    s.add(scaled(cone(a, m, 0.045 * H, 0.065 * H, [0.15 * side, 0, 1]), [1, 1, 0.42]), {
      color: look.fur,
      bone: `ear${S}1`,
      k: 0.03 * H
    })
    s.add(scaled(cone(m, b, 0.065 * H, 0.04 * H, [0.15 * side, 0, 1]), [1, 1, 0.42]), {
      color: look.fur,
      bone: `ear${S}2`,
      k: 0.02 * H
    })
    s.sub(scaled(cone(P(0.075 * side, 0.99, 0.0), P(0.098 * side, 1.33, -0.03), 0.032 * H, 0.026 * H), [1, 1, 0.4]), {
      k: 0.01 * H,
      color: PINK
    })
  })
  pomTail(s, plan, look.fur, 0.07)
  const parts = uniform(s, plan)
  blush(s, plan, [0.135, 0.715, 0.15], 0.045, 0.7)
  return {
    plan,
    sculpt: s,
    parts,
    look,
    face: {
      eyeYaw: 0.44,
      eyePitch: -0.02,
      eyeW: 0.05,
      eyeH: 0.064,
      iris: 0xff5a6e,
      irisDark: 0x6a0e22,
      pupil: 0.4,
      brow: 0xd8c4c4,
      mouthPitch: -0.33,
      mouth: 'x',
      mouthColor: 0x7a3a48
    }
  }
}

export function bear(): SpeciesRecipe {
  const H = SPECIES.bear.height
  const P = scaler(H)
  const MUZZLE = 0xd8b48a
  const BELLY = 0xb58660
  const plan = bodyPlan({
    H,
    headR: [0.235, 0.2, 0.198],
    shoulder: [0.16, 0.53, 0],
    elbow: [0.255, 0.45, 0.01],
    wrist: [0.29, 0.36, 0.03],
    hip: [0.1, 0.235, 0],
    knee: [0.105, 0.13, 0.008],
    ankle: [0.105, 0.055, 0],
    ear1: [0.15, 0.94, -0.02],
    ear2: [0.17, 0.98, -0.02],
    tail: [
      [0, 0.24, -0.165],
      [0, 0.25, -0.18],
      [0, 0.26, -0.19]
    ]
  })
  const look: Look = { fur: 0x704832, belly: BELLY }
  const s = new Sculpt()
  torso(s, plan, look, { chestR: [0.175, 0.17, 0.15], bellyR: [0.185, 0.16, 0.175], hipsR: [0.165, 0.105, 0.145] })
  legs(s, plan, look, { legR: [0.078, 0.068, 0.064], foot: [0.07, 0.052, 0.09] })
  arms(s, plan, look, { armR: [0.058, 0.052, 0.049], pawR: 0.064 })
  head(s, plan, look, { cheekR: 0.095 })
  s.add(ellipsoid(P(0, 0.7, 0.16), P(0.1, 0.07, 0.075)), { color: MUZZLE, bone: 'head', k: 0.05 * H })
  nose(s, P(0, 0.735, 0.228), P(0.034, 0.022, 0.02))
  // Round ears with lighter insides.
  s.mirror((side, S) => {
    const c = P(0.16 * side, 0.94, -0.02)
    s.add(scaled(sphere(c, 0.068 * H), [1, 1, 0.55]), { color: look.fur, bone: `ear${S}1`, k: 0.03 * H })
    s.sub(scaled(sphere(P(0.162 * side, 0.945, 0.012), 0.042 * H), [1, 1, 0.45]), { k: 0.01 * H, color: MUZZLE })
  })
  pomTail(s, plan, look.fur, 0.05)
  s.paint(ellipsoid(P(0, 0.36, 0.14), P(0.125, 0.155, 0.08)), { color: BELLY })
  const parts = uniform(s, plan, { bound: [0.2, 0.2, 0.18] })
  blush(s, plan, [0.14, 0.715, 0.15], 0.04, 0.45)
  return {
    plan,
    sculpt: s,
    parts,
    look,
    face: {
      eyeYaw: 0.4,
      eyePitch: 0.0,
      eyeW: 0.043,
      eyeH: 0.054,
      iris: 0x7a4a2a,
      irisDark: 0x1e120c,
      pupil: 0.46,
      brow: 0x4a2c1e,
      mouthPitch: -0.36,
      mouth: 'w',
      mouthColor: 0x3a2020
    }
  }
}

export function fox(): SpeciesRecipe {
  const H = SPECIES.fox.height
  const P = scaler(H)
  const SOCK = 0x352a2c
  const plan = bodyPlan({
    H,
    ear1: [0.12, 0.92, -0.01],
    ear2: [0.165, 1.02, 0],
    tail: [
      [0, 0.24, -0.13],
      [0.03, 0.3, -0.28],
      [0.05, 0.45, -0.38]
    ]
  })
  const look: Look = { fur: 0xee7a2a, paws: SOCK }
  const s = new Sculpt()
  torso(s, plan, look)
  legs(s, plan, look)
  arms(s, plan, look)
  head(s, plan, look, { cheekR: 0.098, cheek: [0.13, 0.715, 0.07] })
  // Pointed muzzle and a black nose.
  s.add(cone(P(0, 0.725, 0.1), P(0, 0.7, 0.245), 0.075 * H, 0.026 * H), { color: look.fur, bone: 'head', k: 0.05 * H })
  nose(s, P(0, 0.712, 0.262), P(0.024, 0.017, 0.016), 0x221a1c)
  triEar(s, plan, {
    base: [0.12, 0.9, -0.015],
    tip: [0.215, 1.12, 0.0],
    r0: 0.085,
    r1: 0.014,
    color: look.fur,
    inner: WHITE,
    tipColor: SOCK
  })
  // Huge fluffy tail in an S curve.
  chainTail(s, plan, P(0.02, 0.62, -0.37), [0.05, 0.118, 0.13, 0.058], look.fur)
  // Markings: white chest, white muzzle underside and cheeks, white tail tip.
  s.paint(ellipsoid(P(0, 0.44, 0.13), P(0.1, 0.16, 0.08)), { color: WHITE })
  s.paint(ellipsoid(P(0, 0.665, 0.14), P(0.21, 0.065, 0.16)), { color: WHITE })
  s.paint(sphere(P(0.02, 0.62, -0.37), 0.115 * H), { color: WHITE, bones: ['tail3', 'tail2'] })
  const parts = uniform(s, plan)
  blush(s, plan, [0.135, 0.73, 0.15], 0.04, 0.5)
  return {
    plan,
    sculpt: s,
    parts,
    look,
    face: {
      eyeYaw: 0.43,
      eyePitch: 0.0,
      eyeW: 0.05,
      eyeH: 0.06,
      iris: 0xf0b030,
      irisDark: 0x5a2c08,
      pupil: 0.4,
      brow: 0x8a3a10,
      mouthPitch: -0.38,
      mouth: 'w',
      mouthColor: 0x3a2228
    }
  }
}

export function hamster(): SpeciesRecipe {
  const H = SPECIES.hamster.height
  const P = scaler(H)
  const GOLD = 0xf3b55c
  const PAW = 0xf7c0b6
  const plan = bodyPlan({
    H,
    headY: 0.77,
    headR: [0.255, 0.225, 0.215],
    shoulder: [0.16, 0.5, 0],
    elbow: [0.25, 0.44, 0.025],
    wrist: [0.275, 0.385, 0.055],
    hip: [0.1, 0.2, 0],
    knee: [0.102, 0.12, 0.01],
    ankle: [0.102, 0.05, 0.01],
    ear1: [0.15, 0.93, -0.03],
    ear2: [0.165, 0.97, -0.03],
    tail: [
      [0, 0.2, -0.17],
      [0, 0.21, -0.19],
      [0, 0.22, -0.2]
    ]
  })
  const look: Look = { fur: GOLD, paws: PAW }
  const s = new Sculpt()
  torso(s, plan, look, { chestY: 0.42, chestR: [0.18, 0.17, 0.16], bellyY: 0.3, bellyR: [0.2, 0.16, 0.18] })
  legs(s, plan, look, { legR: [0.06, 0.05, 0.045], foot: [0.055, 0.04, 0.07] })
  arms(s, plan, look, { armR: [0.045, 0.04, 0.036], pawR: 0.048 })
  head(s, plan, look, { cheekR: 0.13, cheek: [0.14, 0.69, 0.07] })
  s.add(ellipsoid(P(0, 0.69, 0.17), P(0.07, 0.05, 0.05)), { color: WHITE, bone: 'head', k: 0.05 * H })
  nose(s, P(0, 0.715, 0.215), P(0.02, 0.014, 0.014), 0xf08a98)
  s.mirror((side, S) => {
    s.add(scaled(sphere(P(0.15 * side, 0.94, -0.03), 0.06 * H), [1, 1, 0.55]), {
      color: GOLD,
      bone: `ear${S}1`,
      k: 0.03 * H
    })
    s.sub(scaled(sphere(P(0.152 * side, 0.945, 0.0), 0.038 * H), [1, 1, 0.45]), { k: 0.008 * H, color: PINK })
  })
  pomTail(s, plan, GOLD, 0.04)
  // White belly and lower face (cheek pouches).
  s.paint(ellipsoid(P(0, 0.34, 0.13), P(0.15, 0.2, 0.1)), { color: WHITE })
  s.paint(ellipsoid(P(0, 0.62, 0.12), P(0.27, 0.085, 0.16)), { color: WHITE })
  const parts = uniform(s, plan, { bound: [0.2, 0.18, 0.18], coreY: 0.45, beltY: 0.26, backY: 0.43 })
  blush(s, plan, [0.15, 0.7, 0.16], 0.05, 0.6)
  return {
    plan,
    sculpt: s,
    parts,
    look,
    face: {
      eyeYaw: 0.42,
      eyePitch: 0.03,
      eyeW: 0.05,
      eyeH: 0.058,
      iris: 0x5a3220,
      irisDark: 0x120806,
      pupil: 0.5,
      brow: 0xb87a3a,
      mouthPitch: -0.3,
      mouth: 'w',
      mouthColor: 0x5a3038
    }
  }
}

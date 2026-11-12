/** Sculpt recipes of the birds: ペンギン (flipper arms) and フクロウ (wing arms). */
import { SPECIES } from '../../data/species'
import { bodyPlan, type BodyPlan } from '../rig'
import { cone, ellipsoid, scaled, Sculpt, sphere, type Vec3 } from '../sdf/sculpt'
import { blush, head, legs, pomTail, scaler, torso, triEar, uniform, type Look } from './body'
import type { SpeciesRecipe } from './recipes'

const WHITE = 0xfaf6f0

/** Flattened wing/flipper arms with a rounded tip that can still hold an antique. */
function wingArms(
  s: Sculpt,
  plan: BodyPlan,
  color: number,
  tip: number,
  r: [number, number, number, number],
  flat = 0.5
) {
  const H = plan.H
  const L = plan.layout
  s.mirror((side, S) => {
    const sh = L[`upperArm${S}`],
      el = L[`lowerArm${S}`],
      wr = L[`paw${S}`]
    const hint: Vec3 = [side, 0, 0]
    s.add(scaled(cone(sh, el, r[0] * H, r[1] * H, hint), [1, 1, flat]), {
      color,
      bone: `upperArm${S}`,
      k: 0.03 * H,
      wk: 0.005 * H
    })
    s.add(scaled(cone(el, wr, r[1] * H, r[2] * H, hint), [1, 1, flat]), {
      color,
      bone: `lowerArm${S}`,
      k: 0.02 * H,
      wk: 0.006 * H
    })
    s.add(scaled(sphere([wr[0] + 0.006 * H * side, wr[1] - 0.02 * H, wr[2] + 0.01 * H], r[3] * H), [0.66, 1, 1]), {
      color: tip,
      bone: `paw${S}`,
      k: 0.025 * H
    })
  })
}

export function penguin(): SpeciesRecipe {
  const H = SPECIES.penguin.height
  const P = scaler(H)
  const BLACK = 0x2d3240
  const BEAK = 0xf7a234
  const plan = bodyPlan({
    H,
    headR: [0.225, 0.2, 0.2],
    shoulder: [0.16, 0.5, 0],
    elbow: [0.25, 0.42, 0.0],
    wrist: [0.285, 0.33, 0.01],
    hip: [0.08, 0.17, 0],
    knee: [0.085, 0.11, 0.005],
    ankle: [0.09, 0.05, 0.0],
    tail: [
      [0, 0.17, -0.17],
      [0, 0.12, -0.21],
      [0, 0.09, -0.23]
    ]
  })
  const look: Look = { fur: BLACK }
  const s = new Sculpt()
  torso(s, plan, look, {
    chestY: 0.44,
    chestR: [0.185, 0.2, 0.17],
    bellyY: 0.3,
    bellyR: [0.2, 0.17, 0.185],
    hipsR: [0.17, 0.12, 0.16]
  })
  legs(s, plan, { fur: BLACK, paws: BEAK }, { legR: [0.06, 0.05, 0.045], foot: [0.078, 0.035, 0.105] })
  wingArms(s, plan, BLACK, BLACK, [0.055, 0.05, 0.042, 0.05])
  head(s, plan, look, { cheekR: 0.09 })
  // Beak.
  s.add(scaled(cone(P(0, 0.742, 0.16), P(0, 0.722, 0.29), 0.042 * H, 0.01 * H, [0, 1, 0]), [1, 1, 0.72]), {
    color: BEAK,
    bone: 'head',
    k: 0.015 * H
  })
  pomTail(s, plan, BLACK, 0.045)
  // White front and the heart-shaped face mask around the eyes.
  s.paint(ellipsoid(P(0, 0.34, 0.14), P(0.15, 0.28, 0.12)), { color: WHITE })
  s.paint(ellipsoid(P(0, 0.72, 0.15), P(0.17, 0.11, 0.12)), { color: WHITE })
  s.mirror((side) => s.paint(ellipsoid(P(0.085 * side, 0.81, 0.16), P(0.072, 0.072, 0.1)), { color: WHITE }))
  const parts = uniform(s, plan, { bound: [0.2, 0.22, 0.19], beltY: 0.26 })
  blush(s, plan, [0.14, 0.72, 0.15], 0.04, 0.6)
  return {
    plan,
    sculpt: s,
    parts,
    look,
    face: {
      eyeYaw: 0.4,
      eyePitch: 0.02,
      eyeW: 0.044,
      eyeH: 0.056,
      iris: 0x4a6aa8,
      irisDark: 0x10162a,
      pupil: 0.45,
      brow: 0x2d3240,
      mouthPitch: -0.3,
      mouth: 'beak',
      mouthColor: 0xd8801c
    }
  }
}

export function owl(): SpeciesRecipe {
  const H = SPECIES.owl.height
  const P = scaler(H)
  const FEATHER = 0x8f7a63
  const DARKER = 0x7a6650
  const DISC = 0xf4eee3
  const BELLY = 0xd9c7aa
  const plan = bodyPlan({
    H,
    headR: [0.23, 0.205, 0.2],
    shoulder: [0.16, 0.52, -0.01],
    elbow: [0.25, 0.435, -0.005],
    wrist: [0.285, 0.345, 0.01],
    hip: [0.085, 0.19, 0],
    knee: [0.09, 0.12, 0.01],
    ankle: [0.092, 0.05, 0.01],
    ear1: [0.13, 0.95, 0.0],
    ear2: [0.18, 1.04, 0.0],
    tail: [
      [0, 0.2, -0.16],
      [0, 0.15, -0.21],
      [0, 0.11, -0.24]
    ]
  })
  const look: Look = { fur: FEATHER }
  const s = new Sculpt()
  torso(s, plan, look, { chestR: [0.18, 0.19, 0.16], bellyY: 0.32, bellyR: [0.19, 0.16, 0.17] })
  legs(s, plan, { fur: FEATHER, paws: 0xe8b24a }, { legR: [0.06, 0.045, 0.035], foot: [0.06, 0.03, 0.075] })
  wingArms(s, plan, FEATHER, 0x6f5c48, [0.062, 0.055, 0.045, 0.052], 0.55)
  head(s, plan, look, { cheekR: 0.09 })
  // Facial disc: two shallow dishes, light coloured.
  s.mirror((side) =>
    s.sub(scaled(sphere(P(0.085 * side, 0.79, 0.255), 0.1 * H), [1, 1, 0.5]), { k: 0.03 * H, color: DISC })
  )
  // Hooked beak.
  s.add(scaled(cone(P(0, 0.765, 0.19), P(0, 0.72, 0.222), 0.03 * H, 0.01 * H, [0, 0, 1]), [1, 1, 0.8]), {
    color: 0xe5b24e,
    bone: 'head',
    k: 0.01 * H
  })
  triEar(s, plan, {
    base: [0.13, 0.93, 0.0],
    tip: [0.205, 1.07, -0.01],
    r0: 0.06,
    r1: 0.012,
    flat: 0.4,
    color: DARKER
  })
  // Tail feathers.
  s.add(scaled(cone(P(0, 0.2, -0.15), P(0, 0.11, -0.24), 0.05 * H, 0.06 * H, [0, 0, 1]), [1, 1, 0.35]), {
    color: DARKER,
    bone: 'tail1',
    k: 0.02 * H
  })
  // Markings: light belly with chevron spots, the white disc around both eyes.
  s.paint(ellipsoid(P(0, 0.36, 0.13), P(0.13, 0.2, 0.1)), { color: BELLY })
  for (const [x, y] of [
    [-0.05, 0.42],
    [0.05, 0.42],
    [0, 0.36],
    [-0.075, 0.33],
    [0.075, 0.33],
    [0, 0.28],
    [-0.05, 0.24],
    [0.05, 0.24]
  ])
    s.paint(scaled(sphere(P(x, y, 0.16), 0.022 * H), [1.4, 0.6, 1]), { color: 0x9a826a })
  s.paint(ellipsoid(P(0, 0.79, 0.17), P(0.2, 0.14, 0.12)), { color: DISC })
  const parts = uniform(s, plan, { bound: [0.2, 0.21, 0.18] })
  blush(s, plan, [0.15, 0.73, 0.15], 0.035, 0.5)
  return {
    plan,
    sculpt: s,
    parts,
    look,
    face: {
      eyeYaw: 0.4,
      eyePitch: 0.02,
      eyeW: 0.06,
      eyeH: 0.064,
      iris: 0xffb522,
      irisDark: 0xa04a00,
      pupil: 0.4,
      brow: 0x6a5642,
      mouthPitch: -0.3,
      mouth: 'beak',
      mouthColor: 0xc89030
    }
  }
}

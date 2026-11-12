/** Melee antiques and the armadillo shield. See kit.ts for conventions (paw at origin, +Z to the tip). */
import {
  arc,
  capsule,
  cone,
  cylinder,
  ellipsoid,
  plane,
  scaled,
  Sculpt,
  slab,
  sphere,
  torus,
  type Vec3
} from '../sdf/sculpt'
import type { ItemRecipe } from './item'
import { beadEyes, GLOW, INK, WHITE } from './kit'

/** ネコノツメ: a plush cat-paw gauntlet over the animal's paw, three claws and pink toe beans. */
export function claw(): ItemRecipe {
  const s = new Sculpt()
  const FUR = 0xfdf3ea
  const PINK = 0xff9fbd
  s.add(ellipsoid([0, 0, 0.03], [0.078, 0.07, 0.09]), { color: FUR })
  s.add(cylinder([0, 0, -0.05], 0.062, 0.025, 0.012, [Math.PI / 2, 0, 0]), { color: 0xffc2d6, k: 0.012 })
  for (const x of [-0.042, 0, 0.042]) {
    s.add(sphere([x, 0.012, 0.1], 0.03), { color: FUR, k: 0.02 })
    s.add(cone([x, 0.01, 0.115], [x * 1.1, -0.025, 0.175], 0.014, 0.004), { color: 0xf3f0ff, k: 0.006 })
  }
  // Pink beans on the palm (−Y) and a glowing cuff.
  s.paint(ellipsoid([0, -0.06, 0.03], [0.04, 0.03, 0.035]), { color: PINK })
  for (const x of [-0.04, 0, 0.04]) s.paint(sphere([x, -0.045, 0.095], 0.017), { color: PINK })
  s.paint(slab([0, 0, -0.045], [0, 0, 1], 0.008), { color: WHITE, mask: GLOW })
  for (const x of [-0.042, 0, 0.042])
    s.paint(capsule([x, 0.005, 0.12], [x * 1.1, -0.02, 0.17], 0.006), { color: WHITE, mask: GLOW })
  return { parts: [{ name: 'body', sculpt: s }], muzzle: [0, -0.02, 0.18], cell: 0.0045, tris: 2200 }
}

/** シャチマル: the blade is a chunky orca — black back, white belly and eye patches, tall dorsal fin, fluke guard. */
export function orca(): ItemRecipe {
  const s = new Sculpt()
  const BLACK = 0x252a36
  const WHITE_SKIN = 0xf6f8ff
  s.add(capsule([0, 0, -0.1], [0, 0, 0.05], 0.022), { color: 0x2f5f8a })
  s.add(sphere([0, 0, -0.115], 0.03), { color: BLACK, k: 0.01 })
  // Fluke guard.
  s.add(ellipsoid([0, 0, 0.06], [0.115, 0.026, 0.035]), { color: BLACK, k: 0.015 })
  // Orca body: tall and flattened, tapering to a round snout at the tip.
  s.add(scaled(cone([0, 0.0, 0.07], [0, 0.0, 0.6], 0.08, 0.03, [0, 1, 0]), [1, 1, 0.4]), { color: BLACK, k: 0.03 })
  s.add(scaled(sphere([0, 0.0, 0.6], 0.035), [0.55, 1, 1]), { color: BLACK, k: 0.03 })
  s.add(scaled(cone([0, 0.05, 0.3], [0, 0.17, 0.22], 0.035, 0.008, [1, 0, 0]), [1, 1, 0.45]), { color: BLACK, k: 0.02 })
  for (const side of [1, -1])
    s.add(scaled(cone([0.02 * side, -0.035, 0.46], [0.06 * side, -0.07, 0.4], 0.018, 0.006, [0, 1, 0]), [1, 1, 0.5]), {
      color: BLACK,
      k: 0.012
    })
  // White belly, eye patches and the grey saddle; glowing cutting edge along the belly.
  s.paint(plane([0, -0.015, 0], [0, 1, 0]), { color: WHITE_SKIN, within: ellipsoid([0, 0, 0.36], [0.06, 0.12, 0.3]) })
  for (const side of [1, -1]) {
    s.paint(ellipsoid([0.03 * side, 0.022, 0.52], [0.03, 0.016, 0.034]), { color: WHITE_SKIN })
    s.paint(sphere([0.032 * side, 0.004, 0.565], 0.007), { color: 0x101018 })
  }
  s.paint(ellipsoid([0, 0.06, 0.16], [0.05, 0.03, 0.06]), { color: 0x8a92a6 })
  s.paint(slab([0, -0.06, 0], [0, 1, 0], 0.006), {
    color: WHITE,
    mask: GLOW,
    within: ellipsoid([0, 0, 0.34], [0.06, 0.12, 0.24])
  })
  return { parts: [{ name: 'body', sculpt: s }], muzzle: [0, 0, 0.64], cell: 0.0055, tris: 2600 }
}

/** イッカク: a narwhal vamplate with a long spiral tusk. */
export function narwhal(): ItemRecipe {
  const s = new Sculpt()
  const SKIN = 0x8fb3cc
  s.add(capsule([0, 0, -0.14], [0, 0, 0.06], 0.022), { color: 0x34506e })
  s.add(sphere([0, 0, -0.15], 0.03), { color: 0x34506e, k: 0.01 })
  s.add(ellipsoid([0, 0, 0.15], [0.075, 0.068, 0.12]), { color: SKIN, k: 0.03 })
  s.add(scaled(ellipsoid([0, 0.0, 0.03], [0.07, 0.03, 0.025]), [1, 1, 1]), { color: SKIN, k: 0.02 })
  s.add(cone([0, 0.01, 0.24], [0, 0.0, 0.95], 0.024, 0.004), { color: 0xfff4dc, k: 0.01 })
  // Spiral grooves glowing along the tusk.
  for (let i = 0; i < 9; i++) {
    const z = 0.3 + i * 0.07
    const r = 0.024 - (z - 0.24) * 0.028
    s.paint(torus([0, 0.01 - (z - 0.24) * 0.014, z], r, 0.004, [Math.PI / 2 + 0.35, 0, 0]), {
      color: WHITE,
      mask: GLOW
    })
  }
  // Mottled back, pale belly, eyes looking forward.
  for (const [x, y, z] of [
    [0.03, 0.05, 0.12],
    [-0.035, 0.045, 0.17],
    [0.0, 0.06, 0.2],
    [-0.02, 0.055, 0.09]
  ])
    s.paint(sphere([x, y, z], 0.014), { color: 0x6c8aa3 })
  s.paint(plane([0, -0.02, 0], [0, 1, 0]), { color: 0xdbe9f3, within: ellipsoid([0, 0, 0.15], [0.09, 0.08, 0.14]) })
  beadEyes(s, [0, 0.025, 0.235], 0.05, 0.011, [0.6, 0, 0.8])
  return { parts: [{ name: 'body', sculpt: s }], muzzle: [0, 0, 0.96], cell: 0.0055, tris: 2600 }
}

/**
 * マンモス: a war mallet whose head is a woolly mammoth looking out of the end of a sturdy handle — a high domed
 * crown, big bead eyes, round ears, long ivory tusks curling forward and up, a trunk that hangs and curls, a
 * glowing collar round the head and a little mammoth foot as the pommel. The face (+Z) is the striking end.
 */
export function mammoth(): ItemRecipe {
  const s = new Sculpt()
  const FUR = 0xc8763f
  const DARK = 0x8c4a2a
  const LIGHT = 0xf0b077
  const IVORY = 0xfff2d8
  const WOOD = 0x6a4430
  // Handle with a round mammoth foot (toenails to the front) as the pommel.
  s.add(capsule([0, 0, -0.1], [0, 0, 0.42], 0.027), { color: WOOD })
  s.add(cylinder([0, 0, -0.13], 0.042, 0.026, 0.014, [Math.PI / 2, 0, 0]), { color: FUR, k: 0.016 })
  for (const a of [-0.75, 0, 0.75])
    s.add(sphere([Math.sin(a) * 0.038, -Math.cos(a) * 0.038, -0.148], 0.011), { color: IVORY, k: 0.006 })
  // Head: a big round skull with the mammoth's high dome at the back of the crown.
  s.add(ellipsoid([0, 0.0, 0.5], [0.13, 0.122, 0.12]), { color: FUR, k: 0.03 })
  s.add(sphere([0, 0.085, 0.49], 0.092), { color: FUR, k: 0.05 })
  s.add(ellipsoid([0, -0.015, 0.59], [0.095, 0.085, 0.05]), { color: LIGHT, k: 0.03 })
  for (const side of [1, -1]) {
    // Round ears, cheeks and the tusks curving out, forward and up.
    s.add(scaled(sphere([0.125 * side, -0.005, 0.47], 0.045), [0.38, 1.1, 1]), { color: DARK, k: 0.016 })
    s.add(cone([0.05 * side, -0.05, 0.6], [0.095 * side, -0.1, 0.67], 0.028, 0.022), { color: IVORY, k: 0.012 })
    s.add(cone([0.095 * side, -0.1, 0.67], [0.125 * side, -0.07, 0.76], 0.022, 0.017), { color: IVORY, k: 0.012 })
    s.add(cone([0.125 * side, -0.07, 0.76], [0.11 * side, 0.0, 0.8], 0.017, 0.012), { color: IVORY, k: 0.01 })
  }
  // Trunk hanging from the face and curling forward at the end.
  s.add(cone([0, -0.02, 0.62], [0, -0.09, 0.645], 0.036, 0.027), { color: LIGHT, k: 0.02 })
  s.add(cone([0, -0.09, 0.645], [0, -0.15, 0.64], 0.027, 0.02), { color: LIGHT, k: 0.012 })
  s.add(torus([0, -0.16, 0.665], 0.024, 0.016, [0, 0, Math.PI / 2]), { color: LIGHT, k: 0.01 })
  // Markings: woolly crown, eyes, blush, the glowing collar, glowing tusk tips and handle rings.
  s.paint(sphere([0, 0.15, 0.47], 0.085), { color: DARK })
  beadEyes(s, [0, 0.04, 0.61], 0.054, 0.0165)
  for (const side of [1, -1]) s.paint(sphere([0.075 * side, -0.005, 0.585], 0.016), { color: 0xff8f86, alpha: 0.55 })
  s.emboss(slab([0, 0, 0.41], [0, 0, 1], 0.012), {
    amount: 0.007,
    soft: 0.004,
    color: WHITE,
    mask: GLOW,
    within: ellipsoid([0, 0.02, 0.48], [0.15, 0.15, 0.13])
  })
  s.paint(sphere([0.11, 0.0, 0.8], 0.026), { color: WHITE, mask: GLOW, union: [sphere([-0.11, 0.0, 0.8], 0.026)] })
  s.paint(slab([0, 0, 0.3], [0, 0, 1], 0.007), {
    color: WHITE,
    mask: GLOW,
    union: [slab([0, 0, 0.0], [0, 0, 1], 0.007)],
    within: capsule([0, 0, -0.05], [0, 0, 0.4], 0.04)
  })
  return { parts: [{ name: 'body', sculpt: s }], muzzle: [0, -0.02, 0.64], cell: 0.0064, tris: 2800 }
}

/**
 * カマキリ: a reaper's scythe made of a mantis — the segmented handle is its body, its triangular head with huge
 * eyes sits where the blade meets the handle (looking out to −X), and its raptorial foreleg is the crescent
 * blade reaching along +Y with spines and a glowing cutting edge on the inner curve; the muzzle is the blade tip.
 */
export function mantis(): ItemRecipe {
  const s = new Sculpt()
  const HS = 1.4
  const GREEN = 0x8fd45a
  const LEAF = 0x7cc94e
  const DARK = 0x4f8f36
  const PINK = 0xff9cc4
  // The crescent blade first (disc A minus disc B, both across X) so the cut leaves the rest alone.
  const A: Vec3 = [0, 0.2, 0.49]
  const B: Vec3 = [0, 0.15, 0.33]
  s.add(cylinder(A, 0.2, 0.014, 0.01, [0, 0, Math.PI / 2]), { color: DARK })
  s.sub(cylinder(B, 0.296, 0.05, 0, [0, 0, Math.PI / 2]), { k: 0.006 })
  // Handle: the mantis body, with a dark grip and a round abdomen tip as the pommel.
  s.add(capsule([0, 0, -0.12], [0, 0, 0.55], 0.023), { color: GREEN })
  s.add(ellipsoid([0, 0, -0.15], [0.032, 0.032, 0.042]), { color: GREEN, k: 0.014 })
  for (const z of [0.15, 0.27, 0.39])
    s.add(torus([0, 0, z], 0.023, 0.007, [Math.PI / 2, 0, 0]), { color: GREEN, k: 0.01 })
  // Little middle legs splayed from the upper body.
  for (const side of [1, -1])
    s.add(capsule([0, 0.015 * side, 0.47], [-0.02, 0.06 * side, 0.43], 0.0065), { color: GREEN, k: 0.006 })
  // Raptorial foreleg: a thick femur out of the neck carries the blade; spines along the inner edge.
  s.add(scaled(capsule([0, 0.02, 0.57], [0, 0.13, 0.63], 0.03, [1, 0, 0]), [1, 1, 0.62]), { color: GREEN, k: 0.02 })
  for (const t of [0.22, 0.4, 0.58]) {
    const a = Math.PI * (0.62 - t * 0.55)
    const p: Vec3 = [0, B[1] + Math.cos(a) * 0.302, B[2] + Math.sin(a) * 0.302]
    const q: Vec3 = [0, B[1] + Math.cos(a) * 0.268, B[2] + Math.sin(a) * 0.268]
    s.add(cone(p, q, 0.01, 0.003), { color: 0xeaffc4, k: 0.004 })
  }
  // Folded wings along the back (+X) of the body.
  s.add(ellipsoid([0.022, 0, 0.36], [0.014, 0.034, 0.16]), { color: 0xb5e67a, k: 0.01 })
  // Head: a big wide triangle (huge eyes at the top corners, narrowing to the mouth), looking out along −X.
  const hc: Vec3 = [-0.01, 0, 0.64]
  const h = (x: number, y: number, z: number): Vec3 => [hc[0] + x * HS, hc[1] + y * HS, hc[2] + z * HS]
  s.add(scaled(cone(h(0, 0, 0.01), h(-0.012, 0, -0.05), 0.042 * HS, 0.016 * HS), [1, 1.25, 1]), {
    color: GREEN,
    k: 0.02
  })
  for (const side of [1, -1]) {
    s.add(sphere(h(-0.006, 0.048 * side, 0.012), 0.033 * HS), { color: 0xc6f07a, k: 0.012 })
    s.add(capsule(h(-0.01, 0.014 * side, 0.04), h(0.04, 0.045 * side, 0.12), 0.0065), { color: DARK, k: 0.004 })
    s.add(sphere(h(0.041, 0.046 * side, 0.125), 0.011), { color: 0xeaffc4, k: 0.003 })
  }
  // Markings: pupils with highlights, a smile and blush, pink inside the femur, stripes, the glowing edges.
  for (const side of [1, -1]) {
    s.paint(sphere(h(-0.036, 0.054 * side, 0.016), 0.014 * HS), { color: INK })
    s.paint(sphere(h(-0.04, 0.048 * side, 0.024), 0.0055 * HS), { color: WHITE })
    s.paint(sphere(h(-0.03, 0.03 * side, -0.022), 0.011 * HS), { color: 0xff9fb2, alpha: 0.6 })
  }
  s.paint(scaled(arc(h(-0.04, 0, -0.03), 0.012 * HS, 0.003, 0.9, [-Math.PI / 2, 0, Math.PI / 2]), [8, 1, 1]), {
    color: DARK
  })
  s.paint(scaled(capsule([0.034, 0, 0.23], [0.034, 0, 0.5], 0.004), [6, 1, 1]), { color: 0x7cc94e })
  s.paint(scaled(sphere([0, 0.08, 0.6], 0.032), [1.4, 1.2, 0.8]), { color: PINK })
  s.paint(slab([0, 0, 0.21], [0, 0, 1], 0.012), {
    color: DARK,
    union: [slab([0, 0, 0.33], [0, 0, 1], 0.012), slab([0, 0, 0.0], [0, 0, 1], 0.05)],
    within: capsule([0, 0, -0.1], [0, 0, 0.5], 0.04)
  })
  s.paint(cylinder(A, 0.187, 0.02, 0, [0, 0, Math.PI / 2]), { color: LEAF })
  s.paint(cylinder(B, 0.305, 0.05, 0, [0, 0, Math.PI / 2]), {
    color: WHITE,
    mask: GLOW,
    within: cylinder(A, 0.21, 0.05, 0, [0, 0, Math.PI / 2])
  })
  s.paint(slab([0, 0, 0.45], [0, 0, 1], 0.0045), {
    color: WHITE,
    mask: GLOW,
    within: capsule([0, 0, 0.3], [0, 0, 0.55], 0.04)
  })
  return { parts: [{ name: 'body', sculpt: s }], muzzle: [0, 0.395, 0.485], cell: 0.0064, tris: 2800 }
}

/** アルマジロ: a curled armadillo as a round banded shield; the head peeks over the top. */
export function armadillo(): ItemRecipe {
  const s = new Sculpt()
  const SHELL = 0xc8a07c
  // Handle behind (the paw holds the origin), the shield in front.
  s.add(capsule([-0.035, 0, 0.0], [0.035, 0, 0.0], 0.018), { color: 0x6d4a35 })
  s.add(capsule([0, 0, 0.0], [0, 0, 0.05], 0.016), { color: 0x6d4a35, k: 0.01 })
  s.add(ellipsoid([0, 0, 0.09], [0.19, 0.19, 0.075]), { color: SHELL, k: 0.02 })
  s.sub(plane([0, 0, 0.07], [0, 0, -1]), { k: 0.02 })
  // Bands across the shell (raised ridges) with glowing grooves.
  for (const y of [-0.12, -0.06, 0, 0.06, 0.12]) {
    s.emboss(slab([0, y, 0], [0, 1, 0], 0.022), { amount: 0.006, soft: 0.006, within: sphere([0, 0, 0.09], 0.2) })
    s.paint(slab([0, y + 0.03, 0], [0, 1, 0], 0.0035), {
      color: WHITE,
      mask: GLOW,
      within: ellipsoid([0, 0, 0.11], [0.18, 0.18, 0.08])
    })
  }
  s.paint(sphere([0, 0, 0.17], 0.06), { color: 0xe0bb93 })
  // Head peeking over the top with big ears, tail curling at the bottom.
  s.add(ellipsoid([0, 0.17, 0.14], [0.05, 0.045, 0.05]), { color: 0xe8c3a0, k: 0.02 })
  s.add(cone([0, 0.175, 0.16], [0, 0.16, 0.22], 0.03, 0.012), { color: 0xe8c3a0, k: 0.012 })
  for (const side of [1, -1])
    s.add(scaled(sphere([0.04 * side, 0.21, 0.13], 0.022), [1, 1, 0.4]), { color: 0xd9a988, k: 0.01 })
  beadEyes(s, [0, 0.19, 0.175], 0.026, 0.009)
  s.add(cone([0, -0.17, 0.13], [0.04, -0.22, 0.16], 0.022, 0.008), { color: SHELL, k: 0.012 })
  return { parts: [{ name: 'body', sculpt: s }], muzzle: [0, 0, 0.18], cell: 0.006, tris: 2800 }
}

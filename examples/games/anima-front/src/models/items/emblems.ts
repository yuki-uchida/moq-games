/**
 * Passive antiques as small 3D charms (armour emblems and the seven enhancements). Each stands on a little
 * medallion base whose glowing rim carries the antique's accent colour; the tip anchor is above the charm.
 */
import { arc, capsule, cone, cylinder, ellipsoid, plane, scaled, Sculpt, sphere, torus } from '../sdf/sculpt'
import type { ItemRecipe } from './item'
import { beadEyes, GLOW, INK, WHITE } from './kit'

function base(color: number): Sculpt {
  const s = new Sculpt()
  s.add(cylinder([0, 0.008, 0], 0.055, 0.008, 0.005), { color })
  s.paint(torus([0, 0.012, 0], 0.052, 0.004), { color: WHITE, mask: GLOW })
  return s
}

const charm = (s: Sculpt, top = 0.12): ItemRecipe => ({
  parts: [{ name: 'body', sculpt: s }],
  muzzle: [0, top, 0],
  cell: 0.0032,
  tris: 1800
})

/** カメノコウラ: a cheerful turtle with a scuted shell. */
export function turtle(): ItemRecipe {
  const s = base(0x3f7a44)
  s.add(scaled(sphere([0, 0.04, 0], 0.045), [1, 0.7, 1.1]), { color: 0x5fb35a, k: 0.008 })
  s.add(sphere([0, 0.04, 0.055], 0.02), { color: 0xa8d98a, k: 0.01 })
  for (const [x, z] of [
    [0.035, 0.03],
    [-0.035, 0.03],
    [0.035, -0.03],
    [-0.035, -0.03]
  ])
    s.add(ellipsoid([x, 0.022, z], [0.014, 0.01, 0.014]), { color: 0xa8d98a, k: 0.008 })
  for (const [x, z] of [
    [0, 0],
    [0.022, 0.018],
    [-0.022, 0.018],
    [0.022, -0.02],
    [-0.022, -0.02]
  ])
    s.paint(scaled(sphere([x, 0.07, z], 0.012), [1, 2, 1]), { color: 0x8fd16a })
  beadEyes(s, [0, 0.047, 0.07], 0.009, 0.0045)
  return charm(s, 0.09)
}

/** ハリネズミ: a round hedgehog ball with a happy face. */
export function hedgehog(): ItemRecipe {
  const s = base(0x8a6b58)
  s.add(sphere([0, 0.05, 0], 0.04), { color: 0x9a7a66, k: 0.008 })
  for (let i = 0; i < 16; i++) {
    const a = i * 2.39996
    const y = 1 - (i + 0.5) / 9
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const d: [number, number, number] = [Math.cos(a) * r, y, Math.sin(a) * r]
    if (d[2] > 0.45 || d[1] < -0.3) continue
    const p: [number, number, number] = [d[0] * 0.036, 0.05 + d[1] * 0.036, d[2] * 0.036]
    s.add(cone(p, [p[0] + d[0] * 0.025, p[1] + d[1] * 0.025, p[2] + d[2] * 0.025], 0.009, 0.002), {
      color: 0x7a5a48,
      k: 0.006
    })
  }
  s.add(ellipsoid([0, 0.045, 0.035], [0.026, 0.024, 0.016]), { color: 0xf3dcc4, k: 0.01 })
  s.add(sphere([0, 0.043, 0.053], 0.006), { color: INK, k: 0.003 })
  beadEyes(s, [0, 0.055, 0.045], 0.012, 0.0045)
  return charm(s, 0.1)
}

/** クラゲヴェール: a translucent-pink jellyfish charm. */
export function jelly(): ItemRecipe {
  const s = base(0xc8678f)
  s.add(scaled(sphere([0, 0.075, 0], 0.035), [1, 0.8, 1]), { color: 0xf7a6c6, mask: GLOW, k: 0.008 })
  s.sub(plane([0, 0.062, 0], [0, 1, 0]), { k: 0.004 })
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    const x = Math.cos(a) * 0.018,
      z = Math.sin(a) * 0.018
    s.add(capsule([x, 0.065, z], [x * 1.3, 0.025, z * 1.3], 0.004), { color: 0xffc9dd, mask: GLOW, k: 0.005 })
  }
  s.paint(sphere([0.012, 0.09, 0.024], 0.008), { color: WHITE })
  beadEyes(s, [0, 0.075, 0.03], 0.011, 0.004)
  return charm(s, 0.12)
}

/** キバ: a big white wolf fang on a red cord. */
export function fang(): ItemRecipe {
  const s = base(0x9a3a3a)
  s.add(torus([0, 0.105, 0], 0.015, 0.004, [Math.PI / 2, 0, 0]), { color: 0xd84a4a })
  s.add(cone([0, 0.09, 0], [0.012, 0.025, 0.0], 0.02, 0.004), { color: 0xfff6e8, k: 0.004 })
  s.add(scaled(arc([0, 0.07, 0], 0.03, 0.012, 0.6, [Math.PI / 2, 0, 0]), [1, 1, 0.7]), { color: 0xfff6e8, k: 0.01 })
  s.paint(capsule([-0.004, 0.08, 0.012], [0.006, 0.04, 0.012], 0.003), { color: WHITE, mask: GLOW })
  return charm(s, 0.13)
}

/** タカノメ: a proud hawk head — a big amber eye on each side, white cheeks and a hooked beak. */
export function hawk(): ItemRecipe {
  const s = base(0x9a6a1a)
  s.add(sphere([0, 0.07, 0], 0.036), { color: 0x7a4e26, k: 0.008 })
  s.add(cone([0, 0.07, 0.03], [0, 0.058, 0.062], 0.016, 0.006), { color: 0xf2c24a, k: 0.006 })
  s.add(cone([0, 0.058, 0.062], [0, 0.046, 0.056], 0.006, 0.003), { color: 0xf2c24a, k: 0.004 })
  s.add(scaled(cone([0, 0.09, -0.02], [0, 0.11, -0.05], 0.02, 0.006, [1, 0, 0]), [1, 1, 0.5]), {
    color: 0x5a3818,
    k: 0.008
  })
  for (const side of [1, -1]) {
    s.paint(ellipsoid([0.03 * side, 0.06, 0.012], [0.012, 0.016, 0.02]), { color: 0xf8f0e0 })
    s.paint(sphere([0.032 * side, 0.078, 0.012], 0.012), { color: 0xffb31a, mask: GLOW })
    s.paint(sphere([0.035 * side, 0.078, 0.014], 0.0055), { color: INK })
    s.paint(sphere([0.036 * side, 0.082, 0.017], 0.002), { color: WHITE })
  }
  s.paint(ellipsoid([0, 0.092, 0.006], [0.04, 0.008, 0.03]), { color: 0x4a2c10 })
  return charm(s, 0.12)
}

/** サイノカワ: a curved rhino horn on armoured hide. */
export function rhino(): ItemRecipe {
  const s = base(0x5f7380)
  s.add(scaled(sphere([0, 0.022, 0], 0.045), [1, 0.5, 1]), { color: 0x90a4ae, k: 0.006 })
  s.add(cone([0, 0.03, 0.01], [0, 0.09, 0.0], 0.026, 0.01), { color: 0xcfd8dc, k: 0.01 })
  s.add(cone([0, 0.09, 0.0], [0, 0.125, -0.02], 0.01, 0.003), { color: 0xcfd8dc, k: 0.006 })
  s.paint(capsule([0, 0.04, 0.026], [0, 0.1, 0.008], 0.003), { color: WHITE, mask: GLOW })
  return charm(s, 0.14)
}

/**
 * ナマケモノ: a sleepy sloth hanging by its long arms from an arched branch over the medallion — cream face with
 * the dark eye stripes, closed smiling eyes, hooked claws over the branch, two little leaves on the twig.
 */
export function sloth(): ItemRecipe {
  const s = base(0x5a7a4a)
  const FUR = 0xc2a283
  const FACE = 0xf6e8cf
  const BARK = 0x5e4a3a
  // The branch: a thin arch over the medallion (local +Z of the arc is up) with leaves.
  const R = 0.058
  s.add(arc([0, 0.032, 0], R, 0.0058, 1.85, [-Math.PI / 2, 0, 0]), { color: BARK, k: 0.004 })
  for (const [a, z] of [
    [0.62, 0.006],
    [-0.78, -0.004],
    [1.3, 0.004]
  ])
    s.add(scaled(sphere([(R + 0.007) * Math.sin(a), 0.032 + (R + 0.007) * Math.cos(a), z], 0.012), [1.3, 0.42, 0.85]), {
      color: 0x7ccf6a,
      k: 0.003
    })
  // Sloth: shaggy round body hanging under the arch, head in front, long arms hooked over the branch.
  s.add(ellipsoid([0, 0.046, -0.008], [0.022, 0.024, 0.019]), { color: FUR, k: 0.006 })
  s.add(sphere([0, 0.06, 0.012], 0.023), { color: FUR, k: 0.01 })
  for (const side of [1, -1]) {
    s.add(capsule([0.016 * side, 0.058, 0.0], [0.024 * side, 0.088, 0.002], 0.0068), { color: FUR, k: 0.005 })
    s.add(cone([0.024 * side, 0.094, 0.004], [0.022 * side, 0.098, -0.01], 0.004, 0.0025), {
      color: 0xf6ead2,
      k: 0.002
    })
    // Legs dangling.
    s.add(capsule([0.012 * side, 0.032, 0.002], [0.017 * side, 0.026, 0.014], 0.006), { color: FUR, k: 0.004 })
  }
  // Face: cream mask, dark eye stripes with sleepy closed eyes, a smile and a little nose.
  s.paint(ellipsoid([0, 0.057, 0.032], [0.02, 0.016, 0.012]), { color: FACE })
  for (const side of [1, -1]) {
    s.paint(ellipsoid([0.011 * side, 0.061, 0.033], [0.0085, 0.0045, 0.01], [0, 0, -0.45 * side]), { color: 0x5a3a28 })
    // Closed sleepy eyes (arcs drawn through the face along Z).
    s.paint(scaled(arc([0.0095 * side, 0.0638, 0.033], 0.0038, 0.0012, 1.0, [Math.PI / 2, 0, 0]), [1, 8, 1]), {
      color: FACE
    })
  }
  s.paint(sphere([0, 0.0565, 0.0345], 0.0036), { color: 0x3a2a24 })
  s.paint(scaled(arc([0, 0.0545, 0.034], 0.005, 0.0013, 0.9, [Math.PI / 2, 0, 0]), [1, 8, 1]), { color: 0x3a2a24 })
  // A glowing sap line along the branch top.
  s.paint(arc([0, 0.032, 0], R + 0.0055, 0.0026, 1.5, [-Math.PI / 2, 0, 0]), { color: WHITE, mask: GLOW })
  return charm(s, 0.115)
}

/** コアラ: a koala face with fluffy round ears and a big nose. */
export function koala(): ItemRecipe {
  const s = base(0x6a7a80)
  s.add(sphere([0, 0.065, 0], 0.035), { color: 0xb0bec5, k: 0.01 })
  for (const side of [1, -1]) {
    s.add(scaled(sphere([0.035 * side, 0.09, -0.005], 0.02), [1, 1, 0.55]), { color: 0xb0bec5, k: 0.008 })
    s.paint(scaled(sphere([0.036 * side, 0.09, 0.005], 0.012), [1, 1, 0.6]), { color: 0xf4eef0 })
  }
  s.add(ellipsoid([0, 0.058, 0.033], [0.011, 0.015, 0.008]), { color: 0x2a2a32, k: 0.004 })
  beadEyes(s, [0, 0.074, 0.03], 0.016, 0.004)
  return charm(s, 0.12)
}

/** チーター: a spotted cheetah paw print. */
export function cheetah(): ItemRecipe {
  const s = base(0xa07a2a)
  s.add(scaled(sphere([0, 0.04, 0.0], 0.03), [1.1, 0.9, 0.55]), { color: 0xffd180, k: 0.004 })
  for (const [x, y] of [
    [-0.03, 0.075],
    [-0.011, 0.088],
    [0.011, 0.088],
    [0.03, 0.075]
  ])
    s.add(scaled(sphere([x, y, 0.0], 0.012), [1, 1.15, 0.6]), { color: 0xffd180, k: 0.004 })
  for (const [x, y] of [
    [-0.012, 0.045],
    [0.014, 0.032],
    [0.005, 0.055],
    [-0.018, 0.028]
  ])
    s.paint(sphere([x, y, 0.016], 0.0055), { color: 0x4a3420 })
  s.paint(torus([0, 0.04, 0.0], 0.031, 0.003, [Math.PI / 2, 0, 0]), { color: WHITE, mask: GLOW })
  return charm(s, 0.11)
}

/** ラクダ: two camel humps with a little camel head. */
export function camel(): ItemRecipe {
  const s = base(0x9a7a4a)
  s.add(ellipsoid([0, 0.035, 0], [0.045, 0.02, 0.022]), { color: 0xd7b98e, k: 0.006 })
  s.add(sphere([-0.018, 0.055, 0], 0.02), { color: 0xd7b98e, k: 0.012 })
  s.add(sphere([0.018, 0.055, 0], 0.02), { color: 0xd7b98e, k: 0.012 })
  s.add(cone([0.04, 0.04, 0], [0.055, 0.07, 0], 0.01, 0.008), { color: 0xd7b98e, k: 0.006 })
  s.add(ellipsoid([0.06, 0.075, 0.0], [0.014, 0.01, 0.01]), { color: 0xd7b98e, k: 0.006 })
  s.paint(sphere([0.064, 0.08, 0.009], 0.003), { color: INK })
  s.paint(sphere([-0.018, 0.06, 0.012], 0.008), { color: 0xffe6a8, mask: GLOW })
  s.paint(sphere([0.018, 0.06, 0.012], 0.008), { color: 0xffe6a8, mask: GLOW })
  return charm(s, 0.1)
}

/** Melee antiques and the armadillo shield. See kit.ts for conventions (paw at origin, +Z to the tip). */
import { arc, capsule, cone, cylinder, ellipsoid, plane, scaled, Sculpt, slab, sphere, torus } from '../sdf/sculpt'
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

/** マンモス: a big woolly mammoth head on a long handle — floppy ears, white tusks and a curled trunk. */
export function mammoth(): ItemRecipe {
  const s = new Sculpt()
  const FUR = 0xa8653a
  s.add(capsule([0, 0, -0.08], [0, 0, 0.4], 0.022), { color: 0x6d4a35 })
  for (const z of [-0.02, 0.12, 0.26]) s.paint(slab([0, 0, z], [0, 0, 1], 0.008), { color: WHITE, mask: GLOW })
  // Head: the face looks along +Y, the striking crown is the far end (+Z).
  s.add(ellipsoid([0, 0.01, 0.5], [0.12, 0.11, 0.12]), { color: FUR, k: 0.03 })
  s.add(sphere([0, -0.01, 0.6], 0.075), { color: 0x8f5530, k: 0.04 })
  for (const side of [1, -1]) {
    s.add(scaled(sphere([0.125 * side, 0.0, 0.47], 0.075), [0.35, 1.1, 1]), { color: 0x8f5530, k: 0.02 })
    // Tusks: out of the cheeks, forward and curling up.
    s.add(cone([0.05 * side, 0.08, 0.43], [0.07 * side, 0.17, 0.4], 0.016, 0.011), { color: 0xfff3dc, k: 0.01 })
    s.add(cone([0.07 * side, 0.17, 0.4], [0.06 * side, 0.21, 0.47], 0.011, 0.005), { color: 0xfff3dc, k: 0.006 })
  }
  // Trunk hanging in front of the face with a curl at the end.
  s.add(cone([0, 0.1, 0.47], [0, 0.17, 0.42], 0.036, 0.026), { color: FUR, k: 0.025 })
  s.add(cone([0, 0.17, 0.42], [0, 0.18, 0.34], 0.026, 0.018), { color: FUR, k: 0.012 })
  s.add(torus([0, 0.2, 0.33], 0.02, 0.012, [0, 0, Math.PI / 2]), { color: FUR, k: 0.01 })
  beadEyes(s, [0, 0.1, 0.53], 0.05, 0.012, [0, 1, 0])
  s.paint(torus([0, 0, 0.5], 0.118, 0.007), { color: WHITE, mask: GLOW })
  s.paint(sphere([0, 0, 0.66], 0.05), { color: 0xd38a52 })
  return { parts: [{ name: 'body', sculpt: s }], muzzle: [0, 0, 0.68], cell: 0.006, tris: 2800 }
}

/** カマキリ: a long segmented handle crowned by a mantis head and a curved, serrated foreleg blade. */
export function mantis(): ItemRecipe {
  const s = new Sculpt()
  const GREEN = 0x7fc35a
  s.add(capsule([0, 0, -0.12], [0, 0, 0.55], 0.02), { color: 0x4f8a3a })
  for (const z of [0.0, 0.15, 0.3, 0.45]) s.add(sphere([0, 0, z], 0.026), { color: GREEN, k: 0.012 })
  // Head with big eyes.
  s.add(scaled(cone([0, 0.0, 0.57], [0, -0.03, 0.66], 0.05, 0.018, [0, 1, 0]), [1, 1, 0.75]), { color: GREEN, k: 0.02 })
  for (const side of [1, -1]) {
    s.add(sphere([0.045 * side, 0.01, 0.59], 0.024), { color: 0xb6e56a, k: 0.008 })
    s.paint(sphere([0.058 * side, 0.018, 0.6], 0.012), { color: INK })
    s.add(cone([0.02 * side, 0.03, 0.6], [0.06 * side, 0.08, 0.66], 0.004, 0.002), { color: GREEN, k: 0.004 })
  }
  // The blade: an arc sweeping forward and down from the head, serrated on the inner edge.
  s.add(scaled(arc([0, 0.1, 0.55], 0.17, 0.03, 1.15, [0, 0, Math.PI / 2]), [1, 1, 0.35]), { color: 0xd9f5a6, k: 0.02 })
  for (let i = 0; i < 5; i++) {
    const a = -0.6 + i * 0.3
    const y = 0.1 + Math.cos(a) * 0.14
    const z = 0.55 + Math.sin(a) * 0.14
    s.add(cone([0, y, z], [0, y - Math.cos(a) * 0.03, z - Math.sin(a) * 0.03], 0.008, 0.002), {
      color: 0xc4e88a,
      k: 0.004
    })
  }
  s.paint(scaled(arc([0, 0.1, 0.55], 0.196, 0.006, 1.1, [0, 0, Math.PI / 2]), [1, 1, 1]), { color: WHITE, mask: GLOW })
  return { parts: [{ name: 'body', sculpt: s }], muzzle: [0, 0.26, 0.62], cell: 0.0055, tris: 2600 }
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

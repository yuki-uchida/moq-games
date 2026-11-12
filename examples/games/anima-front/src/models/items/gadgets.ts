/** Gadget antiques held in a paw (and the momonga glider pack shown in the catalogue). */
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
import { gearSculpt } from '../gear'
import type { ItemRecipe } from './item'
import { beadEyes, GLOW, GLOW2, grip, INK, WHITE } from './kit'

/** カエルパッド: a plump sitting frog with a glowing launch pad on its back. */
export function frog(): ItemRecipe {
  const s = new Sculpt()
  const G = 0x6fcf4a
  s.add(ellipsoid([0, 0.045, 0.02], [0.065, 0.05, 0.06]), { color: G })
  s.add(ellipsoid([0, 0.07, 0.06], [0.055, 0.04, 0.045]), { color: G, k: 0.03 })
  for (const side of [1, -1]) {
    s.add(sphere([0.032 * side, 0.105, 0.065], 0.022), { color: G, k: 0.015 })
    s.add(ellipsoid([0.055 * side, 0.015, 0.0], [0.025, 0.02, 0.045]), { color: 0x5bb83c, k: 0.015 })
    s.add(ellipsoid([0.03 * side, 0.0, 0.07], [0.016, 0.012, 0.02]), { color: 0x5bb83c, k: 0.01 })
  }
  beadEyes(s, [0, 0.112, 0.08], 0.032, 0.012)
  s.paint(ellipsoid([0, 0.035, 0.07], [0.05, 0.035, 0.04]), { color: 0xeaf7c8 })
  s.paint(arc([0, 0.07, 0.085], 0.022, 0.003, 0.9, [Math.PI / 2, 0, 0]), { color: 0x2d4a24 })
  s.paint(scaled(sphere([0, 0.095, -0.005], 0.04), [1, 0.35, 1]), { color: 0xd8ffb0, mask: GLOW })
  s.paint(torus([0, 0.09, -0.005], 0.03, 0.004), { color: WHITE, mask: GLOW })
  return { parts: [{ name: 'body', sculpt: s }], muzzle: [0, 0.12, 0.02], cell: 0.004, tris: 2000 }
}

/** ヤモリフック: a hook launcher with a gecko lying on top; its sticky toe pad is the muzzle. */
export function gecko(): ItemRecipe {
  const s = new Sculpt()
  const SKIN = 0x5cc9c0
  grip(s, 0x2f4a50)
  s.add(capsule([0, 0.045, -0.04], [0, 0.045, 0.12], 0.03), { color: 0x3a6670 })
  // Gecko on top: body, head forward, tail curling back over the grip.
  s.add(ellipsoid([0, 0.085, 0.04], [0.028, 0.018, 0.06]), { color: SKIN, k: 0.012 })
  s.add(ellipsoid([0, 0.088, 0.115], [0.026, 0.017, 0.028]), { color: SKIN, k: 0.012 })
  s.add(cone([0, 0.085, -0.02], [0.02, 0.07, -0.08], 0.014, 0.005), { color: SKIN, k: 0.01 })
  for (const side of [1, -1])
    for (const z of [0.0, 0.08])
      s.add(capsule([0.02 * side, 0.08, z], [0.045 * side, 0.06, z + 0.012], 0.006), { color: SKIN, k: 0.006 })
  for (const [x, z] of [
    [0.01, 0.02],
    [-0.012, 0.06],
    [0.0, 0.0]
  ])
    s.paint(sphere([x, 0.1, z], 0.008), { color: 0xffd36a })
  beadEyes(s, [0, 0.098, 0.12], 0.019, 0.008)
  // Sticky pad at the muzzle.
  s.add(scaled(sphere([0, 0.045, 0.145], 0.03), [1, 1, 0.45]), { color: 0x9ff3ee, k: 0.01 })
  s.paint(torus([0, 0.045, 0.15], 0.026, 0.004, [Math.PI / 2, 0, 0]), { color: WHITE, mask: GLOW })
  return { parts: [{ name: 'body', sculpt: s }], muzzle: [0, 0.045, 0.16], cell: 0.004, tris: 2200 }
}

/** モモンガ: the glider pack — the same sleeping flying squirrel pouch the animals wear on their backs. */
export function momonga(): ItemRecipe {
  return { parts: [{ name: 'body', sculpt: gearSculpt('momonga') }], muzzle: [0, 0.12, 0.05], cell: 0.0045, tris: 2000 }
}

/**
 * コノハムシ: a leaf insect riding on a grip — its broad abdomen is a leaf (glowing midrib and side veins, a pointed
 * tip at the back and a nibbled edge), leafy flaps on its little legs, a round head with big eyes at the front.
 */
export function leaf(): ItemRecipe {
  const s = new Sculpt()
  const G = 0x8cca4c
  const DEEP = 0x5f9e36
  const EDGE = 0xcfe77e
  grip(s, 0x5a7a3a, 0.05, 0.017)
  // Leaf abdomen: two halves folded up along the midrib (so the leaf shows from the side too), wavy lobes on the
  // edges, a pointed tip at the back and a nibbled notch.
  for (const side of [1, -1])
    s.add(ellipsoid([0.036 * side, 0.054, -0.005], [0.05, 0.013, 0.105], [0, 0, 0.42 * side]), { color: G, k: 0.012 })
  s.add(scaled(cone([0, 0.052, -0.07], [0, 0.062, -0.185], 0.05, 0.004, [0, 1, 0]), [1, 1, 0.36]), {
    color: G,
    k: 0.02
  })
  for (const side of [1, -1])
    for (const [x, y, z] of [
      [0.07, 0.068, 0.035],
      [0.068, 0.067, -0.06]
    ])
      s.add(scaled(sphere([x * side, y, z], 0.022), [1, 0.42, 1.2]), { color: G, k: 0.012 })
  s.sub(sphere([0.09, 0.07, -0.012], 0.017), { k: 0.006 })
  // Thorax with a leafy collar, then the head.
  s.add(ellipsoid([0, 0.06, 0.105], [0.03, 0.02, 0.035]), { color: G, k: 0.015 })
  s.add(ellipsoid([0, 0.062, 0.098], [0.048, 0.009, 0.024]), { color: G, k: 0.01 })
  s.add(sphere([0, 0.074, 0.152], 0.036), { color: G, k: 0.012 })
  // Legs with leaf flaps: two pairs out of the thorax, one from the abdomen.
  for (const side of [1, -1]) {
    for (const [z0, z1, dz] of [
      [0.115, 0.17, 0.02],
      [0.09, 0.07, -0.01],
      [0.0, -0.06, -0.02]
    ]) {
      const root: Vec3 = [0.03 * side, 0.05, z0]
      const tip: Vec3 = [0.105 * side, 0.025, z1]
      s.add(capsule(root, tip, 0.0055), { color: DEEP, k: 0.006 })
      const f: Vec3 = [root[0] + (tip[0] - root[0]) * 0.75, 0.032, root[2] + (tip[2] - root[2]) * 0.75 + dz]
      s.add(scaled(sphere(f, 0.016), [1.25, 0.38, 0.85]), { color: G, k: 0.006 })
    }
    // Antennae with leafy tips.
    s.add(capsule([0.012 * side, 0.1, 0.165], [0.034 * side, 0.13, 0.2], 0.0048), { color: DEEP, k: 0.004 })
    s.add(scaled(sphere([0.036 * side, 0.132, 0.204], 0.011), [1, 0.5, 1.2]), { color: EDGE, k: 0.003 })
  }
  // Markings: pale rim, glowing midrib and veins, a dry spot, the face.
  s.paint(ellipsoid([0, 0.06, -0.035], [0.1, 0.03, 0.165]), { color: EDGE })
  s.paint(ellipsoid([0, 0.06, -0.025], [0.072, 0.05, 0.122]), { color: G })
  const vein = (x0: number, z0: number, x1: number, z1: number, r: number) =>
    scaled(capsule([x0, 0.05, z0], [x1, 0.05, z1], r, [0, 1, 0]), [1, 1, 8])
  s.paint(vein(0, 0.07, 0, -0.15, 0.0048), {
    color: WHITE,
    mask: GLOW,
    union: [
      vein(0, 0.04, 0.05, 0.0, 0.0036),
      vein(0, -0.02, 0.05, -0.06, 0.0036),
      vein(0, -0.075, 0.032, -0.11, 0.0036)
    ]
  })
  s.paint(vein(0, 0.04, -0.05, 0.0, 0.0036), {
    color: WHITE,
    mask: GLOW,
    union: [vein(0, -0.02, -0.05, -0.06, 0.0036), vein(0, -0.075, -0.032, -0.11, 0.0036)]
  })
  s.paint(scaled(sphere([-0.045, 0.06, 0.03], 0.013), [1, 1, 1.3]), { color: 0xc9a25a })
  beadEyes(s, [0, 0.083, 0.177], 0.022, 0.012)
  s.paint(sphere([0, 0.062, 0.187], 0.006), { color: 0x4a6a2a })
  for (const side of [1, -1]) s.paint(sphere([0.027 * side, 0.064, 0.178], 0.008), { color: 0xff9fb2, alpha: 0.6 })
  return { parts: [{ name: 'body', sculpt: s }], muzzle: [0, 0.074, 0.19], cell: 0.0042, tris: 2400 }
}

/** コウモリ: a sonar dish shaped like a bat face with huge ears and folded wings. */
export function bat(): ItemRecipe {
  const s = new Sculpt()
  const FUR = 0x5e4a8a
  grip(s, 0x3a2f55)
  s.add(sphere([0, 0.07, 0.04], 0.055), { color: FUR })
  for (const side of [1, -1]) {
    s.add(scaled(cone([0.03 * side, 0.1, 0.03], [0.07 * side, 0.17, 0.02], 0.03, 0.008, [0, 0, 1]), [1, 1, 0.35]), {
      color: FUR,
      k: 0.012
    })
    s.paint(
      scaled(cone([0.033 * side, 0.11, 0.045], [0.066 * side, 0.16, 0.035], 0.018, 0.005, [0, 0, 1]), [1, 1, 1]),
      {
        color: 0xc9a6e6
      }
    )
    s.add(scaled(cone([0.05 * side, 0.05, 0.02], [0.09 * side, 0.0, 0.0], 0.03, 0.012, [0, 0, 1]), [1, 1, 0.3]), {
      color: 0x47386b,
      k: 0.012
    })
  }
  // Dish (mouth) glowing.
  s.sub(scaled(sphere([0, 0.055, 0.1], 0.03), [1, 1, 0.6]), { k: 0.006, color: 0x2d2240 })
  s.paint(torus([0, 0.055, 0.09], 0.028, 0.004, [Math.PI / 2, 0, 0]), { color: WHITE, mask: GLOW })
  s.paint(sphere([0, 0.055, 0.085], 0.016), { color: 0xd8c4ff, mask: GLOW2 })
  beadEyes(s, [0, 0.09, 0.085], 0.024, 0.009)
  s.add(cone([0.012, 0.042, 0.085], [0.014, 0.03, 0.088], 0.004, 0.001), { color: WHITE, k: 0.002 })
  return {
    parts: [{ name: 'body', sculpt: s }],
    muzzle: [0, 0.055, 0.11],
    cell: 0.0042,
    tris: 2200,
    animate(_p, st, glow2) {
      glow2(0.3 + 2 * Math.exp(-st.sinceFire * 3))
    }
  }
}

/** タコスミ: a round purple octopus ball with curling tentacles. */
export function octopus(): ItemRecipe {
  const s = new Sculpt()
  const P = 0x8a6ab8
  s.add(ellipsoid([0, 0.06, 0.03], [0.05, 0.055, 0.05]), { color: P })
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3
    const x = Math.cos(a),
      z = Math.sin(a)
    s.add(cone([x * 0.03, 0.02, 0.03 + z * 0.03], [x * 0.055, -0.015, 0.03 + z * 0.055], 0.014, 0.006), {
      color: P,
      k: 0.012
    })
    s.add(sphere([x * 0.058, -0.012, 0.03 + z * 0.058], 0.008), { color: P, k: 0.006 })
  }
  for (const [x, y, z] of [
    [0.025, 0.1, 0.02],
    [-0.02, 0.105, 0.04],
    [0.0, 0.09, -0.02]
  ])
    s.paint(sphere([x, y, z], 0.01), { color: 0x2d2440, mask: GLOW })
  beadEyes(s, [0, 0.07, 0.072], 0.022, 0.01)
  s.paint(ellipsoid([0, 0.05, 0.08], [0.008, 0.006, 0.006]), { color: 0x4a3a6a })
  return { parts: [{ name: 'body', sculpt: s }], muzzle: [0, 0.07, 0.08], cell: 0.0038, tris: 2000 }
}

/** ハトポッポ: a grey pigeon figure with an iridescent neck and a hologram emitter on its back. */
export function pigeon(): ItemRecipe {
  const s = new Sculpt()
  const GREY = 0xa9b3bf
  grip(s, 0x4a5560, 0.05, 0.016)
  s.add(ellipsoid([0, 0.05, 0.02], [0.045, 0.045, 0.07]), { color: GREY })
  s.add(sphere([0, 0.1, 0.08], 0.032), { color: GREY, k: 0.03 })
  s.add(cone([0, 0.098, 0.105], [0, 0.092, 0.13], 0.009, 0.003), { color: 0xd9a87a, k: 0.004 })
  s.add(scaled(cone([0, 0.05, -0.04], [0, 0.03, -0.1], 0.03, 0.026, [1, 0, 0]), [1, 1, 0.3]), {
    color: 0x7d8794,
    k: 0.015
  })
  s.paint(ellipsoid([0, 0.08, 0.06], [0.04, 0.03, 0.035]), { color: 0x6fb58a })
  s.paint(ellipsoid([0, 0.07, 0.055], [0.042, 0.018, 0.03]), { color: 0x9a6fb5 })
  for (const side of [1, -1]) {
    s.paint(sphere([0.028 * side, 0.108, 0.09], 0.007), { color: 0xff8a3a })
    s.paint(sphere([0.03 * side, 0.108, 0.093], 0.004), { color: INK })
  }
  s.add(cylinder([0, 0.095, -0.0], 0.02, 0.008, 0.004), { color: 0x4a5560, k: 0.01 })
  s.paint(sphere([0, 0.105, 0.0], 0.016), { color: 0xa8f6ff, mask: GLOW2 })
  s.paint(slab([0, 0, 0.02], [0, 0, 1], 0.003), {
    color: WHITE,
    mask: GLOW,
    within: ellipsoid([0, 0.05, 0.02], [0.05, 0.05, 0.08])
  })
  return {
    parts: [{ name: 'body', sculpt: s }],
    muzzle: [0, 0.12, 0.0],
    cell: 0.0038,
    tris: 2000,
    glow2: 0x9af0ff,
    animate(_p, st, glow2) {
      glow2(0.6 + 0.4 * Math.sin(st.t * 4) + 2 * Math.exp(-st.sinceFire * 3))
    }
  }
}

/** ヤドカリ: a coral spiral shell with a little crab peeking out (eye stalks, claws). */
export function hermit(): ItemRecipe {
  const s = new Sculpt()
  const SHELL = 0xff9a6a
  for (let i = 0; i < 6; i++) {
    const t = i / 5
    const r = 0.06 - t * 0.04
    s.add(sphere([0.012 * Math.sin(t * 5), 0.06 + t * 0.07, 0.0 - t * 0.04], r), { color: SHELL, k: 0.02 })
  }
  for (let i = 0; i < 4; i++) {
    const t = i / 4
    s.paint(torus([0, 0.05 + t * 0.075, -t * 0.04], 0.058 - t * 0.035, 0.003, [0.25, 0, 0]), {
      color: WHITE,
      mask: GLOW
    })
  }
  s.sub(sphere([0, 0.05, 0.065], 0.035), { k: 0.008, color: 0x6a2e2a })
  s.add(sphere([0, 0.045, 0.06], 0.026), { color: 0xff6f50, k: 0.006 })
  for (const side of [1, -1]) {
    s.add(capsule([0.012 * side, 0.06, 0.07], [0.018 * side, 0.09, 0.08], 0.004), { color: 0xff6f50, k: 0.004 })
    s.add(sphere([0.018 * side, 0.092, 0.08], 0.008), { color: INK, k: 0.003 })
    s.add(ellipsoid([0.035 * side, 0.03, 0.085], [0.018, 0.014, 0.012]), { color: 0xff6f50, k: 0.008 })
  }
  s.paint(slab([0, 0.098, 0], [0, 1, 0], 0.003), { color: WHITE, within: sphere([0, 0.092, 0.084], 0.03) })
  return { parts: [{ name: 'body', sculpt: s }], muzzle: [0, 0.12, 0.0], cell: 0.0042, tris: 2200 }
}

/** ミツツボアリ: a round glowing honey jar with an ant sitting on the lid. */
export function honeyant(): ItemRecipe {
  const s = new Sculpt()
  s.add(sphere([0, 0.055, 0.03], 0.055), { color: 0xffb84a })
  s.add(cylinder([0, 0.11, 0.03], 0.03, 0.012, 0.006), { color: 0x9a6a3a, k: 0.01 })
  s.paint(plane([0, 0.075, 0], [0, 1, 0]), { color: 0xffd27a, mask: GLOW2, within: sphere([0, 0.055, 0.03], 0.06) })
  s.paint(torus([0, 0.075, 0.03], 0.052, 0.004), { color: WHITE, mask: GLOW })
  // Ant on the lid.
  s.add(sphere([0, 0.13, 0.03], 0.014), { color: 0x6a3a2a, k: 0.004 })
  s.add(sphere([0, 0.135, 0.052], 0.012), { color: 0x6a3a2a, k: 0.004 })
  s.add(sphere([0, 0.133, 0.006], 0.016), { color: 0xffc04a, mask: GLOW2, k: 0.004 })
  for (const side of [1, -1]) {
    s.add(capsule([0.006 * side, 0.145, 0.058], [0.02 * side, 0.165, 0.07], 0.002), { color: 0x4a2a1a, k: 0.002 })
    s.paint(sphere([0.008 * side, 0.14, 0.06], 0.0035), { color: WHITE })
  }
  grip(s, 0x6a4a2a, 0.04, 0.016)
  return {
    parts: [{ name: 'body', sculpt: s }],
    muzzle: [0, 0.14, 0.03],
    cell: 0.0038,
    tris: 2000,
    glow2: 0xffc04a,
    animate(_p, st, glow2) {
      glow2(0.8 + 0.25 * Math.sin(st.t * 2.5))
    }
  }
}

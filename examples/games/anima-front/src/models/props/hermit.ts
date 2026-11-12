/**
 * ヤドカリ wall (4 m along X, 2.5 m tall, ≈ 1 m thick): a giant candy-striped snail shell whose spiral faces
 * both sides of the wall, and the hermit crab climbing out of the aperture at +X holding its big claw up like a
 * shield. Glowing growth bands echo the antique. Cracks open (and leak anima) as it is damaged (setHealth) and
 * in its last seconds; it rises out of the ground when deployed and sinks back when it expires.
 */
import {
  capsule,
  cone,
  ellipsoid,
  plane,
  scaled,
  Sculpt,
  type Shape,
  shell,
  slab,
  sphere,
  torus,
  type Vec3
} from '../sdf/sculpt'
import { clamp01, CRACK, expiry, GLOW, INK, popIn, type PropRecipe, WHITE } from './kit'

const SHELL = 0xf47448
const SHELL_LIGHT = 0xffbb8c
const SEAM = 0xb84a3a
const LIP = 0xffb7b0
const CRAB = 0xff6f50
const CRAB_DARK = 0xdc5038
const CRAB_LIGHT = 0xffc4a8

/** Spiral centre (x, y), horizontal stretch, growth per turn, end radius and the aperture angle. */
const O: [number, number] = [-0.5, 1.42]
const SX = 1.2
const GROWTH = 1.8
const RHO_END = 1.08
const PHI_END = (-80 * Math.PI) / 180
const TURNS = 3
const TUBE = 0.34
const THICK = 0.62

/** Points along the spiral tube from the apex (t = 0) to the aperture (t = 1): centre, tube radius. */
function spiral(t: number): { c: Vec3; r: number } {
  const back = (1 - t) * TURNS
  const phi = PHI_END - back * Math.PI * 2
  const rho = RHO_END * Math.pow(GROWTH, -back)
  return { c: [O[0] + Math.cos(phi) * rho * SX, O[1] + Math.sin(phi) * rho, 0], r: rho * TUBE }
}

function shellSculpt(): Sculpt {
  const s = new Sculpt()
  // The tube as flattened cone segments (smooth outline). Segments get shorter towards the big outer whorl
  // (t = u^0.75) so the outline stays round.
  const n = 34
  const at = (i: number) => spiral(Math.pow(i / n, 0.75))
  s.add(ellipsoid([O[0], O[1], 0], [0.24, 0.22, 0.14]), { color: SHELL })
  for (let i = 0; i < n; i++) {
    const a = at(i)
    const b = at(i + 1)
    s.add(scaled(cone(a.c, b.c, a.r, b.r, [0, 0, 1]), [1, 1, THICK]), { color: SHELL, k: 0.025 })
  }
  // The aperture: a flared pink lip around a dark mouth facing +X.
  const end = spiral(1)
  const mouth: Vec3 = [end.c[0] + end.r * 0.55, end.c[1] + 0.04, 0]
  s.add(scaled(torus(mouth, end.r * 0.92, 0.1, [0, 0, Math.PI / 2]), [1, 1, 0.75]), { color: LIP, k: 0.08 })
  s.sub(ellipsoid([mouth[0] + 0.12, mouth[1], 0], [0.3, end.r * 0.82, end.r * 0.58]), { k: 0.06, color: 0x7a3a46 })
  s.sub(plane([0, 0, 0], [0, 1, 0]), { k: 0.02 })
  // Candy ribs: radial stripes through the spiral centre (shader-crisp), three of them glowing.
  const shellZone = shell([O[0], O[1], 0], [1.0, 0.95, 0.4], 0.62)
  const rib = (deg: number, w: number) => {
    const a = (deg * Math.PI) / 180
    return slab([O[0], O[1], 0], [-Math.sin(a) / SX, Math.cos(a), 0], w)
  }
  s.paint(rib(15, 0.07), { color: SHELL_LIGHT, within: shellZone, union: [rib(75, 0.07), rib(135, 0.07)] })
  s.paint(rib(45, 0.05), { color: 0xfff0dc, mask: GLOW, within: shellZone, union: [rib(105, 0.05), rib(165, 0.05)] })
  // The spiral seam drawn as a dark line on both faces (it stops before the aperture).
  const seam: Shape[] = []
  const mid = (t: number): Vec3 => {
    const o = spiral(t)
    const inner = spiral(t - 1 / TURNS)
    return [(o.c[0] + inner.c[0]) / 2, (o.c[1] + inner.c[1]) / 2, 0]
  }
  for (let i = 0; i < 24; i++) {
    const t0 = 0.5 + (i / 24) * 0.42
    const t1 = 0.5 + ((i + 1) / 24) * 0.42
    seam.push(scaled(capsule(mid(t0), mid(t1), 0.035, [0, 0, 1]), [1, 1, 14]))
  }
  for (let i = 0; i < seam.length; i += 4) s.paint(seam[i], { color: SEAM, union: seam.slice(i + 1, i + 4) })
  // Speckles, and cracks through both faces (mask only, revealed by damage).
  const dot = (x: number, y: number) => scaled(sphere([x, y, 0], 0.09), [1, 1, 6])
  s.paint(dot(-0.9, 2.3), { color: 0xd8603a, union: [dot(0.1, 2.0), dot(-1.6, 1.4), dot(-0.1, 0.5)] })
  const seg = (a: [number, number], b: [number, number]) =>
    scaled(capsule([a[0], a[1], 0], [b[0], b[1], 0], 0.04, [0, 0, 1]), [1, 1, 10])
  s.paint(seg([-0.8, 2.4], [-0.55, 1.95]), {
    mask: CRACK,
    union: [seg([-0.55, 1.95], [-0.85, 1.55]), seg([0.2, 1.7], [0.05, 1.25]), seg([0.05, 1.25], [0.3, 0.9])]
  })
  s.paint(seg([-1.6, 1.6], [-1.3, 1.2]), { mask: CRACK, union: [seg([-1.3, 1.2], [-1.55, 0.8])] })
  return s
}

const CRAB_X = 0.42

function crabSculpt(): Sculpt {
  const s = new Sculpt()
  s.add(ellipsoid([CRAB_X, 0.55, 0], [0.44, 0.36, 0.42]), { color: CRAB })
  s.mirror((side) => {
    // Eye stalks with big bead eyes.
    s.add(capsule([CRAB_X + 0.1, 0.8, 0.15 * side], [CRAB_X + 0.2, 1.32, 0.2 * side], 0.07), { color: CRAB, k: 0.06 })
    // Walking legs splayed out to the right.
    for (const [z, x] of [
      [0.2, 0.55],
      [0.36, 0.4]
    ])
      s.add(capsule([CRAB_X + 0.25, 0.42, z * side], [CRAB_X + x + 0.45, 0.05, (z + 0.18) * side], 0.075), {
        color: CRAB_DARK,
        k: 0.04
      })
  })
  // The big claw held up as a shield (front), a smaller one at the back.
  s.add(capsule([CRAB_X + 0.3, 0.6, 0.28], [CRAB_X + 0.68, 0.88, 0.36], 0.11), { color: CRAB, k: 0.06 })
  s.add(ellipsoid([CRAB_X + 0.86, 1.18, 0.38], [0.3, 0.42, 0.2], [0, 0, -0.25]), { color: CRAB, k: 0.08 })
  s.add(scaled(cone([CRAB_X + 0.98, 1.5, 0.38], [CRAB_X + 0.96, 1.86, 0.38], 0.14, 0.05), [1, 1, 0.75]), {
    color: CRAB_DARK,
    k: 0.04
  })
  s.add(scaled(cone([CRAB_X + 0.7, 1.48, 0.38], [CRAB_X + 0.68, 1.74, 0.38], 0.1, 0.04), [1, 1, 0.75]), {
    color: CRAB_DARK,
    k: 0.03
  })
  s.add(capsule([CRAB_X + 0.3, 0.5, -0.28], [CRAB_X + 0.62, 0.4, -0.42], 0.09), { color: CRAB, k: 0.05 })
  s.add(ellipsoid([CRAB_X + 0.76, 0.42, -0.5], [0.22, 0.16, 0.16]), { color: CRAB, k: 0.06 })
  s.sub(plane([0, 0, 0], [0, 1, 0]), { k: 0.01 })
  for (const side of [1, -1]) {
    const p: Vec3 = [CRAB_X + 0.22, 1.42, 0.2 * side]
    s.add(sphere(p, 0.12), { color: INK, k: 0.03 })
    s.paint(sphere([p[0] - 0.02, p[1] + 0.05, p[2] + 0.085 * side], 0.04), {
      color: WHITE,
      union: [sphere([p[0] + 0.07, p[1] + 0.04, p[2] + 0.05 * side], 0.035)]
    })
  }
  // Belly, blush and a smile on the front.
  s.paint(ellipsoid([CRAB_X + 0.3, 0.45, 0], [0.24, 0.2, 0.36]), { color: CRAB_LIGHT })
  s.paint(sphere([CRAB_X + 0.25, 0.68, 0.36], 0.07), {
    color: 0xff9aa8,
    union: [sphere([CRAB_X + 0.25, 0.68, -0.36], 0.07)]
  })
  s.paint(ellipsoid([CRAB_X + 0.98, 1.1, 0.5], [0.12, 0.16, 0.12]), { color: CRAB_LIGHT })
  s.paint(torus([CRAB_X + 0.86, 1.18, 0.38], 0.36, 0.025, [Math.PI / 2, 0, 0]), { color: WHITE, mask: GLOW })
  return s
}

export function hermitRecipe(): PropRecipe {
  return {
    parts: [
      { name: 'shell', sculpt: shellSculpt(), cell: 0.058, tris: 3800 },
      { name: 'crab', sculpt: crabSculpt(), cell: 0.05, tris: 2600, pivot: [CRAB_X, 0.2, 0] }
    ],
    look: { glowColor: 0xffa070, glow: 1.4, glow2Color: 0xff9a3c, outline: 0.012 },
    animate(c) {
      const t = c.t
      const end = expiry(c.life, t, 4, 0.6)
      const rise = popIn(t, 0.55)
      c.body.scale.set(1, Math.max(1e-3, rise * end.scale), 1)
      // The crab shifts its weight and looks around behind its claw.
      const crab = c.parts.crab
      crab.position.x = CRAB_X + 0.04 * Math.sin(t * 0.9)
      crab.position.y = 0.2 + 0.02 * Math.abs(Math.sin(t * 1.8))
      crab.rotation.y = 0.1 * Math.sin(t * 0.55)
      crab.rotation.z = 0.04 * Math.sin(t * 1.7)
      // Damage: cracks darken and leak anima; also in the last 4 s.
      const lifeCrack = c.life === undefined ? 0 : clamp01((4 - c.life) / 4)
      const crack = Math.max(1 - c.health, lifeCrack)
      const dark = 1 - Math.min(1, crack * 1.6) * 0.78
      c.u.uArmorTint.value.setRGB(dark, dark * 0.95, dark * 0.95)
      c.u.uGlow2.value = crack > 0.02 ? (0.6 + 1.6 * crack) * (0.75 + 0.25 * Math.sin(t * 9)) : 0
      c.u.uGlow.value = 1.3 + 0.3 * Math.sin(t * 2) + end.blink * 1.5
      c.u.uFlash.value = end.blink * 0.5
    }
  }
}

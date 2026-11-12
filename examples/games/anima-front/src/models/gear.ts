/**
 * Visible passive gear on the animals (turtle shell, hedgehog quills, momonga pack + membranes, jelly charm) and
 * the クロヅメ scarf. Gear is sculpted once at a reference body height (1.2 m) and scaled per species. Local
 * frame of back gear: +Z points away from the back (outwards), +Y up, origin on the back surface.
 */
import type { ItemId } from '../data/items'
import type { Quality } from './api'
import type { BodyPlan } from './rig'
import { bakeModel, type BakedModel } from './sdf/geometry'
import { runSync } from './sdf/mesher'
import {
  arc,
  box,
  capsule,
  cone,
  ellipsoid,
  plane,
  scaled,
  Sculpt,
  shell,
  slab,
  sphere,
  torus,
  type Mask,
  type Shape,
  type Vec3
} from './sdf/sculpt'

export type GearId = 'turtle' | 'hedgehog' | 'momonga' | 'jelly' | 'membrane'
export const GEAR_ITEMS: readonly ItemId[] = ['turtle', 'hedgehog', 'momonga', 'jelly']

const TRIM: Mask = [1, 0, 0, 0]
const GLOW: Mask = [0, 1, 0, 0]

/** Shell footprint (gear frame, metres at the 1.2 m reference): centre height, half extents, dome height. */
const SHELL = { y: -0.02, rx: 0.172, ry: 0.192, h: 0.15 }
/** Half width of the grooves between scutes (wide enough to read from the gameplay camera). */
const GROOVE_W = 0.0052

/**
 * Shell markings are laid out in footprint coordinates (u across, v up; ±1 at the dome's rim) and drawn straight
 * through the shell along Z, the gear's outward axis (the shader allows ≤ 4 shapes per marking).
 */
const fp = (u: number, v: number, z = 0.06): Vec3 => [u * SHELL.rx, SHELL.y + v * SHELL.ry, z]
const column = (u: number, v: number, r: number, sx = 1): Shape => scaled(sphere(fp(u, v), r), [sx, 1, 40])
const footprint = (k: number): Shape => ellipsoid(fp(0, 0), [SHELL.rx * k, SHELL.ry * k, 1])
/** An elliptic ring band around the footprint (normalised radius k, half width w in metres). */
const band = (k: number, w: number): Shape =>
  scaled(torus(fp(0, 0), SHELL.rx * k, w, [Math.PI / 2, 0, 0]), [1, 40, SHELL.ry / SHELL.rx])

function turtle(): Sculpt {
  const s = new Sculpt()
  const { y: cy, rx, ry, h } = SHELL
  const MARGIN = 0x8aa64f
  const COSTAL = 0xa6c464
  const VERT = 0xb2cf6c
  const PALE = 0xd3e7a0
  const GROOVE = 0x3b5126
  const g = GROOVE_W
  // A tall dome whose underside hugs the round back, with a flared marginal rim that overhangs a little.
  s.add(ellipsoid([0, cy, -0.02], [rx * 0.97, ry * 0.97, h + 0.02]), { color: MARGIN })
  s.add(scaled(torus([0, cy, 0.004], rx * 1.0, 0.028, [Math.PI / 2, 0, 0]), [1, 0.6, ry / rx]), {
    color: MARGIN,
    k: 0.022
  })
  s.sub(ellipsoid([0, cy, -0.25], [0.29, 0.6, 0.25]), { k: 0.012 })
  // Raised scutes: a keel of vertebral humps down the middle and softer costal plates on the flanks.
  const at = (u: number, v: number, lift: number): Vec3 => {
    const r2 = Math.min(u * u + v * v, 0.98)
    return [u * rx, cy + v * ry, -0.02 + (h + 0.02) * Math.sqrt(1 - r2) + lift]
  }
  for (const v of [0.53, 0, -0.53])
    s.emboss(scaled(sphere(at(0, v, -0.012), 0.052), [1, 1.15, 0.7]), { amount: 0.012, soft: 0.014 })
  for (const side of [1, -1])
    for (const v of [0.66, 0.265, -0.265, -0.66])
      s.emboss(scaled(sphere(at(0.5 * side, v, -0.01), 0.045), [1, 1.05, 0.7]), { amount: 0.006, soft: 0.012 })
  // Groove colour under the whole scute field; costal rows painted over it leave the seams between them.
  s.paint(footprint(0.85), { color: GROOVE })
  const gv = g / ry
  const rows: [number, number][] = [
    [0.53 + gv, 1],
    [gv, 0.53 - gv],
    [-0.53 + gv, -gv],
    [-1, -0.53 - gv]
  ]
  const rowBox = ([a, b]: [number, number]): Shape => box(fp(0, (a + b) / 2), [rx, ((b - a) / 2) * ry, 0.5])
  s.paint(rowBox(rows[0]), { color: COSTAL, union: rows.slice(1).map(rowBox), within: footprint(0.85 - g / rx) })
  // Pale growth centres of the costal scutes.
  const costalC: Shape[] = []
  for (const side of [1, -1])
    for (const [u, v] of [
      [0.46, 0.66],
      [0.55, 0.265],
      [0.55, -0.265],
      [0.46, -0.66]
    ])
      costalC.push(column(u * side, v, 0.021, 1.25))
  s.paint(costalC[0], { color: PALE, union: costalC.slice(1, 4), soft: 0.004 })
  s.paint(costalC[4], { color: PALE, union: costalC.slice(5), soft: 0.004 })
  // Hexagonal vertebral scutes: each is a rhombus (two crossed slabs) whose overlap with its neighbours is cut
  // by the horizontal seams; a groove-coloured outline first, then the inset plate.
  const a = 0.3 * rx,
    b = 0.72 * ry
  const nl = Math.hypot(1 / a, 1 / b)
  const n1: Vec3 = [1 / a / nl, 1 / b / nl, 0],
    n2: Vec3 = [1 / a / nl, -1 / b / nl, 0]
  const w = 1 / nl
  for (const [inset, color] of [
    [-g, GROOVE],
    [g, VERT]
  ] as const)
    for (const v of [0.53, 0, -0.53])
      s.paint(slab(fp(0, v), n1, w - inset), { color, within: slab(fp(0, v), n2, w - inset) })
  s.paint(scaled(capsule(fp(-0.2, 0.265), fp(0.2, 0.265), g), [1, 1, 40]), {
    color: GROOVE,
    union: [scaled(capsule(fp(-0.2, -0.265), fp(0.2, -0.265), g), [1, 1, 40])]
  })
  s.paint(column(0, 0.56, 0.02, 1.35), {
    color: PALE,
    union: [column(0, -0.56, 0.02, 1.35)],
    soft: 0.004
  })
  s.paint(column(0, 0, 0.017, 1.35), { color: 0xeaffb8, mask: GLOW, soft: 0.004 })
  // Marginal scutes on the rim, notched by radial grooves, with a team-trim lip on the outer edge.
  const rim = band(1.03, 0.032)
  s.paint(rim, { color: MARGIN })
  const notches: Shape[] = []
  for (let i = 0; i < 8; i++) {
    const t = ((i + 0.5) / 16) * Math.PI * 2
    const d = [Math.cos(t) * rx, Math.sin(t) * ry]
    const l = Math.hypot(d[0], d[1])
    notches.push(slab(fp(0, 0), [-d[1] / l, d[0] / l, 0], g * 0.85))
  }
  s.paint(notches[0], { color: GROOVE, union: notches.slice(1, 4), within: rim })
  s.paint(notches[4], { color: GROOVE, union: notches.slice(5), within: rim })
  s.paint(band(1.12, 0.013), { color: 0xffffff, mask: TRIM })
  return s
}

function hedgehog(): Sculpt {
  const s = new Sculpt()
  // A soft pad with ten big quills fanning up and out, cream tips.
  s.add(ellipsoid([0, 0, 0.0], [0.12, 0.13, 0.05]), { color: 0x8a6b58 })
  // Keep the outer half of the pad (the gear frame +Z points away from the back).
  s.sub(plane([0, 0, 0.004], [0, 0, 1]), { k: 0.008 })
  const quills: [number, number][] = [
    [0, 0.07],
    [-0.06, 0.05],
    [0.06, 0.05],
    [-0.085, -0.01],
    [0.085, -0.01],
    [-0.03, 0.0],
    [0.03, 0.0],
    [-0.055, -0.06],
    [0.055, -0.06],
    [0, -0.065]
  ]
  for (const [x, y] of quills) {
    const tip: [number, number, number] = [x * 1.6, y * 1.25 + 0.06, 0.13]
    s.add(cone([x, y, 0.03], tip, 0.03, 0.006), { color: 0x9a7a64, k: 0.012 })
    s.paint(sphere(tip, 0.04), { color: 0xf3e6d6 })
  }
  s.paint(sphere([0, 0, 0.05], 0.035), { color: 0xd8c0ae, mask: GLOW })
  return s
}

function momonga(): Sculpt {
  const s = new Sculpt()
  // A plump pouch with a sleeping flying squirrel curled on top, its fluffy tail wrapped round the pouch.
  s.add(ellipsoid([0, -0.03, 0.045], [0.085, 0.085, 0.05]), { color: 0x9c84b0 })
  s.add(ellipsoid([0, 0.06, 0.06], [0.06, 0.045, 0.045]), { color: 0xc4aed6, k: 0.025 })
  for (const side of [1, -1]) {
    s.add(scaled(sphere([0.042 * side, 0.1, 0.055], 0.022), [1, 1.1, 0.5]), { color: 0xc4aed6, k: 0.01 })
    s.paint(scaled(sphere([0.042 * side, 0.1, 0.07], 0.012), [1, 1.1, 0.6]), { color: 0xffc4dc })
    s.paint(arc([0.02 * side, 0.068, 0.103], 0.008, 0.0022, 1.0, [-Math.PI / 2, 0, 0]), { color: 0x3a2a40 })
  }
  s.paint(ellipsoid([0, 0.045, 0.1], [0.032, 0.022, 0.012]), { color: 0xf3e9f7 })
  s.paint(sphere([0, 0.06, 0.106], 0.005), { color: 0xff8fb5 })
  s.add(capsule([0.07, -0.08, 0.06], [0.085, 0.02, 0.06], 0.026), { color: 0xc4aed6, k: 0.02 })
  s.paint(torus([0, -0.03, 0.045], 0.084, 0.005, [Math.PI / 2, 0, 0]), { color: 0xffffff, mask: GLOW })
  return s
}

function membrane(): Sculpt {
  // A soft gliding sail in its own frame: its length runs along +X (the arm) and its width down −Y (to the
  // flank); thin in Z. The character turns it to the arm and scales it open while gliding.
  const s = new Sculpt()
  s.add(scaled(cone([0.0, -0.06, 0], [0.26, -0.03, 0], 0.11, 0.045), [1, 1, 0.16]), { color: 0xc9a8d8 })
  s.sub(sphere([0.17, -0.22, 0], 0.1), { k: 0.03 })
  s.paint(scaled(cone([0.0, -0.06, 0], [0.26, -0.03, 0], 0.11, 0.04), [0.9, 0.82, 1]), { color: 0xe6d3ee })
  s.paint(slab([0, -0.02, 0], [0, 1, 0], 0.004), { color: 0xffffff, mask: GLOW })
  return s
}

function jelly(): Sculpt {
  const s = new Sculpt()
  s.add(capsule([0, 0.055, 0], [0, 0.03, 0], 0.006), { color: 0xd8c0ae })
  s.add(scaled(sphere([0, 0, 0], 0.035), [1, 0.8, 1]), { color: 0xf7a6c6, mask: GLOW, k: 0.008 })
  s.sub(plane([0, -0.006, 0], [0, 1, 0]), { k: 0.004 })
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4
    const x = Math.cos(a) * 0.016,
      z = Math.sin(a) * 0.016
    s.add(capsule([x, -0.004, z], [x * 1.3, -0.045 + (i % 2) * 0.008, z * 1.3], 0.005), {
      color: 0xffc9dd,
      mask: GLOW,
      k: 0.006
    })
  }
  s.paint(sphere([0.012, 0.012, 0.025], 0.008), { color: 0xffffff, soft: 0.004 })
  return s
}

const GEAR: Record<GearId, () => Sculpt> = { turtle, hedgehog, momonga, jelly, membrane }

/** The gear sculpt itself (the catalogue antique of the glider pack reuses it). */
export const gearSculpt = (id: GearId): Sculpt => GEAR[id]()

const GEAR_TRIS: Record<GearId, number> = { turtle: 680, hedgehog: 600, momonga: 420, jelly: 180, membrane: 110 }

export function gearModel(id: GearId, quality: Quality): BakedModel {
  const cell = (quality === 'low' ? 0.009 : quality === 'medium' ? 0.0065 : 0.0045) * (id === 'membrane' ? 0.7 : 1)
  const scale = quality === 'low' ? 0.6 : quality === 'medium' ? 1 : 1.8
  return runSync(
    bakeModel(GEAR[id](), { cell, maxTris: Math.round(GEAR_TRIS[id] * scale), ao: { reach: 0.03, min: 0.6 } })
  )
}

/** The クロヅメ scarf: a band around the neck with a hanging flap on the back marked by three claw slashes. */
export function scarfModel(plan: BodyPlan, quality: Quality): BakedModel {
  const H = plan.H
  const RED = 0xc8343a
  const s = new Sculpt()
  const y = 0.6 * H
  const R = 0.135 * H
  s.add(scaled(torus([0, y, -0.005 * H], R, 0.04 * H), [1, 0.75, 1.05]), { color: RED })
  s.add(scaled(sphere([0.07 * H, y - 0.01 * H, -0.13 * H], 0.045 * H), [1, 0.8, 0.7]), { color: 0xb02a30, k: 0.02 * H })
  s.add(
    scaled(
      cone([0.06 * H, y - 0.02 * H, -0.15 * H], [0.11 * H, y - 0.16 * H, -0.17 * H], 0.05 * H, 0.04 * H),
      [1, 1, 0.3]
    ),
    {
      color: RED,
      k: 0.02 * H
    }
  )
  for (let i = 0; i < 3; i++) {
    const ox = (i - 1) * 0.022 * H
    s.paint(capsule([0.07 * H + ox, y - 0.06 * H, -0.2 * H], [0.1 * H + ox, y - 0.13 * H, -0.2 * H], 0.006 * H), {
      color: 0x2a1418,
      soft: 0.003 * H
    })
  }
  const cell = H / (quality === 'low' ? 60 : quality === 'medium' ? 90 : 120)
  return runSync(bakeModel(s, { cell, maxTris: quality === 'low' ? 500 : 900, ao: { reach: 0.03 * H, min: 0.6 } }))
}

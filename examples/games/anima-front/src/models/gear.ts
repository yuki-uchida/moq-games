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
import { arc, capsule, cone, ellipsoid, plane, scaled, Sculpt, slab, sphere, torus, type Mask } from './sdf/sculpt'

export type GearId = 'turtle' | 'hedgehog' | 'momonga' | 'jelly' | 'membrane'
export const GEAR_ITEMS: readonly ItemId[] = ['turtle', 'hedgehog', 'momonga', 'jelly']

const TRIM: Mask = [1, 0, 0, 0]
const GLOW: Mask = [0, 1, 0, 0]

function turtle(): Sculpt {
  const s = new Sculpt()
  // A domed shell (flat side against the back) with raised scutes, glowing seams and a team-trim rim.
  s.add(ellipsoid([0, 0, 0.0], [0.165, 0.18, 0.11]), { color: 0x4f9f4c })
  s.sub(plane([0, 0, 0.004], [0, 0, -1]), { k: 0.01 })
  const plates: [number, number][] = [
    [0, 0.0],
    [0, 0.1],
    [0, -0.1],
    [0.088, 0.05],
    [-0.088, 0.05],
    [0.088, -0.05],
    [-0.088, -0.05]
  ]
  for (const [x, y] of plates) {
    s.emboss(scaled(sphere([x, y, 0.1], 0.046), [1, 1, 2.2]), { amount: 0.008, soft: 0.006 })
    s.paint(scaled(sphere([x, y, 0.1], 0.04), [1, 1, 2.4]), { color: 0x86cf62 })
  }
  s.paint(scaled(sphere([0, 0, 0.12], 0.025), [1, 1, 2]), { color: 0xc8f59a, mask: GLOW })
  s.add(scaled(torus([0, 0, 0.012], 0.16, 0.02, [Math.PI / 2, 0, 0]), [1, 1.1, 1]), { color: 0xffffff, k: 0.012 })
  s.paint(scaled(torus([0, 0, 0.012], 0.16, 0.024, [Math.PI / 2, 0, 0]), [1, 1.1, 1]), { color: 0xffffff, mask: TRIM })
  return s
}

function hedgehog(): Sculpt {
  const s = new Sculpt()
  // A soft pad with ten big quills fanning up and out, cream tips.
  s.add(ellipsoid([0, 0, 0.0], [0.12, 0.13, 0.05]), { color: 0x8a6b58 })
  s.sub(plane([0, 0, 0.004], [0, 0, -1]), { k: 0.008 })
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

const GEAR_TRIS: Record<GearId, number> = { turtle: 520, hedgehog: 600, momonga: 420, jelly: 180, membrane: 110 }

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

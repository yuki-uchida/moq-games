/**
 * The antique cart (護送任務): a chunky red toy wagon with cream trim carrying a roped crate that glows from the
 * antique inside (light leaks through the plank gaps and a porthole), a tow bar with a little lantern and an
 * ARK pennant. Wheels turn with the path progress (`state` 0..1, ≈ 120 m of travel) and the crate jiggles
 * while it moves.
 */
import { box, capsule, cone, cylinder, ellipsoid, plane, scaled, Sculpt, sphere, torus } from '../sdf/sculpt'
import { ANIMA, ARK_CREAM, ARK_RED, GLOW, GLOW2, INK, pawEmblem, type PropRecipe, WHITE } from './kit'

const WOOD = 0xb07a4a
const WOOD_DARK = 0x7a5034
const BRASS = 0xd1a052
const ROPE = 0xd8bf8a

export const CART_TRAVEL = 120
const WHEEL_R = 0.42
const AXLE_Z = 0.78
const WHEEL_X = 0.84

function bodySculpt(): Sculpt {
  const s = new Sculpt()
  // Bed with low side boards.
  s.add(box([0, 0.72, 0], [0.74, 0.1, 1.18], 0.05), { color: ARK_RED })
  s.mirror((side) => s.add(box([0.7 * side, 0.92, 0], [0.06, 0.2, 1.18], 0.04), { color: ARK_RED, k: 0.02 }))
  for (const z of [1.14, -1.14]) s.add(box([0, 0.92, z], [0.74, 0.2, 0.06], 0.04), { color: ARK_RED, k: 0.02 })
  // Axle blocks and axles.
  for (const z of [AXLE_Z, -AXLE_Z]) {
    s.add(box([0, 0.55, z], [0.6, 0.08, 0.1], 0.03), { color: WOOD_DARK, k: 0.03 })
    s.add(capsule([-0.86, WHEEL_R, z], [0.86, WHEEL_R, z], 0.05), { color: INK, k: 0.02 })
  }
  // The crate: planks with gaps, brass corners, a porthole on the top.
  s.add(box([0, 1.32, -0.08], [0.56, 0.42, 0.62], 0.05), { color: WOOD, k: 0.02 })
  for (const x of [-0.56, 0.56])
    for (const z of [-0.7, 0.54]) s.add(box([x, 1.32, z], [0.06, 0.44, 0.06], 0.03), { color: BRASS, k: 0.015 })
  s.add(torus([0, 1.75, -0.08], 0.2, 0.05), { color: BRASS, k: 0.02 })
  s.add(scaled(sphere([0, 1.73, -0.08], 0.17), [1, 0.45, 1]), { color: 0xffd8a0, k: 0.02 })
  // Ropes over the crate.
  for (const z of [0.25, -0.42]) {
    s.add(capsule([0.6, 0.95, z], [0.6, 1.76, z], 0.045), { color: ROPE, k: 0.02 })
    s.add(capsule([0.6, 1.76, z], [-0.6, 1.76, z], 0.045), { color: ROPE, k: 0.02 })
    s.add(capsule([-0.6, 1.76, z], [-0.6, 0.95, z], 0.045), { color: ROPE, k: 0.02 })
  }
  // Tow bar, handle and a little lantern.
  s.add(capsule([0, 0.62, 1.15], [0, 0.48, 1.85], 0.05), { color: WOOD_DARK, k: 0.03 })
  s.add(capsule([-0.3, 0.48, 1.9], [0.3, 0.48, 1.9], 0.05), { color: WOOD_DARK, k: 0.03 })
  s.add(capsule([0.62, 1.12, 1.1], [0.62, 1.55, 1.1], 0.045), { color: INK, k: 0.015 })
  s.add(ellipsoid([0.62, 1.48, 1.1], [0.09, 0.11, 0.09]), { color: ARK_CREAM, k: 0.02 })
  // Pennant pole at the back corner.
  s.add(capsule([-0.62, 1.1, -1.12], [-0.62, 2.2, -1.12], 0.05), { color: WOOD_DARK, k: 0.02 })
  s.add(sphere([-0.62, 2.23, -1.12], 0.05), { color: BRASS, k: 0.01 })
  s.sub(plane([0, 0, 0], [0, 1, 0]), { k: 0.01 })
  // Trim, the ARK paw on the sides and front, glowing crate.
  s.mirror((side) => s.paint(box([0.76 * side, 1.08, 0], [0.04, 0.04, 1.2], 0), { color: ARK_CREAM }))
  for (const z of [1.2, -1.2]) s.paint(box([0, 1.08, z], [0.76, 0.04, 0.04], 0), { color: ARK_CREAM })
  pawEmblem(s, [0, 0.9, 1.2], 0.3, ARK_CREAM, undefined, 0.05)
  s.mirror((side) => pawEmblem(s, [0.76 * side, 0.9, 0.55], 0.28, ARK_CREAM, undefined, 0.05, 'x'))
  s.mirror((side) => pawEmblem(s, [0.58 * side, 1.35, -0.08], 0.42, ANIMA, GLOW2, 0.04, 'x'))
  pawEmblem(s, [0, 1.35, 0.54], 0.42, ANIMA, GLOW2, 0.04)
  for (const y of [1.08, 1.36, 1.62])
    s.paint(box([0, y, -0.08], [0.64, 0.03, 0.7], 0), { color: 0xffd27a, mask: GLOW2 })
  s.paint(scaled(sphere([0, 1.76, -0.08], 0.17), [1, 0.6, 1]), { color: 0xfff0c0, mask: GLOW2 })
  s.paint(ellipsoid([0.62, 1.48, 1.1], [0.1, 0.07, 0.1]), { color: WHITE, mask: GLOW })
  return s
}

function wheelsSculpt(z: number): Sculpt {
  const s = new Sculpt()
  s.mirror((side) => {
    const x = WHEEL_X * side
    s.add(scaled(torus([x, WHEEL_R, z], WHEEL_R - 0.065, 0.065, [0, 0, Math.PI / 2]), [1, 1.25, 1]), {
      color: ARK_CREAM
    })
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2
      s.add(capsule([x, WHEEL_R, z], [x, WHEEL_R + Math.cos(a) * 0.34, z + Math.sin(a) * 0.34], 0.055), {
        color: ARK_RED,
        k: 0.02
      })
    }
    s.add(sphere([x + 0.05 * side, WHEEL_R, z], 0.09), { color: BRASS, k: 0.02 })
    s.paint(torus([x, WHEEL_R, z], WHEEL_R, 0.05, [0, 0, Math.PI / 2]), { color: 0x6a4a3a })
  })
  return s
}

function pennantSculpt(): Sculpt {
  const s = new Sculpt()
  s.add(scaled(cone([-0.6, 2.12, -1.12], [-0.6, 2.0, -1.62], 0.13, 0.035, [1, 0, 0]), [1, 1, 0.2]), { color: ANIMA })
  s.paint(sphere([-0.6, 2.1, -1.3], 0.05), { color: WHITE, union: [sphere([-0.6, 2.16, -1.38], 0.022)] })
  return s
}

export function cartRecipe(): PropRecipe {
  return {
    parts: [
      { name: 'cart', sculpt: bodySculpt(), cell: 0.06, tris: 6000 },
      { name: 'wheelsF', sculpt: wheelsSculpt(AXLE_Z), cell: 0.044, tris: 1500, pivot: [0, WHEEL_R, AXLE_Z] },
      { name: 'wheelsR', sculpt: wheelsSculpt(-AXLE_Z), cell: 0.044, tris: 1500, pivot: [0, WHEEL_R, -AXLE_Z] },
      { name: 'pennant', sculpt: pennantSculpt(), cell: 0.035, tris: 300, pivot: [-0.62, 2.1, -1.12] }
    ],
    look: { glowColor: 0xffc070, glow: 1.4, glow2Color: 0xffa040, glow2: 1.6, outline: 0.011 },
    animate(c) {
      const time = c.clock
      const dist = Math.max(0, c.state) * CART_TRAVEL
      const roll = dist / WHEEL_R
      c.parts.wheelsF.rotation.x = roll
      c.parts.wheelsR.rotation.x = roll
      // Speed from the progress change (smoothed): drives the crate jiggle and the pennant.
      const prev = c.mem.prev ?? dist
      const v = c.dt > 0 ? Math.min(10, Math.abs(dist - prev) / c.dt) : 0
      c.mem.prev = dist
      c.mem.speed = (c.mem.speed ?? 0) + (v - (c.mem.speed ?? 0)) * Math.min(1, c.dt * 4)
      const moving = Math.min(1, (c.mem.speed ?? 0) / 2)
      c.parts.cart.position.y = moving * 0.015 * Math.abs(Math.sin(dist * 3.1))
      c.parts.cart.rotation.z = moving * 0.012 * Math.sin(dist * 2.3)
      c.parts.pennant.rotation.x = 0
      c.parts.pennant.rotation.y = 0.25 * Math.sin(time * 2.2) - moving * 0.25
      c.u.uGlow2.value = 1.5 + 0.4 * Math.sin(time * 2.4)
    }
  }
}

/**
 * The anima lighthouse (防衛任務, ≈ 8 m): a cream-and-red striped tower the animals raised on an old concrete
 * plinth, ringed with sandbags, ivy climbing it, lit portholes, the ARK paw plaque, a wooden gallery with paper
 * lanterns, a cat-eared roof with a paw pennant, and a big anima crystal in the lantern room whose two lenses
 * sweep warm beams around. setHealth(f) opens glowing cracks and makes the lantern flicker when low.
 */
import * as THREE from 'three'
import {
  alongRows,
  box,
  capsule,
  cone,
  cylinder,
  ellipsoid,
  plane,
  scaled,
  Sculpt,
  sphere,
  torus,
  type Vec3
} from '../sdf/sculpt'
import { ANIMA, ARK_CREAM, ARK_RED, clamp01, CRACK, GLOW, INK, pawEmblem, type PropRecipe, WHITE } from './kit'

const CONCRETE = 0xb9b3a8
const CONCRETE_DARK = 0x958e84
const BURLAP = 0xcdb184
const WOOD = 0x9a6a44
const WOOD_DARK = 0x6e4a32
const IVY = 0x5f9a3a
const ROOF = 0xd8564a

const SHAFT_BOTTOM = 0.7
const SHAFT_TOP = 5.3
const R_BOTTOM = 1.0
const R_TOP = 0.7
const LAMP_Y = 6.2
const shaftR = (y: number) => R_BOTTOM + ((y - SHAFT_BOTTOM) / (SHAFT_TOP - SHAFT_BOTTOM)) * (R_TOP - R_BOTTOM)

/** Concrete plinth, sandbag ring, door and the striped shaft with portholes, ivy and the paw plaque. */
function bodySculpt(): Sculpt {
  const s = new Sculpt()
  s.add(cylinder([0, 0.36, 0], 1.3, 0.36, 0.08), { color: CONCRETE })
  for (let layer = 0; layer < 2; layer++) {
    const n = 9 - layer
    const r = 1.64 - layer * 0.12
    for (let i = 0; i < n; i++) {
      const a = ((i + layer * 0.5) / n) * Math.PI * 2 + 0.35
      // Leave a gap in front of the door.
      if (Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.42) continue
      s.add(
        ellipsoid([Math.cos(a) * r, 0.17 + layer * 0.3, Math.sin(a) * r], [0.5, 0.18, 0.27], [0, -a + Math.PI / 2, 0]),
        { color: BURLAP, k: 0.05 }
      )
    }
  }
  s.add(cone([0, SHAFT_BOTTOM - 0.2, 0], [0, SHAFT_TOP + 0.05, 0], R_BOTTOM + 0.02, R_TOP), {
    color: ARK_CREAM,
    k: 0.08
  })
  for (const y of [1.6, 4.6]) s.add(torus([0, y, 0], shaftR(y) + 0.01, 0.09), { color: WOOD, k: 0.03 })
  // Door (front, +Z) with a frame.
  s.sub(box([0, 0.98, 1.05], [0.36, 0.52, 0.3], 0.14), { k: 0.05, color: WOOD_DARK })
  s.add(box([0, 0.98, 0.94], [0.3, 0.46, 0.07], 0.1), { color: WOOD, k: 0.02 })
  s.add(sphere([0.18, 0.95, 1.02], 0.06), { color: 0xffc861, k: 0.01 })
  const ports: Vec3[] = [
    [0, 2.35, 1],
    [0.7, 3.9, 0.55],
    [-0.62, 4.4, -0.5],
    [-0.8, 2.9, 0.4]
  ]
  const portCentres: Vec3[] = []
  for (const [x, y, z] of ports) {
    const r = shaftR(y)
    const l = Math.hypot(x, z)
    const p: Vec3 = [(x / l) * r, y, (z / l) * r]
    portCentres.push(p)
    s.add(torus(p, 0.2, 0.075, alongRows([x / l, 0, z / l])), { color: WOOD_DARK, k: 0.02 })
    s.sub(sphere([p[0] * 1.04, y, p[2] * 1.04], 0.16), { k: 0.02, color: 0xffd27a })
  }
  // The ARK paw plaque on the front.
  const plaque: Vec3 = [0, 3.25, shaftR(3.25) + 0.02]
  s.add(cylinder(plaque, 0.46, 0.09, 0.05, [Math.PI / 2 - 0.07, 0, 0]), { color: WOOD, k: 0.04 })
  s.sub(plane([0, 0, 0], [0, 1, 0]), { k: 0.02 })

  // Stripes, stitching, ivy, lit portholes, the plaque.
  s.paint(cylinder([0, 0.95, 0], 1.2, 0.25, 0), {
    color: ARK_RED,
    within: cone([0, 0.5, 0], [0, 5.3, 0], 1.08, 0.78),
    union: [cylinder([0, 2.35, 0], 1.2, 0.35, 0), cylinder([0, 4.02, 0], 1.2, 0.28, 0)]
  })
  s.paint(box([0, 0.98, 0.98], [0.33, 0.49, 0.14], 0.1), { color: WOOD })
  s.paint(cylinder([0, 0.36, 0], 1.33, 0.05, 0), { color: CONCRETE_DARK })
  for (let layer = 0; layer < 2; layer++)
    s.paint(torus([0, 0.17 + layer * 0.3, 0], 1.64 - layer * 0.12, 0.035), { color: 0xa88a5c })
  s.paint(sphere([0.75, 1.9, 0.5], 0.28), {
    color: IVY,
    union: [sphere([0.62, 2.5, 0.62], 0.22), sphere([-0.8, 1.8, -0.4], 0.3), sphere([-0.55, 2.45, -0.62], 0.24)]
  })
  s.paint(sphere([1.2, 0.5, -0.5], 0.32), {
    color: IVY,
    union: [sphere([-0.3, 0.55, -1.25], 0.35), sphere([-1.1, 0.6, 0.5], 0.25), sphere([-0.4, 3.05, -0.72], 0.17)]
  })
  s.paint(sphere(portCentres[0], 0.14), {
    color: 0xffd27a,
    mask: GLOW,
    union: portCentres.slice(1).map((p) => sphere(p, 0.14))
  })
  pawEmblem(s, [0, 3.25, plaque[2] + 0.09], 0.64, ANIMA, GLOW, 0.06)
  s.paint(torus([plaque[0], plaque[1], plaque[2] + 0.09], 0.41, 0.03, [Math.PI / 2, 0, 0]), { color: 0xffc861 })
  // Cracks (mask only), shown by damage.
  const cracks: [Vec3, Vec3][] = [
    [
      [0.3, 1.7, 0.9],
      [0.5, 2.1, 0.82]
    ],
    [
      [0.5, 2.1, 0.82],
      [0.3, 2.7, 0.82]
    ],
    [
      [-0.5, 3.4, 0.62],
      [-0.75, 4.1, 0.3]
    ],
    [
      [0.8, 2.8, -0.4],
      [0.6, 3.6, -0.55]
    ],
    [
      [-0.85, 1.7, -0.3],
      [-0.7, 2.4, -0.55]
    ],
    [
      [1.25, 0.45, 0.25],
      [1.0, 0.7, 0.75]
    ]
  ]
  s.paint(capsule(cracks[0][0], cracks[0][1], 0.05), {
    mask: CRACK,
    union: cracks.slice(1, 4).map(([a, b]) => capsule(a, b, 0.05))
  })
  s.paint(capsule(cracks[4][0], cracks[4][1], 0.05), {
    mask: CRACK,
    union: [capsule(cracks[5][0], cracks[5][1], 0.05)]
  })
  return s
}

/** Gallery with posts and paper lanterns, the lantern room posts, the cat-eared roof and the pennant pole. */
function topSculpt(): Sculpt {
  const s = new Sculpt()
  s.add(cylinder([0, SHAFT_TOP + 0.08, 0], 1.2, 0.1, 0.05), { color: WOOD })
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8
    const x = Math.cos(a) * 1.1
    const z = Math.sin(a) * 1.1
    s.add(capsule([x, SHAFT_TOP + 0.15, z], [x, SHAFT_TOP + 0.62, z], 0.075), { color: WOOD_DARK, k: 0.02 })
  }
  s.add(torus([0, SHAFT_TOP + 0.64, 0], 1.1, 0.085), { color: WOOD, k: 0.03 })
  s.add(cylinder([0, SHAFT_TOP + 0.24, 0], 0.66, 0.08, 0.04), { color: ARK_RED, k: 0.05 })
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6
    const x = Math.cos(a) * 0.62
    const z = Math.sin(a) * 0.62
    s.add(capsule([x, SHAFT_TOP + 0.3, z], [x, 6.95, z], 0.08), { color: INK, k: 0.02 })
  }
  s.add(cylinder([0, 6.98, 0], 0.8, 0.08, 0.04), { color: ARK_RED, k: 0.03 })
  s.add(cone([0, 7.0, 0], [0, 7.75, 0], 0.74, 0.12), { color: ROOF, k: 0.06 })
  s.mirror((side) =>
    s.add(scaled(cone([0.36 * side, 7.25, 0.05], [0.47 * side, 7.74, 0.02], 0.22, 0.05, [0, 0, 1]), [1, 1, 0.5]), {
      color: ROOF,
      k: 0.06
    })
  )
  s.add(sphere([0, 7.86, 0], 0.14), { color: 0xffc861, k: 0.04 })
  s.add(capsule([0, 7.9, 0], [0, 8.55, 0], 0.05), { color: WOOD_DARK, k: 0.02 })
  // Paper lanterns under the gallery.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.6
    const c: Vec3 = [Math.cos(a) * 1.26, SHAFT_TOP - 0.3, Math.sin(a) * 1.26]
    s.add(ellipsoid(c, [0.15, 0.19, 0.15]), { color: i % 2 ? 0xfff1d6 : 0xff8a6a })
    s.add(capsule([c[0], c[1] + 0.12, c[2]], [c[0] * 0.95, SHAFT_TOP, c[2] * 0.95], 0.045), { color: INK, k: 0.02 })
  }
  const lanterns = [0, 1, 2, 3, 4].map((i) => {
    const a = (i / 5) * Math.PI * 2 + 0.6
    return ellipsoid([Math.cos(a) * 1.26, SHAFT_TOP - 0.32, Math.sin(a) * 1.26], [0.17, 0.13, 0.17])
  })
  s.paint(lanterns[0], { color: WHITE, mask: GLOW, union: lanterns.slice(1, 4) })
  s.paint(lanterns[4], { color: WHITE, mask: GLOW })
  s.paint(torus([0, SHAFT_TOP + 0.64, 0], 1.1, 0.04), { color: 0xffc861 })
  return s
}

/** The anima crystal on its stand and the rotating ring with two lenses (one glowing set). */
function lampSculpt(): Sculpt {
  const s = new Sculpt()
  s.add(cylinder([0, SHAFT_TOP + 0.36, 0], 0.34, 0.07, 0.03), { color: INK })
  s.add(cone([0, LAMP_Y - 0.5, 0], [0, LAMP_Y + 0.1, 0], 0.1, 0.32), { color: 0xffb060, k: 0.03 })
  s.add(cone([0, LAMP_Y + 0.1, 0], [0, LAMP_Y + 0.6, 0], 0.32, 0.05), { color: 0xffb060, k: 0.03 })
  s.add(torus([0, LAMP_Y, 0], 0.48, 0.08), { color: 0xd1a052 })
  s.mirror((side) => {
    s.add(cylinder([0.48 * side, LAMP_Y, 0], 0.25, 0.05, 0.03, [0, 0, Math.PI / 2]), { color: 0xffd8a0, k: 0.02 })
    s.add(torus([0.48 * side, LAMP_Y, 0], 0.25, 0.08, [0, 0, Math.PI / 2]), { color: 0xd1a052, k: 0.02 })
  })
  s.paint(ellipsoid([0, LAMP_Y + 0.05, 0], [0.36, 0.62, 0.36]), {
    color: 0xffe0b0,
    mask: GLOW,
    union: [
      cylinder([0.5, LAMP_Y, 0], 0.21, 0.08, 0, [0, 0, Math.PI / 2]),
      cylinder([-0.5, LAMP_Y, 0], 0.21, 0.08, 0, [0, 0, Math.PI / 2])
    ]
  })
  return s
}

function pennantSculpt(): Sculpt {
  const s = new Sculpt()
  s.add(scaled(cone([0.03, 8.45, 0], [0.66, 8.33, 0], 0.16, 0.05, [0, 0, 1]), [1, 1, 0.25]), { color: ARK_RED })
  s.paint(sphere([0.22, 8.42, 0], 0.075), {
    color: ARK_CREAM,
    union: [sphere([0.33, 8.48, 0], 0.035), sphere([0.33, 8.36, 0], 0.035)]
  })
  return s
}

const BEAM_LEN = 8

export function lighthouseRecipe(): PropRecipe {
  return {
    parts: [
      { name: 'tower', sculpt: bodySculpt(), cell: 0.109, tris: 5800 },
      { name: 'top', sculpt: topSculpt(), cell: 0.072, tris: 4400 },
      { name: 'lamp', sculpt: lampSculpt(), cell: 0.065, tris: 1300, mat: 'glow', set: 1, pivot: [0, LAMP_Y, 0] },
      { name: 'pennant', sculpt: pennantSculpt(), cell: 0.04, tris: 300, pivot: [0, 8.4, 0] }
    ],
    look: {
      glowColor: 0xffa24a,
      glow: 1.5,
      glow2Color: ANIMA,
      lampColor: 0xffa040,
      lamp: 3.2,
      outline: 0.016
    },
    extras: [
      {
        name: 'beam',
        make() {
          // Two soft light cones along ±X (additive, fading with distance).
          const one = new THREE.CylinderGeometry(1.15, 0.2, BEAM_LEN, 16, 3, true)
          one.rotateZ(Math.PI / 2).translate(0.5 + BEAM_LEN / 2, 0, 0)
          const pos = one.getAttribute('position')
          const colors = new Float32Array(pos.count * 3)
          for (let i = 0; i < pos.count; i++) {
            const f = Math.pow(1 - Math.min(1, (pos.getX(i) - 0.5) / BEAM_LEN), 1.6)
            colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = f
          }
          one.setAttribute('color', new THREE.BufferAttribute(colors, 3))
          const two = one.clone().rotateY(Math.PI)
          const geometry = mergeTwo(one, two)
          one.dispose()
          two.dispose()
          const material = new THREE.MeshBasicMaterial({
            color: new THREE.Color(0xffb060).multiplyScalar(0.16),
            vertexColors: true,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
            fog: true
          })
          const mesh = new THREE.Mesh(geometry, material)
          mesh.position.y = LAMP_Y
          mesh.renderOrder = 4
          return {
            object: mesh,
            dispose: () => {
              geometry.dispose()
              material.dispose()
            }
          }
        }
      }
    ],
    animate(c) {
      const time = c.clock
      const h = c.health
      // Lantern: steady when healthy, flickering when badly hurt.
      const flick = h < 0.35 ? (Math.sin(time * 31) > 0.6 - h ? 0.35 : 1) * (0.8 + 0.2 * Math.sin(time * 13)) : 1
      const pulse = 0.9 + 0.1 * Math.sin(time * 2.4)
      c.u2.uGlow.value = 3.2 * pulse * flick * (0.55 + 0.45 * h)
      const spin = time * 0.7
      c.parts.lamp.rotation.y = spin
      const beam = c.extra.beam as THREE.Mesh
      beam.rotation.y = spin
      ;(beam.material as THREE.MeshBasicMaterial).color.setHex(0xffb060).multiplyScalar(0.16 * flick * (0.4 + 0.6 * h))
      c.parts.pennant.rotation.y = 0.35 * Math.sin(time * 1.6) + 0.15 * Math.sin(time * 4.1)
      // Cracks open and leak anima as it is damaged.
      const crack = clamp01((1 - h) * 1.25)
      const dark = 1 - Math.min(1, crack * 1.5) * 0.75
      c.u.uArmorTint.value.setRGB(dark, dark * 0.96, dark * 0.95)
      c.u.uGlow2.value = crack > 0.02 ? (0.8 + 1.8 * crack) * (0.8 + 0.2 * Math.sin(time * 7)) : 0
      c.u.uGlow.value = 1.5 + 0.15 * Math.sin(time * 1.3)
    }
  }
}

/** Merges two non-indexed or indexed geometries with the same attributes. */
function mergeTwo(a: THREE.BufferGeometry, b: THREE.BufferGeometry): THREE.BufferGeometry {
  const ga = a.index ? a.toNonIndexed() : a
  const gb = b.index ? b.toNonIndexed() : b
  const out = new THREE.BufferGeometry()
  for (const name of ['position', 'normal', 'uv', 'color']) {
    const x = ga.getAttribute(name) as THREE.BufferAttribute
    const y = gb.getAttribute(name) as THREE.BufferAttribute
    if (!x || !y) continue
    const arr = new Float32Array(x.array.length + y.array.length)
    arr.set(x.array as Float32Array, 0)
    arr.set(y.array as Float32Array, x.array.length)
    out.setAttribute(name, new THREE.BufferAttribute(arr, x.itemSize))
  }
  if (ga !== a) ga.dispose()
  if (gb !== b) gb.dispose()
  out.computeBoundingSphere()
  return out
}

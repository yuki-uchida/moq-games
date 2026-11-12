/**
 * Small deployables: the ミツツボアリ honey jar (a honeypot ant with a glowing honey belly hugging a glowing
 * jar), キツネ's 化け葉 leaf effigy (a fox doll made of leaves) and the fallback hologram decoy (decoys that carry
 * a species are drawn as hologram characters by the renderer).
 */
import * as THREE from 'three'
import { box, capsule, cone, cylinder, ellipsoid, plane, scaled, Sculpt, sphere, torus, type Vec3 } from '../sdf/sculpt'
import { beadEyes, expiry, GLOW, GLOW2, INK, pawEmblem, popIn, type PropRecipe, WHITE } from './kit'

// ------------------------------------------------------------------------------------------------- honey jar

const HONEY = 0xffb53c
const ANT = 0x7a4630
const ANT_DARK = 0x5a3020
const LID = 0x9a6a44
/** The jar sits front-right, the ant behind-left hugging it. */
const JAR: Vec3 = [0.16, 0, 0.18]

function jarSculpt(): Sculpt {
  const s = new Sculpt()
  const [x, , z] = JAR
  s.add(ellipsoid([x, 0.29, z], [0.29, 0.28, 0.28]), { color: HONEY })
  s.add(cylinder([x, 0.58, z], 0.19, 0.05, 0.03), { color: HONEY, k: 0.06 })
  // Wooden lid with a knob, a rope bow around the neck.
  s.add(cylinder([x, 0.65, z], 0.23, 0.045, 0.035), { color: LID, k: 0.02 })
  s.add(sphere([x, 0.72, z], 0.06), { color: LID, k: 0.03 })
  s.add(torus([x, 0.56, z], 0.2, 0.04), { color: 0xf0dcb0, k: 0.015 })
  s.add(scaled(sphere([x + 0.06, 0.55, z + 0.21], 0.06), [1.3, 0.8, 0.7]), { color: 0xf0dcb0, k: 0.02 })
  // Honey drips running over the shoulder.
  for (const [a, len] of [
    [0.4, 0.16],
    [1.4, 0.1],
    [2.6, 0.2],
    [4.3, 0.13]
  ]) {
    const dx = Math.cos(a) * 0.22
    const dz = Math.sin(a) * 0.22
    s.add(capsule([x + dx, 0.56, z + dz], [x + dx * 1.15, 0.56 - len, z + dz * 1.15], 0.045), {
      color: 0xffc94a,
      k: 0.03
    })
  }
  s.sub(plane([0, 0, 0], [0, 1, 0]), { k: 0.01 })
  // The honey glows through the jar; the label carries the ARK paw.
  s.paint(ellipsoid([x, 0.29, z], [0.32, 0.3, 0.31]), { color: 0xffd27a, mask: GLOW2 })
  s.paint(ellipsoid([x, 0.27, z + 0.28], [0.14, 0.12, 0.08]), { color: 0xfff1d6 })
  pawEmblem(s, [x, 0.27, z + 0.3], 0.18, 0xff8a2a, undefined, 0.06)
  s.paint(torus([x, 0.47, z], 0.25, 0.02), { color: WHITE, mask: GLOW })
  return s
}

function antSculpt(): Sculpt {
  const s = new Sculpt()
  // A huge amber honey-filled abdomen behind, a small thorax, six chunky legs; the front pair hug the jar.
  s.add(ellipsoid([-0.24, 0.36, -0.36], [0.3, 0.29, 0.31]), { color: HONEY })
  s.add(ellipsoid([-0.16, 0.52, -0.1], [0.13, 0.15, 0.15]), { color: ANT, k: 0.08 })
  s.add(capsule([-0.04, 0.58, -0.02], [0.08, 0.5, 0.2], 0.055), { color: ANT, k: 0.03 })
  s.add(capsule([0.08, 0.5, 0.2], [0.1, 0.42, 0.36], 0.05), { color: ANT, k: 0.03 })
  s.add(capsule([-0.25, 0.56, 0.0], [-0.12, 0.44, 0.24], 0.055), { color: ANT, k: 0.03 })
  s.add(capsule([-0.12, 0.44, 0.24], [-0.06, 0.36, 0.34], 0.05), { color: ANT, k: 0.03 })
  s.mirror((side) => {
    const x = -0.16 + 0.1 * side
    s.add(capsule([x, 0.46, -0.12], [x + 0.2 * side, 0.3, -0.06], 0.052), { color: ANT_DARK, k: 0.03 })
    s.add(capsule([x + 0.2 * side, 0.3, -0.06], [x + 0.26 * side, 0.03, 0.0], 0.048), { color: ANT_DARK, k: 0.02 })
    s.add(capsule([x, 0.42, -0.22], [x + 0.2 * side, 0.26, -0.38], 0.052), { color: ANT_DARK, k: 0.03 })
    s.add(capsule([x + 0.2 * side, 0.26, -0.38], [x + 0.24 * side, 0.03, -0.44], 0.048), { color: ANT_DARK, k: 0.02 })
  })
  s.sub(plane([0, 0, 0], [0, 1, 0]), { k: 0.01 })
  // Amber stripes on the swollen abdomen (glowing honey inside).
  s.paint(ellipsoid([-0.24, 0.36, -0.36], [0.33, 0.32, 0.34]), { color: 0xffcf6a, mask: GLOW2 })
  s.paint(torus([-0.24, 0.36, -0.22], 0.27, 0.025, [Math.PI / 2, 0, 0]), {
    color: 0xc8702a,
    union: [torus([-0.24, 0.36, -0.42], 0.29, 0.025, [Math.PI / 2, 0, 0])]
  })
  return s
}

const HEAD_PIVOT: Vec3 = [-0.14, 0.7, 0]

function antHeadSculpt(): Sculpt {
  const s = new Sculpt()
  const [x] = HEAD_PIVOT
  s.add(ellipsoid([x, 0.95, 0.02], [0.22, 0.2, 0.2]), { color: ANT })
  s.add(ellipsoid([x, 0.74, -0.04], [0.08, 0.12, 0.08]), { color: ANT, k: 0.05 })
  s.mirror((side) => {
    s.add(capsule([x + 0.08 * side, 1.1, 0.04], [x + 0.18 * side, 1.25, 0.1], 0.032), { color: ANT_DARK, k: 0.02 })
    s.add(capsule([x + 0.18 * side, 1.25, 0.1], [x + 0.27 * side, 1.25, 0.24], 0.03), { color: ANT_DARK, k: 0.01 })
    s.add(sphere([x + 0.28 * side, 1.25, 0.26], 0.055), { color: HONEY, k: 0.015 })
    s.add(scaled(cone([x + 0.06 * side, 0.85, 0.16], [x + 0.02 * side, 0.8, 0.24], 0.035, 0.014), [1, 0.7, 1]), {
      color: ANT_DARK,
      k: 0.015
    })
  })
  beadEyes(s, [x, 0.98, 0.17], 0.095, 0.05)
  s.mirror((side) => s.paint(sphere([x + 0.14 * side, 0.89, 0.15], 0.04), { color: 0xff9aa8, alpha: 0.6 }))
  s.paint(scaled(sphere([x, 0.87, 0.2], 0.03), [1.4, 0.6, 1]), { color: 0x3a2018 })
  return s
}

export function honeyRecipe(): PropRecipe {
  return {
    parts: [
      { name: 'jar', sculpt: jarSculpt(), cell: 0.035, tris: 1400 },
      { name: 'ant', sculpt: antSculpt(), cell: 0.041, tris: 1400, pivot: [-0.2, 0, -0.2] },
      { name: 'head', sculpt: antHeadSculpt(), cell: 0.028, tris: 1150, pivot: HEAD_PIVOT }
    ],
    look: { glowColor: 0xffc04a, glow: 1.2, glow2Color: 0xffb03a, glow2: 1.2, outline: 0.0065 },
    animate(c) {
      const t = c.t
      const breathe = Math.sin(t * 2.2)
      c.parts.ant.scale.set(1 + breathe * 0.02, 1 + breathe * 0.03, 1 + breathe * 0.02)
      const head = c.parts.head
      head.rotation.z = 0.12 * Math.sin(t * 1.1)
      head.rotation.x = -0.06 + 0.05 * Math.sin(t * 2.2 + 1)
      head.position.y = HEAD_PIVOT[1] + breathe * 0.012
      const end = expiry(c.life, t, 2.5, 0.3)
      c.body.scale.setScalar(Math.max(1e-3, popIn(t) * end.scale))
      c.u.uGlow2.value = 1.25 + 0.45 * Math.sin(t * 2.6) + end.blink
      c.u.uFlash.value = end.blink * 0.5
    }
  }
}

// ---------------------------------------------------------------------------------------------- leaf effigy

const LEAF = 0x86bf4e
const LEAF_DARK = 0x5f9a3a
const LEAF_AUTUMN = 0xf0a040
const TWIG = 0x8a5a3a
const VEIN = 0xc4e88a

/** A flat pointed leaf from `a` to `b` (half width w; flattened across `flat`) as two cones. */
function leafShape(s: Sculpt, a: Vec3, b: Vec3, w: number, color: number, k = 0.02, flat = 0.3) {
  const m: Vec3 = [a[0] + (b[0] - a[0]) * 0.4, a[1] + (b[1] - a[1]) * 0.4, a[2] + (b[2] - a[2]) * 0.4]
  s.add(scaled(cone(m, b, w, 0.012), [1, 1, flat]), { color, k })
  s.add(scaled(cone(m, a, w, 0.02), [1, 1, flat]), { color, k })
}

function effigySculpt(): Sculpt {
  const s = new Sculpt()
  // Body: a little bell wrapped in four big leaves (a leaf cloak).
  s.add(cone([0, 0.04, 0], [0, 0.56, 0], 0.2, 0.13), { color: 0x3f7a2a })
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6
    const x = Math.sin(a)
    const z = Math.cos(a)
    s.add(scaled(cone([x * 0.17, 0.6, z * 0.17], [x * 0.33, 0.07, z * 0.33], 0.15, 0.04, [x, 0, z]), [1, 1, 0.38]), {
      color: i % 2 ? LEAF : 0x6eae3e,
      k: 0.012
    })
  }
  // Head: a round leafy fox head with big pointed leaf ears and a pale muzzle.
  s.add(sphere([0, 0.8, 0.0], 0.24), { color: LEAF, k: 0.08 })
  s.add(ellipsoid([0, 0.74, 0.2], [0.1, 0.075, 0.09]), { color: 0xf4f8dc, k: 0.05 })
  s.mirror((side) => {
    s.add(scaled(cone([0.13 * side, 0.95, -0.01], [0.3 * side, 1.3, -0.04], 0.13, 0.03, [0, 0, 1]), [1, 1, 0.42]), {
      color: LEAF,
      k: 0.05
    })
    // Twig arms with a leaf hand.
    s.add(capsule([0.15 * side, 0.5, 0.04], [0.29 * side, 0.36, 0.12], 0.042), { color: TWIG, k: 0.02 })
    leafShape(s, [0.29 * side, 0.36, 0.12], [0.36 * side, 0.24, 0.2], 0.055, LEAF_DARK, 0.015)
  })
  // A big autumn-leaf tail curling up behind.
  s.add(capsule([0, 0.22, -0.2], [0.08, 0.36, -0.36], 0.045), { color: TWIG, k: 0.03 })
  leafShape(s, [0.08, 0.36, -0.36], [0.22, 0.78, -0.46], 0.13, LEAF_AUTUMN, 0.03, 0.35)
  s.sub(plane([0, 0, 0], [0, 1, 0]), { k: 0.01 })
  beadEyes(s, [0, 0.86, 0.2], 0.095, 0.045, 0x3a2418)
  s.add(sphere([0, 0.77, 0.29], 0.03), { color: 0x3a2418, k: 0.01 })
  // Orange leaf tips on the ears, leaf veins, cheeks and a glowing anima knot (the 化け葉 spell).
  s.mirror((side) => s.paint(sphere([0.3 * side, 1.3, -0.04], 0.13), { color: LEAF_AUTUMN }))
  const ribs = [0, 1, 2, 3, 4, 5].map((i) => {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6
    return capsule([Math.sin(a) * 0.23, 0.56, Math.cos(a) * 0.23], [Math.sin(a) * 0.38, 0.1, Math.cos(a) * 0.38], 0.022)
  })
  s.paint(ribs[0], { color: VEIN, union: ribs.slice(1, 4) })
  s.paint(ribs[4], { color: VEIN, union: ribs.slice(5) })
  s.paint(capsule([0.08, 0.36, -0.36], [0.22, 0.78, -0.46], 0.014), { color: 0xffd08a })
  s.mirror((side) => s.paint(sphere([0.16 * side, 0.76, 0.17], 0.04), { color: 0xff9aa8, alpha: 0.6 }))
  s.paint(sphere([0, 0.42, 0.27], 0.055), { color: WHITE, mask: GLOW })
  return s
}

const TOP_LEAF: Vec3 = [0, 1.02, 0.0]

function topLeafSculpt(): Sculpt {
  const s = new Sculpt()
  // The big transformation leaf on the head (glowing veins).
  leafShape(s, TOP_LEAF, [0.03, 1.42, -0.06], 0.14, 0x9ad65a, 0.02)
  s.add(capsule([0, 0.99, 0.01], [0, 1.08, 0.0], 0.022), { color: TWIG, k: 0.01 })
  s.paint(capsule([0, 1.06, 0.0], [0.03, 1.38, -0.05], 0.012), { color: WHITE, mask: GLOW })
  s.mirror((side) =>
    s.paint(capsule([0.0, 1.14, -0.02], [0.08 * side, 1.2, -0.04], 0.01), {
      color: WHITE,
      mask: GLOW,
      union: [capsule([0.0, 1.24, -0.03], [0.07 * side, 1.3, -0.05], 0.01)]
    })
  )
  return s
}

export function leafDecoyRecipe(): PropRecipe {
  return {
    parts: [
      { name: 'doll', sculpt: effigySculpt(), cell: 0.032, tris: 2600 },
      { name: 'leaf', sculpt: topLeafSculpt(), cell: 0.02, tris: 600, pivot: TOP_LEAF }
    ],
    look: { glowColor: 0xffb45c, glow: 1.5, glow2Color: 0xffffff, outline: 0.0065 },
    animate(c) {
      const t = c.t
      const doll = c.parts.doll
      doll.rotation.z = 0.06 * Math.sin(t * 1.8)
      doll.rotation.x = 0.03 * Math.sin(t * 1.3)
      // The head leaf rides on the doll's sway and flutters.
      const leaf = c.parts.leaf
      leaf.position.set(-Math.sin(doll.rotation.z) * TOP_LEAF[1], TOP_LEAF[1], Math.sin(doll.rotation.x) * TOP_LEAF[1])
      leaf.rotation.z = doll.rotation.z + 0.15 * Math.sin(t * 4.2)
      leaf.rotation.x = doll.rotation.x - 0.1 + 0.1 * Math.sin(t * 3.1)
      const end = expiry(c.life, t, 1.5, 0.3)
      c.body.scale.setScalar(Math.max(1e-3, popIn(t, 0.35) * end.scale))
      c.u.uGlow.value = 1.4 + 0.4 * Math.sin(t * 5) + end.blink * 2
      c.u.uFlash.value = end.blink * 0.5
    }
  }
}

// ------------------------------------------------------------------------------------------- hologram decoy

function emitterSculpt(): Sculpt {
  const s = new Sculpt()
  s.add(cylinder([0, 0.05, 0], 0.26, 0.05, 0.03), { color: 0x56606c })
  s.add(cylinder([0, 0.11, 0], 0.17, 0.03, 0.02), { color: 0xa9b3bf, k: 0.02 })
  // A little pigeon head peeking from the rim (the ハトポッポ antique).
  s.add(sphere([0, 0.15, 0.2], 0.08), { color: 0xa9b3bf, k: 0.03 })
  s.add(cone([0, 0.15, 0.27], [0, 0.14, 0.32], 0.03, 0.012), { color: 0xd9a87a, k: 0.01 })
  s.sub(plane([0, 0, 0], [0, 1, 0]), { k: 0.01 })
  s.paint(ellipsoid([0, 0.12, 0.2], [0.085, 0.045, 0.085]), { color: 0x6fb58a })
  s.mirror((side) => s.paint(sphere([0.05 * side, 0.18, 0.26], 0.018), { color: 0xff8a3a }))
  s.paint(sphere([0, 0.14, 0], 0.12), { color: 0xa8f6ff, mask: GLOW })
  s.paint(torus([0, 0.1, 0], 0.24, 0.018), { color: WHITE, mask: GLOW })
  return s
}

function holoSculpt(): Sculpt {
  const s = new Sculpt()
  // A generic chibi animal: big round head, round ears, stubby limbs and a curled tail, mid-run.
  s.add(ellipsoid([0, 0.5, 0], [0.19, 0.2, 0.17]), { color: 0xffffff })
  s.add(sphere([0, 0.9, 0.03], 0.27), { color: 0xffffff, k: 0.06 })
  s.mirror((side) => {
    s.add(scaled(sphere([0.18 * side, 1.13, 0.0], 0.09), [1, 1, 0.6]), { color: 0xffffff, k: 0.04 })
    s.add(capsule([0.18 * side, 0.6, 0.0], [0.27 * side, 0.45, 0.1 * side], 0.055), { color: 0xffffff, k: 0.02 })
    s.add(capsule([0.09 * side, 0.32, 0.06 * side], [0.1 * side, 0.18, -0.06 * side], 0.07), {
      color: 0xffffff,
      k: 0.02
    })
  })
  s.add(capsule([0, 0.4, -0.15], [0, 0.6, -0.3], 0.06), { color: 0xffffff, k: 0.03 })
  s.add(sphere([0, 0.66, -0.3], 0.08), { color: 0xffffff, k: 0.03 })
  s.mirror((side) => s.add(sphere([0.09 * side, 0.92, 0.27], 0.045), { color: 0x405060, k: 0.01 }))
  s.add(box([0, 0.8, 0.27], [0.04, 0.015, 0.03], 0.01), { color: 0x405060, k: 0.01 })
  void INK
  return s
}

export function decoyRecipe(): PropRecipe {
  return {
    parts: [
      { name: 'emitter', sculpt: emitterSculpt(), cell: 0.026, tris: 900 },
      { name: 'holo', sculpt: holoSculpt(), cell: 0.038, tris: 1600, mat: 'holo', pivot: [0, 0.18, 0] }
    ],
    look: { glowColor: 0x9af0ff, glow: 1.6, glow2Color: 0x9af0ff, outline: 0.006 },
    extras: [
      {
        name: 'beam',
        make() {
          // A projection cone fading upwards (vertex colours), additive.
          const geometry = new THREE.CylinderGeometry(0.36, 0.13, 1.2, 20, 4, true).translate(0, 0.72, 0)
          const pos = geometry.getAttribute('position')
          const colors = new Float32Array(pos.count * 3)
          for (let i = 0; i < pos.count; i++) {
            const f = Math.pow(1 - Math.min(1, Math.max(0, (pos.getY(i) - 0.12) / 1.2)), 2)
            colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = f
          }
          geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
          const material = new THREE.MeshBasicMaterial({
            color: new THREE.Color(0x5fe8ff).multiplyScalar(0.28),
            vertexColors: true,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
          })
          return {
            object: new THREE.Mesh(geometry, material),
            dispose: () => {
              geometry.dispose()
              material.dispose()
            }
          }
        }
      }
    ],
    animate(c) {
      const t = c.t
      const holo = c.parts.holo
      // Runs on the spot (the sim moves the prop), with a glitchy flicker.
      holo.position.y = 0.2 + Math.abs(Math.sin(t * 9)) * 0.07
      holo.rotation.x = 0.12
      holo.rotation.z = 0.06 * Math.sin(t * 9)
      holo.position.x = Math.sin(t * 37) > 0.93 ? 0.04 : 0
      const end = expiry(c.life, t, 1.5, 0.3)
      c.body.scale.setScalar(Math.max(1e-3, popIn(t, 0.3) * end.scale))
      c.u.uGlow.value = 1.5 + 0.4 * Math.sin(t * 6)
      c.extra.beam.scale.set(1, 1 + 0.04 * Math.sin(t * 20), 1)
    }
  }
}

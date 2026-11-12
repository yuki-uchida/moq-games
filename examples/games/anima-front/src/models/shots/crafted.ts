/**
 * The crafted projectile looks, built procedurally (a few hundred triangles at most, generated in well under a
 * millisecond): the curled pill bug, the swallow dart, the hippo shell, the ink ball, the gecko pad, the acid
 * glob and the machine missile. +Z is the direction of flight; colours are sRGB hex.
 */
import * as THREE from 'three'
import { MeshBuilder, type V3 } from './mesh'

const INK = 0x2a2230

type Ring = [number, number, number, number]

/** Rings of a sphere of radius r from the back pole to the front pole. */
const sphereRings = (r: number, n: number, color: number, glow = 0): Ring[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const t = (i / n) * Math.PI
    return [-Math.cos(t) * r, Math.sin(t) * r, color, glow]
  })

/** ダンゴムシ: a curled pill bug ball — bulging plates and glowing seams around its roll axis (X). */
export function pillbug(): MeshBuilder {
  const r = 0.12
  const plates = 5
  const rings: Ring[] = []
  for (let p = 0; p < plates; p++) {
    const a = (p / plates) * Math.PI
    const b = ((p + 1) / plates) * Math.PI - 0.1
    const mid = (a + b) / 2
    const color = p % 2 ? 0x8d7a6e : 0x7a685e
    rings.push([-Math.cos(a) * r, Math.sin(a) * r, color, 0])
    rings.push([-Math.cos(mid) * r * 1.06, Math.sin(mid) * r * 1.06, color, 0])
    rings.push([-Math.cos(b) * r, Math.sin(b) * r, 0xffb070, 1])
  }
  rings.push([r, 0, 0x7a685e, 0])
  const m = new MeshBuilder().lathe(rings, 9, { rot: (p) => [p[2], p[1], -p[0]] })
  // A tiny tucked face peeking out on the front.
  for (const side of [1, -1]) m.spike([0.03 * side, -0.02, 0.112], [0.25 * side, -0.1, 1], 0.012, 0.014, INK)
  return m
}

/** ツバメ: a tiny swallow dart — navy back, white belly, red face, swept wings with glowing edges, forked tail. */
export function swallow(): MeshBuilder {
  const NAVY = 0x24307a
  const m = new MeshBuilder().lathe(
    [
      [-0.075, 0, NAVY, 0],
      [-0.05, 0.022, NAVY, 0],
      [0.0, 0.032, NAVY, 0],
      [0.05, 0.03, NAVY, 0],
      [0.08, 0.026, 0xe0503a, 0],
      [0.1, 0.018, 0xe0503a, 0],
      [0.115, 0.008, INK, 0],
      [0.14, 0, INK, 0]
    ],
    8,
    { stripe: (s, r) => (r >= 1 && r <= 3 && (s === 5 || s === 6) ? 0xfff8ef : null) }
  )
  for (const side of [1, -1]) {
    const u: V3 = [side, 0, 0]
    m.fan(
      [
        [0.02, 0.04],
        [0.18, -0.08],
        [0.13, -0.07],
        [0.02, -0.02]
      ],
      u,
      NAVY
    )
    m.fan(
      [
        [0.02, 0.05],
        [0.185, -0.075],
        [0.17, -0.085],
        [0.02, 0.035]
      ],
      u,
      0xaab6ff,
      1
    )
    m.fan(
      [
        [0.008, -0.05],
        [0.055, -0.18],
        [0.035, -0.17],
        [0.0, -0.07]
      ],
      u,
      NAVY
    )
    m.spike([0.02 * side, 0.016, 0.085], [side, 0.5, 0.6], 0.006, 0.008, INK)
  }
  return m
}

/** カバキャノン: a round hippo shell — a purple ball with a pale snout, little ears and a glowing band. */
export function hippo(): MeshBuilder {
  const BODY = 0xa05ab8
  const SNOUT = 0xc58ad6
  const m = new MeshBuilder().lathe(
    [
      [-0.15, 0, BODY, 0],
      [-0.13, 0.075, BODY, 0],
      [-0.09, 0.125, BODY, 0],
      [-0.055, 0.145, 0xf0c0ff, 1],
      [-0.03, 0.152, BODY, 0],
      [0.03, 0.15, BODY, 0],
      [0.07, 0.138, SNOUT, 0],
      [0.115, 0.125, SNOUT, 0],
      [0.155, 0.09, SNOUT, 0],
      [0.178, 0.04, SNOUT, 0],
      [0.185, 0, SNOUT, 0]
    ],
    10
  )
  for (const side of [1, -1]) {
    m.spike([0.07 * side, 0.115, -0.04], [0.5 * side, 1, -0.2], 0.03, 0.045, BODY)
    m.spike([0.055 * side, 0.09, 0.09], [0.4 * side, 0.6, 0.7], 0.014, 0.014, INK)
    m.spike([0.035 * side, 0.02, 0.17], [0.2 * side, 0.1, 1], 0.012, 0.01, 0x5a2a6a)
  }
  return m
}

/** タコスミ: a glossy ink ball with a highlight, trailing two droplets and violet sparkles. */
export function octopus(): MeshBuilder {
  const C = 0x2a2238
  const m = new MeshBuilder()
    .lathe(sphereRings(0.11, 7, C), 10)
    .lathe(sphereRings(0.045, 4, C), 6, { offset: [0.02, 0.01, -0.15] })
    .lathe(sphereRings(0.028, 3, C), 6, { offset: [-0.015, -0.01, -0.23] })
  // Glossy highlight patch just above the surface, facing up-left-forward.
  const n = new THREE.Vector3(-0.35, 0.55, 0.75).normalize()
  const c: V3 = [n.x * 0.113, n.y * 0.113, n.z * 0.113]
  const t1 = new THREE.Vector3(0, 1, 0).cross(n).normalize().multiplyScalar(0.03)
  const t2 = n.clone().cross(t1).normalize().multiplyScalar(0.018)
  const p = (a: number, b: number): V3 => [
    c[0] + t1.x * a + t2.x * b,
    c[1] + t1.y * a + t2.y * b,
    c[2] + t1.z * a + t2.z * b
  ]
  m.quad(p(-1, 0), p(0, -1), p(1, 0), p(0, 1), 0xfff8ff)
  m.spike([0.06, -0.03, 0.08], [0.6, -0.3, 0.7], 0.008, 0.02, 0xc8a0ff, 1)
  m.spike([-0.07, -0.05, 0.04], [-0.7, -0.5, 0.4], 0.007, 0.018, 0xc8a0ff, 1)
  return m
}

/** ヤモリ: a sticky five-toed pad facing forward on a short tether. */
export function gecko(): MeshBuilder {
  const SKIN = 0x5cc9c0
  const m = new MeshBuilder().lathe(
    [
      [-0.025, 0, SKIN, 0],
      [-0.02, 0.035, SKIN, 0],
      [0.006, 0.042, SKIN, 0],
      [0.014, 0.025, 0x9ff3ee, 1],
      [0.016, 0, 0x9ff3ee, 1]
    ],
    7
  )
  for (let i = 0; i < 5; i++) {
    const a = ((i - 2) / 4) * Math.PI * 0.95 + Math.PI / 2
    const off: V3 = [Math.cos(a) * 0.062, Math.sin(a) * 0.062 - 0.012, 0.004]
    m.lathe(
      [
        [-0.006, 0, SKIN, 0],
        [-0.004, 0.022, SKIN, 0],
        [0.008, 0.022, 0xc8fff8, 1],
        [0.014, 0, 0xc8fff8, 1]
      ],
      6,
      { offset: off }
    )
  }
  m.lathe(
    [
      [-0.13, 0, 0x2f4a50, 0],
      [-0.12, 0.011, 0x2f4a50, 0],
      [-0.025, 0.011, 0x2f4a50, 0],
      [-0.02, 0, 0x2f4a50, 0]
    ],
    5
  )
  return m
}

/** ハリガネ acid: a lumpy lime glob with violet membrane patches and a trailing drip. */
export function acid(): MeshBuilder {
  const m = new MeshBuilder()
  const ico = new THREE.IcosahedronGeometry(1, 1)
  const p = ico.getAttribute('position')
  const lump = (x: number, y: number, z: number): V3 => {
    const k = 0.1 * (1 + 0.16 * Math.sin(x * 5 + y * 3) + 0.12 * Math.sin(z * 6 - x * 2)) * (z < 0 ? 1 + z * 0.25 : 1)
    return [x * k, y * k, z * k * 1.15]
  }
  for (let i = 0; i < p.count; i += 3) {
    const v = [0, 1, 2].map((k) => lump(p.getX(i + k), p.getY(i + k), p.getZ(i + k)))
    const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3
    const cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3
    const violet = Math.sin(cx * 7.1 + cy * 4.3) > 0.72
    m.tri(v[0], v[1], v[2], violet ? 0x7a3aa0 : 0xc8ff5a, violet ? 0 : 1)
  }
  ico.dispose()
  m.lathe(sphereRings(0.04, 4, 0xb6ff3a, 1), 6, { offset: [0.01, -0.01, -0.15] })
  return m
}

/** ゴウテツ missile: white ceramic body with cyan seams and lens, four fins, a hot exhaust flame. */
export function missile(): MeshBuilder {
  const W = 0xeef3f6
  const CY = 0x7ff6ff
  const m = new MeshBuilder().lathe(
    [
      [-0.46, 0, 0xfff4d0, 1],
      [-0.4, 0.02, 0xffd890, 1],
      [-0.31, 0.04, 0xffa040, 1],
      [-0.3, 0.045, 0x4a5560, 0],
      [-0.27, 0.05, 0x4a5560, 0],
      [-0.26, 0.058, W, 0],
      [-0.12, 0.062, CY, 1],
      [-0.1, 0.062, W, 0],
      [0.1, 0.062, CY, 1],
      [0.12, 0.06, W, 0],
      [0.2, 0.05, W, 0],
      [0.255, 0.03, CY, 1],
      [0.3, 0, CY, 1]
    ],
    8
  )
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    m.fan(
      [
        [0.055, -0.26],
        [0.135, -0.3],
        [0.135, -0.22],
        [0.055, -0.13]
      ],
      [Math.cos(a), Math.sin(a), 0],
      0xd6dde4
    )
  }
  return m
}

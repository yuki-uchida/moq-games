/**
 * One recipe per projectile kind: procedural meshes — streaks and bolts here (crisp facets, a few dozen
 * triangles), the crafted ones in crafted.ts (pill bug, swallow, hippo, ink, gecko pad, acid, missile). Unit
 * scale, +Z is the direction of flight, sizes in metres; the renderer adds a glow dot and trails.
 */
import * as THREE from 'three'
import { ITEMS, type ItemId } from '../../data/items'
import type { ShotKind } from '../../sim/types'
import { acid, gecko, hippo, missile, octopus, pillbug, swallow } from './crafted'
import type { ShotShade } from './material'
import { MeshBuilder } from './mesh'

export interface ShotRecipe {
  mesh: () => MeshBuilder
  stretch: number
  shade?: ShotShade
}

/** Lighter, more saturated version of an accent colour for hot parts. */
function hotColor(hex: number, lift = 0.35): number {
  const c = new THREE.Color(hex)
  const hsl = { h: 0, s: 0, l: 0 }
  c.getHSL(hsl)
  c.setHSL(hsl.h, Math.min(1, hsl.s * 1.1 + 0.1), Math.min(0.85, hsl.l + lift * (1 - hsl.l)))
  return c.getHex()
}

// ----------------------------------------------------------------------------------------- procedural ones

/** ミツバチ: a hexagonal honey crystal bolt with bee-stripe bands and a white-hot tip. */
const bee = (): MeshBuilder => {
  const H = 0xffc23a
  const B = 0x6a3a12
  return new MeshBuilder().lathe(
    [
      [-0.11, 0, B, 0],
      [-0.085, 0.024, B, 0],
      [-0.055, 0.036, H, 1],
      [-0.025, 0.037, B, 0],
      [0.005, 0.037, H, 1],
      [0.035, 0.035, 0xffe27a, 1],
      [0.14, 0, 0xfff4c8, 1]
    ],
    6,
    { flat: true }
  )
}

/** キツツキ: a striped sunflower seed with a glowing red tip. */
const wood = (): MeshBuilder =>
  new MeshBuilder().lathe(
    [
      [-0.09, 0, 0x3a3030, 0],
      [-0.07, 0.02, 0x3a3030, 0],
      [-0.03, 0.033, 0xe8dcc0, 0],
      [0.02, 0.031, 0xe8dcc0, 0],
      [0.06, 0.02, 0xff6a5a, 1],
      [0.105, 0, 0xffb0a0, 1]
    ],
    8,
    { flat: true, scale: [1, 0.72], stripe: (s, r) => (r >= 1 && r <= 3 && s % 2 ? 0x3a3030 : null) }
  )

/** ハチドリ: a slim needle dart with three glowing tail fins. */
const humming = (): MeshBuilder => {
  const m = new MeshBuilder().lathe(
    [
      [-0.12, 0, 0x26c6da, 1],
      [-0.1, 0.012, 0x1a8a9a, 0],
      [0.0, 0.017, 0x1a8a9a, 0],
      [0.06, 0.011, 0xe8f8ff, 0],
      [0.17, 0, 0xffffff, 1]
    ],
    6,
    { flat: true }
  )
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2
    m.fan(
      [
        [0, -0.12],
        [0.05, -0.15],
        [0.014, -0.04]
      ],
      [Math.cos(a), Math.sin(a), 0],
      0x6af0ff,
      1
    )
  }
  return m
}

/** フグ: a spiky glowing pellet. */
const puffer = (): MeshBuilder => {
  const m = new MeshBuilder()
  const ico = new THREE.IcosahedronGeometry(0.046, 0)
  const p = ico.getAttribute('position')
  for (let i = 0; i < p.count; i += 3) {
    const v = (k: number): [number, number, number] => [p.getX(i + k), p.getY(i + k), p.getZ(i + k)]
    m.tri(v(0), v(1), v(2), 0xffd84a, 1)
  }
  ico.dispose()
  const t = (1 + Math.sqrt(5)) / 2
  const dirs: [number, number, number][] = [
    [-1, t, 0],
    [1, t, 0],
    [-1, -t, 0],
    [1, -t, 0],
    [0, -1, t],
    [0, 1, t],
    [0, -1, -t],
    [0, 1, -t],
    [t, 0, -1],
    [t, 0, 1],
    [-t, 0, -1],
    [-t, 0, 1]
  ]
  for (const d of dirs) {
    const l = Math.hypot(...d)
    const n: [number, number, number] = [d[0] / l, d[1] / l, d[2] / l]
    m.spike([n[0] * 0.036, n[1] * 0.036, n[2] * 0.036], n, 0.014, 0.045, 0xfff2c0, 0)
  }
  return m
}

/** フクロウ: a feather streak (two crossed vanes, white-hot quill tip). */
const owl = (): MeshBuilder => {
  const m = new MeshBuilder()
  const back: [number, number][] = [
    [0, -0.24],
    [0.03, -0.16],
    [0.045, -0.04],
    [0, -0.04],
    [-0.045, -0.04],
    [-0.03, -0.16]
  ]
  const front: [number, number][] = [
    [0, -0.04],
    [0.045, -0.04],
    [0.034, 0.08],
    [0, 0.2],
    [-0.034, 0.08],
    [-0.045, -0.04]
  ]
  for (const u of [
    [1, 0, 0],
    [0, 1, 0]
  ] as [number, number, number][]) {
    m.fan(back, u, 0xc4adf2, 1)
    m.fan(front, u, 0xf4eeff, 1)
  }
  return m
}

/** デンキウナギ: a zigzag spark (two crossed ribbons). */
const eel = (): MeshBuilder => {
  const m = new MeshBuilder()
  const pts: [number, number][] = [
    [0, -0.16],
    [0.035, -0.08],
    [-0.025, -0.02],
    [0.035, 0.05],
    [-0.015, 0.12],
    [0, 0.18]
  ]
  for (const [u, w] of [
    [
      [1, 0, 0],
      [0, 1, 0]
    ],
    [
      [0, 1, 0],
      [1, 0, 0]
    ]
  ] as [number, number, number][][]) {
    void w
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i]
      const [x1, z1] = pts[i + 1]
      const h = 0.012
      const p = (x: number, z: number): [number, number, number] => [u[0] * x, u[1] * x, z]
      m.quad(p(x0 - h, z0), p(x1 - h, z1), p(x1 + h, z1), p(x0 + h, z0), i % 2 ? 0xe8ffff : 0x9ff6ff, 1)
    }
  }
  return m
}

/** Any other antique: a teardrop anima bolt in the antique's colour. */
const bolt = (color: number) => (): MeshBuilder => {
  const c = hotColor(color, 0.15)
  return new MeshBuilder().lathe(
    [
      [-0.12, 0, color, 1],
      [-0.08, 0.02, color, 1],
      [-0.01, 0.04, c, 1],
      [0.05, 0.036, c, 1],
      [0.1, 0.016, 0xffffff, 1],
      [0.12, 0, 0xffffff, 1]
    ],
    8
  )
}

/** ミツメ laser: a long thin bolt. */
const laser = (): MeshBuilder =>
  new MeshBuilder().lathe(
    [
      [-0.26, 0, 0xff3a6a, 1],
      [-0.2, 0.02, 0xff6a8a, 1],
      [0.18, 0.022, 0xffb0c4, 1],
      [0.26, 0, 0xffffff, 1]
    ],
    6
  )

/** アシナガ plasma: a white-cyan orb wrapped in a glowing ring. */
const plasma = (): MeshBuilder => {
  const m = new MeshBuilder()
  const ico = new THREE.IcosahedronGeometry(0.15, 1)
  const p = ico.getAttribute('position')
  for (let i = 0; i < p.count; i += 3) {
    const v = (k: number): [number, number, number] => [p.getX(i + k), p.getY(i + k), p.getZ(i + k)]
    const n = (k: number): [number, number, number] => {
      const q = v(k)
      const l = Math.hypot(...q)
      return [q[0] / l, q[1] / l, q[2] / l]
    }
    m.tri(v(0), v(1), v(2), 0xd8fbff, 1, n(0), n(1), n(2))
  }
  ico.dispose()
  // A ring around the flight axis (a short wide lathe band).
  m.lathe(
    [
      [-0.03, 0.17, 0x7ae8ff, 1],
      [0, 0.2, 0x7ae8ff, 1],
      [0.03, 0.17, 0x7ae8ff, 1],
      [0, 0.15, 0x7ae8ff, 1],
      [-0.03, 0.17, 0x7ae8ff, 1]
    ],
    12
  )
  return m
}

/** クイツクシ acid rain: a violet droplet, round end first. */
const acidRain = (): MeshBuilder =>
  new MeshBuilder().lathe(
    [
      [-0.2, 0, 0x9a4aef, 1],
      [-0.14, 0.03, 0xa65af5, 1],
      [-0.05, 0.068, 0xc07aff, 1],
      [0.03, 0.084, 0xd8a8ff, 1],
      [0.09, 0.06, 0xf0d8ff, 1],
      [0.115, 0.025, 0xffffff, 1],
      [0.12, 0, 0xffffff, 1]
    ],
    8
  )

// ------------------------------------------------------------------------------------------------- table

const FOE: Record<'acid' | 'laser' | 'plasma' | 'missile' | 'acidRain', ShotRecipe> = {
  acid: { mesh: acid, stretch: 1.5, shade: { hot: 2.6 } },
  laser: { mesh: laser, stretch: 4, shade: { hot: 3.4, core: 3 } },
  plasma: { mesh: plasma, stretch: 1.3, shade: { hot: 3.0, core: 3 } },
  missile: { mesh: missile, stretch: 1.2, shade: { lit: 1.15, hot: 3.5, rim: 0.3, doubleSided: true } },
  acidRain: { mesh: acidRain, stretch: 1.6, shade: { hot: 2.8 } }
}

const ITEM: Partial<Record<ItemId, ShotRecipe>> = {
  bee: { mesh: bee, stretch: 3, shade: { hot: 3.2, lit: 1.0 } },
  wood: { mesh: wood, stretch: 2.5, shade: { hot: 3.2, lit: 1.1 } },
  humming: { mesh: humming, stretch: 3.5, shade: { hot: 3.4, lit: 1.1, doubleSided: true } },
  puffer: { mesh: puffer, stretch: 1.6, shade: { hot: 3.0, lit: 1.3 } },
  owl: { mesh: owl, stretch: 5, shade: { hot: 3.2, core: 2, doubleSided: true } },
  swallow: { mesh: swallow, stretch: 1.3, shade: { lit: 1.25, hot: 3.2, rim: 0.6, doubleSided: true } },
  pillbug: { mesh: pillbug, stretch: 1, shade: { lit: 1.3, hot: 3.0, rim: 0.4 } },
  eel: { mesh: eel, stretch: 2.2, shade: { hot: 3.8, core: 1, doubleSided: true } },
  hippo: { mesh: hippo, stretch: 1.15, shade: { lit: 1.3, hot: 3.2, rim: 0.6 } },
  octopus: {
    mesh: octopus,
    stretch: 1.4,
    shade: { lit: 1.2, hot: 3.0, rim: 0.9, rimColor: 0xb890ff }
  },
  gecko: { mesh: gecko, stretch: 1.2, shade: { lit: 1.25, hot: 2.6 } }
}

export function shotRecipe(kind: ShotKind): ShotRecipe {
  if (kind in FOE) return FOE[kind as keyof typeof FOE]
  const r = ITEM[kind as ItemId]
  if (r) return r
  return { mesh: bolt(ITEMS[kind as ItemId]?.color ?? 0xb388ff), stretch: 3, shade: { hot: 2.5, core: 1.2 } }
}

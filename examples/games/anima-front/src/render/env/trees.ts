/**
 * Trees (BOX_STYLES.tree): soft layered canopies built from smooth foliage clumps wrapped in alpha-cut leaf cards,
 * all lit with normals bent away from the canopy centre so a crown shades as one volume (toon-tree look). The map
 * box is only the trunk collider (0.6 × 4.5 m per unit scale); the drawn tree is taller and its crown starts above
 * head height so squads walk and shoot under it. Pure planning.
 */
import type { MapBox } from '../../sim/types'
import { hash01, shade, type EnvCtx } from './ctx'
import type { GeoBuilder, Surf } from './geo'

type V3 = [number, number, number]

interface Crown {
  /** Centre and radii of the canopy ellipsoid. */
  c: V3
  rx: number
  ry: number
  /** Leaf clump colours (sRGB) and the card tile. */
  colors: readonly number[]
  card: 'mLeafCard' | 'mBlossom' | 'mNeedles'
  /** Opaque clump surface: blossoms use flat white × tint, leaves the painted leaf tile. */
  clump: 'mLeaves' | 'mWhite'
  cardTint: readonly number[]
  clumps: number
  cardsPerClump: number
}

export function tree(b: MapBox, ctx: EnvCtx, style: number) {
  const [x0, y0, z0] = b.min
  const [x1, y1, z1] = b.max
  const cx = (x0 + x1) / 2
  const cz = (z0 + z1) / 2
  const s = Math.max(0.6, (y1 - y0) / 4.5)
  const seed = hash01(x0, y0, z0)
  if (style === 4) return virtualTree(ctx, cx, y0, cz, s)
  if (style === 3) return pine(ctx, cx, y0, cz, s, seed)
  if (style === 2) return deadTree(ctx, cx, y0, cz, s, seed)
  const cherry = style === 0
  const H = (cherry ? 7.2 : 8.4) * s
  const trunkR = 0.26 * s
  const bark: Surf = { tile: 'mBark', color: cherry ? 0xb8968c : 0xc0a688 }
  const g = ctx.at('atlas', cx, cz)
  const lean: V3 = [(seed - 0.5) * 0.8 * s, 0, (hash01(seed, 3, 1) - 0.5) * 0.8 * s]
  const crownY = y0 + H * (cherry ? 0.7 : 0.66)
  const crown: Crown = {
    c: [cx + lean[0], crownY, cz + lean[2]],
    rx: H * (cherry ? 0.46 : 0.36),
    ry: H * (cherry ? 0.27 : 0.33),
    colors: cherry ? [0xf7b3c8, 0xfbc6d6, 0xf09fba, 0xffd6e2] : [0x6fa64c, 0x7fb556, 0x5f9842, 0x8cc060],
    card: cherry ? 'mBlossom' : 'mLeafCard',
    clump: cherry ? 'mWhite' : 'mLeaves',
    cardTint: cherry ? [0xffffff, 0xfff0f4, 0xffe2ea] : [0x9ccf72, 0xb4dc84, 0x86bd62],
    clumps: cherry ? 12 : 11,
    cardsPerClump: ctx.density >= 0.8 ? 6 : 4
  }
  // Root flare, trunk with a lean and limbs reaching into the crown.
  g.cylinder(cx, y0, cz, trunkR * 1.9, trunkR * 1.1, 0.45 * s, 9, bark, false)
  const fork: V3 = [cx + lean[0] * 0.6, y0 + H * 0.42, cz + lean[2] * 0.6]
  g.limb([cx, y0 + 0.3, cz], fork, trunkR * 1.1, trunkR * 0.85, bark, 8)
  const limbs = cherry ? 5 : 4
  for (let i = 0; i < limbs; i++) {
    const a = seed * 6.28 + (i / limbs) * Math.PI * 2 + hash01(i, seed, 4) * 0.5
    const reach = crown.rx * (0.55 + 0.25 * hash01(seed, i, 5))
    const mid: V3 = [fork[0] + Math.sin(a) * reach * 0.45, fork[1] + H * 0.12, fork[2] + Math.cos(a) * reach * 0.45]
    const tip: V3 = [crown.c[0] + Math.sin(a) * reach, crownY - crown.ry * 0.1, crown.c[2] + Math.cos(a) * reach]
    g.limb(fork, mid, trunkR * 0.72, trunkR * 0.5, bark, 6)
    g.limb(mid, tip, trunkR * 0.5, trunkR * 0.22, bark, 5)
  }
  canopy(ctx, crown, seed)
  ctx.canopy(crown.c, Math.max(crown.rx, crown.ry) * 0.9)
  if (cherry) {
    // Fallen petals around the trunk and a few drifting from the crown.
    const r = crown.rx * 1.1
    ctx
      .at('cutout', cx, cz)
      .quad(
        cx - r,
        y0 + 0.035,
        cz + r,
        [r * 2, 0, 0],
        [0, 0, -r * 2],
        { tile: 'mPetalScatter', map: 'fit' },
        [0, 0, 1, 1]
      )
    ctx.emit({ kind: 'petals', p: crown.c, r: crown.rx, rate: 1.4 })
  } else if (ctx.overgrowth) baseTufts(ctx, cx, y0, cz, s, seed)
}

/** Clumps on and inside the crown ellipsoid, each a smooth blob wrapped in leaf cards. */
function canopy(ctx: EnvCtx, cr: Crown, seed: number) {
  const f = ctx.at('foliage', cr.c[0], cr.c[2])
  const cut = ctx.at('cutout', cr.c[0], cr.c[2])
  f.bend = { c: [cr.c[0], cr.c[1] - cr.ry * 0.5, cr.c[2]], k: 0.65 }
  cut.bend = { c: [cr.c[0], cr.c[1] - cr.ry * 0.5, cr.c[2]], k: 0.85 }
  // Core mass so no sky shows through the middle.
  f.blob(
    cr.c[0],
    cr.c[1],
    cr.c[2],
    cr.rx * 0.72,
    cr.ry * 0.78,
    cr.rx * 0.72,
    {
      tile: cr.clump,
      color: shade(cr.colors[0], 0.82),
      fx: 0.2
    },
    2,
    0.12,
    seed * 9,
    true
  )
  for (let i = 0; i < cr.clumps; i++) {
    // Fibonacci-ish spread over the upper ~3/4 of the ellipsoid.
    const t = (i + 0.5) / cr.clumps
    const elev = Math.asin(1 - 1.5 * t) * 0.9
    const az = i * 2.39996 + seed * 6.28
    const d = 0.78 + 0.18 * hash01(i, seed, 7)
    const p: V3 = [
      cr.c[0] + Math.cos(elev) * Math.sin(az) * cr.rx * d,
      cr.c[1] + Math.sin(elev) * cr.ry * d,
      cr.c[2] + Math.cos(elev) * Math.cos(az) * cr.rx * d
    ]
    const r = cr.rx * (0.34 + 0.14 * hash01(seed, i, 8))
    const color = cr.colors[i % cr.colors.length]
    f.blob(p[0], p[1], p[2], r, r * 0.8, r, { tile: cr.clump, color, fx: 0.3 }, 1, 0.14, seed * 13 + i, true)
    for (let k = 0; k < cr.cardsPerClump; k++) {
      const ca = hash01(i, k, seed) * Math.PI * 2
      const ce = hash01(k, i, seed, 2) * 1.2 - 0.25
      const dir: V3 = [Math.cos(ce) * Math.sin(ca), Math.sin(ce), Math.cos(ce) * Math.cos(ca)]
      // Outward from the crown centre, nudged by the clump direction.
      const out: V3 = [p[0] - cr.c[0] + dir[0] * r, p[1] - cr.c[1] + dir[1] * r, p[2] - cr.c[2] + dir[2] * r]
      const l = Math.hypot(out[0], out[1], out[2]) || 1
      const n: V3 = [out[0] / l, out[1] / l, out[2] / l]
      const q: V3 = [p[0] + dir[0] * r * 0.72, p[1] + dir[1] * r * 0.72, p[2] + dir[2] * r * 0.72]
      const size = r * (0.95 + 0.4 * hash01(k, seed, i))
      const spin = hash01(seed, k, i, 3) * Math.PI * 2
      const [right, up] = basis(n, spin, size)
      cut.card(q[0], q[1], q[2], right, up, n, {
        tile: cr.card,
        color: cr.cardTint[(i + k) % cr.cardTint.length],
        fx: 0.35
      })
    }
  }
  f.bend = null
  cut.bend = null
}

/** Card axes (half extents) perpendicular to n, spun around it; right × up = n so the front faces out. */
function basis(n: V3, spin: number, size: number): [V3, V3] {
  const ref: V3 = Math.abs(n[1]) > 0.92 ? [1, 0, 0] : [0, 1, 0]
  let rx = ref[1] * n[2] - ref[2] * n[1]
  let ry = ref[2] * n[0] - ref[0] * n[2]
  let rz = ref[0] * n[1] - ref[1] * n[0]
  const rl = Math.hypot(rx, ry, rz) || 1
  rx /= rl
  ry /= rl
  rz /= rl
  const ux = n[1] * rz - n[2] * ry
  const uy = n[2] * rx - n[0] * rz
  const uz = n[0] * ry - n[1] * rx
  const c = Math.cos(spin)
  const sn = Math.sin(spin)
  const right: V3 = [(rx * c + ux * sn) * size, (ry * c + uy * sn) * size, (rz * c + uz * sn) * size]
  const up: V3 = [(ux * c - rx * sn) * size, (uy * c - ry * sn) * size, (uz * c - rz * sn) * size]
  return [right, up]
}

function pine(ctx: EnvCtx, cx: number, y0: number, cz: number, s: number, seed: number) {
  const H = 10 * s
  const g = ctx.at('atlas', cx, cz)
  const f = ctx.at('foliage', cx, cz)
  const cut = ctx.at('cutout', cx, cz)
  const bark: Surf = { tile: 'mBark', color: 0x8a6a52 }
  g.limb([cx, y0, cz], [cx, y0 + H * 0.92, cz], 0.3 * s, 0.06 * s, bark, 7)
  const tiers = 5
  f.bend = { c: [cx, y0 + H * 0.3, cz], k: 0.5 }
  cut.bend = { c: [cx, y0 + H * 0.3, cz], k: 0.7 }
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1)
    const yb = y0 + H * (0.24 + t * 0.56)
    const r = H * (0.3 - t * 0.2) * (0.92 + 0.16 * hash01(i, seed, 1))
    const hgt = H * 0.26
    const col = shade(0x4d8458, 0.9 + t * 0.18)
    // Drooping skirt: a low cone plus a shallow cap.
    f.cylinder(cx, yb, cz, r, r * 0.12, hgt, 11, { tile: 'mLeaves', color: col, fx: 0.25 }, false)
    f.disc(cx, yb, cz, r, 11, -1, { tile: 'mLeaves', color: shade(col, 0.6) })
    // Needle sprays around the rim, hanging slightly down.
    const n = Math.max(5, Math.round(r * 3.2))
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + seed * 3 + i
      const out: V3 = [Math.sin(a), -0.35, Math.cos(a)]
      const l = Math.hypot(out[0], out[1], out[2])
      const nn: V3 = [out[0] / l, out[1] / l, out[2] / l]
      const size = r * 0.42
      const [right, up] = basis(nn, Math.PI / 2 + hash01(k, i, seed) * 0.6, size)
      cut.card(cx + Math.sin(a) * r * 0.92, yb + hgt * 0.12, cz + Math.cos(a) * r * 0.92, right, up, nn, {
        tile: 'mNeedles',
        color: shade(0xa8d08a, 0.9 + t * 0.15),
        fx: 0.3
      })
    }
  }
  f.bend = null
  cut.bend = null
}

function deadTree(ctx: EnvCtx, cx: number, y0: number, cz: number, s: number, seed: number) {
  const g = ctx.at('atlas', cx, cz)
  const H = 7 * s
  const bark: Surf = { tile: 'mBark', color: 0x8c847a }
  const top: V3 = [cx + (seed - 0.5) * s, y0 + H * 0.55, cz + (hash01(seed, 2, 2) - 0.5) * s]
  g.cylinder(cx, y0, cz, 0.42 * s, 0.26 * s, 0.4 * s, 8, bark, false)
  g.limb([cx, y0 + 0.3, cz], top, 0.27 * s, 0.17 * s, bark, 7)
  // Recursive twisted branches.
  const grow = (from: V3, dir: V3, len: number, r: number, depth: number, k: number) => {
    const to: V3 = [from[0] + dir[0] * len, from[1] + dir[1] * len, from[2] + dir[2] * len]
    g.limb(from, to, r, r * 0.6, bark, depth > 1 ? 5 : 4)
    if (depth === 0) return
    for (let j = 0; j < 2; j++) {
      const a = hash01(k, j, seed) * Math.PI * 2
      const nd: V3 = [dir[0] + Math.sin(a) * 0.7, dir[1] + 0.25, dir[2] + Math.cos(a) * 0.7]
      const l = Math.hypot(nd[0], nd[1], nd[2])
      grow(to, [nd[0] / l, nd[1] / l, nd[2] / l], len * 0.62, r * 0.6, depth - 1, k * 3 + j + 1)
    }
  }
  for (let i = 0; i < 4; i++) {
    const a = seed * 6.28 + (i / 4) * Math.PI * 2
    const d: V3 = [Math.sin(a) * 0.75, 0.66, Math.cos(a) * 0.75]
    const l = Math.hypot(d[0], d[1], d[2])
    grow(top, [d[0] / l, d[1] / l, d[2] / l], H * 0.26, 0.15 * s, 2, i + 1)
  }
  // A last stubborn tuft of dry leaves.
  if (ctx.overgrowth) {
    const cut = ctx.at('cutout', cx, cz)
    const n: V3 = [0.3, 0.8, 0.5]
    const [right, up] = basis(n, seed * 4, 0.7 * s)
    cut.card(top[0], top[1] + H * 0.22, top[2], right, up, n, { tile: 'mLeafCard', color: 0xc8a070, fx: 0.4 })
    baseTufts(ctx, cx, y0, cz, s, seed)
  }
}

/** Grass tufts around the root flare. */
function baseTufts(ctx: EnvCtx, cx: number, y0: number, cz: number, s: number, seed: number) {
  const cut = ctx.at('cutout', cx, cz)
  for (let i = 0; i < 4; i++) {
    const a = seed * 5 + i * 1.7
    const r = (0.7 + hash01(i, seed, 6) * 0.6) * s
    const x = cx + Math.sin(a) * r
    const z = cz + Math.cos(a) * r
    if (ctx.covered(x, z, y0 + 0.05)) continue
    cut.cross(x, y0, z, 0.8, 0.5, { tile: 'mGrass', color: 0xd8eaa8, fx: 1 }, 2, a)
  }
}

function virtualTree(ctx: EnvCtx, cx: number, y0: number, cz: number, s: number) {
  const g: GeoBuilder = ctx.at('atlas', cx, cz)
  const h = 4.5 * s * 1.3
  g.cylinder(cx, y0, cz, 0.22 * s, 0.15 * s, h * 0.55, 8, { tile: 'mWhite' })
  const f = ctx.at('foliage', cx, cz)
  f.blob(
    cx,
    y0 + h * 0.7,
    cz,
    h * 0.3,
    h * 0.32,
    h * 0.3,
    {
      tile: 'mWhite',
      color: 0xd8f6ff,
      glow: 0.5 * ctx.accent,
      fx: 0.15
    },
    1,
    0
  )
  ctx.at('glow', cx, cz).blob(
    cx,
    y0 + h * 0.7,
    cz,
    h * 0.12,
    h * 0.12,
    h * 0.12,
    {
      tile: 'mWhite',
      color: 0x58e8ff,
      glow: 2 * ctx.accent
    },
    1,
    0
  )
}

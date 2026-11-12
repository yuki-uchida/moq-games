/**
 * Everything outside the playable bounds, so map edges never look empty: an outskirts row of full-detail
 * buildings and trees hugging each land edge (or the ARK compound wall and woods around the training yard), the sea
 * running out to the horizon on water edges, a hazed skyline ring of towers (crystal spires in the blight, white
 * blocks in the arena) and soft hills on the horizon. Batched per side so it costs a handful of draw calls. Pure.
 */
import type { MapBox, MapDef } from '../../sim/types'
import { buildBuilding } from './buildings'
import { hash01, mix, shade, type EnvCtx, type EnvMat } from './ctx'
import { GeoBuilder, rng } from './geo'
import type { ThemeDef } from './themes'
import type { TileName } from './atlas'
import { tree } from './trees'

export type Side = 'n' | 's' | 'e' | 'w'

/** Building styles of the outskirts per theme. */
const OUT_STYLES: Record<ThemeDef['id'], number[]> = {
  day: [0, 1, 2, 2, 3, 8, 8],
  night: [0, 1, 2, 2, 3, 8, 8],
  sunset: [5, 5, 0, 2, 8],
  blight: [9, 9, 8, 9],
  virtual: [7]
}

export function buildBackdrop(
  map: MapDef,
  theme: ThemeDef,
  ctx: EnvCtx,
  get: (mat: EnvMat, cell: string) => GeoBuilder,
  hashString: (s: string) => number
) {
  const r = rng(hashString(map.id + theme.id + 'out'))
  const sea = seaSides(map)
  const range = map.id === 'range'
  for (const side of ['n', 's', 'e', 'w'] as Side[]) {
    // Every outskirts piece of one side lands in one batch per material.
    const sideCtx: EnvCtx = { ...ctx, at: (mat) => get(mat, `edge:${side}`) }
    if (sea.has(side)) seaEdge(map, side, get)
    else if (range) compoundEdge(map, side, sideCtx, r)
    else outskirts(map, theme, side, sideCtx, r)
  }
  skyline(map, theme, ctx, (mat) => get(mat, 'far'), r, sea, range)
  hills(map, theme, (mat) => get(mat, 'far'), r, sea)
}

/** Sides whose edge is open water (a non-solid water ground box touching the bounds). */
export function seaSides(map: MapDef): Set<Side> {
  const out = new Set<Side>()
  const [x0, z0] = map.bounds.min
  const [x1, z1] = map.bounds.max
  const water = map.boxes.filter((b) => b.kind === 'ground' && b.style === 7)
  const isWater = (x: number, z: number) =>
    water.some((b) => x >= b.min[0] && x <= b.max[0] && z >= b.min[2] && z <= b.max[2])
  const probe = (pts: [number, number][]) => pts.filter(([x, z]) => isWater(x, z)).length >= pts.length / 2
  const ts = [0.1, 0.3, 0.5, 0.7, 0.9]
  if (probe(ts.map((t) => [x0 + (x1 - x0) * t, z1 - 1]))) out.add('n')
  if (probe(ts.map((t) => [x0 + (x1 - x0) * t, z0 + 1]))) out.add('s')
  if (probe(ts.map((t) => [x1 - 1, z0 + (z1 - z0) * t]))) out.add('e')
  if (probe(ts.map((t) => [x0 + 1, z0 + (z1 - z0) * t]))) out.add('w')
  return out
}

/** Walks along one side outside the bounds: (along, out) → world (x, z). */
function frame(map: MapDef, side: Side) {
  const [x0, z0] = map.bounds.min
  const [x1, z1] = map.bounds.max
  switch (side) {
    case 'n':
      return { from: x0 - 30, to: x1 + 30, at: (a: number, o: number): [number, number] => [a, z1 + o] }
    case 's':
      return { from: x0 - 30, to: x1 + 30, at: (a: number, o: number): [number, number] => [a, z0 - o] }
    case 'e':
      return { from: z0 - 30, to: z1 + 30, at: (a: number, o: number): [number, number] => [x1 + o, a] }
    case 'w':
      return { from: z0 - 30, to: z1 + 30, at: (a: number, o: number): [number, number] => [x0 - o, a] }
  }
}

const box = (kind: MapBox['kind'], x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, style = 0) =>
  ({ kind, style, min: [x0, y0, z0], max: [x1, y1, z1] }) as MapBox

function treeAt(ctx: EnvCtx, x: number, z: number, style: number, s: number) {
  tree(box('tree', x - 0.3 * s, 0, z - 0.3 * s, x + 0.3 * s, 4.5 * s, z + 0.3 * s, style), ctx, style)
}

/** A row of real buildings just outside the bounds (with trees in the gaps), and a taller second row behind. */
function outskirts(map: MapDef, theme: ThemeDef, side: Side, ctx: EnvCtx, r: () => number) {
  const f = frame(map, side)
  const water = map.boxes.filter((b) => b.kind === 'ground' && b.style === 7)
  const [bx0, bz0] = map.bounds.min
  const [bx1, bz1] = map.bounds.max
  // Nothing in the sea: test the point clamped back onto the edge of the map.
  const wet = (x: number, z: number) => {
    const px = Math.max(bx0 + 1, Math.min(bx1 - 1, x))
    const pz = Math.max(bz0 + 1, Math.min(bz1 - 1, z))
    return water.some((b) => px >= b.min[0] - 8 && px <= b.max[0] && pz >= b.min[2] - 8 && pz <= b.max[2] + 8)
  }
  const styles = OUT_STYLES[theme.id]
  const city = theme.id === 'day' || theme.id === 'night'
  for (const [row, offset, hMin, hMax] of [
    [0, 5, 5, 14],
    [1, 26, 12, 26]
  ] as const) {
    let a = f.from + r() * 6
    while (a < f.to) {
      const w = 8 + r() * 10
      const d = 8 + r() * 8
      const o = offset + r() * 4
      if (row === 0 && r() < (city ? 0.22 : 0.12)) {
        // A gap with a tree or two (no trees in the blight or the arena).
        if (ctx.overgrowth && theme.id !== 'blight')
          for (let k = 0; k < 2; k++) {
            const [x, z] = f.at(a + 2 + k * 4, o + 2 + r() * 4)
            treeAt(ctx, x, z, city ? (r() < 0.35 ? 0 : 1) : 1, 0.9 + r() * 0.4)
          }
        a += 9
        continue
      }
      const style = styles[Math.floor(r() * styles.length)]
      if (wet(...f.at(a + w / 2, 0))) {
        a += w + 2
        continue
      }
      const h = hMin + r() * (hMax - hMin) * (style === 3 ? 0.3 : 1)
      const [cx, cz] = f.at(a + w / 2, o + d / 2)
      const alongX = side === 'n' || side === 's'
      const hw = (alongX ? w : d) / 2
      const hd = (alongX ? d : w) / 2
      buildBuilding(box('building', cx - hw, 0, cz - hd, cx + hw, Math.max(3.6, h), cz + hd, style), ctx)
      a += w + 1 + r() * (row === 0 ? 3 : 6)
    }
  }
}

/** The training yard sits inside an ARK compound: a striped wall with banners, watchtowers and woods behind. */
function compoundEdge(map: MapDef, side: Side, ctx: EnvCtx, r: () => number) {
  const f = frame(map, side)
  const len = f.to - f.from - 60
  const start = f.from + 30
  const g = ctx.at('atlas', 0, 0)
  const glow = ctx.at('glow', 0, 0)
  const cut = ctx.at('cutout', 0, 0)
  const wallO = 6
  const H = 4.2
  const concrete = { tile: 'mConcrete' as TileName, color: 0xd8d2c6 }
  const stripe = { tile: 'mPaint' as TileName, color: 0xf08a30 }
  const corner = (a: number, o: number) => f.at(a, o)
  // Wall along the whole side plus the corner overlap.
  const [ax, az] = corner(start - wallO, wallO)
  const [bx, bz] = corner(start + len + wallO, wallO + 0.8)
  g.box(Math.min(ax, bx), 0, Math.min(az, bz), Math.max(ax, bx), H, Math.max(az, bz), concrete)
  const [sx, sz] = corner(start - wallO, wallO - 0.02)
  const [tx, tz] = corner(start + len + wallO, wallO + 0.82)
  g.box(Math.min(sx, tx), 1.2, Math.min(sz, tz), Math.max(sx, tx), 1.7, Math.max(sz, tz), stripe)
  g.box(
    Math.min(ax, bx) - 0.15,
    H,
    Math.min(az, bz) - 0.15,
    Math.max(ax, bx) + 0.15,
    H + 0.3,
    Math.max(az, bz) + 0.15,
    {
      tile: 'mConcrete',
      color: 0xb8b2a6
    }
  )
  // Banners on the inner face every ~15 m and wall lamps.
  for (let a = start + 7; a < start + len; a += 15) {
    const [x, z] = corner(a, wallO - 0.06)
    const [ix, iz] = facingIn(side)
    const [ex, ez] = alongVec(side)
    // Banner faces into the yard: e1 × up = inward.
    const fx = iz
    const fz = -ix
    cut.quad(x - fx * 0.7, 0.9, z - fz * 0.7, [fx * 1.4, 0, fz * 1.4], [0, 2.6, 0], {
      tile: 'mBanner',
      map: 'fit',
      fx: 0.2
    })
    glow.box(x - 0.15 + ex * 2, H - 0.5, z - 0.15 + ez * 2, x + 0.15 + ex * 2, H - 0.3, z + 0.15 + ez * 2, {
      tile: 'mWhite',
      color: 0xfff0c8,
      glow: 0.3 + ctx.night * 3
    })
  }
  // Watchtower at the start corner of each side (four sides → four corners).
  const [wx, wz] = corner(start - wallO + 2, wallO + 2)
  const leg = { tile: 'mMetal' as TileName, color: 0x7a8288 }
  for (const [dx, dz] of [
    [-1.4, -1.4],
    [1.4, -1.4],
    [-1.4, 1.4],
    [1.4, 1.4]
  ])
    g.box(wx + dx - 0.12, 0, wz + dz - 0.12, wx + dx + 0.12, 9, wz + dz + 0.12, leg)
  g.box(wx - 2, 9, wz - 2, wx + 2, 9.3, wz + 2, { tile: 'mPlanks', color: 0xb08a60 })
  g.box(wx - 2, 9.3, wz - 2, wx + 2, 10.4, wz + 2, { tile: 'mCrateArk', color: 0xffffff })
  g.box(wx - 2.3, 12, wz - 2.3, wx + 2.3, 12.3, wz + 2.3, { tile: 'mPaint', color: 0xf08a30 })
  for (const [dx, dz] of [
    [-1.9, -1.9],
    [1.9, 1.9]
  ])
    g.box(wx + dx - 0.08, 10.4, wz + dz - 0.08, wx + dx + 0.08, 12, wz + dz + 0.08, leg)
  glow.box(wx - 0.5, 10.6, wz - 0.5, wx + 0.5, 11.1, wz + 0.5, {
    tile: 'mWhite',
    color: 0xfff6d8,
    glow: 0.6 + ctx.night * 3,
    fx: 0.2
  })
  // Woods behind the wall: broadleaf and pines in two loose rows.
  for (let a = start - 10; a < start + len + 10; a += 5 + r() * 5) {
    for (const o of [12, 22]) {
      const [x, z] = corner(a + r() * 3, o + r() * 6)
      treeAt(ctx, x, z, r() < 0.4 ? 3 : 1, 1 + r() * 0.5)
    }
  }
}

function alongVec(side: Side): [number, number] {
  return side === 'n' || side === 's' ? [1, 0] : [0, 1]
}

function facingIn(side: Side): [number, number] {
  return side === 'n' ? [0, -1] : side === 's' ? [0, 1] : side === 'e' ? [-1, 0] : [1, 0]
}

/** Open sea out to the horizon beyond a water edge, with a breakwater line and a few distant ship silhouettes. */
function seaEdge(map: MapDef, side: Side, get: (mat: EnvMat, cell: string) => GeoBuilder) {
  const f = frame(map, side)
  const water = get('water', 'far')
  const far = get('far', 'far')
  const glow = get('glow', 'far')
  const R = 420
  const [ax, az] = f.at(f.from - R, 0)
  const [bx, bz] = f.at(f.to + R, R)
  const x0 = Math.min(ax, bx)
  const x1 = Math.max(ax, bx)
  const z0 = Math.min(az, bz)
  const z1 = Math.max(az, bz)
  water.quad(x0, -0.15, z1, [x1 - x0, 0, 0], [0, 0, z0 - z1], { tile: 'tWater', color: 0x9aa8b8 }, [
    x0 / 10,
    -z1 / 10,
    x1 / 10,
    -z0 / 10
  ])
  // Breakwater with a little lighthouse, and ships.
  const mid = (f.from + f.to) / 2
  const [bwx, bwz] = f.at(mid - 60, 70)
  const [bwx2, bwz2] = f.at(mid + 60, 74)
  far.box(Math.min(bwx, bwx2), -1, Math.min(bwz, bwz2), Math.max(bwx, bwx2), 1.6, Math.max(bwz, bwz2), {
    tile: 'mConcrete',
    color: 0xb0a89c
  })
  const [lx, lz] = f.at(mid + 60, 72)
  far.cylinder(lx, 1.6, lz, 1.4, 1.1, 9, 10, { tile: 'mPaint', color: 0xf2efe8 })
  far.cylinder(lx, 10.6, lz, 1.2, 0.2, 1.4, 10, { tile: 'mPaint', color: 0xc8463a })
  glow.blob(lx, 10.3, lz, 0.7, 0.5, 0.7, { tile: 'mWhite', color: 0xffe0a0, glow: 2.5, fx: 0.6 }, 1, 0)
  for (const [a, o, len, hull] of [
    [mid - 120, 160, 46, 0x3a4a5a],
    [mid + 40, 230, 70, 0x5a3a3a],
    [mid + 150, 120, 30, 0x40505a]
  ] as const) {
    const [sx, sz] = f.at(a, o)
    const [ex, ez] = alongVec(side)
    far.box(
      sx - (ex * len) / 2 - ez * 5,
      -0.5,
      sz - (ez * len) / 2 - ex * 5,
      sx + (ex * len) / 2 + ez * 5,
      4,
      sz + (ez * len) / 2 + ex * 5,
      {
        tile: 'mContainer',
        color: hull
      }
    )
    far.box(
      sx + (ex * len) / 4 - ez * 3,
      4,
      sz + (ez * len) / 4 - ex * 3,
      sx + (ex * len) / 4 + ex * 6 + ez * 3,
      11,
      sz + (ez * len) / 4 + ez * 6 + ex * 3,
      {
        tile: 'mPanel',
        color: 0xe8e4dc
      }
    )
    for (let k = -2; k <= 1; k++)
      far.box(
        sx + ex * k * 7 - ez * 4,
        4,
        sz + ez * k * 7 - ex * 4,
        sx + ex * (k * 7 + 6) + ez * 4,
        6.5,
        sz + ez * (k * 7 + 6) + ex * 4,
        {
          tile: 'mContainer',
          color: [0xc8453a, 0x3b6ea8, 0xe08a32, 0x4f8a4a][(k + 2) % 4]
        }
      )
  }
}

/** Ring of distant towers (or crystal spires / white blocks) that fade into the haze. */
function skyline(
  map: MapDef,
  theme: ThemeDef,
  ctx: EnvCtx,
  get: (mat: EnvMat) => GeoBuilder,
  r: () => number,
  sea: Set<Side>,
  range: boolean
) {
  const g = get('far')
  const glow = get('glow')
  const [bx0, bz0] = map.bounds.min
  const [bx1, bz1] = map.bounds.max
  const cx = (bx0 + bx1) / 2
  const cz = (bz0 + bz1) / 2
  const rx = (bx1 - bx0) / 2
  const rz = (bz1 - bz0) / 2
  const n = 64
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.06
    const sx = Math.sin(a)
    const sz = Math.cos(a)
    // Skip the sea side (the horizon stays open there).
    if (
      (sea.has('e') && sx > 0.55) ||
      (sea.has('w') && sx < -0.55) ||
      (sea.has('n') && sz > 0.55) ||
      (sea.has('s') && sz < -0.55)
    )
      continue
    const dist = (range ? 150 : 75) + r() * 110
    const x = cx + sx * (rx + dist)
    const z = cz + sz * (rz + dist)
    const w = 10 + r() * 16
    const d = 10 + r() * 14
    const h = range ? 12 + r() * 20 : 22 + r() * 50
    if (theme.id === 'blight' && r() < 0.5) {
      const len = 30 + r() * 60
      g.cylinder(x, 0, z, 4 + r() * 4, 0.3, len, 6, { tile: 'mCrystal', glow: 1.1 * ctx.accent }, false)
      continue
    }
    const tile: TileName =
      theme.id === 'virtual' ? 'fVirtual' : theme.id === 'blight' ? 'fBlight' : r() < 0.5 ? 'fRuin' : 'fOffice'
    const glowK = theme.id === 'virtual' ? 1.2 : theme.id === 'blight' ? 1 : 2.2 * ctx.night
    const col = theme.id === 'virtual' ? 0xffffff : mix(0xc8c8c8, 0xe6e6e6, r())
    const side = { tile, color: col, glow: glowK, offset: [Math.floor(r() * 4) / 2, 0] as [number, number] }
    g.box(x - w / 2, 0, z - d / 2, x + w / 2, h, z + d / 2, {
      px: side,
      nx: side,
      pz: side,
      nz: side,
      py: { tile: 'rConcrete', color: 0xb0b0b0 }
    })
    // Stepped crowns and broken tops so the silhouette is not a row of boxes.
    if (r() < 0.55) {
      const k = 0.5 + r() * 0.25
      g.box(x - (w * k) / 2, h, z - (d * k) / 2, x + (w * k) / 2, h + 4 + r() * 10, z + (d * k) / 2, side)
    }
    if (theme.id === 'virtual')
      glow.box(x - w / 2 - 0.1, h - 0.1, z - d / 2 - 0.1, x + w / 2 + 0.1, h + 0.1, z + d / 2 + 0.1, {
        tile: 'mWhite',
        color: 0x4fe6ff,
        glow: 1.8 * ctx.accent
      })
    else if (ctx.overgrowth && r() < 0.4)
      g.blob(x, h + 2, z, 4, 3, 4, { tile: 'mLeaves', color: theme.id === 'blight' ? 0x7a4a9a : 0x6f9a4a }, 1, 0.2, i)
  }
}

/** Low soft hills on the horizon (not in the arena), very hazed. */
function hills(map: MapDef, theme: ThemeDef, get: (mat: EnvMat) => GeoBuilder, r: () => number, sea: Set<Side>) {
  if (theme.id === 'virtual') return
  const g = get('far')
  const [bx0, bz0] = map.bounds.min
  const [bx1, bz1] = map.bounds.max
  const cx = (bx0 + bx1) / 2
  const cz = (bz0 + bz1) / 2
  const R = Math.max(bx1 - bx0, bz1 - bz0) / 2 + 240
  const color =
    theme.id === 'blight' ? 0x4a3060 : theme.id === 'sunset' ? 0x8a6a7a : theme.id === 'night' ? 0x2a3450 : 0x7f9e86
  const n = 22
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.1
    const sx = Math.sin(a)
    const sz = Math.cos(a)
    if (
      (sea.has('e') && sx > 0.3) ||
      (sea.has('w') && sx < -0.3) ||
      (sea.has('n') && sz > 0.3) ||
      (sea.has('s') && sz < -0.3)
    )
      continue
    const rad = 60 + r() * 70
    g.blob(
      cx + Math.sin(a) * R,
      -8,
      cz + Math.cos(a) * R,
      rad,
      18 + r() * 26,
      rad * 0.7,
      { tile: theme.id === 'blight' ? 'mRock' : 'mLeaves', color: shade(color, 0.9 + r() * 0.2) },
      2,
      0.14,
      i * 3.1 + hash01(i, 1, 2),
      true
    )
  }
}

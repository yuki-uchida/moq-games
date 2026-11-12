/**
 * Visuals for every non-building MapBox kind/style (BOX_STYLES in src/data/map-vocab.ts). Pure planning.
 */
import * as THREE from 'three'
import type { MapBox } from '../../sim/types'
import type { TileName } from './atlas'
import { buildBuilding, crystalCluster, hip, prism } from './buildings'
import { hash01, type EnvCtx } from './ctx'
import type { GeoBuilder, Surf } from './geo'

/** Chunk-sized pieces of large flat tops so culling stays effective. */
const SPLIT = 32

export function buildBox(b: MapBox, ctx: EnvCtx) {
  const style = b.style ?? 0
  switch (b.kind) {
    case 'barrier':
      return
    case 'building':
      return buildBuilding(b, ctx)
    case 'ground':
      return ground(b, ctx, style)
    case 'road':
      return road(b, ctx, style)
    case 'roof':
      return roof(b, ctx, style)
    case 'wall':
      return wall(b, ctx, style)
    case 'platform':
      return platform(b, ctx, style)
    case 'stairs':
      return stairs(b, ctx, style)
    case 'crate':
      return crate(b, ctx, style)
    case 'container':
      return container(b, ctx, style)
    case 'car':
      return car(b, ctx, style)
    case 'rock':
      return rock(b, ctx, style)
    case 'crystal':
      return crystal(b, ctx, style)
    case 'tree':
      return tree(b, ctx, style)
    case 'fence':
      return fence(b, ctx, style)
    case 'pillar':
      return pillar(b, ctx, style)
  }
}

const centre = (b: MapBox): [number, number] => [(b.min[0] + b.max[0]) / 2, (b.min[2] + b.max[2]) / 2]

/** Top face split into SPLIT-sized tiles (each goes to its own chunk); sides only when the slab is thick. */
function slab(b: MapBox, ctx: EnvCtx, top: Surf, side: Surf | null, mat: 'atlas' | 'water' = 'atlas') {
  const [x0, y0, z0] = b.min
  const [x1, y1, z1] = b.max
  for (let x = x0; x < x1 - 1e-3; x += SPLIT) {
    const xe = Math.min(x1, x + SPLIT)
    for (let z = z0; z < z1 - 1e-3; z += SPLIT) {
      const ze = Math.min(z1, z + SPLIT)
      const g = ctx.at(mat, (x + xe) / 2, (z + ze) / 2)
      // World-anchored UVs so neighbouring pieces line up.
      g.quad(x, y1, ze, [xe - x, 0, 0], [0, 0, z - ze], top, uvWorld(top.tile, x, ze, xe, z, top.scale))
    }
  }
  if (side && y1 - y0 > 0.06) {
    const [cx, cz] = centre(b)
    ctx.at('atlas', cx, cz).box(x0, y0, z0, x1, y1, z1, { px: side, nx: side, pz: side, nz: side })
  }
}

const TILE_M: Partial<Record<TileName, number>> = {
  tGrass: 6,
  tConcrete: 5,
  tDirt: 6,
  tPlaza: 4,
  tDock: 4,
  tCrystal: 6,
  tVirtual: 8,
  tWater: 10,
  tAsphalt: 8,
  tSidewalk: 3,
  tCrosswalk: 4,
  tRail: 4,
  rConcrete: 6,
  rTile: 3,
  rMetal: 4,
  rVirtual: 6,
  mPlanks: 2,
  mGrating: 2,
  mConcrete: 4
}

function uvWorld(tile: TileName, xa: number, za: number, xb: number, zb: number, scale = 1) {
  const m = (TILE_M[tile] ?? 4) / scale
  return [xa / m, -za / m, xb / m, -zb / m] as const
}

const GROUND: { tile: TileName; side: TileName; color: number; glow?: number }[] = [
  { tile: 'tGrass', side: 'tDirt', color: 0xffffff },
  { tile: 'tConcrete', side: 'mConcrete', color: 0xffffff },
  { tile: 'tDirt', side: 'tDirt', color: 0xffffff },
  { tile: 'tPlaza', side: 'mConcrete', color: 0xffffff },
  { tile: 'tDock', side: 'mPlanks', color: 0xffffff },
  { tile: 'tCrystal', side: 'mRock', color: 0xffffff, glow: 0.9 },
  { tile: 'tVirtual', side: 'mPanel', color: 0xffffff, glow: 1 },
  { tile: 'tWater', side: 'mConcrete', color: 0xffffff }
]

function ground(b: MapBox, ctx: EnvCtx, style: number) {
  const def = GROUND[style] ?? GROUND[0]
  if (style === 7) {
    slab(b, ctx, { tile: 'tWater', color: 0xffffff }, null, 'water')
    return
  }
  slab(
    b,
    ctx,
    { tile: def.tile, color: def.color, glow: (def.glow ?? 0) * ctx.accent },
    { tile: def.side, color: 0xd8d2c6 }
  )
  // Scattered grass tufts and flowers on grass; pebbles on dirt.
  const [x0, y0, z0] = b.min
  const [x1, y1, z1] = b.max
  void y0
  if (style === 0 && ctx.overgrowth) {
    // Clumps of tufts (and some flowers) rather than an even sprinkle.
    const n = Math.min(2400, Math.round((x1 - x0) * (z1 - z0) * 0.07 * ctx.density))
    let clumpX = 0
    let clumpZ = 0
    for (let i = 0; i < n; i++) {
      if (i % 6 === 0) {
        clumpX = x0 + (x1 - x0) * ctx.rand()
        clumpZ = z0 + (z1 - z0) * ctx.rand()
      }
      const x = Math.min(x1, Math.max(x0, clumpX + (ctx.rand() - 0.5) * 2.4))
      const z = Math.min(z1, Math.max(z0, clumpZ + (ctx.rand() - 0.5) * 2.4))
      const flower = ctx.rand() < 0.1
      if (ctx.covered(x, z, y1)) continue
      ctx.at('cutout', x, z).cross(
        x,
        y1,
        z,
        flower ? 0.5 : 0.8,
        flower ? 0.4 : 0.5,
        {
          tile: flower ? 'mFlowers' : 'mGrass',
          color: flower ? 0xffffff : 0xe0f0b0,
          fx: 1
        },
        2,
        ctx.rand() * 3
      )
    }
  }
}

function road(b: MapBox, ctx: EnvCtx, style: number) {
  const [x0, , z0] = b.min
  const [x1, y1, z1] = b.max
  const alongX = x1 - x0 >= z1 - z0
  if (style === 1) {
    slab(b, ctx, { tile: 'tSidewalk', color: 0xffffff }, { tile: 'mConcrete', color: 0xc9c4ba })
    return
  }
  if (style === 2) {
    // Crosswalk: stripes run across the long axis.
    const [cx, cz] = centre(b)
    const g = ctx.at('atlas', cx, cz)
    if (alongX)
      g.quad(x0, y1, z1, [x1 - x0, 0, 0], [0, 0, z0 - z1], { tile: 'tCrosswalk' }, [0, 0, (x1 - x0) / 4, (z1 - z0) / 4])
    else
      g.quad(x1, y1, z1, [0, 0, z0 - z1], [x0 - x1, 0, 0], { tile: 'tCrosswalk' }, [0, 0, (z1 - z0) / 4, (x1 - x0) / 4])
    return
  }
  if (style === 3) {
    slab(b, ctx, { tile: 'tDirt', color: 0xb8aea0 }, null)
    railway(b, ctx, alongX)
    return
  }
  slab(b, ctx, { tile: 'tAsphalt', color: 0xffffff }, null)
  laneMarks(b, ctx, alongX)
  // Weeds in the cracks.
  if (ctx.overgrowth) {
    const n = Math.round((x1 - x0) * (z1 - z0) * 0.008 * ctx.density)
    for (let i = 0; i < n; i++) {
      const x = x0 + (x1 - x0) * ctx.rand()
      const z = z0 + (z1 - z0) * ctx.rand()
      if (ctx.covered(x, z, y1)) continue
      ctx.at('cutout', x, z).cross(x, y1, z, 0.6, 0.35, { tile: 'mGrass', color: 0xc8dc98, fx: 1 }, 2, ctx.rand() * 3)
    }
  }
}

/** Dashed centre line and solid edge lines along the long axis (worn paint, cutout). */
function laneMarks(b: MapBox, ctx: EnvCtx, alongX: boolean) {
  const [x0, , z0] = b.min
  const [x1, y1, z1] = b.max
  const y = y1 + 0.015
  const width = alongX ? z1 - z0 : x1 - x0
  if (width < 5) return
  const len = alongX ? x1 - x0 : z1 - z0
  const paint: Surf = { tile: 'mPaint', color: 0xf2efe4 }
  const yellow: Surf = { tile: 'mPaint', color: 0xf2c14a }
  const mid = alongX ? (z0 + z1) / 2 : (x0 + x1) / 2
  const start = alongX ? x0 : z0
  for (let t = 1; t < len - 3; t += 6) {
    const a = start + t
    const g = alongX ? ctx.at('cutout', a, mid) : ctx.at('cutout', mid, a)
    if (alongX) g.quad(a, y, mid + 0.08, [3, 0, 0], [0, 0, -0.16], yellow, [0, 0, 1, 1])
    else g.quad(mid - 0.08, y, a + 3, [0, 0, -3], [0.16, 0, 0], yellow, [0, 0, 1, 1])
  }
  for (let t = 0; t < len - 1e-3; t += SPLIT) {
    const seg = Math.min(SPLIT, len - t)
    const a = start + t
    for (const e of [0.5, width - 0.5]) {
      const off = (alongX ? z0 : x0) + e
      const g = alongX ? ctx.at('cutout', a + seg / 2, off) : ctx.at('cutout', off, a + seg / 2)
      if (alongX) g.quad(a, y, off + 0.07, [seg, 0, 0], [0, 0, -0.14], paint, [0, 0, seg / 3, 1])
      else g.quad(off - 0.07, y, a + seg, [0, 0, -seg], [0.14, 0, 0], paint, [0, 0, seg / 3, 1])
    }
  }
}

function railway(b: MapBox, ctx: EnvCtx, alongX: boolean) {
  const [x0, , z0] = b.min
  const [x1, y1, z1] = b.max
  const len = alongX ? x1 - x0 : z1 - z0
  const mid = alongX ? (z0 + z1) / 2 : (x0 + x1) / 2
  const start = alongX ? x0 : z0
  const sleeper: Surf = { tile: 'mPlanks', color: 0x6b5442 }
  const rail: Surf = { tile: 'mRust', color: 0x8a7a6a }
  for (let t = 0.4; t < len; t += 0.8) {
    const a = start + t
    const g = alongX ? ctx.at('atlas', a, mid) : ctx.at('atlas', mid, a)
    if (alongX) g.box(a - 0.14, y1, mid - 1.2, a + 0.14, y1 + 0.12, mid + 1.2, sleeper)
    else g.box(mid - 1.2, y1, a - 0.14, mid + 1.2, y1 + 0.12, a + 0.14, sleeper)
  }
  for (let t = 0; t < len - 1e-3; t += SPLIT) {
    const seg = Math.min(SPLIT, len - t)
    const a = start + t
    for (const o of [-0.72, 0.72]) {
      const g = alongX ? ctx.at('atlas', a + seg / 2, mid) : ctx.at('atlas', mid, a + seg / 2)
      if (alongX) g.box(a, y1 + 0.12, mid + o - 0.05, a + seg, y1 + 0.26, mid + o + 0.05, rail)
      else g.box(mid + o - 0.05, y1 + 0.12, a, mid + o + 0.05, y1 + 0.26, a + seg, rail)
    }
  }
}

function roof(b: MapBox, ctx: EnvCtx, style: number) {
  const [x0, y0, z0] = b.min
  const [x1, y1, z1] = b.max
  const [cx, cz] = centre(b)
  const g = ctx.at('atlas', cx, cz)
  if (style === 1) {
    const rise = Math.min(y1 - y0, Math.min(x1 - x0, z1 - z0) * 0.35)
    g.box(x0, y0, z0, x1, y1 - rise, z1, { tile: 'mPlanks', color: 0x6a4a36 })
    hip(g, x0 - 0.3, z0 - 0.3, x1 + 0.3, z1 + 0.3, y1 - rise, rise, { tile: 'rTile', color: 0x8a9aa8 })
    return
  }
  const top: TileName = style === 2 ? 'rMetal' : style === 3 ? 'rVirtual' : 'rConcrete'
  slab(
    b,
    ctx,
    { tile: top, glow: style === 3 ? ctx.accent : 0 },
    { tile: style === 3 ? 'mWhite' : 'mConcrete', color: 0xd0cbc2 }
  )
  if (style === 0) {
    const t = 0.22
    const s: Surf = { tile: 'mConcrete', color: 0xc8c2b8 }
    g.box(x0, y1, z0, x1, y1 + 0.6, z0 + t, s)
    g.box(x0, y1, z1 - t, x1, y1 + 0.6, z1, s)
    g.box(x0, y1, z0 + t, x0 + t, y1 + 0.6, z1 - t, s)
    g.box(x1 - t, y1, z0 + t, x1, y1 + 0.6, z1 - t, s)
  }
  if (style === 3) edges(b, ctx)
}

const WALLS: { tile: TileName; color: number; top?: TileName }[] = [
  { tile: 'mConcrete', color: 0xd4cfc6 },
  { tile: 'mBrick', color: 0xffffff },
  { tile: 'mSandbag', color: 0xffffff },
  { tile: 'mPlanks', color: 0xb08a66 },
  { tile: 'mPanel', color: 0xffffff },
  { tile: 'mCrystal', color: 0xffffff }
]

function wall(b: MapBox, ctx: EnvCtx, style: number) {
  const def = WALLS[style] ?? WALLS[0]
  const [x0, y0, z0] = b.min
  const [x1, y1, z1] = b.max
  const [cx, cz] = centre(b)
  if (style === 5) {
    // Crystal wall: a row of fused prisms.
    const alongX = x1 - x0 >= z1 - z0
    const len = alongX ? x1 - x0 : z1 - z0
    const g = ctx.at('atlas', cx, cz)
    g.box(x0 + 0.1, y0, z0 + 0.1, x1 - 0.1, y1 * 0.7 + y0 * 0.3, z1 - 0.1, { tile: 'mCrystal', glow: 0.8 * ctx.accent })
    for (let t = 0.5; t < len; t += 1.1) {
      const x = alongX ? x0 + t : cx
      const z = alongX ? cz : z0 + t
      prism(
        g,
        x,
        y0,
        z,
        hash01(x, z, 1) * 6,
        0.15 * (hash01(z, x, 2) - 0.5),
        (y1 - y0) * (0.85 + hash01(x, z, 3) * 0.3),
        0.55,
        {
          tile: 'mCrystal',
          glow: 1.2 * ctx.accent
        }
      )
    }
    return
  }
  const g = ctx.at('atlas', cx, cz)
  g.aoHeight = style === 2 ? 0 : 2
  g.box(x0, y0, z0, x1, y1, z1, { tile: def.tile, color: def.color, glow: style === 4 ? ctx.accent * 0.6 : 0 })
  g.aoHeight = 0
  if (style === 0 || style === 1) {
    // Coping on top.
    g.box(x0 - 0.05, y1, z0 - 0.05, x1 + 0.05, y1 + 0.12, z1 + 0.05, { tile: 'mConcrete', color: 0xbdb7ad })
  }
  if (style === 2) {
    // ARK sandbags: a lumpy top row.
    const alongX = x1 - x0 >= z1 - z0
    const len = alongX ? x1 - x0 : z1 - z0
    for (let t = 0.35; t < len; t += 0.7)
      g.blob(alongX ? x0 + t : cx, y1, alongX ? cz : z0 + t, 0.38, 0.16, 0.3, { tile: 'mSandbag' }, 1, 0.1, t)
  }
  if (style === 4) edges(b, ctx)
  if (ctx.overgrowth && (style === 0 || style === 1) && hash01(x0, z0, y1) < 0.5) {
    const alongX = x1 - x0 >= z1 - z0
    const cut = ctx.at('cutout', cx, cz)
    const w = Math.min(alongX ? x1 - x0 : z1 - z0, 2.5)
    const h = y1 - y0
    if (alongX)
      cut.quad(cx - w / 2, y1, z1 + 0.03, [w, 0, 0], [0, -h, 0], { tile: 'mIvy', fx: 0.08 }, [0, 0, w / 2, h / 2])
    else cut.quad(x1 + 0.03, y1, cz + w / 2, [0, 0, -w], [0, -h, 0], { tile: 'mIvy', fx: 0.08 }, [0, 0, w / 2, h / 2])
  }
}

function platform(b: MapBox, ctx: EnvCtx, style: number) {
  const [x0, y0, z0] = b.min
  const [x1, y1, z1] = b.max
  const [cx, cz] = centre(b)
  const g = ctx.at('atlas', cx, cz)
  if (style === 2) {
    // Grating deck on a steel frame.
    const cut = ctx.at('cutout', cx, cz)
    cut.quad(
      x0,
      y1,
      z1,
      [x1 - x0, 0, 0],
      [0, 0, z0 - z1],
      { tile: 'mGrating', color: 0xb0b8bc },
      uvWorld('mGrating', x0, z1, x1, z0)
    )
    const f: Surf = { tile: 'mMetal', color: 0x6d7a80 }
    g.box(x0, y1 - 0.18, z0, x1, y1 - 0.02, z0 + 0.12, f)
    g.box(x0, y1 - 0.18, z1 - 0.12, x1, y1 - 0.02, z1, f)
    g.box(x0, y1 - 0.18, z0, x0 + 0.12, y1 - 0.02, z1, f)
    g.box(x1 - 0.12, y1 - 0.18, z0, x1, y1 - 0.02, z1, f)
    return
  }
  const top: TileName = style === 1 ? 'mPlanks' : style === 3 ? 'rVirtual' : 'mConcrete'
  const side: TileName = style === 1 ? 'mPlanks' : style === 3 ? 'mWhite' : 'mConcrete'
  slab(
    b,
    ctx,
    { tile: top, color: style === 1 ? 0xc8a07a : 0xffffff, glow: style === 3 ? ctx.accent : 0 },
    {
      tile: side,
      color: style === 1 ? 0x8a6a4c : 0xc9c4ba
    }
  )
  g.box(x0, y0, z0, x1, y1, z1, { ny: { tile: side, color: 0x9a948a } })
  if (style === 3) edges(b, ctx)
}

/** Steps rising along the long axis towards its positive end. */
function stairs(b: MapBox, ctx: EnvCtx, style: number) {
  const [x0, y0, z0] = b.min
  const [x1, y1, z1] = b.max
  const [cx, cz] = centre(b)
  const g = ctx.at('atlas', cx, cz)
  const tile: TileName = style === 1 ? 'mPlanks' : style === 2 ? 'mMetal' : style === 3 ? 'mWhite' : 'mConcrete'
  const s: Surf = {
    tile,
    color: style === 1 ? 0xb08a66 : style === 2 ? 0x8a969c : 0xd2ccc2,
    glow: style === 3 ? ctx.accent * 0.4 : 0
  }
  const h = y1 - y0
  const n = Math.max(2, Math.round(h / 0.3))
  const alongX = x1 - x0 >= z1 - z0
  const len = alongX ? x1 - x0 : z1 - z0
  for (let i = 0; i < n; i++) {
    const ya = y0 + (h * (i + 1)) / n
    const a = (len * i) / n
    if (alongX) g.box(x0 + a, y0, z0, x1, ya, z1, s)
    else g.box(x0, y0, z0 + a, x1, ya, z1, s)
  }
  if (style === 3) edges(b, ctx)
}

function crate(b: MapBox, ctx: EnvCtx, style: number) {
  const [x0, y0, z0] = b.min
  const [x1, y1, z1] = b.max
  const [cx, cz] = centre(b)
  const tile: TileName = style === 1 ? 'mCrateMetal' : style === 2 ? 'mCrateArk' : 'mCrateWood'
  ctx.at('atlas', cx, cz).box(x0, y0, z0, x1, y1, z1, { tile, map: 'fit' })
}

const CONTAINER_COLORS = [0xc8453a, 0x3b6ea8, 0x4f8a4a, 0xe08a32, 0xe6e6e0, 0x8a5a3c]

function container(b: MapBox, ctx: EnvCtx, style: number) {
  const [x0, y0, z0] = b.min
  const [x1, y1, z1] = b.max
  const [cx, cz] = centre(b)
  const g = ctx.at('atlas', cx, cz)
  const color = CONTAINER_COLORS[style] ?? CONTAINER_COLORS[0]
  const side: Surf = { tile: 'mContainer', color }
  const door: Surf = { tile: 'mContainerDoor', color, map: 'fit' }
  const alongX = x1 - x0 >= z1 - z0
  if (alongX)
    g.box(x0, y0, z0, x1, y1, z1, {
      pz: side,
      nz: side,
      py: { tile: 'mContainer', color, scale: 0.6 },
      px: door,
      nx: door
    })
  else
    g.box(x0, y0, z0, x1, y1, z1, {
      px: side,
      nx: side,
      py: { tile: 'mContainer', color, scale: 0.6 },
      pz: door,
      nz: door
    })
  // Corner castings.
  const c: Surf = { tile: 'mMetal', color: 0x555555 }
  for (const x of [x0, x1 - 0.18])
    for (const z of [z0, z1 - 0.18]) {
      g.box(x, y1 - 0.15, z, x + 0.18, y1 + 0.02, z + 0.18, c)
      g.box(x, y0, z, x + 0.18, y0 + 0.15, z + 0.18, c)
    }
}

const _rx = new THREE.Matrix4()
const CAR_COLORS = [0xb0543f, 0x6f8fa6, 0xd8b44a, 0x7c9a6a, 0xc9c4b8, 0x9a6a8a]

function car(b: MapBox, ctx: EnvCtx, style: number) {
  const [x0, y0, z0] = b.min
  const [x1, y1, z1] = b.max
  const [cx, cz] = centre(b)
  const g = ctx.at('atlas', cx, cz)
  const alongX = x1 - x0 >= z1 - z0
  const L = alongX ? x1 - x0 : z1 - z0
  const W = alongX ? z1 - z0 : x1 - x0
  const H = y1 - y0
  const color = CAR_COLORS[Math.floor(hash01(x0, z0, y0) * CAR_COLORS.length)]
  // Build in a local frame (x along length, z across), then rotate onto the box.
  g.matrix.makeRotationY(alongX ? 0 : Math.PI / 2)
  g.matrix.setPosition(cx, y0, cz)
  const paint: Surf = { tile: 'mCarPaint', color: style === 2 ? 0xe2d6a8 : color }
  const glass: Surf = { tile: 'mGlass', color: 0xffffff, map: 'fit', glow: ctx.night * 0.1 }
  const dark: Surf = { tile: 'mTire', color: 0x444444 }
  const l = L / 2
  const w = W / 2
  const wheelR = Math.min(0.42, H * 0.28)
  const bodyLow = wheelR * 0.8
  if (style === 2) {
    // Bus: tall box, window band, sunken on flat tyres.
    g.box(-l, bodyLow, -w, l, H * 0.98, w, paint)
    g.box(-l + 0.3, H * 0.55, -w - 0.01, l - 0.3, H * 0.85, w + 0.01, { pz: glass, nz: glass })
    g.box(l - 0.01, H * 0.5, -w + 0.2, l + 0.01, H * 0.85, w - 0.2, { px: glass })
  } else if (style === 1) {
    // Van.
    g.box(-l, bodyLow, -w, l, H * 0.95, w, paint)
    g.box(l * 0.45, H * 0.55, -w - 0.01, l - 0.05, H * 0.88, w + 0.01, { pz: glass, nz: glass })
    g.box(l - 0.02, H * 0.55, -w + 0.15, l + 0.01, H * 0.88, w - 0.15, { px: glass })
  } else if (style === 3) {
    // Small truck: cab + open bed.
    g.box(l * 0.25, bodyLow, -w, l, H * 0.95, w, paint)
    g.box(l * 0.3, H * 0.55, -w - 0.01, l - 0.1, H * 0.85, w + 0.01, { pz: glass, nz: glass, px: glass })
    g.box(-l, bodyLow, -w, l * 0.22, H * 0.45, w, { tile: 'mRust', color: 0xa08a70 })
    g.box(-l, H * 0.45, -w, l * 0.22, H * 0.62, -w + 0.08, { tile: 'mRust', color: 0xa08a70 })
    g.box(-l, H * 0.45, w - 0.08, l * 0.22, H * 0.62, w, { tile: 'mRust', color: 0xa08a70 })
  } else {
    // Sedan: body + rounded cabin.
    g.box(-l, bodyLow, -w, l, H * 0.52, w, paint)
    g.box(-l * 0.55, H * 0.52, -w * 0.9, l * 0.35, H * 0.96, w * 0.9, {
      px: glass,
      nx: glass,
      pz: glass,
      nz: glass,
      py: paint
    })
  }
  // Wheels.
  for (const sx of [-l + wheelR * 1.4, l - wheelR * 1.4])
    for (const sz of [-w + 0.12, w - 0.12]) {
      g.matrix.makeRotationY(alongX ? 0 : Math.PI / 2)
      g.matrix.multiply(_rx.makeRotationX(Math.PI / 2))
      g.matrix.setPosition(alongX ? cx + sx : cx + sz, y0 + wheelR * 0.8, alongX ? cz + sz : cz - sx)
      g.cylinder(0, -0.13, 0, wheelR, wheelR, 0.26, 10, dark)
    }
  g.identity()
  // Rust patches and a moss tuft on the roof for abandoned cars.
  if (ctx.overgrowth && style !== 2) {
    const cut = ctx.at('cutout', cx, cz)
    cut.cross(cx, y1, cz, 0.7, 0.35, { tile: 'mGrass', color: 0xc8dc98, fx: 1 }, 2, hash01(cx, cz, 1) * 3)
  }
}

function rock(b: MapBox, ctx: EnvCtx, style: number) {
  const [x0, y0, z0] = b.min
  const [x1, y1, z1] = b.max
  const [cx, cz] = centre(b)
  const g = ctx.at('atlas', cx, cz)
  const seed = hash01(x0, y0, z0)
  if (style === 1) {
    // Rubble pile: several lumps and broken slabs.
    const n = 5
    for (let i = 0; i < n; i++) {
      const t = i / n
      const x = x0 + (x1 - x0) * (0.2 + 0.6 * hash01(i, seed, 1))
      const z = z0 + (z1 - z0) * (0.2 + 0.6 * hash01(seed, i, 2))
      const r = Math.min(x1 - x0, z1 - z0) * (0.22 + 0.15 * hash01(i, 3, seed))
      g.blob(
        x,
        y0 + r * 0.3,
        z,
        r,
        (y1 - y0) * (0.6 - t * 0.3),
        r,
        { tile: 'mRubble', color: 0xc0b8ac },
        1,
        0.3,
        seed * 9 + i
      )
    }
    g.matrix.makeRotationZ(0.35).setPosition(cx, y0 + (y1 - y0) * 0.45, cz)
    g.box(-1, -0.12, -0.7, 1, 0.12, 0.7, { tile: 'mConcrete', color: 0xb0aaa0 })
    g.identity()
    return
  }
  g.blob(
    cx,
    y0 + (y1 - y0) * 0.45,
    cz,
    (x1 - x0) * 0.55,
    (y1 - y0) * 0.58,
    (z1 - z0) * 0.55,
    { tile: 'mRock', color: 0xd0cabe },
    2,
    0.16,
    seed * 7
  )
  if (ctx.overgrowth) {
    const cut = ctx.at('cutout', cx, cz)
    cut.quad(x0, y1 + 0.02, z1, [x1 - x0, 0, 0], [0, 0, z0 - z1], { tile: 'mMoss', color: 0xb8d090 }, [0, 0, 1, 1])
  }
}

function crystal(b: MapBox, ctx: EnvCtx, style: number) {
  const [x0, y0, z0] = b.min
  const [x1, y1, z1] = b.max
  const [cx, cz] = centre(b)
  const size = Math.min(x1 - x0, z1 - z0)
  const h = y1 - y0
  if (style === 1) {
    const g = ctx.at('atlas', cx, cz)
    prism(g, cx, y0, cz, 0, 0.04, h, size * 0.42, { tile: 'mCrystal', glow: 1.4 * ctx.accent })
    for (let i = 0; i < 4; i++)
      prism(g, cx, y0, cz, (i / 4) * Math.PI * 2 + 0.4, 0.5, h * 0.35, size * 0.16, {
        tile: 'mCrystal',
        glow: 1.2 * ctx.accent
      })
    ctx
      .at('glow', cx, cz)
      .blob(
        cx,
        y0 + h * 0.5,
        cz,
        size * 0.12,
        h * 0.35,
        size * 0.12,
        { tile: 'mWhite', color: 0xd28cff, glow: 2.2 * ctx.accent, fx: 0.3 },
        1,
        0
      )
    return
  }
  if (style === 2) {
    // Organic growth: lumpy flesh mounds with pulsing glowing pods.
    const g = ctx.at('atlas', cx, cz)
    const seed = hash01(x0, y0, z0)
    g.blob(
      cx,
      y0,
      cz,
      (x1 - x0) * 0.55,
      h,
      (z1 - z0) * 0.55,
      { tile: 'mFlesh', color: 0xffffff, glow: 0.4 * ctx.accent },
      2,
      0.25,
      seed * 11
    )
    const glow = ctx.at('glow', cx, cz)
    for (let i = 0; i < 5; i++) {
      const a = hash01(i, seed, 1) * Math.PI * 2
      const r = size * 0.45
      glow.blob(
        cx + Math.sin(a) * r,
        y0 + h * (0.3 + 0.4 * hash01(seed, i, 2)),
        cz + Math.cos(a) * r,
        0.28,
        0.34,
        0.28,
        {
          tile: 'mWhite',
          color: 0xff7ad9,
          glow: 2 * ctx.accent,
          fx: 0.6
        },
        1,
        0.1,
        i
      )
    }
    return
  }
  crystalCluster(ctx, cx, y0, cz, Math.max(size, h) * 0.9, hash01(x0, z0, 5) * 100)
}

function tree(b: MapBox, ctx: EnvCtx, style: number) {
  const [x0, y0, z0] = b.min
  const [x1, y1, z1] = b.max
  const [cx, cz] = centre(b)
  const h = Math.max(3, y1 - y0)
  const trunkR = Math.max(0.2, Math.min(x1 - x0, z1 - z0) * 0.45)
  const seed = hash01(x0, y0, z0)
  const g = ctx.at('atlas', cx, cz)
  const foliage = ctx.at('foliage', cx, cz)
  if (style === 4) {
    // Virtual tree: white trunk, faceted crown with a glowing core.
    g.cylinder(cx, y0, cz, trunkR, trunkR * 0.7, h * 0.55, 8, { tile: 'mWhite' })
    foliage.blob(
      cx,
      y0 + h * 0.7,
      cz,
      h * 0.3,
      h * 0.32,
      h * 0.3,
      { tile: 'mWhite', color: 0xd8f6ff, glow: 0.5 * ctx.accent, fx: 0.15 },
      1,
      0
    )
    ctx
      .at('glow', cx, cz)
      .blob(
        cx,
        y0 + h * 0.7,
        cz,
        h * 0.12,
        h * 0.12,
        h * 0.12,
        { tile: 'mWhite', color: 0x58e8ff, glow: 2 * ctx.accent },
        1,
        0
      )
    return
  }
  const bark: Surf = { tile: 'mBark', color: style === 0 ? 0x9a7468 : style === 2 ? 0x9a9288 : 0xa88a6c }
  // Flared root, trunk and a slight lean.
  const lean = (seed - 0.5) * 0.4
  g.cylinder(cx, y0, cz, trunkR * 1.7, trunkR * 1.05, 0.5, 9, bark, false)
  g.tube([cx, y0 + 0.4, cz], [cx + lean, y0 + h * 0.58, cz + lean * 0.5], trunkR, bark, 0, 1, 8)
  // Branches.
  const branches = style === 2 ? 6 : 4
  for (let i = 0; i < branches; i++) {
    const a = seed * 6 + (i / branches) * Math.PI * 2
    const by = y0 + h * (0.42 + 0.18 * hash01(i, seed, 1))
    const reach = h * (style === 2 ? 0.34 : 0.24)
    const tip = [cx + Math.sin(a) * reach, by + reach * 0.85, cz + Math.cos(a) * reach]
    g.tube([cx + lean * 0.7, by, cz + lean * 0.35], tip, trunkR * 0.42, bark, 0, 1, 6)
    if (style === 2)
      g.tube(
        tip,
        [tip[0] + Math.sin(a + 0.8) * reach * 0.4, tip[1] + reach * 0.4, tip[2] + Math.cos(a + 0.8) * reach * 0.4],
        trunkR * 0.2,
        bark,
        0,
        1,
        4
      )
  }
  if (style === 2) {
    g.tube([cx + lean, y0 + h * 0.58, cz + lean * 0.5], [cx + 0.2, y0 + h, cz - 0.1], trunkR * 0.5, bark, 0, 1, 6)
    return
  }
  if (style === 3) {
    // Pine: stacked soft cones.
    for (let i = 0; i < 4; i++) {
      const yb = y0 + h * (0.28 + i * 0.16)
      const r = h * (0.3 - i * 0.055)
      foliage.cylinder(
        cx,
        yb,
        cz,
        r,
        0.05,
        h * 0.3,
        10,
        { tile: 'mLeaves', color: shadeHex(0x4f8a5a, 1 - i * 0.06), fx: 0.25 },
        false
      )
      foliage.disc(cx, yb, cz, r, 10, -1, { tile: 'mLeaves', color: 0x3a6a44 })
    }
    return
  }
  // Broadleaf / cherry: a cloud of soft lumpy clusters.
  const palette = style === 0 ? [0xffc8d8, 0xf7b2c8, 0xffdbe6, 0xf3a3bd] : [0x86b85a, 0x74a84e, 0x96c466, 0x6a9c48]
  const crownY = y0 + h * 0.66
  const R = h * 0.34
  foliage.blob(
    cx + lean,
    crownY,
    cz + lean * 0.5,
    R,
    R * 0.78,
    R,
    { tile: 'mLeaves', color: palette[0], fx: 0.3 },
    2,
    0.16,
    seed * 13,
    true
  )
  const n = 7
  for (let i = 0; i < n; i++) {
    const a = seed * 5 + (i / n) * Math.PI * 2
    const r = R * (0.48 + 0.2 * hash01(i, seed, 2))
    const dist = R * (0.62 + 0.15 * hash01(seed, i, 5))
    foliage.blob(
      cx + lean + Math.sin(a) * dist,
      crownY + R * (hash01(seed, i, 3) * 0.6 - 0.2),
      cz + lean * 0.5 + Math.cos(a) * dist,
      r,
      r * 0.82,
      r,
      { tile: 'mLeaves', color: palette[(i + 1) % palette.length], fx: 0.38 },
      2,
      0.16,
      seed * 17 + i,
      true
    )
  }
  foliage.blob(
    cx + lean,
    crownY + R * 0.55,
    cz + lean * 0.5,
    R * 0.6,
    R * 0.5,
    R * 0.6,
    { tile: 'mLeaves', color: palette[2], fx: 0.4 },
    2,
    0.14,
    seed * 3,
    true
  )
  if (style === 0) ctx.emit({ kind: 'petals', p: [cx, crownY, cz], r: R, rate: 1.2 })
}

function shadeHex(c: number, k: number) {
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)))
  return (f((c >> 16) & 255) << 16) | (f((c >> 8) & 255) << 8) | f(c & 255)
}

function fence(b: MapBox, ctx: EnvCtx, style: number) {
  const [x0, y0, z0] = b.min
  const [x1, y1, z1] = b.max
  const [cx, cz] = centre(b)
  const alongX = x1 - x0 >= z1 - z0
  const len = alongX ? x1 - x0 : z1 - z0
  const h = y1 - y0
  const g = ctx.at('atlas', cx, cz)
  const cut = ctx.at('cutout', cx, cz)
  const post = (t: number, s: Surf, r = 0.05) => {
    const x = alongX ? x0 + t : cx
    const z = alongX ? cz : z0 + t
    g.box(x - r, y0, z - r, x + r, y1, z + r, s)
  }
  const along = (fn: (a: number, b: number) => void) => {
    for (let t = 0; t < len - 1e-3; t += SPLIT) fn(t, Math.min(len, t + SPLIT))
  }
  if (style === 0) {
    const metal: Surf = { tile: 'mMetal', color: 0x9aa0a4 }
    for (let t = 0; t <= len + 1e-3; t += 2.5) post(Math.min(t, len), metal, 0.04)
    along((a, e) => {
      const s: Surf = { tile: 'mChainlink', color: 0xd0d6da }
      if (alongX) cut.quad(x0 + a, y0, cz, [e - a, 0, 0], [0, h, 0], s, [0, 0, (e - a) / 1, h / 1])
      else cut.quad(cx, y0, z0 + a, [0, 0, e - a], [0, h, 0], s, [0, 0, (e - a) / 1, h / 1])
      if (alongX) g.tube([x0 + a, y1, cz], [x0 + e, y1, cz], 0.03, metal, 0, 1, 4)
      else g.tube([cx, y1, z0 + a], [cx, y1, z0 + e], 0.03, metal, 0, 1, 4)
    })
    return
  }
  if (style === 1) {
    const metal: Surf = { tile: 'mMetal', color: 0xc9ced2 }
    for (let t = 0; t <= len + 1e-3; t += 2) post(Math.min(t, len), metal, 0.06)
    along((a, e) => {
      if (alongX) g.box(x0 + a, y1 - 0.35, cz - 0.08, x0 + e, y1 - 0.05, cz + 0.08, metal)
      else g.box(cx - 0.08, y1 - 0.35, z0 + a, cx + 0.08, y1 - 0.05, z0 + e, metal)
    })
    return
  }
  if (style === 2) {
    const wood: Surf = { tile: 'mPlanks', color: 0xb89470 }
    for (let t = 0; t <= len + 1e-3; t += 1.6) post(Math.min(t, len), wood, 0.07)
    along((a, e) => {
      for (const y of [y0 + h * 0.35, y0 + h * 0.8]) {
        if (alongX) g.box(x0 + a, y, cz - 0.04, x0 + e, y + 0.14, cz + 0.04, wood)
        else g.box(cx - 0.04, y, z0 + a, cx + 0.04, y + 0.14, z0 + e, wood)
      }
    })
    return
  }
  // Virtual rail: white posts and glowing bars.
  const glow = ctx.at('glow', cx, cz)
  for (let t = 0; t <= len + 1e-3; t += 3) post(Math.min(t, len), { tile: 'mWhite' }, 0.06)
  along((a, e) => {
    const s: Surf = { tile: 'mWhite', color: 0x4fe6ff, glow: 2 * ctx.accent }
    for (const y of [y1 - 0.06, y0 + h * 0.5]) {
      if (alongX) glow.box(x0 + a, y - 0.03, cz - 0.03, x0 + e, y + 0.03, cz + 0.03, s)
      else glow.box(cx - 0.03, y - 0.03, z0 + a, cx + 0.03, y + 0.03, z0 + e, s)
    }
  })
}

function pillar(b: MapBox, ctx: EnvCtx, style: number) {
  const [x0, y0, z0] = b.min
  const [x1, y1, z1] = b.max
  const [cx, cz] = centre(b)
  const g = ctx.at('atlas', cx, cz)
  if (style === 1) {
    // Steel I-column.
    const w = x1 - x0
    const d = z1 - z0
    const s: Surf = { tile: 'mRust', color: 0x8a96a0 }
    g.box(x0, y0, z0, x1, y1, z0 + d * 0.15, s)
    g.box(x0, y0, z1 - d * 0.15, x1, y1, z1, s)
    g.box(cx - w * 0.08, y0, z0, cx + w * 0.08, y1, z1, s)
    return
  }
  if (style === 2) {
    g.box(x0, y0, z0, x1, y1, z1, { tile: 'mWhite', glow: 0.1 })
    const glow = ctx.at('glow', cx, cz)
    for (let y = y0 + 1; y < y1; y += 2.5)
      glow.box(x0 - 0.04, y, z0 - 0.04, x1 + 0.04, y + 0.12, z1 + 0.04, {
        tile: 'mWhite',
        color: 0x4fe6ff,
        glow: 2 * ctx.accent,
        fx: 0.3
      })
    return
  }
  g.aoHeight = 2
  g.box(x0, y0, z0, x1, y1, z1, { tile: 'mConcrete', color: 0xd4cfc6 })
  g.aoHeight = 0
  g.box(x0 - 0.1, y1 - 0.3, z0 - 0.1, x1 + 0.1, y1, z1 + 0.1, { tile: 'mConcrete', color: 0xc4beb4 })
}

/** Glowing edges for virtual platforms, roofs, stairs and walls. */
function edges(b: MapBox, ctx: EnvCtx) {
  const [x0, , z0] = b.min
  const [x1, y1, z1] = b.max
  const glow = ctx.at('glow', (x0 + x1) / 2, (z0 + z1) / 2)
  const s: Surf = { tile: 'mWhite', color: 0x4fe6ff, glow: 2 * ctx.accent }
  const t = 0.05
  glow.box(x0 - t, y1 - t, z0 - t, x1 + t, y1 + t, z0 + t, s)
  glow.box(x0 - t, y1 - t, z1 - t, x1 + t, y1 + t, z1 + t, s)
  glow.box(x0 - t, y1 - t, z0 - t, x0 + t, y1 + t, z1 + t, s)
  glow.box(x1 - t, y1 - t, z0 - t, x1 + t, y1 + t, z1 + t, s)
}

export type { GeoBuilder }

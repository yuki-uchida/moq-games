/**
 * Buildings (BOX_STYLES.building 0–9): facade tiles per floor, ground-floor shops, ledges, parapets, roof clutter
 * (AC units, water tanks, antennas), signs with invented text, awnings, balconies, overgrowth, crystal crust and
 * the virtual arena's glowing edges. Pure planning into GeoBuilders.
 */
import type { MapBox } from '../../sim/types'
import type { TileName } from './atlas'
import { hash01, shade, type EnvCtx } from './ctx'
import {
  balconies,
  crystalCrust,
  outpostDressing,
  overgrow,
  roofClutter,
  ruinTop,
  shopFront,
  stationFront,
  virtualEdges,
  wallSign
} from './building-details'
import type { GeoBuilder, Surf } from './geo'

export const FLOOR = 3.2
export const GROUND = 3.6

interface StyleDef {
  facade: TileName
  ground: TileName
  roof: TileName
  wall: number
  trim: number
  parapet: boolean
  overgrowth: number
}

const STYLES: StyleDef[] = [
  {
    facade: 'fOffice',
    ground: 'gGlass',
    roof: 'rConcrete',
    wall: 0xd9d6cf,
    trim: 0xb9b5ad,
    parapet: true,
    overgrowth: 0.5
  },
  {
    facade: 'fBrick',
    ground: 'gShop',
    roof: 'rConcrete',
    wall: 0xffffff,
    trim: 0xcdbca5,
    parapet: true,
    overgrowth: 0.6
  },
  {
    facade: 'fApartment',
    ground: 'gPlain',
    roof: 'rConcrete',
    wall: 0xf4ead6,
    trim: 0xd9cdb6,
    parapet: true,
    overgrowth: 0.5
  },
  {
    facade: 'fWood',
    ground: 'gSliding',
    roof: 'rTile',
    wall: 0xffffff,
    trim: 0x5a3e2c,
    parapet: false,
    overgrowth: 0.7
  },
  {
    facade: 'fStation',
    ground: 'gGlass',
    roof: 'rMetal',
    wall: 0xe8eef2,
    trim: 0x8796a3,
    parapet: true,
    overgrowth: 0.4
  },
  {
    facade: 'fWarehouse',
    ground: 'gGarage',
    roof: 'rMetal',
    wall: 0xffffff,
    trim: 0x6d7a80,
    parapet: false,
    overgrowth: 0.5
  },
  {
    facade: 'fOutpost',
    ground: 'gSliding',
    roof: 'rTile',
    wall: 0xffffff,
    trim: 0x7a5236,
    parapet: false,
    overgrowth: 0.3
  },
  {
    facade: 'fVirtual',
    ground: 'fVirtual',
    roof: 'rVirtual',
    wall: 0xffffff,
    trim: 0xf2f7fb,
    parapet: true,
    overgrowth: 0
  },
  {
    facade: 'fRuin',
    ground: 'gPlain',
    roof: 'rConcrete',
    wall: 0xc9c4ba,
    trim: 0x9c968c,
    parapet: true,
    overgrowth: 1
  },
  {
    facade: 'fBlight',
    ground: 'gPlain',
    roof: 'tCrystal',
    wall: 0xffffff,
    trim: 0x3a2a48,
    parapet: true,
    overgrowth: 0.2
  }
]

/** Colour variations of the base wall per building (sRGB multipliers). */
const WALL_TINTS = [0xffffff, 0xf3ece2, 0xe6edf2, 0xf6e7dc, 0xe9e4f2]

export function buildBuilding(b: MapBox, ctx: EnvCtx) {
  const style = STYLES[b.style ?? 0] ?? STYLES[0]
  const sid = b.style ?? 0
  const [x0, y0, z0] = b.min
  const [x1, y1, z1] = b.max
  const cx = (x0 + x1) / 2
  const cz = (z0 + z1) / 2
  const h = y1 - y0
  const g = ctx.at('atlas', cx, cz)
  const seed = hash01(x0, y0, z0, sid)
  g.aoHeight = 3.5
  const tint = sid === 7 || sid === 9 ? 0xffffff : WALL_TINTS[Math.floor(seed * WALL_TINTS.length)]
  const glowWindows = sid === 7 ? 1.6 * ctx.accent : sid === 9 ? 1.4 * ctx.accent : 1.4 * ctx.night
  const off: [number, number] = [Math.floor(seed * 7) * 0.5, Math.floor(hash01(z0, x0, y1) * 5) * 0.5]
  const groundH = Math.min(GROUND, h)
  const upperH = h - groundH

  // Four facades: ground band + upper floors with integer bays and floors.
  const sides: [number, number, number, readonly [number, number, number], number][] = [
    [x0, y0, z1, [x1 - x0, 0, 0], x1 - x0],
    [x1, y0, z0, [x0 - x1, 0, 0], x1 - x0],
    [x1, y0, z1, [0, 0, z0 - z1], z1 - z0],
    [x0, y0, z0, [0, 0, z1 - z0], z1 - z0]
  ]
  for (const [ax, ay, az, e1, len] of sides) {
    const bays = Math.max(1, Math.round(len / 3))
    const u = bays / 2
    g.quad(ax, ay, az, e1, [0, groundH, 0], { tile: style.ground, color: tint, glow: glowWindows * 0.8, fx: -1 }, [
      off[0],
      0,
      off[0] + u,
      1
    ])
    if (upperH > 0.4) {
      const floors = Math.max(1, Math.round(upperH / FLOOR))
      g.quad(ax, ay + groundH, az, e1, [0, upperH, 0], { tile: style.facade, color: tint, glow: glowWindows, fx: -1 }, [
        off[0],
        off[1],
        off[0] + u,
        off[1] + floors / 2
      ])
    }
  }
  g.aoHeight = 0

  // Roof.
  const roof: Surf = { tile: style.roof, color: sid === 9 ? 0xb9a0d0 : 0xffffff, glow: sid === 7 ? ctx.accent : 0 }
  g.quad(x0, y1, z1, [x1 - x0, 0, 0], [0, 0, z0 - z1], roof)

  // Ledge between the ground floor and the upper floors.
  const trim: Surf = { tile: sid === 3 || sid === 6 ? 'mPlanks' : 'mConcrete', color: style.trim }
  if (upperH > 0.5 && sid !== 7) ledge(g, x0, z0, x1, z1, y0 + groundH - 0.1, 0.22, 0.18, trim)
  // Masonry relief: thin string courses at every floor line and a stepped cornice under the roof line.
  if ((sid <= 2 || sid === 4 || sid === 8) && upperH > 2) {
    const floors = Math.max(1, Math.round(upperH / FLOOR))
    const fh = upperH / floors
    const band: Surf = { tile: 'mConcrete', color: shade(style.trim, 1.06) }
    for (let i = 1; i < floors; i++) ledge(g, x0, z0, x1, z1, y0 + groundH + i * fh - 0.07, 0.07, 0.12, band)
    if (sid !== 8) {
      ledge(g, x0, z0, x1, z1, y1 - 0.42, 0.12, 0.16, trim)
      ledge(g, x0, z0, x1, z1, y1 - 0.26, 0.26, 0.26, { tile: 'mConcrete', color: shade(style.trim, 1.1) })
    }
  }
  if (sid === 1 && h > 4) {
    // Brick quoins: light stone blocks stacked up the corners.
    const q: Surf = { tile: 'mConcrete', color: 0xe2d6c2 }
    for (let y = y0 + groundH; y < y1 - 0.6; y += 0.7) {
      const w = (Math.round((y - y0) / 0.7) % 2 ? 0.55 : 0.35) as number
      for (const [cx2, cz2, sx, sz] of [
        [x0, z0, 1, 1],
        [x1, z0, -1, 1],
        [x0, z1, 1, -1],
        [x1, z1, -1, -1]
      ] as const) {
        const ax = Math.min(cx2, cx2 + sx * w)
        const bx = Math.max(cx2, cx2 + sx * w)
        const az = Math.min(cz2, cz2 + sz * w)
        const bz = Math.max(cz2, cz2 + sz * w)
        g.box(ax - 0.04, y, az - 0.04, bx + 0.04, y + 0.32, bz + 0.04, q)
      }
    }
  }

  // Parapet ring on flat roofs.
  if (style.parapet) {
    const ph = sid === 7 ? 0.35 : 0.7
    const t = 0.25
    const ps: Surf = { tile: sid === 7 ? 'mWhite' : 'mConcrete', color: style.trim }
    g.box(x0 - 0.05, y1, z0 - 0.05, x1 + 0.05, y1 + ph, z0 + t, ps)
    g.box(x0 - 0.05, y1, z1 - t, x1 + 0.05, y1 + ph, z1 + 0.05, ps)
    g.box(x0 - 0.05, y1, z0 + t, x0 + t, y1 + ph, z1 - t, ps)
    g.box(x1 - t, y1, z0 + t, x1 + 0.05, y1 + ph, z1 - t, ps)
  } else if (sid === 3 || sid === 6) {
    // Tiled eaves overhang.
    const o = 0.55
    const eave: Surf = { tile: 'rTile', color: sid === 6 ? 0xc9a27a : 0x8a9aa8 }
    g.box(x0 - o, y1 - 0.12, z0 - o, x1 + o, y1 + 0.1, z1 + o, eave)
    // Low hip on top.
    hip(
      g,
      x0 - 0.2,
      z0 - 0.2,
      x1 + 0.2,
      z1 + 0.2,
      y1 + 0.1,
      Math.min(2.2, (Math.min(x1 - x0, z1 - z0) / 2) * 0.6),
      eave
    )
  } else if (sid === 5) {
    // Warehouse: shallow metal gable.
    hip(g, x0, z0, x1, z1, y1, Math.min(1.6, Math.min(x1 - x0, z1 - z0) * 0.15), { tile: 'rMetal', color: 0x9aa7ad })
  }

  // Style accents.
  if (sid === 1) shopFront(b, ctx, seed)
  if (sid === 2 && upperH > 2) balconies(b, ctx, seed)
  if (sid === 4) stationFront(b, ctx)
  if (sid === 6) outpostDressing(b, ctx, seed)
  if (sid === 7) virtualEdges(b, ctx)
  if (sid === 9) crystalCrust(b, ctx, seed)
  if (sid === 0 || sid === 2 || sid === 8 || sid === 4) roofClutter(b, ctx, seed, sid === 8)
  if (sid === 8) ruinTop(b, ctx, seed)
  if (ctx.overgrowth && style.overgrowth > 0) overgrow(b, ctx, seed, style.overgrowth)
  if ((sid === 0 || sid === 1 || sid === 5) && h > 7) wallSign(b, ctx, seed)
}

/** A protruding horizontal band around a footprint. */
function ledge(
  g: GeoBuilder,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  y: number,
  out: number,
  th: number,
  s: Surf
) {
  g.box(x0 - out, y, z0 - out, x1 + out, y + th, z0, s)
  g.box(x0 - out, y, z1, x1 + out, y + th, z1 + out, s)
  g.box(x0 - out, y, z0, x0, y + th, z1, s)
  g.box(x1, y, z0, x1 + out, y + th, z1, s)
}

/** Hip roof from a rectangle at height y rising by `rise` to a ridge along the long axis. */
export function hip(g: GeoBuilder, x0: number, z0: number, x1: number, z1: number, y: number, rise: number, s: Surf) {
  const alongX = x1 - x0 >= z1 - z0
  const inset = (alongX ? z1 - z0 : x1 - x0) / 2
  if (alongX) {
    const rz = (z0 + z1) / 2
    const ra = x0 + inset
    const rb = x1 - inset
    g.tri([x0, y, z1, x1, y, z1, rb, y + rise, rz], s)
    g.tri([x0, y, z1, rb, y + rise, rz, ra, y + rise, rz], s)
    g.tri([x1, y, z0, x0, y, z0, ra, y + rise, rz], s)
    g.tri([x1, y, z0, ra, y + rise, rz, rb, y + rise, rz], s)
    g.tri([x1, y, z1, x1, y, z0, rb, y + rise, rz], s)
    g.tri([x0, y, z0, x0, y, z1, ra, y + rise, rz], s)
  } else {
    const rx = (x0 + x1) / 2
    const ra = z0 + inset
    const rb = z1 - inset
    g.tri([x1, y, z1, x1, y, z0, rx, y + rise, ra], s)
    g.tri([x1, y, z1, rx, y + rise, ra, rx, y + rise, rb], s)
    g.tri([x0, y, z0, x0, y, z1, rx, y + rise, rb], s)
    g.tri([x0, y, z0, rx, y + rise, rb, rx, y + rise, ra], s)
    g.tri([x0, y, z1, x1, y, z1, rx, y + rise, rb], s)
    g.tri([x1, y, z0, x0, y, z0, rx, y + rise, ra], s)
  }
}

/** A cluster of faceted crystal prisms (atlas crystal tile + emissive). */
export function crystalCluster(ctx: EnvCtx, x: number, y: number, z: number, size: number, seed: number) {
  const g = ctx.at('atlas', x, z)
  const n = 3 + Math.floor(hash01(seed, x, z) * 3)
  for (let k = 0; k < n; k++) {
    const a = hash01(seed, k, 1) * Math.PI * 2
    const tilt = 0.15 + hash01(seed, k, 2) * 0.55
    const len = size * (0.6 + hash01(seed, k, 3) * 0.9)
    const r = size * 0.18 * (0.7 + hash01(k, seed, 4) * 0.6)
    prism(g, x, y, z, a, k === 0 ? 0.05 : tilt, len, r, {
      tile: 'mCrystal',
      color: 0xffffff,
      glow: 1.3 * ctx.accent
    })
  }
}

/** Hexagonal prism with a pointed tip, tilted by `tilt` towards angle `a`. */
export function prism(
  g: GeoBuilder,
  x: number,
  y: number,
  z: number,
  a: number,
  tilt: number,
  len: number,
  r: number,
  s: Surf
) {
  const dx = Math.sin(a) * Math.sin(tilt)
  const dy = Math.cos(tilt)
  const dz = Math.cos(a) * Math.sin(tilt)
  // Orthonormal frame around the axis.
  let ux = 1
  let uy = 0
  let uz = 0
  if (Math.abs(dx) > 0.9) {
    ux = 0
    uz = 1
  }
  // side = axis × u
  let sx = dy * uz - dz * uy
  let sy = dz * ux - dx * uz
  let sz = dx * uy - dy * ux
  const sl = Math.hypot(sx, sy, sz)
  sx /= sl
  sy /= sl
  sz /= sl
  const tx = dy * sz - dz * sy
  const ty = dz * sx - dx * sz
  const tz = dx * sy - dy * sx
  const body = len * 0.75
  const ring = (d: number, rr: number) => {
    const out: number[][] = []
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2
      const c = Math.cos(ang) * rr
      const sn = Math.sin(ang) * rr
      out.push([x + dx * d + sx * c + tx * sn, y + dy * d + sy * c + ty * sn, z + dz * d + sz * c + tz * sn])
    }
    return out
  }
  const bot = ring(-r * 0.5, r * 0.85)
  const top = ring(body, r)
  const tip = [x + dx * len, y + dy * len, z + dz * len]
  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6
    g.tri([...bot[i], ...bot[j], ...top[j]], s)
    g.tri([...bot[i], ...top[j], ...top[i]], s)
    g.tri([...top[i], ...top[j], ...tip], s)
  }
}

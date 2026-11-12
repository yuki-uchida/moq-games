/**
 * Buildings (BOX_STYLES.building 0–9): facade tiles per floor, ground-floor shops, ledges, parapets, roof clutter
 * (AC units, water tanks, antennas), signs with invented text, awnings, balconies, overgrowth, crystal crust and
 * the virtual arena's glowing edges. Pure planning into GeoBuilders.
 */
import type { MapBox } from '../../sim/types'
import type { TileName } from './atlas'
import { hash01, shade, type EnvCtx } from './ctx'
import type { GeoBuilder, Surf } from './geo'

const FLOOR = 3.2
const GROUND = 3.6

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
    ground: 'gPlain',
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
    g.quad(ax, ay, az, e1, [0, groundH, 0], { tile: style.ground, color: tint, glow: glowWindows * 0.8 }, [
      off[0],
      0,
      off[0] + u,
      1
    ])
    if (upperH > 0.4) {
      const floors = Math.max(1, Math.round(upperH / FLOOR))
      g.quad(ax, ay + groundH, az, e1, [0, upperH, 0], { tile: style.facade, color: tint, glow: glowWindows }, [
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

/** Faded striped awnings and shop signs above the ground floor on the long sides. */
function shopFront(b: MapBox, ctx: EnvCtx, seed: number) {
  const [x0, y0, z0] = b.min
  const [x1, , z1] = b.max
  const cx = (x0 + x1) / 2
  const cz = (z0 + z1) / 2
  const g = ctx.at('atlas', cx, cz)
  const colors = [0xd8574a, 0x3f8f7a, 0x3f6fb0, 0xe0a33a]
  const y = y0 + 2.7
  const fronts: [number, number, number, number, number][] = [
    // origin x, z, dir x, dir z, length; awning extends along the outward normal
    [x0, z1, 1, 0, x1 - x0],
    [x1, z0, -1, 0, x1 - x0]
  ]
  fronts.forEach(([ox, oz, dx, dz, len], k) => {
    const nx = dz
    const nz = -dx
    const outX = -nz
    const outZ = nx
    const bays = Math.max(1, Math.round(len / 3))
    const bayLen = len / bays
    for (let i = 0; i < bays; i++) {
      if (hash01(ox + i, oz, k, 3) < 0.3) continue
      const c = colors[Math.floor(hash01(ox, oz + i, k) * colors.length)]
      const ax = ox + dx * (i * bayLen + 0.2)
      const az = oz + dz * (i * bayLen + 0.2)
      const w = bayLen - 0.4
      // Slanted awning: from wall at y+0.6 down to y out 1.1 m.
      g.quad(ax + outX * 1.1, y, az + outZ * 1.1, [dx * w, 0, dz * w], [-outX * 1.1, 0.6, -outZ * 1.1], {
        tile: 'mCloth',
        color: shade(c, 0.95)
      })
      // Underside (so it reads from below).
      g.quad(
        ax + dx * w + outX * 1.1,
        y - 0.01,
        az + dz * w + outZ * 1.1,
        [-dx * w, 0, -dz * w],
        [-outX * 1.1, 0.6, -outZ * 1.1],
        {
          tile: 'mCloth',
          color: shade(c, 0.6)
        }
      )
      // Sign board above the awning.
      if (hash01(ox, i, oz, 7) < 0.6) {
        const tile = (['mSign0', 'mSign1', 'mSign2'] as const)[Math.floor(hash01(i, ox, oz) * 3)]
        const sw = Math.min(w, 2.6)
        const sx = ax + dx * (w - sw) * 0.5 + outX * 0.06
        const sz = az + dz * (w - sw) * 0.5 + outZ * 0.06
        g.quad(sx, y + 0.75, sz, [dx * sw, 0, dz * sw], [0, 0.65, 0], { tile, map: 'fit', glow: ctx.night * 1.2 })
      }
    }
  })
  void seed
}

/** Balcony slabs with railings on every upper floor of the long sides. */
function balconies(b: MapBox, ctx: EnvCtx, seed: number) {
  const [x0, y0, z0] = b.min
  const [x1, y1, z1] = b.max
  const cx = (x0 + x1) / 2
  const cz = (z0 + z1) / 2
  const g = ctx.at('atlas', cx, cz)
  const rail = ctx.at('cutout', cx, cz)
  const slab: Surf = { tile: 'mConcrete', color: 0xeae2d2 }
  const railS: Surf = { tile: 'mGrating', color: 0x9aa4ab }
  const alongX = x1 - x0 >= z1 - z0
  const len = alongX ? x1 - x0 : z1 - z0
  const bays = Math.max(1, Math.round(len / 3))
  const bay = len / bays
  for (let y = y0 + GROUND + FLOOR - 0.15; y < y1 - 1; y += FLOOR) {
    for (let i = 0; i < bays; i++) {
      if ((i + Math.floor(seed * 4)) % 2 === 1) continue
      const a = (alongX ? x0 : z0) + i * bay + 0.3
      const c = a + bay - 0.6
      for (const side of [1, -1]) {
        if (alongX) {
          const zw = side > 0 ? z1 : z0
          const zo = zw + side * 0.9
          g.box(a, y, Math.min(zw, zo), c, y + 0.15, Math.max(zw, zo), slab)
          rail.quad(a, y + 0.15, zo, [c - a, 0, 0], [0, 0.9, 0], railS)
        } else {
          const xw = side > 0 ? x1 : x0
          const xo = xw + side * 0.9
          g.box(Math.min(xw, xo), y, a, Math.max(xw, xo), y + 0.15, c, slab)
          rail.quad(xo, y + 0.15, a, [0, 0, c - a], [0, 0.9, 0], railS)
        }
      }
    }
  }
}

/** Station canopy and a clock above the entrance. */
function stationFront(b: MapBox, ctx: EnvCtx) {
  const [x0, y0, z0] = b.min
  const [x1, y1, z1] = b.max
  const cx = (x0 + x1) / 2
  const cz = (z0 + z1) / 2
  const g = ctx.at('atlas', cx, cz)
  const canopy: Surf = { tile: 'mMetal', color: 0x7f8e99 }
  g.box(x0 + 1, y0 + 3.4, z1, x1 - 1, y0 + 3.7, z1 + 3, canopy)
  for (let x = x0 + 1.5; x < x1 - 1; x += 5) g.box(x, y0, z1 + 2.6, x + 0.25, y0 + 3.4, z1 + 2.85, canopy)
  const clockY = Math.min(y1 - 1.2, y0 + 6)
  g.matrix.makeRotationX(Math.PI / 2).setPosition(cx, clockY, z1 + 0.05)
  g.cylinder(0, 0, 0, 0.9, 0.9, 0.12, 16, { tile: 'mWhite', color: 0xf7f2e4, glow: ctx.night * 0.8 })
  g.identity()
  const glow = ctx.at('glow', cx, cz)
  glow.box(cx - 0.04, clockY - 0.05, z1 + 0.19, cx + 0.04, clockY + 0.6, z1 + 0.22, {
    tile: 'mWhite',
    color: 0x222222,
    glow: 1
  })
  glow.box(cx - 0.04, clockY - 0.04, z1 + 0.19, cx + 0.45, clockY + 0.04, z1 + 0.22, {
    tile: 'mWhite',
    color: 0x222222,
    glow: 1
  })
}

/** Paper lanterns strung along the eaves and a paw-print banner. */
function outpostDressing(b: MapBox, ctx: EnvCtx, seed: number) {
  const [x0, y0, z0] = b.min
  const [x1, , z1] = b.max
  const cx = (x0 + x1) / 2
  const cz = (z0 + z1) / 2
  const g = ctx.at('atlas', cx, cz)
  const glow = ctx.at('glow', cx, cz)
  const y = y0 + 2.9
  const rope: Surf = { tile: 'mPlanks', color: 0x4a3626 }
  g.tube([x0, y + 0.3, z1 + 0.6], [x1, y + 0.3, z1 + 0.6], 0.02, rope, 0.35, 6, 3)
  const n = Math.max(2, Math.floor((x1 - x0) / 1.6))
  for (let i = 1; i < n; i++) {
    const t = i / n
    const x = x0 + (x1 - x0) * t
    const sag = 0.35 * 4 * t * (1 - t)
    const color = (i + Math.floor(seed * 3)) % 3 === 0 ? 0xffb07a : 0xff7a5c
    g.blob(x, y + 0.05 - sag, z1 + 0.6, 0.2, 0.26, 0.2, { tile: 'mLantern', color, glow: 0.6 + ctx.night * 1.8 }, 1, 0)
    glow.blob(
      x,
      y + 0.05 - sag,
      z1 + 0.6,
      0.12,
      0.16,
      0.12,
      { tile: 'mWhite', color, glow: 0.4 + ctx.night * 2.2 },
      1,
      0
    )
  }
  // Banner hanging from the eaves.
  const bw = 1.1
  g.quad(cx - bw / 2, y0 + 0.8, z1 + 0.08, [bw, 0, 0], [0, 2.1, 0], { tile: 'mBanner', map: 'fit', fx: 0.15 })
}

/** Glowing cyan edges along every edge of a virtual block. */
function virtualEdges(b: MapBox, ctx: EnvCtx) {
  const [x0, y0, z0] = b.min
  const [x1, y1, z1] = b.max
  const glow = ctx.at('glow', (x0 + x1) / 2, (z0 + z1) / 2)
  const s: Surf = { tile: 'mWhite', color: 0x4fe6ff, glow: 2.2 * ctx.accent, fx: 0.15 }
  const t = 0.07
  for (const [x, z] of [
    [x0, z0],
    [x1, z0],
    [x0, z1],
    [x1, z1]
  ])
    glow.box(x - t, y0, z - t, x + t, y1 + t, z + t, s)
  for (const y of [y1, y0 + 0.02]) {
    glow.box(x0 - t, y - t, z0 - t, x1 + t, y + t, z0 + t, s)
    glow.box(x0 - t, y - t, z1 - t, x1 + t, y + t, z1 + t, s)
    glow.box(x0 - t, y - t, z0 - t, x0 + t, y + t, z1 + t, s)
    glow.box(x1 - t, y - t, z0 - t, x1 + t, y + t, z1 + t, s)
  }
  // Floor-line seams.
  for (let y = y0 + GROUND; y < y1 - 1; y += FLOOR * 2) {
    const k = 0.03
    glow.box(x0 - k, y, z1, x1 + k, y + 0.05, z1 + k, s)
    glow.box(x0 - k, y, z0 - k, x1 + k, y + 0.05, z0, s)
  }
}

/** Violet crystal clusters breaking through the walls and roof. */
function crystalCrust(b: MapBox, ctx: EnvCtx, seed: number) {
  const [x0, y0, z0] = b.min
  const [x1, y1, z1] = b.max
  const cx = (x0 + x1) / 2
  const cz = (z0 + z1) / 2
  const count = 3 + Math.floor(seed * 4)
  for (let i = 0; i < count; i++) {
    const r1 = hash01(x0, i, z0, 1)
    const r2 = hash01(z1, i, x1, 2)
    const onRoof = i % 2 === 0
    const x = onRoof ? x0 + (x1 - x0) * r1 : r1 < 0.5 ? x0 : x1
    const z = onRoof ? z0 + (z1 - z0) * r2 : z0 + (z1 - z0) * r2
    const y = onRoof ? y1 : y0 + (y1 - y0) * (0.2 + 0.6 * r2)
    crystalCluster(ctx, x, y, z, 0.8 + r1 * 1.6, seed + i)
  }
  void cx
  void cz
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

/** AC units, water tanks, antennas and vents on flat roofs. */
function roofClutter(b: MapBox, ctx: EnvCtx, seed: number, ruin: boolean) {
  const [x0, , z0] = b.min
  const [x1, y1, z1] = b.max
  const w = x1 - x0
  const d = z1 - z0
  if (w < 4 || d < 4) return
  const g = ctx.at('atlas', (x0 + x1) / 2, (z0 + z1) / 2)
  const metal: Surf = { tile: 'mMetal', color: 0xc4ccd0 }
  const n = Math.min(5, Math.floor((w * d) / 40) + 1)
  for (let i = 0; i < n; i++) {
    const r1 = hash01(x0 + i, y1, z0, 11)
    const r2 = hash01(z0, i, x0, 12)
    const x = x0 + 1.2 + (w - 2.4) * r1
    const z = z0 + 1.2 + (d - 2.4) * r2
    const kind = Math.floor(hash01(i, seed, 13) * 3)
    if (kind === 0) {
      // AC unit with a fan grille.
      g.box(x - 0.55, y1, z - 0.4, x + 0.55, y1 + 0.75, z + 0.4, metal)
      g.matrix.makeRotationX(-Math.PI / 2).setPosition(x, y1 + 0.38, z + 0.41)
      g.cylinder(0, 0, 0, 0.28, 0.28, 0.02, 10, { tile: 'mGrating', color: 0x55606a })
      g.identity()
    } else if (kind === 1 && !ruin) {
      // Water tank on legs.
      for (const [lx, lz] of [
        [-0.6, -0.6],
        [0.6, -0.6],
        [-0.6, 0.6],
        [0.6, 0.6]
      ])
        g.box(x + lx - 0.06, y1, z + lz - 0.06, x + lx + 0.06, y1 + 1.2, z + lz + 0.06, {
          tile: 'mRust',
          color: 0x8a8a8a
        })
      g.cylinder(x, y1 + 1.2, z, 0.95, 0.95, 1.6, 12, { tile: 'mMetal', color: 0x8fb0bf })
      g.cylinder(x, y1 + 2.8, z, 0.95, 0.1, 0.4, 12, { tile: 'mMetal', color: 0x7f9eae })
    } else {
      // Vent stack and an antenna.
      g.box(x - 0.3, y1, z - 0.3, x + 0.3, y1 + 0.5, z + 0.3, metal)
      g.tube([x, y1, z], [x, y1 + 2.8, z], 0.035, { tile: 'mMetal', color: 0x777777 }, 0, 1, 4)
      g.tube([x - 0.5, y1 + 2.3, z], [x + 0.5, y1 + 2.3, z], 0.025, { tile: 'mMetal', color: 0x777777 }, 0, 1, 3)
    }
  }
}

/** Broken top edges with exposed rebar. */
function ruinTop(b: MapBox, ctx: EnvCtx, seed: number) {
  const [x0, , z0] = b.min
  const [x1, y1, z1] = b.max
  const g = ctx.at('atlas', (x0 + x1) / 2, (z0 + z1) / 2)
  const conc: Surf = { tile: 'mConcrete', color: 0xb5afa4 }
  const rebar: Surf = { tile: 'mRust', color: 0x9a5a3a }
  const n = 4 + Math.floor(seed * 4)
  for (let i = 0; i < n; i++) {
    const t = hash01(i, x0, z0, 21)
    const side = i % 4
    const x = side < 2 ? x0 + (x1 - x0) * t : side === 2 ? x0 + 0.2 : x1 - 0.2
    const z = side >= 2 ? z0 + (z1 - z0) * t : side === 0 ? z0 + 0.2 : z1 - 0.2
    const hgt = 0.6 + hash01(i, z0, x1) * 1.8
    g.box(x - 0.5, y1, z - 0.3, x + 0.5, y1 + hgt, z + 0.3, conc)
    for (let k = 0; k < 3; k++) {
      const ox = (k - 1) * 0.25
      g.tube([x + ox, y1 + hgt, z], [x + ox + 0.2 * (k - 1), y1 + hgt + 0.9 + k * 0.2, z + 0.1], 0.025, rebar, 0, 1, 3)
    }
  }
  // Rubble at the base.
  const [, y0] = b.min
  for (let i = 0; i < 3; i++) {
    const t = hash01(i, z1, x1, 23)
    const x = x0 + (x1 - x0) * t
    g.blob(x, y0 + 0.2, z1 + 0.8, 1.1, 0.55, 0.8, { tile: 'mRubble', color: 0xb8b0a4 }, 1, 0.3, i + seed)
  }
}

/** Ivy curtains down the walls, moss along the base and a tree bursting from ruined roofs. */
function overgrow(b: MapBox, ctx: EnvCtx, seed: number, amount: number) {
  const [x0, y0, z0] = b.min
  const [x1, y1, z1] = b.max
  const cx = (x0 + x1) / 2
  const cz = (z0 + z1) / 2
  const cut = ctx.at('cutout', cx, cz)
  const h = y1 - y0
  const faces: [number, number, number, number, number][] = [
    // origin x, z, along x, along z, length — outward offset by normal
    [x0, z1 + 0.04, 1, 0, x1 - x0],
    [x1, z0 - 0.04, -1, 0, x1 - x0],
    [x1 + 0.04, z1, 0, -1, z1 - z0],
    [x0 - 0.04, z0, 0, 1, z1 - z0]
  ]
  const patches = Math.round((1 + amount * 3) * ctx.density)
  faces.forEach(([ox, oz, dx, dz, len], f) => {
    for (let i = 0; i < patches; i++) {
      if (hash01(f, i, seed, 31) > amount) continue
      const t = hash01(i, f, ox + oz, 32)
      const w = 1.6 + hash01(i, f, 33) * 2.6
      const top = Math.min(h, 3 + hash01(f, i, 34) * h * 0.8)
      const start = Math.max(0, Math.min(len - w, t * len))
      const ax = ox + dx * start
      const az = oz + dz * start
      cut.quad(
        ax,
        y0 + top,
        az,
        [dx * w, 0, dz * w],
        [0, -top, 0],
        {
          tile: 'mIvy',
          color: f % 2 ? 0xd5e8b0 : 0xffffff,
          fx: 0.08
        },
        [0, 0, w / 2, top / 2]
      )
    }
    // Moss strip at the base.
    if (amount > 0.3) {
      cut.quad(ox, y0 + 0.9, oz, [dx * len, 0, dz * len], [0, -0.9, 0], { tile: 'mMoss', color: 0xc8dca0 }, [
        0,
        0,
        len / 2,
        0.45
      ])
    }
  })
  // Grass along the base on the street side.
  const grass = ctx.at('cutout', cx, cz)
  const tufts = Math.round(((x1 - x0) / 2) * amount * ctx.density)
  for (let i = 0; i < tufts; i++) {
    const x = x0 + (x1 - x0) * hash01(i, seed, 41)
    grass.cross(x, y0, z1 + 0.25, 0.7, 0.45, { tile: 'mGrass', color: 0xd8e8a8, fx: 1 }, 2, hash01(i, 42, seed) * 3)
  }
}

/** A large vertical sign board with invented text on a facade. */
function wallSign(b: MapBox, ctx: EnvCtx, seed: number) {
  if (seed < 0.45) return
  const [x0, y0, z0] = b.min
  const [x1, y1, z1] = b.max
  const g = ctx.at('atlas', (x0 + x1) / 2, (z0 + z1) / 2)
  const tile = 'mSign3'
  const x = x0 + 0.8 + (x1 - x0 - 1.6) * hash01(seed, 51, 1)
  const top = Math.min(y1 - 0.5, y0 + 9)
  // Vertical blade sign sticking out of the +z facade.
  g.box(x - 0.08, top - 4, z1, x + 0.08, top, z1 + 1.1, { tile: 'mMetal', color: 0x50565c })
  g.matrix.makeRotationY(Math.PI / 2)
  g.matrix.setPosition(x + 0.09, top - 4, z1 + 1.05)
  g.quad(0, 0, 0, [1, 0, 0], [0, 4, 0], { tile, map: 'fit', glow: ctx.night * 1.6 })
  g.matrix.makeRotationY(-Math.PI / 2)
  g.matrix.setPosition(x - 0.09, top - 4, z1 + 0.05)
  g.quad(0, 0, 0, [1, 0, 0], [0, 4, 0], { tile, map: 'fit', glow: ctx.night * 1.6 })
  g.identity()
  void z0
}

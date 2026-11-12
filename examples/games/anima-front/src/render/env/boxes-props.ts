/**
 * Visuals for rocks, crystal clusters and hive growth, fences and pillars (BOX_STYLES rock/crystal/fence/pillar).
 * Pure planning (split from boxes.ts).
 */
import type { MapBox } from '../../sim/types'
import { crystalCluster, prism } from './buildings'
import { hash01, type EnvCtx } from './ctx'
import type { Surf } from './geo'

/** Chunk-sized pieces of long runs so culling stays effective. */
const SPLIT = 32

const centre = (b: MapBox): [number, number] => [(b.min[0] + b.max[0]) / 2, (b.min[2] + b.max[2]) / 2]

export function rock(b: MapBox, ctx: EnvCtx, style: number) {
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

export function crystal(b: MapBox, ctx: EnvCtx, style: number) {
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

export function fence(b: MapBox, ctx: EnvCtx, style: number) {
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

export function pillar(b: MapBox, ctx: EnvCtx, style: number) {
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

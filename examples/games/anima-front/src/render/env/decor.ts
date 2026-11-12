/**
 * Decor (DECOR_KINDS in src/data/map-vocab.ts): each kind is drawn in local space (feet at the origin, facing
 * +Z) into builders provided by the planner, which either merges it into the chunk batches (unique pieces) or
 * builds it once as an instancing prototype (repeated small pieces). Pure.
 */
import { DECOR_KINDS, type DecorKind } from '../../data/map-vocab'
import type { EnvMat, EnvCtx } from './ctx'
import { prism } from './buildings'
import type { GeoBuilder, Surf } from './geo'

export type DecorSink = (mat: EnvMat) => GeoBuilder

/** Kinds drawn with one InstancedMesh per (kind, style, material) instead of being merged. */
export const INSTANCED_DECOR: ReadonlySet<DecorKind> = new Set<DecorKind>([
  'grass',
  'flowers',
  'debris',
  'trash',
  'tire',
  'cone',
  'bollard',
  'buoy',
  'crystalShard',
  'pod',
  'bush',
  'bench',
  'moss',
  'puddle'
])

/** Decor kinds that only spawn ambient particles. */
export const EMITTER_DECOR: ReadonlySet<DecorKind> = new Set<DecorKind>(['cherryPetals'])

export const isDecorKind = (k: string): k is DecorKind => (DECOR_KINDS as readonly string[]).includes(k)

const METAL: Surf = { tile: 'mMetal', color: 0x6d777e }

type DrawFn = (b: DecorSink, style: number, ctx: EnvCtx) => void

export const DECOR: Record<DecorKind, DrawFn> = {
  lamp(b, style, ctx) {
    const a = b('atlas')
    const glow = b('glow')
    if (style === 1) {
      // Park lamp with a round globe.
      a.cylinder(0, 0, 0, 0.09, 0.06, 3.2, 8, { tile: 'mMetal', color: 0x3e4a44 })
      glow.blob(0, 3.4, 0, 0.26, 0.26, 0.26, { tile: 'mWhite', color: 0xfff0c8, glow: 0.4 + ctx.night * 3 }, 1, 0)
      pool(b, 0, 0, 3.2, 0xffd9a0, ctx.night)
      return
    }
    a.cylinder(0, 0, 0, 0.1, 0.07, 5.6, 8, { tile: 'mMetal', color: 0x59636a })
    a.box(-0.05, 5.4, 0, 0.05, 5.5, 1.3, { tile: 'mMetal', color: 0x59636a })
    a.box(-0.22, 5.3, 1.0, 0.22, 5.5, 1.6, { tile: 'mMetal', color: 0x4b545a })
    glow.box(-0.16, 5.26, 1.06, 0.16, 5.3, 1.54, { tile: 'mWhite', color: 0xffe6b8, glow: 0.3 + ctx.night * 3.5 })
    pool(b, 0, 1.3, 4.5, 0xffd49a, ctx.night)
  },
  lantern(b, style, ctx) {
    const a = b('atlas')
    const glow = b('glow')
    const wood: Surf = { tile: 'mPlanks', color: 0x5a4030 }
    const colors = [0xff8a5c, 0xffc06a, 0xff6f6f]
    if (style === 1) {
      // A string of lanterns between two posts 4 m apart.
      a.box(-2.05, 0, -0.05, -1.95, 2.8, 0.05, wood)
      a.box(1.95, 0, -0.05, 2.05, 2.8, 0.05, wood)
      a.tube([-2, 2.7, 0], [2, 2.7, 0], 0.015, wood, 0.3, 5, 3)
      for (let i = 1; i <= 3; i++) {
        const t = i / 4
        const x = -2 + 4 * t
        const y = 2.55 - 0.3 * 4 * t * (1 - t)
        lanternBody(a, glow, x, y, colors[i % 3], ctx)
      }
      pool(b, 0, 0, 3.5, 0xffa070, ctx.night * 0.8 + 0.1)
      return
    }
    a.box(-0.05, 0, -0.05, 0.05, 2.4, 0.05, wood)
    a.box(-0.05, 2.3, 0, 0.05, 2.38, 0.45, wood)
    lanternBody(a, glow, 0, 1.95, colors[style % 3], ctx, 0.42)
    pool(b, 0, 0.4, 2.6, 0xffa070, ctx.night * 0.8 + 0.1)
  },
  sign(b, style, ctx) {
    const a = b('atlas')
    const tile = (['mSign0', 'mSign1', 'mSign2'] as const)[style % 3]
    a.box(-0.85, 0, -0.05, -0.75, 1.9, 0.05, METAL)
    a.box(0.75, 0, -0.05, 0.85, 1.9, 0.05, METAL)
    a.box(-1.0, 1.25, -0.06, 1.0, 1.95, 0.0, { tile: 'mMetal', color: 0x3a4248 })
    a.quad(-1.0, 1.25, 0.005, [2, 0, 0], [0, 0.7, 0], { tile, map: 'fit', glow: ctx.night * 1.4 })
  },
  vending(b, style, ctx) {
    const a = b('atlas')
    const colors = [0xd8504a, 0x3f7fc0, 0xe8e4dc]
    const body: Surf = { tile: 'mCarPaint', color: colors[style % 3] }
    a.box(-0.45, 0, -0.35, 0.45, 1.85, 0.35, { px: body, nx: body, py: body, nz: body })
    a.quad(-0.45, 0, 0.35, [0.9, 0, 0], [0, 1.85, 0], { tile: 'mVending', map: 'fit', glow: 0.2 + ctx.night * 1.5 })
    pool(b, 0, 0.9, 1.6, 0xbfe0ff, ctx.night * 0.6)
  },
  bench(b) {
    const a = b('atlas')
    const wood: Surf = { tile: 'mPlanks', color: 0xb08a5c }
    for (const x of [-0.75, 0.75]) a.box(x - 0.05, 0, -0.25, x + 0.05, 0.45, 0.25, METAL)
    for (let i = 0; i < 3; i++) a.box(-0.9, 0.42, -0.24 + i * 0.17, 0.9, 0.47, -0.12 + i * 0.17, wood)
    a.box(-0.9, 0.55, -0.3, 0.9, 0.85, -0.25, wood)
  },
  bush(b, style) {
    const f = b('foliage')
    const colors = [0x6fa64a, 0x8bb85a, 0xd88aa8]
    const c = colors[style % 3]
    f.blob(0, 0.35, 0, 0.7, 0.55, 0.7, { tile: 'mLeaves', color: c, fx: 0.25 }, 2, 0.18, 1, true)
    f.blob(0.45, 0.3, 0.2, 0.45, 0.4, 0.45, { tile: 'mLeaves', color: c, fx: 0.25 }, 1, 0.18, 2, true)
    f.blob(-0.4, 0.28, -0.25, 0.42, 0.38, 0.42, { tile: 'mLeaves', color: c, fx: 0.25 }, 1, 0.18, 3, true)
  },
  grass(b, style) {
    const c = b('cutout')
    const tint = [0xe0f0b0, 0xc8dc98, 0xf0e0a0][style % 3]
    c.cross(0, 0, 0, 0.9, 0.55, { tile: 'mGrass', color: tint, fx: 1 }, 3)
    c.cross(0.35, 0, 0.2, 0.6, 0.4, { tile: 'mGrass', color: tint, fx: 1 }, 2, 0.6)
  },
  flowers(b) {
    b('cutout').cross(0, 0, 0, 0.7, 0.45, { tile: 'mFlowers', fx: 1 }, 3)
  },
  ivy(b) {
    b('cutout').quad(-1, 3, 0.03, [2, 0, 0], [0, -3, 0], { tile: 'mIvy', fx: 0.08 }, [0, 0, 1, 1.5])
  },
  moss(b) {
    b('cutout').quad(-0.8, 0.02, 0.8, [1.6, 0, 0], [0, 0, -1.6], { tile: 'mMoss', color: 0xc0d898 }, [0, 0, 0.8, 0.8])
  },
  debris(b, style) {
    const a = b('atlas')
    const c = style === 1 ? 0x9a8a7a : 0xbab2a6
    a.blob(0, 0.12, 0, 0.35, 0.18, 0.3, { tile: 'mRubble', color: c }, 1, 0.35, 1)
    a.blob(0.4, 0.08, 0.25, 0.2, 0.12, 0.22, { tile: 'mRubble', color: c }, 1, 0.35, 2)
    a.blob(-0.3, 0.06, 0.3, 0.16, 0.1, 0.18, { tile: 'mRubble', color: c }, 1, 0.35, 3)
    a.box(-0.5, 0, -0.45, 0.2, 0.06, -0.2, { tile: 'mConcrete', color: 0xb0aaa0 })
  },
  trash(b) {
    const a = b('atlas')
    a.cylinder(0, 0, 0, 0.3, 0.33, 0.85, 10, { tile: 'mMetal', color: 0x5a7a5a })
    a.blob(0.55, 0.25, 0.1, 0.32, 0.28, 0.3, { tile: 'mTire', color: 0x3a4a3a }, 1, 0.15, 4)
    a.blob(0.35, 0.2, 0.5, 0.26, 0.22, 0.26, { tile: 'mTire', color: 0x2e3540 }, 1, 0.15, 5)
  },
  tire(b, style) {
    const a = b('atlas')
    const n = style === 1 ? 3 : 1
    for (let i = 0; i < n; i++) {
      a.cylinder(0, i * 0.24, 0, 0.36, 0.36, 0.22, 12, { tile: 'mTire', color: 0x3a3a3a }, false)
      a.disc(0, i * 0.24 + 0.22, 0, 0.36, 12, 1, { tile: 'mTire', color: 0x1a1a1a })
    }
  },
  cone(b) {
    const a = b('atlas')
    a.box(-0.22, 0, -0.22, 0.22, 0.05, 0.22, { tile: 'mCarPaint', color: 0xe85a24 })
    a.cylinder(0, 0.05, 0, 0.17, 0.03, 0.6, 10, { tile: 'mCarPaint', color: 0xf26a2a }, false)
    a.cylinder(0, 0.3, 0, 0.11, 0.09, 0.12, 10, { tile: 'mWhite', color: 0xf4f4f4 }, false)
  },
  pole(b) {
    const a = b('atlas')
    const wood: Surf = { tile: 'mBark', color: 0x6a5a4a }
    a.cylinder(0, 0, 0, 0.14, 0.11, 8, 8, wood, true)
    a.box(-1.0, 7.3, -0.06, 1.0, 7.45, 0.06, wood)
    for (const x of [-0.8, 0, 0.8]) a.cylinder(x, 7.45, 0, 0.04, 0.03, 0.18, 6, { tile: 'mWhite', color: 0xd8dde0 })
    a.box(0.12, 5.2, -0.2, 0.5, 5.8, 0.2, { tile: 'mMetal', color: 0x7a8288 })
  },
  banner(b, _style, ctx) {
    const a = b('atlas')
    a.cylinder(0, 0, 0, 0.05, 0.05, 3.6, 6, METAL)
    a.box(-0.6, 3.45, -0.03, 0.6, 3.52, 0.03, METAL)
    b('cutout').quad(-0.55, 1.2, 0.02, [1.1, 0, 0], [0, 2.25, 0], {
      tile: 'mBanner',
      map: 'fit',
      fx: 0.35,
      glow: ctx.night * 0.2
    })
  },
  flag(b, style) {
    const a = b('atlas')
    const colors = [0xe5484d, 0x3e8ed0, 0xf2b33d, 0xff8a3c]
    a.cylinder(0, 0, 0, 0.05, 0.04, 5, 6, METAL)
    b('cutout').quad(
      0.05,
      3.6,
      0,
      [1.5, 0, 0],
      [0, 1.2, 0],
      { tile: 'mCloth', color: colors[style % 4], fx: 0.8 },
      [0, 0, 1, 1]
    )
  },
  puddle(b) {
    b('water').disc(0, 0.02, 0, 1.2, 12, 1, { tile: 'tWater', color: 0x9aa8b8 })
  },
  crane(b, _style, ctx) {
    const a = b('atlas')
    const glow = b('glow')
    const paint: Surf = { tile: 'mRust', color: 0xe8a23a }
    const H = 22
    // Four lattice legs.
    for (const [x, z] of [
      [-6, -4],
      [6, -4],
      [-6, 4],
      [6, 4]
    ]) {
      a.box(x - 0.45, 0, z - 0.45, x + 0.45, H, z + 0.45, paint)
      for (let y = 3; y < H - 2; y += 4) a.tube([x, y, z], [x, y + 4, z - Math.sign(z) * 0.1], 0.06, paint, 0, 1, 4)
    }
    // Portal girders and the boom.
    a.box(-6.5, H, -4.6, 6.5, H + 1.6, -3.4, paint)
    a.box(-6.5, H, 3.4, 6.5, H + 1.6, 4.6, paint)
    a.box(-1.2, H + 1.6, -26, 1.2, H + 3.2, 16, paint)
    // Machinery house and cabin.
    a.box(-2.5, H + 3.2, 8, 2.5, H + 6.4, 14, { tile: 'mContainer', color: 0xe6e2d8 })
    a.box(-1, H - 2, -8, 1, H, -5.5, { tile: 'mContainer', color: 0xe6e2d8 })
    a.box(-0.95, H - 1.4, -8.02, 0.95, H - 0.4, -7.98, { nz: { tile: 'mGlass', map: 'fit' } })
    // Cables and spreader.
    a.tube([0, H + 1.6, -20], [0, 8, -20], 0.05, METAL, 0, 1, 3)
    a.tube([0.5, H + 1.6, -20], [0.5, 8, -20], 0.05, METAL, 0, 1, 3)
    a.box(-3, 7.4, -21, 3, 8, -19, { tile: 'mRust', color: 0xe0b040 })
    // Aircraft warning lights.
    glow.blob(
      0,
      H + 3.4,
      -26,
      0.25,
      0.25,
      0.25,
      { tile: 'mWhite', color: 0xff3a2a, glow: 1 + ctx.night * 3, fx: 0.8 },
      1,
      0
    )
    glow.blob(
      0,
      H + 6.6,
      11,
      0.25,
      0.25,
      0.25,
      { tile: 'mWhite', color: 0xff3a2a, glow: 1 + ctx.night * 3, fx: 0.8 },
      1,
      0
    )
  },
  buoy(b, style, ctx) {
    const a = b('atlas')
    const c = style === 1 ? 0x3aa05a : 0xd8443a
    a.cylinder(0, 0, 0, 0.5, 0.42, 0.9, 10, { tile: 'mCarPaint', color: c })
    a.cylinder(0, 0.9, 0, 0.3, 0.05, 1.0, 8, { tile: 'mCarPaint', color: 0xf0ece0 }, false)
    b('glow').blob(
      0,
      1.95,
      0,
      0.12,
      0.12,
      0.12,
      { tile: 'mWhite', color: 0xfff0a0, glow: 0.5 + ctx.night * 2.5, fx: 0.9 },
      1,
      0
    )
  },
  rope(b) {
    const a = b('atlas')
    const rope: Surf = { tile: 'mCloth', color: 0xc8b088 }
    for (let r = 0; r < 3; r++) {
      const rad = 0.25 + r * 0.08
      for (let i = 0; i < 10; i++) {
        const a0 = (i / 10) * Math.PI * 2
        const a1 = ((i + 1) / 10) * Math.PI * 2
        a.tube(
          [Math.sin(a0) * rad, 0.05 + r * 0.06, Math.cos(a0) * rad],
          [Math.sin(a1) * rad, 0.05 + r * 0.06, Math.cos(a1) * rad],
          0.04,
          rope,
          0,
          1,
          4
        )
      }
    }
  },
  bollard(b) {
    const a = b('atlas')
    a.cylinder(0, 0, 0, 0.18, 0.16, 0.65, 10, { tile: 'mMetal', color: 0x3a3f44 })
    a.cylinder(0, 0.65, 0, 0.26, 0.2, 0.12, 10, { tile: 'mMetal', color: 0x3a3f44 })
  },
  crystalShard(b, style, ctx) {
    const a = b('atlas')
    const s: Surf = { tile: 'mCrystal', glow: 1.3 * ctx.accent }
    prism(a, 0, 0, 0, 0, 0.12, 1.1, 0.16, s)
    prism(a, 0.12, 0, 0.05, 1.2, 0.5, 0.65, 0.1, s)
    if (style !== 1) prism(a, -0.1, 0, -0.06, 3.6, 0.6, 0.55, 0.09, s)
  },
  pod(b, _style, ctx) {
    b('atlas').blob(0, 0.15, 0, 0.6, 0.35, 0.6, { tile: 'mFlesh', glow: 0.3 * ctx.accent }, 1, 0.25, 7)
    b('glow').blob(
      0,
      0.55,
      0,
      0.36,
      0.48,
      0.36,
      { tile: 'mWhite', color: 0xff6ad5, glow: 1.8 * ctx.accent, fx: 0.7 },
      1,
      0.12,
      3
    )
  },
  tendril(b, _style, ctx) {
    const a = b('atlas')
    const glow = b('glow')
    const flesh: Surf = { tile: 'mFlesh', glow: 0.25 * ctx.accent }
    let prev = [0, 0.1, 0]
    for (let i = 1; i <= 6; i++) {
      const p = [Math.sin(i * 1.3) * 0.5, 0.1 + Math.abs(Math.sin(i * 0.9)) * 0.15, i * 0.7]
      a.tube(prev, p, 0.14 - i * 0.015, flesh, 0, 1, 5)
      glow.tube(
        [prev[0], prev[1] + 0.1, prev[2]],
        [p[0], p[1] + 0.1, p[2]],
        0.03,
        { tile: 'mWhite', color: 0xd070ff, glow: 2 * ctx.accent, fx: 0.5 },
        0,
        1,
        3
      )
      prev = p
    }
  },
  holo(b, style, ctx) {
    const a = b('atlas')
    a.box(-0.06, 0, -0.06, 0.06, 2.6, 0.06, { tile: 'mWhite' })
    a.box(-1.25, 1.2, -0.04, 1.25, 1.26, 0.04, { tile: 'mWhite' })
    b('cutout').quad(-1.2, 1.3, 0, [2.4, 0, 0], [0, 1.3, 0], {
      tile: 'mHolo',
      map: 'fit',
      glow: 1.6 * ctx.accent,
      color: style === 1 ? 0xffd9a0 : 0xffffff
    })
  },
  arrow(b, _style, ctx) {
    const glow = b('glow')
    const s: Surf = { tile: 'mWhite', color: 0x4fe6ff, glow: 1.6 * ctx.accent, fx: 0.4 }
    glow.tri([-0.35, 0.03, -1, 0.35, 0.03, -1, 0.35, 0.03, 0.2], s)
    glow.tri([-0.35, 0.03, -1, 0.35, 0.03, 0.2, -0.35, 0.03, 0.2], s)
    glow.tri([-0.8, 0.03, 0.2, 0.8, 0.03, 0.2, 0, 0.03, 1.1], s)
  },
  antenna(b, _style, ctx) {
    const a = b('atlas')
    const m: Surf = { tile: 'mMetal', color: 0x9aa0a6 }
    for (const [x, z] of [
      [-0.3, -0.3],
      [0.3, -0.3],
      [0, 0.35]
    ])
      a.tube([x, 0, z], [x * 0.2, 9, z * 0.2], 0.04, m, 0, 1, 4)
    for (let y = 1.5; y < 8.5; y += 1.5) a.tube([-0.25, y, -0.25], [0.25, y + 0.6, -0.25], 0.02, m, 0, 1, 3)
    a.tube([0, 9, 0], [0, 11, 0], 0.03, m, 0, 1, 4)
    b('glow').blob(
      0,
      11.1,
      0,
      0.12,
      0.12,
      0.12,
      { tile: 'mWhite', color: 0xff3a2a, glow: 1 + ctx.night * 3, fx: 0.9 },
      1,
      0
    )
  },
  watertank(b) {
    const a = b('atlas')
    for (const [lx, lz] of [
      [-0.8, -0.8],
      [0.8, -0.8],
      [-0.8, 0.8],
      [0.8, 0.8]
    ])
      a.box(lx - 0.07, 0, lz - 0.07, lx + 0.07, 1.6, lz + 0.07, { tile: 'mRust', color: 0x8a8a8a })
    a.cylinder(0, 1.6, 0, 1.25, 1.25, 2, 14, { tile: 'mMetal', color: 0x8fb0bf })
    a.cylinder(0, 3.6, 0, 1.25, 0.1, 0.5, 14, { tile: 'mMetal', color: 0x7f9eae })
  },
  acunit(b) {
    const a = b('atlas')
    a.box(-0.5, 0, -0.35, 0.5, 0.7, 0.35, { tile: 'mMetal', color: 0xd0d4d6 })
    a.cylinder(0, 0.35, 0.36, 0.26, 0.26, 0.01, 10, { tile: 'mGrating', color: 0x55606a })
  },
  cherryPetals() {
    // Particles only (see EMITTER_DECOR).
  }
}

function lanternBody(a: GeoBuilder, glow: GeoBuilder, x: number, y: number, color: number, ctx: EnvCtx, z = 0) {
  a.blob(x, y, z, 0.2, 0.27, 0.2, { tile: 'mLantern', color, glow: 0.6 + ctx.night * 1.8 }, 1, 0)
  a.box(x - 0.1, y + 0.25, z - 0.1, x + 0.1, y + 0.31, z + 0.1, { tile: 'mPlanks', color: 0x3a2a20 })
  glow.blob(x, y, z, 0.11, 0.15, 0.11, { tile: 'mWhite', color, glow: 0.5 + ctx.night * 2.5 }, 1, 0)
}

/** Additive light pool on the ground (cheap fake lamp light). */
function pool(b: DecorSink, x: number, z: number, r: number, color: number, strength: number) {
  if (strength < 0.25) return
  b('pool').quad(
    x - r,
    0.04,
    z + r,
    [r * 2, 0, 0],
    [0, 0, -r * 2],
    { tile: 'mWhite', color, glow: strength, map: 'fit' },
    [0, 0, 1, 1]
  )
}

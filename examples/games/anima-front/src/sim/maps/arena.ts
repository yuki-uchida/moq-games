/**
 * ユメクジラ演習場 (arena), 170 × 170 m, virtual. Three-fold rotational symmetry (D3: each third is also mirrored).
 *
 * One third is authored around team 0's base in the north (direction angle a = 0, where a is measured from +z
 * toward +x), then copied at 120° and 240°. Team t's base sits at a = t × 120°, r = 66 m. Each third: the base
 * (back wall, side pylons, three exits), the main lane to the central tower plaza, two low-roof halls joined by a
 * bridge over the lane, two high perches with pads, cover cubes, and on the seam between two thirds a flank
 * corridor with a watch platform. A ring of tall virtual blocks closes the arena (r ≈ 80).
 *
 * Rotating an axis-aligned box by 120° cannot keep it axis-aligned: copies keep their (exactly rotated) centres
 * and swap width/depth. Small parts are therefore square (stairs are chains of overlapping square blocks, bridges
 * are chains of square tiles) so they stay continuous in every third; long parts are kept short.
 */
import type { MapBox, MapDecor, MapDef, TeamId } from '../types'
import { MapBuilder } from './builder'

const BASE_R = 66
const TAU = Math.PI * 2

/** Rotates a ground-plane point so that direction angle a becomes a + t. */
export function rotXZ(x: number, z: number, t: number): [number, number] {
  const c = Math.cos(t)
  const s = Math.sin(t)
  return [x * c + z * s, z * c - x * s]
}

const r2 = (v: number): number => Math.round(v * 100) / 100

export function buildArena(): MapDef {
  const m = new MapBuilder('arena', 'ユメクジラ演習場', 'virtual', { min: [-85, -85], max: [85, 85] }, 4409)
  m.baseGround(6)
  m.closeBounds()
  const b0 = m.boxes.length
  const d0 = m.decor.length
  const p0 = m.pads.length
  const s0 = m.spawns.length

  // ------------------------------------------------------------------ helpers for the authored third
  /** Square block centred at (x, z). */
  const sq = (kind: MapBox['kind'], x: number, z: number, s: number, y0: number, h: number, style = 0): void => {
    m.boxC(kind, x, z, s, s, y0, h, { style })
  }
  /** Stairs as a chain of overlapping square blocks from (x0, z0) toward (x1, z1), rising from y0 to y1. */
  const blockStairs = (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, s = 1.6): void => {
    const n = Math.ceil((y1 - y0) / 0.4 - 1e-6)
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 1 : i / (n - 1)
      sq('stairs', x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, s, 0, y0 + ((y1 - y0) * (i + 1)) / n, 3)
    }
  }
  /** Bridge as a chain of square tiles (top at y) from (x0, z0) to (x1, z1). */
  const bridge = (x0: number, z0: number, x1: number, z1: number, y: number, s = 3): void => {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / (s * 0.75)))
    for (let i = 0; i <= n; i++) sq('platform', x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n, s, y - 0.4, 0.4, 3)
  }
  /** Calls f for x mirrored (+1, −1). */
  const mirror = (f: (sx: number) => void): void => {
    f(1)
    f(-1)
  }
  const polar = (a: number, r: number): [number, number] => [r * Math.sin(a), r * Math.cos(a)]

  // ------------------------------------------------------------------ base (team 0, north)
  m.boxC('ground', 0, BASE_R, 18, 18, -0.3, 0.3, { style: 3 })
  m.bases.push({ team: 0, p: [0, 0, BASE_R], r: 8 })
  for (const dx of [-3, -1, 1, 3]) m.spawn(0, dx, 0, BASE_R + 1.5 - Math.abs(dx) * 0.5, Math.PI)
  m.boxC('building', 0, BASE_R + 13, 26, 5, 0, 10, { style: 7 })
  mirror((sx) => {
    sq('pillar', sx * 10, BASE_R + 6, 3, 0, 7, 2)
    // Gate houses on both sides of the base (low roofs, block stairs from inside the base).
    m.boxC('building', sx * 15, BASE_R + 2, 6, 10, 0, 4, { style: 7 })
    blockStairs(sx * 15, BASE_R - 9, sx * 15, BASE_R - 3.6, 0, 4)
    m.deco('holo', sx * 12, 2.5, BASE_R - 3.2, { yaw: Math.PI })
    m.deco('arrow', sx * 7, 0, BASE_R - 12, { yaw: Math.PI - sx * 0.6 })
  })
  m.deco('holo', 0, 5, BASE_R + 10.4, { yaw: Math.PI, s: 2.5, style: 0 })
  m.deco('arrow', 0, 0, BASE_R - 10, { yaw: Math.PI })
  m.deco('flag', 0, 10, BASE_R + 13)

  // ------------------------------------------------------------------ main lane (base → plaza)
  sq('wall', 0, 52, 2.2, 0, 1.2, 4)
  mirror((sx) => {
    sq('wall', sx * 3.5, 44, 2, 0, 1.2, 4)
    sq('wall', sx * 4, 28, 2, 0, 1.2, 4)
    m.deco('arrow', sx * 1.5, 0, 36, { yaw: Math.PI })
  })
  sq('crate', 0, 36, 2.6, 0, 1.6, 1)

  // ------------------------------------------------------------------ halls with a bridge over the lane
  mirror((sx) => {
    m.boxC('building', sx * 14, 46, 9, 12, 0, 6, { style: 7 })
    blockStairs(sx * 19.3, 34, sx * 19.3, 47, 0, 6, 2)
    m.deco('holo', sx * 9.4, 3, 46, { yaw: sx > 0 ? -Math.PI / 2 : Math.PI / 2 })
  })
  bridge(-11, 46, 11, 46, 6)

  // ------------------------------------------------------------------ high perches (pads in front)
  mirror((sx) => {
    m.boxC('building', sx * 27, 37, 8, 8, 0, 12, { style: 7 })
    m.pad(sx * 27, 0, 29.6, 0)
    sq('wall', sx * 27, 26, 2, 0, 1.2, 4)
    // Low cubes on the inner ring, cover between the halls and the plaza.
    sq('building', sx * 12, 27, 6, 0, 3, 7)
    sq('wall', sx * 21, 22, 3, 0, 1.4, 4)
    m.tree(sx * 32, 52, 4, 1.2)
  })

  // ------------------------------------------------------------------ central tower (one third of it)
  sq('pillar', 0, 6, 3, 0, 13.6, 2)
  m.boxC('platform', 0, 8, 12, 6, 4, 0.4, { style: 3 })
  sq('platform', ...polar(TAU / 6, 9.2), 4.4, 4, 0.4, 3)
  sq('platform', 0, 5, 6, 8.6, 0.4, 3)
  sq('platform', ...polar(TAU / 6, 5.6), 4.4, 8.6, 0.4, 3)
  m.boxC('platform', 0, 3, 6, 6, 13.6, 0.4, { style: 3 })
  blockStairs(0, 18.5, 0, 11.4, 0, 4.4)
  {
    const [px, pz] = polar(TAU / 6, 16)
    m.pad(px, 0, pz, TAU / 6 + Math.PI)
  }
  m.pad(2, 4.4, 9.5, Math.PI)
  mirror((sx) => {
    sq('wall', ...polar(sx * 0.42, 17), 2, 0, 1.2, 4)
    m.deco('holo', sx * 3.2, 9, 7.6, { yaw: 0 })
  })

  // ------------------------------------------------------------------ the seam (flank corridor) at +60°
  {
    const a = TAU / 6
    const [wx, wz] = polar(a, 44)
    sq('building', wx, wz, 6, 0, 4, 7)
    blockStairs(wx - 12.6, wz, wx - 3.6, wz, 0, 4)
    for (const r of [28, 58, 70]) sq('wall', ...polar(a, r), 2.2, 0, 1.2, 4)
    m.deco('holo', ...polar(a, 52), 3)
    m.tree(...polar(a + 0.1, 34), 4, 1.1)
    m.tree(...polar(a - 0.1, 62), 4, 1.1)
  }

  // ------------------------------------------------------------------ flank towers, lane panels, cover
  mirror((sx) => {
    // Flank tower between the base exit and the seam: a 8 m roof with block stairs and a pad up to it.
    m.boxC('building', sx * 37, 47, 8, 8, 0, 8, { style: 7 })
    blockStairs(sx * 31.2, 56, sx * 31.2, 45, 0, 4.4)
    sq('platform', sx * 31.2, 43.2, 3, 4, 0.4, 3)
    m.pad(sx * 31.2, 4.4, 43.2, sx * (Math.PI / 2))
    // Lane panels (jumpable, 2.2 m) and low cubes near the base exit.
    m.boxC('wall', sx * 6.5, 34, 0.8, 5, 0, 2.2, { style: 4 })
    sq('wall', sx * 6, 57, 2.2, 0, 1.2, 4)
    sq('building', sx * 22, 58, 4, 0, 2.6, 7)
    sq('building', sx * 19, 21, 5, 0, 2.6, 7)
    m.deco('holo', sx * 7, 2.2, 34, { yaw: sx > 0 ? -Math.PI / 2 : Math.PI / 2, style: 2 })
    m.deco('holo', sx * 33, 6, 47, { yaw: sx > 0 ? -Math.PI / 2 : Math.PI / 2, style: 3 })
    m.tree(sx * 10, 32, 4, 1)
    m.tree(sx * 24, 64, 4, 1.1)
    m.deco('arrow', sx * 13, 0, 58, { yaw: Math.PI + sx * 0.9 })
    m.deco('grass', sx * 10.5, 0, 31)
    m.deco('flowers', sx * 23.5, 0, 63)
  })
  // Seam colonnade: pylons and low walls along the flank corridor.
  for (const [a, r] of [
    [0.98, 34],
    [1.12, 34],
    [0.99, 54],
    [1.11, 54],
    [1.05, 63]
  ])
    sq('pillar', ...polar(a, r), 1.6, 0, 6, 2)
  sq('wall', ...polar(TAU / 6, 36), 3, 0, 1.3, 4)

  // ------------------------------------------------------------------ outer ring of tall blocks (r ≈ 88)
  for (let i = -5; i <= 6; i++) {
    const [x, z] = polar((i * TAU) / 36, 88)
    sq('building', x, z, 16, 0, i % 2 === 0 ? 16 : 13, 7)
  }
  // Mid-ring cover on the base side lanes.
  mirror((sx) => {
    const [x, z] = polar(sx * 0.62, 56)
    sq('wall', x, z, 2.4, 0, 1.3, 4)
    m.deco('arrow', ...polar(sx * 0.55, 62), 0, { yaw: sx * 0.55 + Math.PI })
  })

  // Floor arrows guiding to the plaza, holo signage and soft greenery.
  for (const r of [20, 30, 40]) m.deco('arrow', 0, 0, r, { yaw: Math.PI, s: 1.4 })
  mirror((sx) => {
    for (const r of [30, 44, 56]) m.deco('arrow', ...polar(sx * 0.95, r), 0, { yaw: sx * 0.95 + Math.PI })
    m.deco('holo', sx * 27, 12.5, 37, { s: 1.5, style: 4 })
    m.deco('holo', sx * 14, 6.6, 46, { s: 1.2, style: 5 })
    m.deco('holo', ...polar(sx * 0.3, 79), 6, { yaw: sx * 0.3 + Math.PI, s: 3, style: 6 })
    m.deco('bush', sx * 9, 0, 61)
    m.deco('grass', sx * 25.5, 0, 26)
    m.deco('flowers', sx * 18, 0, 31)
    m.deco('lamp', sx * 8, 0, 40, { yaw: sx > 0 ? -Math.PI / 2 : Math.PI / 2 })
    m.deco('lamp', ...polar(sx * 0.5, 24), 0)
  })
  m.deco('holo', ...polar(TAU / 6, 70), 4, { yaw: TAU / 6 + Math.PI, s: 2, style: 7 })
  m.deco('lamp', ...polar(TAU / 6, 40), 0)

  // ------------------------------------------------------------------ copy the third at 120° and 240°
  const boxes = m.boxes.slice(b0)
  const decor = m.decor.slice(d0)
  const pads = m.pads.slice(p0)
  const spawns = m.spawns.slice(s0)
  const bases = [...m.bases]
  for (const t of [1, 2] as const) {
    const th = (t * TAU) / 3
    for (const b of boxes) {
      const cx = (b.min[0] + b.max[0]) / 2
      const cz = (b.min[2] + b.max[2]) / 2
      const hw = (b.max[2] - b.min[2]) / 2
      const hd = (b.max[0] - b.min[0]) / 2
      const [x, z] = rotXZ(cx, cz, th)
      const nb: MapBox = { ...b, min: [r2(x - hw), b.min[1], r2(z - hd)], max: [r2(x + hw), b.max[1], r2(z + hd)] }
      m.boxes.push(nb)
    }
    for (const d of decor) {
      const [x, z] = rotXZ(d.p[0], d.p[2], th)
      const nd: MapDecor = { ...d, p: [r2(x), d.p[1], r2(z)], yaw: r2((d.yaw ?? 0) + th) }
      m.decor.push(nd)
    }
    for (const p of pads) {
      const [x, z] = rotXZ(p.p[0], p.p[2], th)
      m.pads.push({ p: [r2(x), p.p[1], r2(z)], yaw: r2(p.yaw + th) })
    }
    for (const s of spawns) {
      const [x, z] = rotXZ(s.p[0], s.p[2], th)
      m.spawns.push({ team: t as TeamId, p: [r2(x), s.p[1], r2(z)], yaw: r2(s.yaw + th) })
    }
    for (const b of bases) {
      const [x, z] = rotXZ(b.p[0], b.p[2], th)
      m.bases.push({ team: t as TeamId, p: [r2(x), b.p[1], r2(z)], r: b.r })
    }
  }

  m.anchor('plaza', 0, 0, 0)
  m.deco('holo', 0, 14, 0, { s: 3, style: 1 })
  return m.build()
}

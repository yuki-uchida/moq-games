/**
 * Procedural city blocks: a block is split (BSP) into lots separated by 4 m alleys that always run through to a
 * street or another alley, so blocks never create dead ends. Lots become buildings (some with exterior stairs to
 * the roof), or open courtyards with clutter. A post pass adds frog pads in front of tall buildings.
 */
import type { MapBox } from '../types'
import { type Dir, MapBuilder } from './builder'

export interface Rect {
  x0: number
  z0: number
  x1: number
  z1: number
}

export interface StyleChoice {
  style: number
  h: [number, number]
  w: number
}

export interface BlockSpec extends Rect {
  styles: StyleChoice[]
  alley?: number
  lotMin?: number
  lotMax?: number
  /** Chance that a low building (≤ 6.5 m) gets exterior stairs to its roof. */
  stairsP?: number
  courtyardP?: number
  /** Points (with radius) that must stay free of buildings: foe spawns, anchors… */
  keep?: { x: number; z: number; r: number }[]
  /** Clutter style for courtyards. */
  clutter?: 'city' | 'ruin' | 'home'
}

export interface Lot extends Rect {
  b?: MapBox
}

const overlapsKeep = (r: Rect, keep: BlockSpec['keep']): boolean =>
  (keep ?? []).some(
    (k) => Math.hypot(Math.max(r.x0, Math.min(k.x, r.x1)) - k.x, Math.max(r.z0, Math.min(k.z, r.z1)) - k.z) < k.r
  )

/** Splits a rectangle into lots with alleys between them. */
export function splitLots(m: MapBuilder, r: Rect, lotMin: number, lotMax: number, alley: number): Rect[] {
  const w = r.x1 - r.x0
  const d = r.z1 - r.z0
  if (w <= lotMax && d <= lotMax) return [r]
  const alongX = w >= d
  const len = alongX ? w : d
  // Long cuts are always alleys (permeable blocks); short ones may be party walls (row houses).
  const gap = len > 26 || m.chance(0.5) ? alley : 0
  if (len < lotMin * 2 + gap) return [r]
  const at = m.r(lotMin, len - lotMin - gap)
  alley = gap
  if (alongX) {
    return [
      ...splitLots(m, { ...r, x1: r.x0 + at }, lotMin, lotMax, alley),
      ...splitLots(m, { ...r, x0: r.x0 + at + alley }, lotMin, lotMax, alley)
    ]
  }
  return [
    ...splitLots(m, { ...r, z1: r.z0 + at }, lotMin, lotMax, alley),
    ...splitLots(m, { ...r, z0: r.z0 + at + alley }, lotMin, lotMax, alley)
  ]
}

function pickStyle(m: MapBuilder, styles: StyleChoice[]): StyleChoice {
  const total = styles.reduce((s, c) => s + c.w, 0)
  let t = m.r(0, total)
  for (const c of styles) {
    t -= c.w
    if (t <= 0) return c
  }
  return styles[styles.length - 1]
}

/** Courtyard dressing: crates, a car, trees, decor. Keeps a 2 m margin so the yard stays walkable. */
export function clutter(m: MapBuilder, r: Rect, kind: 'city' | 'ruin' | 'home'): void {
  const cx = (r.x0 + r.x1) / 2
  const cz = (r.z0 + r.z1) / 2
  const w = r.x1 - r.x0
  const d = r.z1 - r.z0
  if (kind === 'ruin') {
    m.boxC('rock', cx + m.r(-w / 4, w / 4), cz + m.r(-d / 4, d / 4), m.r(1.5, 3), m.r(1.5, 3), 0, m.r(0.6, 1.4), {
      style: 1
    })
    if (m.chance(0.5)) m.tree(cx + m.r(-w / 3, w / 3), cz + m.r(-d / 3, d / 3), 2, m.r(0.8, 1.1))
    m.scatter(['debris', 'grass', 'grass', 'moss', 'tire'], 5, r.x0 + 1, r.z0 + 1, r.x1 - 1, r.z1 - 1)
    return
  }
  if (kind === 'home') {
    m.tree(cx + m.r(-w / 4, w / 4), cz + m.r(-d / 4, d / 4), m.pick([1, 1, 0, 3]), m.r(0.9, 1.2))
    m.scatter(['bush', 'flowers', 'grass', 'bench'], 5, r.x0 + 1, r.z0 + 1, r.x1 - 1, r.z1 - 1)
    return
  }
  // City yard: a stack of crates (climbable), maybe a parked car.
  const sx = cx + m.r(-w / 5, w / 5)
  const sz = cz + m.r(-d / 5, d / 5)
  m.crate(sx, sz, 1.3, m.pick([0, 1]))
  if (m.chance(0.6)) m.crate(sx + 1.3, sz, 1.3, m.pick([0, 1]))
  if (m.chance(0.5)) m.crate(sx, sz, 1.1, 0, 1.3)
  if (w > 9 && d > 9 && m.chance(0.5)) m.car(cx + m.r(-1, 1), cz - d / 4, w > d, m.pick([0, 1, 3]))
  m.scatter(['trash', 'tire', 'cone', 'debris', 'vending'], 4, r.x0 + 1, r.z0 + 1, r.x1 - 1, r.z1 - 1)
}

/**
 * Fills a block with lots. Returns the lots with their building box (if any), so callers can add pads/decor.
 */
export function fillBlock(m: MapBuilder, spec: BlockSpec): Lot[] {
  const lots = splitLots(m, spec, spec.lotMin ?? 7, spec.lotMax ?? 14, spec.alley ?? 4)
  const out: Lot[] = []
  for (const lot of lots) {
    const w = lot.x1 - lot.x0
    const d = lot.z1 - lot.z0
    if (overlapsKeep(lot, spec.keep) || m.chance(spec.courtyardP ?? 0.12) || w < 4 || d < 4) {
      clutter(m, lot, spec.clutter ?? 'city')
      out.push(lot)
      continue
    }
    const st = pickStyle(m, spec.styles)
    let h = Math.round(m.r(st.h[0], st.h[1]) * 2) / 2
    const r = { ...lot }
    // Exterior stairs along one long side for low buildings.
    if (h <= 6.5 && m.chance(spec.stairsP ?? 0.3)) {
      const alongX = w >= d
      const len = alongX ? w : d
      while (MapBuilder.run(0, h) > len - 0.4 && h > 3) h -= 0.5
      if (MapBuilder.run(0, h) <= len - 0.4) {
        const side = m.chance(0.5)
        const sw = 2.2
        if (alongX) {
          const z = side ? lot.z0 : lot.z1 - sw
          if (side) r.z0 += sw
          else r.z1 -= sw
          const dir: Dir = m.chance(0.5) ? 'e' : 'w'
          const x = dir === 'e' ? lot.x1 - 0.2 - MapBuilder.run(0, h) : lot.x0 + 0.2 + MapBuilder.run(0, h)
          m.stairs(x, z + sw / 2, dir, 0, h, sw, 0)
        } else {
          const x = side ? lot.x0 : lot.x1 - sw
          if (side) r.x0 += sw
          else r.x1 -= sw
          const dir: Dir = m.chance(0.5) ? 'n' : 's'
          const z = dir === 'n' ? lot.z1 - 0.2 - MapBuilder.run(0, h) : lot.z0 + 0.2 + MapBuilder.run(0, h)
          m.stairs(x + sw / 2, z, dir, 0, h, sw, 0)
        }
      }
    }
    const b = m.building((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, r.x1 - r.x0, r.z1 - r.z0, h, st.style)
    out.push({ ...lot, b })
    if (st.style === 8) {
      // Ruins: a rubble heap against one wall (a jump up to the broken roof) and a lone wall stub.
      const rx = m.chance(0.5) ? r.x0 - 0.8 : r.x1 + 0.8
      const rz = m.r(r.z0 + 1.5, r.z1 - 1.5)
      if (rx > spec.x0 + 1 && rx < spec.x1 - 1)
        m.boxC('rock', rx, rz, 1.6, 2.4, 0, Math.min(1.3, h - 0.5), { style: 1 })
      m.deco('debris', rx, 0, rz + 2)
      m.deco('ivy', r.x0 - 0.05, 1.5, (r.z0 + r.z1) / 2, { yaw: -Math.PI / 2 })
    }
  }
  return out
}

/** True when the vertical column around (x, z) of radius r is free of solid non-floor boxes up to height h. */
export function columnFree(m: MapBuilder, x: number, z: number, r: number, y0 = 0, h = 2): boolean {
  return !m.boxes.some(
    (b) =>
      b.kind !== 'ground' &&
      b.kind !== 'road' &&
      b.solid !== false &&
      b.min[0] < x + r &&
      b.max[0] > x - r &&
      b.min[2] < z + r &&
      b.max[2] > z - r &&
      b.min[1] < y0 + h &&
      b.max[1] > y0 + 0.05
  )
}

/**
 * Adds a frog pad in front of buildings whose roof is between `minH` and 12.4 m (a pad reaches ≈ 12.5 m), at
 * most one per building, with probability p. Pads sit 2.6 m from the wall, facing it, on free ground.
 */
export function padsForTall(m: MapBuilder, lots: Lot[], p: number, minH = 8): void {
  for (const lot of lots) {
    const b = lot.b
    if (!b || b.max[1] < minH || b.max[1] > 12.4 || !m.chance(p)) continue
    const cx = (b.min[0] + b.max[0]) / 2
    const cz = (b.min[2] + b.max[2]) / 2
    const sides: [Dir, number, number][] = [
      ['n', cx, b.max[2] + 2.6],
      ['s', cx, b.min[2] - 2.6],
      ['e', b.max[0] + 2.6, cz],
      ['w', b.min[0] - 2.6, cz]
    ]
    for (let i = 0; i < 4; i++) {
      const [dir, x, z] = sides[(i + m.ri(0, 3)) % 4]
      if (!columnFree(m, x, z, 1.2, 0, 3)) continue
      if (x < m.bounds.min[0] + 2 || x > m.bounds.max[0] - 2 || z < m.bounds.min[1] + 2 || z > m.bounds.max[1] - 2)
        continue
      const back: Record<Dir, number> = { n: Math.PI, s: 0, e: -Math.PI / 2, w: Math.PI / 2 }
      m.pad(x, 0, z, back[dir])
      break
    }
  }
}

/**
 * Plank bridges between low roofs (≤ 7 m) of nearly equal height (≤ 0.45 m apart) across an alley 2–6 m wide,
 * where the facing walls overlap by ≥ 2.5 m. Bridges sit at the lower roof height; their clearance stays ≥ 3 m.
 */
export function roofBridges(m: MapBuilder, lots: Lot[], p: number, style = 1): number {
  let n = 0
  /** Free span under (and at) the deck, and no pad below it. */
  const free = (x0: number, z0: number, x1: number, z1: number, h: number, a: MapBox, b: MapBox): boolean =>
    !m.boxes.some(
      (o) =>
        o !== a &&
        o !== b &&
        o.solid !== false &&
        o.kind !== 'ground' &&
        o.kind !== 'road' &&
        o.min[0] < x1 &&
        o.max[0] > x0 &&
        o.min[2] < z1 &&
        o.max[2] > z0 &&
        o.max[1] > h - 3.2 &&
        o.min[1] < h + 2
    ) && !m.pads.some((pd) => pd.p[0] > x0 - 1 && pd.p[0] < x1 + 1 && pd.p[2] > z0 - 1 && pd.p[2] < z1 + 1)
  const roofs = lots.map((l) => l.b).filter((b): b is MapBox => !!b && b.max[1] >= 3 && b.max[1] <= 7)
  for (let i = 0; i < roofs.length; i++) {
    for (let j = i + 1; j < roofs.length; j++) {
      const a = roofs[i]
      const b = roofs[j]
      const h = Math.min(a.max[1], b.max[1])
      if (Math.abs(a.max[1] - b.max[1]) > 0.45) continue
      // Gap along x with overlap along z.
      const oz0 = Math.max(a.min[2], b.min[2])
      const oz1 = Math.min(a.max[2], b.max[2])
      const ox0 = Math.max(a.min[0], b.min[0])
      const ox1 = Math.min(a.max[0], b.max[0])
      const [l, r] = a.max[0] <= b.min[0] ? [a, b] : [b, a]
      const gx = r.min[0] - l.max[0]
      const [lo, hi] = a.max[2] <= b.min[2] ? [a, b] : [b, a]
      const gz = hi.min[2] - lo.max[2]
      if (gx >= 2 && gx <= 6 && oz1 - oz0 >= 2.5 && m.chance(p)) {
        const z = (oz0 + oz1) / 2
        if (!free(l.max[0], z - 0.8, r.min[0], z + 0.8, h, a, b)) continue
        m.box('platform', l.max[0] - 0.3, h - 0.3, z - 0.8, r.min[0] + 0.3, h, z + 0.8, { style })
        n++
      } else if (gz >= 2 && gz <= 6 && ox1 - ox0 >= 2.5 && m.chance(p)) {
        const x = (ox0 + ox1) / 2
        if (!free(x - 0.8, lo.max[2], x + 0.8, hi.min[2], h, a, b)) continue
        m.box('platform', x - 0.8, h - 0.3, lo.max[2] - 0.3, x + 0.8, h, hi.min[2] + 0.3, { style })
        n++
      }
    }
  }
  return n
}

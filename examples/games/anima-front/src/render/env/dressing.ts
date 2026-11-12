/**
 * Ground storytelling derived from the map data: wear, cracks, damp stains and drains on roads and pavements,
 * grass creeping along road edges, moss patches, and the painted markings of the ARK training yard (lane lines,
 * the firing line, arrows along the tutorial track, the paw emblem at the entry). Pure planning.
 */
import type { MapBox, MapDef, V3 } from '../../sim/types'
import { hash01, type EnvCtx } from './ctx'
import type { Surf } from './geo'

/** Highest box top under (x, z), bucketed on an 8 m grid. */
function topSampler(map: MapDef): (x: number, z: number) => MapBox | null {
  const CELL = 8
  const cells = new Map<string, MapBox[]>()
  for (const b of map.boxes) {
    if (b.kind === 'barrier') continue
    for (let x = Math.floor(b.min[0] / CELL); x <= Math.floor(b.max[0] / CELL); x++)
      for (let z = Math.floor(b.min[2] / CELL); z <= Math.floor(b.max[2] / CELL); z++) {
        const k = `${x},${z}`
        let l = cells.get(k)
        if (!l) cells.set(k, (l = []))
        l.push(b)
      }
  }
  return (x, z) => {
    const l = cells.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`)
    let best: MapBox | null = null
    if (!l) return null
    for (const b of l)
      if (x >= b.min[0] && x <= b.max[0] && z >= b.min[2] && z <= b.max[2] && (!best || b.max[1] > best.max[1]))
        best = b
    return best
  }
}

/** Decal quarter of the mDecal tile: 0 crack web, 1 damp stain, 2 worn patch, 3 drain. */
const DECAL_UV: [number, number, number, number][] = [
  [0, 0.5, 0.5, 1],
  [0.5, 0.5, 1, 1],
  [0, 0, 0.5, 0.5],
  [0.5, 0, 1, 0.5]
]

export function buildDressing(map: MapDef, ctx: EnvCtx) {
  const top = topSampler(map)
  const virtual = ctx.theme.id === 'virtual'
  if (!virtual) groundWear(map, ctx, top)
  if (map.id === 'range') rangeMarkings(map, ctx)
}

function decal(
  ctx: EnvCtx,
  x: number,
  y: number,
  z: number,
  size: number,
  rot: number,
  which: number,
  tint = 0xffffff
) {
  const c = Math.cos(rot) * size
  const s = Math.sin(rot) * size
  const uv = DECAL_UV[which]
  ctx
    .at('cutout', x, z)
    .card(x, y + 0.025, z, [s, 0, c], [c, 0, -s], [0, 1, 0], { tile: 'mDecal', color: tint }, [
      uv[0] + 0.004,
      uv[1] + 0.004,
      uv[2] - 0.004,
      uv[3] - 0.004
    ])
}

function groundWear(map: MapDef, ctx: EnvCtx, top: (x: number, z: number) => MapBox | null) {
  const grassTint = ctx.theme.id === 'blight' ? 0xb090c0 : ctx.theme.id === 'sunset' ? 0xe8d0a0 : 0xd8eaa8
  for (const b of map.boxes) {
    if (b.kind !== 'road' && b.kind !== 'ground') continue
    const style = b.style ?? 0
    if (b.kind === 'ground' && (style === 0 || style === 6 || style === 7)) continue
    const [x0, , z0] = b.min
    const [x1, y1, z1] = b.max
    const area = (x1 - x0) * (z1 - z0)
    if (area < 4) continue
    const asphalt = b.kind === 'road' && style === 0
    // Wear and cracks: about one per 45 m² of asphalt, fewer on pavements.
    const n = Math.round((area / (asphalt ? 45 : 90)) * ctx.density)
    for (let i = 0; i < n; i++) {
      const x = x0 + 1 + hash01(x0, z0, i, 1) * (x1 - x0 - 2)
      const z = z0 + 1 + hash01(z0, x0, i, 2) * (z1 - z0 - 2)
      const t = top(x, z)
      if (t !== b) continue
      const k = hash01(x, z, i, 3)
      const which = asphalt ? (k < 0.4 ? 0 : k < 0.7 ? 1 : k < 0.92 ? 2 : 3) : k < 0.55 ? 0 : k < 0.85 ? 1 : 2
      const size = which === 3 ? 0.6 : 0.9 + hash01(i, x, z) * 1.6
      decal(ctx, x, y1, z, size, k * 6.28, which, asphalt ? 0xffffff : 0xe8e0d4)
    }
    // Grass and moss creeping along the long edges of roads.
    if (b.kind !== 'road' || !ctx.overgrowth) continue
    const alongX = x1 - x0 >= z1 - z0
    const len = alongX ? x1 - x0 : z1 - z0
    for (const sideOff of [-0.35, 0.35]) {
      for (let t = 0.8; t < len - 0.8; t += 1.6 + hash01(t, x0, z0, sideOff) * 2.2) {
        const x = alongX ? x0 + t : sideOff < 0 ? x0 + 0.25 : x1 - 0.25
        const z = alongX ? (sideOff < 0 ? z0 + 0.25 : z1 - 0.25) : z0 + t
        // Only where the road meets open ground (not a building, kerb or another road).
        const ox = alongX ? x : x + Math.sign(sideOff) * 0.9
        const oz = alongX ? z + Math.sign(sideOff) * 0.9 : z
        const nb = top(ox, oz)
        if (nb && !(nb.kind === 'ground' && (nb.style ?? 0) === 0) && nb.max[1] > y1 + 0.3) continue
        if (nb && nb.kind === 'road') continue
        if (hash01(x, z, 7) < 0.25) continue
        ctx
          .at('cutout', x, z)
          .cross(x, y1, z, 0.7, 0.32 + hash01(x, z, 8) * 0.25, { tile: 'mGrass', color: grassTint, fx: 1 }, 2, t)
      }
    }
  }
}

const PAINT: Surf = { tile: 'mPaint', color: 0xf4f1e8 }
const YELLOW: Surf = { tile: 'mPaint', color: 0xf2b43a }
const ORANGE: Surf = { tile: 'mPaint', color: 0xf08a30 }

function stripe(ctx: EnvCtx, ax: number, az: number, bx: number, bz: number, y: number, w: number, s: Surf) {
  const dx = bx - ax
  const dz = bz - az
  const l = Math.hypot(dx, dz) || 1
  const nx = (-dz / l) * (w / 2)
  const nz = (dx / l) * (w / 2)
  const g = ctx.at('atlas', (ax + bx) / 2, (az + bz) / 2)
  // Front face up: (e1 × e2).y > 0 with e1 along the stripe and e2 across it.
  const e1: [number, number, number] = [dx, 0, dz]
  const e2: [number, number, number] = [-2 * nx, 0, -2 * nz]
  const up = e1[2] * e2[0] - e1[0] * e2[2]
  if (up >= 0) g.quad(ax + nx, y, az + nz, e1, e2, { ...s, map: 'fit' })
  else g.quad(ax - nx, y, az - nz, e1, [2 * nx, 0, 2 * nz], { ...s, map: 'fit' })
}

function rangeMarkings(map: MapDef, ctx: EnvCtx) {
  const y = 0.02
  // Shooting lanes: lines between the four lanes, the firing line and distance ticks.
  const lanes = [1, 2, 3, 4].map((i) => map.anchors[`target${i}`]).filter(Boolean) as V3[]
  if (lanes.length === 4) {
    const zs = lanes.map((a) => a[2]).sort((a, b) => a - b)
    const pitch = zs[1] - zs[0]
    const xStart = -19.4
    const xEnd = 26
    for (let i = 0; i <= zs.length; i++) {
      const z = zs[0] - pitch / 2 + i * pitch
      stripe(ctx, xStart, z, xEnd, z, y, 0.16, PAINT)
    }
    stripe(ctx, xStart, zs[0] - pitch / 2, xStart, zs[3] + pitch / 2, y + 0.002, 0.4, YELLOW)
    for (const x of [0, 10, 18])
      for (const z of zs) stripe(ctx, x - 0.05, z - 1.2, x - 0.05, z + 1.2, y + 0.001, 0.12, PAINT)
  }
  // Arrows along the tutorial track (only between checkpoints on the same level).
  for (let i = 1; i < 8; i++) {
    const a = map.anchors[`tutorial${i}`]
    const b = map.anchors[`tutorial${i + 1}`]
    if (!a || !b || Math.abs(a[1] - b[1]) > 0.1) continue
    const dx = b[0] - a[0]
    const dz = b[2] - a[2]
    const l = Math.hypot(dx, dz)
    if (l < 4 || l > 40) continue
    for (let t = 2; t < l - 2; t += 3) arrow(ctx, a[0] + (dx / l) * t, a[1] + y, a[2] + (dz / l) * t, dx / l, dz / l)
  }
  // ARK paw emblem in front of the entry hut.
  const base = map.bases[0]?.p
  if (base) paw(ctx, base[0], base[1] + y + 0.004, base[2] - 6.2, 2.2)
}

function arrow(ctx: EnvCtx, x: number, y: number, z: number, dx: number, dz: number) {
  const g = ctx.at('atlas', x, z)
  const px = -dz
  const pz = dx
  const p = (f: number, s: number): number[] => [x + dx * f + px * s, y, z + dz * f + pz * s]
  // Chevron: two triangles per arm, wound to face up.
  const tri = (a: number[], b: number[], c: number[]) => {
    const ux = b[0] - a[0]
    const uz = b[2] - a[2]
    const vx = c[0] - a[0]
    const vz = c[2] - a[2]
    const ny = uz * vx - ux * vz
    g.tri(ny >= 0 ? [...a, ...b, ...c] : [...a, ...c, ...b], YELLOW)
  }
  tri(p(0.6, 0), p(-0.2, 0.7), p(-0.55, 0.7))
  tri(p(0.6, 0), p(-0.55, 0.7), p(0.25, 0))
  tri(p(0.6, 0), p(-0.2, -0.7), p(-0.55, -0.7))
  tri(p(0.6, 0), p(-0.55, -0.7), p(0.25, 0))
}

function paw(ctx: EnvCtx, x: number, y: number, z: number, s: number) {
  const g = ctx.at('atlas', x, z)
  g.disc(x, y, z + s * 0.2, s * 0.55, 18, 1, ORANGE)
  for (const [dx, dz] of [
    [-0.55, -0.35],
    [-0.2, -0.68],
    [0.2, -0.68],
    [0.55, -0.35]
  ])
    g.disc(x + dx * s, y, z - dz * s, s * 0.2, 12, 1, ORANGE)
}

/**
 * `fx` (2/3): leaf, needle, chip, clod, shard, drop, splash, bubble, gush, honey, feather.
 * Small tumbling bits the view throws out of gimmicks, plus the water effects.
 */
import type { SheetModule } from '../module'
import { C, R, type Ramp } from '../palette'
import { Raster, outlineWith, part } from '../raster'
import { TAU, blob, clamp01, frames, make } from './impacts'

/** A pointed leaf-like shape along a shaft: `fn(u/length)` gives the half width. Returns the painted layer. */
function shaft(
  w: number,
  h: number,
  cx: number,
  cy: number,
  length: number,
  angle: number,
  halfWidth: (s: number) => number,
  colour: (s: number, side: number) => number
) {
  const l = new Raster(w, h)
  const ca = Math.cos(angle)
  const sa = Math.sin(angle)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      const u = dx * ca + dy * sa
      const v = -dx * sa + dy * ca
      const s = u / length + 0.5
      if (s < 0 || s > 1) continue
      const hw = halfWidth(s)
      if (Math.abs(v) <= hw) {
        const c = colour(s, v)
        if (c) l.data[y * w + x] = c
      }
    }
  return l
}

// ----------------------------------------------------------------------------------------- leaf, needle

function leaf(): Raster[] {
  const spec = [
    [-0.7, 1],
    [0.1, 0.55],
    [0.9, 1],
    [1.8, 0.5]
  ] as const
  return spec.map(([angle, fat]) => {
    const r = new Raster(16, 16)
    const l = shaft(
      16,
      16,
      8,
      8,
      11,
      angle,
      (s) => 4.1 * fat * Math.sin(Math.PI * s) ** 0.75 + 0.2,
      (s, v) => (Math.abs(v) < 0.55 ? R.leaf[2] : v < 0 ? R.leaf[0] : R.leaf[1])
    )
    r.blit(outlineWith(l, R.leaf[4]))
    // The stem sticks out of the base.
    const sx = 8 - Math.cos(angle) * 6.4
    const sy = 8 - Math.sin(angle) * 6.4
    r.set(sx, sy, R.leaf[3])
    return r
  })
}

function needle(): Raster[] {
  const spec = [
    [-0.9, 0.5, 2.1],
    [-0.15, 0.95, 2.6]
  ] as const
  return spec.map(([a1, a2, a3]) => {
    const r = new Raster(8, 8)
    for (const [a, len, ox, oy] of [
      [a1, 3.2, 3.5, 4.2],
      [a2, 3.4, 4.5, 3.4],
      [a3, 2.6, 3.8, 3.8]
    ] as const) {
      const x0 = ox - Math.cos(a) * len
      const y0 = oy - Math.sin(a) * len
      r.line(x0, y0, ox + Math.cos(a) * len, oy + Math.sin(a) * len, R.leaf[1])
      r.set(x0, y0, R.pineLeaf[1])
    }
    return r
  })
}

// ------------------------------------------------------------------------------- chip, clod, shard

function chip(): Raster[] {
  return [
    [0.4, 0],
    [-0.7, 1]
  ].map(([angle, kind]) => {
    const r = new Raster(8, 8)
    const l = shaft(
      8,
      8,
      4,
      4,
      kind ? 4.4 : 5.4,
      angle,
      (s) => (kind ? 1.5 : 1.2) * (1 - 0.3 * s) + 0.2,
      (_s, v) => (v < -0.3 ? R.wood[0] : v > 0.5 ? R.wood[2] : R.wood[1])
    )
    return r.blit(outlineWith(l, R.wood[3]))
  })
}

function clod(): Raster[] {
  return [0, 1].map((k) => {
    const r = new Raster(12, 12)
    const bumps = k
      ? [
          [5.6, 6.2, 3.3, 2.9],
          [7.4, 5.4, 2.1, 2],
          [4, 7.4, 1.8, 1.6]
        ]
      : [
          [6, 6, 3.6, 3],
          [4.2, 5.2, 2, 2],
          [7.6, 7.2, 2, 1.7]
        ]
    for (const [x, y, rx, ry] of bumps) part(r, (l) => l.ellipse(x, y, rx, ry, R.clay[1]), false)
    // Light from the top-left: shade the lower-right edge, brighten the upper-left.
    const src = r.clone()
    for (let y = 0; y < 12; y++)
      for (let x = 0; x < 12; x++) {
        if (!src.get(x, y)) continue
        if (!src.get(x + 1, y) || !src.get(x, y + 1)) r.set(x, y, R.clay[2])
        else if (!src.get(x - 1, y) || !src.get(x, y - 1)) r.set(x, y, R.clay[0])
      }
    r.set(k ? 6 : 7, 6, R.clay[3])
    outlineWith(r, R.clay[4])
    return r
  })
}

function shard(): Raster[] {
  const polys = [
    [2, 8, 4, 2, 9, 5, 8, 9],
    [3, 3, 9, 2, 10, 8, 5, 9],
    [2, 6, 5, 2, 10, 6, 4, 10]
  ]
  return polys.map((pts) => {
    const r = new Raster(12, 12)
    r.poly(pts, R.rock[1])
    // One lit facet (upper left) and one shaded facet (lower right) make it chiselled.
    const cx = pts.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0) / (pts.length / 2)
    const cy = pts.filter((_, i) => i % 2).reduce((a, b) => a + b, 0) / (pts.length / 2)
    r.map((_, x, y) => {
      const d = x + 0.5 - cx + (y + 0.5 - cy)
      return d < -1.5 ? R.rock[0] : d > 1.2 ? R.rock[2] : R.rock[1]
    })
    return outlineWith(r, R.rock[4])
  })
}

// -------------------------------------------------------------------------- drop, honey, bubble, splash

/** A teardrop: pointed top, round belly. `stretch` > 1 pulls it long as it falls. */
function teardrop(ramp: Ramp, stretch: number, tilt: number) {
  const r = new Raster(8, 8)
  const belly = 2.5
  const cy = 5 - (stretch - 1) * 0.5
  r.ellipse(4 + tilt * 0.3, cy, belly, belly * (stretch > 1 ? 1.15 : 1), ramp[1])
  r.poly([4 + tilt, 0.6 - (stretch - 1), 2.1 + tilt * 0.4, cy - 0.5, 5.9 + tilt * 0.4, cy - 0.5], ramp[1])
  const src = r.clone()
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      if (!src.get(x, y)) continue
      if (!src.get(x + 1, y) || !src.get(x, y + 1)) r.set(x, y, ramp[2])
    }
  r.set(3 + tilt * 0.3, cy, ramp[0])
  r.set(3 + tilt * 0.3, cy - 1, ramp[0])
  return outlineWith(r, ramp[4])
}

const drop = (): Raster[] => [teardrop(R.water, 1, 0), teardrop(R.water, 1.3, 1)]
const honey = (): Raster[] => [teardrop(R.honey, 1.15, 0), teardrop(R.honey, 0.9, -1)]

function bubble(): Raster[] {
  return [
    [2.9, 3.3, 0],
    [3.3, 2.9, 1],
    [3.1, 3.1, 2]
  ].map(([rx, ry, k]) => {
    const r = new Raster(8, 8)
    r.ring(4, 4, 0, 4, R.water[3]) // placeholder disc, trimmed below
    r.data.fill(0)
    r.ellipse(4, 4, rx + 0.6, ry + 0.6, R.water[2])
    r.ellipse(4, 4, rx - 0.4, ry - 0.4, 0)
    // Inner rim in light blue, highlight dot at the top left (it wanders as the bubble wobbles).
    const src = r.clone()
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++)
        if (!src.get(x, y) && src.get(x + 1, y) + src.get(x, y + 1) + src.get(x - 1, y) + src.get(x, y - 1) > 0)
          r.set(x, y, 0)
    r.ellipse(4, 4, rx - 0.5, ry - 0.5, 0)
    const hx = [2, 3, 2][k]
    const hy = [2, 2, 3][k]
    r.set(hx, hy, C.white)
    r.set(hx + 1, hy - (k === 2 ? 1 : 0), R.water[0])
    return r
  })
}

/** The crown splash: a rim of water fingers rises from the surface, opens, and falls back as droplets. */
function splash(): Raster[] {
  // Per frame: crown half width, height, tooth count, centre dip, droplet positions [dx, height], ripple half width.
  const S: { W: number; H: number; teeth: number; dip: number; drops: [number, number][]; ripple: number }[] = [
    { W: 3.5, H: 15, teeth: 1, dip: 0, drops: [[0, 14]], ripple: 4 },
    {
      W: 8,
      H: 21,
      teeth: 3,
      dip: 0.25,
      drops: [
        [-10, 21],
        [10, 20],
        [0, 27]
      ],
      ripple: 8
    },
    {
      W: 13,
      H: 22,
      teeth: 5,
      dip: 0.5,
      drops: [
        [-17, 20],
        [-4, 26],
        [6, 25],
        [17, 20]
      ],
      ripple: 14
    },
    {
      W: 17,
      H: 12,
      teeth: 4,
      dip: 0.6,
      drops: [
        [-20, 10],
        [-11, 14],
        [-2, 15],
        [10, 14],
        [20, 9]
      ],
      ripple: 19
    },
    {
      W: 0,
      H: 0,
      teeth: 0,
      dip: 0,
      drops: [
        [-9, 5],
        [4, 7],
        [12, 3]
      ],
      ripple: 21
    }
  ]
  return S.map((s, f) => {
    const r = new Raster(48, 32)
    const body = new Raster(48, 32)
    const cx = 24
    const gy = 29
    for (let x = -Math.ceil(s.W); x <= Math.ceil(s.W) && s.W > 0; x++) {
      const nx = Math.min(1, Math.abs(x + 0.5) / s.W)
      const env = Math.sqrt(1 - nx * nx * 0.92)
      // Triangle-wave teeth along the rim; the centre dips so the crown opens like a bowl.
      const tri = Math.abs(((((x + s.W) / (2 * s.W)) * s.teeth * 2) % 2) - 1)
      const top = s.H * env * (0.62 + 0.38 * tri) * (1 - s.dip * (1 - nx) * 0.6)
      for (let y = Math.round(gy - top); y <= gy; y++) {
        const hollow = nx < 0.55 && y > gy - top + 3 && f > 0 && f < 4
        body.set(cx + x, y, hollow ? R.water[2] : R.water[1])
      }
    }
    // Light rim along the top-left edges, shade at the lower-right.
    const src = body.clone()
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 48; x++) {
        if (src.get(x, y) !== R.water[1]) continue
        if (!src.get(x - 1, y) || !src.get(x, y - 1)) body.set(x, y, R.water[0])
        else if (!src.get(x + 1, y) || !src.get(x, y + 1)) body.set(x, y, R.water[2])
      }
    for (const [dx, y] of s.drops) {
      const d = new Raster(48, 32)
      d.ellipse(cx + dx, gy - y, 1.7, 1.9, R.water[1])
      d.set(cx + dx - 1, gy - y - 1, R.water[0])
      d.set(cx + dx, gy - y + 1, R.water[2])
      body.blit(outlineWith(d, R.water[3]))
    }
    r.blit(outlineWith(body, R.water[4]))
    // Flat surface ripples: thin pale ellipse arcs around the impact.
    for (const [rx, ry, c] of [
      [s.ripple, 2.6, R.water[0]],
      [Math.max(0, s.ripple - 5), 1.6, R.water[1]]
    ] as const) {
      if (rx < 3) continue
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x + 0.5 - cx) / rx
        if (Math.abs(nx) > 1) continue
        const y = Math.round(gy + 0.5 + ry * Math.sqrt(1 - nx * nx))
        if (!r.get(x, y)) r.set(x, y, c)
      }
    }
    return r
  })
}

// ------------------------------------------------------------------------------------------------- gush

/** The fountain out of a burst pipe (below the frame): a rising column that fans into arcs, with travelling foam. */
function gush(): Raster[] {
  return Array.from({ length: 4 }, (_, f) => {
    const phase = f / 4
    const body = new Raster(64, 64)
    const cx = 32
    // Jets: [launch speed sideways, speed up, width]. Parabolas apex near the top and fall back outward.
    // Jets: [sideways reach, apex height, width, last t]. Parabolas leave one base point; sides thin out into spray.
    const jets: [number, number, number, number][] = [
      [0, 58, 8, 0.5],
      [-0.55, 54, 5, 0.8],
      [0.55, 54, 5, 0.8],
      [-1, 44, 4, 0.78],
      [1, 44, 4, 0.78]
    ]
    const pts: Record<number, [number, number][]> = {}
    jets.forEach(([vx, apex, wd, last], j) => {
      const path: [number, number][] = []
      for (let i = 0; i <= 40; i++) {
        const t = i / 40
        const wob = Math.sin((t * 5 - phase * 2) * TAU) * (j === 0 ? 0.9 : 0.4) * t
        path.push([cx + vx * 31 * t + wob, 65 - 4 * apex * t * (1 - t)])
      }
      pts[j] = path
      const n = Math.floor(last * 40)
      for (let i = 0; i < n; i++) {
        const k = i / n
        // Spray: the falling tail of a side jet breaks into dashes that travel along it.
        if (j > 0 && k > 0.7 && (i + f) % 3 === 0) continue
        const taper = j === 0 ? 1 - 0.2 * k : 1 - 0.55 * k
        body.thick(path[i][0], path[i][1], path[i + 1][0], path[i + 1][1], Math.max(1.6, wd * taper), R.water[1])
      }
    })
    // Water wobble: notch the column edges with a travelling wave so the stream reads as moving.
    const src = body.clone()
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 64; x++) {
        if (!src.get(x, y)) continue
        if (!src.get(x + 1, y) || !src.get(x, y + 1)) body.set(x, y, R.water[2])
        else if (!src.get(x - 1, y) || !src.get(x, y - 1)) body.set(x, y, R.water[0])
      }
    // Streaks flowing up the jets.
    for (const [j, path] of Object.entries(pts))
      for (let k = 0; k < 4; k++) {
        const t = ((k / 4 + phase) % 1) * 0.9 + 0.05
        const [px, py] = path[Math.floor(t * 40)]
        const [qx, qy] = path[Math.min(40, Math.floor(t * 40) + 3)]
        if (Number(j) < 3) body.paint(px, py, R.water[0])
        body.paint(qx, qy, R.water[0])
      }
    const r = new Raster(64, 64)
    r.blit(outlineWith(body, R.water[4]))
    // Foam: pale clouds at the apex of each arc and rolling up the column.
    for (const [j, path] of Object.entries(pts)) {
      const apex = path[20]
      const rad = Number(j) === 0 ? 4.2 : 3
      const wob = Math.sin((phase + Number(j) * 0.27) * TAU)
      blob(r, apex[0] + wob * 1.2, apex[1] - 0.6 + Math.cos((phase + Number(j) * 0.27) * TAU), rad, rad * 0.9, R.cloud)
    }
    for (let k = 0; k < 3; k++) {
      const t = ((k / 3 + phase) % 1) * 0.5 + 0.02
      const [px, py] = pts[0][Math.floor(t * 40)]
      blob(r, px + (k % 2 ? 2.5 : -2.5), py, 2, 1.8, R.cloud)
    }
    // Droplets flung past the ends of the arcs.
    for (const [ex, ey] of [
      [6, 40],
      [14, 30],
      [51, 30],
      [58, 40],
      [24, 5],
      [40, 6]
    ]) {
      const k = Math.floor(phase * 4 + ex) % 4
      const dy = k * 2
      r.rect(ex - (ex > 32 ? 0 : 0), ey + dy - 3, 2, 2, R.water[1])
      r.set(ex, ey + dy - 3, R.water[0])
    }
    clamp01(0)
    return r
  })
}

// ---------------------------------------------------------------------------------------------- feather

function feather(): Raster[] {
  const spec = [
    [-0.9, 1, 0.3],
    [-0.3, 0.7, -0.1],
    [0.4, 1, -0.5],
    [-0.1, 0.65, 0.2]
  ] as const
  return spec.map(([angle, fat, curl]) => {
    const r = new Raster(16, 16)
    const l = shaft(
      16,
      16,
      8,
      8,
      13,
      angle,
      (s) => 3.6 * fat * Math.sin(Math.PI * Math.min(1, s * 1.05)) ** 0.7 * (s > 0.2 ? 1 : 0.5),
      (s, v) => {
        const side = v + curl * Math.sin(s * Math.PI) * 2
        if (Math.abs(v) < 0.5) return R.crowBlue[0]
        return side < 0 ? R.crowBlue[1] : R.crowBlue[2]
      }
    )
    r.blit(outlineWith(l, R.crowBlue[4]))
    // Rim light on the top-left so a dark feather still lifts off a dark cave.
    const src = r.clone()
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++)
        if (src.get(x, y) === R.crowBlue[1] && (!src.get(x - 1, y) || !src.get(x, y - 1))) r.set(x, y, R.crowBlue[0])
    return r
  })
}

export const sheets: SheetModule = {
  fx: () => ({
    leaf: make('leaf', leaf()),
    needle: make('needle', needle()),
    chip: make('chip', chip()),
    clod: make('clod', clod()),
    shard: make('shard', shard()),
    drop: make('drop', drop()),
    splash: make('splash', splash()),
    bubble: make('bubble', bubble()),
    gush: make('gush', gush()),
    honey: make('honey', honey()),
    feather: make('feather', feather())
  })
}

void frames

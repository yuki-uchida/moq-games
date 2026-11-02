import { C, R } from './palette'
import { Raster, ball, part, rng, shadeEdges, type Ramp } from './raster'

/** Grounds and props for the remaining life stages (64×64 seamless tiles; props are decorative only). */

const T = 64
const wrap = (r: Raster, x: number, y: number, c: number) => r.set(((x % T) + T) % T, ((y % T) + T) % T, c)
function speck(r: Raster, x: number, y: number, size: number, c: number) {
  wrap(r, x, y, c)
  if (size > 1) wrap(r, x + 1, y, c)
  if (size > 2) wrap(r, x, y + 1, c)
  if (size > 3) wrap(r, x + 1, y + 1, c)
}
const base = (ramp: Ramp) => new Raster(T, T).rect(0, 0, T, T, ramp[1])
function scatter(r: Raster, seed: number, n: number, colors: number[], sizes = [1, 3]) {
  const rand = rng(seed)
  for (let i = 0; i < n; i++)
    speck(
      r,
      Math.floor(rand() * T),
      Math.floor(rand() * T),
      sizes[0] + Math.floor(rand() * (sizes[1] - sizes[0] + 1)),
      colors[i % colors.length]
    )
}

/** Oblique box: front face, lit top, shaded right side. */
function box(r: Raster, x: number, y: number, w: number, h: number, d: number, ramp: Ramp) {
  r.rect(x, y, w, h, ramp[1])
  r.poly([x, y, x + d, y - d, x + w + d, y - d, x + w, y], ramp[0])
  r.poly([x + w, y, x + w + d, y - d, x + w + d, y + h - d, x + w, y + h], ramp[2])
}

/** Upright cylinder lit from the left. */
function cyl(r: Raster, x: number, y: number, w: number, h: number, ramp: Ramp, cap = true) {
  r.rect(x, y, w, h, ramp[1])
  r.ellipse(x + w / 2, y + h, w / 2, w / 5, ramp[1])
  for (let yy = y; yy <= y + h + w / 5; yy++) {
    r.paint(x, yy, ramp[0])
    r.paint(x + w - 1, yy, ramp[2])
    r.paint(x + w - 2, yy, ramp[2])
  }
  if (cap) r.ellipse(x + w / 2, y, w / 2, w / 5, ramp[0])
}

const still = (frame: Raster) => ({ frames: [frame], fps: 1, loop: true })

// ---------------------------------------------------------------------------------------------
// Tiles. Each takes the tile coordinate and a variant (0..n) picked by hash.

const TILES: Record<string, (tx: number, ty: number, v: number) => Raster> = {
  // 幼児期: playground sand with pebbles and the odd footprint trail (grass patches are scattered features).
  playground: (_tx, _ty, v) => {
    const r = base(R.sand)
    scatter(r, 3 + v, 60, [R.sand[2], R.sand[0]], [1, 2])
    for (const [x, y] of [
      [14, 20],
      [40, 44],
      [50, 12]
    ].slice(0, v + 1)) {
      r.rect(x, y, 3, 2, R.gravel[1])
      r.set(x, y, R.gravel[0])
    }
    if (v === 2)
      for (let k = 0; k < 4; k++) {
        r.ellipse(12 + k * 11, 30 + (k % 2) * 5, 1.6, 2.4, R.sand[2])
        r.set(12 + k * 11, 28 + (k % 2) * 5, R.sand[2])
      }
    return r
  },
  // 中学生: gym floor boards, staggered joints, a painted court line every sixth row.
  gym: (_tx, ty, v) => {
    const W = R.wood
    const r = base(W)
    for (let y = 0; y < T; y += 8) {
      r.rect(0, y + 7, T, 1, W[2])
      const joint = ((y * 5 + v * 13) % 56) + 4
      r.rect(joint, y, 1, 7, W[2])
      for (let x = 2; x < T; x += 11) r.rect((x + y * 3) % T, y + 2 + ((x + y) % 4), 4, 1, W[0])
    }
    if (((ty % 6) + 6) % 6 === 0) r.rect(0, 28, T, 3, R.yellow[2])
    if (v === 2) r.ellipse(30, 40, 5, 2, W[2])
    return r
  },
  // 高校生: dusk sidewalk pavers with joints (tactile paving runs are scattered features).
  sidewalk: (_tx, _ty, v) => {
    const P = R.paving
    const r = base(P)
    const rand = rng(17 + v)
    for (let y = 0; y < T; y += 16)
      for (let x = 0; x < T; x += 16) {
        if (rand() < 0.3) r.rect(x + 1, y + 1, 14, 14, P[0])
        r.rect(x, y + 15, 16, 1, P[2])
        r.rect(x + 15, y, 1, 16, P[2])
      }
    if (v === 2) r.line(20, 18, 27, 29, P[2])
    return r
  },
  // 大学生: campus red brick in running bond with mortar; a few darker and a chipped brick.
  campus: (_tx, _ty, v) => {
    const B = R.brick
    const r = base(B)
    const rand = rng(41 + v)
    for (let y = 0; y < T; y += 8)
      for (let x = (y / 8) % 2 ? -8 : 0; x < T; x += 16) {
        const t = rand()
        if (t < 0.25) r.rect(x + 1, y + 1, 14, 6, B[2])
        else if (t > 0.85) r.rect(x + 1, y + 1, 14, 6, B[0])
        r.rect(x, y + 7, 16, 1, R.paving[1])
        r.rect(x + 15, y, 1, 8, R.paving[1])
      }
    if (v === 2) r.rect(33, 17, 5, 3, R.paving[1])
    return r
  },
  // 働き盛り: suburban asphalt with a dashed centre line every fifth row (manholes are rare features).
  street: (tx, ty, v) => {
    const A = R.asphalt
    const r = base(A)
    scatter(r, 23 + v, 90, [A[2], A[0]], [1, 2])
    if (((ty % 5) + 5) % 5 === 0) for (let x = 0; x < 32; x++) r.rect(((tx & 1) * 32 + x) % T, 30, 1, 3, R.paper[2])
    return r
  },
  // 中年: a mown fairway in stripes (bunkers are rare features), the odd divot.
  golf: (_tx, _ty, v) => {
    const G = R.grass
    const r = base(G)
    for (let x = 0; x < T; x++) if (Math.floor(x / 16) % 2) r.rect(x, 0, 1, T, G[0])
    scatter(r, 31 + v, 30, [G[2]], [1, 1])
    if (v === 1) r.rect(18, 40, 4, 2, R.dirt[1])
    return r
  },
  // 老後: gravel raked into gentle 砂紋 waves (stepping-stone paths, rake rings and moss are features).
  garden: (_tx, _ty, v) => {
    const G = R.gravel
    const r = base(G)
    scatter(r, 61 + v, 200, [G[0], G[2]], [1, 1])
    for (let y = 2; y < T; y += 6)
      for (let x = 0; x < T; x++) r.set(x, y + Math.round(Math.sin((x / T) * Math.PI * 2) * 1.2), G[2])
    return r
  },
  // 寝たきり: care-room linoleum in large quiet squares with flecks; scuffs and wheel tracks.
  ward: (tx, ty, v) => {
    const L = R.lino
    const r = base(L)
    if ((tx + ty) & 1) r.rect(0, 0, T, T, L[0])
    scatter(r, 71, 50, [L[2]], [1, 1])
    r.rect(0, T - 1, T, 1, L[2])
    r.rect(T - 1, 0, 1, T, L[2])
    if (v === 1) for (const y of [24, 30]) r.rect(0, y, T, 1, L[2])
    if (v === 2) r.line(20, 40, 30, 37, L[2])
    return r
  }
}

// ---------------------------------------------------------------------------------------------
// Rare features: placed in world space on a jittered cell layout (no visible lattice), each drawn into
// whichever tiles it overlaps, so they cross tile edges seamlessly and never repeat on a grid.

interface Shape {
  kind: string
  x: number
  y: number
  s: number
}

const FEATURES: Record<
  string,
  { cell: number; prob: number; make: (rand: () => number, x: number, y: number) => Shape[] }
> = {
  street: { cell: 10, prob: 0.6, make: (_r, x, y) => [{ kind: 'manhole', x, y, s: 1 }] },
  golf: { cell: 6, prob: 0.55, make: (r, x, y) => [{ kind: 'bunker', x, y, s: 0.7 + r() * 0.6 }] },
  playground: {
    cell: 3,
    prob: 0.7,
    make: (r, x, y) =>
      Array.from({ length: 1 + Math.floor(r() * 3) }, (_, k) => ({
        kind: 'tuft',
        x: x + k * 14 * (r() - 0.3),
        y: y + k * 9 * (r() - 0.5),
        s: 0.6 + r() * 0.6
      }))
  },
  sidewalk: {
    cell: 7,
    prob: 0.55,
    make: (r, x, y) => {
      const n = 3 + Math.floor(r() * 3)
      const gx = Math.floor(x / 16) * 16
      const gy = Math.floor(y / 16) * 16
      return Array.from({ length: n }, (_, k) => ({
        kind: k === 0 || k === n - 1 ? 'dots' : 'bars',
        x: gx + k * 16,
        y: gy,
        s: 1
      }))
    }
  },
  garden: {
    cell: 6,
    prob: 0.75,
    make: (r, x, y) => {
      // A short meandering path of stepping stones, sometimes a raked ring around one, and moss.
      const out: Shape[] = []
      let a = r() * Math.PI * 2
      let px = x
      let py = y
      const n = 4 + Math.floor(r() * 3)
      for (let k = 0; k < n; k++) {
        out.push({ kind: 'stone', x: px, y: py, s: 0.8 + r() * 0.4 })
        a += (r() - 0.5) * 0.9
        px += Math.cos(a) * 24
        py += Math.sin(a) * 16
      }
      if (r() < 0.4) out.unshift({ kind: 'ring', x: out[1].x, y: out[1].y, s: 1 })
      out.unshift({ kind: 'moss', x: x + (r() - 0.5) * 60, y: y + (r() - 0.5) * 50, s: 0.7 + r() * 0.6 })
      return out
    }
  }
}

const cellHash = (ground: string, cx: number, cy: number) =>
  (Math.imul(cx, 2654435761) ^ Math.imul(cy, 40503) ^ (ground.length * 977 + ground.charCodeAt(0) * 131)) >>> 0

function shapesFor(ground: string, tx: number, ty: number) {
  const f = FEATURES[ground]
  if (!f) return []
  const span = f.cell * T
  const out: Shape[] = []
  const ccx = Math.floor((tx * T) / span)
  const ccy = Math.floor((ty * T) / span)
  for (let cy = ccy - 1; cy <= ccy + 1; cy++)
    for (let cx = ccx - 1; cx <= ccx + 1; cx++) {
      const rand = rng(cellHash(ground, cx, cy))
      if (rand() > f.prob) continue
      const shapes = f.make(rand, cx * span + 40 + rand() * (span - 80), cy * span + 40 + rand() * (span - 80))
      for (const s of shapes)
        if (s.x > tx * T - 40 && s.x < tx * T + T + 40 && s.y > ty * T - 40 && s.y < ty * T + T + 40) out.push(s)
    }
  return out
}

function drawShape(r: Raster, s: Shape, x: number, y: number) {
  const k = s.s
  switch (s.kind) {
    case 'manhole':
      r.ellipse(x, y + 1, 12, 9, R.asphalt[2])
      r.ellipse(x, y, 11, 8, R.metal[2])
      r.ellipse(x, y, 9, 6.5, R.metal[3])
      for (let d = -6; d <= 6; d += 3) r.line(x + d, y - 5, x + d, y + 5, R.metal[2])
      r.line(x - 8, y, x + 8, y, R.metal[2])
      break
    case 'bunker':
      r.ellipse(x, y + 1, 20 * k, 12 * k, R.grass[2])
      r.ellipse(x, y, 18 * k, 10 * k, R.sand[0])
      r.ellipse(x - 2 * k, y - 2 * k, 12 * k, 6 * k, R.sand[1])
      for (let i = -2; i <= 2; i++) r.line(x - 10 * k, y + i * 3 * k, x + 8 * k, y + i * 3 * k - 1, R.sand[2])
      break
    case 'tuft':
      // Crisp clover and grass tufts: lit blade tips, mid blades, dark roots, a tiny flower or two.
      for (let i = 0; i < 9 * k; i++) {
        const bx = Math.round(x + Math.cos(i * 2.4) * 9 * k)
        const by = Math.round(y + Math.sin(i * 2.4) * 5 * k)
        r.set(bx, by, R.grass[2])
        r.set(bx - 1, by - 1, R.grass[1])
        r.set(bx + 1, by - 1, R.grass[1])
        r.set(bx, by - 2, R.grass[0])
        if (i % 4 === 1) r.stamp(['.c.', 'ccc', '.c.'], bx + 2, by - 1, { c: R.grass[1] })
      }
      r.set(Math.round(x + 3 * k), Math.round(y - 2), C.white)
      r.set(Math.round(x - 5 * k), Math.round(y + 1), R.yellow[1])
      break
    case 'dots':
    case 'bars':
      // Tactile paving: clean yellow tiles with raised dots (stop) or bars (go).
      r.rect(x + 1, y + 1, 14, 14, R.yellow[2])
      r.rect(x + 1, y + 1, 14, 1, R.yellow[1])
      for (let i = 0; i < 3; i++)
        if (s.kind === 'dots') for (let j = 0; j < 3; j++) r.rect(x + 3 + i * 4, y + 3 + j * 4, 2, 2, R.yellow[1])
        else r.rect(x + 3 + i * 4, y + 3, 2, 10, R.yellow[1])
      break
    case 'stone':
      r.ellipse(x + 1, y + 2, 9 * k, 6 * k, R.gravel[2])
      r.ellipse(x, y, 9 * k, 6 * k, R.metal[2])
      r.ellipse(x - 1, y - 1, 7 * k, 4 * k, R.metal[1])
      r.ellipse(x + 1, y + 2, 5 * k, 2 * k, R.metal[2])
      break
    case 'ring':
      for (const rad of [13, 17, 21])
        for (let a = 0; a < Math.PI * 2; a += 0.03)
          r.set(x + Math.cos(a) * rad, y + Math.sin(a) * rad * 0.66, R.gravel[2])
      break
    case 'moss':
      r.ellipse(x, y, 8 * k, 5 * k, R.grass[2])
      r.ellipse(x - 1, y - 1, 6 * k, 3 * k, R.grass[1])
      for (let i = 0; i < 6; i++) r.set(x - 5 + i * 2, y - 2 + (i % 2), R.grass[0])
      break
  }
}

export const MAP_GROUNDS: Record<string, string> = {
  幼児期: 'playground',
  中学生: 'gym',
  高校生: 'sidewalk',
  大学生: 'campus',
  働き盛り: 'street',
  中年: 'golf',
  老後: 'garden',
  寝たきり: 'ward'
}

const cache = new Map<string, Raster>()
const featured = new Map<string, Raster>()
export function mapTile(ground: string, tx: number, ty: number, h: number) {
  const v = h % 7 < 4 ? 0 : h % 7 < 6 ? 1 : 2
  // Row/column-dependent features (court lines, centre lines, checkers) join the cache key.
  const key = `${ground}:${v}:${((ty % 30) + 30) % 30}:${tx & 1}`
  let t = cache.get(key)
  if (!t) cache.set(key, (t = TILES[ground](tx, ty, v)))
  const shapes = shapesFor(ground, tx, ty)
  if (!shapes.length) return t
  const fkey = `${key}@${tx},${ty}`
  let f = featured.get(fkey)
  if (!f) {
    // ponytail: unbounded per-position cache trimmed wholesale; an LRU if long sessions ever stutter.
    if (featured.size > 400) featured.clear()
    f = t.clone()
    for (const s of shapes) drawShape(f, s, s.x - tx * T, s.y - ty * T)
    featured.set(fkey, f)
  }
  return f
}

// ---------------------------------------------------------------------------------------------
// Props: four per stage, mid-value and quieter than the characters. Pivot = bottom centre.

type Paint = (l: Raster) => void
const prop = (w: number, h: number, ...layers: Paint[]) => {
  const r = new Raster(w, h)
  for (const draw of layers) part(r, draw)
  return r
}

const P: Record<string, Record<string, () => Raster>> = {
  playground: {
    blocks: () =>
      prop(
        64,
        64,
        (l) => box(l, 16, 44, 12, 11, 4, R.red),
        (l) => box(l, 31, 44, 12, 11, 4, R.sky),
        (l) => {
          box(l, 23, 32, 12, 11, 4, R.yellow)
          l.stamp(['.KK.', 'K..K', 'KKKK', 'K..K'], 27, 35, { K: R.yellow[3] })
        }
      ),
    slide: () =>
      prop(
        64,
        64,
        (l) => {
          for (const x of [10, 18]) l.rect(x, 26, 2, 30, R.red[2])
          for (let y = 30; y < 56; y += 5) l.rect(10, y, 10, 1, R.red[1])
        },
        (l) => {
          l.poly([18, 26, 26, 26, 54, 52, 56, 56, 48, 56, 22, 32], R.yellow[1])
          shadeEdges(l, R.yellow, 1, true)
        },
        (l) => l.rect(9, 24, 18, 3, R.red[1])
      ),
    flowers: () =>
      prop(64, 64, (l) => {
        for (const [x, c, h] of [
          [22, R.red, 14],
          [32, R.yellow, 18],
          [42, R.pink, 13]
        ] as const) {
          l.line(x, 56, x, 56 - h, R.green[2])
          l.poly([x - 6, 52, x - 1, 48, x - 1, 54], R.green[1])
          l.stamp(['c.c.c', 'ccccc', '.ccc.'], x - 2, 52 - h, { c: c[1] })
          l.set(x, 53 - h, c[0])
        }
      }),
    bucket: () =>
      prop(
        64,
        64,
        (l) => {
          l.ellipse(30, 54, 16, 4, R.sand[0])
        },
        (l) => {
          l.poly([20, 40, 36, 40, 34, 54, 22, 54], R.sky[1])
          shadeEdges(l, R.sky, 1, true)
          l.ellipse(28, 40, 8, 2, R.sky[2])
          for (let a = Math.PI; a < Math.PI * 2; a += 0.05)
            l.set(28 + Math.cos(a) * 8, 40 + Math.sin(a) * 7, R.metal[1])
        },
        (l) => {
          l.line(38, 54, 46, 38, R.yellow[2])
          l.poly([44, 40, 50, 34, 52, 37, 47, 42], R.red[1])
        }
      )
  },
  gym: {
    ruler: () =>
      prop(64, 64, (l) => {
        l.poly([16, 54, 50, 54, 16, 30], R.mint[0])
        l.poly([22, 50, 36, 50, 22, 40], 0)
        for (let x = 18; x < 50; x += 3) l.set(x, 53, R.mint[2])
      }),
    basketball: () =>
      prop(64, 64, (l) => {
        ball(l, 32, 47, 9, 9, R.orange)
        l.line(23, 47, 41, 47, R.orange[3])
        l.line(32, 38, 32, 56, R.orange[3])
        for (let t = -8; t <= 8; t++) l.paint(26 + Math.round((t * t) / 16), 47 + t, R.orange[3])
      }),
    bicycle: () =>
      prop(
        64,
        64,
        (l) => {
          for (const x of [16, 46]) {
            l.ellipse(x, 48, 9, 9, R.hair[2])
            l.ellipse(x, 48, 7, 7, 0)
            l.line(x - 7, 48, x + 7, 48, R.metal[2])
            l.line(x, 41, x, 55, R.metal[2])
          }
        },
        (l) => {
          l.line(16, 48, 28, 36, R.red[1])
          l.line(28, 36, 46, 48, R.red[1])
          l.line(28, 36, 42, 36, R.red[1])
          l.line(42, 36, 46, 48, R.red[1])
          l.line(16, 48, 32, 48, R.red[2])
          l.rect(25, 32, 7, 2, R.hair[2])
          l.line(42, 36, 44, 28, R.metal[1])
          l.rect(41, 27, 7, 2, R.hair[2])
        }
      ),
    vault: () =>
      prop(64, 64, (l) => {
        for (let k = 0; k < 4; k++) {
          const w = 30 + k * 4
          box(l, 32 - w / 2, 30 + k * 6, w, 6, 4, R.wood)
          l.rect(32 - w / 2, 35 + k * 6, w, 1, R.wood[2])
        }
        l.poly([18, 30, 46, 30, 50, 26, 22, 26], C.white)
        l.rect(18, 30, 28, 2, R.paper[1])
      })
  },
  sidewalk: {
    headphones: () =>
      prop(64, 64, (l) => {
        // A red-and-black over-ear pair lying on the pavement: band, sliders, cushioned cups, a cord.
        for (let a = Math.PI * 1.05; a < Math.PI * 1.95; a += 0.03) {
          l.rect(32 + Math.cos(a) * 12, 50 + Math.sin(a) * 11, 3, 2, R.hair[2])
          l.set(32 + Math.cos(a) * 12, 49 + Math.sin(a) * 11, R.hair[1])
        }
        for (const x of [18, 46]) {
          l.rect(x - 1, 41, 3, 5, R.metal[1])
          ball(l, x, 50, 5, 5.5, R.red, false)
          l.ellipse(x + (x < 32 ? 1 : -1), 50, 2.5, 3.5, R.hair[2])
        }
        l.line(46, 55, 52, 57, R.hair[2])
        l.line(52, 57, 60, 55, R.hair[2])
      }),
    postbox: () =>
      prop(
        64,
        64,
        (l) => l.rect(30, 46, 4, 10, R.hair[2]),
        (l) => {
          cyl(l, 22, 16, 20, 30, R.red)
          l.ellipse(32, 15, 11, 4, R.red[1])
          l.rect(26, 24, 12, 2, R.hair[3])
          l.stamp(['wwwww', '.....', 'wwwww', '..w..', '..w..'], 30, 30, { w: C.white })
        }
      ),
    breadbag: () =>
      prop(
        64,
        64,
        (l) => {
          l.thick(28, 46, 44, 26, 5, R.yellow[2])
          for (let k = 0; k < 3; k++) l.line(32 + k * 4, 40 - k * 5, 35 + k * 4, 41 - k * 5, R.brown[1])
        },
        (l) => {
          l.poly([20, 36, 38, 36, 40, 56, 18, 56], R.paper[1])
          shadeEdges(l, R.paper, 1, true)
          l.rect(24, 44, 10, 5, R.red[1])
        }
      ),
    vending: () =>
      prop(64, 64, (l) => {
        box(l, 16, 10, 28, 46, 5, [R.paper[0], R.paper[1], R.paper[2], R.paper[3], R.paper[4]])
        l.rect(19, 13, 22, 16, R.navy[2])
        for (let k = 0; k < 3; k++)
          for (let j = 0; j < 5; j++)
            l.rect(21 + j * 4, 15 + k * 5, 2, 4, [R.red[1], R.yellow[1], R.sky[1], R.green[1]][(k + j) % 4])
        l.rect(19, 31, 22, 2, C.glow)
        l.rect(22, 46, 16, 5, R.hair[3])
        for (let j = 0; j < 5; j++) l.set(21 + j * 4, 34, R.red[1])
      })
  },
  campus: {
    coffee: () =>
      prop(64, 64, (l) => {
        l.poly([26, 40, 38, 40, 36, 56, 28, 56], R.paper[1])
        l.rect(26, 46, 12, 5, R.brown[1])
        l.rect(25, 37, 14, 3, R.paper[2])
        l.ellipse(32, 37, 7, 1.5, R.paper[0])
        shadeEdges(l, R.paper, 1)
      }),
    crate: () =>
      prop(
        64,
        64,
        (l) => {
          for (let k = 0; k < 4; k++) {
            l.rect(20 + k * 6, 26, 3, 10, R.brown[2])
            l.rect(21 + k * 6, 22, 1, 4, R.brown[3])
          }
        },
        (l) => {
          box(l, 16, 36, 30, 18, 5, R.yellow)
          for (let k = 0; k < 3; k++) l.rect(19 + k * 9, 40, 6, 3, R.yellow[2])
        }
      ),
    signboard: () =>
      prop(64, 64, (l) => {
        // A サークル勧誘 board on two legs.
        l.line(22, 40, 18, 56, R.wood[2])
        l.line(42, 40, 46, 56, R.wood[2])
        box(l, 14, 20, 36, 22, 3, R.wood)
        l.rect(16, 22, 32, 18, R.paper[1])
        l.rect(18, 25, 18, 3, R.red[1])
        l.rect(18, 31, 26, 1, R.paper[3])
        l.rect(18, 35, 20, 1, R.paper[3])
      }),
    bench: () =>
      prop(64, 64, (l) => {
        for (const x of [12, 48]) l.rect(x, 40, 3, 16, R.metal[2])
        for (const y of [38, 41]) box(l, 8, y, 48, 2, 3, R.wood)
        for (const y of [24, 28, 32]) l.rect(9, y, 46, 3, R.wood[1])
        l.rect(12, 24, 2, 14, R.metal[2])
        l.rect(48, 24, 2, 14, R.metal[2])
      })
  },
  street: {
    // Suburban things only — no vehicles (a parked car would read as the 交通事故 enemy).
    mailbox: () =>
      prop(
        64,
        64,
        (l) => l.rect(30, 38, 4, 18, R.metal[2]),
        (l) => {
          box(l, 22, 24, 18, 14, 3, R.red)
          l.rect(25, 28, 12, 2, R.hair[3])
          l.rect(27, 32, 8, 3, C.white)
        }
      ),
    planters: () =>
      prop(
        64,
        64,
        (l) => {
          for (const [x, h] of [
            [18, 12],
            [34, 16],
            [48, 10]
          ])
            for (let k = 0; k < 5; k++) ball(l, x - 3 + k * 1.5, 46 - h + (k % 2) * 3, 4, 3, R.green, false)
        },
        (l) => {
          for (const x of [12, 28, 42]) {
            l.poly([x, 44, x + 12, 44, x + 10, 56, x + 2, 56], R.brick[0])
            l.rect(x, 44, 12, 2, R.orange[0])
          }
          shadeEdges(l, R.orange, 1)
        }
      ),
    garbage: () =>
      prop(
        64,
        64,
        (l) => {
          for (const [x, y, c] of [
            [20, 48, R.paper[1]],
            [30, 46, R.mint[0]],
            [40, 49, R.paper[1]]
          ] as const)
            ball(l, x, y, 6, 5, [c, c, R.paper[2], R.paper[3], R.paper[4]], false)
        },
        (l) => {
          // The green net thrown over the bags at a ごみ集積所.
          for (let x = 13; x < 48; x += 3) l.line(x, 42, x + 4, 55, R.green[2])
          for (let y = 43; y < 56; y += 3) l.line(13, y, 48, y, R.green[2])
        }
      ),
    pole: () =>
      prop(64, 64, (l) => {
        cyl(l, 26, 2, 12, 52, R.metal)
        l.rect(26, 30, 12, 6, R.yellow[1])
        for (let x = 26; x < 38; x += 4) l.poly([x, 30, x + 2, 30, x + 4, 36, x + 2, 36], C.inkCool)
        l.rect(36, 12, 6, 2, R.metal[3])
      }),
    vending: () => P.sidewalk.vending(),
    bicycle: () => P.gym.bicycle()
  },
  golf: {
    flag: () =>
      prop(64, 64, (l) => {
        l.ellipse(32, 55, 5, 2, R.hair[3])
        l.rect(31, 12, 2, 43, C.white)
        l.poly([33, 12, 48, 17, 33, 22], R.red[1])
        l.poly([33, 18, 48, 17, 33, 22], R.red[2])
      }),
    golfbag: () =>
      prop(
        64,
        64,
        (l) => {
          for (const [x, h] of [
            [26, 14],
            [30, 18],
            [34, 12]
          ]) {
            l.line(x, 30, x + 2, 30 - h, R.metal[1])
            l.rect(x + 1, 28 - h, 4, 3, R.metal[0])
          }
        },
        (l) => {
          cyl(l, 22, 28, 18, 26, R.navy)
          l.rect(22, 34, 18, 2, R.red[1])
          l.rect(22, 46, 18, 2, R.red[1])
          l.rect(38, 30, 3, 20, R.brown[2])
        }
      ),
    sake: () =>
      prop(64, 64, (l) => {
        cyl(l, 26, 30, 12, 24, R.green, false)
        l.rect(29, 18, 6, 12, R.green[1])
        l.rect(29, 16, 6, 3, R.red[1])
        l.rect(27, 36, 10, 12, R.paper[1])
        l.rect(31, 38, 2, 8, C.inkCool)
      }),
    pills: () =>
      prop(64, 64, (l) => {
        cyl(l, 24, 38, 12, 16, R.orange)
        l.rect(23, 34, 14, 5, C.white)
        l.rect(25, 43, 10, 6, R.paper[1])
        for (const [x, y] of [
          [40, 54],
          [44, 53],
          [42, 55]
        ]) {
          l.rect(x, y, 3, 2, C.white)
          l.set(x + 2, y, R.red[1])
        }
      })
  },
  garden: {
    teaset: () =>
      prop(64, 64, (l) => {
        box(l, 12, 50, 40, 4, 4, R.wood)
        ball(l, 26, 44, 7, 6, R.green, false)
        l.line(33, 42, 37, 38, R.green[2])
        l.rect(24, 36, 4, 2, R.green[2])
        l.line(20, 40, 22, 46, R.brown[2])
        for (const x of [40, 47]) {
          l.rect(x, 44, 5, 6, R.paper[1])
          l.rect(x + 1, 44, 3, 1, R.green[2])
        }
      }),
    bonsai: () =>
      prop(
        64,
        64,
        (l) => {
          box(l, 18, 48, 28, 7, 3, R.brick)
        },
        (l) => {
          l.thick(30, 48, 26, 38, 3, R.brown[2])
          l.thick(26, 38, 34, 30, 3, R.brown[2])
          l.thick(34, 30, 40, 26, 2, R.brown[2])
        },
        (l) => {
          for (const [x, y, w] of [
            [22, 34, 7],
            [38, 24, 8],
            [30, 22, 6]
          ])
            ball(l, x, y, w, w * 0.55, R.green, false)
        }
      ),
    bench: () =>
      prop(64, 64, (l) => {
        for (const x of [14, 46]) l.rect(x, 40, 4, 16, R.brown[3])
        box(l, 8, 38, 48, 4, 4, R.wood)
        l.rect(8, 44, 48, 1, R.wood[2])
      }),
    lantern: () =>
      prop(64, 64, (l) => {
        box(l, 22, 50, 20, 5, 3, R.paving)
        l.rect(28, 38, 8, 12, R.paving[1])
        box(l, 24, 30, 16, 8, 3, R.paving)
        l.rect(28, 32, 8, 4, R.yellow[2])
        l.poly([18, 30, 46, 30, 38, 22, 26, 22], R.paving[0])
        l.rect(30, 17, 4, 5, R.paving[1])
        shadeEdges(l, R.paving, 1)
      })
  },
  ward: {
    wheelchair: () =>
      prop(
        64,
        64,
        (l) => {
          l.ellipse(28, 44, 12, 12, R.metal[2])
          l.ellipse(28, 44, 10, 10, 0)
          l.line(18, 44, 38, 44, R.metal[2])
          l.line(28, 34, 28, 54, R.metal[2])
        },
        (l) => {
          l.rect(22, 36, 18, 4, R.navy[1])
          l.rect(20, 22, 4, 16, R.navy[1])
          l.line(21, 22, 18, 18, R.metal[1])
          l.line(38, 40, 44, 52, R.metal[1])
          ball(l, 46, 53, 2.5, 2.5, R.hair, false)
        }
      ),
    vase: () =>
      prop(
        64,
        64,
        (l) => {
          for (const [x, y, c] of [
            [26, 24, R.pink],
            [34, 20, R.yellow],
            [38, 28, R.red]
          ] as const) {
            l.line(32, 40, x, y + 3, R.green[2])
            ball(l, x, y, 3.5, 3.5, c, false)
          }
        },
        (l) => {
          l.ellipse(32, 46, 8, 10, R.sky[1])
          l.rect(29, 34, 6, 4, R.sky[1])
          shadeEdges(l, R.sky, 2, true)
        }
      ),
    cart: () =>
      prop(64, 64, (l) => {
        box(l, 14, 26, 34, 26, 4, [R.paper[0], R.paper[1], R.paper[2], R.paper[3], R.paper[4]])
        for (const y of [32, 40]) l.rect(16, y, 30, 1, R.paper[3])
        for (const y of [35, 43]) l.rect(28, y, 6, 2, R.sky[2])
        l.rect(18, 20, 6, 6, R.mint[1])
        l.rect(30, 22, 8, 4, R.pink[1])
        for (const x of [17, 45]) ball(l, x, 55, 2.5, 2.5, R.hair, false)
      }),
    futon: () =>
      prop(64, 64, (l) => {
        box(l, 12, 46, 40, 8, 4, R.pink)
        box(l, 14, 38, 36, 8, 4, R.sky)
        box(l, 16, 30, 32, 8, 4, [R.paper[0], R.paper[1], R.paper[2], R.paper[3], R.paper[4]])
        for (const y of [41, 49]) l.rect(16, y, 30, 1, R.paper[2])
      })
  }
}

export const MAP_PROPS: Record<string, string[]> = Object.fromEntries(
  Object.entries(P).map(([g, props]) => [g, Object.keys(props)])
)
export const mapPropSheet = (ground: string) =>
  Object.fromEntries(Object.entries(P[ground]).map(([name, make]) => [name, still(make())]))

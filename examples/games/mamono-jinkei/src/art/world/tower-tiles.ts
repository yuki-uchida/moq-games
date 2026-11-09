/** Stage 3 terrain: 風鳴りの崖と時計塔. 64×64 tiles, periodic over 8×8 tiles so every variant is cached. */
import type { TileKind } from '../../vocab'
import type { TileQuery } from '../index'
import { C, DARKER, R } from '../palette'
import { Raster, bayer, rng } from '../raster'
import { D, G, GD, S, T, WOOD, GOLD, ih, mod, tile, vn1 } from './gfx'
import { RK, RT, SK, field, overSky, rope, skyAt } from './tower-gfx'
import {
  cliffTop,
  faceAt,
  famOf,
  floorTop,
  FAM_RAMP,
  grassTop,
  lipOf,
  memo,
  rockTop,
  shingles,
  brick,
  type Fam
} from './tower-tops'

const N = 0
const NE = 1
const E = 2
const SE = 3
const Sx = 4
const SW = 5
const Wx = 6
const NW = 7

const isGround = (k?: TileKind) => k !== undefined && k !== 'sky' && k !== 'pit'

/** One-letter class of a neighbour for cache keys. */
const code = (k: TileKind | undefined, kind: TileKind) =>
  k === undefined
    ? 'x'
    : k === kind
      ? '='
      : k === 'sky'
        ? 's'
        : k === 'cliff'
          ? 'c'
          : k === 'grass'
            ? 'g'
            : k === 'wall' || k === 'rock'
              ? 'w'
              : k === 'bridge'
                ? 'b'
                : '.'

// ---------------------------------------------------------------- sky

function skyTile(q: TileQuery) {
  const a = q.around
  const north = a[N]
  const faceKind = north && isGround(north) && north !== 'bridge' && north !== 'roof' ? north : undefined
  const sig = faceKind ? `${faceKind},${code(a[NW], 'sky')},${code(a[NE], 'sky')}` : ''
  if (!faceKind) return skyAt(q.tx, q.ty)
  const layer = memo(`sky${mod(q.tx, 8)},${mod(q.ty, 8)},${sig}`, () => {
    const r = new Raster(T, T)
    const fam = famOf(faceKind)
    const ramp = FAM_RAMP[fam]
    const ox = mod(q.tx, 8) * T
    const raised = faceKind === 'rock' || faceKind === 'wall'
    const iW = (y: number) => (a[NW] === 'sky' ? 2 + Math.floor(vn1(mod(q.ty, 8) * T + y, 8, 52) * 3) : 0)
    const iE = (y: number) => (a[NE] === 'sky' ? 2 + Math.floor(vn1(mod(q.ty, 8) * T + y, 8, 53) * 3) : 0)
    const solid = new Uint8Array(T * T)
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        if (x < iW(y) || x >= T - iE(y)) continue
        const wx = ox + x
        const d = y + 64 - lipOf(faceKind, wx)
        const c = faceAt(fam, wx, d, true, false, mod(q.ty, 8) * T + y)
        if (!c) continue
        r.set(x, y, raised && fam === 'rock' && c !== RK[3] ? DARKER[c] : c)
        solid[y * T + x] = 1
      }
    // sides: dark outline, lit rim on the left
    const line = ramp[3]
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        if (!solid[y * T + x]) continue
        const left = x === 0 ? solid[y * T] : solid[y * T + x - 1]
        const right = x === T - 1 ? 1 : solid[y * T + x + 1]
        if (!left && x > 0 && a[NW] === 'sky') r.set(x, y, line)
        else if (!right && x < T - 1 && a[NE] === 'sky') r.set(x, y, line)
      }
    // deep blue haze in the clouds right under the face, fading out below it
    for (let x = 0; x < T; x++) {
      let last = -1
      for (let y = T - 1; y >= 0; y--)
        if (solid[y * T + x]) {
          last = y
          break
        }
      if (last < 0 || last >= T - 1) continue
      for (let k = 1; k <= 26 && last + k < T; k++) {
        const dens = 1 - k / 26
        const y = last + k
        if (solid[y * T + x]) continue
        const z = bayer(x, y)
        if (k <= 3) r.set(x, y, SK[3])
        else if (z < dens * 1.05) r.set(x, y, k < 13 && z < dens * 0.6 ? SK[3] : SK[2])
      }
    }
    return r
  })
  return overSky(q.tx, q.ty, layer)
}

// ---------------------------------------------------------------- ground (cliff, grass, rock, floor, wall)

/** How grassy a neighbouring tile counts for the cliff / grass blend (other ground keeps the tile's own value). */
const grassy = (k: TileKind | undefined, self: number) =>
  k === 'grass' ? 1 : k === 'cliff' || k === 'rock' || k === 'wall' ? 0 : self
/** Neighbour index of the tile at offset (di, dj) in -1..1 (the tile itself is -1). */
const AROUND = [NW, N, NE, Wx, -1, E, SW, Sx, SE]

/**
 * Blends the cliff / grass transition into a tile's top. Grassiness is interpolated between the centres of the 3×3
 * tiles and pushed around by world-aligned noise, so neighbouring tiles agree on one organic boundary with round
 * corners. The grass edge gets a lit fringe on top and a dark lip below, blades spill onto the stone and the odd
 * flagstone peeks through near the border.
 */
function mixTop(q: TileQuery, top: Raster, a: number, b: number): Raster {
  const kind = q.kind
  if (kind !== 'cliff' && kind !== 'grass') return top
  const partner: TileKind = kind === 'cliff' ? 'grass' : 'cliff'
  if (!q.around.some((k) => k === partner)) return top
  const self = kind === 'grass' ? 1 : 0
  const g = AROUND.map((i) => (i < 0 ? self : grassy(q.around[i], self)))
  const grass = grassTop(a, b)
  const cliff = cliffTop(a, b)
  const ox = a * T
  const oy = b * T
  const P = 4
  const n = T + P * 2
  const f1 = field(ox, oy, 64, 64, 411, P)
  const f2 = field(ox, oy, 32, 32, 412, P)
  const f3 = field(ox, oy, 8, 8, 413, P)
  const m = new Uint8Array(n * n)
  const val = new Float32Array(n * n)
  for (let y = 0; y < n; y++) {
    const v = (y - P + 0.5 - 32) / T
    const j0 = v < 0 ? 0 : 1
    const fy = Math.min(1, Math.max(0, v + 1 - j0))
    for (let x = 0; x < n; x++) {
      const u = (x - P + 0.5 - 32) / T
      const i0 = u < 0 ? 0 : 1
      const fx = Math.min(1, Math.max(0, u + 1 - i0))
      const p00 = g[j0 * 3 + i0]
      const p10 = g[j0 * 3 + i0 + 1]
      const p01 = g[(j0 + 1) * 3 + i0]
      const p11 = g[(j0 + 1) * 3 + i0 + 1]
      const bil = p00 + (p10 - p00) * fx + (p01 - p00) * fy + (p00 - p10 - p01 + p11) * fx * fy
      const k = y * n + x
      val[k] = bil + (f1[k] - 0.5) * 0.8 + (f2[k] - 0.5) * 0.45 + (f3[k] - 0.5) * 0.1
      m[k] = val[k] > 0.5 ? 1 : 0
    }
  }
  const at = (x: number, y: number) => m[(y + P) * n + x + P]
  const out = top.clone()
  for (let y = 0; y < T; y++)
    for (let x = 0; x < T; x++) {
      const wx = ox + x
      const wy = oy + y
      const h = ih(mod(wx, 512), mod(wy, 512), 414)
      const col = ih(mod(wx, 512), 3, 415)
      if (at(x, y)) {
        let c = grass.get(x, y)
        const edge = val[(y + P) * n + x + P] - 0.5
        if (!at(x, y + 1)) c = GD[2]
        else if (!at(x, y + 2) && h < 0.6) c = GD[1]
        else if (!at(x, y - 1)) c = col < 0.5 ? G[0] : G[1]
        else if (!at(x - 1, y) || !at(x + 1, y)) c = GD[1]
        else if (edge < 0.05 && h < 0.07) c = cliff.get(x, y) // a stone peeks through near the border
        out.set(x, y, c)
        continue
      }
      let c = cliff.get(x, y)
      // grass blades spill onto the stone from the grass below, in little clumps along the edge
      const tall = col < 0.42 ? 1 + Math.floor(ih(mod(wx, 512), 4, 416) * 4) : col < 0.6 ? 1 : 0
      let below = 0
      for (let k = 1; k <= 4 && !below; k++) if (at(x, y + k)) below = k
      if (below && below <= tall) c = below === tall ? G[0] : below === 1 ? GD[2] : G[1]
      else if (at(x, y - 1))
        c = DARKER[c] // the grass casts a thin shadow onto the stone below it
      else if ((at(x - 1, y) || at(x + 1, y)) && h < 0.35) c = GD[2]
      else if ((at(x - 2, y) || at(x + 2, y) || at(x, y - 2)) && h < 0.12) c = GD[1]
      out.set(x, y, c)
    }
  return out
}

interface GroundSpec {
  raised: boolean
  brass?: boolean
  top: (a: number, b: number) => Raster
  /** Ground showing around a raised mass. */
  bg?: (a: number, b: number) => Raster
}

const GROUND: Partial<Record<TileKind, GroundSpec>> = {
  cliff: { raised: false, top: cliffTop },
  grass: { raised: false, top: grassTop },
  floor: { raised: false, top: floorTop },
  rock: { raised: true, top: rockTop, bg: cliffTop }
}

function groundTile(q: TileQuery) {
  const layer = groundLayer(q)
  return q.around.some((k) => k === 'sky') ? overSky(q.tx, q.ty, layer) : layer
}

function groundLayer(q: TileQuery) {
  const spec = GROUND[q.kind]!
  const a = q.around
  const kind = q.kind
  const sk = (i: number) => a[i] === 'sky'
  const same = (i: number) => a[i] === kind
  const sig = a.map((k) => code(k, kind)).join('')
  return memo(`g${kind}${mod(q.tx, 8)},${mod(q.ty, 8)},${sig}`, () => {
    const ta = mod(q.tx, 8)
    const tb = mod(q.ty, 8)
    const ox = ta * T
    const oy = tb * T
    const fam = famOf(kind)
    const ramp = FAM_RAMP[fam]
    const top = mixTop(q, spec.top(ta, tb), ta, tb)
    const anySky = a.some((k) => k === 'sky')
    if (!anySky && !spec.raised) {
      // interior tile: nothing but the top (plus the shade under a wall or rock face)
      if (a[N] !== 'wall' && a[N] !== 'rock') return top
      const shaded = top.clone()
      for (let y = 0; y < 6; y++)
        for (let x = 0; x < T; x++) if (y < 3 || bayer(x, y) < 0.5) shaded.set(x, y, DARKER[shaded.get(x, y)])
      return shaded
    }
    const hasFace = sk(Sx) || (spec.raised && !same(Sx))
    const fade = sk(Sx)
    const bg = spec.bg ? spec.bg(ta, tb) : undefined
    const out = !anySky && bg ? bg.clone() : new Raster(T, T)
    // insets of open edges
    const inset = (w: number, i: number, seed: number) =>
      sk(i) ? 2 + Math.floor(vn1(w, 8, seed) * 3) : spec.raised && !same(i) ? 1 + Math.floor(vn1(w, 6, seed) * 2) : 0
    const solid = new Uint8Array(T * T)
    const skyOut = new Uint8Array(T * T)
    const insN: number[] = []
    const insW: number[] = []
    const insE: number[] = []
    const lipArr: number[] = []
    for (let i = 0; i < T; i++) {
      insN.push(inset(ox + i, N, 51))
      insW.push(inset(oy + i, Wx, 52))
      insE.push(inset(oy + i, E, 53))
      lipArr.push(hasFace ? lipOf(kind, ox + i) : T)
    }
    const isOpen = (x: number, y: number) =>
      x >= 0 &&
      y >= 0 &&
      x < T &&
      y < T &&
      !solid[y * T + x] &&
      (skyOut[y * T + x] === 1 || (spec.raised && y < lipArr[x]))
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const wx = ox + x
        let outside = 0 // 1 = ground shows, 2 = sky shows
        if (y < insN[x]) outside = sk(N) ? 2 : 1
        else if (x < insW[y]) outside = sk(Wx) ? 2 : 1
        else if (x >= T - insE[y]) outside = sk(E) ? 2 : 1
        // rounded corners
        if (!outside) {
          const cut = (cx: number, cy: number, convex: boolean, sideSky: boolean) => {
            const dd = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
            return convex ? false : dd < 6 && sideSky
          }
          if (!sk(N) && !sk(Wx) && sk(NW) && cut(0, 0, false, true)) outside = 2
          else if (!sk(N) && !sk(E) && sk(NE) && cut(T, 0, false, true)) outside = 2
          else if (sk(N) && sk(Wx) && x < 6 && y < 6 && Math.hypot(5.5 - x, 5.5 - y) > 5.3) outside = 2
          else if (sk(N) && sk(E) && x >= T - 6 && y < 6 && Math.hypot(x - (T - 6.5), 5.5 - y) > 5.3) outside = 2
        }
        if (outside) {
          if (outside === 2) skyOut[y * T + x] = 1
          else if (bg) out.set(x, y, bg.get(x, y))
          continue
        }
        if (hasFace) {
          const lip = lipArr[x]
          if (y >= lip) {
            const c = faceAt(fam, wx, y - lip, fade, Boolean(spec.brass))
            if (c) {
              out.set(x, y, c)
              solid[y * T + x] = 1
            } else if (!fade) out.set(x, y, ramp[3])
            continue
          }
        }
        out.set(x, y, top.get(x, y))
        solid[y * T + x] = 1
      }
    if (!anySky) for (let i = 0; i < T * T; i++) if (skyOut[i]) out.data[i] = bg ? bg.data[i] : out.data[i]
    // outline + lit rim along the open edges
    const line = fam === 'wood' ? WOOD[4] : fam === 'stone' ? S[4] : RK[4]
    const edge = new Uint8Array(T * T)
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        if (!solid[y * T + x]) continue
        if (isOpen(x, y - 1) || isOpen(x - 1, y) || isOpen(x + 1, y)) {
          edge[y * T + x] = 1
          out.set(x, y, line)
        }
      }
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        if (!solid[y * T + x] || edge[y * T + x]) continue
        const lipRow = lipArr[x]
        if (y >= lipRow + 1) {
          if (x > 0 && edge[y * T + x - 1]) out.set(x, y, ramp[0])
          continue
        }
        if (
          (y > 0 && edge[(y - 1) * T + x] && !sk(N) === false) ||
          (x > 0 && edge[y * T + x - 1]) ||
          (y > 0 && edge[(y - 1) * T + x])
        )
          out.set(x, y, ramp[0])
        else if (x < T - 1 && edge[y * T + x + 1]) out.set(x, y, ramp[2])
      }
    // lip: lit top edge of the face, dark underside of the top
    if (hasFace)
      for (let x = 0; x < T; x++) {
        const lip = lipArr[x]
        if (!solid[(lip - 1) * T + x] || edge[(lip - 1) * T + x]) continue
        out.set(x, lip - 1, ramp[0])
      }
    // ambient shadow below a wall or rock face
    if (!spec.raised && (a[N] === 'wall' || a[N] === 'rock'))
      for (let y = 0; y < 6; y++)
        for (let x = 0; x < T; x++)
          if ((y < 3 || bayer(x, y) < 0.5) && out.get(x, y)) out.set(x, y, DARKER[out.get(x, y)])
    return out
  })
}

// ---------------------------------------------------------------- wall (a tall masonry facade)

function wallTile(q: TileQuery) {
  const layer = wallLayer(q)
  return q.around[Wx] === 'sky' || q.around[E] === 'sky' ? overSky(q.tx, q.ty, layer) : layer
}

function wallLayer(q: TileQuery) {
  const a = q.around
  const same = (i: number) => a[i] === 'wall'
  const sig = [N, E, Sx, Wx].map((i) => code(a[i], 'wall')).join('')
  const wallSky = a[Wx] === 'sky' || a[E] === 'sky'
  return memo(`wall${mod(q.tx, 8)},${mod(q.ty, 8)},${sig}`, () => {
    const ta = mod(q.tx, 8)
    const tb = mod(q.ty, 8)
    const ox = ta * T
    const oy = tb * T
    const r = wallSky ? new Raster(T, T) : floorTop(ta, tb).clone()
    const topRow = !same(N)
    const CORN = 14
    const inset = (w: number, i: number, seed: number) => (same(i) ? 0 : 1 + Math.floor(vn1(w, 6, seed) * 2))
    const win = !topRow && same(Wx) && same(E) && ih(ta, tb, 384) < 0.4
    const win2 = topRow && same(Wx) && same(E) && ih(ta, tb, 385) < 0.4
    const wx0 = 25 + Math.floor(ih(ta, tb, 386) * 3)
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const wx = ox + x
        const wy = oy + y
        if (x < inset(wy, Wx, 52) || x >= T - inset(wy, E, 53)) continue
        let c = brick(wx, wy)
        if (topRow && y < CORN) {
          if (y < 2) c = S[0]
          else if (y < 6) c = y === 5 ? S[2] : S[1]
          else if (y < 10)
            c = y === 6 ? GOLD[0] : y === 7 ? (mod(wx, 16) === 8 ? GOLD[0] : GOLD[1]) : y === 8 ? GOLD[2] : GOLD[3]
          else {
            const corb = mod(wx, 16) < 8
            c = y === 10 ? S[3] : corb ? (y < 13 ? S[1] : S[2]) : y < 12 ? S[2] : S[3]
            if (y === 13) c = S[3]
          }
        } else if (a[N] === 'roof' && y < 4) {
          c = DARKER[c]
        }
        r.set(x, y, c)
      }
    // arched window
    const arch = (x0: number, y0: number) => {
      const w = 14
      const h = 24
      for (let j = 0; j < h; j++)
        for (let i = 0; i < w; i++) {
          const dx = Math.abs(i - 6.5)
          if (j < 7 && dx * dx + (7 - j) * (7 - j) > 7.2 * 7.2) continue
          const frame = i === 0 || i === w - 1 || j === h - 1 || (j < 7 && dx * dx + (7 - j) * (7 - j) > 5.6 * 5.6)
          let c = frame ? S[0] : i < 3 ? C.inkBlue : C.inkCool
          if (frame && (i === w - 1 || j === h - 1)) c = S[3]
          if (!frame && j > 12 && i > 3 && i < w - 3 && j < 16) c = SK[2]
          r.set(x0 + i, y0 + j, c)
        }
      for (let i = -1; i < w + 1; i++) {
        r.set(x0 + i, y0 + h, S[3])
        r.set(x0 + i, y0 + h + 1, S[0])
      }
    }
    if (win) arch(wx0, 18)
    if (win2) arch(wx0, 24)
    // outline of the open sides and a plinth where the wall meets the floor
    for (let y = 0; y < T; y++) {
      if (!same(Wx)) {
        const i = inset(oy + y, Wx, 52)
        r.set(i, y, S[4])
        r.set(i + 1, y, S[0])
      }
      if (!same(E)) {
        const i = T - 1 - inset(oy + y, E, 53)
        r.set(i, y, S[4])
        r.set(i - 1, y, S[2])
      }
    }
    if (!same(Sx) && a[Sx] !== 'sky') {
      for (let x = 0; x < T; x++) {
        r.set(x, 61, S[0])
        r.set(x, 62, S[2])
        r.set(x, 63, S[4])
      }
    }
    if (!same(N) && a[N] !== 'roof') for (let x = 0; x < T; x++) r.set(x, 0, S[4])
    return r
  })
}

// ---------------------------------------------------------------- roof

function roofTile(q: TileQuery) {
  const a = q.around
  const same = (i: number) => a[i] === 'roof'
  const sig = [N, E, Sx, Wx].map((i) => (same(i) ? 1 : 0)).join('')
  return memo(`roof${mod(q.tx, 8)},${mod(q.ty, 8)},${sig}`, () => {
    const r = shingles(mod(q.tx, 8), mod(q.ty, 8)).clone()
    const ox = mod(q.tx, 8) * T
    if (!same(N)) {
      // ridge cap
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < T; x++) {
          const c = y === 0 ? RT[4] : y === 1 ? RT[0] : y < 4 ? RT[0] : y < 6 ? RT[1] : y === 6 ? RT[2] : RT[3]
          r.set(x, y, c)
          if (y > 0 && y < 6 && mod(ox + x, 12) === 0) r.set(x, y, y < 3 ? RT[1] : RT[2])
        }
    }
    if (!same(Sx)) {
      for (let y = 56; y < T; y++)
        for (let x = 0; x < T; x++) {
          const k = y - 56
          const c = k < 2 ? RT[3] : k < 5 ? RT[4] : C.inkWarm
          r.set(x, y, k === 0 ? RT[2] : c)
        }
    }
    if (!same(Wx)) for (let y = 0; y < T; y++) r.set(0, y, RT[4]), r.set(1, y, RT[0])
    if (!same(E)) for (let y = 0; y < T; y++) r.set(T - 1, y, RT[4]), r.set(T - 2, y, RT[3])
    return r
  })
}

// ---------------------------------------------------------------- planks

function planksTile(q: TileQuery) {
  return overSky(q.tx, q.ty, planksLayer(q))
}

/**
 * A calm plank deck: 14 px boards in staggered 128 px lengths with a soft dark seam between rows, faint grain, nails
 * over the joists and a rare broken board. Kept within the wood ramp's middle so the heroes, the wyvern's shadow and
 * the attack telegraphs stay the loudest things on it.
 */
function planksLayer(q: TileQuery) {
  const a = q.around
  const sk = (i: number) => a[i] === 'sky'
  const sig = [N, Wx, E, Sx, NW, NE].map((i) => (sk(i) ? 1 : 0)).join('')
  return memo(`pl${mod(q.tx, 8)},${mod(q.ty, 8)},${sig}`, () => {
    const ta = mod(q.tx, 8)
    const tb = mod(q.ty, 8)
    const ox = ta * T
    const r = new Raster(T, T)
    const joists = [8, 56]
    const hasFace = sk(Sx)
    const rows = hasFace ? 3 : 4
    const span = (wb: number) => [
      sk(Wx) ? 1 + Math.floor(ih(mod(wb, 64), 5, 502) * 5) : 0,
      sk(E) ? 1 + Math.floor(ih(mod(wb, 64), 6, 503) * 5) : 0
    ]
    for (let k = 0; k <= rows; k++) {
      const wb = tb * 4 + k
      const y0 = k * 16 + 2
      const [endL, endR] = span(wb)
      const shift = Math.floor(ih(mod(wb, 64), 1, 501) * 16) * 8
      // the seam above this board: a dark line in a soft shadow
      if (!(k === 0 && sk(N)))
        for (let x = endL; x < T - endR; x++) {
          r.set(x, y0 - 2, ih(mod(ox + x, 512), mod(wb, 64), 509) < 0.5 ? WOOD[2] : WOOD[3])
          r.set(x, y0 - 1, WOOD[3])
        }
      if (k === rows) break
      for (let x = endL; x < T - endR; x++) {
        const wx = ox + x
        const pos = mod(wx + shift, 128)
        const seg = mod(Math.floor((wx + shift) / 128), 4)
        const id = mod(wb, 64) * 8 + seg
        const tone = ih(id, 9, 505)
        // a rare broken stretch of one board: the dark loft and a joist show through
        const hole = (mod(wb, 32) * 5 + seg * 11 + 3) % 37 === 0 // three spread-out boards per 8×8 tiles
        const hs = 30 + Math.floor(ih(id, 4, 510) * 60)
        const hl = 12 + Math.floor(ih(id, 5, 511) * 10)
        if (hole && pos >= hs && pos < hs + hl) {
          const end = pos === hs || pos === hs + hl - 1
          const rag = end ? 3 + Math.floor(ih(mod(wx, 512), wb, 512) * 6) : 0
          const joist = mod(wx + 6, 16) < 4
          for (let v = 0; v < 14; v++) {
            let c = v < 3 ? WOOD[4] : joist ? (mod(wx + 6, 16) === 0 ? WOOD[2] : WOOD[3]) : v < 7 ? WOOD[4] : WOOD[3]
            if (v >= 14 - rag) c = v === 14 - rag ? WOOD[0] : WOOD[2]
            r.set(x, y0 + v, c)
          }
          continue
        }
        for (let v = 0; v < 14; v++) {
          const h = ih(mod(wx, 512), mod(wb * 16 + v, 512), 506)
          // long grain streaks: a few lighter ones on pale boards, darker ones on weathered boards
          const streak = vn1(wx + v * 37, 10, 514 + (wb % 3))
          let c = WOOD[1]
          if (tone < 0.25 && streak > 0.62 && h < 0.8) c = WOOD[2]
          else if (tone > 0.75 && streak > 0.66 && h < 0.7) c = WOOD[0]
          if (v === 0) c = h < 0.55 ? WOOD[0] : WOOD[1]
          else if (v === 12) c = h < 0.5 ? WOOD[2] : WOOD[1]
          else if (v === 13) c = WOOD[2]
          else {
            // faint dashed grain
            const line = vn1(wx, 24, 506 + ((wb + v) % 5)) > 0.7 && (v === 4 || v === 9) && h < 0.7
            if (line) c = WOOD[2]
          }
          if (pos === 0) c = v === 13 ? WOOD[3] : WOOD[2]
          else if (pos === 1 && v < 13) c = WOOD[0]
          r.set(x, y0 + v, c)
        }
        // knots
        if (ih(mod(wx, 512), mod(wb, 64), 513) < 0.004 && x > 2 && x < T - 3) {
          r.set(x, y0 + 6, WOOD[2])
          r.set(x + 1, y0 + 6, WOOD[3])
          r.set(x, y0 + 7, WOOD[3])
          r.set(x + 1, y0 + 7, WOOD[2])
          r.set(x - 1, y0 + 5, WOOD[0])
        }
      }
      // nails where the board crosses a joist; a thin rope lashing on very few of them
      for (const jx of joists) {
        if (jx < endL + 2 || jx > T - endR - 3) continue
        if (ih(mod(wb, 64), jx, 508) < 0.05) {
          for (let v = 1; v < 13; v++) {
            r.set(jx - 1, y0 + v, (v & 1) === 0 ? D[1] : D[2])
            r.set(jx, y0 + v, (v & 1) === 0 ? D[2] : D[3])
          }
          continue
        }
        if (r.get(jx, y0 + 3) !== WOOD[1] && r.get(jx, y0 + 3) !== WOOD[0]) continue
        for (const v of [3, 10]) {
          r.set(jx, y0 + v, WOOD[3])
          r.set(jx - 1, y0 + v - 1, WOOD[0])
        }
      }
    }
    if (hasFace) {
      for (let y = 50; y < T; y++)
        for (let x = 0; x < T; x++) {
          const wx = ox + x
          const c = faceAt('wood', wx, y - 50, true, false)
          if (c) r.set(x, y, c)
        }
    }
    // outline the walkway where it borders the clouds
    if (sk(N)) for (let x = 0; x < T; x++) if (r.get(x, 2)) r.set(x, 1, WOOD[4])
    return r
  })
}

// ---------------------------------------------------------------- bridge

function bridgeTile(q: TileQuery) {
  return overSky(q.tx, q.ty, bridgeLayer(q))
}

function bridgeLayer(q: TileQuery) {
  const a = q.around
  const sky = (i: number) => a[i] === 'sky'
  let vertical = false
  if (a[E] === 'bridge' || a[Wx] === 'bridge') vertical = false
  else if (a[N] === 'bridge' || a[Sx] === 'bridge') vertical = true
  else if (sky(N) && sky(Sx)) vertical = false
  else if (sky(E) && sky(Wx)) vertical = true
  const sA = vertical ? sky(Wx) : sky(N)
  const sB = vertical ? sky(E) : sky(Sx)
  return memo(`br${mod(q.tx, 8)},${mod(q.ty, 8)},${vertical},${sA},${sB}`, () => {
    const ta = mod(q.tx, 8)
    const tb = mod(q.ty, 8)
    const r = new Raster(T, T)
    // work in a horizontal frame (travel along x) and rotate at the end
    const wpos = vertical ? tb * T : ta * T
    const nearRail = vertical ? sB : sB
    const farRail = vertical ? sA : sA
    // support ropes under the deck, visible between planks
    const deck0 = 7
    const deck1 = 57
    for (const yy of [14, 49]) for (let x = 0; x < T; x++) r.set(x, yy + (x % 4 < 2 ? 0 : 1), x % 4 < 2 ? D[2] : D[3])
    // planks across the travel direction: 12 wide with 2 px gaps
    for (let x = 0; x < T; x++) {
      const wx = wpos + x
      const px = mod(wx, 14)
      const pi = Math.floor(wx / 14)
      if (px >= 12) continue
      const tone = ih(mod(pi, 64), 2, 511)
      const miss = ih(mod(pi, 64), 4, 512) < 0.04
      if (miss) continue
      for (let y = deck0; y <= deck1; y++) {
        let c = tone < 0.25 ? WOOD[0] : WOOD[1]
        if (px === 0) c = WOOD[0]
        else if (px === 10) c = WOOD[2]
        else if (px === 11) c = WOOD[3]
        if (px > 0 && px < 10 && (y + pi * 7) % 19 === 0) c = WOOD[2]
        if (y === deck0) c = WOOD[3]
        if (y === deck1) c = WOOD[3]
        r.set(x, y, c)
      }
      // nails
      if (px === 4) {
        for (const yy of [deck0 + 3, deck1 - 3]) {
          r.set(x, yy, WOOD[3])
          r.set(x - 1, yy - 1, WOOD[0])
        }
      }
    }
    // deck edge beams
    for (const [on, ys] of [
      [farRail, deck0],
      [nearRail, deck1 - 3]
    ] as const)
      if (on)
        for (let x = 0; x < T; x++)
          for (let k = 0; k < 4; k++) r.set(x, ys + k, k === 0 ? WOOD[0] : k < 3 ? WOOD[1] : WOOD[3])
    // posts and handrail ropes
    const post = (cx: number, top: number, bottom: number) => {
      for (let y = top; y < bottom; y++)
        for (let k = 0; k < 6; k++)
          r.set(cx - 3 + k, y, k === 0 ? WOOD[0] : k < 3 ? WOOD[1] : k < 5 ? WOOD[2] : WOOD[3])
      for (let k = 0; k < 6; k++) r.set(cx - 3 + k, top, k === 0 || k === 5 ? WOOD[3] : WOOD[0])
      r.set(cx - 2, top + 1, WOOD[0])
    }
    if (farRail) {
      post(32, 0, deck0 + 3)
      rope(r, 0, 1, 29, 1, 2)
      rope(r, 35, 1, T - 1, 1, 2)
    }
    if (nearRail) {
      post(32, 40, deck1 + 3)
      rope(r, 0, 44, 29, 44, 3)
      rope(r, 35, 44, T - 1, 44, 3)
      for (const x of [8, 20, 44, 56]) {
        for (let y = 47; y < 55; y++) r.set(x, y, y % 2 ? D[2] : D[3])
      }
    }
    let rr = r
    if (vertical) {
      // rotate the horizontal drawing so travel runs north-south; rails come out on the west / east edges
      rr = r.rot90(1)
    }
    return rr
  })
}

// ---------------------------------------------------------------- pit

function pitTile(q: TileQuery) {
  const a = q.around
  const pit = (i: number) => a[i] === 'pit'
  const sig = [N, E, Sx, Wx].map((i) => (pit(i) ? 1 : 0)).join('')
  return memo(`pit${mod(q.tx, 8)},${mod(q.ty, 8)},${sig}`, () => {
    const ox = mod(q.tx, 8) * T
    const oy = mod(q.ty, 8) * T
    const r = new Raster(T, T)
    r.rect(0, 0, T, T, C.black)
    if (!pit(N)) {
      for (let x = 0; x < T; x++) {
        const L = 4 + Math.floor(vn1(ox + x, 8, 101) * 3)
        const F = L + 16 + Math.floor(vn1(ox + x, 16, 102) * 5)
        for (let y = 0; y < F; y++) {
          let c: number
          if (y < L) c = y === 0 ? S[0] : y === L - 1 ? S[3] : S[1]
          else {
            const t = (y - L) / (F - L)
            const course = Math.floor((y - L) / 6)
            const joint = (y - L) % 6 === 5 || mod(ox + x + (course % 2) * 9, 18) === 0
            c = t < 0.3 ? S[1] : t < 0.55 ? S[2] : t < 0.8 ? S[3] : bayer(x, y) < 0.5 ? S[3] : C.black
            if (joint && t < 0.85) c = c === S[1] ? S[2] : c === S[2] ? S[3] : C.black
          }
          r.set(x, y, c)
        }
      }
    }
    if (!pit(Wx))
      for (let y = 0; y < T; y++) {
        const e = 3 + Math.floor(vn1(oy + y, 8, 106) * 3)
        for (let x = 0; x < e; x++) r.set(x, y, x === e - 1 ? S[3] : x < 1 ? S[0] : S[1])
      }
    if (!pit(E))
      for (let y = 0; y < T; y++) {
        const e = 3 + Math.floor(vn1(oy + y, 8, 107) * 3)
        for (let x = 0; x < e; x++) r.set(T - 1 - x, y, x === e - 1 ? S[3] : x < 1 ? S[2] : S[2])
      }
    if (!pit(Sx))
      for (let x = 0; x < T; x++) {
        const e = 4 + Math.floor(vn1(ox + x, 8, 108) * 4)
        for (let k = 0; k < e; k++) r.set(x, T - 1 - k, k === e - 1 ? S[0] : k === e - 2 ? S[1] : S[2])
        r.set(x, T - 1 - e, S[3])
      }
    return r
  })
}

// ---------------------------------------------------------------- provider

export function towerTileImpl(q: TileQuery): Raster | undefined {
  switch (q.kind) {
    case 'sky':
      return skyTile(q)
    case 'cliff':
    case 'grass':
    case 'rock':
    case 'floor':
      return groundTile(q)
    case 'wall':
      return wallTile(q)
    case 'roof':
      return roofTile(q)
    case 'planks':
      return planksTile(q)
    case 'bridge':
      return bridgeTile(q)
    case 'pit':
      return pitTile(q)
    default:
      return undefined
  }
}
export { G, GD, GOLD, tile, rng, R }

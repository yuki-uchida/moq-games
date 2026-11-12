/**
 * Surface nets polygonizer for compiled SDF fields.
 *
 * The grid is split into 8³-cell blocks. Each block keeps only the ops whose influence sphere reaches it, and
 * blocks whose centre is farther from the surface than their half diagonal are skipped, so only a thin shell
 * of samples is evaluated. Each sign-changing cell gets one vertex (mean of its edge crossings), refined by
 * Newton projection onto the zero set; normals are the SDF gradient. Per vertex we then fold colours/masks,
 * compute skin weights (≤ 4 influences, normalised) and bake ambient occlusion from the field.
 *
 * `meshField` is a generator that yields between chunks so callers can time-slice it (see runSliced).
 */
import { evalAttribs, evalBoneWeights, evalDist, type Field, type VertexAttribs } from './field'
import { OpType } from './sculpt'

const ADD: number = OpType.Add,
  INTER: number = OpType.Inter,
  EMBOSS: number = OpType.Emboss

export interface MeshOptions {
  /** Grid cell size (m). */
  cell: number
  /** Ambient occlusion: reach (m) and darkest multiplier; false = none. */
  ao?: { reach: number; min: number } | false
  /** Compute skin weights for `field.boneNames`. */
  skinned?: boolean
  /** Leave paint/emboss colours and masks to the shader (regions.ts); only their geometry is applied here. */
  regions?: boolean
  /** Newton projection steps (default 1). */
  project?: number
  /** Filled with stage timings (ms) and counts when given. */
  stats?: Record<string, number>
}

export interface MeshData {
  positions: Float32Array
  normals: Float32Array
  colors: Float32Array
  /** Top marking colour (rgb) + ramp weight (a) per vertex. */
  marks: Float32Array
  /** Baked ambient occlusion factor per vertex (multiplied in the shader). */
  ao: Float32Array
  masks: Float32Array
  skinIndex: Uint16Array | null
  skinWeight: Float32Array | null
  index: Uint32Array
  vertexCount: number
  triangleCount: number
  /** Bounding box of the vertices. */
  min: [number, number, number]
  max: [number, number, number]
}

const B = 4
// Corner c = dx | dy << 1 | dz << 2; the 12 cube edges as corner pairs.
const EDGES = [0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 4, 6, 5, 7, 0, 4, 1, 5, 2, 6, 3, 7]

export function* meshField(f: Field, opts: MeshOptions): Generator<void, MeshData, void> {
  const cell = opts.cell
  const aoReach = opts.ao ? opts.ao.reach : 0
  const steps = opts.project ?? 1
  const st = opts.stats
  let lap = performance.now()
  const mark = (name: string) => {
    if (!st) return
    const now = performance.now()
    st[name] = (st[name] ?? 0) + now - lap
    lap = now
  }

  // ---- bounds from the add/emboss ops
  const lo = [Infinity, Infinity, Infinity]
  const hi = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < f.count; i++) {
    const t = f.opType[i]
    if (t !== ADD && t !== EMBOSS) continue
    const r = f.bound[i * 4 + 3]
    if (!Number.isFinite(r)) continue
    for (let a = 0; a < 3; a++) {
      lo[a] = Math.min(lo[a], f.bound[i * 4 + a] - r)
      hi[a] = Math.max(hi[a], f.bound[i * 4 + a] + r)
    }
  }
  const pad = cell * 2
  for (let a = 0; a < 3; a++) {
    lo[a] -= pad
    hi[a] += pad
  }
  const px = Math.ceil((hi[0] - lo[0]) / cell) + 1
  const py = Math.ceil((hi[1] - lo[1]) / cell) + 1
  const pz = Math.ceil((hi[2] - lo[2]) / cell) + 1
  const cx = px - 1,
    cy = py - 1,
    cz = pz - 1
  const nbx = Math.ceil(cx / B),
    nby = Math.ceil(cy / B),
    nbz = Math.ceil(cz / B)

  // ---- per-block op lists (lazy): tight lists for the surface, wider ones for AO samples
  const all = new Int32Array(f.count)
  for (let i = 0; i < f.count; i++) all[i] = i
  const scratch = new Int32Array(f.count)
  const makeLists = (margin: number) => {
    const lists: (Int32Array | null)[] = new Array(nbx * nby * nbz).fill(null)
    return (bi: number, bj: number, bk: number): Int32Array => {
      if (bi < 0 || bj < 0 || bk < 0 || bi >= nbx || bj >= nby || bk >= nbz) return all
      const id = bi + nbx * (bj + nby * bk)
      const got = lists[id]
      if (got) return got
      const x0 = lo[0] + bi * B * cell,
        y0 = lo[1] + bj * B * cell,
        z0 = lo[2] + bk * B * cell
      const x1 = x0 + B * cell,
        y1 = y0 + B * cell,
        z1 = z0 + B * cell
      let n = 0
      for (let i = 0; i < f.count; i++) {
        const r = f.bound[i * 4 + 3]
        if (f.opType[i] === INTER || !Number.isFinite(r)) {
          scratch[n++] = i
          continue
        }
        const bx = f.bound[i * 4],
          by = f.bound[i * 4 + 1],
          bz = f.bound[i * 4 + 2]
        const ex = Math.max(x0 - bx, 0, bx - x1)
        const ey = Math.max(y0 - by, 0, by - y1)
        const ez = Math.max(z0 - bz, 0, bz - z1)
        const rr = r + margin
        if (ex * ex + ey * ey + ez * ez <= rr * rr) scratch[n++] = i
      }
      const list = scratch.slice(0, n)
      lists[id] = list
      return list
    }
  }
  // Ops only matter within their own bound (shape + blend); the margin covers projection drift.
  const listFor = makeLists(cell * 1.25)
  // AO samples and colour layers (which extend ~4 cells past their regions) need wider lists.
  const aoListFor = makeLists(Math.max(aoReach, cell * 4) + cell * 2)
  const blockOf = (v: number, a: number) => Math.floor((v - lo[a]) / (B * cell))
  const dist = (x: number, y: number, z: number) => {
    const l = aoListFor(blockOf(x, 0), blockOf(y, 1), blockOf(z, 2))
    return evalDist(f, l, l.length, x, y, z)
  }

  // ---- samples of active blocks
  const samples = new Float32Array(px * py * pz)
  const done = new Uint8Array(px * py * pz)
  const active: number[] = []
  const halfDiag = Math.sqrt(3) * B * cell * 0.5
  let work = 0
  for (let bk = 0; bk < nbz; bk++)
    for (let bj = 0; bj < nby; bj++)
      for (let bi = 0; bi < nbx; bi++) {
        const list = listFor(bi, bj, bk)
        if (list.length === 0) continue
        const ccx = lo[0] + (bi + 0.5) * B * cell,
          ccy = lo[1] + (bj + 0.5) * B * cell,
          ccz = lo[2] + (bk + 0.5) * B * cell
        const dc = evalDist(f, list, list.length, ccx, ccy, ccz)
        if (Math.abs(dc) > halfDiag * 1.5 + cell) continue
        active.push(bi, bj, bk)
        const i0 = bi * B,
          j0 = bj * B,
          k0 = bk * B
        const i1 = Math.min(i0 + B, cx),
          j1 = Math.min(j0 + B, cy),
          k1 = Math.min(k0 + B, cz)
        for (let k = k0; k <= k1; k++)
          for (let j = j0; j <= j1; j++)
            for (let i = i0; i <= i1; i++) {
              const id = i + px * (j + py * k)
              if (done[id]) continue
              done[id] = 1
              samples[id] = evalDist(f, list, list.length, lo[0] + i * cell, lo[1] + j * cell, lo[2] + k * cell)
              work++
            }
        if (work > 40000) {
          work = 0
          yield
        }
      }

  mark('samples')
  if (st) st.active = active.length / 3
  // ---- one vertex per sign-changing cell
  const cellVert = new Int32Array(cx * cy * cz).fill(-1)
  const vpos: number[] = []
  const vcell: number[] = []
  const corner = new Float64Array(8)
  for (let a = 0; a < active.length; a += 3) {
    const i0 = active[a] * B,
      j0 = active[a + 1] * B,
      k0 = active[a + 2] * B
    const i1 = Math.min(i0 + B, cx),
      j1 = Math.min(j0 + B, cy),
      k1 = Math.min(k0 + B, cz)
    for (let k = k0; k < k1; k++)
      for (let j = j0; j < j1; j++)
        for (let i = i0; i < i1; i++) {
          let m = 0
          for (let c = 0; c < 8; c++) {
            const id = i + (c & 1) + px * (j + ((c >> 1) & 1) + py * (k + ((c >> 2) & 1)))
            const v = samples[id]
            corner[c] = v
            if (v < 0) m |= 1 << c
          }
          if (m === 0 || m === 255) continue
          let sx = 0,
            sy = 0,
            sz = 0,
            n = 0
          for (let e = 0; e < 24; e += 2) {
            const c0 = EDGES[e],
              c1 = EDGES[e + 1]
            const in0 = (m >> c0) & 1,
              in1 = (m >> c1) & 1
            if (in0 === in1) continue
            const d0 = corner[c0],
              d1 = corner[c1]
            const t = d0 / (d0 - d1)
            sx += (c0 & 1) + t * ((c1 & 1) - (c0 & 1))
            sy += ((c0 >> 1) & 1) + t * (((c1 >> 1) & 1) - ((c0 >> 1) & 1))
            sz += ((c0 >> 2) & 1) + t * (((c1 >> 2) & 1) - ((c0 >> 2) & 1))
            n++
          }
          cellVert[i + cx * (j + cy * k)] = vpos.length / 3
          vpos.push(lo[0] + (i + sx / n) * cell, lo[1] + (j + sy / n) * cell, lo[2] + (k + sz / n) * cell)
          vcell.push(i, j, k)
        }
  }
  yield

  // ---- faces: one quad per sign-changing grid edge, between the 4 cells around it
  const tris: number[] = []
  const vcount = vpos.length / 3
  for (let v = 0; v < vcount; v++) {
    const i = vcell[v * 3],
      j = vcell[v * 3 + 1],
      k = vcell[v * 3 + 2]
    const base = i + px * (j + py * k)
    const inside = samples[base] < 0
    for (let axis = 0; axis < 3; axis++) {
      const ni = i + (axis === 0 ? 1 : 0),
        nj = j + (axis === 1 ? 1 : 0),
        nk = k + (axis === 2 ? 1 : 0)
      const other = samples[ni + px * (nj + py * nk)] < 0
      if (inside === other) continue
      // The two other axes (cyclic) and the 4 cells sharing the edge.
      const u = (axis + 1) % 3,
        w = (axis + 2) % 3
      const cu = [i, j, k],
        cw = [i, j, k],
        cuw = [i, j, k]
      cu[u]--
      cw[w]--
      cuw[u]--
      cuw[w]--
      if (cu[u] < 0 || cw[w] < 0) continue
      const a = v
      const b = cellVert[cu[0] + cx * (cu[1] + cy * cu[2])]
      const c = cellVert[cuw[0] + cx * (cuw[1] + cy * cuw[2])]
      const d = cellVert[cw[0] + cx * (cw[1] + cy * cw[2])]
      if (b < 0 || c < 0 || d < 0) continue
      // Quad a → b → c → d has its normal along +axis; flip when the surface faces −axis.
      const q = inside ? [a, b, c, d] : [a, d, c, b]
      // Split along the shorter diagonal.
      const d02 = dist2(vpos, q[0], q[2]),
        d13 = dist2(vpos, q[1], q[3])
      if (d02 <= d13) tris.push(q[0], q[1], q[2], q[0], q[2], q[3])
      else tris.push(q[0], q[1], q[3], q[1], q[2], q[3])
    }
  }
  yield

  mark('cells')
  // ---- Newton projection onto the surface, gradient normals
  const positions = new Float32Array(vcount * 3)
  const normals = new Float32Array(vcount * 3)
  const h = cell * 0.25
  for (let v = 0; v < vcount; v++) {
    let x = vpos[v * 3],
      y = vpos[v * 3 + 1],
      z = vpos[v * 3 + 2]
    const ox = x,
      oy = y,
      oz = z
    const l = listFor(Math.floor(vcell[v * 3] / B), Math.floor(vcell[v * 3 + 1] / B), Math.floor(vcell[v * 3 + 2] / B))
    const n = l.length
    let gx = 0,
      gy = 0,
      gz = 0
    for (let s = 0; s <= steps; s++) {
      const f0 = evalDist(f, l, n, x + h, y - h, z - h)
      const f1 = evalDist(f, l, n, x - h, y - h, z + h)
      const f2 = evalDist(f, l, n, x - h, y + h, z - h)
      const f3 = evalDist(f, l, n, x + h, y + h, z + h)
      gx = (f0 - f1 - f2 + f3) / (4 * h)
      gy = (-f0 - f1 + f2 + f3) / (4 * h)
      gz = (-f0 + f1 - f2 + f3) / (4 * h)
      if (s === steps) break
      const d = (f0 + f1 + f2 + f3) * 0.25
      const g2 = gx * gx + gy * gy + gz * gz
      if (g2 < 1e-10) break
      x -= (gx * d) / g2
      y -= (gy * d) / g2
      z -= (gz * d) / g2
      // Stay near the cell so quads never fold.
      const lim = cell * 0.75
      x = Math.min(Math.max(x, ox - lim), ox + lim)
      y = Math.min(Math.max(y, oy - lim), oy + lim)
      z = Math.min(Math.max(z, oz - lim), oz + lim)
    }
    const gl = Math.hypot(gx, gy, gz) || 1
    positions[v * 3] = x
    positions[v * 3 + 1] = y
    positions[v * 3 + 2] = z
    normals[v * 3] = gx / gl
    normals[v * 3 + 1] = gy / gl
    normals[v * 3 + 2] = gz / gl
    if ((v & 1023) === 1023) yield
  }

  mark('project')
  // ---- attributes: skin weights, colours/masks, ambient occlusion
  const colors = new Float32Array(vcount * 3)
  const masks = new Float32Array(vcount * 4)
  const nb = f.boneNames.length
  const skinned = !!opts.skinned && nb > 0
  const skinIndex = skinned ? new Uint16Array(vcount * 4) : null
  const skinWeight = skinned ? new Float32Array(vcount * 4) : null
  const boneW = new Float32Array(Math.max(nb, 1))
  const dscratch = new Float64Array(f.count)
  const marks = new Float32Array(vcount * 4)
  const aoOut = new Float32Array(vcount).fill(1)
  const attr: VertexAttribs = { color: new Float32Array(3), mark: new Float32Array(4), mask: new Float32Array(4) }
  const ramp = cell
  const aoSteps = 4
  let aoNorm = 0
  if (opts.ao)
    for (let s = 0, sca = 1; s < aoSteps; s++, sca *= 0.85) aoNorm += (0.01 + (aoReach * s) / (aoSteps - 1)) * sca
  for (let v = 0; v < vcount; v++) {
    const x = positions[v * 3],
      y = positions[v * 3 + 1],
      z = positions[v * 3 + 2]
    const l = aoListFor(
      Math.floor(vcell[v * 3] / B),
      Math.floor(vcell[v * 3 + 1] / B),
      Math.floor(vcell[v * 3 + 2] / B)
    )
    if (skinned && skinIndex && skinWeight) {
      evalBoneWeights(f, l, l.length, x, y, z, dscratch, boneW)
      writeTop4(boneW, skinIndex, skinWeight, v)
      // Paint filters read the normalised weights.
      boneW.fill(0)
      for (let c = 0; c < 4; c++) boneW[skinIndex[v * 4 + c]] += skinWeight[v * 4 + c]
    }
    evalAttribs(f, l, l.length, x, y, z, skinned ? boneW : null, ramp, attr, !!opts.regions)
    let shade = 1
    if (opts.ao) {
      const nx = normals[v * 3],
        ny = normals[v * 3 + 1],
        nz = normals[v * 3 + 2]
      let occ = 0
      for (let s = 0, sca = 1; s < aoSteps; s++, sca *= 0.85) {
        const hh = 0.01 + (aoReach * s) / (aoSteps - 1)
        occ += (hh - dist(x + nx * hh, y + ny * hh, z + nz * hh)) * sca
      }
      const ao = Math.min(Math.max(1 - (1.6 * occ) / aoNorm, 0), 1)
      shade = opts.ao.min + (1 - opts.ao.min) * ao
    }
    aoOut[v] = shade
    colors[v * 3] = attr.color[0]
    colors[v * 3 + 1] = attr.color[1]
    colors[v * 3 + 2] = attr.color[2]
    marks[v * 4] = attr.mark[0]
    marks[v * 4 + 1] = attr.mark[1]
    marks[v * 4 + 2] = attr.mark[2]
    marks[v * 4 + 3] = attr.mark[3]
    for (let c = 0; c < 4; c++) masks[v * 4 + c] = attr.mask[c]
    if ((v & 511) === 511) yield
  }

  mark('attributes')
  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (let v = 0; v < vcount; v++)
    for (let a = 0; a < 3; a++) {
      const p = positions[v * 3 + a]
      if (p < min[a]) min[a] = p
      if (p > max[a]) max[a] = p
    }
  return {
    positions,
    normals,
    colors,
    marks,
    ao: aoOut,
    masks,
    skinIndex,
    skinWeight,
    index: Uint32Array.from(tris),
    vertexCount: vcount,
    triangleCount: tris.length / 3,
    min,
    max
  }
}

function dist2(p: number[], a: number, b: number): number {
  const dx = p[a * 3] - p[b * 3],
    dy = p[a * 3 + 1] - p[b * 3 + 1],
    dz = p[a * 3 + 2] - p[b * 3 + 2]
  return dx * dx + dy * dy + dz * dz
}

function writeTop4(w: Float32Array, idx: Uint16Array, out: Float32Array, v: number): void {
  let i0 = -1,
    i1 = -1,
    i2 = -1,
    i3 = -1
  for (let b = 0; b < w.length; b++) {
    const x = w[b]
    if (x <= 0) continue
    if (i0 < 0 || x > w[i0]) {
      i3 = i2
      i2 = i1
      i1 = i0
      i0 = b
    } else if (i1 < 0 || x > w[i1]) {
      i3 = i2
      i2 = i1
      i1 = b
    } else if (i2 < 0 || x > w[i2]) {
      i3 = i2
      i2 = b
    } else if (i3 < 0 || x > w[i3]) i3 = b
  }
  const ids = [i0, i1, i2, i3]
  let sum = 0
  for (const b of ids) if (b >= 0) sum += w[b]
  for (let c = 0; c < 4; c++) {
    const b = ids[c]
    idx[v * 4 + c] = b >= 0 ? b : 0
    out[v * 4 + c] = b >= 0 && sum > 0 ? w[b] / sum : c === 0 && sum <= 0 ? 1 : 0
  }
}

/** Runs a generator to completion synchronously. */
export function runSync<T>(gen: Generator<void, T, void>): T {
  for (;;) {
    const r = gen.next()
    if (r.done) return r.value
  }
}

/** Runs a generator in slices of ~`budgetMs`, yielding to the event loop between slices. */
export async function runSliced<T>(gen: Generator<void, T, void>, budgetMs = 10): Promise<T> {
  let start = performance.now()
  for (;;) {
    const r = gen.next()
    if (r.done) return r.value
    if (performance.now() - start > budgetMs) {
      await new Promise<void>((done) => setTimeout(done, 0))
      start = performance.now()
    }
  }
}

/** Sphere-traces the field from `from` along `dir` (unit) and returns the first surface hit, or null. */
export function traceSurface(
  f: Field,
  from: readonly [number, number, number],
  dir: readonly [number, number, number],
  maxDist: number
): { p: [number, number, number]; n: [number, number, number] } | null {
  const all = new Int32Array(f.count)
  for (let i = 0; i < f.count; i++) all[i] = i
  const d = (x: number, y: number, z: number) => evalDist(f, all, f.count, x, y, z)
  let t = 0
  for (let s = 0; s < 256 && t < maxDist; s++) {
    const x = from[0] + dir[0] * t,
      y = from[1] + dir[1] * t,
      z = from[2] + dir[2] * t
    const dd = d(x, y, z)
    if (dd < 1e-4) {
      const h = 1e-3
      const nx = d(x + h, y, z) - d(x - h, y, z),
        ny = d(x, y + h, z) - d(x, y - h, z),
        nz = d(x, y, z + h) - d(x, y, z - h)
      const l = Math.hypot(nx, ny, nz) || 1
      return { p: [x, y, z], n: [nx / l, ny / l, nz / l] }
    }
    t += Math.max(dd * 0.8, 2e-4)
  }
  return null
}

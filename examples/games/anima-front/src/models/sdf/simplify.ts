/**
 * Quadric-error mesh simplification (half-edge collapses) for meshed SDF models. Meshing finely and reducing
 * afterwards keeps small features (ear tips, noses, claws) while the large smooth areas lose triangles.
 * Collapses keep the surviving vertex's exact SDF position, normal, colour, mask and skin weights; attribute
 * differences are penalised so colour markings and joint weights keep their borders; collapses that would flip
 * a triangle or break the manifold are rejected.
 */
import type { MeshData } from './mesher'

export function simplify(m: MeshData, targetTris: number, attrWeight = 4): MeshData {
  const V = m.vertexCount
  if (m.triangleCount <= targetTris) return harmonizeMarks(m)
  const P = m.positions
  const tri = Int32Array.from(m.index)
  const T = tri.length / 3
  const triAlive = new Uint8Array(T).fill(1)
  const dead = new Uint8Array(V)
  const stamp = new Int32Array(V)
  const Q = new Float64Array(V * 10)
  const vt: number[][] = Array.from({ length: V }, () => [])

  const triNormal = (a: number, b: number, c: number, out: number[]) => {
    const ux = P[b * 3] - P[a * 3],
      uy = P[b * 3 + 1] - P[a * 3 + 1],
      uz = P[b * 3 + 2] - P[a * 3 + 2]
    const vx = P[c * 3] - P[a * 3],
      vy = P[c * 3 + 1] - P[a * 3 + 1],
      vz = P[c * 3 + 2] - P[a * 3 + 2]
    out[0] = uy * vz - uz * vy
    out[1] = uz * vx - ux * vz
    out[2] = ux * vy - uy * vx
    return Math.hypot(out[0], out[1], out[2])
  }
  const n0 = [0, 0, 0],
    n1 = [0, 0, 0]
  for (let t = 0; t < T; t++) {
    const a = tri[t * 3],
      b = tri[t * 3 + 1],
      c = tri[t * 3 + 2]
    vt[a].push(t)
    vt[b].push(t)
    vt[c].push(t)
    const len = triNormal(a, b, c, n0)
    if (len < 1e-14) continue
    const nx = n0[0] / len,
      ny = n0[1] / len,
      nz = n0[2] / len
    const d = -(nx * P[a * 3] + ny * P[a * 3 + 1] + nz * P[a * 3 + 2])
    const w = len * 0.5
    const q = [nx * nx, nx * ny, nx * nz, nx * d, ny * ny, ny * nz, ny * d, nz * nz, nz * d, d * d]
    for (const v of [a, b, c]) for (let i = 0; i < 10; i++) Q[v * 10 + i] += q[i] * w
  }

  // Attribute distance between two vertices (colour, mask, skin weights).
  const C = m.colors,
    MK = m.marks,
    M = m.masks,
    SI = m.skinIndex,
    SW = m.skinWeight
  // Contour term of two thresholded ramps: crossing the 0.5 contour costs most, being near it costs some.
  const contour = (ra: number, rb: number) => {
    if (ra >= 0.5 !== rb >= 0.5) return 4
    return Math.min(Math.abs(ra - 0.5), Math.abs(rb - 0.5)) < 0.6 ? 1 : 0
  }
  const attrDiff = (a: number, b: number) => {
    let d = 0
    // Visible colour (thresholded mark layer) and the mark contour.
    const ma = MK[a * 4 + 3],
      mb = MK[b * 4 + 3]
    for (let i = 0; i < 3; i++) {
      const va = ma >= 0.5 ? MK[a * 4 + i] : C[a * 3 + i]
      const vb = mb >= 0.5 ? MK[b * 4 + i] : C[b * 3 + i]
      d += (va - vb) ** 2
    }
    d += contour(ma, mb)
    for (let i = 0; i < 4; i++) d += contour(M[a * 4 + i], M[b * 4 + i]) * 0.5
    if (SI && SW) {
      // L1 distance of sparse weight vectors.
      let s = 0
      for (let i = 0; i < 4; i++) {
        const bi = SI[a * 4 + i]
        let wb = 0
        for (let j = 0; j < 4; j++) if (SI[b * 4 + j] === bi) wb += SW[b * 4 + j]
        s += Math.abs(SW[a * 4 + i] - wb)
      }
      for (let j = 0; j < 4; j++) {
        const bj = SI[b * 4 + j]
        let found = false
        for (let i = 0; i < 4; i++) if (SI[a * 4 + i] === bj && SW[a * 4 + i] > 0) found = true
        if (!found) s += SW[b * 4 + j]
      }
      d += s * s * 0.5
    }
    return d
  }
  const cost = (u: number, v: number) => {
    const x = P[v * 3],
      y = P[v * 3 + 1],
      z = P[v * 3 + 2]
    const o = u * 10,
      p = v * 10
    const q = (i: number) => Q[o + i] + Q[p + i]
    const e =
      q(0) * x * x +
      2 * q(1) * x * y +
      2 * q(2) * x * z +
      2 * q(3) * x +
      q(4) * y * y +
      2 * q(5) * y * z +
      2 * q(6) * y +
      q(7) * z * z +
      2 * q(8) * z +
      q(9)
    const L2 =
      (P[u * 3] - x) * (P[u * 3] - x) +
      (P[u * 3 + 1] - y) * (P[u * 3 + 1] - y) +
      (P[u * 3 + 2] - z) * (P[u * 3 + 2] - z)
    return Math.max(e, 0) + attrDiff(u, v) * attrWeight * L2 * L2 + L2 * L2 * 0.002
  }

  // Binary min-heap of half-edge collapses (u → v) with stamps for lazy invalidation.
  let hc = new Float64Array(1024)
  let hd = new Int32Array(4096)
  let hn = 0
  const push = (c: number, u: number, v: number) => {
    if (hn >= hc.length) {
      const nc = new Float64Array(hc.length * 2)
      nc.set(hc)
      hc = nc
      const nd = new Int32Array(hd.length * 2)
      nd.set(hd)
      hd = nd
    }
    let i = hn++
    while (i > 0) {
      const p = (i - 1) >> 1
      if (hc[p] <= c) break
      hc[i] = hc[p]
      hd[i * 4] = hd[p * 4]
      hd[i * 4 + 1] = hd[p * 4 + 1]
      hd[i * 4 + 2] = hd[p * 4 + 2]
      hd[i * 4 + 3] = hd[p * 4 + 3]
      i = p
    }
    hc[i] = c
    hd[i * 4] = u
    hd[i * 4 + 1] = v
    hd[i * 4 + 2] = stamp[u]
    hd[i * 4 + 3] = stamp[v]
  }
  const pop = (out: Int32Array) => {
    out[0] = hd[0]
    out[1] = hd[1]
    out[2] = hd[2]
    out[3] = hd[3]
    hn--
    const c = hc[hn]
    const lu = hd[hn * 4],
      lv = hd[hn * 4 + 1],
      ls = hd[hn * 4 + 2],
      lt = hd[hn * 4 + 3]
    let i = 0
    for (;;) {
      let ch = i * 2 + 1
      if (ch >= hn) break
      if (ch + 1 < hn && hc[ch + 1] < hc[ch]) ch++
      if (hc[ch] >= c) break
      hc[i] = hc[ch]
      hd[i * 4] = hd[ch * 4]
      hd[i * 4 + 1] = hd[ch * 4 + 1]
      hd[i * 4 + 2] = hd[ch * 4 + 2]
      hd[i * 4 + 3] = hd[ch * 4 + 3]
      i = ch
    }
    hc[i] = c
    hd[i * 4] = lu
    hd[i * 4 + 1] = lv
    hd[i * 4 + 2] = ls
    hd[i * 4 + 3] = lt
  }

  // One-ring of a vertex into a small array (returns the count).
  const neighbours = (v: number, out: Int32Array): number => {
    let n = 0
    for (const t of vt[v]) {
      if (!triAlive[t]) continue
      for (let k = 0; k < 3; k++) {
        const w = tri[t * 3 + k]
        if (w === v) continue
        let seen = false
        for (let i = 0; i < n; i++)
          if (out[i] === w) {
            seen = true
            break
          }
        if (!seen && n < out.length) out[n++] = w
      }
    }
    return n
  }
  const nu = new Int32Array(64),
    nv = new Int32Array(64)
  for (let v = 0; v < V; v++) {
    const c = neighbours(v, nu)
    for (let i = 0; i < c; i++)
      if (nu[i] > v) {
        push(cost(v, nu[i]), v, nu[i])
        push(cost(nu[i], v), nu[i], v)
      }
  }

  // Vertices of triangles that a visible contour crosses (different visible colours, a layered mark changing side
  // or a mask ramp on both sides of 0.5) keep their place, so thresholded colour edges stay where the SDF put them.
  const locked = new Uint8Array(V)
  const visible = (v: number, i: number) => (MK[v * 4 + 3] >= 0.5 ? MK[v * 4 + i] : C[v * 3 + i])
  for (let t = 0; t < T; t++)
    for (let e = 0; e < 3; e++) {
      const a = tri[t * 3 + e],
        b = tri[t * 3 + ((e + 1) % 3)]
      let cross = MK[a * 4 + 3] >= 0.5 !== MK[b * 4 + 3] >= 0.5
      if (!cross) {
        let dv = 0
        for (let i = 0; i < 3; i++) dv += (visible(a, i) - visible(b, i)) ** 2
        cross = dv > 0.002
      }
      for (let i = 0; i < 4 && !cross; i++) cross = M[a * 4 + i] >= 0.5 !== M[b * 4 + i] >= 0.5
      if (cross) locked[tri[t * 3]] = locked[tri[t * 3 + 1]] = locked[tri[t * 3 + 2]] = 1
    }

  let triCount = T
  const item = new Int32Array(4)
  // Pass 1 keeps contour triangles; if the budget is still not met, pass 2 may collapse them too (the
  // attribute penalty then decides which edges go first).
  for (let pass = 0; pass < 2 && triCount > targetTris; pass++) {
    if (pass === 1) {
      locked.fill(0)
      hn = 0
      for (let v = 0; v < V; v++) {
        if (dead[v]) continue
        const c = neighbours(v, nu)
        for (let i = 0; i < c; i++) if (!dead[nu[i]]) push(cost(v, nu[i]), v, nu[i])
      }
    }
    while (triCount > targetTris && hn > 0) {
      pop(item)
      const u = item[0],
        v = item[1]
      if (dead[u] || dead[v] || stamp[u] !== item[2] || stamp[v] !== item[3]) continue
      if (locked[u] || locked[v]) continue
      // Link condition: exactly two shared neighbours on a closed manifold.
      const cu = neighbours(u, nu)
      let adjacent = false
      for (let i = 0; i < cu; i++) if (nu[i] === v) adjacent = true
      if (!adjacent) continue
      const cv = neighbours(v, nv)
      let shared = 0
      for (let i = 0; i < cu; i++) for (let j = 0; j < cv; j++) if (nu[i] === nv[j]) shared++
      if (shared !== 2) continue
      // Reject flips and slivers.
      let ok = true
      for (const t of vt[u]) {
        if (!triAlive[t]) continue
        const a = tri[t * 3],
          b = tri[t * 3 + 1],
          c = tri[t * 3 + 2]
        if (a === v || b === v || c === v) continue
        const l0 = triNormal(a, b, c, n0)
        const na = a === u ? v : a,
          nb = b === u ? v : b,
          nc = c === u ? v : c
        const l1 = triNormal(na, nb, nc, n1)
        if (l1 < 1e-14) {
          ok = false
          break
        }
        if (l0 > 1e-14 && (n0[0] * n1[0] + n0[1] * n1[1] + n0[2] * n1[2]) / (l0 * l1) < 0.3) {
          ok = false
          break
        }
      }
      if (!ok) continue
      // Collapse u → v.
      for (const t of vt[u]) {
        if (!triAlive[t]) continue
        const a = tri[t * 3],
          b = tri[t * 3 + 1],
          c = tri[t * 3 + 2]
        if (a === v || b === v || c === v) {
          triAlive[t] = 0
          triCount--
          continue
        }
        for (let k = 0; k < 3; k++) if (tri[t * 3 + k] === u) tri[t * 3 + k] = v
        vt[v].push(t)
      }
      vt[u] = []
      const list = vt[v]
      let w = 0
      for (let i = 0; i < list.length; i++) if (triAlive[list[i]]) list[w++] = list[i]
      list.length = w
      dead[u] = 1
      for (let i = 0; i < 10; i++) Q[v * 10 + i] += Q[u * 10 + i]
      // Only collapses involving v changed cost (its quadric grew); the stamp invalidates their old entries.
      stamp[v]++
      const cn = neighbours(v, nv)
      for (let i = 0; i < cn; i++) {
        push(cost(v, nv[i]), v, nv[i])
        push(cost(nv[i], v), nv[i], v)
      }
    }
  }

  // Compact.
  const remap = new Int32Array(V).fill(-1)
  let nvtx = 0
  for (let t = 0; t < T; t++) {
    if (!triAlive[t]) continue
    for (let k = 0; k < 3; k++) {
      const v = tri[t * 3 + k]
      if (remap[v] < 0) remap[v] = nvtx++
    }
  }
  const pick = <A extends Float32Array | Uint16Array>(src: A | null, n: number, make: (len: number) => A): A | null => {
    if (!src) return null
    const out = make(nvtx * n)
    for (let v = 0; v < V; v++) {
      const r = remap[v]
      if (r < 0) continue
      for (let i = 0; i < n; i++) out[r * n + i] = src[v * n + i]
    }
    return out
  }
  const index: number[] = []
  for (let t = 0; t < T; t++)
    if (triAlive[t]) index.push(remap[tri[t * 3]], remap[tri[t * 3 + 1]], remap[tri[t * 3 + 2]])
  return harmonizeMarks({
    positions: pick(m.positions, 3, (n) => new Float32Array(n))!,
    normals: pick(m.normals, 3, (n) => new Float32Array(n))!,
    colors: pick(m.colors, 3, (n) => new Float32Array(n))!,
    marks: pick(m.marks, 4, (n) => new Float32Array(n))!,
    ao: pick(m.ao, 1, (n) => new Float32Array(n))!,
    masks: pick(m.masks, 4, (n) => new Float32Array(n))!,
    skinIndex: pick(m.skinIndex, 4, (n) => new Uint16Array(n)),
    skinWeight: pick(m.skinWeight, 4, (n) => new Float32Array(n)),
    index: Uint32Array.from(index),
    vertexCount: nvtx,
    triangleCount: index.length / 3,
    min: m.min,
    max: m.max
  })
}

/**
 * Solid vertices (no colour edge of their own) take the mark side their layered neighbours expect: high when
 * their colour is a neighbour's top layer, low when it is its base. Then no colour leaks across a triangle
 * between a solid vertex and a vertex carrying an edge, however big the triangle is.
 */
export function harmonizeMarks(m: MeshData): MeshData {
  const C = m.colors,
    MK = m.marks
  const V = m.vertexCount
  const idx = m.index
  const solid = new Uint8Array(V)
  for (let v = 0; v < V; v++) {
    let d = 0
    for (let i = 0; i < 3; i++) d += (C[v * 3 + i] - MK[v * 4 + i]) ** 2
    solid[v] = d < 2e-3 ? 1 : 0
  }
  const vote = new Float32Array(V)
  const look = (a: number, b: number) => {
    if (!solid[a] || solid[b]) return
    let dTop = 0,
      dBase = 0
    for (let i = 0; i < 3; i++) {
      dTop += (C[a * 3 + i] - MK[b * 4 + i]) ** 2
      dBase += (C[a * 3 + i] - C[b * 3 + i]) ** 2
    }
    vote[a] += dTop < dBase ? 1 : -1
  }
  for (let t = 0; t < idx.length; t += 3)
    for (let e = 0; e < 3; e++) {
      const a = idx[t + e],
        b = idx[t + ((e + 1) % 3)]
      look(a, b)
      look(b, a)
    }
  for (let v = 0; v < V; v++) {
    if (!solid[v]) continue
    for (let i = 0; i < 3; i++) MK[v * 4 + i] = C[v * 3 + i]
    if (vote[v] > 0) MK[v * 4 + 3] = 2
    else if (vote[v] < 0) MK[v * 4 + 3] = -1
  }
  return m
}

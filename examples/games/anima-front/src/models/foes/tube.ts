/**
 * Procedural tubes for thin limbs (legs, mandibles, spines, antennae, struts). At crowd budgets an SDF mesh
 * of a thin cone collapses into a few slivers; a tube with a fixed number of sides keeps a clean round
 * silhouette and smooth normals at ~10 triangles per ring. Tubes carry the same attributes as baked SDF
 * meshes (colour, mark, AO, masks), so the part's shader paint regions (claw tips, bands, veins) apply to them.
 */
import * as THREE from 'three'
import type { Mask, Vec3 } from '../sdf/sculpt'

export interface TubeSpec {
  /** Centre line. */
  pts: Vec3[]
  /** Radius at each point (the last one may be 0 for a pointed tip). */
  r: number[]
  color: number
  mask?: Mask
  /** Radial sides (default 6). */
  sides?: number
  /** Catmull-Rom subdivisions per span for curved tubes (default 1 = straight spans). */
  smooth?: number
  /** AO at the start and the end (default [0.72, 1]). */
  ao?: [number, number]
  /** Cross-section squash [across, along the bend normal] (blades, flat feelers); default round. */
  flat?: [number, number]
  /** Hint for the cross-section orientation (default world up). */
  up?: Vec3
}

const tmpC = new THREE.Color()

function catmull(p: Vec3[], r: number[], n: number): { pts: Vec3[]; r: number[] } {
  if (n <= 1 || p.length < 3) return { pts: p, r }
  const pts: Vec3[] = []
  const rr: number[] = []
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[Math.max(0, i - 1)],
      p1 = p[i],
      p2 = p[i + 1],
      p3 = p[Math.min(p.length - 1, i + 2)]
    for (let k = 0; k < n; k++) {
      const t = k / n,
        t2 = t * t,
        t3 = t2 * t
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
      pts.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]), f(p0[2], p1[2], p2[2], p3[2])])
      rr.push(r[i] + (r[i + 1] - r[i]) * t)
    }
  }
  pts.push(p[p.length - 1])
  rr.push(r[r.length - 1])
  return { pts, r: rr }
}

/** Builds every tube into one indexed geometry with the kit's attributes. */
export function tubeGeometry(tubes: TubeSpec[]): THREE.BufferGeometry {
  const P: number[] = [],
    N: number[] = [],
    C: number[] = [],
    A: number[] = [],
    M: number[] = [],
    I: number[] = []
  const t = new THREE.Vector3(),
    nrm = new THREE.Vector3(),
    bin = new THREE.Vector3(),
    prevT = new THREE.Vector3(),
    q = new THREE.Quaternion(),
    radial = new THREE.Vector3(),
    a = new THREE.Vector3(),
    b = new THREE.Vector3()
  for (const spec of tubes) {
    const { pts, r } = catmull(spec.pts, spec.r, spec.smooth ?? 1)
    const sides = spec.sides ?? 6
    const [fa, fb] = spec.flat ?? [1, 1]
    const mask = spec.mask ?? [0, 0, 0, 0]
    const [ao0, ao1] = spec.ao ?? [0.72, 1]
    tmpC.setHex(spec.color)
    const n = pts.length
    const tip = r[n - 1] <= 1e-4
    const rings = tip ? n - 1 : n
    const base = P.length / 3
    // Tangents (averaged at joints) and parallel-transported frames.
    const tangent = (i: number, out: THREE.Vector3) => {
      const p0 = pts[Math.max(0, i - 1)],
        p1 = pts[Math.min(n - 1, i + 1)]
      return out.set(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]).normalize()
    }
    tangent(0, t)
    const up = spec.up ?? [0, 1, 0]
    nrm.set(up[0], up[1], up[2])
    if (Math.abs(nrm.dot(t)) > 0.95) nrm.set(1, 0, 0)
    bin.crossVectors(t, nrm).normalize()
    nrm.crossVectors(bin, t).normalize()
    prevT.copy(t)
    let len = 0
    const total = pts.reduce(
      (s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1], p[2] - pts[i - 1][2]) : 0),
      0
    )
    for (let i = 0; i < rings; i++) {
      if (i > 0) {
        len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2])
        tangent(i, t)
        q.setFromUnitVectors(prevT, t)
        nrm.applyQuaternion(q)
        bin.applyQuaternion(q)
        prevT.copy(t)
      }
      // Taper slope tilts the normals along the tube.
      const i0 = Math.max(0, i - 1),
        i1 = Math.min(n - 1, i + 1)
      const ds = Math.max(1e-5, a.set(...pts[i1]).distanceTo(b.set(...pts[i0])))
      const slope = (r[i1] - r[i0]) / ds
      const ao = ao0 + (ao1 - ao0) * (total > 0 ? len / total : 0)
      for (let k = 0; k < sides; k++) {
        const ang = (k / sides) * Math.PI * 2
        const cx = Math.cos(ang),
          cy = Math.sin(ang)
        radial
          .copy(bin)
          .multiplyScalar(cx * fa)
          .addScaledVector(nrm, cy * fb)
        const p = pts[i]
        P.push(p[0] + radial.x * r[i], p[1] + radial.y * r[i], p[2] + radial.z * r[i])
        // Normal of an elliptical section: scale the radial direction by the inverse squash.
        a.copy(bin)
          .multiplyScalar(cx / fa)
          .addScaledVector(nrm, cy / fb)
          .normalize()
          .addScaledVector(t, -slope)
          .normalize()
        N.push(a.x, a.y, a.z)
        C.push(tmpC.r, tmpC.g, tmpC.b)
        A.push(ao)
        M.push(mask[0], mask[1], mask[2], mask[3])
      }
    }
    for (let i = 0; i + 1 < rings; i++)
      for (let k = 0; k < sides; k++) {
        const k1 = (k + 1) % sides
        const v0 = base + i * sides + k,
          v1 = base + i * sides + k1,
          v2 = base + (i + 1) * sides + k,
          v3 = base + (i + 1) * sides + k1
        I.push(v0, v2, v1, v1, v2, v3)
      }
    // Start cap (a flat fan, mostly hidden inside a body) and a pointed or flat end.
    const startC = P.length / 3
    const p0 = pts[0]
    tangent(0, t)
    P.push(p0[0], p0[1], p0[2])
    N.push(-t.x, -t.y, -t.z)
    C.push(tmpC.r, tmpC.g, tmpC.b)
    A.push(ao0 * 0.8)
    M.push(mask[0], mask[1], mask[2], mask[3])
    for (let k = 0; k < sides; k++) I.push(startC, base + k, base + ((k + 1) % sides))
    const endC = P.length / 3
    const pe = pts[n - 1]
    tangent(n - 1, t)
    P.push(pe[0], pe[1], pe[2])
    N.push(t.x, t.y, t.z)
    C.push(tmpC.r, tmpC.g, tmpC.b)
    A.push(ao1)
    M.push(mask[0], mask[1], mask[2], mask[3])
    const last = base + (rings - 1) * sides
    for (let k = 0; k < sides; k++) I.push(endC, last + ((k + 1) % sides), last + k)
  }
  const g = new THREE.BufferGeometry()
  const nv = P.length / 3
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3))
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(N), 3))
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(C), 3))
  g.setAttribute('markColor', new THREE.BufferAttribute(new Float32Array(nv * 4), 4))
  g.setAttribute('ao', new THREE.BufferAttribute(new Float32Array(A), 1))
  g.setAttribute('regionFilter', new THREE.BufferAttribute(new Float32Array(nv * 4), 4))
  g.setAttribute('animaMask', new THREE.BufferAttribute(new Float32Array(M), 4))
  g.setIndex(
    nv > 65535 ? new THREE.BufferAttribute(new Uint32Array(I), 1) : new THREE.BufferAttribute(new Uint16Array(I), 1)
  )
  g.computeBoundingBox()
  g.computeBoundingSphere()
  return g
}

/** Concatenates geometries that share the kit's attribute set (index required). */
export function mergeGeometries(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const parts = list.filter((g) => g.getAttribute('position').count > 0)
  if (parts.length === 1) return parts[0]
  const out = new THREE.BufferGeometry()
  const names = Object.keys(parts[0].attributes)
  let total = 0
  for (const g of parts) total += g.getAttribute('position').count
  for (const name of names) {
    const first = parts[0].getAttribute(name) as THREE.BufferAttribute
    const arr = new Float32Array(total * first.itemSize)
    let o = 0
    for (const g of parts) {
      const a = g.getAttribute(name) as THREE.BufferAttribute | undefined
      if (a) arr.set(a.array as ArrayLike<number>, o)
      o += g.getAttribute('position').count * first.itemSize
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, first.itemSize))
  }
  const idx: number[] = []
  let base = 0
  for (const g of parts) {
    const ix = g.getIndex()!.array
    for (let i = 0; i < ix.length; i++) idx.push(ix[i] + base)
    base += g.getAttribute('position').count
  }
  out.setIndex(
    total > 65535
      ? new THREE.BufferAttribute(new Uint32Array(idx), 1)
      : new THREE.BufferAttribute(new Uint16Array(idx), 1)
  )
  out.computeBoundingBox()
  out.computeBoundingSphere()
  return out
}

/** Triangles of a tube set (for budgets). */
export const tubeTriangles = (g: THREE.BufferGeometry) => (g.getIndex()?.count ?? 0) / 3

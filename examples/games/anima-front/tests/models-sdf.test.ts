import { describe, expect, it } from 'vitest'
import { compileField, evalDist } from '../src/models/sdf/field'
import { meshField, runSync, traceSurface } from '../src/models/sdf/mesher'
import { buildRegions } from '../src/models/sdf/regions'
import { box, capsule, cone, ellipsoid, Sculpt, sphere, torus } from '../src/models/sdf/sculpt'

/** Every undirected edge of a closed manifold mesh is shared by exactly two triangles. */
function openEdges(index: Uint32Array): number {
  const count = new Map<number, number>()
  for (let t = 0; t < index.length; t += 3)
    for (let e = 0; e < 3; e++) {
      const a = index[t + e],
        b = index[t + ((e + 1) % 3)]
      const key = Math.min(a, b) * 1_000_003 + Math.max(a, b)
      count.set(key, (count.get(key) ?? 0) + 1)
    }
  let open = 0
  for (const c of count.values()) if (c !== 2) open++
  return open
}

describe('SDF kit', () => {
  it('meshes a sphere watertight, on the surface, with outward normals and winding', () => {
    const s = new Sculpt().add(sphere([0, 0.5, 0], 0.3), { color: 0xff0000 })
    const f = compileField(s)
    const m = runSync(meshField(f, { cell: 0.02, ao: false }))
    expect(m.triangleCount).toBeGreaterThan(500)
    expect(openEdges(m.index)).toBe(0)
    let area = 0
    for (let v = 0; v < m.vertexCount; v++) {
      const x = m.positions[v * 3],
        y = m.positions[v * 3 + 1] - 0.5,
        z = m.positions[v * 3 + 2]
      expect(Math.abs(Math.hypot(x, y, z) - 0.3)).toBeLessThan(0.002)
      const dot = (x * m.normals[v * 3] + y * m.normals[v * 3 + 1] + z * m.normals[v * 3 + 2]) / 0.3
      expect(dot).toBeGreaterThan(0.95)
    }
    // Triangle winding agrees with the outward normal.
    let agree = 0
    const p = m.positions
    for (let t = 0; t < m.index.length; t += 3) {
      const a = m.index[t] * 3,
        b = m.index[t + 1] * 3,
        c = m.index[t + 2] * 3
      const ux = p[b] - p[a],
        uy = p[b + 1] - p[a + 1],
        uz = p[b + 2] - p[a + 2]
      const vx = p[c] - p[a],
        vy = p[c + 1] - p[a + 1],
        vz = p[c + 2] - p[a + 2]
      const nx = uy * vz - uz * vy,
        ny = uz * vx - ux * vz,
        nz = ux * vy - uy * vx
      const ta = Math.hypot(nx, ny, nz) / 2
      area += ta
      // Newton projection can collapse two vertices onto one point: zero-area triangles have no winding.
      if (ta < 1e-9 || nx * p[a] + ny * (p[a + 1] - 0.5) + nz * p[a + 2] > 0) agree++
    }
    expect(agree).toBe(m.triangleCount)
    expect(Math.abs(area - 4 * Math.PI * 0.09) / (4 * Math.PI * 0.09)).toBeLessThan(0.03)
  })

  it('evaluates every primitive with a correct sign at its centre and outside', () => {
    const shapes = [
      sphere([0, 0, 0], 0.2),
      ellipsoid([0, 0, 0], [0.3, 0.1, 0.2]),
      capsule([0, -0.1, 0], [0, 0.1, 0], 0.05),
      cone([0, -0.1, 0], [0.1, 0.1, 0], 0.08, 0.03),
      box([0, 0, 0], [0.1, 0.2, 0.1], 0.02, [0.3, 0.2, 0.1]),
      torus([0, 0, 0.2], 0.2, 0.05)
    ]
    for (const shape of shapes) {
      const f = compileField(new Sculpt().add(shape))
      const all = Int32Array.from([0])
      const inside = shape === shapes[5] ? [0, 0, 0] : shape.c
      expect(evalDist(f, all, 1, inside[0], inside[1], inside[2])).toBeLessThan(0)
      expect(evalDist(f, all, 1, 2, 2, 2)).toBeGreaterThan(1)
    }
  })

  it('blends colours across a smooth union and paints without changing the shape', () => {
    const plain = new Sculpt()
      .add(sphere([0, 0, 0], 0.2), { color: 0xffffff })
      .add(sphere([0.25, 0, 0], 0.12), { color: 0x000000, k: 0.06 })
    const painted = new Sculpt().append(plain).paint(sphere([-0.2, 0, 0], 0.08), { color: 0xff0000, soft: 0.01 })
    const a = runSync(meshField(compileField(plain), { cell: 0.015, ao: false }))
    const b = runSync(meshField(compileField(painted), { cell: 0.015, ao: false }))
    expect(b.vertexCount).toBe(a.vertexCount)
    expect(Array.from(b.positions)).toEqual(Array.from(a.positions))
    // The visible colour is the mark layer where its ramp is past 0.5 (the shader thresholds it the same way).
    let red = 0
    for (let v = 0; v < b.vertexCount; v++) {
      const top = b.marks[v * 4 + 3] >= 0.5
      const r = top ? b.marks[v * 4] : b.colors[v * 3]
      const g = top ? b.marks[v * 4 + 1] : b.colors[v * 3 + 1]
      if (r > 0.9 && g < 0.1) red++
    }
    expect(red).toBeGreaterThan(10)
    // With shader regions the paint leaves the vertices alone and becomes one region.
    const field = compileField(painted)
    const c = runSync(meshField(field, { cell: 0.015, ao: false, regions: true }))
    expect(Array.from(c.colors)).toEqual(Array.from(a.colors))
    const regions = buildRegions(field)
    expect(regions.count).toBe(1)
    expect(regions.data.length).toBe(regions.width * 4)
  })

  it('traces a surface point', () => {
    const f = compileField(new Sculpt().add(sphere([0, 1, 0], 0.25)))
    const hit = traceSurface(f, [0, 1, 1], [0, 0, -1], 2)
    expect(hit).not.toBeNull()
    expect(hit!.p[2]).toBeCloseTo(0.25, 3)
    expect(hit!.n[2]).toBeCloseTo(1, 2)
  })
})

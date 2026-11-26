/**
 * Sparse voxel authoring for sprite stacks. A part is authored in its own local cells
 * around its pivot (0,0,0); cell (x,y,z) covers [x,x+1) and y is up. +Z faces forward.
 */
export type Vec3 = readonly [number, number, number]

export interface DenseVoxelGrid {
  readonly minX: number
  readonly minY: number
  readonly minZ: number
  readonly sx: number
  readonly sy: number
  readonly sz: number
  readonly data: Uint16Array
}

export class VoxelPart {
  private cells = new Map<string, number>()
  private denseCache?: DenseVoxelGrid | null
  constructor(
    private readonly paletteIndex: (name: string) => number,
    readonly density = 1
  ) {}

  private key(x: number, y: number, z: number): string {
    return `${x},${y},${z}`
  }
  /** Set one native grid cell directly (1 art-px precision regardless of `density`). */
  rawSet(gx: number, gy: number, gz: number, color: string | 0): this {
    const k = this.key(Math.floor(gx), Math.floor(gy), Math.floor(gz))
    if (color === 0) this.cells.delete(k)
    else this.cells.set(k, this.paletteIndex(color))
    this.denseCache = undefined
    return this
  }
  /** Inclusive integer box in native grid cells. */
  rawBox(a: Vec3, b: Vec3, color: string | 0): this {
    const x0 = Math.floor(Math.min(a[0], b[0])),
      x1 = Math.floor(Math.max(a[0], b[0]))
    const y0 = Math.floor(Math.min(a[1], b[1])),
      y1 = Math.floor(Math.max(a[1], b[1]))
    const z0 = Math.floor(Math.min(a[2], b[2])),
      z1 = Math.floor(Math.max(a[2], b[2]))
    const idx = color === 0 ? 0 : this.paletteIndex(color)
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) {
          const k = this.key(x, y, z)
          if (idx === 0) this.cells.delete(k)
          else this.cells.set(k, idx)
        }
    this.denseCache = undefined
    return this
  }
  /** Visit every native cell whose centre lies inside the predicate. */
  rawFill(min: Vec3, max: Vec3, color: string | 0, inside: (gx: number, gy: number, gz: number) => boolean): this {
    const idx = color === 0 ? 0 : this.paletteIndex(color)
    for (let x = Math.floor(min[0]); x <= Math.ceil(max[0]); x++)
      for (let y = Math.floor(min[1]); y <= Math.ceil(max[1]); y++)
        for (let z = Math.floor(min[2]); z <= Math.ceil(max[2]); z++)
          if (inside(x + 0.5, y + 0.5, z + 0.5)) {
            const k = this.key(x, y, z)
            if (idx === 0) this.cells.delete(k)
            else this.cells.set(k, idx)
          }
    this.denseCache = undefined
    return this
  }
  /** Recolour existing cells directly in native grid coordinates. */
  rawPaint(recolor: (gx: number, gy: number, gz: number, color: number) => string | number | 0 | undefined): this {
    for (const [k, color] of [...this.cells]) {
      const [x, y, z] = k.split(',').map(Number)
      const next = recolor(x, y, z, color)
      if (next === undefined || next === color) continue
      if (next === 0) this.cells.delete(k)
      else this.cells.set(k, typeof next === 'number' ? next : this.paletteIndex(next))
    }
    this.denseCache = undefined
    return this
  }
  /** Recolour the outermost native cell(s) of a native row facing +z, -z, +x or -x. */
  rawFace(ga: number, gy: number, color: string, side: '+z' | '-z' | '+x' | '-x' = '+z', depth = 1, extrude = 0): this {
    const a = Math.floor(ga),
      y = Math.floor(gy)
    let best: number | undefined
    for (const [cx, cy, cz] of this.entries()) {
      if (cy !== y) continue
      const lateral = side === '+z' || side === '-z' ? cx : cz
      if (lateral !== a) continue
      const along = side === '+z' || side === '+x' ? (side === '+z' ? cz : cx) : -(side === '-z' ? cz : cx)
      if (best === undefined || along > best) best = along
    }
    if (best === undefined) return this
    const sign = side === '+z' || side === '+x' ? 1 : -1
    for (let d = -extrude; d < depth; d++) {
      const along = (best - d) * sign
      if (side === '+z' || side === '-z') this.rawSet(a, y, along, color)
      else this.rawSet(along, y, a, color)
    }
    return this
  }
  /** Set one logical cell (fills a `density^3` block in native coordinates). */
  set(x: number, y: number, z: number, color: string | 0): this {
    const d = this.density
    if (d === 1) return this.rawSet(x, y, z, color)
    const x0 = Math.floor(x) * d,
      y0 = Math.floor(y) * d,
      z0 = Math.floor(z) * d
    return this.rawBox([x0, y0, z0], [x0 + d - 1, y0 + d - 1, z0 + d - 1], color)
  }
  get(x: number, y: number, z: number): number {
    return this.cells.get(this.key(x, y, z)) ?? 0
  }
  has(x: number, y: number, z: number): boolean {
    return this.cells.has(this.key(x, y, z))
  }
  /** Visit every native cell whose logical centre lies inside the predicate over the given logical bounds. */
  fill(min: Vec3, max: Vec3, color: string | 0, inside: (x: number, y: number, z: number) => boolean): this {
    const d = this.density
    const idx = color === 0 ? 0 : this.paletteIndex(color)
    const x0 = Math.floor(min[0] * d),
      x1 = Math.ceil((max[0] + 1) * d) - 1
    const y0 = Math.floor(min[1] * d),
      y1 = Math.ceil((max[1] + 1) * d) - 1
    const z0 = Math.floor(min[2] * d),
      z1 = Math.ceil((max[2] + 1) * d) - 1
    for (let gx = x0; gx <= x1; gx++)
      for (let gy = y0; gy <= y1; gy++)
        for (let gz = z0; gz <= z1; gz++)
          if (inside((gx + 0.5) / d, (gy + 0.5) / d, (gz + 0.5) / d)) {
            const k = this.key(gx, gy, gz)
            if (idx === 0) this.cells.delete(k)
            else this.cells.set(k, idx)
          }
    this.denseCache = undefined
    return this
  }
  /** Inclusive logical integer cell box. */
  box(a: Vec3, b: Vec3, color: string | 0): this {
    const d = this.density
    const x0 = Math.min(a[0], b[0]) * d,
      x1 = (Math.max(a[0], b[0]) + 1) * d - 1
    const y0 = Math.min(a[1], b[1]) * d,
      y1 = (Math.max(a[1], b[1]) + 1) * d - 1
    const z0 = Math.min(a[2], b[2]) * d,
      z1 = (Math.max(a[2], b[2]) + 1) * d - 1
    return this.rawBox([x0, y0, z0], [x1, y1, z1], color)
  }
  /** Ellipsoid around a continuous logical centre (automatically evaluated smoothly at `density`). */
  ellipsoid(c: Vec3, r: Vec3, color: string | 0): this {
    return this.fill(
      [c[0] - r[0] - 1, c[1] - r[1] - 1, c[2] - r[2] - 1],
      [c[0] + r[0], c[1] + r[1], c[2] + r[2]],
      color,
      (x, y, z) => ((x - c[0]) / r[0]) ** 2 + ((y - c[1]) / r[1]) ** 2 + ((z - c[2]) / r[2]) ** 2 <= 1
    )
  }
  /** Vertical cylinder or cone frustum, radius r0 at y0 and r1 at y1, optionally elliptical (zScale). */
  cylinder(
    cx: number,
    cz: number,
    y0: number,
    y1: number,
    r0: number,
    r1 = r0,
    color: string | 0 = 0,
    zScale = 1
  ): this {
    const r = Math.max(r0, r1)
    return this.fill([cx - r - 1, y0, cz - r * zScale - 1], [cx + r, y1 - 1, cz + r * zScale], color, (x, y, z) => {
      if (y < y0 || y > y1) return false
      const t = y1 === y0 ? 0 : (y - y0) / (y1 - y0)
      const radius = r0 + (r1 - r0) * t
      return (x - cx) ** 2 + ((z - cz) / zScale) ** 2 <= radius * radius
    })
  }
  /** Thick segment (capsule) between continuous logical points, radius tapering from ra to rb. */
  segment(a: Vec3, b: Vec3, ra: number, color: string | 0, rb = ra): this {
    const r = Math.max(ra, rb)
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const length2 = d[0] ** 2 + d[1] ** 2 + d[2] ** 2 || 1
    return this.fill(
      [Math.min(a[0], b[0]) - r - 1, Math.min(a[1], b[1]) - r - 1, Math.min(a[2], b[2]) - r - 1],
      [Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r, Math.max(a[2], b[2]) + r],
      color,
      (x, y, z) => {
        const t = Math.max(0, Math.min(1, ((x - a[0]) * d[0] + (y - a[1]) * d[1] + (z - a[2]) * d[2]) / length2))
        const radius = ra + (rb - ra) * t
        return (x - a[0] - d[0] * t) ** 2 + (y - a[1] - d[1] * t) ** 2 + (z - a[2] - d[2] * t) ** 2 <= radius * radius
      }
    )
  }
  /** Recolour existing cells using logical cell coordinates. */
  paint(recolor: (x: number, y: number, z: number, color: number) => string | number | 0 | undefined): this {
    const d = this.density
    for (const [k, color] of [...this.cells]) {
      const [gx, gy, gz] = k.split(',').map(Number)
      const next =
        d === 1
          ? recolor(gx, gy, gz, color)
          : recolor(Math.floor(gx / d), Math.floor(gy / d), Math.floor(gz / d), color)
      if (next === undefined || next === color) continue
      if (next === 0) this.cells.delete(k)
      else this.cells.set(k, typeof next === 'number' ? next : this.paletteIndex(next))
    }
    this.denseCache = undefined
    return this
  }
  /** Recolour the outermost cell(s) of a logical row facing +z (front), -z (back), +x or -x. */
  face(a: number, y: number, color: string, side: '+z' | '-z' | '+x' | '-x' = '+z', depth = 1, extrude = 0): this {
    const d = this.density
    if (d === 1) return this.rawFace(a, y, color, side, depth, extrude)
    for (let dy = 0; dy < d; dy++)
      for (let da = 0; da < d; da++)
        this.rawFace(a * d + da, y * d + dy, color, side, depth * d, extrude * d)
    return this
  }
  /** Mirror every native cell with x >= 0 onto -x-1 (pivot-centred symmetry). */
  mirrorX(): this {
    for (const [k, color] of [...this.cells]) {
      const [x, y, z] = k.split(',').map(Number)
      if (x >= 0) this.cells.set(this.key(-x - 1, y, z), color)
    }
    this.denseCache = undefined
    return this
  }
  /** Cached dense 3D Uint16Array for zero-allocation slice-sheet baking. */
  toDenseGrid(): DenseVoxelGrid | null {
    if (this.denseCache !== undefined) return this.denseCache
    const b = this.bounds()
    if (!b) {
      this.denseCache = null
      return null
    }
    const minX = b.min[0],
      minY = b.min[1],
      minZ = b.min[2]
    const sx = b.max[0] - minX + 1
    const sy = b.max[1] - minY + 1
    const sz = b.max[2] - minZ + 1
    const data = new Uint16Array(sx * sy * sz)
    const strideZ = sx * sy
    for (const [k, color] of this.cells) {
      const [x, y, z] = k.split(',').map(Number)
      data[(z - minZ) * strideZ + (y - minY) * sx + (x - minX)] = color
    }
    this.denseCache = { minX, minY, minZ, sx, sy, sz, data }
    return this.denseCache
  }
  get size(): number {
    return this.cells.size
  }
  entries(): Iterable<[number, number, number, number]> {
    const list: [number, number, number, number][] = []
    for (const [k, color] of this.cells) {
      const [x, y, z] = k.split(',').map(Number)
      list.push([x, y, z, color])
    }
    return list
  }
  bounds(): { min: [number, number, number]; max: [number, number, number] } | undefined {
    if (!this.cells.size) return undefined
    const min: [number, number, number] = [Infinity, Infinity, Infinity]
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
    for (const [x, y, z] of this.entries()) {
      min[0] = Math.min(min[0], x)
      min[1] = Math.min(min[1], y)
      min[2] = Math.min(min[2], z)
      max[0] = Math.max(max[0], x)
      max[1] = Math.max(max[1], y)
      max[2] = Math.max(max[2], z)
    }
    return { min, max }
  }
}

export interface PaletteBook {
  readonly colors: string[]
  /** Indices drawn unshaded (glowing gems, eyes, flames). */
  readonly glow: Set<number>
  index(name: string): number
}

/**
 * Palette names map to hex colours; raw '#rrggbb' strings may also be used directly.
 * A name prefixed with '*' (in the table or at the call) is a glowing, unshaded colour.
 */
export function palette(named: Readonly<Record<string, string>>): PaletteBook {
  const colors: string[] = ['#000000']
  const glow = new Set<number>()
  const lookup = new Map<string, number>()
  const index = (name: string): number => {
    let lit = name.startsWith('*')
    const bare = lit ? name.slice(1) : name
    const entry = named[bare] ?? named[`*${bare}`]
    if (named[`*${bare}`] !== undefined && named[bare] === undefined) lit = true
    const hex = (entry ?? bare).toLowerCase()
    if (!/^#[0-9a-f]{6}$/.test(hex)) throw new Error(`Unknown stack colour: ${name}`)
    const key = `${lit ? '*' : ''}${hex}`
    let i = lookup.get(key)
    if (i === undefined) {
      i = colors.length
      if (i > 255) throw new Error('A stack palette holds at most 255 colours')
      colors.push(hex)
      if (lit) glow.add(i)
      lookup.set(key, i)
    }
    return i
  }
  return { colors, glow, index }
}

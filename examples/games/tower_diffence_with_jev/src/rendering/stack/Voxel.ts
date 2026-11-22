/**
 * Sparse voxel authoring for sprite stacks. A part is authored in its own local cells
 * around its pivot (0,0,0); cell (x,y,z) covers [x,x+1) and y is up. +Z faces forward.
 */
export type Vec3 = readonly [number, number, number]

export class VoxelPart {
  private cells = new Map<string, number>()
  constructor(private readonly paletteIndex: (name: string) => number) {}

  private key(x: number, y: number, z: number): string {
    return `${x},${y},${z}`
  }
  set(x: number, y: number, z: number, color: string | 0): this {
    const k = this.key(Math.floor(x), Math.floor(y), Math.floor(z))
    if (color === 0) this.cells.delete(k)
    else this.cells.set(k, this.paletteIndex(color))
    return this
  }
  get(x: number, y: number, z: number): number {
    return this.cells.get(this.key(x, y, z)) ?? 0
  }
  has(x: number, y: number, z: number): boolean {
    return this.cells.has(this.key(x, y, z))
  }
  /** Visit every cell whose centre lies inside the predicate over the given cell bounds. */
  fill(min: Vec3, max: Vec3, color: string | 0, inside: (x: number, y: number, z: number) => boolean): this {
    for (let x = Math.floor(min[0]); x <= Math.ceil(max[0]); x++)
      for (let y = Math.floor(min[1]); y <= Math.ceil(max[1]); y++)
        for (let z = Math.floor(min[2]); z <= Math.ceil(max[2]); z++)
          if (inside(x + 0.5, y + 0.5, z + 0.5)) this.set(x, y, z, color)
    return this
  }
  /** Inclusive integer cell box. */
  box(a: Vec3, b: Vec3, color: string | 0): this {
    for (let x = Math.min(a[0], b[0]); x <= Math.max(a[0], b[0]); x++)
      for (let y = Math.min(a[1], b[1]); y <= Math.max(a[1], b[1]); y++)
        for (let z = Math.min(a[2], b[2]); z <= Math.max(a[2], b[2]); z++) this.set(x, y, z, color)
    return this
  }
  /** Ellipsoid around a continuous centre. */
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
  /** Thick segment (capsule) between continuous points, radius tapering from ra to rb. */
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
  /** Recolour existing cells. */
  paint(recolor: (x: number, y: number, z: number, color: number) => string | number | 0 | undefined): this {
    for (const [k, color] of [...this.cells]) {
      const [x, y, z] = k.split(',').map(Number)
      const next = recolor(x, y, z, color)
      if (next === undefined || next === color) continue
      if (next === 0) this.cells.delete(k)
      else this.cells.set(k, typeof next === 'number' ? next : this.paletteIndex(next))
    }
    return this
  }
  /** Recolour the outermost cell(s) of a row facing +z (front), -z (back), +x or -x. */
  face(a: number, y: number, color: string, side: '+z' | '-z' | '+x' | '-x' = '+z', depth = 1, extrude = 0): this {
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
      if (side === '+z' || side === '-z') this.set(a, y, along, color)
      else this.set(along, y, a, color)
    }
    return this
  }
  /** Mirror every cell with x >= 0 onto -x-1 (pivot-centred symmetry). */
  mirrorX(): this {
    for (const [k, color] of [...this.cells]) {
      const [x, y, z] = k.split(',').map(Number)
      if (x >= 0) this.cells.set(this.key(-x - 1, y, z), color)
    }
    return this
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

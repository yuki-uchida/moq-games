/**
 * Stage maps. Levels are authored with a tiny builder rather than raw ASCII so terrain runs, pits and
 * multi-tile props stay aligned. `toString()` renders the same grid for tests and the art exporter.
 *
 * Traversal rules the maps follow (see tests/playthrough.test.ts):
 *  - the ground surface is row 15; hills rise at most two tiles so a full jump can crest them;
 *  - pits are at most three tiles wide, and any three-tile pit has a platform two tiles above it;
 *  - platforms used by the main path sit at row 13 or 14, reachable from the ground.
 *
 * Legend: `#` ground  `D` diggable dirt  `=` one-way platform  `^` spikes  `T` tree  `N` pine
 * `P` pipe  `H` beehive  `A` sleeping animal  `R` rock  `1`/`2` switches  `x`/`y` doors
 * `*` fruit  `t` twig  `b` berry  `s` star  `G` goal  `n` nest  `@` player
 * `E` walker  `F` flyer  `J` jumper  `K` spitter  `U` tough  `B` boss
 */

export const MAP_W = 120
export const MAP_H = 18
export const SURFACE = 15

export class MapBuilder {
  private grid: string[][]
  constructor(
    public readonly w: number = MAP_W,
    public readonly h: number = MAP_H,
    fill = '.'
  ) {
    this.grid = Array.from({ length: h }, () => Array.from({ length: w }, () => fill))
  }

  readonly overwritten: string[] = []
  readonly shifted: string[] = []
  set(ch: string, x: number, y: number) {
    // Props never replace terrain or each other: they stack on top of the first free cell.
    // Terrain writes ('#' and '.') are exact, so pits and ground always land where they were drawn.
    if (ch !== '#' && ch !== '.') {
      const target = y
      while (y > 0 && this.get(x, y) !== '.') y -= 1
      if (y !== target) this.shifted.push(`${ch} ${x},${target} -> ${x},${y}`)
    }
    const existing = this.get(x, y)
    if (existing !== '.' && existing !== '#') this.overwritten.push(`${existing} -> ${ch} at ${x},${y}`)
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.grid[y][x] = ch
    return this
  }

  get(x: number, y: number) {
    return this.grid[y]?.[x] ?? '.'
  }

  fill(ch: string, x0: number, y0: number, x1: number, y1: number) {
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        if (ch === '#') {
          const existing = this.get(x, y)
          if (existing !== '.' && existing !== '#') this.overwritten.push(`fill ${existing} -> # at ${x},${y}`)
        }
        this.set(ch, x, y)
      }
    return this
  }

  /** Solid ground from `surface` down to the bottom of the map. */
  ground(x0: number, x1: number, surface = SURFACE) {
    return this.fill('#', x0, surface, x1, this.h - 1)
  }

  /** A pit: opens the top two ground rows, leaving a floor the player can jump out of. */
  pit(x0: number, x1: number) {
    return this.fill('.', x0, SURFACE, x1, this.h - 2)
  }

  platform(x0: number, x1: number, row: number) {
    return this.fill('=', x0, row, x1, row)
  }

  /** True when the column is part of a raised hill (ground surface above the default row). */
  hill(x: number, hills: readonly (readonly [number, number])[]) {
    return hills.some(([h0, h1]) => x >= h0 && x <= h1)
  }

  /**
   * One-way platforms with head-room: row 13 over flat ground, row 12 over a hill, so the player can
   * always stand underneath (or jump on top).
   */
  platforms(x0: number, x1: number, hills: readonly (readonly [number, number])[] = []) {
    let start = -1
    let onHill = false
    const flush = (end: number) => {
      if (start < 0) return
      this.platform(start, end, onHill ? 12 : 13)
      start = -1
    }
    for (let x = x0; x <= x1; x++) {
      const hill = this.hill(x, hills)
      if (start < 0) {
        start = x
        onHill = hill
      } else if (hill !== onHill) {
        flush(x - 1)
        start = x
        onHill = hill
      }
    }
    flush(x1)
    return this
  }

  spikes(x0: number, x1: number, row = SURFACE - 1) {
    return this.fill('^', x0, row, x1, row)
  }

  /** A diggable dirt mound sitting on the surface. */
  dirt(x0: number, x1: number, tall = 1) {
    return this.fill('D', x0, SURFACE - tall, x1, SURFACE - 1)
  }

  door(ch: string, x: number, top = SURFACE - 3) {
    return this.fill(ch, x, top, x, SURFACE - 1)
  }

  border() {
    this.fill('#', 0, 0, 0, this.h - 1)
    this.fill('#', this.w - 1, 0, this.w - 1, this.h - 1)
    return this
  }

  rows(): string[] {
    return this.grid.map((row) => row.join(''))
  }

  /** True when the whole column is empty from the ceiling down to the surface. */
  columnFree(x: number, top = 8, bottom = SURFACE - 1) {
    if (x < 1 || x >= this.w - 1) return false
    for (let y = top; y <= bottom; y++) if (this.get(x, y) !== '.') return false
    return true
  }
}

/**
 * Finds the closest column to `preferred` that is completely empty from the ceiling to the surface,
 * so a full-height diggable wall or door can be placed without disturbing platforms or props.
 */
function freeColumn(m: MapBuilder, preferred: number) {
  for (let offset = 0; offset < 60; offset++) {
    for (const x of [preferred + offset, preferred - offset]) {
      if (m.columnFree(x)) return x
    }
  }
  return preferred
}

function stage1() {
  const m = new MapBuilder(120, MAP_H)
  m.ground(0, 119)
  m.pit(34, 36)
  m.pit(64, 66)
  m.pit(94, 96)
  m.platform(33, 37, 13)
  m.platform(93, 97, 13)
  m.ground(58, 72, 14)
  m.dirt(18, 21, 1)
  m.dirt(46, 50, 1)
  m.dirt(80, 83, 1)
  m.platform(19, 25, 13)
  m.platform(44, 48, 13)
  m.platform(74, 82, 13)
  m.set('T', 12, 14)
  m.set('T', 25, 14)
  m.set('T', 45, 12)
  m.set('T', 64, 13)
  m.set('T', 86, 14)
  m.set('T', 101, 14)
  m.set('N', 55, 14)
  m.set('N', 99, 14)
  m.set('P', 28, 14)
  m.set('P', 61, 13)
  m.set('P', 90, 14)
  m.set('H', 22, 12)
  m.set('H', 49, 11)
  m.set('H', 78, 12)
  m.set('A', 40, 14)
  m.set('A', 75, 14)
  m.set('A', 104, 14)
  m.set('R', 16, 14)
  m.set('R', 53, 14)
  m.set('R', 96, 14)
  m.set('*', 22, 11)
  m.set('*', 63, 12)
  m.set('*', 91, 12)
  m.set('*', 108, 13)
  m.set('E', 20, 14)
  m.set('E', 33, 14)
  m.set('E', 44, 14)
  m.set('E', 57, 14)
  m.set('E', 70, 13)
  m.set('E', 84, 14)
  m.set('E', 102, 14)
  m.set('F', 36, 8)
  m.set('F', 66, 8)
  m.set('F', 98, 8)
  m.set('J', 48, 14)
  m.set('G', 116, 14)
  m.set('@', 3, 14)
  m.set('B', 1, 14)
  m.border()
  return m
}

function stage2() {
  const m = new MapBuilder(120, MAP_H)
  const HILLS: readonly (readonly [number, number])[] = [
    [44, 54],
    [74, 84]
  ]
  m.ground(0, 119)
  m.pit(28, 30)
  m.pit(58, 60)
  m.pit(88, 90)
  m.platform(27, 31, 13)
  m.platform(57, 61, 13)
  m.platform(87, 91, 13)
  m.ground(44, 54, 14)
  m.ground(74, 84, 14)
  m.dirt(14, 17, 1)
  m.dirt(38, 41, 1)
  m.dirt(68, 71, 1)
  m.dirt(98, 101, 1)
  m.platform(8, 20, 13)
  m.platform(30, 40, 13)
  m.platforms(52, 62, HILLS)
  m.platforms(74, 86, HILLS)
  m.set('T', 10, 14)
  m.set('T', 24, 14)
  m.set('T', 47, 13)
  m.set('T', 77, 13)
  m.set('T', 96, 14)
  m.set('N', 35, 14)
  m.set('N', 65, 14)
  m.set('P', 19, 14)
  m.set('P', 51, 14)
  m.set('P', 81, 14)
  m.set('H', 13, 11)
  m.set('H', 33, 11)
  m.set('H', 55, 11)
  m.set('H', 79, 11)
  m.set('H', 99, 11)
  m.set('A', 22, 14)
  m.set('A', 49, 14)
  m.set('A', 85, 13)
  m.set('R', 36, 14)
  m.set('R', 66, 14)
  m.set('R', 94, 14)
  m.set('*', 14, 12)
  m.set('*', 43, 13)
  m.set('*', 73, 13)
  m.set('*', 104, 13)
  m.set('E', 12, 14)
  m.set('E', 26, 14)
  m.set('E', 40, 14)
  m.set('E', 54, 14)
  m.set('E', 68, 14)
  m.set('E', 82, 14)
  m.set('E', 100, 14)
  m.set('F', 20, 8)
  m.set('F', 50, 8)
  m.set('F', 90, 8)
  m.set('J', 32, 14)
  m.set('J', 64, 14)
  m.set('K', 46, 13)
  m.set('K', 76, 13)
  m.set('U', 106, 14)
  m.set('B', 112, 13)
  m.set('G', 117, 14)
  m.set('h', 114, 14)
  m.set('@', 3, 14)
  const wall = freeColumn(m, 66)
  m.fill('D', wall, 10, wall, 14)
  m.border()
  return m
}

function stage3() {
  const m = new MapBuilder(130, MAP_H)
  const HILLS: readonly (readonly [number, number])[] = [
    [34, 42],
    [56, 64],
    [78, 86]
  ]
  m.ground(0, 129)
  m.pit(22, 24)
  m.pit(44, 46)
  m.pit(66, 68)
  m.pit(88, 90)
  m.platform(21, 25, 13)
  m.platform(43, 47, 13)
  m.platform(65, 69, 13)
  m.platform(87, 91, 13)
  m.ground(34, 42, 14)
  m.ground(56, 64, 14)
  m.ground(78, 86, 14)
  m.dirt(12, 15, 1)
  m.dirt(30, 33, 1)
  m.dirt(52, 55, 1)
  m.dirt(74, 77, 1)
  m.dirt(96, 99, 1)
  m.platform(6, 18, 13)
  m.platforms(28, 40, HILLS)
  m.platforms(50, 62, HILLS)
  m.platforms(72, 84, HILLS)
  m.platform(94, 106, 13)
  m.set('T', 8, 14)
  m.set('T', 18, 14)
  m.set('T', 37, 13)
  m.set('T', 59, 13)
  m.set('T', 81, 13)
  m.set('T', 101, 14)
  m.set('N', 27, 14)
  m.set('N', 47, 14)
  m.set('N', 68, 14)
  m.set('N', 90, 14)
  m.set('P', 14, 14)
  m.set('P', 40, 14)
  m.set('P', 62, 14)
  m.set('P', 84, 14)
  m.set('P', 104, 14)
  m.set('H', 11, 11)
  m.set('H', 35, 11)
  m.set('H', 57, 11)
  m.set('H', 79, 11)
  m.set('H', 103, 11)
  m.set('A', 20, 14)
  m.set('A', 46, 14)
  m.set('A', 72, 14)
  m.set('A', 98, 14)
  m.set('R', 24, 14)
  m.set('R', 54, 14)
  m.set('R', 82, 14)
  m.set('*', 16, 12)
  m.set('*', 43, 13)
  m.set('*', 70, 13)
  m.set('*', 93, 12)
  m.set('*', 110, 13)
  m.set('E', 10, 14)
  m.set('E', 26, 14)
  m.set('E', 38, 13)
  m.set('E', 52, 14)
  m.set('E', 66, 14)
  m.set('E', 80, 13)
  m.set('E', 96, 14)
  m.set('E', 108, 14)
  m.set('F', 18, 8)
  m.set('F', 48, 8)
  m.set('F', 76, 8)
  m.set('F', 106, 8)
  m.set('J', 32, 14)
  m.set('J', 60, 14)
  m.set('J', 92, 14)
  m.set('K', 44, 14)
  m.set('K', 84, 14)
  m.set('h', 6, 14)
  m.set('B', 118, 13)
  m.set('G', 125, 14)
  m.set('@', 3, 14)
  const wall = freeColumn(m, 66)
  m.fill('D', wall, 10, wall, 14)
  m.border()
  return m
}

function stage4() {
  const m = new MapBuilder(120, MAP_H)
  m.ground(0, 119)
  m.pit(30, 32)
  m.pit(60, 62)
  m.pit(90, 92)
  m.platform(29, 33, 13)
  m.platform(59, 63, 13)
  m.platform(89, 93, 13)
  m.ground(40, 50, 14)
  m.ground(70, 80, 14)
  m.fill('#', 0, 0, 119, 3)
  m.set('R', 12, 14)
  m.set('R', 13, 14)
  m.set('R', 12, 13)
  m.set('R', 37, 14)
  m.set('R', 68, 14)
  m.set('R', 84, 14)
  m.set('P', 20, 14)
  m.set('P', 46, 14)
  m.set('P', 74, 14)
  m.set('P', 100, 14)
  m.set('H', 16, 11)
  m.set('H', 44, 11)
  m.set('H', 78, 11)
  m.set('T', 8, 14)
  m.set('T', 26, 14)
  m.set('T', 54, 14)
  m.set('T', 82, 14)
  m.set('T', 104, 14)
  m.set('1', 22, 14)
  m.set('2', 56, 14)
  m.set('A', 48, 14)
  m.set('A', 92, 14)
  m.set('*', 18, 12)
  m.set('*', 52, 13)
  m.set('*', 86, 12)
  m.set('*', 106, 13)
  m.set('E', 10, 14)
  m.set('E', 24, 14)
  m.set('E', 42, 13)
  m.set('E', 58, 14)
  m.set('E', 76, 14)
  m.set('E', 94, 14)
  m.set('F', 14, 8)
  m.set('F', 50, 8)
  m.set('F', 88, 8)
  m.set('J', 34, 14)
  m.set('J', 64, 14)
  m.set('K', 48, 14)
  m.set('K', 102, 14)
  m.set('U', 108, 14)
  m.set('c', 110, 14)
  m.set('B', 112, 13)
  m.set('G', 117, 14)
  m.set('@', 3, 14)
  const wallA = freeColumn(m, 35)
  m.fill('D', wallA, 10, wallA, 14)
  const doorA = freeColumn(m, 38)
  m.door('x', doorA, 8)
  const wallB = freeColumn(m, 84)
  m.fill('D', wallB, 10, wallB, 14)
  const doorB = freeColumn(m, 82)
  m.door('y', doorB, 8)
  m.border()
  return m
}

function stage5() {
  const m = new MapBuilder(130, MAP_H)
  const HILLS: readonly (readonly [number, number])[] = [
    [28, 36],
    [48, 56],
    [68, 76],
    [88, 96]
  ]
  m.ground(0, 129)
  m.pit(18, 20)
  m.pit(38, 40)
  // Too wide to jump: the player has to fell the tree at x=57 to bridge it.
  m.pit(58, 61)
  m.pit(78, 80)
  m.pit(98, 100)
  m.platform(17, 21, 13)
  m.platform(37, 41, 13)
  m.platform(57, 61, 13)
  m.platform(77, 81, 13)
  m.platform(97, 101, 13)
  m.set('T', 57, 14)
  m.ground(28, 36, 14)
  m.ground(48, 56, 14)
  m.ground(68, 76, 14)
  m.ground(88, 96, 14)
  m.dirt(10, 13, 1)
  m.dirt(24, 27, 1)
  m.dirt(34, 37, 1)
  m.dirt(54, 57, 1)
  m.dirt(74, 77, 1)
  m.dirt(94, 97, 1)
  m.set('R', 64, 14)
  m.set('R', 64, 13)
  m.set('R', 64, 12)
  m.platform(6, 18, 13)
  m.platforms(26, 38, HILLS)
  m.platforms(46, 58, HILLS)
  m.platforms(66, 78, HILLS)
  m.platforms(86, 98, HILLS)
  m.set('T', 8, 14)
  m.set('T', 16, 14)
  m.set('T', 31, 13)
  m.set('T', 51, 13)
  m.set('T', 71, 13)
  m.set('T', 91, 13)
  m.set('T', 108, 14)
  m.set('N', 22, 14)
  m.set('N', 46, 14)
  m.set('N', 66, 14)
  m.set('N', 86, 14)
  m.set('N', 106, 14)
  m.set('P', 12, 14)
  m.set('P', 34, 14)
  m.set('P', 54, 14)
  m.set('P', 74, 14)
  m.set('P', 94, 14)
  m.set('H', 15, 11)
  m.set('H', 40, 11)
  m.set('H', 60, 11)
  m.set('H', 80, 11)
  m.set('H', 100, 11)
  m.set('A', 20, 14)
  m.set('A', 44, 14)
  m.set('A', 64, 14)
  m.set('A', 84, 14)
  m.set('A', 104, 14)
  m.set('R', 26, 14)
  m.set('R', 52, 14)
  m.set('R', 72, 14)
  m.set('R', 92, 14)
  m.set('*', 14, 12)
  m.set('*', 33, 13)
  m.set('*', 53, 12)
  m.set('*', 73, 13)
  m.set('*', 93, 12)
  m.set('*', 112, 13)
  m.set('E', 10, 14)
  m.set('E', 24, 14)
  m.set('E', 32, 13)
  m.set('E', 48, 14)
  m.set('E', 62, 14)
  m.set('E', 76, 13)
  m.set('E', 90, 14)
  m.set('E', 106, 14)
  m.set('F', 16, 8)
  m.set('F', 42, 8)
  m.set('F', 70, 8)
  m.set('F', 96, 8)
  m.set('J', 30, 14)
  m.set('J', 56, 14)
  m.set('J', 82, 14)
  m.set('K', 46, 14)
  m.set('K', 86, 14)
  m.set('U', 110, 14)
  m.set('B', 118, 13)
  m.set('G', 125, 14)
  m.set('@', 3, 14)
  const wallA = freeColumn(m, 42)
  m.fill('D', wallA, 10, wallA, 14)
  const wallB = freeColumn(m, 82)
  m.fill('D', wallB, 10, wallB, 14)
  m.border()
  return m
}

function stage6() {
  const m = new MapBuilder(110, MAP_H)
  const HILLS: readonly (readonly [number, number])[] = [
    [36, 46],
    [66, 76],
    [92, 100]
  ]
  m.ground(0, 109)
  m.pit(26, 28)
  m.pit(56, 58)
  m.pit(82, 84)
  m.platform(25, 29, 13)
  m.platform(55, 59, 13)
  m.platform(81, 85, 13)
  m.ground(36, 46, 14)
  m.ground(66, 76, 14)
  m.dirt(10, 14, 1)
  m.dirt(20, 24, 1)
  m.dirt(40, 44, 1)
  m.dirt(50, 54, 1)
  m.dirt(70, 74, 1)
  m.dirt(90, 94, 1)
  m.platform(6, 18, 13)
  m.platforms(26, 40, HILLS)
  m.platforms(46, 60, HILLS)
  m.platforms(66, 80, HILLS)
  m.platforms(86, 100, HILLS)
  m.set('T', 8, 14)
  m.set('T', 18, 14)
  m.set('T', 33, 13)
  m.set('T', 49, 14)
  m.set('T', 63, 14)
  m.set('T', 79, 13)
  m.set('T', 96, 14)
  m.set('N', 15, 14)
  m.set('N', 43, 14)
  m.set('N', 73, 14)
  m.set('P', 12, 14)
  m.set('P', 38, 14)
  m.set('P', 68, 14)
  m.set('P', 88, 14)
  m.set('H', 10, 11)
  m.set('H', 35, 11)
  m.set('H', 58, 11)
  m.set('H', 84, 11)
  m.set('A', 22, 14)
  m.set('A', 46, 14)
  m.set('A', 76, 14)
  m.set('A', 98, 14)
  m.set('R', 16, 14)
  m.set('R', 42, 14)
  m.set('R', 64, 14)
  m.set('R', 92, 14)
  m.set('t', 14, 13)
  m.set('t', 30, 13)
  m.set('t', 47, 13)
  m.set('t', 61, 13)
  m.set('t', 77, 13)
  m.set('t', 93, 13)
  m.set('b', 20, 13)
  m.set('b', 44, 13)
  m.set('b', 70, 13)
  m.set('b', 86, 13)
  m.set('*', 24, 12)
  m.set('*', 52, 12)
  m.set('*', 80, 12)
  m.set('E', 12, 14)
  m.set('E', 28, 14)
  m.set('E', 42, 13)
  m.set('E', 58, 14)
  m.set('E', 74, 13)
  m.set('E', 90, 14)
  m.set('F', 22, 8)
  m.set('F', 50, 8)
  m.set('F', 78, 8)
  m.set('J', 36, 14)
  m.set('J', 66, 14)
  m.set('K', 48, 14)
  m.set('K', 88, 14)
  m.set('n', 105, 14)
  m.set('h', 103, 14)
  m.set('@', 3, 14)
  m.border()
  return m
}

function stage7() {
  const m = new MapBuilder(100, MAP_H)
  const HILLS: readonly (readonly [number, number])[] = [
    [12, 24],
    [44, 56],
    [74, 88]
  ]
  m.ground(0, 99)
  m.fill('#', 0, 0, 99, 3)
  m.fill('#', 0, 0, 3, 17)
  m.fill('#', 96, 0, 99, 17)
  m.ground(4, 30, 15)
  m.ground(38, 60, 15)
  m.ground(68, 95, 15)
  m.pit(31, 33)
  m.pit(61, 63)
  m.platform(30, 34, 13)
  m.platform(60, 64, 13)
  m.ground(12, 24, 14)
  m.ground(44, 56, 14)
  m.ground(74, 88, 14)
  m.set('T', 8, 14)
  m.set('T', 20, 13)
  m.set('T', 42, 13)
  m.set('T', 54, 14)
  m.set('T', 72, 13)
  m.set('T', 84, 14)
  m.set('N', 16, 14)
  m.set('N', 48, 14)
  m.set('N', 78, 14)
  m.set('P', 10, 14)
  m.set('P', 34, 14)
  m.set('P', 52, 14)
  m.set('P', 70, 14)
  m.set('P', 90, 14)
  m.set('H', 6, 11)
  m.set('H', 32, 11)
  m.set('H', 50, 11)
  m.set('H', 68, 11)
  m.set('H', 92, 11)
  m.platforms(4, 14, HILLS)
  m.platform(26, 40, 13)
  m.platforms(46, 62, HILLS)
  m.platforms(66, 82, HILLS)
  m.platforms(86, 94, HILLS)
  m.set('A', 14, 14)
  m.set('A', 40, 14)
  m.set('A', 58, 14)
  m.set('A', 80, 14)
  m.set('R', 18, 14)
  m.set('R', 46, 14)
  m.set('R', 76, 14)
  m.set('1', 22, 14)
  m.set('2', 60, 14)
  m.set('*', 12, 13)
  m.set('*', 44, 13)
  m.set('*', 72, 12)
  m.set('*', 90, 13)
  m.set('E', 8, 14)
  m.set('E', 24, 14)
  m.set('E', 42, 14)
  m.set('E', 56, 14)
  m.set('E', 74, 14)
  m.set('E', 88, 14)
  m.set('F', 12, 8)
  m.set('F', 36, 8)
  m.set('F', 62, 8)
  m.set('F', 86, 8)
  m.set('J', 28, 14)
  m.set('J', 52, 14)
  m.set('J', 80, 14)
  m.set('K', 38, 14)
  m.set('K', 70, 14)
  m.set('U', 92, 14)
  m.set('B', 90, 12)
  m.set('G', 95, 14)
  m.set('@', 6, 14)
  const doorA = freeColumn(m, 42)
  m.door('x', doorA, 8)
  const doorB = freeColumn(m, 64)
  m.door('y', doorB, 8)
  m.border()
  return m
}

function stage8() {
  const m = new MapBuilder(110, MAP_H)
  m.ground(0, 109)
  m.fill('#', 0, 0, 109, 3)
  m.fill('#', 0, 0, 5, 17)
  m.fill('#', 104, 0, 109, 17)
  m.door('x', 14, 8)
  m.door('y', 34, 8)
  m.door('x', 54, 8)
  m.door('y', 74, 8)
  m.set('1', 10, 14)
  m.set('2', 30, 14)
  m.set('1', 50, 14)
  m.set('2', 70, 14)
  m.ground(6, 103, 15)
  m.pit(24, 26)
  m.pit(44, 46)
  m.pit(64, 66)
  m.pit(84, 86)
  m.platform(23, 27, 13)
  m.platform(43, 47, 13)
  m.platform(63, 67, 13)
  m.platform(83, 87, 13)
  m.ground(16, 22, 14)
  m.ground(36, 42, 14)
  m.ground(56, 62, 14)
  m.ground(76, 82, 14)
  m.ground(92, 100, 14)
  m.set('R', 12, 14)
  m.set('R', 20, 14)
  m.set('R', 38, 14)
  m.set('R', 58, 14)
  m.set('R', 78, 14)
  m.set('R', 96, 14)
  m.set('P', 6, 14)
  m.set('P', 26, 14)
  m.set('P', 46, 14)
  m.set('P', 66, 14)
  m.set('P', 86, 14)
  m.set('H', 18, 11)
  m.set('H', 40, 11)
  m.set('H', 60, 11)
  m.set('H', 80, 11)
  m.set('T', 32, 14)
  m.set('T', 52, 14)
  m.set('T', 72, 14)
  m.set('T', 94, 14)
  m.set('A', 22, 14)
  m.set('A', 62, 14)
  m.set('A', 90, 14)
  m.set('*', 16, 13)
  m.set('*', 44, 13)
  m.set('*', 72, 13)
  m.set('*', 98, 13)
  m.set('E', 18, 14)
  m.set('E', 36, 14)
  m.set('E', 56, 14)
  m.set('E', 76, 14)
  m.set('E', 94, 14)
  m.set('F', 14, 8)
  m.set('F', 44, 8)
  m.set('F', 74, 8)
  m.set('J', 26, 14)
  m.set('J', 66, 14)
  m.set('K', 40, 14)
  m.set('K', 80, 14)
  m.set('U', 100, 14)
  m.set('c', 103, 14)
  m.set('B', 100, 12)
  m.set('G', 101, 14)
  m.set('@', 8, 14)
  m.border()
  return m
}

function stage9() {
  const m = new MapBuilder(130, MAP_H)
  const HILLS: readonly (readonly [number, number])[] = [
    [32, 44],
    [62, 74],
    [92, 100]
  ]
  m.ground(0, 129)
  m.fill('#', 0, 0, 129, 3)
  m.pit(24, 26)
  m.pit(52, 54)
  m.pit(80, 82)
  m.pit(104, 106)
  m.platform(23, 27, 13)
  m.platform(51, 55, 13)
  m.platform(79, 83, 13)
  m.platform(103, 107, 13)
  m.ground(32, 44, 14)
  m.ground(62, 74, 14)
  m.ground(92, 100, 14)
  m.dirt(10, 14, 1)
  m.dirt(20, 22, 1)
  m.dirt(38, 42, 1)
  m.dirt(58, 60, 1)
  m.dirt(76, 78, 1)
  m.dirt(96, 98, 1)
  m.dirt(112, 116, 1)
  m.set('R', 104, 14)
  m.set('R', 104, 13)
  m.set('R', 104, 12)
  m.set('R', 104, 11)
  m.set('R', 8, 14)
  m.set('R', 18, 14)
  m.set('R', 36, 14)
  m.set('R', 48, 14)
  m.set('R', 68, 14)
  m.set('R', 88, 14)
  m.set('R', 108, 14)
  m.set('R', 118, 14)
  m.set('P', 12, 14)
  m.set('P', 30, 14)
  m.set('P', 46, 14)
  m.set('P', 64, 14)
  m.set('P', 82, 14)
  m.set('P', 100, 14)
  m.set('P', 120, 14)
  m.set('H', 16, 11)
  m.set('H', 34, 11)
  m.set('H', 54, 11)
  m.set('H', 72, 11)
  m.set('H', 90, 11)
  m.set('H', 110, 11)
  m.set('T', 6, 14)
  m.set('T', 26, 14)
  m.set('T', 40, 13)
  m.set('T', 56, 14)
  m.set('T', 70, 14)
  m.set('T', 86, 14)
  m.set('T', 102, 14)
  m.set('T', 124, 14)
  m.set('N', 20, 14)
  m.set('N', 66, 14)
  m.set('N', 112, 14)
  m.set('1', 14, 14)
  m.set('2', 60, 14)
  m.set('A', 24, 14)
  m.set('A', 50, 14)
  m.set('A', 94, 14)
  m.set('A', 116, 14)
  m.platform(4, 18, 13)
  m.platforms(28, 40, HILLS)
  m.platforms(48, 62, HILLS)
  m.platforms(68, 82, HILLS)
  m.platforms(88, 102, HILLS)
  m.platform(108, 122, 13)
  m.set('*', 20, 12)
  m.set('*', 44, 13)
  m.set('*', 70, 12)
  m.set('*', 94, 13)
  m.set('*', 122, 13)
  m.set('E', 16, 14)
  m.set('E', 22, 14)
  m.set('E', 34, 13)
  m.set('E', 52, 14)
  m.set('E', 66, 13)
  m.set('E', 84, 14)
  m.set('E', 100, 13)
  m.set('E', 118, 14)
  m.set('F', 16, 8)
  m.set('F', 42, 8)
  m.set('F', 72, 8)
  m.set('F', 104, 8)
  m.set('J', 30, 14)
  m.set('J', 60, 14)
  m.set('J', 90, 14)
  m.set('K', 48, 14)
  m.set('K', 88, 14)
  m.set('K', 116, 14)
  m.set('U', 112, 14)
  m.set('B', 122, 12)
  m.set('G', 127, 14)
  m.set('@', 3, 14)
  const wall = freeColumn(m, 84)
  m.fill('D', wall, 10, wall, 14)
  const doorA = freeColumn(m, 46)
  m.door('x', doorA, 8)
  const doorB = freeColumn(m, 104)
  m.door('y', doorB, 8)
  m.border()
  return m
}

function stage10() {
  const m = new MapBuilder(100, MAP_H)
  const HILLS: readonly (readonly [number, number])[] = [
    [28, 38],
    [54, 64],
    [80, 90]
  ]
  m.ground(0, 99)
  m.fill('#', 0, 0, 99, 3)
  m.fill('#', 0, 0, 4, 17)
  m.fill('#', 95, 0, 99, 17)
  m.pit(20, 22)
  m.pit(44, 46)
  m.pit(70, 72)
  m.platform(19, 23, 13)
  m.platform(43, 47, 13)
  m.platform(69, 73, 13)
  m.ground(28, 38, 14)
  m.ground(54, 64, 14)
  m.ground(80, 90, 14)
  m.dirt(10, 14, 1)
  m.dirt(30, 34, 1)
  m.dirt(50, 52, 1)
  m.dirt(66, 68, 1)
  m.dirt(84, 88, 1)
  m.set('R', 8, 14)
  m.set('R', 18, 14)
  m.set('R', 40, 14)
  m.set('R', 58, 14)
  m.set('R', 78, 14)
  m.set('R', 90, 14)
  m.set('P', 12, 14)
  m.set('P', 36, 14)
  m.set('P', 52, 14)
  m.set('P', 66, 14)
  m.set('P', 82, 14)
  m.set('H', 16, 11)
  m.set('H', 34, 11)
  m.set('H', 50, 11)
  m.set('H', 64, 11)
  m.set('H', 86, 11)
  m.set('T', 5, 14)
  m.set('T', 24, 14)
  m.set('T', 42, 13)
  m.set('T', 56, 14)
  m.set('T', 72, 14)
  m.set('T', 88, 13)
  m.set('N', 14, 14)
  m.set('N', 48, 14)
  m.set('N', 80, 14)
  m.set('1', 22, 14)
  m.set('2', 62, 14)
  m.set('A', 18, 14)
  m.set('A', 54, 14)
  m.set('A', 84, 14)
  m.platform(5, 16, 13)
  m.platforms(26, 40, HILLS)
  m.platforms(44, 58, HILLS)
  m.platforms(62, 78, HILLS)
  m.platforms(80, 92, HILLS)
  m.set('*', 14, 12)
  m.set('*', 40, 13)
  m.set('*', 64, 12)
  m.set('*', 88, 13)
  m.set('E', 16, 14)
  m.set('E', 22, 14)
  m.set('E', 32, 13)
  m.set('E', 52, 14)
  m.set('E', 66, 13)
  m.set('E', 82, 14)
  m.set('F', 14, 8)
  m.set('F', 36, 8)
  m.set('F', 60, 8)
  m.set('F', 84, 8)
  m.set('J', 28, 14)
  m.set('J', 56, 14)
  m.set('J', 78, 14)
  m.set('K', 42, 14)
  m.set('K', 70, 14)
  m.set('U', 90, 14)
  m.set('c', 92, 14)
  m.set('B', 90, 12)
  m.set('G', 94, 14)
  m.set('@', 6, 14)
  const wallA = freeColumn(m, 42)
  m.fill('D', wallA, 10, wallA, 14)
  const wallB = freeColumn(m, 60)
  m.fill('D', wallB, 10, wallB, 14)
  const doorA = freeColumn(m, 66)
  m.door('x', doorA, 8)
  const doorB = freeColumn(m, 79)
  m.door('y', doorB, 8)
  m.border()
  return m
}

const STAGE_BUILDERS: Record<string, MapBuilder> = {
  'stage-1': stage1(),
  'stage-2': stage2(),
  'stage-3': stage3(),
  'stage-4': stage4(),
  'stage-5': stage5(),
  'stage-6': stage6(),
  'stage-7': stage7(),
  'stage-8': stage8(),
  'stage-9': stage9(),
  'stage-10': stage10()
}

export const MAP_BUILDERS = STAGE_BUILDERS

export const MAPS: Record<string, readonly string[]> = Object.fromEntries(
  Object.entries(STAGE_BUILDERS).map(([id, builder]) => [id, builder.rows()])
)

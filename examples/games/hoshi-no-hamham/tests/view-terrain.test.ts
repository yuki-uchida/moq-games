import { describe, expect, it } from 'vitest'
import { T, TILE, World, emptyInput } from '../src/game/sim'
import { STAGES } from '../src/game/stages'
import { doorPieces, gatePieces, hivePostRows, logPieces, type LogRecord } from '../src/view/props'
import { affectedBy, decorAt, neighbourAt, tileQuery, type TileGrid } from '../src/view/terrain'

/** A grid from rows of '#' (solid), 'D' (dirt), '=' (platform), '^' (spike) and '.' (empty). */
function grid(rows: string[]): TileGrid & { tiles: Uint8Array } {
  const h = rows.length
  const w = rows[0].length
  const tiles = new Uint8Array(w * h)
  const code: Record<string, number> = { '#': T.SOLID, D: T.DIRT, '=': T.PLATFORM, '^': T.SPIKE, '.': T.EMPTY }
  rows.forEach((row, y) => [...row].forEach((ch, x) => (tiles[y * w + x] = code[ch])))
  return { w, h, tiles, theme: 'meadow' }
}

describe('terrain queries', () => {
  const g = grid(['.=..', '#D^.', '####'])

  it('maps tile codes and empty cells', () => {
    expect(tileQuery(g, 0, 0)).toBeNull()
    expect(tileQuery(g, 1, 0)?.kind).toBe('platform')
    expect(tileQuery(g, 0, 1)?.kind).toBe('solid')
    expect(tileQuery(g, 1, 1)?.kind).toBe('dirt')
    expect(tileQuery(g, 2, 1)?.kind).toBe('spike')
    const q = tileQuery(g, 1, 1)!
    expect(q.theme).toBe('meadow')
    expect([q.tx, q.ty]).toEqual([1, 1])
  })

  it('reports neighbours N, NE, E, SE, S, SW, W, NW', () => {
    expect(tileQuery(g, 1, 1)!.around).toEqual([
      'platform',
      'empty',
      'spike',
      'solid',
      'solid',
      'solid',
      'solid',
      'empty'
    ])
  })

  it('treats the left, right and bottom edges as outside and above the map as empty', () => {
    const corner = tileQuery(g, 0, 2)!
    expect(corner.around).toEqual(['solid', 'dirt', 'solid', undefined, undefined, undefined, undefined, undefined])
    const right = tileQuery(g, 3, 2)!
    expect(right.around[2]).toBeUndefined()
    expect(right.around[1]).toBeUndefined()
    const top = tileQuery(g, 1, 0)!
    expect(top.around[0]).toBe('empty')
    expect(top.around[1]).toBe('empty')
    expect(top.around[7]).toBe('empty')
    expect(neighbourAt(g, -1, 0)).toBeUndefined()
    expect(neighbourAt(g, 0, -1)).toBe('empty')
    expect(neighbourAt(g, 0, 3)).toBeUndefined()
  })

  it('reflects a dig in the neighbours and names every tile to repaint', () => {
    const dug = grid(['....', '#DD#', '####'])
    expect(tileQuery(dug, 1, 2)!.around[0]).toBe('dirt')
    dug.tiles[1 * dug.w + 1] = T.EMPTY
    expect(tileQuery(dug, 1, 1)).toBeNull()
    expect(tileQuery(dug, 1, 2)!.around[0]).toBe('empty')
    expect(tileQuery(dug, 2, 1)!.around[6]).toBe('empty')
    const cells = affectedBy(1, 1)
    expect(cells).toHaveLength(9)
    expect(new Set(cells.map(([x, y]) => `${x},${y}`)).size).toBe(9)
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) expect(cells).toContainEqual([1 + dx, 1 + dy])
  })

  it('scatters decorations on about one exposed top in three, never on dirt or into a prop', () => {
    const wide = grid(['.'.repeat(300), 'D'.repeat(10) + '#'.repeat(290), '#'.repeat(300)])
    const list = [
      { where: 'top' as const, weight: 2 },
      { where: 'top' as const, weight: 1 },
      { where: 'under' as const, weight: 1 }
    ]
    let tops = 0
    for (let x = 0; x < 300; x++) {
      const pick = decorAt(wide, list, x, 1, 'top', new Set())
      if (x < 10) expect(pick).toBeNull()
      if (pick) {
        tops++
        expect(list[pick.index].where).toBe('top')
      }
      // Buried tiles have no exposed top.
      expect(decorAt(wide, list, x, 2, 'top', new Set())).toBeNull()
    }
    expect(tops).toBeGreaterThan(290 / 3 - 30)
    expect(tops).toBeLessThan(290 / 3 + 30)
    const blocked = new Set(Array.from({ length: 300 }, (_, x) => 0 * 300 + x))
    for (let x = 0; x < 300; x++) expect(decorAt(wide, list, x, 1, 'top', blocked)).toBeNull()
    expect(decorAt(wide, [], 50, 1, 'top', new Set())).toBeNull()
  })
})

describe('prop placement', () => {
  it('covers every tile of a door with a cap, middles and a foot', () => {
    expect(doorPieces({ x: 128, y: 64, w: 1, h: 4 })).toEqual([
      { x: 128, y: 64, clip: 'top' },
      { x: 128, y: 128, clip: 'mid' },
      { x: 128, y: 192, clip: 'mid' },
      { x: 128, y: 256, clip: 'bottom' }
    ])
    expect(doorPieces({ x: 0, y: 0, w: 1, h: 1 })).toEqual([{ x: 0, y: 0, clip: 'top' }])
    expect(doorPieces({ x: 0, y: 0, w: 2, h: 2 })).toHaveLength(4)
  })

  it('stacks the boss gate over its rows', () => {
    expect(gatePieces({ tx: 5, top: 3, bottom: 5 })).toEqual([
      { x: 320, y: 192, clip: 'top' },
      { x: 320, y: 256, clip: 'mid' },
      { x: 320, y: 320, clip: 'bottom' }
    ])
  })

  it('lays a log on its four tiles and fills the cells below it that span a pit', () => {
    const log: LogRecord = { kind: 'tree', tx: 4, ty: 6, length: 4, dir: -1 }
    const ground = new Set(['4,7', '7,7'])
    const at = logPieces(log, (tx, ty) => ground.has(`${tx},${ty}`))
    expect(at).toEqual({
      x: 256,
      y: 384,
      flip: true,
      under: [
        { x: 320, y: 448 },
        { x: 384, y: 448 }
      ]
    })
  })

  it('stands a hive post down to the first ground (at most five)', () => {
    expect(hivePostRows((ty) => ty < 6, 2)).toEqual([3, 4, 5])
    expect(hivePostRows(() => true, 2)).toEqual([3, 4, 5, 6, 7])
    expect(hivePostRows(() => false, 2)).toEqual([])
  })
})

describe('placement matches the simulation', () => {
  const stage = (no: number) => STAGES.find((s) => s.no === no)!

  it('a felled log is drawn exactly where it is solid', () => {
    const world = new World(stage(1), { seed: 5 })
    const tree = world.props.find((p) => p.kind === 'tree' && world.solidAt(p.x / TILE, p.y / TILE + 1))!
    world.player.x = 4 * TILE
    world.biteProp(tree, 1)
    world.biteProp(tree, 1)
    let landed: LogRecord | null = null
    for (let i = 0; i < 120 && !landed; i++) {
      world.step(1 / 60, emptyInput())
      for (const e of world.events) if (e.type === 'tree-land') landed = { ...e }
      world.events.length = 0
    }
    expect(landed).not.toBeNull()
    const at = logPieces(landed!, (tx, ty) => world.tileAt(tx, ty) === T.SOLID || world.tileAt(tx, ty) === T.DIRT)
    for (let i = 0; i < landed!.length; i++) {
      expect(world.solidAt(landed!.tx + i, landed!.ty)).toBe(true)
      // The cell above the log is where the hero stands.
      expect(world.solidAt(landed!.tx + i, landed!.ty - 1)).toBe(false)
    }
    expect(at.y).toBe(landed!.ty * TILE)
    for (const cell of at.under) expect(world.solidAt(cell.x / TILE, cell.y / TILE)).toBe(true)
  })

  it('every drawn door tile is solid while the door is closed', () => {
    for (const no of [4, 7, 8, 9, 10]) {
      const world = new World(stage(no), { seed: 5 })
      const doors = world.props.filter((p) => p.kind === 'door')
      expect(doors.length).toBeGreaterThan(0)
      for (const door of doors)
        for (const piece of doorPieces(door)) expect(world.solidAt(piece.x / TILE, piece.y / TILE)).toBe(true)
    }
  })

  it('every drawn gate tile is solid while the arena is sealed', () => {
    const world = new World(stage(4), { seed: 5 })
    const boss = world.boss!
    world.player.x = boss.arenaX
    world.player.y = boss.y + boss.h - world.player.h
    let gate: { tx: number; top: number; bottom: number } | null = null
    for (let i = 0; i < 10 && !gate; i++) {
      world.step(1 / 60, emptyInput())
      for (const e of world.events) if (e.type === 'gate-up') gate = { tx: e.tx, top: e.top, bottom: e.bottom }
      world.events.length = 0
    }
    expect(gate).not.toBeNull()
    for (const piece of gatePieces(gate!)) expect(world.solidAt(piece.x / TILE, piece.y / TILE)).toBe(true)
  })
})

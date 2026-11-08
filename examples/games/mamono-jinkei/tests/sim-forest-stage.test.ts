import { describe, expect, test } from 'vitest'
import { stageInfo } from '../src/sim/api'
import { Grid } from '../src/sim/grid'
import { footTiles } from '../src/sim/props'
import { parseStage, type Cond } from '../src/sim/stage-data'
import { FOREST } from '../src/stages/forest'
import { STAGE_TILES, TILE, TILE_KINDS } from '../src/vocab'

const P = parseStage(FOREST)
const { info } = P
const tileAt = (x: number, y: number) => ({ tx: Math.floor(x / TILE), ty: Math.floor(y / TILE) })

describe('stage 4 data', () => {
  test('rectangular map in range, legend complete, night, forest tiles', () => {
    const w = FOREST.map[0].length
    expect(w).toBeGreaterThanOrEqual(64)
    expect(w).toBeLessThanOrEqual(80)
    expect(FOREST.map.length).toBeGreaterThanOrEqual(48)
    expect(FOREST.map.length).toBeLessThanOrEqual(64)
    for (const row of FOREST.map) {
      expect(row.length).toBe(w)
      for (const c of row) expect(FOREST.legend[c], `legend '${c}'`).toBeDefined()
    }
    for (const k of info.tiles) expect(STAGE_TILES.forest).toContain(k)
    expect(info.light).toBe('night')
    expect(stageInfo('forest')).toBe(stageInfo('forest'))
    expect(info.npcs.map((n) => n.kind)).toEqual(['bard'])
    expect(P.signs.length).toBe(FOREST.signs.length)
    expect(info.rooms.find((r) => r.id === 'H')?.zoom).toBe(720)
    expect(P.boss?.kind).toBe('leon')
  })

  test('spawns on walkable ground; condition ids exist; puzzle spacing; decoration', () => {
    const walk = (x: number, y: number) => TILE_KINDS[info.tiles[tileAt(x, y).ty * info.w + tileAt(x, y).tx]].walk
    expect(walk(P.spawn.x, P.spawn.y)).toBe(true)
    for (const e of P.enemies) expect(walk(e.x, e.y), e.kind).toBe(true)
    expect(walk(P.boss!.x, P.boss!.y)).toBe(true)
    for (const p of P.props)
      for (const [tx, ty] of footTiles(p.kind, p.x, p.y))
        expect(TILE_KINDS[info.tiles[ty * info.w + tx]].walk, `${p.kind} at ${tx},${ty}`).toBe(true)
    for (const cp of Object.values(P.checkpoints)) expect(walk(cp.x, cp.y)).toBe(true)
    for (const r of FOREST.rooms)
      for (const wave of r.waves ?? [])
        for (const s of wave) expect(TILE_KINDS[info.tiles[s.y * info.w + s.x]].walk).toBe(true)
    const parts = new Set(P.props.map((p) => p.spec.id).filter(Boolean))
    const refs = (c: Cond): string[] =>
      'all' in c ? c.all.flatMap(refs) : 'any' in c ? c.any.flatMap(refs) : 'on' in c ? [c.on] : []
    for (const p of P.props) if (p.spec.cond) for (const id of refs(p.spec.cond)) expect(parts.has(id), id).toBe(true)
    // Four moonstones in four clearings, beyond one howl's reach of each other.
    const set = P.props.filter((p) => p.kind === 'moonstone' && p.spec.group === 'D')
    expect(set.length).toBe(4)
    for (const a of set)
      for (const b of set) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y) / TILE).toBeGreaterThanOrEqual(6)
    const log = P.props.find((p) => p.kind === 'log')!
    const slot = P.props.find((p) => p.kind === 'ramslot')!
    expect(Math.hypot(log.x - slot.x, log.y - slot.y) / TILE).toBeGreaterThanOrEqual(10)
    for (const k of ['iceblock', 'icewall', 'bigmoon', 'snowpile'])
      expect(
        P.props.some((p) => p.kind === k),
        k
      ).toBe(true)
    for (const k of ['hunter', 'paladin', 'icewitch', 'heavy'])
      expect(
        P.enemies.some((e) => e.kind === k) || FOREST.rooms.some((r) => r.waves?.flat().some((s) => s.kind === k)),
        k
      ).toBe(true)
    for (const k of ['pine', 'deadtree', 'tent', 'brazier', 'banner'])
      expect(
        info.decor.some((d) => d.kind === k),
        k
      ).toBe(true)
    expect(info.tiles.filter((k) => k === 'ice').length).toBeGreaterThan(100)
  })

  test('every room is reachable with the puzzles solved (block sunk, walls broken, gates open)', () => {
    const g = new Grid(info)
    g.setSolidProps(
      P.props
        .filter((p) => !['gate', 'bossdoor', 'icewall', 'iceblock', 'log', 'snowpile'].includes(p.kind))
        .map((p) => ({ kind: p.kind, state: 'idle', x: p.x, y: p.y }))
    )
    // The ice block fills the moat in front of the island.
    g.fill(g.idx(57, 43))
    const start = tileAt(P.spawn.x, P.spawn.y)
    for (const r of info.rooms) {
      let t = -1
      for (let y = r.y; y < r.y + r.h && t < 0; y++)
        for (let x = r.x; x < r.x + r.w; x++) if (g.free(x, y)) (t = g.idx(x, y)), (y = 1e9)
      expect(t, `room ${r.id} has ground`).toBeGreaterThanOrEqual(0)
      expect(g.path(start.tx, start.ty, t % info.w, Math.floor(t / info.w), false, 80000), `room ${r.id}`).toBeDefined()
    }
    const lever = P.props.find((p) => p.kind === 'lever')!
    expect(
      g.path(start.tx, start.ty, tileAt(lever.x, lever.y).tx - 1, tileAt(lever.x, lever.y).ty, false, 80000)
    ).toBeDefined()
    // Without the block the island is cut off.
    const g2 = new Grid(info)
    g2.setSolidProps(
      P.props.filter((p) => p.kind !== 'gate').map((p) => ({ kind: p.kind, state: 'idle', x: p.x, y: p.y }))
    )
    expect(
      g2.path(start.tx, start.ty, tileAt(lever.x, lever.y).tx - 1, tileAt(lever.x, lever.y).ty, false, 80000)
    ).toBeUndefined()
  })
})

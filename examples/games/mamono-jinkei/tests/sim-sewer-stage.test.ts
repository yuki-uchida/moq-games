import { describe, expect, test } from 'vitest'
import { stageInfo } from '../src/sim/api'
import { Grid } from '../src/sim/grid'
import { footTiles } from '../src/sim/props'
import { parseStage, type Cond } from '../src/sim/stage-data'
import { SEWER } from '../src/stages/sewer'
import { STAGE_TILES, TILE, TILE_KINDS } from '../src/vocab'

const P = parseStage(SEWER)
const { info } = P
const tileAt = (x: number, y: number) => ({ tx: Math.floor(x / TILE), ty: Math.floor(y / TILE) })

describe('stage 2 data', () => {
  test('rectangular map in range, legend complete, dim light, only sewer tiles', () => {
    const w = SEWER.map[0].length
    expect(w).toBeGreaterThanOrEqual(64)
    expect(w).toBeLessThanOrEqual(80)
    expect(SEWER.map.length).toBeGreaterThanOrEqual(48)
    expect(SEWER.map.length).toBeLessThanOrEqual(64)
    for (const row of SEWER.map) {
      expect(row.length).toBe(w)
      for (const c of row) expect(SEWER.legend[c], `legend '${c}'`).toBeDefined()
    }
    for (const k of info.tiles) expect(STAGE_TILES.sewer).toContain(k)
    expect(info.light).toBe('dim')
    expect(stageInfo('sewer')).toBe(stageInfo('sewer'))
    expect(info.npcs.map((n) => n.kind)).toEqual(['smith'])
    expect(P.signs.length).toBe(SEWER.signs.length)
    expect(info.rooms.find((r) => r.id === 'H')?.zoom).toBe(720)
    expect(P.boss?.kind).toBe('milda')
  })

  test('currents and holes: channels with directions, holes in pairs with a way out on both sides', () => {
    expect(info.currents?.map((c) => c.channel).sort()).toEqual(['B', 'C', 'E'])
    for (const c of info.currents!) for (const i of c.tiles) expect(info.tiles[i]).toBe('current')
    expect(info.currents!.find((c) => c.channel === 'C')?.strong).toBe(true)
    const g = new Grid(info)
    expect(info.holes?.length).toBe(3)
    for (const [a, b] of info.holes!) {
      expect(info.tiles[a]).toBe('hole')
      expect(info.tiles[b]).toBe('hole')
      expect(g.holeExit.has(a) && g.holeExit.has(b)).toBe(true)
    }
    // The sluice stops the torrent.
    const sluice = P.props.find((p) => p.kind === 'sluice')!
    expect(sluice.spec.stops).toEqual(['C'])
  })

  test('every spawn sits on a walkable tile; condition ids exist; puzzle spacing', () => {
    const walk = (x: number, y: number) => TILE_KINDS[info.tiles[tileAt(x, y).ty * info.w + tileAt(x, y).tx]].walk
    expect(walk(P.spawn.x, P.spawn.y)).toBe(true)
    for (const e of P.enemies) expect(walk(e.x, e.y), e.kind).toBe(true)
    expect(walk(P.boss!.x, P.boss!.y)).toBe(true)
    for (const p of P.props)
      for (const [tx, ty] of footTiles(p.kind, p.x, p.y))
        expect(TILE_KINDS[info.tiles[ty * info.w + tx]].walk, `${p.kind} at ${tx},${ty}`).toBe(true)
    for (const cp of Object.values(P.checkpoints)) expect(walk(cp.x, cp.y)).toBe(true)
    for (const r of SEWER.rooms)
      for (const wave of r.waves ?? [])
        for (const s of wave) expect(TILE_KINDS[info.tiles[s.y * info.w + s.x]].walk).toBe(true)
    const parts = new Set(P.props.map((p) => p.spec.id).filter(Boolean))
    const refs = (c: Cond): string[] =>
      'all' in c ? c.all.flatMap(refs) : 'any' in c ? c.any.flatMap(refs) : 'on' in c ? [c.on] : []
    for (const p of P.props) if (p.spec.cond) for (const id of refs(p.spec.cond)) expect(parts.has(id), id).toBe(true)
    const valves = P.props.filter((p) => p.kind === 'valve')
    expect(valves.length).toBe(2)
    const cheese = P.props.find((p) => p.kind === 'cheese')!
    const scale = P.props.find((p) => p.kind === 'scale')!
    expect(Math.hypot(cheese.x - scale.x, cheese.y - scale.y) / TILE).toBeGreaterThanOrEqual(10)
    expect(P.props.filter((p) => p.kind === 'barricade').length).toBe(2)
    expect(P.props.filter((p) => p.kind === 'mousetrap').length).toBeGreaterThanOrEqual(4)
    for (const k of ['thief', 'alchemist', 'ratcatcher', 'spearguard'])
      expect(
        P.enemies.some((e) => e.kind === k) || SEWER.rooms.some((r) => r.waves?.flat().some((s) => s.kind === k)),
        k
      ).toBe(true)
    for (const k of ['lamp', 'pipe', 'grate', 'sack', 'haybale', 'shelf', 'cobweb'])
      expect(
        info.decor.some((d) => d.kind === k),
        k
      ).toBe(true)
  })

  test('all rooms are reachable with every puzzle solved (BFS with mouse holes)', () => {
    const g = new Grid(info)
    g.setSolidProps(
      P.props
        .filter(
          (p) =>
            !['crate', 'bigcrate', 'barricade', 'gate', 'bossdoor', 'pot', 'barrel', 'cheese', 'mousetrap'].includes(
              p.kind
            )
        )
        .map((p) => ({ kind: p.kind, state: 'idle', x: p.x, y: p.y }))
    )
    // The crate fills the sludge gap in front of the B nook.
    g.fill(g.idx(65, 60))
    const start = tileAt(P.spawn.x, P.spawn.y)
    const seen = new Uint8Array(info.w * info.h)
    const q: [number, number][] = [[start.tx, start.ty]]
    seen[start.ty * info.w + start.tx] = 1
    const push = (x: number, y: number) => {
      if (!g.free(x, y) || seen[y * info.w + x]) return
      seen[y * info.w + x] = 1
      q.push([x, y])
    }
    while (q.length) {
      const [x, y] = q.shift()!
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ])
        push(x + dx, y + dy)
      for (const [, exit] of g.holeEntry.get(g.idx(x, y)) ?? []) push(exit % info.w, Math.floor(exit / info.w))
    }
    for (const r of info.rooms) {
      let any = false
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (seen[y * info.w + x]) any = true
      expect(any, `room ${r.id}`).toBe(true)
    }
    for (const p of P.pickups)
      expect(
        seen[tileAt(p.x, p.y).ty * info.w + tileAt(p.x, p.y).tx],
        `gem ${tileAt(p.x, p.y).tx},${tileAt(p.x, p.y).ty}`
      ).toBe(1)
    for (const v of P.props.filter((p) => p.kind === 'valve' || p.kind === 'chest')) {
      const { tx, ty } = tileAt(v.x, v.y)
      const near = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ].some(([dx, dy]) => seen[(ty + dy) * info.w + tx + dx])
      expect(near, `${v.kind} ${tx},${ty}`).toBe(true)
    }
    // Without the holes, the valve rooms and the rest of A are cut off.
    const valveRoom = P.props.find((p) => p.kind === 'valve')!
    expect(
      g.path(
        start.tx,
        start.ty,
        tileAt(valveRoom.x, valveRoom.y).tx - 1,
        tileAt(valveRoom.x, valveRoom.y).ty,
        false,
        30000
      )
    ).toBeUndefined()
  })
})

import { describe, expect, test } from 'vitest'
import { stageInfo } from '../src/sim/api'
import { Grid } from '../src/sim/grid'
import { footTiles } from '../src/sim/props'
import { AIR_PROPS, parseStage, type Cond } from '../src/sim/stage-data'
import { TOWER } from '../src/stages/tower'
import { STAGE_TILES, TILE, TILE_KINDS } from '../src/vocab'

const P = parseStage(TOWER)
const { info } = P
const tileAt = (x: number, y: number) => ({ tx: Math.floor(x / TILE), ty: Math.floor(y / TILE) })

describe('stage 3 data', () => {
  test('rectangular map in range, legend complete, day light, tower tiles, winds', () => {
    const w = TOWER.map[0].length
    expect(w).toBeGreaterThanOrEqual(64)
    expect(w).toBeLessThanOrEqual(80)
    expect(TOWER.map.length).toBeGreaterThanOrEqual(48)
    expect(TOWER.map.length).toBeLessThanOrEqual(64)
    for (const row of TOWER.map) {
      expect(row.length).toBe(w)
      for (const c of row) expect(TOWER.legend[c], `legend '${c}'`).toBeDefined()
    }
    for (const k of info.tiles) expect(STAGE_TILES.tower).toContain(k)
    expect(info.light).toBe('day')
    expect(info.winds?.length).toBeGreaterThanOrEqual(2)
    expect(stageInfo('tower')).toBe(stageInfo('tower'))
    expect(info.npcs.map((n) => n.kind)).toEqual(['seer'])
    expect(P.signs.length).toBe(TOWER.signs.length)
    expect(info.rooms.find((r) => r.id === 'H')?.zoom).toBe(720)
    expect(P.boss?.kind).toBe('valk')
  })

  test('spawns on walkable ground (vents and drawbridges over the sky); ids exist; puzzle spacing', () => {
    const walk = (x: number, y: number) => TILE_KINDS[info.tiles[tileAt(x, y).ty * info.w + tileAt(x, y).tx]].walk
    expect(walk(P.spawn.x, P.spawn.y)).toBe(true)
    for (const e of P.enemies) expect(walk(e.x, e.y), e.kind).toBe(true)
    expect(walk(P.boss!.x, P.boss!.y)).toBe(true)
    for (const p of P.props)
      for (const [tx, ty] of footTiles(p.kind, p.x, p.y)) {
        const kind = info.tiles[ty * info.w + tx]
        if (AIR_PROPS.has(p.kind)) expect(kind, `${p.kind} at ${tx},${ty}`).toBe('sky')
        else expect(TILE_KINDS[kind].walk, `${p.kind} at ${tx},${ty}`).toBe(true)
      }
    for (const p of P.pickups) expect(walk(p.x, p.y)).toBe(true)
    for (const cp of Object.values(P.checkpoints)) expect(walk(cp.x, cp.y)).toBe(true)
    for (const r of TOWER.rooms)
      for (const wave of r.waves ?? [])
        for (const s of wave) expect(TILE_KINDS[info.tiles[s.y * info.w + s.x]].walk).toBe(true)
    const parts = new Set(P.props.map((p) => p.spec.id).filter(Boolean))
    const refs = (c: Cond): string[] =>
      'all' in c ? c.all.flatMap(refs) : 'any' in c ? c.any.flatMap(refs) : 'on' in c ? [c.on] : []
    for (const p of P.props) if (p.spec.cond) for (const id of refs(p.spec.cond)) expect(parts.has(id), id).toBe(true)
    const bells = P.props.filter((p) => p.kind === 'bell')
    expect(bells.length).toBe(4)
    for (const a of bells)
      for (const b of bells) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y) / TILE).toBeGreaterThanOrEqual(6)
    expect(P.props.filter((p) => p.kind === 'lockdoor').length).toBe(P.pickups.filter((p) => p.kind === 'key').length)
    expect(P.props.filter((p) => p.kind === 'vent').length).toBeGreaterThanOrEqual(2)
    for (const k of ['falconer', 'crossbow', 'windmage', 'bellmonk'])
      expect(
        P.enemies.some((e) => e.kind === k) || TOWER.rooms.some((r) => r.waves?.flat().some((s) => s.kind === k)),
        k
      ).toBe(true)
    for (const k of ['flag', 'cloud', 'gear', 'torch'])
      expect(
        info.decor.some((d) => d.kind === k),
        k
      ).toBe(true)
  })

  test('every room is reachable when flying (≤ 5-tile hops, vents refill) with the drawbridges down and doors open', () => {
    const g = new Grid(info)
    g.setSolidProps(
      P.props
        .filter((p) => !['gate', 'bossdoor', 'lockdoor', 'pot', 'goldbell'].includes(p.kind))
        .map((p) => ({ kind: p.kind, state: p.kind === 'drawbridge' ? 'down' : 'idle', x: p.x, y: p.y }))
    )
    const start = tileAt(P.spawn.x, P.spawn.y)
    const s = g.idx(start.tx, start.ty)
    const reach = (t: number) =>
      g.path(start.tx, start.ty, t % info.w, Math.floor(t / info.w), false, 60000, false, true)
    for (const r of info.rooms) {
      const target = P.checkpoints[r.id] ?? { x: (r.x + r.w / 2) * TILE, y: (r.y + r.h / 2) * TILE }
      let t = g.idx(tileAt(target.x, target.y).tx, tileAt(target.x, target.y).ty)
      if (!g.free(t % info.w, Math.floor(t / info.w))) {
        // Any free tile of the room.
        for (let y = r.y; y < r.y + r.h && !g.free(t % info.w, Math.floor(t / info.w)); y++)
          for (let x = r.x; x < r.x + r.w; x++) if (g.free(x, y)) (t = g.idx(x, y)), (y = 1e9)
      }
      expect(reach(t), `room ${r.id}`).toBeDefined()
    }
    for (const p of P.pickups) expect(reach(g.idx(tileAt(p.x, p.y).tx, tileAt(p.x, p.y).ty)), `pickup`).toBeDefined()
    void s
    // Without the drawbridges (still up) the hook island is out of reach for walkers carrying the gold bell.
    const up = new Grid(info)
    up.setSolidProps(
      P.props
        .filter((p) => p.kind !== 'gate')
        .map((p) => ({ kind: p.kind, state: p.kind === 'drawbridge' ? 'up' : 'idle', x: p.x, y: p.y }))
    )
    const bell = P.props.find((p) => p.kind === 'goldbell')!
    const hook = P.props.find((p) => p.kind === 'hook')!
    expect(
      up.path(
        tileAt(bell.x, bell.y).tx + 1,
        tileAt(bell.x, bell.y).ty,
        tileAt(hook.x, hook.y).tx,
        tileAt(hook.x, hook.y).ty + 1,
        false,
        60000
      )
    ).toBeUndefined()
  })
})

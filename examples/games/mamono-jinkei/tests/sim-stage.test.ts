import { describe, expect, test } from 'vitest'
import { stageInfo } from '../src/sim/api'
import { Grid, propSolid } from '../src/sim/grid'
import { footTiles } from '../src/sim/props'
import { parseStage, type Cond } from '../src/sim/stage-data'
import { MEADOW } from '../src/stages/meadow'
import { STAGE_TILES, TILE, TILE_KINDS } from '../src/vocab'
import { meadowWorld } from './sim-helpers'

const P = parseStage(MEADOW)
const { info } = P
const tileAt = (x: number, y: number) => ({ tx: Math.floor(x / TILE), ty: Math.floor(y / TILE) })

describe('stage 1 data', () => {
  test('map is rectangular and in the size range, legend complete', () => {
    const w = MEADOW.map[0].length
    expect(w).toBeGreaterThanOrEqual(64)
    expect(w).toBeLessThanOrEqual(80)
    expect(MEADOW.map.length).toBeGreaterThanOrEqual(48)
    expect(MEADOW.map.length).toBeLessThanOrEqual(64)
    for (const row of MEADOW.map) {
      expect(row.length).toBe(w)
      for (const c of row) expect(MEADOW.legend[c], `legend '${c}'`).toBeDefined()
    }
    for (const k of info.tiles) expect(STAGE_TILES.meadow).toContain(k)
    expect(stageInfo('meadow')).toBe(stageInfo('meadow'))
  })

  test('every sign has pages and every room has a name', () => {
    expect(P.signs.length).toBe(MEADOW.signs.length)
    for (const r of info.rooms) expect(r.name).toBeTruthy()
    expect(info.rooms.find((r) => r.id === 'H')?.zoom).toBe(720)
    expect(info.npcs.map((n) => n.kind)).toContain('elder')
  })

  test('every spawn sits on a walkable tile', () => {
    const walk = (x: number, y: number) => {
      const { tx, ty } = tileAt(x, y)
      return TILE_KINDS[info.tiles[ty * info.w + tx]].walk
    }
    expect(walk(P.spawn.x, P.spawn.y)).toBe(true)
    for (const e of P.enemies) expect(walk(e.x, e.y), `${e.kind}`).toBe(true)
    expect(walk(P.boss!.x, P.boss!.y)).toBe(true)
    for (const p of P.props)
      for (const [tx, ty] of footTiles(p.kind, p.x, p.y))
        expect(TILE_KINDS[info.tiles[ty * info.w + tx]].walk, `${p.kind} ${p.spec.id ?? ''} at ${tx},${ty}`).toBe(true)
    for (const p of P.pickups) expect(walk(p.x, p.y)).toBe(true)
    for (const cp of Object.values(P.checkpoints)) expect(walk(cp.x, cp.y)).toBe(true)
    for (const r of MEADOW.rooms)
      for (const wave of r.waves ?? [])
        for (const s of wave) expect(TILE_KINDS[info.tiles[s.y * info.w + s.x]].walk).toBe(true)
  })

  test('condition part ids exist and puzzle rules hold', () => {
    const parts = new Set(P.props.map((p) => p.spec.id).filter(Boolean))
    const refs = (c: Cond): string[] =>
      'all' in c ? c.all.flatMap(refs) : 'any' in c ? c.any.flatMap(refs) : 'on' in c ? [c.on] : []
    for (const p of P.props) if (p.spec.cond) for (const id of refs(p.spec.cond)) expect(parts.has(id), id).toBe(true)
    const byId = (id: string) => P.props.find((p) => p.spec.id === id)!
    // Split puzzle: plates at least 10 tiles apart.
    const d1 = byId('plateD1')
    const d2 = byId('plateD2')
    expect(Math.hypot(d1.x - d2.x, d1.y - d2.y) / TILE).toBeGreaterThanOrEqual(10)
    // Crystals at least 6 tiles apart.
    const cr = P.props.filter((p) => p.kind === 'crystal')
    expect(cr.length).toBe(4)
    for (const a of cr)
      for (const b of cr) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y) / TILE).toBeGreaterThanOrEqual(6)
    // Acorn carried about 12 tiles.
    const ac = byId('acorn')
    const ped = byId('pedestalE')
    expect(Math.hypot(ac.x - ped.x, ac.y - ped.y) / TILE).toBeGreaterThanOrEqual(10)
    const h = MEADOW.rooms.find((r) => r.id === 'H')!
    expect(h.w).toBeGreaterThanOrEqual(16)
    expect(h.h).toBeGreaterThanOrEqual(12)
  })

  test('all rooms are reachable with every puzzle solved (BFS with slime hops and bounce pads)', () => {
    const g = new Grid(info)
    // Puzzles solved: gates open, blocks/boulders/crackrock moved away.
    g.setSolidProps(
      P.props
        .filter((p) => !['block', 'boulder', 'crackrock', 'gate', 'bossdoor', 'pot', 'acorn'].includes(p.kind))
        .map((p) => ({ kind: p.kind, state: p.kind === 'gate' ? 'open' : 'idle', x: p.x, y: p.y }))
    )
    void propSolid
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
      ]) {
        push(x + dx, y + dy)
        // Hop over one air tile.
        const mx = x + dx
        const my = y + dy
        if (g.inside(mx, my) && !g.walk[g.idx(mx, my)] && g.air[g.idx(mx, my)] && !g.staticSolid[g.idx(mx, my)])
          push(x + 2 * dx, y + 2 * dy)
        if (g.bounce[g.idx(x, y)]) {
          let ok = true
          for (let k = 1; k <= 3; k++) if (g.blocked(x + dx * k, y + dy * k, true)) ok = false
          if (ok) push(x + 3 * dx, y + 3 * dy)
        }
      }
    }
    for (const r of info.rooms) {
      let any = false
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (seen[y * info.w + x]) any = true
      expect(any, `room ${r.id} reachable`).toBe(true)
    }
    // The bounce ledge gems and the altar are reachable.
    for (const p of P.pickups)
      expect(seen[tileAt(p.x, p.y).ty * info.w + tileAt(p.x, p.y).tx], `pickup at ${tileAt(p.x, p.y).tx}`).toBe(1)
    const altar = info.decor.find((d) => d.kind === 'altar')!
    expect(seen[tileAt(altar.x, altar.y + 8).ty * info.w + tileAt(altar.x, altar.y + 8).tx]).toBe(1)
  })

  test('the warp command moves the party to a checkpoint and makes it the respawn point', () => {
    const { world, W } = meadowWorld()
    world.command('host', { type: 'warp', to: 'G' })
    const cp = P.checkpoints.G
    for (const h of W.heroes) expect(Math.hypot(h.body.x - cp.x, h.body.y - cp.y)).toBeLessThan(120)
    expect(W.checkpoint).toBe('G')
    world.step(1 / 60)
    expect(world.view().room).toBe('G')
    expect(world.view().objective).toContain('水晶')
  })
})

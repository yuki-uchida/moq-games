import { describe, expect, test } from 'vitest'
import { createPredictor, createWorld, stageInfo } from '../src/sim/api'
import { Grid, inRoom, ringOf } from '../src/sim/grid'
import { parseStage } from '../src/sim/stage-data'
import { DT } from '../src/sim/tables'
import { NO_INPUT, type StageInfo } from '../src/sim/types'
import type { WorldImpl } from '../src/sim/world'
import { STAGE_DATA } from '../src/stages'
import { TOWER } from '../src/stages/tower'
import { TILE, TILE_KINDS } from '../src/vocab'
import { Pad, ctrlHero, place, run, until } from './sim-helpers'

const ROOM_D = TOWER.rooms.find((r) => r.id === 'D')!
const ROOM_C = TOWER.rooms.find((r) => r.id === 'C')!

/** The tower stage with room D's arena fight just started (party gathered at D's checkpoint). */
function towerArena(players = ['host']) {
  const world = createWorld({ seed: 11, progress: { cleared: [] }, stage: 'tower', skipIntro: true }) as WorldImpl
  world.setPlayers(players.map((id) => ({ id, name: id })))
  const W = world.W
  world.command('host', { type: 'warp', to: 'D' })
  const started = until(world, () => W.arenas.get('D')?.state === 'active', 2)
  expect(started).toBe(true)
  return { world, W }
}

const insideD = (x: number, y: number) => inRoom(ROOM_D, x, y)

describe('arena barrier (stage 3 room D)', () => {
  test('flying north from the top row stays inside D (keyboard, companions following)', () => {
    const { world, W } = towerArena()
    const pad = new Pad(world)
    const me = ctrlHero(W)
    place(me, 22 * TILE + TILE / 2, 38 * TILE + TILE / 2)
    pad.move(0, -1)
    pad.state.actionHeld = true
    pad.jump()
    let top = me.body.y
    run(world, 0.7, () => (top = Math.min(top, me.body.y)))
    pad.state.actionHeld = false
    pad.move(0, 0)
    run(world, 0.8)
    expect(top).toBeGreaterThanOrEqual(ROOM_D.y * TILE)
    for (const h of W.heroes) expect(insideD(h.body.x, h.body.y), `hero ${h.slot}`).toBe(true)
    expect(W.arenas.get('D')?.state).toBe('active')
  })

  test('flying east past the closed gate does not reach the drawbridge to C', () => {
    const { world, W } = towerArena()
    const pad = new Pad(world)
    const me = ctrlHero(W)
    place(me, 35.6 * TILE, 42.2 * TILE)
    pad.move(1, 0)
    pad.state.actionHeld = true
    pad.jump()
    let right = me.body.x
    run(world, 1, () => (right = Math.max(right, me.body.x)))
    pad.state.actionHeld = false
    run(world, 1)
    expect(right).toBeLessThanOrEqual((ROOM_D.x + ROOM_D.w) * TILE)
    for (const h of W.heroes) expect(insideD(h.body.x, h.body.y), `hero ${h.slot}`).toBe(true)
  })

  test('the view lists the barrier and a guest predictor is held back by it too', () => {
    const { world, W } = towerArena(['host', 'g'])
    const guest = ctrlHero(W, 'g')
    place(guest, 22 * TILE + TILE / 2, 38 * TILE + TILE / 2)
    const view = world.view()
    expect(view.barrier).toEqual(['D'])
    const pred = createPredictor(stageInfo('tower'), 'g')
    const input = { ...NO_INPUT, mx: 0, my: -1, actionHeld: true, actionPresses: 0 }
    pred.update(view, { ...input, actionHeld: false }, DT)
    input.actionPresses = 1
    let top = Infinity
    for (let i = 0; i < 0.7 / DT; i++) top = Math.min(top, pred.update(view, input, DT)!.y)
    expect(top).toBeGreaterThanOrEqual(ROOM_D.y * TILE)
    // Without the barrier the same flight leaves D (the bug this guards against).
    const open = createPredictor(stageInfo('tower'), 'g')
    const free = { ...view, barrier: undefined }
    open.update(free, { ...input, actionPresses: 0, actionHeld: false }, DT)
    let top2 = Infinity
    for (let i = 0; i < 0.7 / DT; i++) top2 = Math.min(top2, open.update(free, input, DT)!.y)
    expect(top2).toBeLessThan(ROOM_D.y * TILE)
  })

  test('a party carried out of an active arena resets it within ~1 s; objective and barrier follow', () => {
    const { world, W } = towerArena()
    expect(world.view().objective).toMatch(/^敵をぜんぶ/)
    // As if by a glitch: every hero ends up in C without warp().
    W.heroes.forEach((h, i) => place(h, (56 + (i % 2)) * TILE + TILE / 2, (42 + Math.floor(i / 2)) * TILE + TILE / 2))
    const reset = until(world, () => W.arenas.get('D')?.state === 'idle', 1.5)
    expect(reset).toBe(true)
    expect(W.enemies.some((e) => e.room === 'D' && e.wave !== undefined)).toBe(false)
    run(world, 0.1)
    const v = world.view()
    expect(v.barrier).toBeUndefined()
    expect(v.objective).toBe(ROOM_C.objective)
    // Back into D, the fight starts again.
    world.command('host', { type: 'warp', to: 'D' })
    expect(until(world, () => W.arenas.get('D')?.state === 'active', 2)).toBe(true)
  })

  test('a standing hero left outside while the others fight is puffed back in', () => {
    const { world, W } = towerArena()
    const me = ctrlHero(W)
    const other = W.heroes.find((h) => h !== me)!
    place(other, 56 * TILE + TILE / 2, 42 * TILE + TILE / 2)
    expect(until(world, () => insideD(other.body.x, other.body.y), 1.6)).toBe(true)
    expect(W.arenas.get('D')?.state).toBe('active')
  })
})

/** Terrain open to a flyer (walkable or air), ignoring props. */
const open = (info: StageInfo, tx: number, ty: number) => {
  if (tx < 0 || ty < 0 || tx >= info.w || ty >= info.h) return false
  const k = TILE_KINDS[info.tiles[ty * info.w + tx]]
  return k.walk || k.air
}

describe('arena barrier on every stage', () => {
  for (const [id, data] of Object.entries(STAGE_DATA)) {
    test(`${id}: every arena room keeps flyers in across its open boundary`, () => {
      const P = parseStage(data!)
      const g = new Grid(P.info)
      // Drawbridges down, doors open: the most open the boundary can be.
      g.setSolidProps(
        P.props
          .filter((p) => !['gate', 'bossdoor', 'lockdoor', 'icewall', 'barricade'].includes(p.kind))
          .map((p) => ({ kind: p.kind, state: p.kind === 'drawbridge' ? 'down' : 'idle', x: p.x, y: p.y }))
      )
      const arenas = data!.rooms.filter((r) => r.waves?.length)
      for (const room of arenas) {
        g.setBarrier([room.id], P.info.rooms)
        let checked = 0
        for (const [tx, ty] of ringOf(room)) {
          if (!open(P.info, tx, ty)) continue
          expect(g.blocked(tx, ty, true), `${room.id} ring ${tx},${ty}`).toBe(true)
          expect(g.blocked(tx, ty, false), `${room.id} ring ${tx},${ty}`).toBe(true)
          // Fly from the neighbouring inside tile straight out across the ring.
          const ix = Math.min(room.x + room.w - 1, Math.max(room.x, tx))
          const iy = Math.min(room.y + room.h - 1, Math.max(room.y, ty))
          if (g.blocked(ix, iy, true)) continue
          const dx = Math.sign(tx - ix)
          const dy = Math.sign(ty - iy)
          const out = g.move(ix * TILE + TILE / 2, iy * TILE + TILE / 2, dx * TILE * 3, dy * TILE * 3, 16, true)
          expect(inRoom(room, out.x, out.y), `${room.id} out via ${tx},${ty}`).toBe(true)
          checked++
        }
        expect(checked, `${id}/${room.id} has an open boundary to check`).toBeGreaterThan(0)
      }
      g.setBarrier([], P.info.rooms)
      expect(g.barrier.some((b) => b === 1)).toBe(false)
    })
  }
})

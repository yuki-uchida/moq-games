/**
 * PvP team visibility (src/net/visibility.ts, DESIGN §18): walls and corners, distance, camouflage, sonar per
 * side, bases, noise, ink, ヤドカリ walls, hysteresis, results; and the sim's per-side sonar reveal.
 */
import { describe, expect, it } from 'vitest'
import { hiddenPlayer } from '../src/net/split'
import { VIS, TeamVisibility } from '../src/net/visibility'
import type { MapDef, PlayerView, PropView, SimEvent, TeamId, V3, View } from '../src/sim/types'
import { makeLoadout } from '../src/data/loadout'
import { rig } from './sim-helpers'
import { playerCfg } from './sim-maps'

/** Open ground 400 × 400 m with one wall (10 m wide, 4 m high) across x = −5..5 at z = 0. */
const MAP: MapDef = {
  id: 'arena',
  name: 'test',
  theme: 'virtual',
  bounds: { min: [-200, -200], max: [200, 200] },
  boxes: [{ min: [-5, 0, -0.5], max: [5, 4, 0.5], kind: 'wall' }],
  spawns: [],
  bases: [
    { team: 0, p: [0, 0, -150], r: 8 },
    { team: 1, p: [0, 0, 150], r: 8 },
    { team: 2, p: [150, 0, 0], r: 8 }
  ],
  foeSpawns: [],
  pads: [],
  anchors: {},
  paths: {},
  decor: []
}

function player(id: string, team: TeamId, p: V3, extra: Partial<PlayerView> = {}): PlayerView {
  const cfg = { id, name: id, team, species: 'shiba' as const, loadout: makeLoadout([], [], []) }
  return { ...hiddenPlayer(cfg, undefined, undefined), state: 'alive', p, ...extra }
}

function view(players: PlayerView[], time: number, extra: Partial<View> = {}): View {
  return {
    tick: Math.round(time * 60),
    time,
    mode: 'pvp',
    map: 'arena',
    phase: 'play',
    clock: 100,
    players,
    foes: [],
    shots: [],
    props: [],
    shards: [],
    events: [],
    ...extra
  }
}

/** Team 0 looks north (+z) from just south of the wall. */
const watcher = (p: V3 = [0, 0, -5]) => player('a', 0, p, { yaw: 0 })

function sees(vis: TeamVisibility, players: PlayerView[], t: number, team: TeamId, id: string, extra?: Partial<View>) {
  return vis
    .update(view(players, t, extra), extra?.events ?? [])
    .get(team)!
    .has(id)
}

describe('team visibility', () => {
  it('allies are always visible; a wall hides an enemy behind it and its edge does not', () => {
    const vis = new TeamVisibility(MAP)
    const mate = player('m', 0, [100, 0, 100])
    expect(sees(vis, [watcher(), mate, player('e', 1, [0, 0, 5])], 0, 0, 'm')).toBe(true)
    expect(sees(vis, [watcher(), player('e', 1, [0, 0, 8])], 1, 0, 'e')).toBe(false)
    expect(sees(vis, [watcher(), player('e', 1, [14, 0, 8])], 2, 0, 'e')).toBe(true)
  })

  it('stays visible for a moment after stepping behind a corner (no flicker), then hides', () => {
    const vis = new TeamVisibility(MAP)
    expect(sees(vis, [watcher(), player('e', 1, [14, 0, 8])], 0, 0, 'e')).toBe(true)
    expect(sees(vis, [watcher(), player('e', 1, [0, 0, 8])], 0.2, 0, 'e')).toBe(true)
    expect(sees(vis, [watcher(), player('e', 1, [0, 0, 8])], 0.2 + VIS.LINGER + 0.05, 0, 'e')).toBe(false)
  })

  it('anyone within 6 m is known, even through the wall', () => {
    const vis = new TeamVisibility(MAP)
    expect(sees(vis, [watcher([0, 0, -2]), player('e', 1, [0, 0, 2])], 0, 0, 'e')).toBe(true)
  })

  it('sight ends at 150 m', () => {
    const vis = new TeamVisibility(MAP)
    const a = player('a', 0, [-100, 0, 50], { yaw: Math.PI / 2 })
    expect(sees(vis, [a, player('e', 1, [40, 0, 50])], 0, 0, 'e')).toBe(true)
    expect(sees(vis, [a, player('e', 1, [55, 0, 50])], 5, 0, 'e')).toBe(false)
  })

  it('camouflage hides beyond 5 m of open ground', () => {
    const vis = new TeamVisibility(MAP)
    const a = player('a', 0, [-50, 0, 50])
    expect(sees(vis, [a, player('e', 1, [-30, 0, 50], { cloak: 1 })], 0, 0, 'e')).toBe(false)
    expect(sees(vis, [a, player('e', 1, [-30, 0, 50], { cloak: 0.3 })], 1, 0, 'e')).toBe(true)
    expect(sees(vis, [a, player('e', 1, [-45.5, 0, 50], { cloak: 1 })], 2, 0, 'e')).toBe(true)
  })

  it('a sonar reveal shows the enemy to the revealing team only', () => {
    const vis = new TeamVisibility(MAP)
    const c = player('c', 2, [0, 0, -40])
    const e = player('e', 1, [0, 0, 8], { revealed: true, revealedTo: [0] })
    const sets = vis.update(view([watcher(), c, e], 0), [])
    expect(sets.get(0)!.has('e')).toBe(true)
    expect(sets.get(2)!.has('e')).toBe(false)
  })

  it('an enemy inside a team base is known to that team', () => {
    const vis = new TeamVisibility(MAP)
    const sets = vis.update(view([watcher(), player('e', 1, [3, 0, -148])], 0), [])
    expect(sets.get(0)!.has('e')).toBe(true)
    expect(sets.get(2)!.has('e')).toBe(false)
  })

  it('firing is heard within 45 m for 1.5 s', () => {
    const vis = new TeamVisibility(MAP)
    const e = player('e', 1, [0, 0, 30])
    const fire = (t: number): SimEvent => ({
      id: 1,
      t,
      type: 'fire',
      who: 'e',
      item: 'bee',
      from: [0, 1, 30],
      dir: [0, 0, -1]
    })
    expect(sees(vis, [watcher(), e], 0, 0, 'e')).toBe(false)
    expect(sees(vis, [watcher(), e], 1, 0, 'e', { events: [fire(1)] })).toBe(true)
    expect(sees(vis, [watcher(), e], 2.2, 0, 'e')).toBe(true)
    expect(sees(vis, [watcher(), e], 2.6, 0, 'e')).toBe(false)
    const far = player('e', 1, [0, 0, 60])
    expect(sees(vis, [watcher(), far], 3, 0, 'e', { events: [fire(3)] })).toBe(false)
  })

  it('a hit by a member reveals the target to that team for a moment', () => {
    const vis = new TeamVisibility(MAP)
    const e = player('e', 1, [0, 0, 30])
    const hit: SimEvent = {
      id: 2,
      t: 1,
      type: 'hit',
      target: 'e',
      targetKind: 'player',
      by: 'a',
      amount: 10,
      at: [0, 1, 30],
      surface: 'fur'
    }
    expect(sees(vis, [watcher(), e], 1, 0, 'e', { events: [hit] })).toBe(true)
    expect(sees(vis, [watcher(), e], 2.5, 0, 'e')).toBe(false)
  })

  it('ink clouds and ヤドカリ walls block sight', () => {
    const vis = new TeamVisibility(MAP)
    const a = player('a', 0, [-50, 0, 50], { yaw: Math.PI / 2 })
    const e = player('e', 1, [-20, 0, 50])
    const ink: PropView = { id: 1, kind: 'ink', p: [-35, 0, 50], yaw: 0, team: 1, r: 6, t: 0 }
    const wall: PropView = { id: 2, kind: 'hermit', p: [-35, 0, 50], yaw: Math.PI / 2, team: 1, t: 0 }
    expect(sees(vis, [a, e], 0, 0, 'e')).toBe(true)
    expect(sees(vis, [a, e], 1, 0, 'e', { props: [ink] })).toBe(false)
    expect(sees(vis, [a, e], 2, 0, 'e', { props: [wall] })).toBe(false)
    expect(sees(vis, [a, e], 3, 0, 'e')).toBe(true)
  })

  it('players waiting to respawn are hidden; in the results everyone is visible', () => {
    const vis = new TeamVisibility(MAP)
    expect(sees(vis, [watcher(), player('e', 1, [14, 0, 8], { state: 'away' })], 0, 0, 'e')).toBe(false)
    expect(sees(vis, [watcher(), player('e', 1, [0, 0, 80])], 1, 0, 'e', { phase: 'victory' })).toBe(true)
  })
})

describe('sonar per side (sim)', () => {
  it('a reveal is recorded for the revealing side only', () => {
    const r = rig({
      r: ['bee'],
      l: ['bat'],
      extra: [playerCfg('e', { team: 1 }), playerCfg('f', { team: 2 })]
    })
    r.player('e').p = [0, 0, 20]
    r.player('f').p = [0, 0, -20]
    r.step(2)
    r.press('L')
    const v = r.world.view()
    const me = v.players.find((x) => x.id === 'me')!
    const e = v.players.find((x) => x.id === 'e')!
    expect(e.revealed).toBe(true)
    expect(e.revealedTo).toEqual([me.team])
    expect(v.players.find((x) => x.id === 'f')!.revealedTo).toEqual([me.team])
    expect(me.revealedTo).toBeUndefined()
  })
})

/**
 * Harness scenes: env (the test district), combat (a squad vs a crowd with every antique), stress (12 players,
 * 120 foes, effects), events (every SimEvent type in sequence) and actors (lineups of every species, foe, prop).
 */
import { FOES, FOE_KINDS, type FoeKind } from '../data/enemies'
import type { ItemId } from '../data/items'
import { SPECIES_IDS, type SpeciesId } from '../data/species'
import type { MapDef, PropKind, SimEvent, V3 } from '../sim/types'
import { FakeWorld, makePlayer } from './fake-world'
import { cardScene } from './card'
import { groundSampler, tourViews } from './tour'

export interface DebugView {
  pos: V3
  target: V3
  name?: string
}

export interface Scene {
  world: FakeWorld
  me?: string
  cinematic?: boolean
  views: DebugView[]
  /** Called every fixed step with the scene time. */
  script?: (world: FakeWorld, t: number) => void
  label?: () => string
  /** Number of scripted steps (events scene). */
  steps?: number
}

/** Fixed review cameras over the test district. */
export const ENV_VIEWS: DebugView[] = [
  { pos: [-24, 8, 2], target: [-60, 5, 14] },
  { pos: [4, 4, 30], target: [-30, 7, 18] },
  { pos: [18, 12, -2], target: [56, 6, -22] },
  { pos: [60, 45, 95], target: [0, 0, 0] },
  { pos: [-62, 6, -66], target: [-75, 2, -82] },
  { pos: [60, 6, -58], target: [72, 2, -76] },
  { pos: [-66, 9, 4], target: [-84, 6, -40] },
  { pos: [24, 6, -60], target: [36, 3, -78] }
]

const LOADOUTS: { species: SpeciesId; r: ItemId[]; l: ItemId[]; passives: ItemId[] }[] = [
  { species: 'shiba', r: ['orca'], l: ['bee'], passives: ['turtle'] },
  { species: 'cat', r: ['claw'], l: ['puffer'], passives: ['momonga'] },
  { species: 'rabbit', r: ['owl'], l: ['gecko'], passives: ['jelly'] },
  { species: 'bear', r: ['mammoth'], l: ['armadillo'], passives: ['hedgehog', 'turtle'] },
  { species: 'fox', r: ['wood'], l: ['frog'], passives: [] },
  { species: 'penguin', r: ['humming'], l: ['pillbug'], passives: [] },
  { species: 'hamster', r: ['eel'], l: ['honeyant'], passives: ['jelly'] },
  { species: 'owl', r: ['hippo'], l: ['swallow'], passives: ['momonga'] },
  { species: 'shiba', r: ['mantis'], l: ['hermit'], passives: [] },
  { species: 'cat', r: ['narwhal'], l: ['bee'], passives: [] },
  { species: 'bear', r: ['wood'], l: ['pillbug'], passives: ['turtle'] },
  { species: 'fox', r: ['swallow'], l: ['leaf'], passives: [] }
]

export function buildScene(name: string, map: MapDef, real = false): Scene {
  const world = new FakeWorld(map, 7)
  if (name === 'card') return cardScene(map, world)
  if (real) return realScene(name, map, world)
  switch (name) {
    case 'combat': {
      for (let i = 0; i < 4; i++) {
        const l = LOADOUTS[[0, 6, 7, 3][i]]
        const anchor: V3 = [-6 + i * 4, 0, 12]
        world.addPlayer(makePlayer(i, l.species, 0, [...anchor], l.r, l.l, l.passives), anchor, 3)
      }
      world.foeTarget = 28
      world.foeArea = { centre: [0, 0, -6], radius: 12 }
      world.addProp({ kind: 'lighthouse', p: [0, 0.05, 30], yaw: 0, team: 0, t: 0, hp: 2000, maxHp: 2000 })
      world.addProp({ kind: 'zone', p: [24, 0.05, 2], yaw: 0, team: -1, t: 0, r: 7, state: 0.3, label: 'A' })
      world.addProp({ kind: 'ink', p: [-14, 0, 4], yaw: 0, team: 0, t: 0, r: 6, life: 30 })
      world.addProp({ kind: 'honey', p: [4, 0.05, 20], yaw: 0, team: 0, t: 0, r: 4.5, life: 30 })
      world.addProp({ kind: 'decoy', p: [10, 0.05, 12], yaw: 2.5, team: 0, t: 0, life: 30, species: 'fox' })
      return { world, me: 'p0', views: ENV_VIEWS }
    }
    case 'stress': {
      for (let i = 0; i < 12; i++) {
        const l = LOADOUTS[i]
        const anchor: V3 = [-18 + (i % 6) * 7, 0, 14 + Math.floor(i / 6) * 8]
        world.addPlayer(makePlayer(i, l.species, 0, [...anchor], l.r, l.l, l.passives), anchor, 3)
      }
      world.foeTarget = 120
      world.foeKinds = FOE_KINDS.filter((k) => !FOES[k].boss)
      world.foeArea = { centre: [0, 0, -16], radius: 26 }
      world.addFoe('goutetsu', [0, 0, -62], 'idle')
      world.addProp({ kind: 'ink', p: [-20, 0, 0], yaw: 0, team: 0, t: 0, r: 6, life: 300 })
      world.addProp({ kind: 'honey', p: [6, 0.05, 18], yaw: 0, team: 0, t: 0, r: 4.5, life: 300 })
      world.addProp({ kind: 'zone', p: [24, 0.05, 2], yaw: 0, team: -1, t: 0, r: 7, state: 0.3, label: 'A' })
      return { world, me: 'p0', views: ENV_VIEWS }
    }
    case 'events':
      return eventsScene(world)
    case 'actors':
      return actorsScene(world)
    default: {
      const anchor: V3 = [2, 0.05, 22]
      world.addPlayer(makePlayer(0, 'shiba', 0, [...anchor], ['orca'], ['bee']), anchor, 0)
      world.passive = true
      world.players[0].yaw = Math.PI
      return { world, me: 'p0', views: ENV_VIEWS }
    }
  }
}

/**
 * Scenes on a real map (src/sim/maps): actors stand on the real spawns and fight foes in front of them; the review
 * views come from the map's spawns, objectives, rooftops and edges.
 */
function realScene(name: string, map: MapDef, world: FakeWorld): Scene {
  world.groundAt = groundSampler(map)
  const views = tourViews(map)
  const spawns = map.spawns.length ? map.spawns : [{ team: 'squad' as const, p: [0, 0, 0] as V3, yaw: 0 }]
  const s0 = spawns[0]
  const ahead: V3 = [s0.p[0] + Math.sin(s0.yaw) * 22, 0, s0.p[2] + Math.cos(s0.yaw) * 22]
  ahead[1] = world.groundAt(ahead[0], ahead[2], s0.p[1] + 2)
  const n = name === 'stress' ? 12 : name === 'combat' ? 4 : 1
  for (let i = 0; i < n; i++) {
    const s = spawns[i % spawns.length]
    const ring = Math.floor(i / spawns.length)
    const l = LOADOUTS[i % LOADOUTS.length]
    // Spread squadmates sharing a spawn on a small grid in front of it (never inside the camera).
    const fx = Math.sin(s.yaw)
    const fz = Math.cos(s.yaw)
    const lat = ((ring % 3) - 1) * 2.6
    const fwd = 2 + Math.floor(ring / 3) * 2.6
    const ax = s.p[0] + fx * fwd + fz * lat
    const az = s.p[2] + fz * fwd - fx * lat
    const anchor: V3 = i === 0 ? [...s.p] : [ax, world.groundAt(ax, az, s.p[1] + 1), az]
    const team = typeof s.team === 'number' ? s.team : 0
    const p = makePlayer(i, l.species, team, [...anchor], l.r, l.l, l.passives)
    p.yaw = s.yaw
    world.addPlayer(p, anchor, name === 'env' ? 0 : 2.5)
  }
  if (name === 'env') world.passive = true
  if (name === 'stress' || name === 'combat') {
    world.foeTarget = name === 'stress' ? 120 : 28
    world.foeKinds = FOE_KINDS.filter((k) => !FOES[k].boss)
    world.foeArea = { centre: ahead, radius: name === 'stress' ? 18 : 10 }
  }
  if (name === 'stress') {
    world.addProp({ kind: 'ink', p: [ahead[0] - 6, ahead[1], ahead[2]], yaw: 0, team: 0, t: 0, r: 6, life: 300 })
    world.addProp({ kind: 'honey', p: [s0.p[0], s0.p[1] + 0.05, s0.p[2]], yaw: 0, team: 0, t: 0, r: 4.5, life: 300 })
  }
  for (const [k, a] of Object.entries(map.anchors)) {
    if (k === 'lighthouse')
      world.addProp({ kind: 'lighthouse', p: [...a], yaw: 0, team: 0, t: 0, hp: 2000, maxHp: 2000 })
    if (/^zone[ABC]$/.test(k))
      world.addProp({ kind: 'zone', p: [...a], yaw: 0, team: -1, t: 0, r: 7, state: 0.3, label: k.slice(4) })
  }
  return { world, me: 'p0', views }
}

function actorsScene(world: FakeWorld): Scene {
  world.passive = true
  SPECIES_IDS.forEach((s, i) => {
    const l = LOADOUTS[i]
    const p: V3 = [-8 + i * 2.2, 0.05, 24]
    world.addPlayer(makePlayer(i, s, 0, p, l.r, l.l, l.passives), p, 0)
    world.players[i].yaw = Math.PI
  })
  FOE_KINDS.filter((k) => !FOES[k].boss).forEach((k, i) => {
    const f = world.addFoe(k, [-14 + i * 3.6, 0, 15], 'idle')
    f.yaw = 0
  })
  world.addFoe('goutetsu', [-30, 0, -10], 'idle')
  world.addFoe('kuitsukushi', [30, 0, -10], 'idle')
  const props: PropKind[] = [
    'frog',
    'hermit',
    'honey',
    'lighthouse',
    'zone',
    'cart',
    'node',
    'target',
    'pad',
    'base',
    'tutorial',
    'ink'
  ]
  props.forEach((kind, i) =>
    world.addProp({
      kind,
      p: [-16 + i * 3, 0.05, 5],
      yaw: 0,
      team: 0,
      t: 0,
      r: kind === 'zone' || kind === 'base' ? 2.5 : 3,
      state: 0.6,
      label: 'B',
      hp: 100,
      maxHp: 100
    })
  )
  world.addProp({ kind: 'decoy', p: [20, 0.05, 5], yaw: 0, team: 0, t: 0, life: 99, species: 'cat' })
  return {
    world,
    me: undefined,
    views: [
      { pos: [0, 4, 34], target: [0, 1, 18] },
      { pos: [0, 9, 18], target: [0, 1, 4] },
      { pos: [0, 18, 30], target: [0, 4, -10] }
    ]
  }
}

/** An event without the envelope (loosely typed: foe events reuse the `id` field, see the render report). */
export type Body = { type: SimEvent['type'] } & Record<string, unknown>

/** Every event type in sequence around a showcase spot. */
function eventsScene(world: FakeWorld): Scene {
  const anchor: V3 = [0, 0.05, 20]
  world.addPlayer(makePlayer(0, 'shiba', 0, [...anchor], ['eel'], ['gecko']), anchor, 0)
  world.addPlayer(makePlayer(1, 'cat', 0, [3, 0.05, 20], ['orca'], ['bee']), [3, 0.05, 20], 0)
  world.passive = true
  for (const p of world.players) p.yaw = Math.PI
  const dummy = world.addFoe('oagos', [0, 0, 11], 'idle')
  const drone = world.addFoe('mitsume', [5, 0, 12], 'idle')
  const walker = world.addFoe('ashinaga', [-6, 0, 10], 'idle')
  const zone = world.addProp({ kind: 'zone', p: [8, 0.05, 16], yaw: 0, team: -1, t: 0, r: 4, state: 0.5, label: 'A' })
  const hermit = world.addProp({ kind: 'hermit', p: [-4, 0.05, 15], yaw: 0, team: 0, t: 0, life: 99 })
  const at = (x: number, y: number, z: number): V3 => [x, y, z]
  const steps: [string, Body[]][] = [
    [
      'fire',
      (['bee', 'wood', 'humming', 'puffer', 'owl', 'swallow', 'pillbug', 'hippo'] as const).map(
        (item, i) =>
          ({ type: 'fire', who: 'p0', item, hand: 'R', from: at(-2 + i * 0.6, 1, 19), dir: [0, 0, -1] }) as Body
      )
    ],
    ['swing', [{ type: 'swing', who: 'p1', item: 'orca', hand: 'R', combo: 0 }]],
    [
      'hit',
      (['fur', 'chitin', 'metal', 'shield', 'guard', 'shell', 'prop'] as const).map(
        (surface, i) =>
          ({
            type: 'hit',
            target: dummy.id,
            targetKind: 'foe',
            by: 'p0',
            item: 'bee',
            amount: 12 + i,
            at: at(-3 + i, 1.2, 12),
            surface,
            head: i === 1
          }) as Body
      )
    ],
    [
      'impact',
      (['concrete', 'metal', 'wood', 'crystal', 'ground', 'foliage', 'glass', 'virtual'] as const).map(
        (surface, i) =>
          ({ type: 'impact', at: at(-4 + i * 1.1, 0.1, 14), normal: [0, 1, 0], surface, item: 'wood' }) as Body
      )
    ],
    ['blast', [{ type: 'blast', at: at(0, 0, 12), radius: 5, item: 'hippo', team: 0 }]],
    [
      'empty / swap',
      [
        { type: 'empty', who: 'p0', hand: 'R' },
        { type: 'swap', who: 'p1', hand: 'R', item: 'orca' }
      ]
    ],
    [
      'jump / land / dash',
      [
        { type: 'jump', who: 'p0', air: true },
        { type: 'land', who: 'p1', hard: true },
        { type: 'dash', who: 'p1', slide: false }
      ]
    ],
    ['launch', [{ type: 'launch', who: 'p1', pad: 0 }]],
    ['hook', [{ type: 'hook', who: 'p0', to: at(-6, 6, 6) }]],
    [
      'glide / cloak',
      [
        { type: 'glide', who: 'p0', on: true },
        { type: 'cloak', who: 'p1', on: true }
      ]
    ],
    ['deploy', [{ type: 'deploy', who: 'p0', item: 'hermit', prop: hermit.id, at: at(-4, 0, 15) }]],
    [
      'propHit / propBreak',
      [
        { type: 'propHit', prop: hermit.id, amount: 10, at: at(-4, 1, 15) },
        { type: 'propBreak', prop: hermit.id, kind: 'hermit', at: at(-4, 0, 15) }
      ]
    ],
    [
      'passives / critical',
      [
        { type: 'passives', who: 'p0', online: false },
        { type: 'critical', who: 'p1' }
      ]
    ],
    ['armorBreak', [{ type: 'armorBreak', who: 'p1', at: at(3, 0.05, 20) }]],
    [
      'down / reviveStart / revive',
      [
        { type: 'down', who: 'p1' },
        { type: 'reviveStart', who: 'p1', by: 'p0' },
        { type: 'revive', who: 'p1', by: 'p0' }
      ]
    ],
    ['warp', [{ type: 'warp', who: 'p1', at: at(3, 0.05, 20) }]],
    ['respawn', [{ type: 'respawn', who: 'p1', at: at(3, 0.05, 20) }]],
    [
      'ko / shard / heal',
      [
        { type: 'ko', who: dummy.id, by: 'p0', assists: [] },
        { type: 'shard', who: 'p0', amount: 4, at: at(0, 1, 19) },
        { type: 'heal', who: 'p0', amount: 4, source: 'honey' }
      ]
    ],
    ['reveal (sonar)', [{ type: 'reveal', who: 'p0', at: at(0, 0.05, 20), radius: 20 }]],
    [
      'foeSpawn',
      (['tsubute', 'mitsume', 'kurozume'] as FoeKind[]).map(
        (kind, i) => ({ type: 'foeSpawn', foe: 900 + i, kind, at: at(-5 + i * 5, 0, 8) }) as Body
      )
    ],
    [
      'foeWindup',
      [
        { type: 'foeWindup', foe: walker.id, attack: 'mortar', at: walker.p, aim: at(-3, 0, 16) },
        { type: 'foeWindup', foe: drone.id, attack: 'laser', at: drone.p, aim: at(0, 0.05, 20) }
      ]
    ],
    [
      'foeAttack',
      (['bite', 'slam', 'stomp', 'shieldDome', 'missile'] as const).map(
        (attack, i) =>
          ({ type: 'foeAttack', foe: dummy.id, attack, at: at(-6 + i * 3, 0, 10), aim: at(-6 + i * 3, 0, 10) }) as Body
      )
    ],
    [
      'foeDie',
      (['tsubute', 'oagos', 'mitsume', 'korogashi', 'kurozume'] as FoeKind[]).map(
        (kind, i) => ({ type: 'foeDie', foe: 950 + i, kind, at: at(-6 + i * 3, 0, 10) }) as Body
      )
    ],
    [
      'bossPhase / bossPart',
      [
        { type: 'bossPhase', foe: dummy.id, kind: 'oagos', phase: 1 },
        { type: 'bossPart', foe: dummy.id, kind: 'oagos', part: 1 }
      ]
    ],
    [
      'wave / waveClear',
      [
        { type: 'wave', wave: 1, waves: 5 },
        { type: 'waveClear', wave: 1 }
      ]
    ],
    ['objective', [{ type: 'objective', what: 'captured', prop: zone.id, label: 'A' }]],
    [
      'radio / lastSpurt / suddenDeath / tutorial',
      [
        { type: 'radio', who: 'ruri', text: '敵影確認！' },
        { type: 'lastSpurt' },
        { type: 'suddenDeath' },
        { type: 'tutorial', step: 1, hint: '動いてみよう' }
      ]
    ],
    [
      'countdown / phase',
      [
        { type: 'countdown', n: 3 },
        { type: 'phase', phase: 'victory' }
      ]
    ]
  ]
  let index = -1
  let label = ''
  const period = 1.2
  return {
    world,
    me: 'p0',
    views: [{ pos: [0, 5, 30], target: [0, 1, 13] }],
    script: (w, t) => {
      const i = Math.floor(t / period) % steps.length
      if (i === index) {
        // Keep the beam / hook / glide states alive during their step.
        w.players[0].hands[0].act = steps[i][0] === 'fire' ? 'beam' : 'idle'
        w.players[0].move = steps[i][0] === 'hook' ? 'hook' : steps[i][0].startsWith('glide') ? 'glide' : 'idle'
        walker.state = steps[i][0] === 'foeWindup' ? 'windup' : 'idle'
        walker.attack = 'mortar'
        walker.aim = [-3, 0, 16]
        drone.state = steps[i][0] === 'foeWindup' ? 'windup' : 'idle'
        drone.attack = 'laser'
        drone.aim = [0, 0.05, 20]
        if (walker.state === 'windup') {
          walker.st = (t % period) * 0.8
          drone.st = (t % period) * 0.5
        }
        return
      }
      index = i
      label = steps[i][0]
      w.phase = steps[i][0].includes('phase') ? 'victory' : 'play'
      for (const body of steps[i][1]) w.emit(body)
    },
    label: () => label,
    steps: steps.length
  }
}

export const SCENES = ['env', 'combat', 'stress', 'events', 'actors', 'card'] as const

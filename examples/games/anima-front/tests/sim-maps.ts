/**
 * Small MapDefs for the sim tests (the real maps are built separately). Each provides the anchors, paths, bases
 * and spawn tags its mode needs (src/data/map-vocab.ts).
 */
import type { MapBox, MapDef, MapId, MapSpawn, V3 } from '../src/sim/types'
import type { MatchConfig, PlayerConfig, TeamId } from '../src/sim/types'
import { PRESETS, presetById } from '../src/data/loadout'
import type { SpeciesId } from '../src/data/species'

const box = (min: V3, max: V3, kind: MapBox['kind'] = 'building'): MapBox => ({ min, max, kind })

function base(id: MapId, half: number, extra: Partial<MapDef> = {}): MapDef {
  return {
    id,
    name: id,
    theme: 'day',
    bounds: { min: [-half, -half], max: [half, half] },
    boxes: [],
    spawns: [],
    bases: [],
    foeSpawns: [],
    pads: [],
    anchors: {},
    paths: {},
    decor: [],
    ...extra
  }
}

const squadSpawns = (c: V3): MapSpawn[] =>
  [0, 1, 2, 3].map((i) => ({ team: 'squad' as const, p: [c[0] + (i - 1.5) * 2, c[1], c[2]] as V3, yaw: 0 }))

/** Flat square with a few obstacles (physics, antiques, training-style tests). */
export function flatMap(half = 40): MapDef {
  return base('range', half, {
    spawns: squadSpawns([0, 0, -10]),
    bases: [{ team: 'squad', p: [0, 0, -10], r: 6 }],
    foeSpawns: [{ id: 'n', p: [0, 0, 30], tags: ['north'] }]
  })
}

/** Mission 1 style: lighthouse in the south, ruins in the north, a wall with gaps between them. */
export function sakuraMap(): MapDef {
  return base('oldtown', 60, {
    boxes: [
      box([-60, 0, 8], [-14, 6, 10], 'wall'),
      box([-8, 0, 8], [8, 6, 10], 'wall'),
      box([14, 0, 8], [60, 6, 10], 'wall'),
      box([20, 0, -20], [30, 8, -10]),
      box([-30, 0, -20], [-20, 8, -10]),
      box([-3, 0, 25], [3, 1.2, 28], 'crate')
    ],
    spawns: squadSpawns([0, 0, -30]),
    bases: [
      { team: 'squad', p: [0, 0, -34], r: 8 },
      { team: 'squad', p: [40, 0, 30], r: 6 }
    ],
    foeSpawns: [
      { id: 'n1', p: [-20, 0, 50], tags: ['north'] },
      { id: 'n2', p: [0, 0, 54], tags: ['north'] },
      { id: 'n3', p: [20, 0, 50], tags: ['north'] },
      { id: 'e', p: [52, 0, 30], tags: ['east'] },
      { id: 'w', p: [-52, 0, 30], tags: ['west'] },
      { id: 'a', p: [0, 10, 45], air: true, tags: ['air'] },
      { id: 'r1', p: [30, 0, 0], tags: ['raid'] },
      { id: 'r2', p: [-30, 0, 0], tags: ['raid'] }
    ],
    anchors: { lighthouse: [0, 0, -30], gate: [-50, 0, -40] },
    paths: {
      cart: [
        [40, 0, 30],
        [40, 0, 15],
        [30, 0, 0],
        [10, 0, -5],
        [-10, 0, -5],
        [-35, 0, -5],
        [-45, 0, -20],
        [-50, 0, -40]
      ]
    }
  })
}

export function harborMap(): MapDef {
  return base('harbor', 60, {
    theme: 'sunset',
    boxes: [box([-10, 0, -6], [-4, 3, 6], 'container'), box([4, 0, -6], [10, 3, 6], 'container')],
    spawns: squadSpawns([0, 0, -40]),
    bases: [{ team: 'squad', p: [0, 0, -42], r: 7 }],
    foeSpawns: [
      { id: 'd1', p: [-40, 0, 30], tags: ['drop'] },
      { id: 'd2', p: [40, 0, 30], tags: ['drop'] },
      { id: 's', p: [0, 0, 55], tags: ['sea'] },
      { id: 'a', p: [0, 8, 40], air: true, tags: ['air'] }
    ],
    anchors: { zoneA: [-25, 0, -15], zoneB: [0, 0, 10], zoneC: [25, 0, -15], sea: [0, 0, 56] }
  })
}

export function blightMap(variant?: 'crater'): MapDef {
  return base('blight', 60, {
    theme: 'blight',
    boxes: [box([-12, 0, 10], [-6, 5, 14], 'crystal')],
    spawns: squadSpawns([0, 0, -45]),
    bases: [{ team: 'squad', p: [0, 0, -47], r: 7 }],
    foeSpawns: [
      { id: 'n1', p: [-30, 0, 24], tags: ['node1'] },
      { id: 'n2', p: [0, 0, 40], tags: ['node2'] },
      { id: 'n3', p: [30, 0, 24], tags: ['node3'] },
      { id: 'c', p: [0, 0, 10], tags: ['crater'] },
      { id: 'a', p: [0, 9, 30], air: true, tags: ['air'] }
    ],
    anchors: {
      node1: [-30, 0, 20],
      node2: [0, 0, 35],
      node3: [30, 0, 20],
      crater: variant === 'crater' ? [0, 0, 5] : [0, 0, 5]
    }
  })
}

/** Three team bases 120° apart around a central plaza, with fixed pads and a tower. */
export function arenaMap(): MapDef {
  const bases: MapDef['bases'] = []
  const spawns: MapSpawn[] = []
  for (let t = 0; t < 3; t++) {
    const a = (t / 3) * Math.PI * 2
    const c: V3 = [Math.sin(a) * 45, 0, Math.cos(a) * 45]
    bases.push({ team: t as TeamId, p: c, r: 7 })
    for (let i = 0; i < 4; i++) {
      const o = (i - 1.5) * 2
      spawns.push({ team: t as TeamId, p: [c[0] + Math.cos(a) * o, 0, c[2] - Math.sin(a) * o], yaw: a + Math.PI })
    }
  }
  return base('arena', 60, {
    theme: 'virtual',
    boxes: [
      box([-4, 0, -4], [4, 10, 4], 'building'),
      box([18, 0, -2], [22, 3, 2], 'crate'),
      box([-22, 0, -2], [-18, 3, 2], 'crate')
    ],
    spawns,
    bases,
    pads: [{ p: [0, 0, -6], yaw: Math.PI }],
    anchors: { plaza: [0, 0, 0] }
  })
}

export function rangeMap(): MapDef {
  const anchors: Record<string, V3> = { dummy: [20, 0, 20] }
  for (let i = 1; i <= 8; i++) anchors[`target${i}`] = [-28 + i * 6, 0, 30]
  for (let i = 1; i <= 8; i++) anchors[`tutorial${i}`] = [-20 + i * 4, 0, -10]
  return base('range', 45, {
    spawns: squadSpawns([0, 0, -20]),
    bases: [{ team: 'squad', p: [0, 0, -20], r: 6 }],
    anchors,
    paths: {
      mover1: [
        [-20, 0, 38],
        [20, 0, 38]
      ],
      mover2: [
        [-20, 0, 42],
        [20, 0, 42]
      ]
    }
  })
}

export function playerCfg(
  id: string,
  opts: { species?: SpeciesId; preset?: string; team?: TeamId; bot?: number; loadout?: PlayerConfig['loadout'] } = {}
): PlayerConfig {
  return {
    id,
    name: id,
    species: opts.species ?? 'shiba',
    loadout: opts.loadout ?? presetById(opts.preset ?? 'attacker').loadout,
    team: opts.team ?? 0,
    ...(opts.bot !== undefined ? { bot: opts.bot } : {})
  }
}

export function botSquad(n = 4, skill = 0.8): PlayerConfig[] {
  const species: SpeciesId[] = ['shiba', 'penguin', 'rabbit', 'bear']
  const presets = ['attacker', 'gunner', 'sniper', 'tank']
  return Array.from({ length: n }, (_, i) =>
    playerCfg(`b${i}`, { species: species[i % 4], preset: presets[i % 4], bot: skill })
  )
}

export function pvpTeams(skill = 0.6): PlayerConfig[] {
  const out: PlayerConfig[] = []
  const species: SpeciesId[] = ['shiba', 'cat', 'fox', 'penguin']
  for (let t = 0; t < 3; t++)
    for (let i = 0; i < 4; i++)
      out.push(
        playerCfg(`t${t}p${i}`, {
          species: species[i],
          preset: PRESETS[(t + i) % PRESETS.length].id,
          team: t as TeamId,
          bot: skill
        })
      )
  return out
}

export const cfg = (c: Partial<MatchConfig> & Pick<MatchConfig, 'mode' | 'map'>): MatchConfig => ({
  seed: 1,
  players: [],
  ...c
})

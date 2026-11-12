/**
 * Key art for the landing card (scripts/anima-front-card.mjs): the squad facing the viewer in front of the
 * lighthouse plaza of oldtown while invaders pour in behind them. Dev only.
 *
 * Tuning through the URL (metres in the squad's frame: d = toward the camera, r = to the squad's right):
 *   cardcam=d,up,r   cardlook=d,up,r   cardfov=deg
 */
import type { ItemId } from '../data/items'
import type { SpeciesId } from '../data/species'
import type { HandAct, MapDef, V3 } from '../sim/types'
import { FakeWorld, makePlayer } from './fake-world'
import type { Scene } from './scenes'
import { groundSampler } from './tour'

interface Member {
  species: SpeciesId
  r: ItemId[]
  l: ItemId[]
  passives: ItemId[]
  /** Position in the squad frame: along d (toward the camera) and r. */
  at: [number, number]
  act?: [HandAct, HandAct]
  charge?: number
  /** Extra yaw (radians) so the members do not all face exactly the same way. */
  turn: number
}

const SQUAD: Member[] = [
  { species: 'shiba', r: ['orca'], l: ['bee'], passives: ['turtle'], at: [1.2, 0], turn: 0 },
  { species: 'cat', r: ['claw'], l: ['puffer'], passives: [], at: [0.2, -2.1], turn: 0.35 },
  {
    species: 'rabbit',
    r: ['owl'],
    l: ['gecko'],
    passives: ['jelly'],
    at: [0, 2.1],
    act: ['charge', 'idle'],
    charge: 0.9,
    turn: -0.3
  },
  {
    species: 'bear',
    r: ['mammoth'],
    l: ['armadillo'],
    passives: ['hedgehog'],
    at: [-1.6, 0.9],
    act: ['idle', 'guard'],
    charge: 1,
    turn: -0.1
  }
]

/** Invaders behind the squad: [kind, d, r]. */
const FOES: [Parameters<FakeWorld['addFoe']>[0], number, number][] = [
  ['oagos', -14, -5],
  ['tsubute', -8, -7.5],
  ['tsubute', -9.5, -3],
  ['tsubute', -7.2, 4.5],
  ['tsubute', -11, 7],
  ['tsubute', -13, 1.5],
  ['harigane', -19, 9],
  ['harigane', -22, -11],
  ['kagerou', -12, -9],
  ['kagerou', -16, 6],
  ['mitsume', -10, 10]
]

const triple = (raw: string | null, fallback: V3): V3 => {
  const n = (raw ?? '').split(',').map(Number)
  return n.length === 3 && n.every(Number.isFinite) ? [n[0], n[1], n[2]] : fallback
}

export function cardScene(map: MapDef, world: FakeWorld): Scene {
  const params = new URLSearchParams(location.search)
  world.groundAt = groundSampler(map)
  world.passive = true
  const spawn = map.spawns.find((s) => s.team === 'squad') ?? map.spawns[0]
  const light = map.anchors.lighthouse ?? spawn?.p ?? [0, 0, 0]
  // The squad stands between the lighthouse and the north ruins and turns to face the viewer (d points north).
  const yaw0 = spawn?.yaw ?? 0
  const d: [number, number] = [Math.sin(yaw0), Math.cos(yaw0)]
  const r: [number, number] = [d[1], -d[0]]
  const centre: [number, number] = [light[0] + d[0] * 11, light[2] + d[1] * 11]
  const at = (dd: number, rr: number, up = 0): V3 => {
    const x = centre[0] + d[0] * dd + r[0] * rr
    const z = centre[1] + d[1] * dd + r[1] * rr
    return [x, world.groundAt(x, z, 50) + up, z]
  }
  const faceCamera = Math.atan2(d[0], d[1])
  SQUAD.forEach((m, i) => {
    const p = at(m.at[0], m.at[1])
    const v = makePlayer(i, m.species, 0, p, m.r, m.l, m.passives)
    v.yaw = faceCamera + m.turn
    v.bot = true
    if (m.act) {
      v.hands[0].act = m.act[0]
      v.hands[1].act = m.act[1]
      v.hands[0].charge = m.act[0] === 'idle' ? 0 : (m.charge ?? 0)
      v.hands[1].charge = m.act[1] === 'idle' ? 0 : (m.charge ?? 0)
    }
    world.addPlayer(v, p, 0)
  })
  for (const [kind, dd, rr] of FOES) {
    const f = world.addFoe(kind, at(dd, rr), 'move')
    // Every invader heads for the squad.
    f.yaw = Math.atan2(centre[0] - f.p[0], centre[1] - f.p[2])
  }
  world.addProp({ kind: 'lighthouse', p: [...light], yaw: 0, team: 0, t: 0, hp: 2000, maxHp: 2000 })
  const cam = triple(params.get('cardcam'), [7.2, 1.5, -1.6])
  const look = triple(params.get('cardlook'), [-4, 1.6, 0.4])
  return {
    world,
    views: [{ pos: at(cam[0], cam[2], cam[1]), target: at(look[0], look[2], look[1]), name: 'card' }]
  }
}

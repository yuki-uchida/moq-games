/**
 * ヒナタ旧市街 (oldtown), 180 × 180 m. North = +z.
 *
 * South: the anima lighthouse plaza, fortified by ARK (squad base 1). Centre: the サクラ通り shopping street
 * (cherry trees) running north from the plaza to the overgrown station square, crossed by the ミナト avenue
 * (z ≈ −23, escort route) and the 北 avenue (z ≈ 4). East: the market (cart start, squad base 2). West: wooden
 * houses and the west gate (escort goal). North: ruins where the creatures come from.
 */
import type { MapDef, V3 } from '../types'
import { MapBuilder, YAW } from './builder'
import { type BlockSpec, type Lot, type Rect, columnFree, fillBlock, padsForTall, roofBridges } from './city'

const SHOP = [
  { style: 1, h: [4.5, 6.5] as [number, number], w: 4 },
  { style: 2, h: [9, 12] as [number, number], w: 1 }
]
const OFFICE = [
  { style: 0, h: [10, 12] as [number, number], w: 2 },
  { style: 0, h: [14, 18] as [number, number], w: 1 },
  { style: 2, h: [9, 12] as [number, number], w: 2 },
  { style: 1, h: [5, 6] as [number, number], w: 1 }
]
const HOMES = [
  { style: 3, h: [3.5, 4.5] as [number, number], w: 4 },
  { style: 2, h: [8, 11] as [number, number], w: 1 }
]
const RUIN = [{ style: 8, h: [2.5, 9] as [number, number], w: 1 }]

/** Escort route (east market → west gate). */
const CART: [number, number, number][] = [
  [66, 0, -9],
  [57, 0, -15],
  [48, 0, -21],
  [30, 0, -21],
  [12, 0, -25],
  [-12, 0, -25],
  [-30, 0, -21],
  [-50, 0, -21],
  [-66, 0, -24],
  [-80, 0, -23]
]

/** Distance from (x, z) to the cart route. */
function distToCart(x: number, z: number): number {
  let best = Infinity
  for (let i = 0; i + 1 < CART.length; i++) {
    const [ax, , az] = CART[i]
    const [bx, , bz] = CART[i + 1]
    const dx = bx - ax
    const dz = bz - az
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)))
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t))
  }
  return best
}

export function buildOldtown(variant?: 'night' | 'crater'): MapDef {
  const night = variant === 'night'
  const m = new MapBuilder('oldtown', 'ヒナタ旧市街', night ? 'night' : 'day', { min: [-90, -90], max: [90, 90] }, 1101)
  m.baseGround(1)
  m.closeBounds()

  // ------------------------------------------------------------------ ground: streets, sidewalks, plazas
  // ミナト avenue (escort route) and the north avenue cross the whole town.
  m.ground(-90, -28, 90, -18, 0, 'road')
  m.ground(-90, 0, 90, 8, 0, 'road')
  // South ring road in front of the plaza.
  m.ground(-60, -56, 60, -48, 0, 'road')
  // North-south side streets, split at the avenues.
  for (const [x0, x1] of [
    [-52, -44],
    [44, 52]
  ]) {
    m.ground(x0, -48, x1, -28, 0, 'road')
    m.ground(x0, -18, x1, 0, 0, 'road')
    m.ground(x0, 8, x1, 48, 0, 'road')
  }
  // Crumbling north road along the ruins (interrupted by the station).
  m.ground(-90, 48, -30, 54, 0, 'road')
  m.ground(30, 48, 90, 54, 0, 'road')
  // サクラ通り: a pedestrian shopping street paved with tiles.
  m.ground(-8, -48, 8, -28, 1, 'road')
  m.ground(-8, -18, 8, 0, 1, 'road')
  // Lighthouse plaza and station square.
  m.ground(-34, -90, 34, -56, 3)
  m.ground(-30, 8, 30, 40, 0)
  // Residential / ruin ground.
  m.ground(-90, 8, -52, 48, 0)
  m.ground(-90, 54, 90, 90, 2)
  m.ground(-90, -90, -34, -56, 0)
  m.ground(34, -90, 90, -56, 0)

  // ------------------------------------------------------------------ objectives, bases, spawns
  m.anchor('lighthouse', 0, 0, -66)
  m.anchor('gate', -80, 0, -23)
  m.path('cart', CART)
  m.base('squad', 0, 0, -80, 8, 4, 4, 0)
  m.base('squad', 74, 0, -6, 8, 4, 4, -Math.PI / 2 - 0.4)

  const north: V3[] = [
    [-62, 0, 74],
    [-30, 0, 82],
    [0, 0, 76],
    [30, 0, 84],
    [62, 0, 72]
  ]
  north.forEach((p) => m.foe(['north'], ...p))
  m.foe(['east'], 84, 0, 40)
  m.foe(['east'], 84, 0, 62)
  m.foe(['west'], -84, 0, 36)
  m.foe(['west'], -84, 0, 64)
  m.foe(['air', 'north'], -40, 12, 80, true)
  m.foe(['air', 'north'], 10, 14, 86, true)
  m.foe(['air', 'north'], 50, 10, 78, true)
  m.foe(['air', 'east'], 84, 13, 30, true)
  m.foe(['air', 'west'], -84, 11, 20, true)
  const raid: V3[] = [
    [-24, 0, -38],
    [24, 0, -38],
    [-26, 0, -9],
    [26, 0, -9],
    [-70, 0, -10],
    [-68, 0, -38]
  ]
  raid.forEach((p) => m.foe(['raid'], ...p))
  const keepAll = [...north, ...raid, [84, 0, 40] as V3, [84, 0, 62] as V3, [-84, 0, 36] as V3, [-84, 0, 64] as V3]
  const keep = keepAll.map(([x, , z]) => ({ x, z, r: 4.5 }))

  const block = (r: Rect, styles: BlockSpec['styles'], extra: Partial<BlockSpec> = {}): Lot[] =>
    fillBlock(m, { ...r, styles, keep, ...extra })
  const lots: Lot[] = []

  // ------------------------------------------------------------------ the lighthouse plaza (ARK stronghold)
  // Sandbag line across the plaza mouth with gaps, a second inner ring around the lighthouse.
  for (const [a, b] of [
    [-30, -20],
    [-12, -5],
    [5, 12],
    [20, 30]
  ])
    m.wallLine(a, -59, b, -59, 1.1, 0.9, 2)
  for (const [a, b] of [
    [-9, -4],
    [4, 9]
  ])
    m.wallLine(a, -71.5, b, -71.5, 1.1, 0.9, 2)
  m.wallLine(-9.5, -71, -9.5, -64, 1.1, 0.9, 2)
  m.wallLine(9.5, -71, 9.5, -64, 1.1, 0.9, 2)
  // Animal-made outposts on both flanks with stairs up the back (low roofs overlooking the ring road).
  for (const sx of [-1, 1]) {
    const x = sx * 24
    m.building(x, -66, 8, 7, 4.4, 6)
    m.stairs(x - sx * 1.5, -73.3, 'n', 0, 4.4, 2.4, 1)
    m.deco('lantern', x - 3.6, 4.4, -62.6)
    m.deco('lantern', x + 3.6, 4.4, -62.6)
    m.deco('banner', x, 2.5, -62.4, { yaw: 0 })
    m.wallLine(x - 4, -61.4, x + 4, -61.4, 0.9, 0.6, 2, 4.4)
    // Supply crates.
    m.crate(x - sx * 7, -70, 1.3, 2)
    m.crate(x - sx * 7, -68.7, 1.3, 2)
    m.crate(x - sx * 7, -70, 1.1, 2, 1.3)
  }
  // A watchtower behind the lighthouse: the plaza's high perch, reached by a pad.
  m.building(0, -88, 12, 3.5, 10, 6, 0, false)
  m.pad(0, 0, -84, Math.PI)
  m.deco('flag', 0, 10, -88)
  m.deco('banner', -14, 3, -59.5)
  m.deco('banner', 14, 3, -59.5)
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2
    m.deco('lantern', Math.sin(a) * 12, 0, -66 + Math.cos(a) * 9)
  }
  m.deco('lamp', -32, 0, -57)
  m.deco('lamp', 32, 0, -57)
  m.deco('lamp', -32, 0, -86)
  m.deco('lamp', 32, 0, -86)
  m.scatter(['flowers', 'bush'], 8, -32, -88, -14, -78)
  m.scatter(['flowers', 'bush'], 8, 14, -88, 32, -78)

  // South residential corners.
  lots.push(...block({ x0: -87, z0: -90, x1: -36, z1: -58 }, HOMES, { clutter: 'home', stairsP: 0.5 }))
  lots.push(...block({ x0: 36, z0: -90, x1: 90, z1: -58 }, HOMES, { clutter: 'home', stairsP: 0.5 }))
  lots.push(...block({ x0: -76, z0: -56, x1: -62, z1: -48 }, HOMES, { lotMax: 16 }))
  lots.push(...block({ x0: 62, z0: -56, x1: 90, z1: -48 }, HOMES, { lotMax: 16 }))

  // ------------------------------------------------------------------ サクラ通り and the central blocks
  for (const [z0, z1] of [
    [-48, -28],
    [-18, 0]
  ]) {
    // Shop-houses facing the street, offices and apartments behind.
    lots.push(...block({ x0: -43, z0: z0 + 0.5, x1: -9, z1: z1 - 0.5 }, SHOP, { stairsP: 0.45 }))
    lots.push(...block({ x0: 9, z0: z0 + 0.5, x1: 43, z1: z1 - 0.5 }, SHOP, { stairsP: 0.45 }))
    // Cherry trees, stalls and benches along the street.
    for (let z = z0 + 3; z < z1 - 1; z += 8) {
      m.tree(-5.5, z, 0, 1.1)
      m.tree(5.5, z + 4, 0, 1.1)
      m.deco('cherryPetals', 0, 4, z + 2)
    }
    m.crate(0, z0 + 6, 1.2, 0)
    m.boxC('wall', 0, (z0 + z1) / 2 + 2, 3.2, 1.2, 0, 1.0, { style: 3 })
    m.deco('bench', -2.5, 0, (z0 + z1) / 2 - 3, { yaw: YAW.e })
    m.deco('bench', 2.5, 0, (z0 + z1) / 2 + 6, { yaw: YAW.w })
    m.deco('vending', -7.5, 0, z1 - 2.5, { yaw: YAW.e })
    m.deco('vending', 7.5, 0, z0 + 3, { yaw: YAW.w })
    for (let z = z0 + 2; z < z1; z += 5) {
      m.deco('sign', -8.6, 3.2, z, { yaw: YAW.e, style: m.ri(0, 5) })
      m.deco('sign', 8.6, 3.2, z + 2.5, { yaw: YAW.w, style: m.ri(0, 5) })
    }
  }
  // サクラ通り entrance arch into the station square.
  m.boxC('pillar', -8, 9, 0.8, 0.8, 0, 6)
  m.boxC('pillar', 8, 9, 0.8, 0.8, 0, 6)
  m.boxC('platform', 0, 9, 17, 1.2, 6, 0.6, { style: 1 })
  m.deco('sign', 0, 6.6, 9, { s: 2.2, style: 9 })

  // East/west blocks around the avenues.
  lots.push(...block({ x0: -76, z0: -48, x1: -54, z1: -30 }, HOMES, { clutter: 'home', stairsP: 0.5 }))
  lots.push(...block({ x0: -76, z0: -16, x1: -54, z1: -2 }, HOMES, { clutter: 'home', stairsP: 0.5 }))
  lots.push(...block({ x0: 54, z0: -48, x1: 90, z1: -30 }, OFFICE, { stairsP: 0.4 }))
  lots.push(...block({ x0: -87, z0: 10, x1: -54, z1: 46 }, HOMES, { clutter: 'home', stairsP: 0.5 }))
  lots.push(...block({ x0: -43, z0: 10, x1: -32, z1: 46 }, OFFICE, { lotMax: 12 }))
  lots.push(...block({ x0: 32, z0: 10, x1: 43, z1: 46 }, OFFICE, { lotMax: 12 }))
  lots.push(...block({ x0: 54, z0: 10, x1: 90, z1: 46 }, OFFICE, { stairsP: 0.4 }))

  // ------------------------------------------------------------------ east market (cart start)
  m.ground(54, -16, 90, -2, 3)
  for (const [x, z, yaw] of [
    [58, -4, YAW.s],
    [64, -3.5, YAW.s],
    [84, -4, YAW.s],
    [86, -12, YAW.w],
    [76, -14.5, YAW.n]
  ] as const) {
    m.boxC('building', x, z, 4, 3, 0, 2.8, { style: 6 })
    m.deco('lantern', x - 1.8, 2.8, z)
    m.deco('lantern', x + 1.8, 2.8, z)
    m.deco('sign', x, 2.2, z + (yaw === YAW.s ? -1.6 : 1.6), { yaw, style: m.ri(0, 5) })
  }
  m.crate(84, -14.5, 1.2, 0)
  m.crate(82.8, -14.5, 1.2, 0)
  m.crate(67, -14.5, 1.2, 2)
  m.deco('banner', 74, 3, -1)
  m.deco('flag', 88, 0, -2)
  m.scatter(['trash', 'flowers', 'cone'], 6, 56, -15, 88, -3)

  // ------------------------------------------------------------------ station square (overgrown)
  // Station building with a canopy (low roof) and the clock tower (high perch).
  m.building(0, 47, 44, 14, 10, 4, 0, false)
  m.boxC('building', 0, 47, 6, 6, 10, 8, { style: 4 })
  m.boxC('platform', 0, 38, 32, 4, 4, 0.4)
  for (const x of [-15.5, -5, 5, 15.5]) m.boxC('pillar', x, 36.5, 0.6, 0.6, 0, 4)
  m.stairs(-24, 38, 'e', 0, 4.4, 2.6)
  m.stairs(-3, 38.6, 'e', 4.4, 10, 2.6, 0, 4.4)
  m.pad(8, 10, 46.5, YAW.w)
  m.deco('sign', 0, 8, 40.1, { s: 2.5, style: 8 })
  m.deco('acunit', 16, 10, 50)
  m.deco('acunit', -16, 10, 44)
  m.deco('antenna', 0, 18, 47)
  // Fountain, toppled bus, kiosks, trees and overgrowth.
  m.boxC('wall', 0, 24, 8, 0.8, 0, 0.8)
  m.boxC('wall', 0, 30, 8, 0.8, 0, 0.8)
  m.boxC('wall', -3.6, 27, 0.8, 5.2, 0, 0.8)
  m.boxC('wall', 3.6, 27, 0.8, 5.2, 0, 0.8)
  m.boxC('ground', 0, 27, 6.4, 5.2, 0.05, 0.45, { style: 7, solid: false })
  m.car(-16, 20, true, 2)
  m.car(17, 31, false, 1)
  m.car(20, 14, true, 0)
  m.boxC('building', -20, 30, 4, 4, 0, 3, { style: 1 })
  m.boxC('building', 21, 22, 4, 4, 0, 3, { style: 1 })
  for (const [x, z] of [
    [-25, 13],
    [-12, 33],
    [12, 15],
    [25, 36],
    [-26, 22],
    [9, 33]
  ])
    m.tree(x, z, 1, m.r(1, 1.3))
  m.scatter(['grass', 'grass', 'bush', 'flowers', 'moss', 'debris'], 40, -29, 9, 29, 35)
  m.deco('ivy', -22, 3, 40, { yaw: Math.PI })
  m.deco('ivy', 18, 4, 40, { yaw: Math.PI })
  m.deco('bench', -6, 0, 18)
  m.deco('bench', 6, 0, 18)

  // ------------------------------------------------------------------ north ruins (creature side)
  for (const [x0, x1] of [
    [-89, -32],
    [-30, 30],
    [32, 89]
  ])
    lots.push(
      ...block({ x0, z0: 56, x1, z1: 89 }, RUIN, {
        clutter: 'ruin',
        courtyardP: 0.35,
        lotMin: 6,
        lotMax: 12,
        alley: 5,
        stairsP: 0.3
      })
    )
  m.scatter(['grass', 'moss', 'debris', 'ivy'], 50, -88, 50, 88, 88)
  m.scatter(['tendril', 'crystalShard'], 6, -60, 80, 60, 89)

  // ------------------------------------------------------------------ the west gate
  m.boxC('building', -84, -34, 8, 6, 0, 9, { style: 6 })
  m.boxC('building', -84, -12, 8, 6, 0, 9, { style: 6 })
  m.boxC('platform', -84, -23, 6, 16, 7.8, 1.2, { style: 1 })
  m.stairs(-78.6, -52, 'n', 0, 9, 2.4, 1)
  // Town wall north and south of the gate.
  m.wallLine(-89, -90, -89, -37, 5, 2, 3)
  m.wallLine(-89, -9, -89, 89, 5, 2, 3)
  m.deco('banner', -79.8, 4, -34, { yaw: YAW.e })
  m.deco('banner', -79.8, 4, -12, { yaw: YAW.e })
  m.deco('lantern', -80, 7.5, -26)
  m.deco('lantern', -80, 7.5, -20)
  m.deco('flag', -84, 9, -34)

  // ------------------------------------------------------------------ avenue cover (kept off the cart route)
  const freeOfCart = (x: number, z: number, w: number, d: number): boolean =>
    distToCart(x, z) - Math.hypot(w / 2, d / 2) > 1.6
  const avenueCover = (x: number, z: number, w: number, d: number, f: () => void): void => {
    if (freeOfCart(x, z, w, d) && columnFree(m, x, z, Math.max(w, d) / 2 + 0.3)) f()
  }
  for (let x = -76; x <= 76; x += 11) {
    const z = m.chance(0.5) ? -26.6 : -19.4
    const kind = m.ri(0, 3)
    if (kind === 0) avenueCover(x, z, 4.3, 1.8, () => m.car(x, z, true, m.pick([0, 0, 1, 3])))
    else if (kind === 1) avenueCover(x, z, 4, 1, () => m.wallLine(x - 2, z, x + 2, z, 1.1, 0.9, 2))
    else if (kind === 2) avenueCover(x, z, 3, 1, () => m.wallLine(x - 1.5, z, x + 1.5, z, 1.3, 0.5, 3))
  }
  for (let x = -80; x <= 80; x += 13) {
    const z = m.chance(0.5) ? 1.6 : 6.4
    avenueCover(x, z, 4.4, 1.9, () => m.car(x, z, true, m.pick([0, 1, 3])))
  }
  // A crashed bus and a burnt truck block the avenue's long sightlines (route passes beside them).
  avenueCover(-40, -19.5, 10.5, 2.6, () => m.car(-40, -19.5, true, 2))
  avenueCover(20, -18.9, 6.2, 2.1, () => m.car(20, -18.9, true, 3))
  avenueCover(0, 4, 10.5, 2.6, () => m.car(0, 4, true, 2))
  for (const x of [-48, 48]) {
    for (let z = -44; z < 46; z += 15) {
      if (z > -29 && z < -16) continue
      const px = x + (m.chance(0.5) ? -2.4 : 2.4)
      avenueCover(px, z, 1.9, 4.4, () => m.car(px, z, false, m.pick([0, 1, 3])))
    }
  }

  // Street furniture: lamps along the avenues, utility poles along the side streets.
  for (let x = -84; x <= 84; x += 14) {
    m.deco('lamp', x, 0, -28.6, { yaw: 0 })
    m.deco('lamp', x + 7, 0, -17.4, { yaw: Math.PI })
    m.deco('pole', x + 3, 0, 8.4, { style: 1 })
    m.deco('lamp', x, 0, -0.4, { yaw: 0 })
  }
  for (let z = -46; z <= 46; z += 12) {
    m.deco('pole', -52.4, 0, z, { style: 2 })
    m.deco('pole', 52.4, 0, z, { style: 3 })
  }
  m.scatter(['cone', 'tire', 'trash', 'debris', 'puddle'], 30, -88, -28, 88, -18)
  m.scatter(['puddle', 'debris', 'trash'], 12, -88, 0, 88, 8)

  padsForTall(m, lots, 0.6)
  roofBridges(m, lots, 0.7)
  // Ivy and signs on facades.
  for (const lot of lots) {
    const b = lot.b
    if (!b) continue
    if (m.chance(0.4)) m.deco('ivy', b.min[0] - 0.05, m.r(1, 3), (b.min[2] + b.max[2]) / 2, { yaw: YAW.w })
    if (b.style === 8 && m.chance(0.5)) m.deco('moss', (b.min[0] + b.max[0]) / 2, b.max[1], b.min[2])
  }
  return m.build()
}

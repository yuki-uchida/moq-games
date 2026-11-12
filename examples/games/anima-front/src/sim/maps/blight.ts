/**
 * 侵蝕域 (blight), 200 × 200 m, violet. North = +z.
 *
 * A ruined district swallowed by violet crystal. The squad enters from the south (base at the broken
 * checkpoint). Three hive nodes sit in distinct sub-areas: node1 in the west plaza (sunken subway entrance),
 * node2 under the collapsed elevated highway in the north, node3 in the east factory yard. The crater lies in the
 * centre: a terraced bowl (r ≈ 30 m, 2 m deep). In the base map it is choked with spires and hive growth around
 * the dormant maw; the `crater` variant clears it into an open arena for クイツクシ.
 */
import type { MapDef } from '../types'
import { MapBuilder } from './builder'
import { type Lot, fillBlock, padsForTall, roofBridges } from './city'

const RUIN = [
  { style: 9, h: [3, 6] as [number, number], w: 3 },
  { style: 9, h: [9, 12] as [number, number], w: 1.5 },
  { style: 8, h: [3, 6] as [number, number], w: 1.5 },
  { style: 9, h: [14, 17] as [number, number], w: 0.6 }
]

/** Crater geometry. */
const CR = 30
const CELL = 4
const FLOOR_R = 10
const LEVELS = 5

/** Terrace height (≤ 0) of the crater bowl at a distance from the centre. */
function bowlHeight(r: number): number {
  if (r >= CR) return 0
  if (r <= FLOOR_R) return -LEVELS * 0.4
  const k = Math.ceil(((CR - r) / (CR - FLOOR_R)) * LEVELS)
  return -Math.min(LEVELS, k) * 0.4
}

export function buildBlight(variant?: 'night' | 'crater'): MapDef {
  const open = variant === 'crater'
  const m = new MapBuilder('blight', '侵蝕域', 'blight', { min: [-100, -100], max: [100, 100] }, 3301)
  m.closeBounds()

  // ------------------------------------------------------------------ ground (with the crater bowl)
  const H = 32 // crater square half-size (multiple of CELL)
  m.box('ground', -100, -0.32, -100, 100, -0.02, -H, { style: 5 })
  m.box('ground', -100, -0.32, H, 100, -0.02, 100, { style: 5 })
  m.box('ground', -100, -0.32, -H, -H, -0.02, H, { style: 5 })
  m.box('ground', H, -0.32, -H, 100, -0.02, H, { style: 5 })
  // Greedy-merged terrace cells.
  const n = (H * 2) / CELL
  const lv: number[] = []
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      const x = -H + (i + 0.5) * CELL
      const z = -H + (k + 0.5) * CELL
      lv.push(bowlHeight(Math.hypot(x, z)))
    }
  }
  const used = new Uint8Array(n * n)
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      if (used[k * n + i]) continue
      const h = lv[k * n + i]
      let w = 1
      while (i + w < n && !used[k * n + i + w] && lv[k * n + i + w] === h) w++
      let d = 1
      while (k + d < n) {
        let ok = true
        for (let j = 0; j < w; j++) if (used[(k + d) * n + i + j] || lv[(k + d) * n + i + j] !== h) ok = false
        if (!ok) break
        d++
      }
      for (let a = 0; a < d; a++) for (let j = 0; j < w; j++) used[(k + a) * n + i + j] = 1
      const top = h === 0 ? -0.02 : h
      m.box('ground', -H + i * CELL, top - 0.3, -H + k * CELL, -H + (i + w) * CELL, top, -H + (k + d) * CELL, {
        style: h <= -1.6 ? 2 : 5
      })
    }
  }
  const floorY = -LEVELS * 0.4
  // Streets (cracked asphalt) on the grid, crystal-crusted plazas at the nodes.
  for (const x of [-70, 70]) m.ground(x - 4, -96, x + 4, 96, 0, 'road')
  for (const z of [-62, 62]) {
    m.ground(-66, z - 4, 66, z + 4, 0, 'road')
  }
  m.ground(-4, -100, 4, -H, 0, 'road')

  // ------------------------------------------------------------------ objectives, base, spawns
  m.anchor('crater', 0, floorY, 0)
  m.anchor('node1', -66, 0, -6)
  m.anchor('node2', 6, 0, 74)
  m.anchor('node3', 66, 0, -34)
  m.base('squad', 0, 0, -88, 8, 4, 4, 0)

  const nodes: [string, number, number][] = [
    ['node1', -66, -6],
    ['node2', 6, 74],
    ['node3', 66, -34]
  ]
  const keep: { x: number; z: number; r: number }[] = [{ x: 0, z: -88, r: 12 }]
  for (const [tag, x, z] of nodes) {
    keep.push({ x, z, r: 14 })
    m.foe([tag, 'air'], x, 12, z, true)
    // Hive growth around the node (low organic mounds, never closing the court).
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.2
      const r = 6
      m.boxC('crystal', x + Math.sin(a) * r, z + Math.cos(a) * r, 1.6, 1.6, 0, m.r(1, 2.2), { style: 2 })
      m.deco('tendril', x + Math.sin(a) * 3.5, 0, z + Math.cos(a) * 3.5, { yaw: a })
      m.deco('pod', x + Math.sin(a + 0.6) * 8.5, 0, z + Math.cos(a + 0.6) * 8.5, { s: m.r(0.8, 1.4) })
    }
  }
  m.foe(['crater', 'air'], 0, 14, 12, true)
  m.foe(['crater', 'air'], -12, 12, -6, true)
  m.foe(['crater', 'air'], 12, 13, -6, true)
  m.foe(['air'], -80, 14, 80, true)
  m.foe(['air'], 80, 12, 80, true)
  m.foe(['air'], 85, 15, 0, true)
  m.foe(['air'], -85, 13, -60, true)
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3
    keep.push({ x: Math.sin(a) * 24, z: Math.cos(a) * 24, r: 3 })
  }

  // ------------------------------------------------------------------ ruined blocks
  const lots: Lot[] = []
  const blocks: [number, number, number, number][] = [
    // south band
    [-96, -96, -76, -66],
    [-64, -96, -8, -68],
    [8, -96, 64, -68],
    [76, -96, 96, -66],
    // middle bands west/east of the crater
    [-96, -56, -76, -16],
    [-96, 4, -76, 56],
    [-64, -56, -36, 56],
    [36, -56, 64, 56],
    [76, -56, 96, -46],
    [76, -22, 96, 56],
    // north band
    [-96, 68, -76, 96],
    [-64, 68, -16, 96],
    [26, 68, 64, 96],
    [76, 68, 96, 96]
  ]
  for (const [x0, z0, x1, z1] of blocks) {
    lots.push(
      ...fillBlock(m, {
        x0,
        z0,
        x1,
        z1,
        styles: RUIN,
        keep,
        clutter: 'ruin',
        courtyardP: 0.25,
        lotMin: 7,
        lotMax: 13,
        alley: 4.5,
        stairsP: 0.45
      })
    )
  }
  // Buildings inside the ring between the crater and the blocks (sparse, to keep the crater approaches open).
  for (const [x, z] of [
    [-24, -48],
    [24, -50],
    [-26, 46],
    [24, 48]
  ]) {
    m.building(x, z, 9, 8, m.pick([4, 5, 11]), 9)
  }
  padsForTall(m, lots, 0.55)
  roofBridges(m, lots, 0.6, 0)

  // ------------------------------------------------------------------ node 1: the west plaza (sunken stairs)
  m.boxC('building', -66, 10, 8, 3, 0, 3.2, { style: 4 })
  m.wallLine(-76, -18, -72, -18, 1.2, 0.8, 5)
  m.wallLine(-60, 4, -56, 4, 1.2, 0.8, 5)
  m.deco('sign', -66, 2.6, 8.4, { yaw: Math.PI, style: 7 })

  // ------------------------------------------------------------------ node 2: the collapsed elevated highway
  // Deck at 6 m running east-west, broken in the middle (a slab slopes down in steps), stairs at both ends.
  const deckZ = 62
  m.box('platform', -85, 5.6, deckZ - 4, -12, 6, deckZ + 4)
  m.box('platform', 18, 5.6, deckZ - 4, 85, 6, deckZ + 4)
  for (let x = -80; x <= 80; x += 16) {
    if (x > -14 && x < 20) continue
    m.boxC('pillar', x, deckZ, 1.4, 1.4, 0, 5.6)
  }
  // Collapsed span: stepped slabs from the west deck down to the street.
  m.stairs(-12 + MapBuilder.run(0, 6), deckZ, 'w', 0, 6, 8, 0)
  m.stairs(-95.5, deckZ, 'e', 0, 6, 5, 0)
  m.stairs(95.5, deckZ, 'w', 0, 6, 5, 0)
  m.pad(24, 0, deckZ - 7, 0)
  m.boxC('rock', 8, deckZ + 2, 6, 3, 0, 1.4, { style: 1 })
  m.boxC('rock', 2, deckZ - 3, 3, 2, 0, 0.9, { style: 1 })
  for (let x = -86; x <= 86; x += 12) if (x < -14 || x > 20) m.deco('lamp', x, 6, deckZ - 3.6, { yaw: 0 })
  m.car(-40, deckZ + 1.5, true, 0)
  m.car(52, deckZ - 1.5, true, 2)

  // ------------------------------------------------------------------ node 3: the east factory yard
  m.building(80, -34, 10, 22, 8, 5)
  m.stairs(73.8, -45, 'n', 0, 6, 2.2, 2)
  for (const [x, z] of [
    [58, -26],
    [60, -44],
    [72, -24]
  ]) {
    m.container(x, z, true, false, 0, 5)
  }
  m.crate(56, -36, 1.3, 1)
  m.crate(56, -34.7, 1.3, 1)

  // ------------------------------------------------------------------ the squad's entry (south checkpoint)
  m.wallLine(-12, -80, -5, -80, 1.1, 0.9, 2)
  m.wallLine(5, -80, 12, -80, 1.1, 0.9, 2)
  m.boxC('building', -12, -92, 6, 5, 0, 3.5, { style: 6 })
  m.boxC('building', 12, -92, 6, 5, 0, 3.5, { style: 6 })
  m.crate(-6, -94, 1.3, 2)
  m.crate(6, -94, 1.3, 2)
  m.deco('banner', -12, 2.5, -89.4)
  m.deco('banner', 12, 2.5, -89.4)
  m.deco('lantern', -9, 3.5, -92)
  m.deco('lantern', 9, 3.5, -92)

  // ------------------------------------------------------------------ the fallen tower across the south road
  // Hides the crater from the entry: a collapsed tower block with two wings, 4 m gaps, and spires behind the gaps.
  m.building(0, -42, 12, 6, 8, 9)
  m.building(-14, -42, 8, 4, 5, 8)
  m.building(14, -42, 8, 4, 5, 8)
  m.boxC('crystal', -10.5, -34, 3, 3, 0, 4.5, { style: 1 })
  m.boxC('crystal', 10.5, -34, 3, 3, 0, 4.5, { style: 1 })
  m.boxC('rock', 0, -47, 6, 2.4, 0, 1.2, { style: 1 })

  // ------------------------------------------------------------------ crystal growth everywhere
  for (let i = 0; i < 30; i++) {
    const x = m.r(-96, 96)
    const z = m.r(-96, 96)
    if (Math.hypot(x, z) < 36 || keep.some((k) => Math.hypot(k.x - x, k.z - z) < k.r + 2)) continue
    if (!columnClear(m, x, z, 2.2)) continue
    m.boxC('crystal', x, z, m.r(1.2, 2.6), m.r(1.2, 2.6), 0, m.r(1.2, 4.5), { style: m.pick([0, 0, 1, 2]) })
  }
  m.scatter(['crystalShard', 'crystalShard', 'tendril', 'pod', 'debris', 'moss'], 160, -98, -98, 98, 98)
  for (let i = 0; i < 16; i++) {
    const x = m.pick([-70, 70])
    m.deco('pole', x + 4.5, 0, -90 + i * 12, { style: 1 })
  }
  // ------------------------------------------------------------------ the crater (last: the variants must not shift the random stream of the rest)
  if (!open) {
    // The dormant maw: a ring of spires around the centre with gaps, hive growth and fallen slabs in the bowl.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      m.boxC('crystal', Math.sin(a) * 7, Math.cos(a) * 7, 2.6, 2.6, floorY, m.r(9, 15), { style: 1 })
    }
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.31
      const r = m.r(13, 22)
      const x = Math.sin(a) * r
      const z = Math.cos(a) * r
      if (keep.some((k) => Math.hypot(k.x - x, k.z - z) < k.r + 2)) continue
      m.boxC('crystal', x, z, m.r(2, 4), m.r(2, 4), bowlHeight(r) - 0.2, m.r(2.5, 6), { style: m.pick([0, 0, 1, 2]) })
    }
    for (const [x, z, w, d] of [
      [-16, 4, 7, 1.4],
      [14, -10, 1.4, 6],
      [4, 18, 6, 1.4]
    ])
      m.boxC('rock', x, z, w, d, bowlHeight(Math.hypot(x, z)) - 0.3, 1.6, { style: 1 })
    m.scatter(['pod', 'tendril', 'crystalShard'], 26, -24, -24, 24, 24, floorY)
  } else {
    // Open arena: a few low rubble covers on the terraces, glowing pods on the floor.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6
      const r = 19
      const x = Math.sin(a) * r
      const z = Math.cos(a) * r
      m.boxC('rock', x, z, i % 2 ? 4 : 1.4, i % 2 ? 1.4 : 4, bowlHeight(r) - 0.3, 1.3, { style: 1 })
    }
    m.scatter(['tendril', 'crystalShard', 'pod'], 24, -26, -26, 26, 26, floorY)
  }
  // Rim: crystal outcrops with wide gaps (the bowl is entered from every side).
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.15
    const x = Math.sin(a) * 31
    const z = Math.cos(a) * 31
    if (i % 3 === 1 || keep.some((k) => Math.hypot(k.x - x, k.z - z) < k.r + 2)) continue
    m.boxC('crystal', x, z, m.r(2.5, 4), m.r(2.5, 4), 0, open ? m.r(1.5, 3) : m.r(3, 7), { style: m.pick([0, 1]) })
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2
    m.deco('crystalShard', Math.sin(a) * 28, bowlHeight(28), Math.cos(a) * 28, { s: m.r(1, 2), yaw: a })
  }

  // ------------------------------------------------------------------ ground foe spawns (on free ground)
  for (const [tag, x, z] of nodes) {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5
      const [px, pz] = m.findFree(x + Math.sin(a) * 10, z + Math.cos(a) * 10)
      m.foe([tag], px, 0, pz)
    }
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3
    const x = Math.round(Math.sin(a) * 2400) / 100
    const z = Math.round(Math.cos(a) * 2400) / 100
    m.foe(['crater'], x, terraceAt(x, z), z)
  }
  return m.build()
}

/** Top of the terrace cell under (x, z). */
function terraceAt(x: number, z: number): number {
  const cx = (Math.floor(x / CELL) + 0.5) * CELL
  const cz = (Math.floor(z / CELL) + 0.5) * CELL
  const h = bowlHeight(Math.hypot(cx, cz))
  return h === 0 ? -0.02 : h
}

function columnClear(m: MapBuilder, x: number, z: number, r: number): boolean {
  return !m.boxes.some(
    (b) =>
      b.kind !== 'ground' &&
      b.kind !== 'road' &&
      b.kind !== 'barrier' &&
      b.min[0] < x + r &&
      b.max[0] > x - r &&
      b.min[2] < z + r &&
      b.max[2] > z - r
  )
}

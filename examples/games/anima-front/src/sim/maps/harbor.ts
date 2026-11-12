/**
 * 港湾ブロック (harbor), 220 × 180 m, sunset. North = +z, the sea is in the east (x > 86).
 *
 * West → east: the ARK landing site (squad base), the container yard around capture point A, the warehouse
 * district around the loading court (B), the comms tower by the quay (C), then the quay with gantry cranes and
 * three piers over the water. ゴウテツ walks out of the sea (`sea`) east of the tower.
 */
import type { MapDef, V3 } from '../types'
import { type Dir, MapBuilder, YAW } from './builder'
import { columnFree } from './city'

const SEA_X = 86

export function buildHarbor(): MapDef {
  const m = new MapBuilder('harbor', '港湾ブロック', 'sunset', { min: [-110, -90], max: [110, 90] }, 2207)
  m.baseGround(1, SEA_X)
  m.closeBounds()

  // ------------------------------------------------------------------ ground and water
  m.water(SEA_X, -90, 110, 90)
  m.ground(-78, -90, -8, 90, 0, 'road') // container yard asphalt
  m.ground(-8, -90, -2, 90, 1, 'road') // walkway between the yard and the warehouses
  m.ground(-108, -14, -82, 14, 3) // landing pad
  m.ground(66, -90, SEA_X, 90, 1) // quay apron
  m.ground(0, -30, 34, 22, 0, 'road') // loading court
  m.ground(-110, 40, -80, 90, 0) // grass verge north-west
  m.ground(-110, -90, -80, -40, 2) // dirt lot south-west

  // ------------------------------------------------------------------ objectives, bases, spawns
  m.anchor('zoneA', -44, 0, 26)
  m.anchor('zoneB', 14, 0, -4)
  m.anchor('zoneC', 64, 0, 8)
  m.anchor('sea', 97, -0.9, 8)
  m.base('squad', -96, 0, 0, 8, 4, 4, YAW.e)

  const drops: V3[] = [
    [-30, 0, 78],
    [-28, 0, -80],
    [22, 0, 80],
    [24, 0, -82],
    [71, 0, 80],
    [76, 0, -80],
    [54, 0, 18]
  ]
  drops.forEach((p) => m.foe(['drop'], ...p))
  const seaSpawns: V3[] = [
    [98, -0.9, -24],
    [97, -0.9, 8],
    [98, -0.9, 34],
    [100, -0.9, 72],
    [100, -0.9, -70]
  ]
  seaSpawns.forEach((p) => m.foe(['sea'], ...p))
  m.foe(['air'], -20, 14, 84, true)
  m.foe(['air'], 40, 12, -86, true)
  m.foe(['air'], 90, 15, 50, true)
  m.foe(['air'], 90, 13, -40, true)
  m.foe(['air'], 10, 15, 60, true)
  const keep = [...drops, [-44, 0, 26] as V3, [14, 0, -4] as V3, [64, 0, 8] as V3]
  const kept = (x: number, z: number, r: number): boolean =>
    keep.some(([kx, , kz]) => Math.hypot(kx - x, kz - z) < r + (kx === -44 ? 12 : 4.5))

  // ------------------------------------------------------------------ landing site
  for (const [x, z] of [
    [-100, -16],
    [-90, -16],
    [-100, 16],
    [-90, 16]
  ]) {
    m.crate(x, z, 1.3, 2)
    m.crate(x + 1.3, z, 1.3, 2)
  }
  m.wallLine(-83, -12, -83, -4, 1.1, 0.9, 2)
  m.wallLine(-83, 4, -83, 12, 1.1, 0.9, 2)
  m.deco('banner', -104, 3, -13)
  m.deco('flag', -106, 0, 12)
  m.deco('lamp', -84, 0, -14)
  m.deco('lamp', -84, 0, 14)
  // Harbour office (north-west) and customs shed (south-west).
  m.building(-94, 58, 18, 14, 13, 0)
  m.stairs(-104, 49.6, 'e', 0, 5.2, 2.6)
  m.boxC('platform', -90, 49.6 - 0, 9, 2.6, 4.8, 0.4, { style: 2 })
  m.pad(-88, 5.2, 49.6, 0)
  m.building(-95, -62, 16, 12, 6, 5)
  m.stairs(-103, -54.7, 'e', 0, 6, 2.4, 2)
  m.car(-92, -46, true, 3)
  m.car(-100, 30, false, 1)
  m.car(-90, 32, false, 3)
  m.scatter(['grass', 'bush', 'flowers'], 20, -108, 40, -82, 88)
  m.scatter(['tire', 'debris', 'cone'], 10, -108, -88, -82, -42)

  // ------------------------------------------------------------------ container yard (x −76 … −9)
  // Four columns of 40 ft stacks separated by 6 m north-south lanes. Each column is cut into segments with
  // staggered gaps, so the east-west routes zigzag (no straight sightline across the yard). Some segments carry
  // metal stairs in place of one row; grating bridges link equal-height stacks across the lanes.
  const colours = [0, 1, 2, 3, 4, 5]
  const COL_W = 12.2
  const cols = [-75, -56.6, -38.2, -19.8]
  const segs: { x0: number; z0: number; z1: number; h: number }[] = []
  for (const x0 of cols) {
    let z = -86 + m.r(0, 6)
    while (z < 80) {
      const rows = m.pick([2, 2, 3])
      const depth = rows * 2.44
      if (z + depth > 86) break
      const cz = z + depth / 2
      const cx = x0 + COL_W / 2
      if (!kept(cx, cz, depth / 2 + 4)) {
        const tiers = m.pick([1, 1, 2, 2, 3])
        const stairsRow = tiers <= 2 && m.chance(0.3) ? (m.chance(0.5) ? 0 : rows - 1) : -1
        for (let r = 0; r < rows; r++) {
          const rz = z + (r + 0.5) * 2.44
          if (r === stairsRow) {
            const top = tiers * 2.6
            const dir = m.chance(0.5) ? 'e' : 'w'
            const run = MapBuilder.run(0, top)
            m.stairs(dir === 'e' ? x0 + COL_W - 0.3 - run : x0 + 0.3 + run, rz, dir, 0, top, 2.44, 2)
            continue
          }
          const half = m.chance(0.1)
          for (let k = 0; k < tiers; k++) {
            if (half) {
              m.container(cx - 3.05, rz, true, false, k, m.pick(colours))
              if (k === 0 || m.chance(0.8)) m.container(cx + 3.05, rz, true, false, k, m.pick(colours))
            } else m.container(cx, rz, true, true, k, m.pick(colours))
          }
        }
        if (m.chance(0.35)) m.crate(x0 + m.r(1, COL_W - 1), z - 0.75, 1.3, m.pick([0, 1]))
        segs.push({ x0, z0: z, z1: z + depth, h: tiers * 2.6 })
      }
      z += depth + m.r(5, 8)
    }
  }
  // Grating bridges across the lanes between equal-height stacks.
  for (const a of segs) {
    for (const b of segs) {
      if (b.x0 <= a.x0 || b.x0 - a.x0 > COL_W + 7 || a.h !== b.h || a.h < 5) continue
      const lo = Math.max(a.z0, b.z0)
      const hi = Math.min(a.z1, b.z1)
      if (hi - lo < 2.2 || !m.chance(0.6)) continue
      const mz = (lo + hi) / 2
      m.box('platform', a.x0 + COL_W, a.h - 0.3, mz - 1, b.x0, a.h, mz + 1, { style: 2 })
    }
  }
  // zoneA: an open square with low cover, a guard hut and lamp posts.
  m.container(-50, 18, true, false, 0, 3)
  m.container(-38, 34, true, false, 0, 1)
  m.container(-34, 20, false, false, 0, 4)
  m.crate(-48, 31, 1.3, 1)
  m.crate(-46.7, 31, 1.3, 1)
  m.boxC('building', -54, 32, 4, 3, 0, 3, { style: 5 })
  m.deco('lamp', -52, 0, 18)
  m.deco('lamp', -36, 0, 34)
  m.scatter(['cone', 'tire', 'puddle', 'trash'], 30, -76, -86, -12, 86)

  // ------------------------------------------------------------------ warehouses
  const warehouse = (x0: number, z0: number, x1: number, z1: number, h: number, padSide: Dir): void => {
    const t = 0.5
    const door = 4
    const lintel = 3.8
    const wallsX = (z: number, doors: number[]): void => {
      let a = x0
      for (const d of [...doors].sort((p, q) => p - q)) {
        m.box('wall', a, 0, z - t / 2, d - door / 2, h, z + t / 2, { style: 0 })
        m.box('wall', d - door / 2, lintel, z - t / 2, d + door / 2, h, z + t / 2, { style: 0 })
        a = d + door / 2
      }
      m.box('wall', a, 0, z - t / 2, x1, h, z + t / 2, { style: 0 })
    }
    const wallsZ = (x: number, doors: number[]): void => {
      let a = z0 + t / 2
      for (const d of [...doors].sort((p, q) => p - q)) {
        m.box('wall', x - t / 2, 0, a, x + t / 2, h, d - door / 2, { style: 0 })
        m.box('wall', x - t / 2, lintel, d - door / 2, x + t / 2, h, d + door / 2, { style: 0 })
        a = d + door / 2
      }
      m.box('wall', x - t / 2, 0, a, x + t / 2, h, z1 - t / 2, { style: 0 })
    }
    const w = x1 - x0
    const d = z1 - z0
    wallsX(z0, [x0 + w * 0.25, x0 + w * 0.72])
    wallsX(z1, [x0 + w * 0.2, x0 + w * 0.85])
    wallsZ(x0, [z0 + d / 2])
    wallsZ(x1, [z0 + d / 2])
    m.box('roof', x0 - 0.3, h, z0 - 0.3, x1 + 0.3, h + 0.3, z1 + 0.3, { style: 2 })
    // Mezzanine with stairs along the north wall, crate rows inside.
    const mz = z1 - 3.2
    m.box('platform', x0 + 0.5, 3.4, mz, x0 + w * 0.45, 3.8, z1 - 0.3, { style: 2 })
    m.stairs(x0 + w * 0.45 + MapBuilder.run(0, 3.8), mz + 1.4, 'w', 0, 3.8, 2.4, 2)
    for (let i = 0; i < 3; i++) {
      const cx = x0 + w * (0.2 + i * 0.3)
      m.crate(cx, z0 + d * 0.45, 1.4, 1)
      if (i !== 1) m.crate(cx + 1.4, z0 + d * 0.45, 1.4, 0)
      m.crate(cx, z0 + d * 0.45, 1.2, 0, 1.4)
    }
    // Roof access: a frog pad outside the given side.
    const cx = (x0 + x1) / 2
    const cz = (z0 + z1) / 2
    const at: Record<Dir, [number, number, number]> = {
      n: [cx - w * 0.1, z1 + 2.6, Math.PI],
      s: [cx + w * 0.1, z0 - 2.6, 0],
      e: [x1 + 2.6, cz + d * 0.25, -Math.PI / 2],
      w: [x0 - 2.6, cz - d * 0.25, Math.PI / 2]
    }
    const [px, pz, py] = at[padSide]
    m.pad(px, 0, pz, py)
    m.deco('lamp', x0 - 0.6, 4, cz, { yaw: -Math.PI / 2 })
    m.deco('sign', cx, h - 1.5, z0 - 0.3, { yaw: Math.PI, s: 2, style: m.ri(0, 5) })
  }
  warehouse(-1, 26, 30, 46, 7, 's')
  warehouse(-1, -54, 30, -34, 7, 'n')
  warehouse(38, -78, 62, -60, 6, 'n')
  warehouse(38, 56, 62, 76, 6, 's')

  // ------------------------------------------------------------------ loading court (zoneB)
  m.car(4, 12, true, 3)
  m.car(26, -22, true, 3)
  m.container(24, 10, true, false, 0, 2)
  m.container(4, -20, true, false, 0, 0)
  m.container(4, -20, true, false, 1, 5)
  m.stairs(-5, -22.1, 'e', 0, 5.2, 1.6, 2)
  m.wallLine(8, 2, 12, 2, 1.2, 0.6, 0)
  m.wallLine(17, -10, 21, -10, 1.2, 0.6, 0)
  m.crate(20, 3, 1.3, 1)
  m.crate(8, -11, 1.3, 1)
  m.crate(8, -9.7, 1.3, 0)
  // Control office overlooking the court (high perch with a pad, flankable from the warehouse roofs).
  m.building(44, -16, 12, 10, 12, 0)
  m.pad(44, 0, -7.4, Math.PI)
  m.building(44, 8, 8, 8, 4.5, 5)
  m.stairs(49.2, 1.5, 'n', 0, 4.5, 2.2, 2)
  for (let z = -26; z <= 18; z += 11) m.deco('lamp', -1.5, 0, z, { yaw: YAW.e })
  m.scatter(['cone', 'puddle', 'trash', 'tire'], 16, 0, -28, 34, 20)
  // Trucks and singles in the lanes between the warehouses.
  m.car(18, 54, true, 3)
  m.car(50, -40, false, 3)
  m.car(50, 40, false, 1)
  m.container(22, 64, true, true, 0, 1)
  m.container(22, 64, true, true, 1, 3)
  m.container(8, -66, true, true, 0, 4)
  m.container(20, -76, true, false, 0, 0)
  m.container(52, 30, false, false, 0, 5)
  m.container(54, -34, false, false, 0, 2)

  // Sheds east of the warehouses (low roofs with stairs).
  m.building(44, 29, 12, 10, 5, 5)
  m.stairs(36.8, 22, 'n', 0, 5, 2.2, 2)
  m.building(42, -43, 12, 10, 4.5, 5)
  m.stairs(36, -36.9, 'e', 0, 4.5, 2.2, 2)
  m.crate(28, 0, 1.3, 2)
  m.crate(28, 1.3, 1.3, 2)
  m.crate(28, 0, 1.1, 0, 1.3)
  m.wallLine(-1, 8, -1, 14, 1.2, 0.6, 0)

  // ------------------------------------------------------------------ comms tower (zoneC)
  m.building(72, 18, 8, 8, 5, 0)
  m.stairs(77.2, 10, 'n', 0, 5, 2.2, 2)
  m.boxC('pillar', 72, 18, 3, 3, 5, 11, { style: 1 })
  m.boxC('platform', 72, 18, 5, 5, 16, 0.4, { style: 2 })
  m.pad(68.7, 5, 14.7, 0.3)
  m.deco('antenna', 72, 16.4, 18, { s: 2.5 })
  m.deco('antenna', 70, 5, 21)
  for (const [x, z] of [
    [58, 2],
    [58, 14],
    [70, 0]
  ])
    m.wallLine(x - 2, z, x + 2, z, 1.2, 0.7, 0)
  m.wallLine(56, 6, 56, 10, 1.2, 0.7, 0)
  m.crate(66, 0, 1.3, 2)
  m.crate(62, 15, 1.3, 1)

  // ------------------------------------------------------------------ quay: cranes, bollards, piers, slipways
  for (const cz of [-40, 36, 66]) {
    for (const [lx, lz] of [
      [71, cz - 6],
      [71, cz + 6],
      [83, cz - 6],
      [83, cz + 6]
    ])
      m.boxC('pillar', lx, lz, 1.2, 1.2, 0, 10, { style: 1 })
    m.boxC('platform', 77, cz, 14, 13.2, 10, 0.6, { style: 2 })
    m.deco('crane', 77, 0, cz, { yaw: YAW.e })
    m.pad(77, 0, cz - 9.5, 0)
  }
  for (const pz of [-62, 0, 44]) {
    m.box('platform', SEA_X, -1.6, pz - 3.5, 106, 0, pz + 3.5, { style: 1 })
    for (let x = SEA_X + 3; x < 106; x += 6) {
      m.deco('bollard', x, 0, pz - 3.2)
      m.deco('bollard', x, 0, pz + 3.2)
    }
    m.deco('lamp', 104, 0, pz)
    m.crate(102, pz + 1.5, 1.2, 0)
  }
  // Slipways down to the sea bed (the water is waist-deep).
  for (const sz of [-24, 12, 72]) m.stairs(SEA_X + 2.1, sz, 'w', -0.9, 0, 6, 0, -1.2)
  for (let z = -86; z <= 86; z += 8) m.deco('bollard', SEA_X - 0.6, 0, z)
  for (let z = -80; z <= 80; z += 20) m.deco('buoy', 104 - (z % 3), -0.15, z + 7)
  for (let z = -84; z <= 84; z += 12) m.deco('lamp', 68, 0, z, { yaw: YAW.e })
  // Containers waiting on the quay (cover between the cranes).
  for (const [x, z, tiers] of [
    [76, -64, 1],
    [76, -14, 2],
    [76, 44, 1],
    [77, 82, 2]
  ] as const) {
    for (let k = 0; k < tiers; k++) m.container(x, z, false, true, k, m.pick(colours))
  }
  m.car(70, -24, false, 3)
  m.car(80, 36, false, 3)
  m.scatter(['rope', 'tire', 'cone', 'puddle'], 24, 67, -88, 85, 88)

  // Fences at the yard edge with gaps, lamps along the walkway.
  for (let z = -80; z < 80; z += 30) m.box('fence', -79.2, 0, z, -78.8, 2.2, z + 14)
  for (let z = -86; z <= 86; z += 14) m.deco('lamp', -5, 0, z)
  for (let z = -86; z <= 86; z += 20) m.deco('pole', -9, 0, z, { style: 1 })

  // Yard dressing: floodlight lamps in the lanes, stencilled signs, puddles and litter everywhere.
  for (const x of [-59.7, -41.3, -22.9])
    for (let z = -80; z <= 80; z += 20) m.deco('lamp', x, 0, z + (x === -41.3 ? 10 : 0), { yaw: YAW.e, s: 1.3 })
  for (let i = 0; i < 24; i++) {
    const x = m.r(-75, -10)
    const z = m.r(-85, 85)
    if (columnFree(m, x, z, 0.6)) m.deco('sign', x, 0, z, { yaw: m.pick([0, Math.PI]), style: m.ri(0, 11), s: 0.8 })
  }
  m.scatter(['puddle', 'trash', 'debris', 'tire', 'cone'], 50, -108, -88, 84, 88)
  m.scatter(['grass', 'moss'], 30, -108, -88, -80, 88)
  for (let z = -84; z <= 84; z += 14) m.deco('pole', -80.5, 0, z, { style: 2 })
  for (const pz of [-62, 0, 44]) {
    m.deco('rope', SEA_X + 4, 0, pz + 3.6, { yaw: YAW.e })
    m.deco('rope', SEA_X + 12, 0, pz - 3.6, { yaw: YAW.e })
    m.deco('flag', 105.5, 0, pz + 3)
  }
  return m.build()
}

/**
 * 訓練場 (range), 90 × 90 m, day. North = +z.
 *
 * The ARK training yard. South: the squad's entry and supply hut. West: the tutorial track running north
 * (tutorial1 move → tutorial2 look → tutorial3 ledge → tutorial4 dash gap), then east to the firing line
 * (tutorial5 paws, tutorial6 cycle). Centre: four shooting lanes firing east with static targets at 20 m
 * (target1–4) and 38 m (target5–8), two moving-target lanes (mover1, mover2) and a backstop berm. North: the
 * climbing tower with the jump-pad demo and the hook wall (tutorial7 gadgets), the anima corner (tutorial8) in the
 * north-east, and the dummy squad area (revive practice) in the south-east.
 */
import type { MapDef } from '../types'
import { MapBuilder, YAW } from './builder'

export function buildRange(): MapDef {
  const m = new MapBuilder('range', '訓練場', 'day', { min: [-45, -45], max: [45, 45] }, 5501)
  m.baseGround(0)
  m.closeBounds()

  // ------------------------------------------------------------------ ground
  m.ground(-40, -40, -27, 12, 1, 'road') // tutorial track
  m.ground(-27, -22, 26, 22, 2) // shooting range (packed dirt)
  m.ground(-24, -44, 24, -26, 3) // entry plaza
  m.ground(-24, 24, 24, 44, 1) // tower yard
  // Perimeter fence (wooden) inside the invisible walls.
  m.box('fence', -45, 0, 44.4, 45, 2, 45, { style: 2 })
  m.box('fence', -45, 0, -45, 45, 2, -44.4, { style: 2 })
  m.box('fence', -45, 0, -44.4, -44.4, 2, 44.4, { style: 2 })
  m.box('fence', 44.4, 0, -44.4, 45, 2, 44.4, { style: 2 })

  // ------------------------------------------------------------------ entry (squad base)
  m.base('squad', -8, 0, -35, 8, 4, 3.5, 0)
  m.building(12, -39, 12, 7, 3.6, 6)
  m.stairs(4.4, -36.6, 'e', 0, 3.6, 2.2, 1)
  m.deco('banner', 12, 2.6, -35.4)
  m.deco('flag', 18, 3.6, -40)
  m.deco('lantern', 7, 3.6, -36)
  m.deco('lantern', 17, 3.6, -36)
  for (const x of [-20, -17.7]) m.crate(x, -40, 1.3, 2)
  m.crate(-20, -40, 1.1, 2, 1.3)
  m.deco('sign', -8, 2.2, -43.6, { s: 1.6, style: 1 })
  m.deco('vending', 20, 0, -30, { yaw: YAW.w })
  m.deco('bench', -16, 0, -30, { yaw: YAW.e })

  // ------------------------------------------------------------------ tutorial track (west)
  m.anchor('tutorial1', -33, 0, -36)
  m.anchor('tutorial2', -33, 0, -27)
  m.deco('sign', -33, 1.8, -38, { yaw: 0, style: 2 })
  // Look: boards to aim the camera at, high and low.
  m.deco('sign', -41, 3.5, -27, { yaw: YAW.e, s: 1.5, style: 3 })
  m.deco('sign', -25.5, 6, -24, { yaw: YAW.w, s: 1.5, style: 3 })
  m.boxC('pillar', -25, -24, 0.6, 0.6, 0, 6)
  // Jump: a 1.2 m wooden ledge (steps on the side for the way down).
  m.box('platform', -38, 0, -22, -28, 1.2, -16, { style: 1 })
  m.stairs(-30.5, -16 + MapBuilder.run(0, 1.2), 's', 0, 1.2, 2.4, 1)
  m.anchor('tutorial3', -34, 1.2, -19)
  // Dash: two 2 m decks with a 3.5 m gap; stairs up to the first, down from the second.
  m.box('platform', -38, 0, -10, -28, 2, -5, { style: 1 })
  m.box('platform', -38, 0, -1.5, -28, 2, 4, { style: 1 })
  m.stairs(-35, -10 - MapBuilder.run(0, 2), 'n', 0, 2, 2.4, 1)
  m.stairs(-33, 4 + MapBuilder.run(0, 2), 's', 0, 2, 2.4, 1)
  m.anchor('tutorial4', -33, 2, 1)
  m.deco('cone', -38.5, 0, -3.2)
  m.deco('cone', -27.5, 0, -3.2)
  m.deco('sign', -36, 2, -9.6, { yaw: 0, style: 4 })

  // ------------------------------------------------------------------ shooting range (fires east)
  // Firing line: a low counter with gaps between the lanes, sandbags at both ends.
  for (const z of [-15, -5, 5, 15]) {
    m.box('wall', -20.6, 0, z - 3.2, -20, 1.0, z + 1.6, { style: 3 })
    m.deco('sign', -19.5, 1.0, z - 2.4, { yaw: YAW.e, style: 5, s: 0.6 })
    m.deco('lamp', -22, 0, z + 2.6, { yaw: YAW.e })
  }
  m.wallLine(-21, -21, -15, -21, 1.1, 0.9, 2)
  m.wallLine(-21, 21, -15, 21, 1.1, 0.9, 2)
  m.anchor('tutorial5', -22, 0, -3)
  m.anchor('tutorial6', -22, 0, 7)
  const lanes = [-15, -5, 5, 15]
  lanes.forEach((z, i) => {
    m.anchor(`target${i + 1}`, 0, 0, z)
    m.anchor(`target${i + 5}`, 18, 0, z)
    // Lane markers (visual only) and distance boards.
    m.deco('cone', 0, 0, z + 4.6)
    m.deco('cone', 18, 0, z + 4.6)
  })
  m.deco('sign', 0, 2.5, -20.5, { s: 1.2, style: 6 })
  m.deco('sign', 18, 2.5, -20.5, { s: 1.2, style: 7 })
  // Moving-target lanes between the static rows.
  m.path('mover1', [
    [9, 0, -19],
    [9, 0, 0],
    [9, 0, 19]
  ])
  m.path('mover2', [
    [22, 0, 19],
    [24, 0, 0],
    [22, 0, -19]
  ])
  // Backstop berm (with a walkway behind it via the north and south ends).
  m.box('wall', 27, 0, -20, 29, 4, 20, { style: 0 })
  m.deco('flag', 28, 4, -20)
  m.deco('flag', 28, 4, 20)

  // ------------------------------------------------------------------ north: climbing tower, pad demo, hook wall
  m.building(0, 34, 12, 12, 3, 0, 0, false)
  m.stairs(-7.2, 28, 'n', 0, 3, 2.2, 0)
  m.boxC('building', 0, 34, 8, 8, 3, 3.4, { style: 0 })
  m.stairs(-5, 29, 'e', 3, 6.4, 1.8, 0, 3)
  m.boxC('building', 0, 34, 4, 4, 6.4, 3.2, { style: 0 })
  m.stairs(-3.6, 37, 'e', 6.4, 9.6, 1.6, 0, 6.4)
  m.deco('flag', 0, 9.6, 34)
  m.pad(10, 0, 34, YAW.w)
  m.deco('sign', 12, 1.8, 30, { yaw: YAW.w, style: 8 })
  // Crate steps for jump practice on the east face.
  m.crate(7, 38, 1.2, 0)
  m.crate(8.2, 38, 1.2, 0)
  m.crate(7, 38, 1.2, 0, 1.2)
  // Hook wall with a pad in front.
  m.box('wall', -25, 0, 27, -23, 8, 37, { style: 0 })
  m.pad(-18.5, 0, 32, YAW.w)
  m.anchor('tutorial7', -16, 0, 28)
  m.deco('sign', -16, 1.8, 26, { yaw: 0, style: 9 })

  // ------------------------------------------------------------------ anima corner (north-east)
  m.anchor('tutorial8', 36, 0, 36)
  m.wallLine(30, 30, 40, 30, 1.1, 0.8, 2)
  m.wallLine(30, 30, 30, 34, 1.1, 0.8, 2)
  m.deco('crystalShard', 38, 0, 40, { s: 1.6 })
  m.deco('crystalShard', 41, 0, 37, { s: 1.2 })
  m.deco('sign', 34, 1.8, 41, { yaw: Math.PI, style: 10 })
  m.deco('banner', 40, 2.5, 43.8, { yaw: Math.PI })

  // ------------------------------------------------------------------ cover course and dummy squad (east)
  for (const [x, z] of [
    [34, 18],
    [39, 8],
    [33, -2],
    [40, -12]
  ]) {
    m.crate(x, z, 1.3, m.pick([0, 1]))
    m.crate(x + 1.3, z, 1.3, 0)
  }
  m.wallLine(31, 13, 35, 13, 1.1, 0.9, 2)
  m.wallLine(37, 3, 41, 3, 1.1, 0.9, 2)
  m.anchor('dummy', 34, 0, -32)
  m.wallLine(28, -24, 40, -24, 1.1, 0.9, 2)
  m.deco('sign', 34, 1.8, -24.6, { yaw: Math.PI, style: 11 })
  m.deco('bench', 41, 0, -36, { yaw: YAW.w })
  m.deco('banner', 42, 2.5, -30, { yaw: YAW.w })

  // Dressing.
  m.scatter(['grass', 'flowers', 'bush'], 40, -44, -44, 44, 44)
  for (const [x, z] of [
    [-42, -42],
    [-42, 42],
    [42, 42],
    [42, -42],
    [-26, -42],
    [26, 42]
  ])
    m.tree(x, z, 1, 1.1)
  for (let z = -40; z <= 40; z += 16) m.deco('lamp', -42.5, 0, z, { yaw: YAW.e })
  return m.build()
}

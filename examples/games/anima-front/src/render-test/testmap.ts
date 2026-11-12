/**
 * A test MapDef that contains every box kind/style and every decor kind (src/data/map-vocab.ts), laid out like a
 * small district so the environment can be reviewed and budgeted before the real maps exist. Pure.
 */
import { BOX_STYLES, DECOR_KINDS } from '../data/map-vocab'
import type { BoxKind, MapBox, MapDecor, MapDef, MapTheme, V3 } from '../sim/types'

const box = (kind: BoxKind, min: V3, max: V3, style = 0, solid = true): MapBox => ({ kind, min, max, style, solid })

export function buildTestMap(theme: MapTheme = 'day'): MapDef {
  const boxes: MapBox[] = []
  const decor: MapDecor[] = []
  const add = (b: MapBox) => boxes.push(b)
  const dec = (kind: string, p: V3, yaw = 0, s = 1, style = 0) => decor.push({ kind, p, yaw, s, style })
  let seed = 7
  const rand = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }

  // Ground: grass everywhere, with patches of every other ground style.
  add(box('ground', [-90, -0.5, -90], [90, 0, 90], 0))
  add(box('ground', [-22, 0, 14], [22, 0.05, 40], 3)) // plaza stones
  add(box('ground', [-88, 0, 52], [-50, 0.05, 88], 2)) // dirt lot
  add(box('ground', [50, 0, 52], [88, 0.05, 88], 1)) // concrete yard
  add(box('ground', [-88, 0, -88], [-56, 0.05, -60], 5)) // crystal crust
  add(box('ground', [56, 0, -88], [88, 0.05, -60], 6)) // virtual floor
  add(box('ground', [-90, -0.4, -60], [-80, 0.4, 50], 4)) // dock planks (west edge)
  add(box('ground', [-120, -1.2, -60], [-90, -0.6, 50], 7, false)) // water beyond the dock

  // Roads: an east-west avenue and a north-south street, sidewalks, crosswalks, a railway.
  add(box('road', [-80, 0, -6], [90, 0.04, 6], 0))
  add(box('road', [-6, 0, -90], [6, 0.04, 90], 0))
  add(box('road', [-80, 0, 6], [90, 0.18, 9], 1))
  add(box('road', [-80, 0, -9], [90, 0.18, -6], 1))
  add(box('road', [6, 0, -90], [9, 0.18, -9], 1))
  add(box('road', [-9, 0, 9], [-6, 0.18, 90], 1))
  add(box('road', [8, 0.04, -6], [12, 0.06, 6], 2))
  add(box('road', [-6, 0.04, 8], [6, 0.06, 12], 2))
  add(box('road', [85, 0, -90], [89.5, 0.1, 90], 3))

  // Buildings: every style along the avenue (north side styles 0–4, south side 5–9).
  const north = [0, 1, 2, 3, 4]
  // Five lots per side, leaving the plaza and the combat area (|x| < 24) open.
  const LOTS = [-84, -62, 26, 46, 66]
  north.forEach((style, i) => {
    const x = LOTS[i]
    const h = [16, 9, 20, 6, 12][i]
    add(box('building', [x, 0, 12], [x + 18, h, 26], style))
  })
  const south = [5, 6, 7, 8, 9]
  south.forEach((style, i) => {
    const x = LOTS[i]
    const h = [10, 6.5, 18, 13, 15][i]
    add(box('building', [x, 0, -28], [x + 18, h, -12], style))
  })
  // A second row of taller towers behind.
  for (let i = 0; i < 6; i++) {
    const x = -78 + i * 26
    add(box('building', [x, 0, 44], [x + 16, 14 + rand() * 18, 58], [0, 2, 8, 1, 4, 0][i]))
    add(box('building', [x, 0, -58], [x + 16, 10 + rand() * 14, -44], [8, 9, 5, 0, 2, 8][i]))
  }

  // Roofs (kiosks and sheds), every style.
  ;[0, 1, 2, 3].forEach((style, i) => {
    const x = 20 + i * 10
    add(box('wall', [x, 0, 30], [x + 6, 3, 30.3], 0))
    add(box('roof', [x - 0.5, 3, 29.5], [x + 6.5, 3.6, 36.5], style))
  })

  // Walls: every style in a row in the south-east.
  for (let style = 0; style <= 5; style++)
    add(box('wall', [14 + style * 7, 0, -40], [19 + style * 7, 1.6 + (style % 2) * 1.2, -39.4], style))
  // Platforms and stairs.
  for (let style = 0; style <= 3; style++) {
    const x = 14 + style * 11
    add(box('platform', [x, 3.6, -82], [x + 8, 4, -74], style))
    add(box('pillar', [x, 0, -82], [x + 0.6, 3.6, -81.4], style % 3))
    add(box('pillar', [x + 7.4, 0, -82], [x + 8, 3.6, -81.4], style % 3))
    add(box('stairs', [x, 0, -74], [x + 2.5, 4, -66], style))
  }
  // Crates, containers, cars, rocks, crystals.
  for (let style = 0; style <= 2; style++) {
    add(box('crate', [26 + style * 3, 0, 14], [27.4 + style * 3, 1.4, 15.4], style))
    add(box('crate', [26.5 + style * 3, 1.4, 14.2], [27.5 + style * 3, 2.4, 15.2], (style + 1) % 3))
  }
  for (let style = 0; style <= 5; style++) {
    const z = -58 + style * 4
    add(box('container', [-79, 0, z], [-73, 2.6, z + 2.5], style))
    if (style % 2 === 0) add(box('container', [-79, 2.6, z], [-73, 5.2, z + 2.5], (style + 3) % 6))
  }
  add(box('car', [-40, 0, -3.5], [-35.5, 1.5, -1.6], 0))
  add(box('car', [-20, 0, 1.5], [-15, 2.2, 3.6], 1))
  add(box('car', [30, 0, -4.8], [41, 3, -2.3], 2))
  add(box('car', [-3.2, 0, 30], [-1, 2, 35.5], 3))
  add(box('car', [50, 0, 1.2], [54.5, 1.5, 3.1], 0))
  add(box('rock', [-60, 0, 66], [-56, 2.6, 70], 0))
  add(box('rock', [-70, 0, 70], [-66, 1.6, 75], 1))
  add(box('crystal', [-80, 0, -84], [-76, 4, -80], 0))
  add(box('crystal', [-70, 0, -84], [-67, 12, -81], 1))
  add(box('crystal', [-62, 0, -82], [-58, 2.6, -78], 2))
  // Trees along the sidewalks, every style.
  for (let i = 0; i < 12; i++) {
    const x = -70 + i * 13
    const style = i < 6 ? 0 : [1, 2, 3, 4, 1, 0][i - 6]
    add(box('tree', [x, 0, 7.2], [x + 0.6, 6 + (i % 3), 7.8], style))
  }
  for (let style = 0; style <= 4; style++) add(box('tree', [60 + style * 5, 0, 60], [60.6 + style * 5, 7, 60.6], style))
  // Fences, pillars, barrier.
  for (let style = 0; style <= 3; style++)
    add(box('fence', [52, 0, 40 + style * 4], [66, 1.8, 40.15 + style * 4], style))
  for (let style = 0; style <= 2; style++)
    add(box('pillar', [-30 + style * 4, 0, 32], [-29.2 + style * 4, 6, 32.8], style))
  add(box('barrier', [-90, 0, -90], [90, 30, -89.5], 0))

  // Decor: every kind.
  for (let x = -76; x <= 86; x += 14) {
    dec('lamp', [x, 0.18, 8.4], Math.PI, 1, 0)
    dec('lamp', [x + 7, 0.18, -8.4], 0, 1, 0)
  }
  dec('lamp', [10, 0.05, 26], 0, 1, 1)
  dec('lamp', [-12, 0.05, 26], 0, 1, 1)
  for (let i = 0; i < 5; i++) dec('lantern', [-48 + i * 2.5, 0, -10.5], 0, 1, i)
  dec('lantern', [-44, 0, -32], 0, 1, 1)
  for (let i = 0; i < 4; i++) dec('sign', [-60 + i * 9, 0.18, 10.5], 0, 1, i)
  dec('vending', [-34, 0.18, 10.6], 0, 1, 0)
  dec('vending', [-33, 0.18, 10.6], 0, 1, 1)
  dec('vending', [15, 0.18, -10.6], Math.PI, 1, 2)
  for (let i = 0; i < 4; i++) dec('bench', [-14 + i * 8, 0.05, 36], Math.PI, 1, 0)
  for (let i = 0; i < 14; i++)
    dec('bush', [-20 + rand() * 40, 0.05, 15 + rand() * 24], rand() * 6, 0.8 + rand() * 0.6, i % 3)
  for (let i = 0; i < 260; i++)
    dec('grass', [-88 + rand() * 176, 0, 60 + rand() * 28], rand() * 6, 0.8 + rand() * 0.6, i % 3)
  for (let i = 0; i < 140; i++)
    dec('grass', [-88 + rand() * 176, 0, -86 + rand() * 24], rand() * 6, 0.8 + rand() * 0.6, i % 3)
  for (let i = 0; i < 60; i++)
    dec('flowers', [-20 + rand() * 40, 0.05, 14 + rand() * 26], rand() * 6, 0.8 + rand() * 0.4)
  for (let i = 0; i < 6; i++) dec('ivy', [-72 + i * 5, 0, 26], 0, 1 + rand(), 0)
  for (let i = 0; i < 10; i++) dec('moss', [-60 + rand() * 120, 0.06, -10 + rand() * 20], rand() * 6, 1 + rand())
  for (let i = 0; i < 30; i++)
    dec('debris', [-80 + rand() * 160, 0.05, -6 + rand() * 12], rand() * 6, 0.6 + rand(), i % 2)
  for (let i = 0; i < 8; i++) dec('trash', [-60 + i * 14, 0.18, -8], rand() * 6)
  for (let i = 0; i < 6; i++) dec('tire', [-76 + rand() * 20, 0, 66 + rand() * 18], rand() * 6, 1, i % 2)
  for (let i = 0; i < 10; i++) dec('cone', [16 + i * 1.6, 0.04, -4.5 + (i % 2) * 0.8], rand() * 6)
  for (let i = 0; i < 8; i++) dec('pole', [10.5, 0.18, -84 + i * 18], 0, 1, 0)
  dec('banner', [-6, 0, 38], 0, 1, 0)
  dec('banner', [6, 0, 38], 0, 1, 0)
  for (let i = 0; i < 4; i++) dec('flag', [-16 + i * 10, 0.05, 40], 0, 1, i)
  for (let i = 0; i < 6; i++) dec('puddle', [-50 + i * 18, 0.05, -2 + rand() * 4], 0, 0.7 + rand() * 0.8)
  dec('crane', [-84, 0.4, 36], Math.PI / 2, 1, 0)
  for (let i = 0; i < 4; i++) dec('buoy', [-100, -0.6, -40 + i * 22], 0, 1, i % 2)
  dec('rope', [-82, 0.4, 0], 0, 1)
  for (let i = 0; i < 8; i++) dec('bollard', [-89.4, 0.4, -50 + i * 12], 0, 1)
  for (let i = 0; i < 12; i++)
    dec('crystalShard', [-86 + rand() * 28, 0.05, -86 + rand() * 24], rand() * 6, 0.8 + rand(), i % 2)
  for (let i = 0; i < 6; i++) dec('pod', [-86 + rand() * 28, 0.05, -86 + rand() * 24], rand() * 6, 0.8 + rand() * 0.6)
  for (let i = 0; i < 4; i++) dec('tendril', [-80 + i * 6, 0.05, -76], rand() * 6, 1.2)
  dec('holo', [70, 0.05, -66], 0, 1, 0)
  dec('holo', [80, 0.05, -66], 0, 1, 1)
  for (let i = 0; i < 4; i++) dec('arrow', [62 + i * 6, 0.06, -80], 0, 1.5)
  dec('antenna', [-66, 20, 52], 0, 1)
  dec('watertank', [-40, 14, 50], 0, 1)
  dec('acunit', [-20, 14, 50], 0, 1)
  dec('cherryPetals', [-40, 0, 7.5], 0, 1)

  // Sanity: every kind and style is present (the tests assert this too).
  void BOX_STYLES
  void DECOR_KINDS

  const spawns = [0, 1, 2, 3].map((i) => ({ team: 'squad' as const, p: [-2 + i * 1.5, 0.05, 20] as V3, yaw: Math.PI }))
  return {
    id: 'range',
    name: 'レンダーテスト街区',
    theme,
    bounds: { min: [-90, -90], max: [90, 90] },
    boxes,
    spawns,
    bases: [{ team: 'squad', p: [0, 0.05, 26], r: 6 }],
    foeSpawns: [
      { id: 'n1', p: [0, 0, -70], tags: ['north'] },
      { id: 'a1', p: [20, 8, -50], air: true, tags: ['air'] }
    ],
    pads: [{ p: [12, 0.05, 20], yaw: 0 }],
    anchors: { lighthouse: [0, 0.05, 30], zoneA: [30, 0.05, 0], node1: [-60, 0.05, -70] },
    paths: {
      cart: [
        [-60, 0.05, 0],
        [0, 0.05, 0],
        [60, 0.05, 0]
      ]
    },
    decor
  }
}

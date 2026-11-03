import type { UnitType } from '../../tower_diffence_with_jev/src/game/model'
import type { MusicTrack } from './music'

export type CampaignUnit = {
  id: string
  name: string
  role: UnitType
  x: number
  y: number
  hp: number
  power: number
  range: number
  move: number
  level: number
  armor?: number
  ai: 'charge' | 'guard' | 'hold'
  boss?: boolean
}

export type Objective =
  | { type: 'rout' }
  | { type: 'boss' }
  | { type: 'seize'; x: number; y: number }
  | { type: 'survive'; turns: number }

export type Chapter = {
  name: string
  hint: string
  rocks: string[]
  groves: string[]
  palette: string
  deployment: { x: number; y: number }[]
  enemies: CampaignUnit[]
  objective: Objective
  music: MusicTrack
  recruits: string[]
}

const deployment = [
  { x: 1, y: 4 },
  { x: 1, y: 3 },
  { x: 1, y: 5 },
  { x: 0, y: 4 }
]
const enemy = (
  id: string,
  name: string,
  role: UnitType,
  x: number,
  y: number,
  hp: number,
  power: number,
  range: number,
  level: number,
  extra: Partial<CampaignUnit> = {}
): CampaignUnit => ({ id, name, role, x, y, hp, power, range, move: 3, level, ai: 'charge', ...extra })

export const campaign: Chapter[] = [
  {
    name: '01 峡谷の燈',
    hint: '中央の隘路か南北の外周を進む。',
    palette: 'canyon',
    deployment,
    rocks: ['4,1', '4,2', '4,3', '4,5', '4,6', '4,7', '4,8', '5,2', '5,7'],
    groves: ['2,3', '3,5', '2,7', '5,1', '5,8', '6,7'],
    enemies: [
      enemy('d', '灰牙', 'wolf', 6, 3, 10, 4, 1, 1),
      enemy('e', '煤の斥候', 'goblin', 6, 5, 10, 4, 1, 1),
      enemy('f', '霧番', 'goblin', 7, 4, 14, 5, 1, 2, { armor: 2 })
    ],
    objective: { type: 'rout' },
    music: 'ember-march',
    recruits: []
  },
  {
    name: '02 風抜けの水路',
    hint: '岩棚を抜け、両岸から迫る敵に備える。',
    palette: 'waterway',
    deployment,
    rocks: [
      '2,1',
      '3,1',
      '4,1',
      '6,1',
      '3,3',
      '5,3',
      '6,3',
      '3,5',
      '5,5',
      '6,5',
      '2,7',
      '3,7',
      '4,7',
      '6,7',
      '7,7',
      '5,8'
    ],
    groves: ['2,3', '4,2', '4,4', '4,6', '6,4', '6,8', '7,8'],
    enemies: [
      enemy('d', '灰牙', 'wolf', 6, 2, 11, 4, 1, 3),
      enemy('e', '煤の斥候', 'goblin', 6, 6, 11, 4, 1, 3),
      enemy('f', '霧番', 'goblin', 7, 4, 15, 5, 1, 4, { armor: 2 }),
      enemy('g', '風牙', 'wolf', 7, 1, 12, 4, 1, 3)
    ],
    objective: { type: 'rout' },
    music: 'ember-march',
    recruits: []
  },
  {
    name: '03 灰の環城',
    hint: '西門か北の破れ目から霧番を目指す。',
    palette: 'castle',
    deployment,
    rocks: ['3,1', '5,1', '6,1', '3,2', '3,3', '3,6', '3,7', '3,8', '4,8', '5,8', '6,8', '6,6', '6,7'],
    groves: ['2,3', '2,5', '4,3', '4,6', '5,4', '7,3', '7,7'],
    enemies: [
      enemy('d', '灰牙', 'wolf', 7, 2, 10, 2, 1, 5),
      enemy('e', '煤の斥候', 'goblin', 7, 6, 10, 2, 1, 5),
      enemy('f', '霧番', 'goblin', 8, 4, 15, 4, 1, 6, { armor: 2, boss: true, ai: 'guard' }),
      enemy('g', '風牙', 'wolf', 8, 0, 8, 2, 1, 5),
      enemy('h', '灰の射手', 'archer', 8, 8, 8, 2, 2, 6)
    ],
    objective: { type: 'boss' },
    music: 'ember-march',
    recruits: []
  },
  {
    name: '04 霧の湿原',
    hint: '祠を制圧するか、敵を全滅させる。',
    palette: 'marsh',
    deployment,
    rocks: ['3,1', '4,1', '6,2', '3,4', '6,5', '3,7', '4,8', '7,8'],
    groves: ['2,2', '2,6', '4,3', '5,6', '7,3', '8,7'],
    enemies: [
      enemy('d', '沼の雫', 'slime', 6, 3, 14, 4, 1, 7),
      enemy('e', '霧蝙蝠', 'bat', 7, 6, 10, 4, 1, 7),
      enemy('f', '沼の核', 'slime', 8, 4, 16, 5, 1, 8, { ai: 'guard' }),
      enemy('g', '夜蝙蝠', 'bat', 8, 1, 10, 4, 1, 7)
    ],
    objective: { type: 'seize', x: 8, y: 4 },
    music: 'moonlit-ward',
    recruits: ['healer']
  },
  {
    name: '05 骸の礼拝堂',
    hint: '押し寄せる敵から隊を守り抜く。',
    palette: 'chapel',
    deployment,
    rocks: ['3,2', '3,3', '3,6', '3,7', '6,1', '6,3', '6,6', '6,8'],
    groves: ['2,2', '2,7', '4,4', '4,5', '7,2', '7,7'],
    enemies: [
      enemy('d', '骸の影', 'wraith', 7, 2, 12, 5, 2, 9),
      enemy('e', '骸の祈祷師', 'shaman', 7, 7, 13, 5, 3, 9),
      enemy('f', '鎧虫', 'beetle', 6, 4, 18, 5, 1, 9, { armor: 2 }),
      enemy('g', '礼拝の影', 'wraith', 8, 5, 12, 5, 2, 9)
    ],
    objective: { type: 'survive', turns: 6 },
    music: 'moonlit-ward',
    recruits: []
  },
  {
    name: '06 灰の玉座',
    hint: '副官を突破し、灰竜を倒す。',
    palette: 'throne',
    deployment,
    rocks: ['3,1', '3,2', '3,7', '3,8', '5,2', '5,7', '7,1', '7,8'],
    groves: ['2,3', '2,6', '4,4', '4,5', '6,3', '6,6'],
    enemies: [
      enemy('d', '灰の副官', 'ogre', 6, 4, 22, 6, 1, 11, { armor: 2, ai: 'guard' }),
      enemy('e', '灰竜', 'dragon', 8, 4, 32, 7, 3, 12, { boss: true, ai: 'hold' }),
      enemy('f', '玉座の影', 'wraith', 8, 1, 13, 5, 2, 10),
      enemy('g', '玉座の牙', 'wolf', 7, 7, 14, 5, 1, 10)
    ],
    objective: { type: 'boss' },
    music: 'crown-of-embers',
    recruits: []
  }
]

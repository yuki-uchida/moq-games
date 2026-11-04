import { C, R } from './palette'
import { Raster, part, shadeEdges, type Ramp } from './raster'
import {
  ADULT_HEAD,
  CASUAL_ADULT,
  HAIR_KEY,
  hurtPoses,
  idlePoses,
  leatherShoe,
  planes,
  sneaker,
  walkPoses
} from './player'
import { LIE, SKIN, defaultHand, human, type Body, type HeadSpec, type Pose, type Pt } from './rig'
import type { Anim, Sheet } from './sheet'

/** The remaining life stages and the human enemies, all on the shared 3/4 rig. */

const anim = (frames: Raster[], fps: number, hold?: number[], loop = true): Anim => ({ frames, fps, loop, hold })
const BLACK: Ramp = [R.hair[1], R.hair[2], R.hair[3], R.hair[3], R.hair[4]]
const MUSTARD: Ramp = [R.yellow[1], R.yellow[2], R.brown[2], R.brown[3], R.brown[4]]
const BROWN_HAIR = { a: R.brown[0], H: R.brown[1], J: R.brown[2], j: R.brown[3] }
const GREYING = { a: R.metal[1], H: R.hair[2], J: R.hair[3], j: R.hair[3] }

// ---------------------------------------------------------------------------------------------
// Hair grids (head box coordinates −1). Each silhouette is distinct per stage.

const HAIR = {
  short: [
    '......jjjjjjj.......',
    '....jjHHHHHHHjj.....',
    '...jHHHaaaHHHHHj....',
    '..jHHaaHHHHHaHHHj...',
    '..jHHHHHHHHHHHHHHj..',
    '.jHHHHHHHHHHHHHHHHj.',
    '.jHHHHHHHHHHHHHHHHHj',
    '.jHHHJHHHJHHHJHHHHHj',
    '.jHHJ.JHJ..JHJ.JHHj.',
    '.jHJ.............Jj.',
    '.jj.................'
  ],
  styled: [
    '.....j..j..j.........',
    '....jHjjHjjHjj.......',
    '...jHHHaaHHaaHHj.....',
    '..jHHaaHHHHHHHHHj....',
    '.jHHHHHHHHHHHHHHHj...',
    '.jHHHHHHHHHHHHHHHHj..',
    'jHHHHHHHHHHHHHHHHHHj.',
    'jHHHJHHHHJHHHHJHHHHHj',
    'jHHJ.JHHJ.JHHJ.JHHHj.',
    'jHJ...JJ...JJ...JHJ..',
    'jJ...............j...',
    '.j...................'
  ],
  receding: [
    '....................',
    '.......j.j.j........',
    '......jHjHjHj.......',
    '.....jH.a.H.Hj......',
    '..jj..............jj',
    '.jHHj............jHj',
    '.jHHHj...........jHj',
    '.jHaHj............Hj',
    '.jHHj.............j.',
    '.jHj................',
    '.jj.................'
  ],
  perm: [
    '.....pPpPpPpPp.......',
    '...pPppppppppppPp....',
    '..pPpppPpppPppppPp...',
    '.pPppppppppppppppPp..',
    '.Ppppppp.pppp.ppppPp.',
    'pPpppp.........pppPp.',
    'Pppp............ppPp.',
    'Ppp..............pPp.',
    'pPp...............pP.',
    'Ppp...............pP.',
    'pPp...............Pp.',
    '.Pp...............pp.'
  ],
  long: [
    '......jjjjjjj........',
    '....jjHHHHHHHjj......',
    '...jHHHaaaHHHHHj.....',
    '..jHHaaHHHHHHHHHj....',
    '..jHHHHHHHHHHHHHHj...',
    '.jHHHHHHHHHHHHHHHHj..',
    '.jHHHHHHJHHHHJHHHHj..',
    '.jHHHHJ..JHJ..JHHHj..',
    '.jHHHJ..........JHHj.',
    '.jHHJ............JHj.',
    '.jHHJ............JHj.',
    '.jHHJ............JHj.',
    '.jHHJ.............Hj.',
    '.jHHJ.............j..',
    '.jHHJ................',
    '.jHHJ................',
    '.jHHJ................',
    '.jjjj................'
  ],
  toddlerHat: [
    '........WWWWWW..........',
    '......WWwwwwWWWW........',
    '.....WwwWWWWWWWWW.......',
    '....WwWWWWWWWWWWWW......',
    '....SSSSSSSSSSSSSSS.....',
    '..WWWWWWWWWWWWWWWWWWW...',
    '.WWgggggggggggggggggWW..',
    '..HH...............HH...',
    '..H.................H...'
  ]
}

const head = (p: Partial<HeadSpec> & Pick<HeadSpec, 'hair' | 'key'>): HeadSpec => ({
  w: 19,
  h: 18,
  hairAt: [-1, -1],
  eyes: 'adult',
  near: [6, 10],
  far: [14, 10],
  mouth: [10, 15],
  nose: [12, 13],
  ear: [0, 10],
  ...p
})

const glasses = (l: Raster, x: number, y: number) => {
  // Thin grey frames; the eyes show through the lenses.
  l.stamp(['gggg..ggg', 'g..gggg.g', 'gggg..ggg'], x + 5, y + 9, { g: R.metal[2] })
  l.set(x + 6, y + 9, R.paper[0])
}

/** A lying adult body whose coat and hair fit the stage. */
const lieShort = (coat: Ramp, key: Record<string, number> = HAIR_KEY, grid: readonly string[] = LIE.short) => ({
  thick: 10,
  coat,
  head: { grid, key }
})

// ---------------------------------------------------------------------------------------------
// 幼児期: a sky-blue kindergarten smock with a tulip name tag, a round-brim hat with a chin strap.

const TODDLER_HEAD: HeadSpec = head({
  w: 22,
  h: 20,
  hairAt: [-1, -3],
  hair: HAIR.toddlerHat,
  key: { W: R.paper[1], w: R.paper[0], g: R.paper[2], S: R.sky[1], H: R.hair[2] },
  eyes: 'kid',
  near: [6, 11],
  far: [15, 11],
  mouth: [11, 17],
  nose: [12, 15],
  ear: [0, 11],
  blush: true,
  extra: (l, x, y) => l.line(x + 2, y + 13, x + 8, y + 19, R.paper[2])
})

function redShoe(l: Raster, end: Pt) {
  const x = Math.round(end.x) - 2
  const y = Math.round(end.y)
  l.rect(x + 1, y - 1, 3, 1, R.paper[1])
  l.rect(x, y, 6, 2, R.red[1])
  l.rect(x + 1, y, 2, 1, R.red[0])
  l.rect(x, y + 2, 6, 1, R.red[3])
}

export const TODDLER: Body = {
  hip: 49,
  thigh: 3.5,
  shin: 3.5,
  legW: 4,
  gap: 3,
  torsoH: 11,
  span: 7,
  upper: 4,
  fore: 4,
  armW: 4,
  hang: [-1, 7],
  head: TODDLER_HEAD,
  headAt: [-11, -19],
  pants: SKIN,
  sleeve: R.sky,
  cuff: R.sky[0],
  shoe: redShoe,
  torso: (l, { hx, hy, top, lean: L }) => {
    // A-line smock over the hips, round white collar, the tulip name tag.
    l.poly([hx - 7 + L, top, hx + 7 + L, top, hx + 10, hy + 4, hx - 9, hy + 4], R.sky[1])
    planes(l, R.sky, R.sky[1], 1, 2)
    l.rect(hx - 9, hy + 3, 20, 1, R.sky[2])
    l.ellipse(hx + L + 0.5, top + 0.5, 5, 2, R.paper[0])
    l.ellipse(hx + L + 0.5, top + 0.5, 3, 1, R.sky[2])
    l.ellipse(hx + 4, top + 6, 2.6, 2.6, R.paper[0])
    l.stamp(['r.r', 'rrr', '.g.'], hx + 3, top + 4, { r: R.red[1], g: R.green[2] })
    l.line(hx - 6, hy, hx - 2, hy, R.sky[2])
  },
  lie: {
    thick: 9,
    coat: R.sky,
    head: { grid: LIE.fluffy, key: HAIR_KEY },
    beside: (r) => part(r, (l) => l.ellipse(58, 55, 6, 2.5, R.paper[1]))
  }
}

// ---------------------------------------------------------------------------------------------
// 中学生: a black 学ラン with gold buttons and a standing collar, short neat hair, a shoulder bag. Gangly.

export const JUNIOR: Body = {
  hip: 42,
  thigh: 7,
  shin: 7,
  legW: 4,
  gap: 3,
  torsoH: 15,
  span: 7,
  upper: 7,
  fore: 6,
  armW: 3,
  hang: [-1, 12],
  head: head({ hair: HAIR.short, key: HAIR_KEY }),
  headAt: [-9, -17],
  pants: BLACK,
  sleeve: BLACK,
  cuff: BLACK[0],
  shoe: leatherShoe,
  torso: (l, { hx, hy, top, lean: L }) => {
    l.poly(
      [hx - 8 + L, top + 2, hx - 5 + L, top, hx + 5 + L, top, hx + 8 + L, top + 2, hx + 7, hy + 2, hx - 7, hy + 2],
      BLACK[1]
    )
    planes(l, BLACK, BLACK[1], 1, 2)
    // Standing collar with a white rim, a centre seam and five gold buttons.
    l.rect(hx - 3 + L, top - 2, 7, 3, BLACK[2])
    l.rect(hx - 3 + L, top - 2, 7, 1, R.paper[0])
    l.line(hx + 1 + L, top + 1, hx + 1, hy + 2, BLACK[3])
    for (let k = 0; k < 5; k++) l.set(hx + 2 + Math.round((L * (4 - k)) / 4), top + 2 + k * 3, R.yellow[1])
    // Shoulder-bag strap across the chest.
    l.line(hx - 6 + L, top, hx + 7, hy - 1, R.navy[2])
    l.line(hx - 5 + L, top, hx + 7, hy, R.navy[1])
  },
  over: (r, { hx, hy, p }) =>
    part(r, (l) => {
      const y = hy - 3 + Math.max(-1, Math.min(1, p.lag))
      l.rect(hx + 5, y, 10, 8, R.navy[1])
      l.rect(hx + 5, y, 10, 4, R.navy[0])
      l.rect(hx + 9, y + 3, 2, 2, R.metal[1])
    }),
  lie: lieShort(BLACK)
}

// ---------------------------------------------------------------------------------------------
// 高校生: navy blazer, loosened tie, headphones around the neck, styled hair, a backpack.

const GREY_SLACKS: Ramp = [R.metal[1], R.metal[2], R.metal[3], R.hair[3], R.hair[4]]

export const HIGH: Body = {
  hip: 41,
  thigh: 7.5,
  shin: 7.5,
  legW: 4,
  gap: 3,
  torsoH: 15,
  span: 8,
  upper: 7,
  fore: 6,
  armW: 4,
  hang: [-1, 12],
  head: head({ hair: HAIR.styled, key: HAIR_KEY, hairAt: [-1, -2] }),
  headAt: [-9, -17],
  pants: GREY_SLACKS,
  sleeve: R.navy,
  cuff: R.paper[0],
  shoe: leatherShoe,
  behind: (r, { hx, top, lean: L, p }) =>
    part(r, (l) => {
      const y = top + Math.max(-1, Math.min(1, p.lag))
      l.rect(hx - 13 + L, y, 7, 13, BLACK[1])
      l.rect(hx - 13 + L, y, 7, 2, BLACK[0])
    }),
  torso: (l, { hx, hy, top, lean: L, p }) => {
    l.poly(
      [hx - 9 + L, top + 2, hx - 6 + L, top, hx + 6 + L, top, hx + 9 + L, top + 2, hx + 8, hy + 2, hx - 8, hy + 2],
      R.navy[1]
    )
    planes(l, R.navy, R.navy[1])
    // Open collar V with a loosened tie hanging low and askew, lapels, a school emblem.
    l.poly([hx - 2 + L, top, hx + 6 + L, top, hx + 2 + L, top + 9], R.paper[1])
    l.rect(hx + 2 + L, top + 3, 2, 2, R.red[1])
    for (let y = top + 5; y <= top + 11; y++) l.set(hx + 3 + L + (y > top + 8 ? Math.sign(p.lag) : 0), y, R.red[1])
    l.line(hx - 3 + L, top + 1, hx + 1 + L, top + 10, R.navy[0])
    l.line(hx + 7 + L, top + 1, hx + 3 + L, top + 10, R.navy[3])
    l.rect(hx - 6, top + 5, 3, 3, R.yellow[1])
    l.line(hx - 6 + L, top, hx - 6, top + 10, BLACK[1])
    // Headphones resting around the neck.
    l.line(hx - 4 + L, top - 1, hx + 5 + L, top - 1, BLACK[1])
    l.rect(hx - 6 + L, top - 2, 3, 4, BLACK[1])
    l.rect(hx + 5 + L, top - 2, 3, 4, BLACK[1])
    l.set(hx - 5 + L, top - 1, R.red[1])
  },
  lie: lieShort(R.navy, HAIR_KEY, LIE.fluffy)
}

// ---------------------------------------------------------------------------------------------
// 大学生: a mustard hoodie, jeans, white sneakers, a canvas tote, 茶髪, a phone in hand.

function whiteSneaker(l: Raster, end: Pt) {
  const x = Math.round(end.x) - 2
  const y = Math.round(end.y)
  l.rect(x, y, 6, 2, R.paper[1])
  l.rect(x + 1, y, 3, 1, R.paper[0])
  l.rect(x, y + 2, 6, 1, R.paper[3])
}

export const COLLEGE: Body = {
  hip: 41,
  thigh: 7.5,
  shin: 7.5,
  legW: 5,
  gap: 3,
  torsoH: 15,
  span: 8,
  upper: 7,
  fore: 6,
  armW: 4,
  hang: [-1, 12],
  head: head({ hair: HAIR.styled, key: BROWN_HAIR, hairAt: [-1, -2] }),
  headAt: [-9, -17],
  pants: R.navy,
  sleeve: MUSTARD,
  cuff: MUSTARD[2],
  shoe: whiteSneaker,
  torso: (l, { hx, hy, top, lean: L }) => {
    // Hood bunched around the neck, roomy body, drawstrings, kangaroo pocket, ribbed hem.
    l.ellipse(hx + L, top + 1, 9, 3, MUSTARD[2])
    l.poly(
      [hx - 9 + L, top + 2, hx - 7 + L, top, hx + 7 + L, top, hx + 9 + L, top + 2, hx + 9, hy + 1, hx - 9, hy + 1],
      MUSTARD[1]
    )
    planes(l, MUSTARD, MUSTARD[1])
    l.rect(hx - 9, hy, 19, 2, MUSTARD[2])
    l.line(hx - 1 + L, top + 1, hx - 1 + L, top + 6, R.paper[1])
    l.line(hx + 3 + L, top + 1, hx + 3 + L, top + 5, R.paper[1])
    l.poly([hx - 5, hy - 6, hx + 6, hy - 6, hx + 7, hy - 1, hx - 6, hy - 1], MUSTARD[2])
    l.line(hx - 5, hy - 6, hx + 6, hy - 6, MUSTARD[0])
  },
  over: (r, { hx, hy, top, lean: L, p }) => {
    // Canvas tote on the near shoulder.
    part(r, (l) => {
      const y = hy - 8 + Math.max(-1, Math.min(1, p.lag))
      l.rect(hx - 15, y, 8, 10, R.paper[1])
      l.rect(hx - 15, y, 8, 2, R.paper[0])
      l.rect(hx - 12, y + 4, 3, 3, R.green[2])
    })
    part(r, (l) => l.line(hx - 13, hy - 8, hx - 7 + L, top + 1, R.paper[2]), false)
  },
  farItem: (r, _f, hand) =>
    part(r, (l) => {
      l.rect(Math.round(hand.x) - 1, Math.round(hand.y) - 5, 3, 5, R.hair[2])
      l.set(Math.round(hand.x), Math.round(hand.y) - 4, C.glow)
      defaultHand(l, hand)
    }),
  lie: lieShort(MUSTARD, BROWN_HAIR, LIE.fluffy)
}

// ---------------------------------------------------------------------------------------------
// 働き盛り: a rumpled white shirt with rolled sleeves, loosened tie, jacket over the shoulder, stubble, tired eyes.

const PRIME_HEAD: HeadSpec = {
  ...ADULT_HEAD,
  extra: (l, x, y, face) => {
    if (face === 'none') return
    // Eye bags and stubble.
    l.paint(x + 6, y + 13, R.skin[3])
    l.paint(x + 7, y + 13, R.skin[3])
    l.paint(x + 14, y + 13, R.skin[3])
    for (const [dx, dy] of [
      [7, 16],
      [9, 17],
      [11, 16],
      [13, 16],
      [12, 17],
      [8, 15],
      [14, 15]
    ])
      l.paint(x + dx, y + dy, R.skin[2])
  }
}

export const PRIME: Body = {
  hip: 40,
  thigh: 8,
  shin: 7.6,
  legW: 5,
  gap: 3,
  torsoH: 15,
  span: 8,
  upper: 7,
  fore: 6,
  armW: 4,
  hang: [-1, 12],
  head: PRIME_HEAD,
  headAt: [-9, -17],
  pants: R.navy,
  sleeve: R.paper,
  shortSleeve: true,
  shoe: leatherShoe,
  behind: (r, { hx, top, hy, lean: L, p }) =>
    // The jacket slung over the far shoulder hangs down the back.
    part(r, (l) => {
      const sw = Math.sign(p.lag)
      l.poly([hx + 4 + L, top - 1, hx + 9 + L, top - 1, hx + 13 + sw, hy - 2, hx + 7 + sw, hy], R.navy[1])
      shadeEdges(l, R.navy, 1, true)
    }),
  torso: (l, { hx, hy, top, lean: L, p }) => {
    l.rect(hx - 2 + L, top - 3, 5, 4, SKIN[2])
    l.poly(
      [
        hx - 8 + L,
        top + 2,
        hx - 6 + L,
        top,
        hx + 6 + L,
        top,
        hx + 8 + L,
        top + 2,
        hx + 9,
        hy,
        hx + 9,
        hy + 1,
        hx - 9,
        hy + 1,
        hx - 9,
        hy
      ],
      R.paper[1]
    )
    planes(l, R.paper, R.paper[1])
    // Rumples, loosened tie askew, belt.
    for (const [x, y] of [
      [-5, 5],
      [4, 8],
      [-3, 10],
      [5, 12]
    ])
      l.line(hx + x + L, top + y, hx + x + 2, top + y + 1, R.paper[2])
    l.rect(hx + 1 + L, top + 2, 2, 2, R.red[1])
    for (let y = top + 4; y <= top + 11; y++)
      l.set(hx + 2 + L + (y > top + 7 ? 1 + Math.sign(p.lag) : 0), y, y % 2 ? R.red[1] : R.red[2])
    l.rect(hx - 9, hy - 1, 19, 2, R.brown[2])
    l.set(hx + 1, hy - 1, R.yellow[1])
  },
  lie: lieShort(R.paper)
}

// ---------------------------------------------------------------------------------------------
// 中年: receding hairline, glasses, a pot belly in a green polo, khaki slacks.

export const MIDDLE: Body = {
  hip: 41,
  thigh: 7.5,
  shin: 7.5,
  legW: 5,
  gap: 3,
  torsoH: 15,
  span: 9,
  upper: 7,
  fore: 6,
  armW: 4,
  hang: [-1, 12],
  head: head({ hair: HAIR.receding, key: GREYING, extra: glasses }),
  headAt: [-9, -17],
  pants: R.brown,
  sleeve: R.green,
  shortSleeve: true,
  shoe: leatherShoe,
  torso: (l, { hx, hy, top, lean: L, p }) => {
    const t = Math.round(p.thin * 3)
    l.poly(
      [
        hx - 9 + L,
        top + 2,
        hx - 6 + L,
        top,
        hx + 6 + L,
        top,
        hx + 9 + L,
        top + 2,
        hx + 10,
        hy,
        hx + 9,
        hy + 2,
        hx - 9,
        hy + 2
      ],
      R.green[1]
    )
    l.ellipse(hx + 3, hy - 4, 9 - t, 6, R.green[1])
    planes(l, R.green, R.green[1])
    // Polo collar flaps and placket; the belly strains the belt.
    l.poly([hx - 3 + L, top - 1, hx + L, top + 3, hx - 4 + L, top + 2], R.green[0])
    l.poly([hx + 4 + L, top - 1, hx + 1 + L, top + 3, hx + 5 + L, top + 2], R.green[2])
    l.line(hx + 1 + L, top + 2, hx + 1 + L, top + 6, R.green[2])
    l.set(hx + 2 + L, top + 3, R.paper[0])
    l.set(hx + 2 + L, top + 5, R.paper[0])
    l.rect(hx - 9, hy + 1, 20, 2, R.brown[3])
    l.line(hx - 2, hy - 2, hx + 8, hy - 2, R.green[2])
  },
  lie: lieShort(R.green, GREYING, LIE.receding)
}

// ---------------------------------------------------------------------------------------------
// Human enemies (64×64, each in its Tag colour).

/** 教師 (人間関係): a stern teacher in an orange tracksuit with a whistle and a pointer stick, glasses. */
const TEACHER: Body = {
  ...MIDDLE,
  span: 8,
  head: head({ hair: HAIR.short, key: GREYING, extra: glasses }),
  pants: R.orange,
  sleeve: R.orange,
  shortSleeve: false,
  cuff: R.paper[0],
  shoe: whiteSneaker,
  torso: (l, { hx, hy, top, lean: L }) => {
    l.poly(
      [hx - 8 + L, top + 2, hx - 6 + L, top, hx + 6 + L, top, hx + 8 + L, top + 2, hx + 8, hy + 2, hx - 8, hy + 2],
      R.orange[1]
    )
    planes(l, R.orange, R.orange[1])
    l.line(hx + 1 + L, top, hx + 1, hy + 2, R.paper[0])
    l.rect(hx - 2 + L, top - 1, 6, 2, R.orange[2])
    l.line(hx - 4 + L, top, hx + 1 + L, top + 7, R.paper[2])
    l.line(hx + 6 + L, top, hx + 1 + L, top + 7, R.paper[2])
    l.rect(hx + L, top + 7, 3, 2, R.metal[1])
    l.set(hx + L, top + 7, R.metal[0])
  },
  item: (r, { p }, hand) =>
    part(r, (l) => {
      const tap = p.lag > 0 ? 2 : 0
      l.line(hand.x, hand.y, hand.x + 12, hand.y - 8 + tap, R.brown[1])
      defaultHand(l, hand)
    }),
  lie: lieShort(R.orange)
}

/** スポーツ: a PE senior in a green jersey and white headband, whistle, sweat, jogging hard. */
const CLUB: Body = {
  ...JUNIOR,
  head: head({
    hair: HAIR.short,
    key: HAIR_KEY,
    extra: (l, x, y) => {
      l.rect(x, y + 5, 19, 2, R.paper[0])
      l.rect(x, y + 6, 19, 1, R.paper[2])
    }
  }),
  armW: 4,
  pants: SKIN,
  sleeve: R.green,
  shortSleeve: true,
  cuff: undefined,
  shoe: whiteSneaker,
  over: undefined,
  torso: (l, { hx, hy, top, lean: L }) => {
    l.poly(
      [hx - 6, hy - 2, hx + 7, hy - 2, hx + 7, hy + 3, hx + 1, hy + 3, hx, hy + 1, hx - 1, hy + 3, hx - 6, hy + 3],
      R.paper[1]
    )
    l.poly(
      [hx - 8 + L, top + 2, hx - 5 + L, top, hx + 5 + L, top, hx + 8 + L, top + 2, hx + 7, hy, hx - 7, hy],
      R.green[1]
    )
    planes(l, R.green, R.green[1])
    l.stamp(['ww.www', '.w...w', '.w.www', '.w.w..', 'www.ww'], hx - 2, top + 4, { w: R.paper[0] })
    l.line(hx - 3 + L, top, hx + L, top + 4, R.paper[2])
    l.rect(hx + L, top + 4, 2, 2, R.metal[1])
  },
  lie: lieShort(R.green)
}

/** 彼女 (恋愛): a stylish young woman in a pink dress with a handbag and shopping bags. Not sexualised. */
const GIRLFRIEND: Body = {
  ...HIGH,
  span: 7,
  armW: 3,
  legW: 4,
  head: head({ hair: HAIR.long, key: BROWN_HAIR, eyes: 'kid', near: [5, 10], far: [14, 10], blush: true }),
  pants: SKIN,
  sleeve: R.pink,
  shortSleeve: true,
  cuff: undefined,
  shoe: (l, end) => {
    const x = Math.round(end.x) - 1
    l.rect(x, Math.round(end.y) + 1, 4, 2, R.red[2])
    l.set(x + 3, Math.round(end.y) + 2, R.red[3])
  },
  behind: undefined,
  torso: (l, { hx, hy, top, lean: L }) => {
    // A-line dress to the knee with a bow at the waist.
    l.poly(
      [hx - 6 + L, top, hx + 6 + L, top, hx + 7, hy - 3, hx + 11, hy + 7, hx - 10, hy + 7, hx - 6, hy - 3],
      R.pink[1]
    )
    planes(l, R.pink, R.pink[1], 1, 2)
    l.rect(hx - 6, hy - 3, 13, 1, R.pink[2])
    l.stamp(['p.p', '.P.', 'p.p'], hx, hy - 4, { p: R.pink[0], P: R.pink[2] })
    l.line(hx - 4, hy + 6, hx - 2, hy, R.pink[2])
    l.line(hx + 5, hy + 6, hx + 3, hy, R.pink[2])
    l.ellipse(hx + L + 0.5, top, 3, 1.2, SKIN[1])
  },
  item: (r, _f, hand) =>
    part(r, (l) => {
      l.rect(Math.round(hand.x) - 3, Math.round(hand.y) + 2, 7, 5, R.pink[2])
      l.line(hand.x - 2, hand.y + 2, hand.x, hand.y, R.pink[3])
      defaultHand(l, hand)
    }),
  farItem: (r, { p }, hand) =>
    part(r, (l) => {
      const sw = Math.sign(p.lag)
      l.rect(Math.round(hand.x) - 2 + sw, Math.round(hand.y) + 2, 8, 9, R.paper[1])
      l.rect(Math.round(hand.x) - 2 + sw, Math.round(hand.y) + 2, 8, 2, R.red[1])
      l.rect(Math.round(hand.x) + 3 + sw, Math.round(hand.y) + 5, 6, 7, R.yellow[1])
      defaultHand(l, hand)
    }),
  over: (r, { p }) =>
    part(r, (l) => {
      const k = (p.lag + 2) % 3
      for (const [x, y] of [
        [46, 18 - k * 3],
        [14, 26 - k * 2]
      ])
        l.stamp(['p.p', 'ppp', '.p.'], x, y, { p: R.pink[1] })
    }),
  lie: { thick: 9, coat: R.pink, head: { grid: LIE.fluffy, key: BROWN_HAIR } }
}

/** 上司 (人間関係): a heavy middle-aged boss in a grey suit, comb-over, red angry face with steam, pointing. */
const BOSS: Body = {
  ...MIDDLE,
  span: 9,
  head: head({ hair: HAIR.receding, key: GREYING }),
  pants: R.metal,
  sleeve: R.metal,
  shortSleeve: false,
  cuff: R.paper[0],
  torso: (l, { hx, hy, top, lean: L }) => {
    l.poly(
      [
        hx - 9 + L,
        top + 2,
        hx - 6 + L,
        top,
        hx + 6 + L,
        top,
        hx + 9 + L,
        top + 2,
        hx + 10,
        hy,
        hx + 9,
        hy + 2,
        hx - 9,
        hy + 2
      ],
      R.metal[1]
    )
    l.ellipse(hx + 3, hy - 4, 9, 6, R.metal[1])
    planes(l, R.metal, R.metal[1])
    l.poly([hx - 1 + L, top, hx + 5 + L, top, hx + 2 + L, top + 8], R.paper[1])
    l.rect(hx + 1 + L, top + 1, 2, 9, R.orange[1])
    l.line(hx - 2 + L, top + 1, hx + 1 + L, top + 9, R.metal[0])
    l.line(hx + 6 + L, top + 1, hx + 3 + L, top + 9, R.metal[3])
  },
  over: (r, { p }) =>
    // Steam puffs off the head.
    part(r, (l) => {
      const k = Math.abs(p.lag) % 3
      for (const [x, s] of [
        [20 - k, -1],
        [46 + k, 1]
      ]) {
        l.ellipse(x, 7 - k, 3 + k * 0.6, 2.4 + k * 0.4, R.paper[1])
        l.ellipse(x + s * 3, 5 - k, 2.2, 1.8, R.paper[0])
      }
    }),
  lie: lieShort(R.metal, GREYING, LIE.receding)
}

/** 噂話 (悪口): a perm-haired neighbourhood lady in an apron, hand over her mouth, side-eye, a shopping bag. */
const GOSSIP: Body = {
  ...MIDDLE,
  span: 8,
  head: head({
    hair: HAIR.perm,
    key: { p: R.purple[1], P: R.purple[2] },
    hairAt: [-1, -3],
    extra: (l, x, y, face) => {
      // Tight perm curls: a bumpy silhouette of lit little balls over the crown and sides.
      for (let a = Math.PI * 0.95; a <= Math.PI * 2.05; a += 0.32) {
        const cx = x + 9.5 + Math.cos(a) * 11
        const cy = y + 7 + Math.sin(a) * 9.5
        l.ellipse(cx, cy, 2.6, 2.6, R.purple[1])
        l.set(Math.round(cx) - 1, Math.round(cy) - 1, R.purple[0])
        l.set(Math.round(cx) + 1, Math.round(cy) + 1, R.purple[2])
      }
      if (face === 'none') return
      // Side-eye: pupils slid toward the facing side.
      l.stamp(['ww', 'wK'], x + 6, y + 10)
      l.paint(x + 6, y + 11, R.paper[0])
    }
  }),
  pants: R.purple,
  sleeve: R.purple,
  shortSleeve: true,
  torso: (l, { hx, hy, top, lean: L }) => {
    l.poly(
      [hx - 8 + L, top + 2, hx - 6 + L, top, hx + 6 + L, top, hx + 8 + L, top + 2, hx + 9, hy + 3, hx - 9, hy + 3],
      R.purple[1]
    )
    planes(l, R.purple, R.purple[1])
    // Apron with a dotted pattern and a pocket.
    l.poly([hx - 6 + L, top + 2, hx + 6 + L, top + 2, hx + 7, hy + 3, hx - 7, hy + 3], R.paper[1])
    for (let y = top + 4; y < hy + 2; y += 3) for (let x = hx - 5; x < hx + 6; x += 3) l.set(x + (y % 2), y, R.pink[1])
    l.rect(hx - 3, hy - 3, 6, 3, R.paper[2])
  },
  over: (r, { p }) =>
    // Whisper dots.
    part(
      r,
      (l) => {
        const k = Math.abs(p.lag) % 3
        for (let d = 0; d <= k; d++) l.rect(44 + d * 3, 20 - d, 2, 2, R.purple[2])
      },
      false
    ),
  farItem: (r, _f, hand) =>
    part(r, (l) => {
      l.rect(Math.round(hand.x) - 3, Math.round(hand.y) + 1, 8, 9, R.paper[1])
      l.line(hand.x + 2, hand.y + 1, hand.x + 5, hand.y - 6, R.green[1])
      l.line(hand.x + 3, hand.y + 1, hand.x + 6, hand.y - 6, R.green[2])
      defaultHand(l, hand)
    }),
  lie: {
    thick: 10,
    coat: R.purple,
    head: { grid: LIE.fluffy, key: { H: R.purple[1], J: R.purple[2], a: R.purple[0] } }
  }
}

/** 子供 (子育て): a small hyperactive child sprinting with a toy sword, a mischievous grin. */
const KIDDO: Body = {
  ...TODDLER,
  head: head({
    w: 22,
    h: 20,
    hair: HAIR.styled,
    key: HAIR_KEY,
    hairAt: [0, -2],
    eyes: 'kid',
    near: [6, 10],
    far: [15, 10],
    mouth: [10, 16],
    ear: [0, 10],
    blush: true,
    extra: (l, x, y, face) => {
      if (face !== 'none') l.stamp(['K....K', '.KwwK.'], x + 9, y + 15)
    }
  }),
  headAt: [-11, -19],
  sleeve: R.orange,
  shortSleeve: true,
  cuff: undefined,
  shoe: sneaker,
  torso: (l, { hx, hy, top, lean: L }) => {
    l.poly(
      [hx - 6, hy - 2, hx + 6, hy - 2, hx + 6, hy + 3, hx + 1, hy + 3, hx, hy + 1, hx - 1, hy + 3, hx - 6, hy + 3],
      R.navy[1]
    )
    l.poly(
      [hx - 7 + L, top + 2, hx - 5 + L, top, hx + 5 + L, top, hx + 7 + L, top + 2, hx + 6, hy, hx - 6, hy],
      R.orange[1]
    )
    planes(l, R.orange, R.orange[1])
    l.stamp(['.y.', 'yyy', '.y.'], hx, top + 4, { y: R.yellow[1] })
  },
  farItem: (r, _f, hand) =>
    part(r, (l) => {
      l.rect(Math.round(hand.x) - 3, Math.round(hand.y) - 1, 7, 2, R.yellow[2])
      l.thick(hand.x, hand.y - 2, hand.x + 3, hand.y - 16, 2, R.metal[0])
      l.line(hand.x + 1, hand.y - 3, hand.x + 4, hand.y - 16, R.metal[1])
      defaultHand(l, hand)
    }),
  lie: { thick: 9, coat: R.orange, head: { grid: LIE.fluffy, key: HAIR_KEY } }
}

// ---------------------------------------------------------------------------------------------
// Sheets.

const playerSheet = (
  b: Body,
  o: {
    walk?: Parameters<typeof walkPoses>[0]
    idle?: Partial<Pose>
    fps?: number
    mod?: (p: Pose, i: number) => Pose
  } = {}
): Sheet => {
  const mod = o.mod ?? ((p: Pose) => p)
  return {
    idle: anim(
      idlePoses(o.idle).map((p, i) => human(b, mod(p, i))),
      6,
      [3, 2, 3, 1]
    ),
    walk: anim(
      walkPoses(o.walk).map((p, i) => human(b, mod(p, i))),
      o.fps ?? 11
    ),
    hurt: anim(
      hurtPoses().map((p, i) => human(b, mod(p, i))),
      8,
      undefined,
      false
    )
  }
}

export const toddler = (p: Pose) => human(TODDLER, p)
export const junior = (p: Pose) => human(JUNIOR, p)
export const high = (p: Pose) => human(HIGH, p)
export const college = (p: Pose) => human(COLLEGE, p)
export const CASUAL_PRIME: Body = {
  ...PRIME,
  sleeve: R.sky,
  shortSleeve: false,
  shoe: sneaker,
  behind: undefined,
  torso: CASUAL_ADULT.torso,
  lie: { ...PRIME.lie, coat: R.sky }
}
export const prime = (p: Pose) => human(CASUAL_PRIME, { ...p, handF: p.handF && p.item ? [-4, -1] : p.handF })
export const middle = (p: Pose) => human(MIDDLE, p)

export const peopleSheets: Record<string, () => Sheet> = {
  // Toddler waddle: short wide steps, the whole body rocking side to side.
  'player:toddler': () =>
    playerSheet(TODDLER, {
      walk: { scale: 0.6, hangY: 7 },
      fps: 10,
      mod: (p, i) => ({ ...p, x: [0, 1, 1, 0, -1, -1][i % 6], lean: [1, 0, -1, -1, 0, 1][i % 6] })
    }),
  'player:junior': () => playerSheet(JUNIOR, { walk: { swing: 0.9 } }),
  'player:high': () => playerSheet(HIGH, { walk: { swing: 0.5 } }),
  'player:college': () => playerSheet(COLLEGE, { walk: {}, mod: (p) => ({ ...p, handF: [0, 7] }) }),
  'player:prime': () =>
    playerSheet(CASUAL_PRIME, { walk: { swing: 0.5 }, mod: (p) => ({ ...p, handF: [-4, -1], head: [0, 1] }) }),
  'player:middle': () => playerSheet(MIDDLE, { walk: { swing: 0.6, scale: 0.85 }, fps: 9 }),
  'enemy:teacher': () => ({
    move: anim(
      walkPoses({ swing: 0.4 }).map((p) => human(TEACHER, { ...p, face: 'angry', handN: [4, 6] })),
      9
    )
  }),
  'enemy:club': () => ({
    move: anim(
      walkPoses({ scale: 1.3 }).map((p, i) =>
        human(CLUB, {
          ...p,
          lean: 2,
          handN: [i % 3 === 0 ? 4 : -4, 6],
          handF: [i % 3 === 0 ? -4 : 4, 6],
          face: i % 2 ? 'pain' : 'open',
          tear: i % 3 === 1
        })
      ),
      14
    )
  }),
  'enemy:girlfriend': () => ({
    move: anim(
      walkPoses({ scale: 0.8, swing: 0.3 }).map((p, i) =>
        human(GIRLFRIEND, { ...p, lean: [1, 0, -1, 1, 0, -1][i], lag: i, face: i === 4 ? 'blink' : 'open' })
      ),
      10
    )
  }),
  'enemy:temptation': () => ({
    move: anim(
      walkPoses({ scale: 0.8, swing: 0.3 }).map((pose, index) =>
        human(
          {
            ...PRIME,
            head: head({ hair: HAIR.styled, key: BROWN_HAIR }),
            behind: undefined,
            sleeve: R.navy,
            shortSleeve: false,
            torso: (layer, { hx, hy, top, lean }) => {
              layer.poly([hx - 8 + lean, top, hx + 8 + lean, top, hx + 9, hy, hx - 9, hy], R.navy[1])
              planes(layer, R.navy, R.navy[1])
              layer.poly([hx - 3 + lean, top, hx + 3 + lean, top, hx + lean, top + 9], R.paper[1])
              layer.rect(hx + lean, top + 2, 2, 7, R.red[1])
            }
          },
          { ...pose, face: index === 4 ? 'blink' : 'open' }
        )
      ),
      10
    )
  }),
  'enemy:boss': () => {
    // A red face: the boss's skin runs hot.
    const hot = new Map([
      [R.skin[1], R.orange[0]],
      [R.skin[2], R.orange[1]],
      [R.skin[0], R.skin[1]]
    ])
    return {
      move: anim(
        walkPoses({ scale: 0.8, swing: 0.3 }).map((p, i) =>
          human(BOSS, {
            ...p,
            bob: p.bob + (i % 3 === 0 ? 1 : 0),
            face: 'angry',
            handF: [8, -3 + (i % 2)],
            lag: i
          }).map((c, _x, y) => (y < 30 ? (hot.get(c) ?? c) : c))
        ),
        8
      )
    }
  },
  'enemy:gossip': () => ({
    move: anim(
      walkPoses({ scale: 0.6, swing: 0.3 }).map((p, i) =>
        human(GOSSIP, { ...p, handN: [8, -4], handF: [1, 10], lag: i, face: 'open' })
      ),
      8
    )
  }),
  'enemy:kid': () => ({
    move: anim(
      walkPoses({ scale: 1.4, hangY: 7 }).map((p, i) =>
        human(KIDDO, { ...p, lean: 3, handF: [2, -2 + (i % 2) * 2], face: 'open' })
      ),
      15
    )
  })
}

export const STAGE_BODIES: Record<string, Body> = {
  toddler: TODDLER,
  junior: JUNIOR,
  high: HIGH,
  college: COLLEGE,
  prime: CASUAL_PRIME,
  middle: MIDDLE
}
export const STAGE_PAINTERS: Record<string, (p: Pose) => Raster> = { toddler, junior, high, college, prime, middle }

import { R } from './palette'
import { Raster, ball, part, shadeEdges, type Ramp } from './raster'
import {
  GROUND,
  LIE,
  SIZE,
  SKIN,
  defaultHand,
  drawHead,
  human,
  limb,
  pose,
  type Body,
  type Face,
  type HeadSpec,
  type Pose,
  type Pt
} from './rig'
import type { Anim, Sheet } from './sheet'

const anim = (frames: Raster[], fps: number, hold?: number[], loop = true): Anim => ({ frames, fps, loop, hold })

/** Black hair: three dark tones plus a cool highlight band. */
export const HAIR_KEY = { a: R.hair[1], A: R.hair[0], H: R.hair[2], J: R.hair[3], j: R.hair[3] }

// ---------------------------------------------------------------------------------------------
// 社会人: fresh employee — navy suit with lapels and white collar V, red tie, briefcase, side-parted hair.

export const ADULT_HEAD: HeadSpec = {
  w: 19,
  h: 18,
  hairAt: [-1, -1],
  hair: [
    '......jjjjjjjj.......',
    '....jjHHHHHHHHjj.....',
    '...jHHHaaAaaHHHHj....',
    '..jHHaaHHHHHaaHHHj...',
    '..jHaHHHHHHHHHHaHHj..',
    '.jHHHHHHHHHHHHHHHHHj.',
    '.jHHHHHHHHJjHHHHHHHHj',
    '.jHHHHHHHJ...JHHHHHHj',
    '.jHHHHHJ......JHHHHHf',
    '.jHHHJ.........JHHJff',
    '.jHHJ...........JJ.f.',
    '.jHJ.................',
    '.jJ..................'
  ],
  key: HAIR_KEY,
  eyes: 'adult',
  near: [6, 10],
  far: [14, 10],
  mouth: [10, 15],
  nose: [12, 13],
  ear: [0, 10]
}

const SUIT = R.navy
const BLACK: Ramp = [R.hair[1], R.hair[2], R.hair[3], R.hair[3], R.hair[4]]

export function leatherShoe(l: Raster, end: Pt) {
  const x = Math.round(end.x) - 2
  const y = Math.round(end.y)
  l.rect(x, y, 6, 3, BLACK[1])
  l.rect(x, y + 2, 6, 1, BLACK[2])
  l.rect(x + 1, y, 3, 1, BLACK[0])
}

/** Per-row plane shading: a lit sliver on the left, shade on the right, a darker hem. */
export function planes(l: Raster, ramp: Ramp, base: number, lit = 1, shade = 2) {
  for (let y = 0; y < l.h; y++) {
    let first = -1
    let last = -1
    for (let x = 0; x < l.w; x++)
      if (l.get(x, y) === base) {
        if (first < 0) first = x
        last = x
      }
    if (first < 0) continue
    for (let i = 0; i < lit; i++) if (l.get(first + i, y) === base) l.set(first + i, y, ramp[0])
    for (let i = 0; i < shade; i++) if (l.get(last - i, y) === base) l.set(last - i, y, ramp[2])
  }
}

export const ADULT: Body = {
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
  head: ADULT_HEAD,
  headAt: [-9, -17],
  pants: SUIT,
  sleeve: SUIT,
  cuff: R.paper[0],
  shoe: leatherShoe,
  torso: (l, { hx, hy, top, lean: L, p }) => {
    const t = Math.round(p.thin * 3)
    l.rect(hx - 2 + L, top - 3, 5, 4, SKIN[2])
    l.poly(
      [
        hx - 9 + L + t,
        top + 2,
        hx - 6 + L + t,
        top,
        hx + 6 + L - t,
        top,
        hx + 9 + L - t,
        top + 2,
        hx + 8 - t,
        hy,
        hx + 8 - t,
        hy + 2,
        hx - 8 + t,
        hy + 2,
        hx - 8 + t,
        hy
      ],
      SUIT[1]
    )
    planes(l, SUIT, SUIT[1])
    l.rect(hx - 8 + t, hy + 1, 17 - 2 * t, 1, SUIT[2])
    // Shirt collar V, lapels (lit left, shaded right), tie knot and blade (the blade's tip lags).
    l.poly([hx - 1 + L, top, hx + 5 + L, top, hx + 2 + L, top + 8], R.paper[1])
    l.set(hx - 1 + L, top, R.paper[0])
    l.set(hx + 4 + L, top, R.paper[0])
    l.line(hx - 2 + L, top + 1, hx + 1 + L, top + 9, SUIT[0])
    l.line(hx + 6 + L, top + 1, hx + 3 + L, top + 9, SUIT[3])
    l.rect(hx + 1 + L, top + 1, 2, 2, R.red[1])
    l.set(hx + 1 + L, top + 1, R.red[0])
    for (let y = top + 3; y <= top + 11; y++) {
      const sway = y > top + 7 ? Math.sign(p.lag) : 0
      l.set(hx + 1 + L + sway, y, R.red[1])
      l.set(hx + 2 + L + sway, y, R.red[2])
    }
    // Front opening, buttons, waist folds and pocket flaps.
    l.line(hx + 2 + L, top + 12, hx + 3, hy + 1, SUIT[3])
    l.set(hx + 4, hy - 4, SUIT[0])
    l.set(hx + 4, hy - 1, SUIT[0])
    l.rect(hx - 6 + t, hy - 3, 4, 1, SUIT[3])
    l.rect(hx + 5, hy - 3, 2, 1, SUIT[3])
    l.set(hx - 7 + t, hy - 6, SUIT[2])
    l.set(hx - 6 + t, hy - 5, SUIT[2])
  },
  item: (r, { p }, hand) => {
    const sw = -Math.sign(p.lag)
    part(r, (l) => {
      const x = Math.round(hand.x) - 5 + sw
      const y = Math.round(hand.y) + 2
      l.rect(x, y, 11, 8, R.brown[1])
      shadeEdges(l, R.brown, 1, true)
      l.rect(x + 1, y + 3, 9, 1, R.brown[2])
      l.rect(x + 4, y + 3, 3, 2, R.yellow[1])
      l.set(x + 4, y + 3, R.yellow[0])
    })
    part(r, (l) => {
      l.line(hand.x - 2 + sw, hand.y + 2, hand.x - 1, hand.y, R.brown[2])
      l.line(hand.x + 2 + sw, hand.y + 2, hand.x + 1, hand.y, R.brown[2])
      l.set(Math.round(hand.x) - 2 + sw, Math.round(hand.y) + 1, R.brown[0])
    })
    part(r, (l) => defaultHand(l, hand))
  },
  lie: {
    thick: 10,
    coat: SUIT,
    head: { grid: LIE.short, key: HAIR_KEY },
    detail: (l, _x0, x1, top) => {
      l.rect(x1 - 3, top + 2, 4, 3, R.paper[1])
      l.rect(x1 - 2, top + 3, 2, 1, R.red[1])
    }
  }
}

// ---------------------------------------------------------------------------------------------
// 小学生: white T-shirt, navy shorts, yellow cap, and a deep-red ランドセル with straps that bounces late.

const KID_HEAD: HeadSpec = {
  w: 21,
  h: 19,
  hairAt: [-1, -2],
  hair: [
    '........YYYYYY..........',
    '.....YYyyyyyyyYY........',
    '....YyyccccyyyyyY.......',
    '...YyccyyyyyyyyyyY......',
    '..YyccyyyyyyyyyyyyY.....',
    '..YycyyyyyyyyyyyyyyY....',
    '.YyyyyyyyyyyyyyyyyyyY...',
    '.YyyyyyyyyyyyyyyyyyyyYY.',
    '.JYYyyyyyyyyyyyyyyyyyyyY',
    'JHHYYYYYYYYYYYYYYYYYYYY.',
    'JHH.................YY..',
    'JHJ.....................',
    'JJ......................'
  ],
  key: { c: R.yellow[0], y: R.yellow[1], Y: R.yellow[2], H: R.hair[2], J: R.hair[3] },
  eyes: 'kid',
  near: [5, 10],
  far: [14, 10],
  mouth: [11, 16],
  nose: [12, 14],
  ear: [0, 10],
  blush: true
}

const RANDO: Ramp = [R.red[1], R.red[2], R.red[3], R.red[3], R.red[4]]

export function sneaker(l: Raster, end: Pt) {
  const x = Math.round(end.x) - 2
  const y = Math.round(end.y)
  l.rect(x + 1, y - 1, 3, 1, R.paper[1])
  l.rect(x, y, 6, 2, R.navy[1])
  l.rect(x + 1, y, 2, 1, R.navy[0])
  l.rect(x, y + 2, 6, 1, R.paper[2])
}

export const KID: Body = {
  hip: 46,
  thigh: 5,
  shin: 5,
  legW: 4,
  gap: 3,
  torsoH: 12,
  span: 7,
  upper: 5,
  fore: 5,
  armW: 4,
  hang: [-1, 9],
  head: KID_HEAD,
  headAt: [-10, -18],
  pants: SKIN,
  sleeve: R.paper,
  shortSleeve: true,
  shoe: sneaker,
  behind: (r, { hx, top, lean: L, p }) => {
    // The ランドセル on the back, seen past the near shoulder: rounded flap, metal clasp, side panel.
    const by = Math.max(-1, Math.min(1, p.lag))
    part(r, (l) => {
      const x = hx - 14 + L
      const y = top - 2 + by
      l.rect(x, y, 11, 13, RANDO[1])
      l.rect(x + 9, y, 2, 13, RANDO[2])
      l.rect(x, y, 11, 1, RANDO[0])
      // Flap with a rounded lower edge and a lit rim.
      l.rect(x, y + 1, 9, 6, RANDO[0])
      l.ellipse(x + 4.5, y + 7, 4.5, 2, RANDO[0])
      l.rect(x + 1, y + 2, 7, 5, R.red[1])
      l.ellipse(x + 4.5, y + 7, 3.5, 1.4, R.red[1])
      l.rect(x + 3, y + 8, 3, 2, R.metal[1])
      l.set(x + 3, y + 8, R.metal[0])
      l.rect(x, y + 12, 11, 1, RANDO[2])
    })
  },
  torso: (l, { hx, hy, top, lean: L, p }) => {
    const t = Math.round(p.thin * 2)
    l.rect(hx - 2 + L, top - 2, 5, 3, SKIN[2])
    // Shorts with leg openings.
    l.poly(
      [
        hx - 7 + t,
        hy - 3,
        hx + 7 - t,
        hy - 3,
        hx + 7 - t,
        hy + 3,
        hx + 1,
        hy + 3,
        hx,
        hy + 1,
        hx - 1,
        hy + 3,
        hx - 7 + t,
        hy + 3
      ],
      R.navy[1]
    )
    planes(l, R.navy, R.navy[1], 1, 1)
    const shirt = new Raster(l.w, l.h)
    shirt.poly(
      [
        hx - 8 + L + t,
        top + 2,
        hx - 5 + L,
        top,
        hx + 5 + L,
        top,
        hx + 8 + L - t,
        top + 2,
        hx + 7 - t,
        hy,
        hx - 7 + t,
        hy
      ],
      R.paper[1]
    )
    planes(shirt, R.paper, R.paper[1], 1, 2)
    l.blit(shirt)
    // Neckline, a fold at the waist, a small star print.
    l.line(hx - 2 + L, top, hx + 3 + L, top, R.paper[2])
    l.set(hx + 4 + L, top + 1, R.paper[2])
    l.rect(hx - 5 + t, hy - 1, 3, 1, R.paper[2])
    l.stamp(['.y.', 'yyy', '.y.'], hx + 2, top + 5, { y: R.yellow[1] })
    // Shoulder straps over the shirt.
    l.line(hx - 6 + L, top, hx - 6 + t, top + 9, RANDO[1])
    l.line(hx - 5 + L, top, hx - 5 + t, top + 9, RANDO[2])
    l.line(hx + 5 + L, top, hx + 6 - t, top + 8, RANDO[2])
  },
  lie: {
    thick: 9,
    coat: R.paper,
    head: { grid: LIE.short, key: HAIR_KEY },
    // The cap has fallen off and lies beside the head.
    beside: (r) =>
      part(r, (l) => {
        l.ellipse(57, 54, 5, 3.5, R.yellow[1])
        l.rect(52, 56, 12, 2, R.yellow[2])
        l.ellipse(56, 53, 2, 1.5, R.yellow[0])
      }),
    detail: (l, x0, _x1, top, g) => {
      l.rect(x0 + 6, top - 4, 13, 5, RANDO[1])
      l.rect(x0 + 6, top - 4, 13, 1, RANDO[0])
      l.rect(x0 + 6, top, 13, 1, RANDO[2])
      l.rect(x0 + 12, top - 2, 2, 2, R.metal[1])
      // Shorts at the hip end.
      l.rect(x0 - 1, top + 2, 7, g - top - 1, R.navy[1])
      l.rect(x0 - 1, g - 1, 7, 1, R.navy[2])
    }
  }
}

// ---------------------------------------------------------------------------------------------
// 老後: a grey-haired elder in a cardigan, hunched over a cane, shuffling.

const ELDER_HEAD: HeadSpec = {
  w: 18,
  h: 17,
  hairAt: [-1, 0],
  hair: [
    '....................',
    '........m.mm........',
    '.........mN.........',
    '....................',
    '..m..............m..',
    '.mMm............mMm.',
    '.MMN............mMMm',
    'mMMN.............MMN',
    'mMN..............MMN',
    'MMN...............MN',
    'MN................N.',
    'MN..................',
    '.N..................'
  ],
  key: { m: R.metal[0], M: R.metal[1], N: R.metal[2] },
  eyes: 'elder',
  near: [5, 9],
  far: [13, 9],
  mouth: [10, 15],
  nose: [12, 12],
  ear: [1, 9],
  brows: R.paper[1],
  extra: (l, x, y, face) => {
    // Forehead and cheek wrinkles, a white moustache.
    l.paint(x + 6, y + 5, SKIN[2])
    l.paint(x + 7, y + 5, SKIN[2])
    l.paint(x + 10, y + 5, SKIN[2])
    l.paint(x + 11, y + 5, SKIN[2])
    l.paint(x + 8, y + 6, SKIN[2])
    l.paint(x + 3, y + 12, SKIN[2])
    l.paint(x + 15, y + 12, SKIN[3])
    if (face === 'none') return
    l.stamp(['.WWWW.', 'WWggWW'], x + 8, y + 13, { W: R.paper[1], g: R.paper[2] })
  }
}

const CARDIGAN = R.brown
const SLACKS: Ramp = [R.metal[1], R.metal[2], R.metal[3], R.hair[3], R.hair[4]]

export function slipper(l: Raster, end: Pt) {
  const x = Math.round(end.x) - 2
  const y = Math.round(end.y)
  l.rect(x, y, 6, 3, R.brown[2])
  l.rect(x + 1, y, 3, 1, R.brown[1])
  l.rect(x, y + 2, 6, 1, R.brown[3])
}

export const ELDER: Body = {
  hip: 42,
  thigh: 7,
  shin: 7,
  legW: 5,
  gap: 3,
  torsoH: 13,
  span: 7,
  upper: 6,
  fore: 5,
  armW: 4,
  hang: [0, 10],
  head: ELDER_HEAD,
  headAt: [-7, -15],
  pants: SLACKS,
  sleeve: CARDIGAN,
  shoe: slipper,
  torso: (l, { hx, hy, top, lean: L, p }) => {
    const t = Math.round(p.thin * 2)
    l.rect(hx - 1 + L, top - 3, 5, 4, SKIN[2])
    // Rounded back: the hump rises behind the shoulders.
    l.poly(
      [
        hx - 8 + t,
        top + 4,
        hx - 7 + t,
        top,
        hx - 3 + L,
        top - 2,
        hx + 5 + L,
        top,
        hx + 8 + L - t,
        top + 3,
        hx + 7 - t,
        hy + 2,
        hx - 7 + t,
        hy + 2
      ],
      CARDIGAN[1]
    )
    planes(l, CARDIGAN, CARDIGAN[1], 1, 2)
    // Shirt collar, button band, ribbed hem and pockets.
    l.poly([hx + L, top - 1, hx + 5 + L, top, hx + 2 + L, top + 5], R.paper[1])
    l.line(hx + 2 + L, top + 5, hx + 2, hy + 1, CARDIGAN[3])
    for (let i = 0; i < 3; i++) l.set(hx + 3 + Math.round((L * (2 - i)) / 3), top + 7 + i * 3, R.yellow[0])
    for (let x = hx - 6 + t; x <= hx + 6 - t; x += 2) l.set(x, hy + 1, CARDIGAN[2])
    l.rect(hx - 6 + t, hy - 3, 4, 1, CARDIGAN[2])
    l.rect(hx + 4, hy - 3, 3, 1, CARDIGAN[2])
  },
  // The cane: crook in the far hand, tip planted ahead; in the walk `lag` carries the tip forward on passing.
  farItem: (r, { p }, hand) => {
    const tip = { x: hand.x + 4 + (p.item ? Math.round(p.lag) : 0), y: GROUND - 1 + p.y }
    part(r, (l) => {
      l.line(hand.x + 1, hand.y - 1, tip.x, tip.y, R.brown[2])
      l.line(hand.x + 2, hand.y - 1, tip.x + 1, tip.y, R.brown[1])
      l.line(hand.x - 1, hand.y - 2, hand.x + 2, hand.y - 2, R.brown[1])
      l.set(Math.round(hand.x) - 2, Math.round(hand.y) - 1, R.brown[1])
    })
    part(r, (l) => defaultHand(l, hand))
  },
  lie: {
    thick: 10,
    coat: CARDIGAN,
    head: { grid: LIE.bald, key: { H: R.metal[1], J: R.metal[2], a: R.paper[1] } },
    // The cane lies on the floor in front of him.
    beside: (r) =>
      part(r, (l) => {
        l.line(6, 57, 34, 57, R.brown[1])
        l.line(34, 57, 37, 54, R.brown[1])
        l.set(36, 53, R.brown[1])
      })
  }
}

// ---------------------------------------------------------------------------------------------
// Animation tables shared by humanoid bodies.

/**
 * 6-frame walk: contact, passing, up for each side. The body drops on contact and rises on passing
 * (2px), both arms swing against the legs, the head and secondary parts follow a frame late.
 */
const WALK = {
  front: [4, 1, -2, -4, -1, 2],
  frontLift: [0, 0, 0, 0, 3, 1],
  back: [-4, -1, 2, 4, 1, -2],
  backLift: [0, 3, 1, 0, 0, 0],
  bob: [1, -1, 0, 1, -1, 0]
}

export function walkPoses(
  o: { scale?: number; swing?: number; nearSwing?: number; hangY?: number; extra?: Partial<Pose> } = {}
) {
  const s = o.scale ?? 1
  const swing = o.swing ?? 0.8
  const hangY = o.hangY ?? 12
  return WALK.bob.map((bob, i) => {
    const prev = (i + 5) % 6
    return pose({
      bob,
      headBob: WALK.bob[prev],
      lag: WALK.front[prev] - WALK.front[i] > 0 ? 1 : -1,
      front: [Math.round(WALK.front[i] * s), WALK.frontLift[i]],
      back: [Math.round(WALK.back[i] * s), WALK.backLift[i]],
      handN: [
        Math.round(-WALK.front[i] * swing * (o.nearSwing ?? 1)) - 1,
        hangY - (Math.abs(WALK.front[i]) > 3 ? 1 : 0)
      ],
      handF: [Math.round(-WALK.back[i] * swing) + 1, hangY - (Math.abs(WALK.back[i]) > 3 ? 1 : 0)],
      ...o.extra
    })
  })
}

/** Breathing, a slight weight shift, and a blink on the last (short) frame. */
export function idlePoses(extra: Partial<Pose> = {}) {
  const bobs = [0, 0, 1, 1]
  const shift = [0, 1, 1, 0]
  return bobs.map((bob, i) =>
    pose({
      bob,
      headBob: bobs[(i + 3) % 4],
      lag: shift[i] - shift[(i + 3) % 4],
      x: 0,
      lean: shift[i],
      face: i === 3 ? 'blink' : 'open',
      ...extra
    })
  )
}

export function hurtPoses(extra: Partial<Pose> = {}) {
  return [
    pose({
      lean: -2,
      squash: 1,
      bob: 1,
      headBob: 0,
      head: [-1, 0],
      face: 'pain',
      front: [2, 0],
      back: [-2, 0],
      handN: [-4, 8],
      handF: [4, 8],
      lag: -1,
      ...extra
    }),
    pose({ lean: -1, bob: 0, headBob: 1, face: 'pain', front: [1, 0], back: [-1, 0], lag: 1, ...extra })
  ]
}

export const adult = (p: Pose) => human(ADULT, p)
export const kid = (p: Pose) => human(KID, p)
export const elder = (p: Pose) => human(ELDER, p)

export function adultSheet(): Sheet {
  return {
    idle: anim(idlePoses().map(adult), 6, [3, 2, 3, 1]),
    walk: anim(walkPoses({ nearSwing: 0.4 }).map(adult), 11),
    hurt: anim(hurtPoses().map(adult), 8, undefined, false)
  }
}

export function kidSheet(): Sheet {
  return {
    idle: anim(idlePoses().map(kid), 6, [3, 2, 3, 1]),
    walk: anim(walkPoses({ scale: 0.8, hangY: 9 }).map(kid), 12),
    hurt: anim(hurtPoses({ handN: [-4, 6], handF: [4, 6] }).map(kid), 8, undefined, false)
  }
}

/** The elder walks hunched; small shuffling steps, the cane plants on each contact and swings on passing. */
export function elderSheet(): Sheet {
  const hunch = { lean: 3 }
  const cane = [0, 1, 3, 0, 1, 3]
  return {
    idle: anim(
      idlePoses({ ...hunch, face: 'open' }).map((p, i) =>
        elder({ ...p, lean: 3, face: i === 3 ? 'blink' : 'open', lag: 0 })
      ),
      5,
      [3, 2, 3, 1]
    ),
    walk: anim(
      walkPoses({ scale: 0.5, swing: 0.3, hangY: 10 }).map((p, i) =>
        elder({
          ...p,
          ...hunch,
          bob: Math.max(0, p.bob),
          headBob: Math.max(0, p.headBob),
          front: [p.front[0], Math.min(1, p.front[1])],
          back: [p.back[0], Math.min(1, p.back[1])],
          handF: [3, 7],
          lag: cane[i]
        })
      ),
      8
    ),
    hurt: anim(hurtPoses({ lean: 1, handF: [3, 7] }).map(elder), 8, undefined, false)
  }
}

// ---------------------------------------------------------------------------------------------
// 乳児期: a chubby baby in a mint onesie crawling (ハイハイ) — big head, pacifier, cowlick, snap buttons.

const BABY_HEAD: HeadSpec = {
  w: 22,
  h: 20,
  hairAt: [0, -3],
  hair: [
    '..........BB..........',
    '.........B..B.........',
    '..........bB..........',
    '........bbbbbb........',
    '......bbbBbbbbbb......',
    '.....b..b..b...b......'
  ],
  key: { b: R.brown[0], B: R.brown[1] },
  eyes: 'kid',
  near: [7, 9],
  far: [15, 9],
  mouth: [12, 15],
  ear: [1, 9],
  blush: true,
  extra: (l, x, y, face) => {
    if (face === 'pain' || face === 'none') return
    // Pacifier: a pink shield with a yellow ring.
    l.rect(x + 11, y + 14, 5, 3, R.pink[1])
    l.rect(x + 11, y + 14, 5, 1, R.pink[0])
    l.rect(x + 15, y + 15, 1, 2, R.pink[2])
    l.rect(x + 12, y + 17, 3, 2, R.yellow[1])
    l.set(x + 13, y + 17, 0)
  }
}

/** Crawl pose: near/far hand [dx, lift], near/far knee [dx, lift], body bob, head lag, face. */
export interface Crawl {
  hands: [number, number, number, number]
  knees: [number, number, number, number]
  bob: number
  lag: number
  face: Face
  tilt: number
  /** 0..1: flopping flat onto the floor. */
  sink: number
}

const ONESIE = R.mint

export function baby(c: Crawl) {
  const r = new Raster(SIZE, SIZE)
  const by = Math.round(c.bob + c.sink * 4)
  const flat = c.sink > 0.5
  const hip = { x: 19, y: 49 + by }
  const hand = (dx: number, lift: number, far: boolean): Pt => ({
    x: (far ? 46 : 36) + dx + (flat ? 4 : 0),
    y: GROUND - 3 - lift
  })
  const knee = (dx: number, lift: number, far: boolean): Pt => ({ x: (far ? 25 : 20) + dx, y: GROUND - 3 - lift })
  const leg = (k: Pt, far: boolean) =>
    part(r, (l) => {
      l.thick(hip.x + (far ? 4 : 0), hip.y, k.x, k.y, 6, ONESIE[1])
      l.thick(k.x, k.y, k.x - 8, k.y - 2 + (flat ? 2 : 0), 5, ONESIE[1])
      shadeEdges(l, ONESIE)
      // Footed onesie: a pale sole facing up.
      l.rect(Math.round(k.x) - 11, Math.round(k.y) - 4 + (flat ? 2 : 0), 2, 4, ONESIE[0])
      if (far) l.map((v) => (v === ONESIE[1] ? ONESIE[2] : v === ONESIE[0] ? ONESIE[1] : v))
    })
  const arm = (h: Pt, far: boolean) =>
    limb(r, { x: (far ? 45 : 36) - (flat ? 0 : 0), y: 46 + by }, h, 5, 5, -1, 5, ONESIE, far, (l, end) => {
      l.ellipse(end.x, end.y, 2.6, 2, SKIN[1])
      l.set(Math.round(end.x) + 1, Math.round(end.y) + 1, SKIN[2])
    })
  arm(hand(c.hands[2], c.hands[3], true), true)
  leg(knee(c.knees[2], c.knees[3], true), true)
  // Round onesie body with the diaper bump behind, chubby and soft.
  part(r, (l) => {
    ball(l, 27, 46 + by, 11, 7, ONESIE, false)
    ball(l, 16, 44 + by, 7, 6.5, ONESIE, false)
    l.line(19, 39 + by, 23, 39 + by, ONESIE[0])
    l.line(30, 40 + by, 34, 40 + by, ONESIE[0])
    for (const [x, y] of [
      [24, 51],
      [28, 52],
      [32, 52]
    ])
      l.paint(x, y + by, R.paper[0])
  })
  leg(knee(c.knees[0], c.knees[1], false), false)
  // Flopped flat, the near arm tucks under the head instead of crossing the face.
  if (flat) arm(hand(c.hands[0], c.hands[1], false), false)
  drawHead(r, BABY_HEAD, 30, 31 + by + Math.round(c.lag) - c.tilt + (flat ? 3 : 0), c.face)
  if (!flat) arm(hand(c.hands[0], c.hands[1], false), false)
  return r
}

export const crawl = (p: Partial<Crawl>): Crawl => ({
  hands: [0, 0, 0, 0],
  knees: [0, 0, 0, 0],
  bob: 0,
  lag: 0,
  face: 'open',
  tilt: 0,
  sink: 0,
  ...p
})

export function babySheet(): Sheet {
  // Diagonal pairs move together: near hand with far knee, far hand with near knee.
  const reach = [3, 1, -1, -3, -1, 1]
  const lift = [0, 0, 0, 0, 2, 1]
  const bob = [0, 1, 0, 0, 1, 0]
  const at = (i: number) => (i + 6) % 6
  return {
    idle: anim(
      [0, 0, 1, 1].map((b, i) =>
        baby(crawl({ bob: b, lag: i === 3 ? 1 : 0, face: i === 3 ? 'blink' : 'open', tilt: i === 1 ? 1 : 0 }))
      ),
      6,
      [3, 2, 3, 1]
    ),
    walk: anim(
      reach.map((_, i) =>
        baby(
          crawl({
            hands: [reach[i], lift[i], reach[at(i + 3)], lift[at(i + 3)]],
            knees: [reach[at(i + 3)], lift[at(i + 3)] ? 1 : 0, reach[i], lift[i] ? 1 : 0],
            bob: bob[i],
            lag: bob[at(i - 1)]
          })
        )
      ),
      10
    ),
    hurt: anim(
      [baby(crawl({ face: 'pain', tilt: 2, bob: 1, hands: [-2, 0, -2, 0] })), baby(crawl({ face: 'pain', tilt: 1 }))],
      8,
      undefined,
      false
    )
  }
}

// ---------------------------------------------------------------------------------------------
// 寝たきり: the elder propped up in a wheeled care bed — backrest, pillow, blanket over knees and feet,
// side rail, IV stand. Moving, the bed rattles along with spinning casters, a swinging drip and dust.

export interface BedPose {
  /** Wheel rotation 0..3 (45° steps). */
  spin: number
  /** Front / back caster hop. */
  hop: [number, number]
  /** Breathing: chest rise. */
  breath: number
  /** IV pole sway; the bag lags behind it. */
  sway: number
  bagLag: number
  /** Blanket ripple phase (-1 = still). */
  ripple: number
  head: number
  face: Face
  /** Trailing dust/motion lines 0..3 (0 = none). */
  dust: number
}

const BLANKET = R.mint
const PAJAMA = R.pink

function caster(l: Raster, x: number, y: number, spin: number) {
  ball(l, x, y, 4, 4, BLACK, false)
  const a = (spin % 4) * (Math.PI / 4)
  const dx = Math.round(Math.cos(a) * 3)
  const dy = Math.round(Math.sin(a) * 3)
  l.line(x - dx - 0.5, y - dy - 0.5, x + dx - 0.5, y + dy - 0.5, R.metal[1])
  l.rect(Math.round(x) - 1, Math.round(y) - 1, 2, 2, R.metal[0])
}

export function bed(b: BedPose) {
  const r = new Raster(SIZE, SIZE)
  // Trailing dust puffs and motion lines on the left when rolling.
  if (b.dust)
    part(r, (l) => {
      l.ellipse(5 - b.dust, 55, 1 + b.dust * 0.7, 1 + b.dust * 0.5, R.paper[2])
      if (b.dust > 1) l.ellipse(9 - b.dust, 56, 1.5, 1, R.paper[1])
    })
  if (b.dust)
    part(
      r,
      (l) => {
        for (const [y, w] of [
          [30, 4],
          [37, 3],
          [44, 4]
        ])
          l.rect(1 + ((b.dust + y) % 2), y, w, 1, R.paper[2])
      },
      false
    )
  // IV stand behind the headboard; the bag swings a beat after the pole.
  const top = { x: 61 + b.sway, y: 4 }
  part(r, (l) => {
    l.line(61, 50, top.x, top.y, R.metal[1])
    l.line(top.x - 4, top.y, top.x + 1, top.y, R.metal[1])
    const bx = top.x - 6 + b.bagLag
    l.rect(bx, top.y + 2, 5, 8, R.paper[1])
    l.rect(bx + 1, top.y + 5, 3, 4, R.mint[0])
    l.rect(bx + 4, top.y + 2, 1, 8, R.paper[2])
    l.set(bx + 2, top.y + 1, R.metal[2])
  })
  // Casters and frame (front/back hop alternately: the rattle).
  part(r, (l) => {
    for (const [x, hop] of [
      [12, b.hop[1]],
      [52, b.hop[0]]
    ] as const) {
      l.rect(x - 1, 47 - hop, 2, 5, R.metal[2])
      caster(l, x, 54 - hop, b.spin)
    }
  })
  const y = -Math.max(b.hop[0], b.hop[1])
  part(r, (l) => {
    l.rect(6, 44 + y, 52, 3, R.metal[1])
    shadeEdges(l, R.metal, 1, true)
  })
  part(r, (l) => {
    l.rect(4, 32 + y, 3, 16, R.metal[1])
    l.rect(4, 32 + y, 1, 16, R.metal[0])
    l.rect(6, 32 + y, 1, 16, R.metal[2])
  })
  // Mattress, and the backrest raised at the head end with its pillow.
  part(r, (l) => {
    l.rect(7, 39 + y, 49, 5, R.paper[1])
    l.poly([38, 40 + y, 49, 24 + y, 55, 27 + y, 47, 41 + y], R.paper[1])
    shadeEdges(l, R.paper, 1)
  })
  part(r, (l) => {
    l.ellipse(49, 27 + y, 4.5, 6.5, R.paper[1])
    l.ellipse(48, 26 + y, 2.5, 4, R.paper[0])
  })
  // The IV line runs behind him down to his hand.
  part(
    r,
    (l) => {
      const bx = top.x - 6 + b.bagLag
      l.line(bx + 2, top.y + 10, bx - 1, top.y + 18, R.paper[2])
      l.line(bx - 1, top.y + 18, 36, 36 + y - b.breath, R.paper[2])
    },
    false
  )
  // Pajama shoulders, then the head on the pillow.
  part(r, (l) => {
    l.poly([37, 41 + y, 39, 32 + y - b.breath, 47, 30 + y - b.breath, 50, 38 + y], PAJAMA[1])
    planes(l, PAJAMA, PAJAMA[1], 1, 2)
    l.rect(42, 31 + y - b.breath, 3, 2, R.paper[1])
  })
  drawHead(r, ELDER_HEAD, 37, 14 + y + b.head, b.face)
  // Blanket over chest, knees and feet (rounded bumps); it ripples as the bed rolls.
  part(r, (l) => {
    const w = (i: number) => (b.ripple >= 0 ? ((i + b.ripple) % 3 === 0 ? -1 : (i + b.ripple) % 3 === 1 ? 1 : 0) : 0)
    l.rect(8, 38 + y, 39, 6, BLANKET[1])
    l.ellipse(14, 38 + y + w(0), 5, 3.5, BLANKET[1])
    l.ellipse(27, 37.5 + y + w(1), 6.5, 3.5, BLANKET[1])
    l.ellipse(40, 36 + y - b.breath + w(2) * 0.5, 7, 3, BLANKET[1])
    shadeEdges(l, BLANKET, 1, true)
    l.rect(35, 34 + y - b.breath, 11, 2, R.paper[1])
    l.rect(35, 34 + y - b.breath, 11, 1, R.paper[0])
    l.line(19, 39 + y, 21, 41 + y, BLANKET[2])
    l.line(33, 39 + y, 34, 41 + y, BLANKET[2])
  })
  // A thin hand rests on the blanket, the IV line taped to it.
  part(r, (l) => {
    const hy = 36 + y - b.breath
    l.rect(33, hy, 4, 2, SKIN[1])
    l.rect(33, hy + 1, 4, 1, SKIN[2])
    l.set(35, hy, R.paper[0])
  })
  // Side rail in front, and the headboard.
  part(r, (l) => {
    l.rect(15, 38 + y, 18, 1, R.metal[0])
    for (const x of [16, 24, 32]) l.rect(x, 39 + y, 1, 4, R.metal[1])
  })
  part(r, (l) => {
    l.rect(56, 26 + y, 3, 22, R.metal[1])
    l.rect(56, 26 + y, 1, 22, R.metal[0])
    l.rect(58, 26 + y, 1, 22, R.metal[2])
  })
  return r
}

export const bedPose = (p: Partial<BedPose>): BedPose => ({
  spin: 0,
  hop: [0, 0],
  breath: 0,
  sway: 0,
  bagLag: 0,
  ripple: -1,
  head: 0,
  face: 'blink',
  dust: 0,
  ...p
})

export function bedSheet(): Sheet {
  const sway = [0, 1, 1, 0, -1, -1]
  return {
    idle: anim(
      [0, 1, 2, 1].map((breath, i) =>
        bed(bedPose({ breath, face: i === 2 ? 'calm' : 'blink', head: breath > 1 ? -1 : 0 }))
      ),
      3,
      [2, 2, 3, 2]
    ),
    walk: anim(
      sway.map((s, i) =>
        bed(
          bedPose({
            spin: i % 4,
            hop: i % 2 ? [1, 0] : [0, 1],
            sway: s,
            bagLag: -sway[(i + 5) % 6],
            ripple: i,
            head: i % 2 ? -1 : 0,
            breath: 1,
            face: 'angry',
            dust: (i % 3) + 1
          })
        )
      ),
      12
    ),
    hurt: anim(
      [bed(bedPose({ face: 'pain', hop: [1, 0], sway: -1, bagLag: 1, head: 1 })), bed(bedPose({ face: 'pain' }))],
      8,
      undefined,
      false
    )
  }
}

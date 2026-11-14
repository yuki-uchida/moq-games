/**
 * ママ・ハム代 (`mom`): the hero's mother, drawn on the hamster family build (`hamster.ts`) a third bigger and
 * rounder than ハム彦. Orange fur, a cream mask, rose ear bowls, cream paws; furious slanted brows over tall dark
 * eyes; three pink hair curlers across the crown where her son has his tuft; a white apron with a pink heart on the
 * bib, tied at the back in a bow whose strings are her soft, lagging part; a steel ladle in her near fist.
 *
 * Her accessories are the look's hooks: the apron strings and bow (`pose.scarf` drives the strings), the apron, the
 * curlers (`acc.c0` … `acc.c2` bounce them, `acc.loose` lets the back one dangle), the ladle (`acc.ladle` its angle
 * in degrees clockwise from straight up, `acc.ladleBack` puts it behind the head, `acc.ladleFar` in the far paw,
 * `acc.shake` vibrates it).
 *
 * Depth (back to front): apron strings (-4.3), far ear, tail, far leg, far foot, near leg, body, apron (0.3), far
 * arm, apron bow (0.5), near foot, ladle behind the head (1.4), near ear, raised near arm (1.75), dangling curler (1.95), ladle in a raised
 * fist (1.72), head + face, curlers (2.1), ladle in front (2.95), near arm (the kit's list in
 * `hamster.ts`, plus hers).
 */
import type { SheetModule } from '../module'
import { clamp, lag, lerp } from '../motion'
import { C, R } from '../palette'
import { Raster, farRamp, type Pt } from '../raster'
import {
  Frame,
  capsule,
  cel,
  egg,
  fill,
  oval,
  overlap,
  polygon,
  ribbon,
  shadow,
  smooth,
  spline,
  squircle,
  union
} from '../rig'
import { lazyAnim, memo } from '../sheet'
import {
  cyc,
  drawHamster,
  hamFrames,
  hamLook,
  hamPose,
  hamStamps,
  stampOn,
  turnGrid,
  type Eyes,
  type HamAccessory,
  type HamPose,
  type HamSize,
  type Mouth,
  type StampPair
} from './hamster'

const ORANGE = R.momOrange
const CREAM = R.momCream
const PINK = R.hamEar
const PAPER = R.paper
const STEEL = R.steel
/** Ear bowls: cream like the mask (the pink is the curlers'). */
const EAR = CREAM

/** Her cell: 96×96, feet on (48, 90). */
export const MOM_CELL: HamSize = { w: 96, h: 96, anchor: [48, 90] }

// ---------------------------------------------------------------------------------------------------- stamps

/**
 * Her eyes, a size up from the family's (7×9 near, 6×9 far): tall and dark with the bright highlight at the
 * top-left and a rose glint low on the other side. `open` is already cut by a lid that slopes down to the nose
 * (she is always cross); `wide` is the round, startled eye.
 */
const EYES_M: Record<Eyes, StampPair> = {
  open: [
    ['KKK....', 'KwwKKK.', 'KwwKKKK', 'KKKKKKK', 'KKKKKKK', 'KKKKKKK', 'KKKKKsK', 'KKKKKKK', '.KKKKK.'],
    ['...KKK', '.KKKKK', 'KwwKKK', 'KwwKKK', 'KKKKKK', 'KKKKKK', 'KKKKsK', 'KKKKKK', '.KKKK.']
  ],
  wide: [
    ['.KKKKK.', 'KwwKKKK', 'KwwKKKK', 'KKKKKKK', 'KKKKKKK', 'KKKKKKK', 'KKKKwwK', 'KKKKKKK', '.KKKKK.'],
    ['.KKKK.', 'KwwKKK', 'KwwKKK', 'KKKKKK', 'KKKKKK', 'KKKKKK', 'KKKwwK', 'KKKKKK', '.KKKK.']
  ],
  half: [
    ['.......', '.......', '.......', 'iiiiiii', 'KwwKKKK', 'KKKKKKK', 'KKKKKsK', 'KKKKKKK', '.KKKKK.'],
    ['......', '......', '......', 'iiiiii', 'KwKKKK', 'KKKKKK', 'KKKKsK', 'KKKKKK', '.KKKK.']
  ],
  closed: [
    ['.......', '.......', '.......', '.......', '.......', 'ii...ii', '.iiiii.', '.......', '.......'],
    ['......', '......', '......', '......', '......', 'i....i', '.iiii.', '......', '......']
  ],
  happy: [
    ['.......', '.......', '.......', '.......', '.iiiii.', 'ii...ii', 'i.....i', '.......', '.......'],
    ['......', '......', '......', '......', '.iiii.', 'ii..ii', 'i....i', '......', '......']
  ],
  // screwed shut with the effort of the shout: a thick > <
  squint: [
    ['.......', '.......', 'iii....', '.iiii..', '...iiii', '.iiii..', 'iii....', '.......', '.......'],
    ['......', '......', '...iii', '.iiii.', 'iiii..', '.iiii.', '...iii', '......', '......']
  ],
  hurt: [
    ['.......', '.......', 'ii.....', '.iii...', '...iiii', '.iii...', 'ii.....', '.......', '.......'],
    ['......', '......', '....ii', '...ii.', 'iiii..', '...ii.', '....ii', '......', '......']
  ],
  dizzy: [
    ['.......', '.iiiii.', 'i.....i', 'i.iii.i', 'i.i.i.i', 'i.i...i', 'i..iii.', '.i.....', '..iiii.'],
    ['......', '.iiii.', 'i....i', 'i.ii.i', 'i.i..i', 'i..ii.', '.i....', '..iii.', '......']
  ],
  dizzy2: [[], []],
  wet: [[], []]
}
EYES_M.dizzy2 = [turnGrid(EYES_M.dizzy[0], 2), turnGrid(EYES_M.dizzy[1], 2)]
EYES_M.wet = EYES_M.open

/** Brows: thick two-pixel bars. `angry` slopes down to the nose, `hard` steeper (the shout), `worried` up. */
const BROWS_M = {
  angry: [
    ['ii.....', 'iiii...', '..iiii.', '....iii', '......i'],
    ['....ii', '..iiii', 'iiii..', 'ii....']
  ],
  hard: [
    ['ii.....', 'iii....', '.iiii..', '...iiii', '.....ii'],
    ['....ii', '..iiii', 'iiii..', 'ii....']
  ],
  worried: [
    ['.....ii', '...iiii', '.iiii..', 'iii....'],
    ['ii....', 'iiii..', '..iiii', '....ii']
  ],
  raised: [
    ['..iii..', '.iiiii.', 'ii...ii'],
    ['.iiii.', 'iiiiii', 'i....i']
  ]
} satisfies Record<string, StampPair>

const MOUTHS_M: Record<Mouth, readonly string[]> = {
  ...hamStamps(ORANGE, PINK).mouths,
  // pressed lips, the corners down
  frown: ['.KKKKK.', 'K.....K'],
  smile: ['K.....K', '.KKKKK.'],
  // gritted teeth
  grit: ['.KKKKK.', 'KwwKwwK', 'KKKKKKK', 'KwwKwwK', '.KKKKK.'],
  // the bellow: as wide as the face allows, the upper teeth, the tongue at the back of the throat
  gape: [
    'KKKKKKKKKKK',
    'KwwwwwwwwwK',
    'KmmmmmmmmmK',
    'KmmmmmmmmmK',
    'KmmmmmmmmmK',
    'KmmmmtttmmK',
    '.KmmttttmK.',
    '.KmttttttK.',
    '..KKKKKKK..'
  ],
  // the running shout
  wide: ['KKKKKKKKK', 'KwwwwwwwK', 'KmmmmmmmK', 'KmmmtttmK', '.KmttttK.', '..KKKKK..'],
  // panting with the tongue out over the chin
  tongue: ['KKKKKKK', 'KmmmmmK', '.KmmmK.', '.KtttK.', '.KtttK.', '..KKK..'],
  // the wobbly dizzy line
  flat: ['.KK...KK.', 'K..K.K..K', '....K....'],
  // a yelp
  o: ['.KKK.', 'KmmmK', 'KmmmK', 'KmttK', '.KKK.']
}

const STAMPS = {
  ...hamStamps(ORANGE, PINK),
  eyes: EYES_M,
  brows: BROWS_M,
  mouths: MOUTHS_M,
  nose: ['hnnn', '.nn.'],
  noseKey: { h: PINK[0], n: PINK[2] },
  tufts: null
}

// ------------------------------------------------------------------------------------------------ accessories

/** Where the apron bow sits on the torso: the small of her back. */
const BOW: Pt = [-10.6, -8]

/** The two apron strings, hanging from the bow and driven by `pose.scarf` (direction, length, ripple, phase). */
const strings: HamAccessory = ({ g, pose: p, torso, s }) => {
  const at = torso.pt(BOW[0], BOW[1])
  const end = (angle: number, len: number, phase: number): Pt[] => {
    const a = ((angle + p.turn + p.lean * 0.3) * Math.PI) / 180
    const dir = [-Math.cos(a), Math.sin(a)]
    const perp = [-dir[1], dir[0]]
    const pts: Pt[] = []
    for (let i = 0; i <= 4; i++) {
      const t = i / 4
      const w = p.scarf[2] * Math.sin(phase - t * 3.2) * t * 1.4
      pts.push([at[0] + (dir[0] * len * t + perp[0] * w) * s, at[1] + (dir[1] * len * t + perp[1] * w) * s])
    }
    return spline(pts)
  }
  g.add(-4.3, (l) => {
    ribbon(l, end(p.scarf[0] + 20, p.scarf[1] * 0.75, p.scarf[3] + 1.3), (t) => 1.2 + t * 0.9, PAPER[2])
    ribbon(l, end(p.scarf[0] - 14, p.scarf[1], p.scarf[3]), (t) => 1.2 + t, PAPER[1])
    smooth(l)
    cel(l, { shade: 1 * s })
  })
}

/** The bow at the small of the back: two loops and a knot (`acc.bowUp` lifts the loops). */
const bow: HamAccessory = ({ g, pose: p, torso, s }) =>
  g.add(0.5, (l) => {
    const up = p.acc.bowUp ?? 0
    const [x, y] = torso.pt(BOW[0], BOW[1])
    const k = Frame.at(x, y, -10 - up * 12 + p.turn, s)
    fill(l, k, union(oval(-1.3, -2 - up * 0.4, 1.5, 2), oval(-1.1, 2, 1.4, 1.8)), PAPER[1])
    smooth(l)
    cel(l, { shade: 1 * s })
    fill(l, k, oval(0, 0, 1, 1.1), PAPER[2])
  })

/** The apron: the bib with the heart, the strap over the shoulder, the waistband round to the bow, the skirt. */
const apron: HamAccessory = ({ g, pose: p, torso, head, headShape, s, side }) =>
  g.add(0.3, (l) => {
    const flap = p.acc.flap ?? 0
    const body = union(egg(0, -9, 10.6, 10, 9.2), oval(-0.5, -5.5, 11.6, 6.8))
    const front = lerp(0, 4, side)
    const bib = squircle(front + 1.8, -12.4, 3.6, 4.2, 3)
    const skirt = polygon([
      [front - 4.5, -8.8],
      [front + 5.5, -8.8],
      [front + 8 + flap * 0.4, -2 - Math.max(0, flap) * 0.4],
      [front - 7 - flap * 0.8, -2 - flap * 0.8]
    ])
    const band = capsule([-11, -8.6], [front + 4, -8.4], 0.9)
    const strap = capsule([front - 1, -15.8], [-6.5, -17.5], 0.7)
    fill(
      l,
      torso,
      union(overlap(body, union(bib, band, strap)), overlap(union(body, oval(front, -3, 10.5, 2.6)), skirt)),
      PAPER[1]
    )
    smooth(l)
    cel(l, { shade: 1.6 * s })
    // the waistband's fold, the head's shadow on the bib
    shadow(l, torso, capsule([front - 6.5, -7.6], [front + 9.5, -7.6], 0.4))
    shadow(l, head.moved(0.5 * s, 1.5 * s), headShape)
    stampOn(l, torso, ['h.h', 'hhh', '.h.'], front + 1.8, -11.6, { h: PINK[1] })
  })

/** A hair roller (6×5): pink, with a highlight and two ribs; `D` its darker underside. */
const CURLER = ['.LLLLL.', 'LwLLLLP', 'PPPPPPD', 'PDPDPDD', '.DDDDD.']
const CURLER_KEY = { L: PINK[0], w: C.white, P: PINK[1], D: PINK[2] }

/** The three curlers across the crown; `acc.c0` … `c2` bounce them a pixel; `acc.loose` lets the back one dangle. */
const curlers: HamAccessory = ({ g, pose: p, head }) => {
  const loose = p.acc.loose ?? 0
  g.add(2.1, (l) => {
    const at: [number, number][] = [
      [-7, -21.6],
      [0, -24],
      [7, -22.4]
    ]
    at.forEach(([u, v], i) => {
      if (i === 0 && loose) return
      const dy = Math.round(p.acc[`c${i}`] ?? 0)
      stampOn(l, head, CURLER, u, v + dy / head.d, CURLER_KEY)
    })
  })
  if (loose)
    g.add(1.95, (l) => {
      // the back curler hangs from a loose lock behind the near ear, swinging with `acc.dangle` (degrees)
      const a = ((p.acc.dangle ?? 0) * Math.PI) / 180
      const top = head.pt(-13, -12)
      const len = 11
      const end: Pt = [top[0] + Math.sin(a) * len, top[1] + Math.cos(a) * len]
      ribbon(l, spline([top, [lerp(top[0], end[0], 0.5) - 1, lerp(top[1], end[1], 0.5)], end]), () => 1.6, ORANGE[1])
      l.stamp(CURLER, Math.round(end[0] - 3), Math.round(end[1]), CURLER_KEY)
    })
}

/**
 * The ladle: a steel handle about as long as her arm and a deep bowl with a hard highlight, held in the near fist
 * (or the far one with `acc.ladleFar`). `acc.ladle` is its angle (degrees clockwise from straight up).
 */
const ladle: HamAccessory = ({ g, pose: p, handN, handF, ground, s }) => {
  const far = (p.acc.ladleFar ?? 0) > 0
  const back = (p.acc.ladleBack ?? 0) > 0
  const dropped = (p.acc.dropped ?? 0) > 0
  const raised = p.up || p.upN === true
  const depth = dropped ? 0.65 : far ? 0.35 : raised ? 1.72 : back ? 1.4 : 2.95
  const hand = far ? handF : handN
  g.add(depth, (l) => {
    // dropped: lying on the ground in front of her (`acc.ladle` is then its tilt off the horizontal)
    const [x, y] = dropped ? ground.pt(p.acc.dropU ?? 0, -1.2) : hand.pt(0, 0)
    const k = Frame.at(Math.round(x), Math.round(y), dropped ? 90 + (p.acc.ladle ?? 0) : (p.acc.ladle ?? 0), s)
    const len = 14
    // the handle runs through the fist (its butt shows below it) and bends into the bowl
    fill(l, k, capsule([0, 2.2], [0, -len], 0.95, 0.8), STEEL[1])
    fill(l, k, union(oval(1, -len - 3.6, 4, 3.6), capsule([0, -len + 1], [0.6, -len - 1.5], 0.9)), STEEL[1])
    smooth(l)
    cel(l, { shade: 1.4 * s, rim: 1 })
    // the hollow of the bowl, open to the front, and the hard glint on its rim
    fill(l, k, oval(2.6, -len - 3.7, 1.3, 2.1), STEEL[3])
    const [gx, gy] = k.pt(-1.5, -len - 5.2)
    l.set(Math.round(gx), Math.round(gy), C.white)
  })
}

/** ママ・ハム代's look. */
export const MOM_LOOK = hamLook({
  scale: 1.3,
  size: MOM_CELL,
  limb: 0.72,
  head: 0.88,
  body: 1.34,
  ear: 0.92,
  fur: ORANGE,
  furFar: farRamp(ORANGE),
  mask: CREAM,
  earBowl: EAR,
  paw: CREAM,
  pawFar: farRamp(CREAM),
  tail: CREAM,
  blush: PINK[0],
  streak: PAPER[1],
  headShade: 3,
  headDeep: 1,
  bodyShade: 3,
  stamps: STAMPS,
  face: { eyeGap: 4.6, eyeV: -10.2, browV: -16.4, blushU: 10, blushR: [2.4, 1.4] },
  accessories: [strings, apron, bow, curlers, ladle]
})

// ------------------------------------------------------------------------------------------------------ pose

/** Her rest: hands on the hips (elbows out), the ladle in the near fist resting against her shoulder. */
export const momPose = (p: Partial<HamPose> = {}): HamPose =>
  hamPose({
    armN: [-5, 8],
    elbowN: [-9, 4],
    armF: [5, 8],
    elbowF: [9, 4.5],
    farBehind: true,
    footN: [12, 0, 0],
    footF: [-4, 0, 0],
    scarf: [70, 8, 0.6, 0],
    brow: 'angry',
    mouth: 'frown',
    blush: false,
    ...p,
    // her torso is a little taller than a child's: every pose carries a slight stretch
    squash: STAND + (p.squash ?? 0),
    acc: { ladle: -28, ...p.acc }
  })

/** The stretch every pose of hers carries (a taller torso than her son's). */
const STAND = -2

export const drawMom = (p: HamPose): Raster => drawHamster(MOM_LOOK, p)

/**
 * Her head ball (for tests that measure the silhouette against it): the centre of the skull on screen and the
 * half-width of the jaw, the widest part of the head.
 */
export function momHeadBall(pose: HamPose) {
  const { head } = hamFrames(MOM_LOOK, pose)
  const [cx, cy] = head.pt(0.5, -9)
  return { cx, cy, rx: Math.hypot(head.a, head.b) * 16, ry: Math.hypot(head.c, head.d) * 12 }
}

// ----------------------------------------------------------------------------------------------------- clips

const draw = (poses: HamPose[]) => poses.map(drawMom)

/** Hands on hips, a furious breath, the near foot tapping (toe down on frames 1 and 5). */
const idle = memo(() => {
  const n = 8
  const breath = Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos(cyc(i, n)))
  const late = lag(breath, { stiffness: 0.35, damping: 0.5, loop: true })
  const tap = [-34, 0, -24, -38, -34, 0, -24, -38]
  return draw(
    breath.map((b, i) =>
      momPose({
        squash: 0.4 - b * 1.1,
        head: [0, b > 0.6 ? 1 : 0],
        earN: 2 + late[i] * 8,
        earF: 1 + late[i] * 6,
        footN: [12, 0, tap[i]],
        scarf: [72 + Math.sin(cyc(i, n)) * 8, 8, 0.7, cyc(i, n)],
        tail: -late[i],
        mouth: b > 0.6 ? 'grit' : 'frown',
        acc: { ladle: -28 + late[i] * 3, c0: late[i] > 0.15 ? -1 : 0, c1: late[i] > 0.25 ? -1 : 0 }
      })
    )
  )
})

/** Arms free of the hips: no elbows thrown out, the far arm in front of the body. */
const FREE: Partial<HamPose> = { elbowN: undefined, elbowF: undefined, farBehind: false }

/** A raised fist needs reach (CHARACTERS.md "Limbs may cheat"). */
const LONG_ARM = { reach: 1.5, paw: 0.4 } as const

/**
 * 「こらーっ！」: she draws herself up with a huge breath (cheeks full, the ladle swung back), then leans in and
 * bellows with the mouth as wide as the face allows, eyes screwed shut, the ladle thrust up and shaking; curlers,
 * ears and apron strings are flung back by her own shout. The last two frames keep bellowing (sustained).
 */
const yell = memo(() => {
  const shout = (k: number): Partial<HamPose> => ({
    ...FREE,
    ...LONG_ARM,
    upN: true,
    x: 1,
    lean: 13 + k,
    squash: 1.2 - k * 0.3,
    head: [1, k > 0 ? 1 : 0],
    nod: 4 - k,
    jaw: 1.3 - Math.abs(k) * 0.2,
    armN: [-18 + k, -16],
    armF: [7, 3.5],
    footN: [10, 0, 0],
    footF: [-3, 0, 0],
    earN: 30 + k * 3,
    earF: 26 + k * 3,
    scarf: [-8 + k * 6, 12, 2, 1.5 + k],
    eyes: 'squint',
    brow: 'hard',
    mouth: 'gape',
    acc: { ladle: 12 + k * 14, c0: -1, c1: -2 + (k > 0 ? 1 : 0), c2: -1, flap: 0.6 + k * 0.2 }
  })
  return draw([
    // glare: hands still on the hips, the breath starts
    momPose({
      squash: -0.4,
      head: [0, 1],
      nod: -2,
      brow: 'hard',
      mouth: 'grit',
      acc: { ladle: -32 }
    }),
    // the huge breath: drawn up and back, cheeks full, the ladle swung back behind her head
    momPose({
      ...FREE,
      ...LONG_ARM,
      upN: true,
      x: -1,
      lean: -9,
      squash: -1.6,
      head: [-1, 2],
      nod: -8,
      puff: 1.2,
      armN: [-17, -12],
      armF: [5, 5],
      footN: [9, 0, -10],
      earN: -6,
      earF: -4,
      earLift: 1,
      scarf: [70, 9, 0.8, 0.5],
      eyes: 'half',
      brow: 'hard',
      mouth: 'small',
      acc: { ladle: -30, c0: -1, c1: -1, c2: 0, bowUp: 0.4 }
    }),
    // the bellow: leaning in, the ladle thrust up
    momPose({ ...shout(1.2), squash: 2, lean: 16, acc: { ...shout(1.2).acc, ladle: 26 } }),
    momPose(shout(-0.6)),
    // sustained: the mouth and the ladle vibrate
    momPose(shout(0.6)),
    momPose(shout(-0.4))
  ])
})

/**
 * The furious run: contact (0, 4), down (1, 5), passing (2, 6), up (3, 7). The heavy body pounds, leaning in, the
 * ladle held high and jolting a beat after every step, the far arm pumping, apron strings streaming, curlers late.
 */
const move = memo(() => {
  const n = 8
  const FOOT_CYCLE: [number, number, number][] = [
    [10, 0, -10],
    [5, 0, 0],
    [0, 0, 0],
    [-5, 0.5, 24],
    [-9, 3.5, 60],
    [-5.5, 6, 40],
    [2, 5, 8],
    [8, 2, -14]
  ]
  const BOB = [0, -0.6, 1.6, 2]
  const SQUASH = [0.6, 1.6, -0.2, -1.2]
  const bob = Array.from({ length: n }, (_, i) => BOB[i % 4])
  const late = lag(bob, { stiffness: 0.3, damping: 0.4, loop: true })
  const later = lag(late, { stiffness: 0.35, damping: 0.4, loop: true })
  return draw(
    Array.from({ length: n }, (_, i) => {
      const swing = Math.cos(cyc(i - 3.5, n))
      const fn = FOOT_CYCLE[i]
      const ff = FOOT_CYCLE[(i + 4) % n]
      return momPose({
        ...FREE,
        ...LONG_ARM,
        upN: true,
        x: 1,
        y: 2 + bob[i],
        lean: 14,
        squash: SQUASH[i % 4],
        head: [1, 0],
        nod: 3 + late[i] * 1.5,
        armN: [-18 + late[i] * 0.8, -15 + late[i] * 1.2],
        armF: [1 + swing * 6, 5 - Math.abs(swing) * 1.5],
        farBehind: swing < -0.3,
        footN: [fn[0] + 3, fn[1], fn[2]],
        footF: [ff[0] - 2, ff[1], ff[2]],
        earN: 26 + late[i] * 6,
        earF: 22 + late[i] * 5,
        scarf: [-6 + Math.sin(cyc(i, n) + 1) * 8, 13, 2.4, cyc(i, n) * 2],
        tail: -late[i],
        jaw: i >= 4 ? 0.6 : 0,
        eyes: 'open',
        brow: 'hard',
        mouth: i >= 4 ? 'wide' : 'grit',
        acc: {
          ladle: 14 + late[i] * 7,
          c0: Math.round(clamp(later[i], -1.5, 1.5)),
          c1: Math.round(clamp(late[i], -1.5, 1.5)),
          c2: Math.round(clamp(later[i] * 0.8, -1.5, 1.5)),
          flap: 0.7 + Math.sin(cyc(i, n) * 2) * 0.3,
          bowUp: 0.5 + late[i] * 0.15
        }
      })
    })
  )
})

/**
 * Stunned: she reels on the spot, swaying from one foot to the other, eyes spinning, the ladle dragging from a
 * limp arm, the back curler dangling from a loose lock, the mouth a wobbly line. (The game draws the stars.)
 */
const stunned = memo(() => {
  const n = 6
  const sway = Array.from({ length: n }, (_, i) => Math.sin(cyc(i, n)))
  const late = lag(sway, { stiffness: 0.3, damping: 0.35, loop: true })
  return draw(
    sway.map((w, i) =>
      momPose({
        ...FREE,
        x: Math.round(w * 1.5),
        lean: w * 5,
        squash: 0.6,
        nod: -late[i] * 6,
        armN: [-5, 8],
        armF: [4, 8],
        farBehind: true,
        footN: [9, w > 0.5 ? 1 : 0, 0],
        footF: [-2, w < -0.5 ? 1 : 0, 0],
        earN: 14 - late[i] * 10,
        earF: -10 + late[i] * 8,
        earLift: -0.5,
        scarf: [80 + late[i] * 14, 9, 0.8, i],
        eyes: i % 2 ? 'dizzy2' : 'dizzy',
        brow: 'worried',
        mouth: 'flat',
        acc: { ladle: -104 - late[i] * 6, loose: 1, dangle: late[i] * 26 }
      })
    )
  )
})

/**
 * Out of breath: bent forward, the far paw on her knee and the ladle dropped on the ground, the near paw pressing
 * the small of her back, panting with the tongue out, brows no longer angry. (The game adds the sweat.)
 */
const tired = memo(() => {
  const n = 6
  // two quick pants per loop: in (chest up), out
  const pant = [0, 0.8, 0.3, 0, 0.8, 0.3]
  const late = lag(pant, { stiffness: 0.35, damping: 0.45, loop: true })
  return draw(
    pant.map((b, i) =>
      momPose({
        ...FREE,
        y: -0.5 + b * 0.6,
        lean: 9 - b * 2,
        squash: 0.8 - b * 1.2,
        head: [2, -3 + Math.round(b)],
        nod: 12 - b * 3,
        armN: [-7, 6],
        elbowN: [-9, 0],
        armF: [6, 8],
        footN: [10, 0, 0],
        footF: [-3, 0, 0],
        earN: 30 + late[i] * 6,
        earF: -14 - late[i] * 4,
        earLift: -0.6,
        scarf: [88 + late[i] * 4, 8, 0.4, i * 0.8],
        tail: 1,
        jaw: 0.5 + b * 0.4,
        eyes: 'half',
        brow: 'worried',
        mouth: 'tongue',
        acc: { ladle: -4, dropped: 1, dropU: 13, c1: Math.round(-late[i] * 0.8) }
      })
    )
  )
})

/** Hit: a start (eyes wide, the ladle jerks up, everything flies), the recoil, then she glares again. */
const hurt = memo(() =>
  draw([
    momPose({
      ...FREE,
      ...LONG_ARM,
      x: -3,
      air: 2,
      lean: -14,
      squash: -1.8,
      head: [-1, 1],
      nod: -10,
      armN: [-8, -8],
      armF: [10, -3],
      open: true,
      footN: [11, 2, -24],
      footF: [1, 1, -18],
      earN: -24,
      earF: -20,
      earLift: 1.5,
      scarf: [-50, 11, 2, 0],
      eyes: 'wide',
      brow: 'raised',
      mouth: 'o',
      acc: { ladle: -26, c0: -2, c1: -3, c2: -2, flap: -0.6, bowUp: 1 }
    }),
    momPose({
      ...FREE,
      x: -2,
      lean: -6,
      squash: 1.8,
      head: [0, -1],
      nod: 6,
      armN: [-6, 4],
      armF: [8, 4],
      footF: [-1, 0, -6],
      earN: -4,
      earF: -3,
      scarf: [20, 10, 1.6, 1.6],
      eyes: 'hurt',
      brow: 'worried',
      mouth: 'grit',
      acc: { ladle: -10, c0: 1, c1: 1, c2: 0, flap: 0.4 }
    }),
    momPose({
      x: -1,
      lean: 3,
      squash: 0.6,
      nod: 2,
      earN: 6,
      earF: 4,
      scarf: [56, 9, 1.2, 3],
      brow: 'hard',
      mouth: 'grit',
      acc: { ladle: -24, c1: -1 }
    })
  ])
)

export const sheets: SheetModule = {
  mom: () => ({
    idle: lazyAnim(idle, 8, true),
    yell: lazyAnim(yell, 10, false, { sustain: 2 }),
    move: lazyAnim(move, 14, true),
    stunned: lazyAnim(stunned, 8, true),
    tired: lazyAnim(tired, 6, true),
    hurt: lazyAnim(hurt, 12, false)
  })
}

/**
 * ハム姫 (`princess`): the star princess, drawn on the hamster family build (`hamster.ts`) a touch smaller and
 * rounder than ハム彦. Snow-white fur with a pink-lavender shadow, a cream-white muzzle, rose ear bowls and paws,
 * big sparkling eyes with a second highlight and lashes, a soft curl on the forehead instead of his spiky tuft, a
 * gold star tiara between the ears that glints, and a pink ribbon collar tied in a bow at the side of the neck
 * with two short tails (her soft, lagging part, as the scarf is his).
 *
 * Her accessories are the look's hooks: the bow tails, the collar, the bow, the tiara (and its glint), a tear, and
 * the skirt-like flare of the belly fur in the cheer.
 *
 * Depth (back to front): far ear, tail, far leg, far foot, near leg, belly flare, body, far arm, near foot, collar,
 * bow tails, bow, near ear, head + face, tiara, near arm, tear (over the clasped paws) (the kit's list in `hamster.ts`, plus hers).
 */
import type { SheetModule } from '../module'
import { clamp, ease, lag, lerp, type Key } from '../motion'
import { C, R, color, ramp } from '../palette'
import { Raster, farRamp, type Pt, type Ramp } from '../raster'
import {
  Frame,
  carve,
  cel,
  fill,
  minus,
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
  sample,
  stampOn,
  type Eyes,
  type HamAccessory,
  type HamPose,
  type StampPair,
  type Tuft
} from './hamster'

const WHITE = R.princessWhite
const PINK = R.princessPink
const GOLD = R.gold
const WATER = R.water
const INK = '#2a1230'
/** Her muzzle and belly: a cream-white only a shade off the fur; it shades into the fur's lavender. */
const MASK = ramp('#fffcf8', '#fff0e6', '#ecd3e6', '#b99ac4', INK)
/** Paws and feet: the palest rose, shading into the ear pink. */
const PAW: Ramp = [PINK[0], PINK[0], PINK[1], PINK[2], PINK[4]]
const PAW_FAR: Ramp = [PINK[0], PINK[1], PINK[2], PINK[3], PINK[4]]
const BLUSH = color('#ff6f9f')

// ---------------------------------------------------------------------------------------------------- stamps

/**
 * Her eyes: the family's tall dark eye with a deep rose iris low in it, the big highlight at the top-left, a
 * second one low on the other side, and two lash pixels at the outer corner (left of the near eye, right of the
 * far one). `a` iris, `s` a rose glint, `t` / `u` the water of a welling tear.
 */
const EYES_P: Record<Eyes, StampPair> = {
  open: [
    ['i.KKKK.', '.KwwKKK', 'iKwwKKK', '.KKKKKK', '.KKKKaK', '.KKaawK', '.KaaawK', '..KKKK.'],
    ['.KKK.i', 'KwwKK.', 'KwwKKi', 'KKKKK.', 'KKKaK.', 'KaawK.', 'KaawK.', '.KKK..']
  ],
  wet: [
    ['i.KKKK.', '.KwwKKK', 'iKwwKKK', '.KKKKKK', '.KKKKwK', '.KKaawK', '.KaaatK', '..KKuu.'],
    ['.KKK.i', 'KwwKK.', 'KwwKKi', 'KKKKK.', 'KKKwK.', 'KaawK.', 'KaatK.', '.Kuu..']
  ],
  half: [
    ['i......', '.......', 'iiiiiii', '.KwwKKK', '.KKKKaK', '.KKaawK', '.KaaawK', '..KKKK.'],
    ['.....i', '......', 'iiiiii', 'KwwKK.', 'KKKaK.', 'KaawK.', 'KaawK.', '.KKK..']
  ],
  closed: [
    ['.......', '.......', '.......', '.......', 'ii....i', '..iiii.', '.......', '.......'],
    ['......', '......', '......', '......', 'i...ii', '.iii..', '......', '......']
  ],
  happy: [
    ['.......', '.......', '.......', '..iiii.', 'ii....i', '.i....i', '.......', '.......'],
    ['......', '......', '......', '.iii..', 'i...ii', 'i...i.', '......', '......']
  ],
  wide: [
    ['i.KKKK.', '.KwwKKK', 'iKwwKKK', '.KKKKKK', '.KKKKaK', '.KKaawK', '.KaawwK', '..KKKK.'],
    ['.KKK.i', 'KwwKK.', 'KwwKKi', 'KKKKK.', 'KKKaK.', 'KawwK.', 'KaawK.', '.KKK..']
  ],
  squint: [
    ['.......', '.......', '.......', 'iii....', '..iiiii', '.......', '.......', '.......'],
    ['......', '......', '......', '....ii', 'iiii..', '......', '......', '......']
  ],
  hurt: [
    ['.......', '.ii....', '...ii..', '.....ii', '...ii..', '.ii....', '.......', '.......'],
    ['......', '....i.', '..ii..', 'ii....', '..ii..', '....i.', '......', '......']
  ],
  dizzy: [
    ['.......', '..iiii.', '.i....i', '.i.ii.i', '.i.i..i', '.i...i.', '..ii...', '.......'],
    ['......', '.iii..', 'i...i.', 'i.i.i.', 'i.ii..', '.i....', '......', '......']
  ],
  dizzy2: [
    ['.......', '....ii.', '..i...i', '.i..i.i', '.i.ii.i', '.i....i', '..iiii.', '.......'],
    ['......', '..ii..', '.i..i.', 'i.i.i.', 'i...i.', '.iii..', '......', '......']
  ]
}

/** Soft rose brows (thinner than the hero's ink ones). */
const BROWS_P = {
  angry: [
    ['bb..', '.bbb'],
    ['.bb', 'bb.']
  ],
  hard: [
    ['bbb..', '.bbbb'],
    ['..bb', 'bbb.']
  ],
  worried: [
    ['...bb', '.bb..'],
    ['bb..', '..bb']
  ],
  raised: [
    ['.bb.', 'b..b'],
    ['.b.', 'b.b']
  ]
} as const

/**
 * The forehead curl: one soft lock that rolls forward and curls back on itself (`L` lit side, `P` base, `S` the
 * skull rows it grows from). All variants share a height so the skull rows stay on one line.
 */
const CURLS: Record<Tuft, readonly string[]> = {
  neutral: ['..LLPP.', '.LP..PD', '.LP..PD', '..LP.D.', 'SSSSSSS', 'SSSSSSS'],
  // blown back (flying up in the cheer)
  back: ['.......', 'LLLPP..', 'LP..PD.', '.LP.PD.', 'SSSSSSS', 'SSSSSSS'],
  // lifted and springy
  up: ['.LLPP..', 'LP..PD.', 'LP..PD.', '.LP.D..', 'SSSSSSS', 'SSSSSSS']
}

const BASE = hamStamps(WHITE, PINK)
const STAMPS = {
  ...BASE,
  eyes: EYES_P,
  eyeKey: { K: C.black, w: C.white, a: PINK[3], s: PINK[1], i: C.ink, b: PINK[3], t: WATER[0], u: WATER[1] },
  brows: BROWS_P,
  mouths: {
    ...BASE.mouths,
    smile: ['K.K.K', '.K.K.'],
    grin: ['KKKKK', 'KmmmK', '.KKK.'],
    open: ['KKKKK', 'KmtmK', '.KKK.'],
    wide: ['KKKKKK', 'KmmmmK', 'KmttmK', '.KKKK.'],
    small: ['K.K', '.K.'],
    frown: ['.KKK.', 'K...K']
  },
  nose: ['hn', 'nn'],
  noseKey: { h: PINK[0], n: PINK[2] },
  tufts: CURLS,
  tuftShape: { L: WHITE[1], P: WHITE[1], D: WHITE[1], S: WHITE[1] },
  tuftLit: { L: WHITE[0], P: WHITE[1], D: WHITE[2] }
}

// ------------------------------------------------------------------------------------------------ accessories

/** The pink ribbon collar round the neck. */
const collar: HamAccessory = ({ g, torso, head, headShape, s }) =>
  g.add(1, (l) => {
    const band = spline([torso.pt(-9, -14.6), torso.pt(-3, -12.4), torso.pt(4.5, -12.2), torso.pt(10, -14)])
    ribbon(l, band, () => 2.8 * s, PINK[1])
    cel(l, { shade: 1.2 * s, rim: 1 })
    shadow(l, head.moved(0.5 * s, 1.2 * s), headShape)
  })

/** Where the bow sits: the side of the neck, on the collar, where it shows against the sky. */
const BOW: Pt = [-8.4, -14.6]

/** The two bow tails, hanging from the bow and driven by `pose.scarf` (direction, length, ripple, phase). */
const tails: HamAccessory = ({ g, pose: p, torso, s }) => {
  const at = torso.pt(BOW[0], BOW[1] + 1)
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
  const tail = (depth: number, angle: number, len: number, phase: number, c: number) =>
    g.add(depth, (l) => {
      const path = end(angle, len, phase)
      ribbon(l, path, (t) => (2 + t * 1.2) * s, c)
      // a V notch at the cut end
      const e = path[path.length - 1]
      const b = path[Math.max(0, path.length - 4)]
      const d = Math.hypot(e[0] - b[0], e[1] - b[1]) || 1
      const [ux, uy] = [(e[0] - b[0]) / d, (e[1] - b[1]) / d]
      carve(
        l,
        Frame.at(0, 0),
        polygon([
          [e[0] + ux * 2 - uy * 1.2, e[1] + uy * 2 + ux * 1.2],
          [e[0] - ux * 1.2, e[1] - uy * 1.2],
          [e[0] + ux * 2 + uy * 1.2, e[1] + uy * 2 - ux * 1.2]
        ])
      )
      smooth(l)
      cel(l, { shade: 1.1 * s, rim: 1 })
    })
  tail(-4, p.scarf[0] - 14, p.scarf[1], p.scarf[3], PINK[1])
  tail(-4.2, p.scarf[0] + 16, p.scarf[1] * 0.8, p.scarf[3] + 1.4, PINK[2])
}

/** The bow: two loops and a knot, lifting with `acc.bowUp` (0 rests … 1 flies up). */
const bow: HamAccessory = ({ g, pose: p, torso, s }) =>
  g.add(1.1, (l) => {
    const up = p.acc.bowUp ?? 0
    const k = torso.child(BOW[0], BOW[1], -8 - up * 14)
    // two loops spreading up and back from the knot, like a butterfly seen from the side
    fill(l, k, union(oval(-2.6, -2.2 - up, 2.8, 2.3), oval(-2.4, 2.2 - up * 0.4, 2.6, 2)), PINK[1])
    fill(l, k, oval(0, 0, 1.6, 1.7), PINK[1])
    smooth(l)
    cel(l, { shade: 1.4 * s, rim: 1 })
    // the folds inside the loops, the knot
    shadow(l, k, union(oval(-1.6, -1.4 - up, 1.2, 0.7), oval(-1.5, 1.5 - up * 0.4, 1.1, 0.6)))
    fill(l, k, oval(0.2, 0, 1.2, 1.3), PINK[2])
  })

/** The gold star tiara on the crown: a thin band hugging the skull and a star; `acc.glint` makes it sparkle. */
const STAR = ['...h...', '..hhy..', 'hhhhyyY', '.hhyyY.', '..yyY..', '.yY.YY.']
const STAR_GLINT = ['...w...', '..whh..', 'hhwhyyY', '.hhyyY.', '..yyY..', '.yY.YY.']
const STAR_FLASH = ['...w...', '..www..', 'wwwwwyY', '.wwhyY.', '..hyY..', '.yY.YY.']
const tiara: HamAccessory = ({ g, pose: p, head, s }) =>
  g.add(2.2, (l) => {
    const skull = squircle(0.5, -12, 14.5, 11.5, 2.5)
    const band = overlap(
      minus(squircle(0.5, -12, 15.6, 12.6, 2.5), skull),
      polygon([
        [-9.5, -30],
        [0.5, -30],
        [0.5, -20],
        [-9.5, -20]
      ])
    )
    fill(l, head, band, GOLD[1])
    cel(l, { shade: 1.2 * s })
    const glint = p.acc.glint ?? 0
    stampOn(l, head, glint > 1 ? STAR_FLASH : glint > 0 ? STAR_GLINT : STAR, -4.2, -26.6, {
      h: GOLD[0],
      y: GOLD[1],
      Y: GOLD[2],
      w: C.white
    })
  })

/**
 * A tear at the near eye: `acc.tear` 0 (none) … 1 swelling on the lower lid, … 2 running down the cheek, … 3 off
 * the chin. Painted on the face without an outline (it is water on fur).
 */
const tear: HamAccessory = ({ g, pose: p, head, fc, look }) => {
  const t = p.acc.tear ?? 0
  if (t <= 0) return
  const u = Math.max(look.face.eyeMin, fc - look.face.eyeGap) + 1
  g.add(
    3.2,
    (l) => {
      if (t < 1) {
        // swelling on the lid
        const r = 0.6 + t * 0.7
        fill(l, head, oval(u, -5.6, r + 0.3, r), WATER[1])
        fill(l, head, oval(u - 0.4, -6, 0.5, 0.5), WATER[0])
      } else {
        const v = -5.6 + (t - 1) * 4.5
        // the wet track behind it
        fill(l, head, overlap(oval(u, -5.6, 0.55, 0.6 + (v + 5.6)), oval(u, v - 1, 1, 9)), WATER[0])
        fill(l, head, oval(u, v, 1.1, 1.4), WATER[1])
        fill(l, head, oval(u - 0.4, v - 0.6, 0.5, 0.5), C.white)
      }
    },
    false
  )
}

/** The belly fur flaring out like a skirt (`acc.flare` 0 … 1), behind the body and over the legs. */
const flare: HamAccessory = ({ g, pose: p, torso, s }) => {
  const k = p.acc.flare ?? 0
  if (k <= 0) return
  g.add(-0.9, (l) => {
    const w = 11 + k * 3
    const hem = [oval(0, -3.5, w, 4.2 + k)]
    for (const du of [-w + 2, -w / 2 + 1, 0, w / 2 - 1, w - 2]) hem.push(oval(du, -0.6 + k, 2.4, 1.6))
    fill(l, torso, union(...hem), WHITE[1])
    smooth(l)
    cel(l, { shade: 1.6 * s })
  })
}

/** ハム姫's look. */
export const PRINCESS_LOOK = hamLook({
  scale: 0.92,
  head: 1.04,
  body: 1.04,
  ear: 0.96,
  fur: WHITE,
  furFar: farRamp(WHITE),
  mask: MASK,
  earBowl: PINK,
  paw: PAW,
  pawFar: PAW_FAR,
  blush: BLUSH,
  streak: PINK[1],
  headShade: 3.6,
  headDeep: 1.4,
  bodyShade: 3,
  stamps: STAMPS,
  face: { tuftU: 3.6, tuftV: -23.5, eyeGap: 4.5, blushR: [2.3, 1.3] },
  accessories: [flare, collar, tails, bow, tear, tiara],
  outline: 'ink'
})

// ------------------------------------------------------------------------------------------------------ pose

/** Her pose: the family pose with her own rest (paws together in front, the bow tails hanging). */
export const princessPose = (p: Partial<HamPose> = {}): HamPose =>
  hamPose({ armN: [5, 4], armF: [2, 2.5], scarf: [60, 6, 0.6, 0], ...p })

export const drawPrincess = (p: HamPose): Raster => drawHamster(PRINCESS_LOOK, p)

/**
 * Her head ball (for tests that measure the silhouette against it): the centre of the skull on screen and the
 * half-width of the jaw, the widest part of the head.
 */
export function princessHeadBall(pose: HamPose) {
  const { head } = hamFrames(PRINCESS_LOOK, pose)
  const [cx, cy] = head.pt(0.5, -9)
  const [rx] = [Math.hypot(head.a, head.b) * 16]
  return { cx, cy, rx, ry: Math.hypot(head.c, head.d) * 12 }
}

// ----------------------------------------------------------------------------------------------------- clips

const draw = (poses: HamPose[]) => poses.map(drawPrincess)

/** A gentle breath; she tilts her head once; the bow tails sway; the tiara glints. */
const idle = memo(() => {
  const n = 8
  const breath = Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos(cyc(i, n)))
  const late = lag(breath, { stiffness: 0.35, damping: 0.5, loop: true })
  const tilt = [0, 0, -3, -6, -6, -3, 0, 0]
  return draw(
    breath.map((b, i) =>
      princessPose({
        squash: 0.4 - b * 0.9,
        head: [0, b > 0.6 ? 1 : 0],
        nod: tilt[i],
        earN: 2 + late[i] * 7 - tilt[i] * 0.6,
        earF: 1 + late[i] * 5 - tilt[i] * 0.5,
        armN: [5, 4 - Math.round(b)],
        armF: [2, 2.5 - Math.round(b)],
        scarf: [60 + Math.sin(cyc(i, n)) * 10, 6, 0.8, cyc(i, n)],
        tail: -late[i],
        acc: { glint: i === 2 ? 1 : i === 3 ? 2 : 0 }
      })
    )
  )
})

/** Caged: slumped, ears drooping, paws clasped under the chin, head bowed and trembling, a tear falls. */
const sad = memo(() => {
  const n = 6
  // a sob: the shoulders hitch up on the in-breath (1, 2) and sink with the out-breath (3 … 5)
  const sob = [0, 0.7, 1, 0.5, 0.15, 0]
  const late = lag(sob, { stiffness: 0.4, damping: 0.45, loop: true })
  // the head trembles a pixel, never back and forth on neighbouring frames (no on-off-on-off)
  const shake = [0, 1, 1, 0, 1, 1]
  return draw(
    Array.from({ length: n }, (_, i) =>
      princessPose({
        y: -1 + sob[i] * 0.8,
        squash: 1.2 - sob[i] * 1.4,
        lean: 6,
        head: [shake[i] * 0.9, -3 + Math.round(sob[i])],
        nod: 14 - sob[i] * 2,
        earN: 76 + late[i] * 8,
        earF: -48 - late[i] * 8,
        earLift: -1.5,
        farFront: true,
        paw: 0.3,
        armN: [9, -4 - Math.round(sob[i])],
        armF: [2, -3.5 - Math.round(sob[i])],
        tuft: 'neutral',
        scarf: [84 + late[i] * 6, 5, 0.4, i],
        eyes: 'wet',
        brow: 'worried',
        mouth: i === 2 ? 'o' : 'frown',
        acc: { tear: [0.3, 0.8, 1, 1.4, 1.8, 2.2][i] }
      })
    )
  )
})

/** Freed: crouch, a hop with both arms thrown up, eyes closed in arcs, mouth wide, ears and bow flying. */
const cheer = memo(() => {
  const keys: Key<HamPose>[] = [
    { at: 0, pose: { squash: 3, headSquash: 0.8, y: -1.5, air: 0, nod: 8, up: false, armN: [5, 3], armF: [3, 4] } },
    {
      at: 1,
      pose: { squash: -2.8, headSquash: -0.8, y: 0, air: 3, nod: -6, up: true, armN: [-16, -10], armF: [15, -10] }
    },
    {
      at: 2,
      pose: { squash: -1.2, headSquash: -0.3, air: 6, nod: -8, armN: [-17, -13], armF: [16, -13] },
      ease: ease.out
    },
    { at: 3, pose: { squash: 0, headSquash: 0, air: 7, nod: -6, armN: [-18, -12], armF: [17, -12] } },
    { at: 4, pose: { air: 6, nod: -4, armN: [-17, -11], armF: [16, -11] }, ease: ease.inOut },
    { at: 5, pose: { air: 3, squash: -1, nod: -2, up: false, armN: [-8, -5], armF: [9, -5] }, ease: ease.in },
    { at: 6, pose: { air: 0, squash: 2.6, headSquash: 0.8, y: -1.5, nod: 7, armN: [-4, -2], armF: [6, -2] } },
    { at: 7, pose: { squash: 0.6, headSquash: 0.2, y: -0.5, nod: 4, armN: [3, 1], armF: [4, 1] } }
  ]
  const poses = sample(princessPose({ reach: 1.5, paw: 0.4, eyes: 'happy', mouth: 'wide' }), keys, 8)
  const late = lag(
    poses.map((p) => p.air),
    { stiffness: 0.35, damping: 0.4, loop: true }
  )
  const falling = [0, 0, 0, 0, 0.6, 1, 0.5, 0]
  return draw(
    poses.map((p, i) => ({
      ...p,
      footN: [0, p.air > 1 ? 2 : 0, p.air > 1 ? 30 : 0] as const,
      footF: [1, p.air > 1 ? 1.5 : 0, p.air > 1 ? 22 : 0] as const,
      earN: 4 + late[i] * 4,
      earF: 3 + late[i] * 3.5,
      earLift: clamp(-late[i] * 0.6, -1, 2),
      tuft: late[i] > 1 ? ('back' as const) : late[i] < -1 ? ('up' as const) : ('neutral' as const),
      scarf: [lerp(70, -60, clamp(late[i] / 6, 0, 1)), 6.5, 1.2, i * 0.9] as const,
      mouth: i === 0 || i === 6 ? ('grin' as const) : ('wide' as const),
      acc: { flare: falling[i], bowUp: clamp(late[i] / 5, 0, 1), glint: i === 2 ? 2 : i === 3 ? 1 : 0 }
    }))
  )
})

/** At the goal: one arm up waving from the wrist, a little bounce on her toes, eyes on the hero, smiling. */
const wave = memo(() => {
  const n = 6
  // the waving paw on an arc over her head: out, up, in, up (from the wrist)
  const hand: readonly (readonly [number, number])[] = [
    [17, -8],
    [16, -12],
    [13, -16],
    [11, -18],
    [14, -15],
    [17, -11]
  ]
  const bounce = [0, 1, 1.5, 1, 0, -0.5]
  const late = lag(bounce, { stiffness: 0.4, damping: 0.45, loop: true })
  return draw(
    Array.from({ length: n }, (_, i) =>
      princessPose({
        reach: 1.5,
        paw: 0.4,
        upF: true,
        y: bounce[i],
        squash: -bounce[i] * 0.5,
        footN: [0, 0, bounce[i] > 0.5 ? -10 : 0],
        nod: -3,
        look: 0.5,
        armF: hand[i],
        armN: [7, -1],
        earN: 3 - late[i] * 3,
        earF: 2 - late[i] * 2.5,
        scarf: [78 - late[i] * 8, 6, 0.8, i * 1.05],
        eyes: 'open',
        mouth: i === 2 ? 'open' : 'smile',
        acc: { glint: i === 4 ? 1 : 0 }
      })
    )
  )
})

export const sheets: SheetModule = {
  princess: () => ({
    idle: lazyAnim(idle, 8, true),
    sad: lazyAnim(sad, 6, true),
    cheer: lazyAnim(cheer, 12, true),
    wave: lazyAnim(wave, 8, true)
  })
}

import { UI_SPEC } from '../contract'
import type { SheetModule } from '../module'
import { drawHamster, hamPose, stampOn, type HamAccessory, type HamLook, type HamPose } from '../chars/hamster'
import { HERO_LOOK } from '../chars/hero'
import { KING_LOOK, kingPose } from '../chars/king'
import { MOM_LOOK, momPose } from '../chars/mom'
import { PRINCESS_LOOK, princessPose } from '../chars/princess'
import { C, OUTLINE_OF, R, color, ramp, type Ramp } from '../palette'
import { Painter, Raster, ball, farRamp } from '../raster'
import {
  Frame,
  capsule,
  cel,
  egg,
  fill,
  half,
  mantle,
  minus,
  oval,
  overlap,
  polygon,
  ribbon,
  shadow,
  smooth,
  spline,
  squircle,
  stampAt,
  tint,
  union,
  within
} from '../rig'
import { lazyAnim, memo, type Anim } from '../sheet'

/**
 * `ui`: the twelve 32×32 character portraits (`face_*`) and the seven stage emblems (`theme_*`).
 *
 * Portraits are head-and-shoulders busts facing three-quarters right that show the design of the redrawn sprites
 * (CHARACTERS.md "The portrait is the character"). The four hamsters are drawn by the family rig itself
 * (`drawHamster` with their own looks at a portrait scale); each boss repeats the head of its sprite (the same shapes
 * in head units, ramps and stamps) on a smaller head frame with a soft `Painter`, over a simplified neck and
 * shoulders. Every bust is cut flat at row 29 and closed by its materials' line colours. Emblems are small
 * landscape vignettes in one rounded-square frame.
 */

const make = (name: string, frame: () => Raster): Anim =>
  lazyAnim(() => [frame()], UI_SPEC[name].fps, UI_SPEC[name].loop)
const S = 32

// ------------------------------------------------------------------------------------------------- hamsters

/**
 * A hamster bust drawn by the family rig itself (`drawHamster`), so the portrait is the sprite's own design: the
 * look at a portrait scale (stamps keep their pixel size), standing with its soles below the cell; the figure is
 * drawn whole into a taller layer (so the cel light sees the full body), then cut flat at row 29 and closed by the
 * outline colour of each material on row 30.
 */
function hamBust(look: HamLook, pose: HamPose, ax: number): Raster {
  const full = drawHamster(look, pose, { w: S, h: 72, anchor: [ax, 64] })
  // the topmost pixel (ear, tuft or crown) on row 1
  return cutBust(full, (full.bounds()?.y ?? 1) - 1)
}

/**
 * Rows `dy` … `dy + 29` of a taller picture, cut flat at row 29 and closed by each material's line colour on row 30.
 * Whatever reaches past column 1 or 30 (a shoulder, a scarf's knot) is cut there and closed the same way, so the
 * bust keeps a 1-px empty margin and an outline all round.
 */
function cutBust(full: Raster, dy = 0, last = 29): Raster {
  const out = new Raster(S, S)
  for (let y = 0; y <= last; y++) for (let x = 1; x < S - 1; x++) out.set(x, y, full.get(x, y + dy))
  for (let x = 1; x < S - 1; x++) {
    const c = full.get(x, last + dy)
    if (c) out.set(x, last + 1, OUTLINE_OF[c].line)
  }
  for (let y = 0; y <= last; y++)
    for (const [edge, beyond] of [
      [1, 0],
      [S - 2, S - 1]
    ]) {
      const c = out.get(edge, y)
      if (c && full.get(beyond, y + dy)) out.set(edge, y, OUTLINE_OF[c].line)
    }
  return out
}

/**
 * A look at a portrait scale: the face stamps keep their pixel size, so their positions (in head units) are spread
 * back to the sprite's spacing in pixels.
 */
function portraitLook(look: HamLook, scale: number, face: Partial<HamLook['face']> = {}): HamLook {
  return { ...look, scale, face: { ...look.face, ...face } }
}

const hero2 = () =>
  hamBust(
    portraitLook(HERO_LOOK, 0.8, {
      eyeGap: 5.4,
      eyeMin: -14,
      eyeMax: 11.4,
      eyeV: -10.8,
      noseV: -6,
      mouthV: -5.2,
      blushR: [3.2, 1.8]
    }),
    hamPose({ look: -1, armN: [6, 3], armF: [2, 3] }),
    15.5
  )

/**
 * Her ribbon bow at the side of the neck (the sprite's shapes), brought in front of the cheek: on the bust the
 * sprite's place for it is hidden under the head.
 */
const princessBow: HamAccessory = ({ g, torso, s }) =>
  g.add(2.3, (l) => {
    const PINK = R.princessPink
    const k = torso.child(-9, -16, -14, 1.15)
    fill(l, k, union(oval(-2.6, -2.2, 2.8, 2.3), oval(-2.4, 2.2, 2.6, 2), oval(2.4, -1.6, 2.2, 1.8)), PINK[1])
    fill(l, k, oval(0, 0, 1.6, 1.7), PINK[1])
    smooth(l)
    cel(l, { shade: 1.4 * s, rim: 1 })
    shadow(l, k, union(oval(-1.6, -1.4, 1.2, 0.7), oval(-1.5, 1.5, 1.1, 0.6)))
    fill(l, k, oval(0.2, 0, 1.2, 1.3), PINK[2])
  })

const princess2 = () =>
  hamBust(
    {
      ...portraitLook(PRINCESS_LOOK, 0.8, {
        eyeGap: 5.4,
        eyeMin: -14,
        eyeMax: 11.4,
        eyeV: -10.8,
        blushR: [2.9, 1.6],
        // the forehead curl a little lower, under the tiara, where it shows on the small head
        tuftU: 5,
        tuftV: -21.5
      }),
      accessories: [...PRINCESS_LOOK.accessories, princessBow]
    },
    princessPose({ look: -1, acc: { glint: 1 } }),
    15.5
  )

/** Her hair roller (the sprite's stamp): pink, a highlight, two ribs, the darker underside. */
const CURLER = ['.LLLLL.', 'LwLLLLP', 'PPPPPPD', 'PDPDPDD', '.DDDDD.']
const CURLER_KEY = { L: R.hamEar[0], w: C.white, P: R.hamEar[1], D: R.hamEar[2] }

/** The three curlers, each on its own layer so each keeps its outline where they overlap on the small head. */
const momCurlers: HamAccessory = ({ g, head }) => {
  const at: [number, number, number][] = [
    [-8.6, -21.4, 2.1],
    [8.4, -22, 2.11],
    [0, -24.2, 2.12]
  ]
  for (const [u, v, depth] of at) g.add(depth, (l) => stampOn(l, head, CURLER, u, v, CURLER_KEY))
}

/** Her cross eyes a size down (6×8 / 5×8) for the small head: the lid still slopes down toward the nose. */
const MOM_EYES = [
  ['KK....', 'KwwKK.', 'KwwKKK', 'KKKKKK', 'KKKKKK', 'KKKKsK', 'KKKKKK', '.KKKK.'],
  ['...KK', '.KKKK', 'KwwKK', 'KwwKK', 'KKKKK', 'KKKsK', 'KKKKK', '.KKK.']
] as const

const mom2 = () =>
  hamBust(
    {
      ...portraitLook(MOM_LOOK, 0.95, { eyeGap: 5.4, eyeMin: -14, eyeMax: 14, eyeV: -9.6, browV: -15.4 }),
      stamps: { ...MOM_LOOK.stamps, eyes: { ...MOM_LOOK.stamps.eyes, open: MOM_EYES } },
      // the apron strings, the apron and its bow; the curlers are redrawn for the small head, the ladle stays out
      accessories: [...MOM_LOOK.accessories.slice(0, 3), momCurlers]
    },
    momPose({ look: -1.5 }),
    15.5
  )

// The king's face a size down for the portrait (the sprite's own stamps are drawn for a head twice this size),
// in the sprite's keys: `K` lid, `y` the glow's hot top, `Y` yellow, `o` its orange underside, `p` the slit pupil,
// `b` / `B` the brow's lit ridge and its dark fur.
const KING_EYES = [
  ['KK....', 'KyKK..', 'KyyyKK', 'KyYpYK', 'KYYpYK', 'KYYpoK', '.KooK.', '..KK..'],
  ['...KK', '.KKyK', 'KyyyK', 'KYpYK', 'KYpYK', 'KYpoK', '.KoK.', '..K..']
] as const
const KING_BROWS = [
  ['bb....', 'BBbbb.', '.BBBBb', '...BBB'],
  ['..bb', 'bbBB', 'BBB.', 'B...']
] as const
/** The sneer: a flat lip with the two fangs hanging over it. */
const KING_MOUTH = ['KKKKKKK', 'KwK.KwK', '.w...w.']
const KING_SCAR = ['s..', '.s.', 'sss', '.s.', '.ss', '..s']
const kingScar: HamAccessory = ({ g, head, fc, look }) =>
  g.add(
    2.05,
    (l) =>
      stampOn(l, head, KING_SCAR, Math.max(look.face.eyeMin, fc - look.face.eyeGap) - 1.4, -13.6, {
        s: R.kingBelly[1]
      }),
    false
  )

/** The crown: a band and five spikes with balls at the tips, the dark star gem in the middle (the sprite's design). */
const CROWN_SPIKES: readonly (readonly [number, number])[] = [
  [-6.2, 3.6],
  [-3.2, 5.2],
  [0, 7],
  [3.2, 5.2],
  [6.2, 3.6]
]
const CROWN_SHAPE = union(
  squircle(0, 0, 7.4, 1.8, 3.5),
  ...CROWN_SPIKES.flatMap(([u, h]) => [
    polygon([
      [u - 1.5, -0.6],
      [u, -0.6 - h],
      [u + 1.5, -0.6]
    ]),
    oval(u, -0.2 - h, 0.95)
  ])
)
const KING_GEM = ['..a..', '.aDd.', 'aDDDd', '.d.d.']
const kingCrown: HamAccessory = ({ g, head, s }) =>
  g.add(2.2, (l) => {
    const c = head.child(0.5, -24.2, 0, 1, 1.3)
    fill(l, c, CROWN_SHAPE, R.gold[1])
    smooth(l)
    cel(l, { shade: 1.2 * s, rim: 1 })
    shadow(l, c, squircle(0, 1.3, 7.4, 0.6, 3))
    stampOn(l, c, KING_GEM, 0, -0.6, { a: R.kingPurple[0], D: R.kingPurple[3], d: R.kingPurple[4] })
  })

const king2 = () => {
  const look = KING_LOOK
  return hamBust(
    {
      ...portraitLook(look, 0.7, { eyeGap: 6.2, eyeMin: -14, eyeMax: 12.5, eyeV: -10, browV: -14.5 }),
      stamps: {
        ...look.stamps,
        eyes: { ...look.stamps.eyes, open: KING_EYES },
        brows: { ...look.stamps.brows, angry: KING_BROWS },
        mouths: { ...look.stamps.mouths, flat: KING_MOUTH },
        nose: ['.nnn.', 'nhnnn', '.nnn.']
      },
      coat: look.coat && { ...look.coat, rim: 1, tooth: 0, headLocks: [], bodyLocks: [] },
      // the cape, its high collar and its edge with the clasp; the scar and the crown are redrawn at this size
      accessories: [...look.accessories.slice(3, 6), kingScar, kingCrown]
    },
    kingPose({ look: -2.2 }),
    16.5
  )
}

// ------------------------------------------------------------------------------------------- boss busts
// Each boss bust repeats the head of its sprite (the same shapes in head units, the same ramps and stamps) on a
// head frame scaled down to the portrait, over a simplified neck and shoulders cut at row 29.

/** A soft Painter for a bust, rendered and cut at row 29 (closed by each material's line colour on row 30). */
function bossBust(draw: (g: Painter) => void): Raster {
  const g = new Painter(S, 40, { soft: true })
  draw(g)
  return cutBust(g.render())
}

/** White fur on the very edge of a part takes the pale base colour, so the outline beside it stays dark. */
function dimEdge(l: Raster, from: number, to: number) {
  const src = l.clone()
  for (let y = 0; y < l.h; y++)
    for (let x = 0; x < l.w; x++)
      if (src.get(x, y) === from && !(src.get(x - 1, y) && src.get(x + 1, y) && src.get(x, y - 1) && src.get(x, y + 1)))
        l.set(x, y, to)
}

const FOX_RUSSET = ramp('#ec8a48', '#c4561f', '#93391a', '#783818', '#3a1a22')
const FOX_PALE = ramp('#ffffff', '#f7efe8', '#dccbc4', '#a68c8c', '#3a1a22')
const FOX_NAVY = ramp('#6c7cc0', '#3e4a86', '#2a3260', '#1b2040', '#1c1830')
const FOX_EYE = ['BB........', '.BBBB.....', '..KKKKKKK.', '..KwwyyKKK', '..KwyyKyoK', '...KyyKoK.', '....KKKK..']
const FOX_PLATE = ['.ddddd.', 'dhhsssd', 'dhsmmsd', 'dssmssd', '.ddddd.']

const foxBoss2 = () =>
  bossBust((g) => {
    const FUR = R.foxOrange
    const FAR = farRamp(FUR)
    const k = 0.8
    const head = Frame.at(12, 19, 0, k)
    const torso = Frame.at(12 - 3.5 * (k / 1.12), 19 + 30 * (k / 1.12), 0, k / 1.12)
    const headAt = head.pt(0, -1)
    // neck, jacket collar and the white chest fur
    const neckEnd = torso.local(...head.pt(-3, 6))
    g.add(0, (l) => {
      fill(l, torso, capsule([2, -17], neckEnd, 5, 4.6), FUR[1])
      fill(l, torso, union(capsule([0, -4], [1.5, -12], 6.6, 8.6), oval(2, -14, 9.4, 7.6)), FOX_NAVY[1])
      tint(
        l,
        torso,
        union(
          polygon([
            [3, -21.5],
            [11.5, -19.5],
            [7.5, -10.5]
          ]),
          overlap(capsule([2, -17], neckEnd, 5, 4.6), half([3.5, -17], 1, -0.5))
        ),
        FOX_PALE[1]
      )
      smooth(l)
      cel(l, { shade: 3, deep: 1, rim: 1 })
      dimEdge(l, FOX_PALE[0], FOX_PALE[1])
      within(l, (m) => fill(m, torso, capsule([1, -21], [7, -10.5], 0.6, 0.6), FOX_NAVY[3]), true)
      shadow(l, head.moved(-1, 2), oval(0, 2, 10, 8))
    })
    const skull = oval(0, -1, 10.5, 9.5)
    const bridge = capsule([2, -3.5], [12, 0.5], 6, 4.4)
    const muzzle = capsule([6, 1.5], [19.5, 3.6], 5.2, 1.9)
    const ruff = union(
      oval(-3.5, 5, 6, 4.4),
      polygon([
        [-6, 2.5],
        [-13.5, 5.5],
        [-9, 7],
        [-11.5, 10.5],
        [-5, 9.5],
        [-5, 12.5],
        [1, 9]
      ])
    )
    const earShape = (s: number) =>
      polygon([
        [-5 * s, 1],
        [-1.5 * s, -17 * s],
        [5 * s, 0]
      ])
    // the black tips, as on the sprite's ears (the portrait's ears are a little shorter)
    const tip = (s: number) =>
      polygon([
        [-9, -11 * s],
        [9, -11 * s],
        [0, -24 * s]
      ])
    const earF = head.child(5, -8)
    g.add(3.5, (l) => {
      fill(l, earF, earShape(0.74), FAR[1])
      tint(
        l,
        earF,
        polygon([
          [-1.5, -1],
          [-0.8, -9.5],
          [2.2, -1]
        ]),
        FOX_PALE[2]
      )
      tint(l, earF, overlap(tip(0.82), half([0, -8.2], 0, -1)), FOX_NAVY[3])
      cel(l, { shade: 1.2 })
    })
    g.add(4, (l) => {
      fill(l, head, union(skull, bridge, muzzle, ruff, oval(4, 5.5, 4.5, 3)), FUR[1])
      tint(
        l,
        head,
        union(ruff, capsule([6, 5.2], [18.5, 4.8], 2.4, 1), oval(4, 6, 4.5, 3), oval(-4, 6, 6, 4)),
        FOX_PALE[1]
      )
      smooth(l)
      mantle(l, FUR[1], FOX_RUSSET[1], { depth: 3, tooth: 1.5, pitch: 4, origin: headAt })
      cel(l, { shade: 2.6, deep: 1, rim: 1, tooth: 1, pitch: 4, origin: headAt })
      dimEdge(l, FOX_PALE[0], FOX_PALE[1])
    })
    const earN = head.child(-3, -7.5)
    g.add(4.5, (l) => {
      fill(l, earN, earShape(0.8), FUR[1])
      tint(
        l,
        earN,
        polygon([
          [-2, -1],
          [-1.2, -11],
          [2.6, -1]
        ]),
        FOX_PALE[1]
      )
      tint(l, earN, overlap(tip(0.8), half([0, -9.4], 0, -1)), FOX_NAVY[2])
      smooth(l)
      mantle(l, FUR[1], FOX_RUSSET[1], { depth: 2 })
      cel(l, { shade: 1.4, rim: 1 })
    })
    // the gang's red headband over the forehead, the steel plate, the knot behind
    g.add(4.8, (l) => {
      const band = polygon([
        [-11.5, -4.6],
        [9.5, -6.8],
        [10.5, -3.4],
        [-11, -0.8]
      ])
      fill(l, head, overlap(band, union(oval(0, -1, 11.2, 10.2), capsule([2, -3.5], [12, 0.5], 6.6, 5))), R.bandana[1])
      fill(l, head, oval(-11.5, -2.5, 2.8), R.bandana[1])
      cel(l, { shade: 1.4, rim: 1 })
      stampAt(l, head, FOX_PLATE, 4, -5, { h: R.steel[0], s: R.steel[1], d: R.steel[2], m: FOX_NAVY[3] })
    })
    g.add(
      5,
      (l) => {
        stampAt(l, head, FOX_EYE, 6, -0.5, { K: C.black, w: C.white, y: R.gold[1], o: FUR[1], B: FOX_RUSSET[3] })
        stampAt(l, head, ['.KKK', 'KhKK', 'KKKK', '.KK.'], 20, 2.2, { K: C.black, h: FOX_NAVY[1] })
        stampAt(l, head, ['K.........', '.KK.......', '...KKKKKKK'], 12.5, 5.6, { K: C.inkWarm })
      },
      false
    )
  })

const WOLF_PALE = ramp('#ffffff', '#e9edf6', '#bcc3d6', '#8088a4', '#1c1830')
const WOLF_SADDLE = ramp('#a3acc6', '#737d9c', '#525a78', '#373c56', '#1c1830')
const WOLF_EYE = ['BBBB.....', '.BBBBBBB.', '..KKKKBBB', '.KwwyyKB.', '.KwyyKyK.', '..KKKKK..']
const TUFT_BACK = ['...ff', '..fff', '.ffff', 'ffff.', 'fff..']
const TUFT_DOWN = ['fffff', 'fffff', '.fff.', '.ff..', '..f..']

const wolfBoss2 = () =>
  bossBust((g) => {
    const FUR = R.wolfGray
    const FAR = farRamp(FUR)
    const k = 0.66
    const head = Frame.at(10, 19.5, 0, k)
    const skull = oval(1.5, -4, 12.5, 11.5)
    const muzzle = capsule([7, -0.5], [22, 2], 7, 4.4)
    const cheek = oval(-4.5, 3, 7, 6.5)
    const headShape = union(skull, muzzle, cheek)
    // the ruff under the head (in head units: the bust brings the sprite's neck under the cheek), the dark saddle
    // on its top, a toothed lower edge
    g.add(2, (l) => {
      fill(l, head, union(oval(-3, 13, 13, 7), oval(6, 12, 8, 6)), FUR[1])
      tint(l, head, oval(6, 14, 7, 6), WOLF_PALE[1])
      smooth(l)
      const o = head.pt(-3, 9)
      mantle(l, FUR[1], WOLF_SADDLE[1], { depth: 3, tooth: 2, pitch: 4, origin: o })
      cel(l, { shade: 3, deep: 1, rim: 1, tooth: 1.5, pitch: 4, origin: o })
      dimEdge(l, WOLF_PALE[0], WOLF_PALE[1])
      shadow(l, head.moved(-0.5, 2), headShape)
    })
    // the gang's red scarf: the band round the neck under the jaw and the knot behind it
    g.add(3, (l) => {
      ribbon(l, spline([head.pt(-13, 9), head.pt(-4, 13.5), head.pt(8, 13)]), (t) => 5 - t * 0.8, R.bandana[1])
      fill(l, head, oval(-13.5, 8.5, 3.6, 3.6), R.bandana[1])
      cel(l, { shade: 1.4, rim: 1 })
      shadow(l, head.moved(0, 1.5), skull)
    })
    const earF = head.child(7, -10)
    g.add(3.5, (l) => {
      fill(
        l,
        earF,
        polygon([
          [-5, 0],
          [1.5, -16],
          [5, 0]
        ]),
        FAR[1]
      )
      tint(
        l,
        earF,
        polygon([
          [-1.5, -1.5],
          [1.2, -10.5],
          [2.8, -1.5]
        ]),
        FAR[3]
      )
      cel(l, { shade: 1.2 })
    })
    const jaw = head.child(5, 6.5)
    g.add(3.8, (l) => {
      fill(l, jaw, capsule([0, 0], [14.5, 2.5], 3.2, 2.2), WOLF_PALE[1])
      cel(l, { shade: 1 })
    })
    const headAt = head.pt(1.5, -4)
    g.add(4, (l) => {
      fill(l, head, headShape, FUR[1])
      // pale cheek and the muzzle's underside
      tint(l, head, union(capsule([7, 4.5], [22, 5.5], 2.6, 2.2), oval(-3, 5.5, 6.5, 4.6)), WOLF_PALE[1])
      stampAt(l, head, TUFT_BACK, -10, 6.5, { f: FUR[1] })
      stampAt(l, head, TUFT_DOWN, -4.5, 11.5, { f: WOLF_PALE[1] })
      smooth(l)
      mantle(l, FUR[1], WOLF_SADDLE[1], { depth: 4, tooth: 1.5, pitch: 4, origin: headAt })
      cel(l, { shade: 3.4, deep: 1.1, rim: 1, tooth: 1, pitch: 4, origin: headAt })
      dimEdge(l, WOLF_PALE[0], WOLF_PALE[1])
    })
    g.add(
      4.2,
      (l) => {
        stampAt(l, head, WOLF_EYE, 7, -4.5, { K: C.black, w: C.white, y: R.gold[1], o: R.gold[2], B: FUR[3] })
        // the scar: a red seam above the near eye and a shorter one below it
        stampAt(l, head, ['r.', 'r.', 'rr', '.r', '.r'], 4.5, -11.5, { r: R.fruitRed[1] })
        stampAt(l, head, ['r.', 'rr', '.r'], 7.5, 1.5, { r: R.fruitRed[1] })
        stampAt(l, head, ['.KKK', 'KhKK', 'KKKK', '.KK.'], 25.5, 0.5, { K: C.black, h: FUR[1] })
        // the lip line and one fang over it
        stampAt(l, head, ['KK.........', '.KKKKKKKKKK'], 15, 5, { K: C.inkCool })
        stampAt(l, head, ['w', 'W'], 18.5, 6.8, { w: C.white, W: WOLF_PALE[2] })
      },
      false
    )
    // the near ear: a tall dark triangle with a darker bowl
    const earN = head.child(-4, -9.5)
    g.add(5, (l) => {
      fill(
        l,
        earN,
        polygon([
          [-6.5, 1.5],
          [-2, -18.5],
          [6.5, -1.5]
        ]),
        WOLF_SADDLE[1]
      )
      tint(
        l,
        earN,
        polygon([
          [-2.5, -1],
          [-0.8, -12],
          [3.2, -2.5]
        ]),
        WOLF_SADDLE[3]
      )
      cel(l, { shade: 1.4, rim: 1 })
    })
  })

const CROW_NAVY = ramp('#8f9bd8', '#525c9a', '#383f75', '#252955', '#0f0e24')
const CROW_MANTLE = ramp('#6d78b9', '#3f4783', '#2c3164', '#1d2049', '#0f0e24')
const CROW_CHEST = ramp('#d2d8f4', '#a3acd9', '#7480b6', '#4b5389', '#0f0e24')
/** The sprite's glaring near eye a size down: the feathered brow, the white, the amber iris and the pupil. */
const CROW_EYE = ['BB.....', 'BBBBB..', '.BBBBBB', '.KKKKK.', 'KwaaaK.', 'KwaKAK.', '.KaAK..', '..KK...']
const CROW_PATCH = ['.KKK.', 'KsKKK', 'KKKKK', 'KKKKK', '.KKK.']

const crowBoss2 = () =>
  bossBust((g) => {
    const BAND = R.bandana
    const k = 0.58
    const head = Frame.at(11, 11, 0, k)
    const body = Frame.at(11 - 5 * k, 11 + 23 * k, 0, k)
    const headShape = union(squircle(0, -1, 15, 13.5, 2.3), oval(4, 5.5, 10.5, 8), oval(-7, 4.5, 9, 8.5))
    const scarf = polygon([
      [-18, -1],
      [-11, -6.5],
      [-3, -9.5],
      [5, -10],
      [11, -8.5],
      [17, -8],
      [17, -22],
      [-17, -22]
    ])
    const knot = head.pt(-14, -5)
    // the scarf's two tails hanging from the knot behind the head
    g.add(-1, (l) => {
      ribbon(l, spline([knot, [knot[0] - 2, knot[1] + 5], [knot[0] - 1, knot[1] + 10]]), (t) => 3 + t * 1.6, BAND[2])
      ribbon(l, spline([knot, [knot[0] + 1, knot[1] + 6], [knot[0] + 3, knot[1] + 11]]), (t) => 3 + t * 2, BAND[1])
      cel(l, { shade: 1.2, rim: 1 })
    })
    // the barrel chest: navy with the darker mantle on the back and the pale chest with its feather scallops
    const bodyAt = body.pt(4, -4)
    g.add(0, (l) => {
      fill(
        l,
        body,
        union(egg(2, 0, 15, 14, 15), oval(7, -3, 11.5, 12.5), capsule([3, -9], body.local(...head.pt(-2, 6)), 11, 10)),
        CROW_NAVY[1]
      )
      tint(l, body, union(oval(10, 1, 9, 12.5), oval(6, 9, 7, 6)), CROW_CHEST[1])
      smooth(l)
      mantle(l, CROW_NAVY[1], CROW_MANTLE[1], { depth: 3.5, tooth: 2, pitch: 4, origin: bodyAt })
      cel(l, { shade: 4, deep: 1.4, rim: 1, tooth: 2, pitch: 4, origin: bodyAt })
      within(
        l,
        (m) => {
          for (const [u, v] of [
            [11, -2],
            [7, 4]
          ] as const)
            stampAt(m, body, ['s...s', '.sss.'], u, v, { s: CROW_CHEST[2] })
        },
        true
      )
      shadow(l, head.moved(0, 2), headShape)
    })
    // the head: skull, jowl and nape; the pale face and the red head scarf tinted inside it
    const headAt = head.pt(0, -4)
    g.add(3, (l) => {
      fill(l, head, headShape, CROW_NAVY[1])
      tint(l, head, union(oval(4.5, 0, 8.5, 8), oval(6, 6, 7.5, 4.5)), CROW_CHEST[1])
      tint(l, head, scarf, BAND[1])
      smooth(l)
      cel(l, { shade: 3, deep: 1, rim: 1, tooth: 1, pitch: 4, origin: headAt })
      // the scarf's hem: its lowest row a step darker where it lies on the feathers
      const src = l.clone()
      const red = new Set<number>(BAND.slice(0, 4))
      for (let y = 0; y < l.h - 1; y++)
        for (let x = 0; x < l.w; x++)
          if (red.has(src.get(x, y)) && src.get(x, y + 1) && !red.has(src.get(x, y + 1))) l.set(x, y, BAND[3])
      within(l, (m) =>
        stampAt(m, head, CROW_EYE, 3.5, -2.5, { K: C.black, w: C.white, a: R.beak[1], A: R.beak[2], B: CROW_MANTLE[3] })
      )
    })
    // the big hooked beak, closed
    const bill = head.child(12, 3)
    const jaw = bill.child(0, 2)
    g.add(3.4, (l) => {
      fill(l, jaw, overlap(overlap(oval(1, 0, 15, 3.6), half([0, 0], 0, 1)), half([-3, 0], 1, 0)), R.beak[1])
      smooth(l)
      cel(l, { shade: 1.2 })
    })
    g.add(3.5, (l) => {
      fill(
        l,
        bill,
        union(
          overlap(overlap(oval(2, 2, 17.5, 7.5), half([0, 2], 0, -1)), half([-3, 0], 1, 0)),
          capsule([15.5, 1], [19.5, 5.5], 2.4, 1.3)
        ),
        R.beak[1]
      )
      smooth(l)
      cel(l, { shade: 1.4, rim: 1 })
      within(l, (m) => {
        stampAt(m, bill, ['KK.', '.KK'], 6, -2, { K: R.beak[3] })
        fill(m, bill, capsule([1, 1.6], [15, 1.6], 0.5, 0.5), R.beak[3])
      })
    })
    // the patch over the far eye, strapped on over the root of the beak; the scarf's knot
    g.add(3.7, (l) => stampAt(l, head, CROW_PATCH, 14, -3.5, { K: C.black, s: CROW_MANTLE[2] }))
    g.add(3.8, (l) => {
      fill(l, Frame.at(knot[0], knot[1]), oval(0, 0, 2.6, 2.3), BAND[1])
      cel(l, { shade: 1.2, rim: 1 })
    })
  })

// ------------------------------------------------------------------------------------------------- bosses

const WEASEL_SADDLE = ramp('#96703f', '#76532f', '#5e4428', '#3e2a1e', '#3a1a22')
const WEASEL_CREAM2 = ramp('#ffffff', '#fbf1dc', '#e8cc9c', '#b8925e', '#3a1a22')
const WEASEL_EYE = ['BB.......', '..BBB....', '.....BB..', '.........', 'KKKKKK...', '.KwyKyKKK', '..KKKKK..']
const WEASEL_WHISKERS = ['.............ww', '..........www..', '.......www.....', '...........www.', '........www....']

/** The white feather fan (the sprite's): pivot at the origin, eleven feathers spread up along −v. */
function weaselFan(l: Raster, f: Frame) {
  const CREAM = WEASEL_CREAM2
  const spread = 110 * (Math.PI / 180)
  const len = 13.5
  const n = 11
  const step = spread / (n - 1)
  const tipR = Math.max(1.8, len * Math.sin(step / 2) + 0.7)
  const tips: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const a = -spread / 2 + step * i
    tips.push([Math.sin(a) * (len - tipR), -Math.cos(a) * (len - tipR)])
  }
  fill(l, f, union(...tips.map((t) => capsule([0, -1.5], t, 1.6, tipR)), oval(0, -1.5, 2.6, 2.4)), CREAM[1])
  smooth(l)
  cel(l, { shade: 1.8, rim: 1 })
  within(
    l,
    (m) => fill(m, f, overlap(oval(-1.5, -1.5, len - 2.5), minus(oval(0, 0, 100), oval(0, 0, len * 0.42))), CREAM[0]),
    true
  )
  dimEdge(l, CREAM[0], CREAM[1])
  within(
    l,
    (m) => {
      for (let i = 1; i < n; i += 3) {
        const [a, b] = [f.pt(tips[i][0] * 0.25, tips[i][1] * 0.25), f.pt(tips[i][0] * 0.95, tips[i][1] * 0.95)]
        m.line(a[0], a[1], b[0], b[1], CREAM[2])
      }
    },
    true
  )
  fill(l, f, capsule([0, 1], [0, 5.5], 1.5, 1.3), WEASEL_SADDLE[2])
}

const weaselBoss2 = () =>
  bossBust((g) => {
    const FUR = R.weaselTan
    const FAR = farRamp(FUR)
    const CREAM = WEASEL_CREAM2
    const BLACK = R.darkFur
    const k = 0.8
    const head = Frame.at(11, 17, 0, k)
    const bk = k / 1.3
    const chest = Frame.at(...head.pt(-5 / 1.3, 22 / 1.3), 0, bk)
    const neck = chest.child(1, -7)
    const seat = neck.pt(0, -10)
    // neck and chest under the head, the cream throat, the black court vest with the gold clasp
    g.add(0, (l) => {
      fill(l, chest, oval(0, -2, 9.4, 9.5), FUR[1])
      fill(l, Frame.at(0, 0), capsule(chest.pt(0, -3), neck.pt(0, 0), 8.4, 6.6), FUR[1])
      fill(l, Frame.at(0, 0), capsule(neck.pt(0, 0), seat, 6.6, 6), FUR[1])
      tint(l, chest, oval(6, -3, 6.5, 9), CREAM[1])
      tint(l, Frame.at(0, 0), capsule(neck.pt(4.5, 0), neck.pt(3.5, -9), 4.6, 4.2), CREAM[1])
      smooth(l)
      const o = chest.pt(0, -2)
      mantle(l, FUR[1], WEASEL_SADDLE[1], { depth: 3, tooth: 2, pitch: 4, origin: o })
      cel(l, { shade: 3, deep: 1, rim: 1, tooth: 1.5, pitch: 4, origin: o })
      dimEdge(l, CREAM[0], CREAM[1])
    })
    g.add(1.5, (l) => {
      const vest = overlap(
        union(oval(0, -1, 9.8, 9.6), capsule([0, -4], chest.local(...neck.pt(0, -2)), 8.6, 7.2)),
        half([4, -2], -1, -0.45)
      )
      fill(l, chest, vest, BLACK[1])
      smooth(l)
      cel(l, { shade: 2.4, rim: 1 })
    })
    g.add(1.6, (l) => stampAt(l, chest, ['.yy.', 'yYYy', '.yy.'], 3.5, -2, { y: R.gold[1], Y: R.gold[2] }), false)
    // the cap's two red tails from the knot behind it
    const cap = head.child(-2, -8.5)
    const knot = cap.pt(-6, -1.2)
    g.add(2.5, (l) => {
      ribbon(
        l,
        spline([knot, [knot[0] - 2.5, knot[1] + 5], [knot[0] - 2, knot[1] + 10]]),
        (t) => 2.4 + t * 1.6,
        R.bandana[2]
      )
      ribbon(
        l,
        spline([knot, [knot[0] - 0.5, knot[1] + 6], [knot[0] + 1, knot[1] + 12]]),
        (t) => 2.4 + t * 1.8,
        R.bandana[1]
      )
      cel(l, { shade: 1.2, rim: 1 })
    })
    const skull = oval(0, -2, 10.5, 9)
    const snout = capsule([5, 0], [16.5, 2.4], 6.4, 2.9)
    const cheek = oval(-2.5, 3.5, 7.5, 5.8)
    const headShape = union(skull, snout, cheek)
    const earF = head.child(-3, -9)
    g.add(3.5, (l) => {
      fill(l, earF, oval(0, -2.5, 3.6, 3.4), FAR[1])
      tint(l, earF, oval(0.3, -2.2, 1.8, 1.8), WEASEL_SADDLE[2])
      cel(l, { shade: 1.2 })
    })
    const jaw = head.child(6, 4.5)
    g.add(3.8, (l) => {
      fill(l, jaw, capsule([0, 0], [10, 1.4], 2.6, 1.6), CREAM[1])
      cel(l, { shade: 1 })
      dimEdge(l, CREAM[0], CREAM[1])
    })
    const headAt = head.pt(0, -2)
    g.add(4, (l) => {
      fill(l, head, headShape, FUR[1])
      // the pale mask round the eye, the muzzle and the cheek
      tint(
        l,
        head,
        union(oval(4.5, -1.2, 4.4, 3.4), capsule([5, 4.4], [16, 4], 2.6, 1.6), oval(-2, 6.5, 6, 3.2)),
        CREAM[1]
      )
      stampAt(l, head, TUFT_BACK, -9.5, 5, { f: FUR[1] })
      stampAt(l, head, TUFT_DOWN, -3.5, 9.5, { f: CREAM[1] })
      smooth(l)
      mantle(l, FUR[1], WEASEL_SADDLE[1], { depth: 3.5, tooth: 1.5, pitch: 4, origin: headAt })
      cel(l, { shade: 3, deep: 1, rim: 1, tooth: 1, pitch: 4, origin: headAt })
      dimEdge(l, CREAM[0], CREAM[1])
      shadow(l, cap.moved(0, 2), squircle(0, -1, 7, 2.2, 3))
    })
    g.add(
      4.2,
      (l) => {
        stampAt(l, head, WEASEL_EYE, 4.5, -2, { K: C.black, w: C.white, y: R.gold[1], B: WEASEL_SADDLE[3] })
        stampAt(l, head, ['.KK.', 'KhKK', 'KKK.'], 18, 1.4, { K: C.black, h: WEASEL_SADDLE[0] })
        // the thin smile, the back corner turned up, one fang over the lip
        stampAt(l, head, ['KK.......', '..KKKKKKK'], 12, 4.6, { K: C.inkWarm })
        stampAt(l, head, ['w', 'W'], 13.5, 6.4, { w: C.white, W: CREAM[2] })
      },
      false
    )
    g.add(4.3, (l) => stampAt(l, head, WEASEL_WHISKERS, 16, 3, { w: FUR[1] }), false)
    const earN = head.child(-7.5, -6)
    g.add(4.4, (l) => {
      fill(l, earN, oval(0, -2.8, 4.2, 4), FUR[1])
      tint(l, earN, oval(0.6, -2.4, 2.2, 2.2), WEASEL_SADDLE[2])
      cel(l, { shade: 1.4, rim: 1 })
    })
    // the scholar's cap: flat-topped, black, the red band at its foot, the gold button on top
    g.add(4.6, (l) => {
      fill(l, cap, union(squircle(0, -4.6, 6.4, 4.6, 3.4), squircle(0, -1, 7.2, 2, 3)), BLACK[1])
      tint(l, cap, half([0, -2.6], 0, 1), R.bandana[1])
      fill(l, cap, oval(0, -9.6, 1.6, 1.5), R.gold[1])
      smooth(l)
      cel(l, { shade: 2, rim: 1 })
    })
    // the fan held up in front of the chest
    g.add(5, (l) => weaselFan(l, Frame.at(24, 30, 20, 0.62)))
  })

const BOAR_INK = '#3a1a22'
const BOAR_BRISTLE = ramp('#684a32', '#503828', '#402c22', '#402c22', BOAR_INK)
const BOAR_TUSK = ramp('#fffcee', '#f4e4c2', '#d8b68c', '#c8a078', BOAR_INK)
const BOAR_PALE = ramp('#f4e4c2', '#d8b68c', '#c8a078', '#402c22', BOAR_INK)
const BOAR_HAIR = ramp('#5e5878', '#38344e', '#252232', BOAR_INK, BOAR_INK)
const BOAR_SNOUT = ramp('#f0bca8', '#d8968c', '#aa6670', '#402c22', BOAR_INK)
const BOAR_LEAF = ramp('#a6dc7c', '#5cae52', '#3a8048', '#402c22', BOAR_INK)
/** The sprite's small angry eye a size down: the heavy black brow does the acting. */
const BOAR_EYE = ['BB.....', '.BBBB..', '..BBBBB', '..KKKBB', '.KwwpK.', '..KKK..']
const BOAR_SHINE = ['.........ssss', '.....ggsss...', '..sssss......', 'sss..........']
const BOAR_CURL = ['.ss.', 's..c', 's.c.', 's...', '.cc.']

const boarBoss2 = () =>
  bossBust((g) => {
    const FUR = R.boarBrown
    const FAR = farRamp(FUR)
    const SHEEN = color('#8a9ad6')
    const k = 0.6
    const head = Frame.at(11, 18, 0, k)
    const skull = oval(0, -1, 12.5, 11.5)
    const jowl = oval(-2, 6, 10.5, 7)
    const snout = capsule([6, 1], [21, 3], 9, 6.6)
    const headShape = union(skull, jowl, snout)
    const jaw = head.child(8, 8)
    // the shoulder wedge behind the head under its bristle ridge, the pale underside of the neck
    g.add(0, (l) => {
      fill(l, head, union(oval(-9, 14, 15, 11), oval(2, 18, 12, 8)), FUR[1])
      tint(l, head, oval(4, 22, 10, 5), BOAR_PALE[1])
      stampAt(l, head, ['..f..', '.ff..', '.fff.', 'ffff.', 'fffff'], -15, 2, { f: FUR[1] })
      smooth(l)
      const o = head.pt(-9, 8)
      mantle(l, FUR[1], BOAR_BRISTLE[1], { depth: 3, tooth: 2.5, pitch: 4, origin: o })
      cel(l, { shade: 3.4, deep: 1.2, rim: 1, tooth: 2, pitch: 4, origin: o })
    })
    const tuskPath = (du: number, dv: number) =>
      spline([
        jaw.pt(8 + du, -0.5 + dv),
        jaw.pt(14 + du, 1.5 + dv),
        jaw.pt(19.5 + du, -0.5 + dv),
        jaw.pt(22.5 + du, -6 + dv),
        jaw.pt(22 + du, -12 + dv)
      ])
    const tusk = (l: Raster, path: [number, number][], tone: Ramp, w: number) => {
      ribbon(l, path, (t) => w * (1 - t * 0.6), tone[1])
      smooth(l)
      cel(l, { shade: 1.2, rim: 1 })
      dimEdge(l, tone[0], tone[1])
    }
    g.add(2, (l) => tusk(l, tuskPath(-3.5, -1), farRamp(BOAR_TUSK), 2.8))
    // the gang's red neckerchief: the band round the neck, the knot at the throat, two short tails
    const knot = head.pt(-7, 13.5)
    g.add(2.4, (l) => {
      ribbon(l, spline([knot, [knot[0] - 1, knot[1] + 4]]), (t) => 2.6 + t * 1.4, R.bandana[2])
      ribbon(l, spline([knot, [knot[0] + 2, knot[1] + 4]]), (t) => 2.6 + t * 1.4, R.bandana[1])
      cel(l, { shade: 1.2, rim: 1 })
    })
    g.add(2.5, (l) => {
      ribbon(l, spline([head.pt(-13, -5), head.pt(-14, 5), knot]), (t) => 4.2 - t * 1, R.bandana[1])
      fill(l, Frame.at(knot[0], knot[1]), oval(0, 0, 2.2, 2), R.bandana[1])
      cel(l, { shade: 1.4, rim: 1 })
      shadow(l, head.moved(0, 1), jowl)
    })
    const earF = head.child(-5, -9, -24)
    g.add(3, (l) => {
      fill(
        l,
        earF,
        polygon([
          [-4, 1],
          [-2.5, -9],
          [4, 0]
        ]),
        FAR[1]
      )
      cel(l, { shade: 1.2 })
    })
    g.add(3.8, (l) => {
      fill(l, jaw, capsule([0, 0], [12, 0.5], 4, 3), BOAR_PALE[1])
      cel(l, { shade: 1.2 })
    })
    const headAt = head.pt(0, -1)
    g.add(4, (l) => {
      fill(l, head, headShape, FUR[1])
      tint(l, head, union(oval(-3, 9, 9, 4.6), capsule([6, 8.5], [19, 8], 2.6, 2)), BOAR_PALE[1])
      smooth(l)
      mantle(l, FUR[1], BOAR_BRISTLE[1], { depth: 2, tooth: 1.5, pitch: 4, origin: headAt })
      cel(l, { shade: 3, deep: 1, rim: 1, tooth: 1, pitch: 4, origin: headAt })
    })
    // the pink snout disc with its nostrils
    g.add(4.1, (l) => {
      fill(l, head, oval(23.5, 2.5, 3.4, 6.8), BOAR_SNOUT[1])
      cel(l, { shade: 1.2 })
    })
    g.add(
      4.2,
      (l) => {
        stampAt(l, head, BOAR_EYE, 6, -3, { K: BOAR_HAIR[3], w: C.white, p: C.black, B: BOAR_HAIR[1] })
        stampAt(l, head, ['K', 'K', '.', 'K', 'K'], 24.5, 2.5, { K: BOAR_SNOUT[3] })
        stampAt(l, head, ['K.......', '.KKKKKKK'], 13.5, 7.5, { K: C.inkWarm })
      },
      false
    )
    // the leaf stalk in the corner of the mouth
    g.add(4.4, (l) => {
      const [rx, ry] = head.pt(11, 8.5)
      ribbon(
        l,
        [
          [rx, ry],
          [rx - 1.5, ry + 4]
        ],
        () => 1.2,
        BOAR_LEAF[2]
      )
      fill(l, Frame.at(rx - 1.5, ry + 4, 115), union(oval(2, 0, 2.6, 1.5), oval(0.3, 0, 1.1, 1.1)), BOAR_LEAF[1])
    })
    g.add(4.6, (l) => tusk(l, tuskPath(0, 0), BOAR_TUSK, 3.2))
    const earN = head.child(-10, -6, -30)
    g.add(4.8, (l) => {
      fill(
        l,
        earN,
        polygon([
          [-4.5, 1.5],
          [-3, -10],
          [5, 0]
        ]),
        FUR[1]
      )
      tint(
        l,
        earN,
        polygon([
          [-2, 0],
          [-1.8, -6],
          [2.4, -0.5]
        ]),
        BOAR_SNOUT[2]
      )
      cel(l, { shade: 1.2, rim: 1 })
    })
    // the glossy black pompadour rolled forward over the brow, its sheen stripe and the spiral on its end
    const quiff = head.child(-3, -9)
    g.add(5, (l) => {
      const tip: [number, number] = [15, -10]
      const tube = union(capsule([-11, 3], [-3, -4], 3.5, 6.5), capsule([-2, -6], tip, 7, 7.6), egg(5, -10, 8.5, 8, 4))
      fill(l, quiff, union(tube, oval(tip[0] + 1.5, tip[1], 3.8, 7.2)), BOAR_HAIR[1])
      smooth(l)
      cel(l, { shade: 2.4, deep: 0.8, rim: 1 })
      within(l, (m) => stampAt(m, quiff, BOAR_CURL, tip[0] + 2.5, tip[1], { c: BOAR_HAIR[3], s: SHEEN }), true)
      within(l, (m) => stampAt(m, quiff, BOAR_SHINE, 6, -13.5, { s: SHEEN, g: C.white }), true)
    })
  })

const BEAR_MANE = ramp('#a283b6', '#634878', '#4a3460', '#2f2140', '#1c1830')
const BEAR_LEAF = ramp('#b8f08b', '#4fbf68', '#2f8f4f', '#1f6041', '#1c1830')
/** The sprite's small heavy-lidded eyes a size down (6 and 4 wide), so they part from the nose on the small head. */
const BEAR_EYES = [
  ['BBB...', '.BBBBB', '..ssss', '.iiiii', '.KwKK.', '..KK..'],
  ['.BBB', 'BBB.', 'sss.', 'iiii', 'KwK.', '.K..']
] as const

/** A leaf pointing up from its base (frame origin), widest a third of the way, with a pointed tip. */
const leafShape = (len: number, wid: number) => {
  const pts: [number, number][] = []
  for (let i = 0; i <= 8; i++) pts.push([Math.sin(Math.PI * (i / 8) ** 0.75) * wid, (-i / 8) * len])
  for (let i = 8; i >= 0; i--) pts.push([-Math.sin(Math.PI * (i / 8) ** 0.75) * wid, (-i / 8) * len])
  return polygon(pts)
}

const bearBoss2 = () =>
  bossBust((g) => {
    const FUR = R.bearViolet
    const CREAM = R.hamCream
    const k = 0.62
    const head = Frame.at(13, 18, 0, k)
    const torso = Frame.at(13 - 6 * k, 18 + 27 * k, 0, k)
    const skull = union(oval(0, -1, 17, 14.5), oval(-3, 6, 14, 8.5))
    const muzzle = oval(14, 5.5, 10, 6.6)
    const headShape = union(skull, muzzle)
    // the shoulders and the top of the cream belly, the rope of the gourd across the chest
    g.add(0, (l) => {
      fill(l, torso, union(oval(4, 4, 27, 19), oval(0, -12, 20, 12.5), oval(-11, 4, 15, 15)), FUR[1])
      tint(l, torso, oval(9, 5, 15.5, 15), CREAM[1])
      smooth(l)
      const o = torso.pt(-6, -10)
      mantle(l, FUR[1], BEAR_MANE[1], { depth: 4, tooth: 2.5, pitch: 4, origin: o })
      cel(l, { shade: 4, deep: 1.4, rim: 1, tooth: 2, pitch: 4, origin: o })
      dimEdge(l, CREAM[0], CREAM[1])
      shadow(l, head.moved(0.5, 2), headShape)
      within(l, (m) => {
        const strap = (dv: number) => spline([torso.pt(23, -9 + dv), torso.pt(0, 3 + dv), torso.pt(-26, 6 + dv)])
        ribbon(m, strap(0), () => 1.6, R.wood[3])
        ribbon(m, strap(-0.8), () => 0.8, R.wood[2])
      })
    })
    // round ears behind the skull, a pale bowl inside
    const ear = (u: number, v: number, tone: Ramp, far: boolean) => (l: Raster) => {
      const f = head.child(u, v)
      fill(l, f, oval(0, -2, far ? 5.6 : 6.6, far ? 5.6 : 6.6), tone[1])
      tint(l, f, oval(far ? 1 : 0.8, -1.4, far ? 2.8 : 3.6, far ? 3 : 3.8), far ? CREAM[3] : CREAM[2])
      cel(l, { shade: 1.4, rim: 1 })
    }
    g.add(2, ear(10, -13, farRamp(BEAR_MANE), true))
    g.add(2.1, ear(-10, -11.5, BEAR_MANE, false))
    const headAt = head.pt(0, -1)
    g.add(4, (l) => {
      fill(l, head, headShape, FUR[1])
      tint(l, head, union(oval(15, 6, 9.4, 6.2), oval(8, 9.5, 6, 4)), CREAM[1])
      stampAt(l, head, TUFT_BACK, -17, 5, { f: FUR[1] })
      stampAt(l, head, TUFT_DOWN, -6, 14.5, { f: FUR[1] })
      smooth(l)
      mantle(l, FUR[1], BEAR_MANE[1], { depth: 4, tooth: 2, pitch: 4, origin: headAt })
      cel(l, { shade: 3.6, deep: 1.2, rim: 1, tooth: 1, pitch: 4, origin: headAt })
      dimEdge(l, CREAM[0], CREAM[1])
    })
    g.add(
      4.2,
      (l) => {
        const key = { K: C.black, w: C.white, i: C.inkCool, B: BEAR_MANE[3], s: FUR[2] }
        stampAt(l, head, BEAR_EYES[0], 4.5, -3.5, key)
        stampAt(l, head, BEAR_EYES[1], 14.5, -4.5, key)
        stampAt(l, head, ['.KKK.', 'KhKKK', 'KKKKK', '.KKK.'], 22.5, 1, { K: C.black, h: FUR[0] })
        // the grumpy closed mouth: the philtrum and a downturned line running back under the muzzle
        stampAt(l, head, ['......i.', '......i.', '.iiiii.i', 'i.......'], 18, 6, { i: C.inkCool })
      },
      false
    )
    // the sprig of three leaves on the crown
    for (const [u, v, deg, len, wid, depth] of [
      [-5, -13, -68, 12, 3.6, 4.5],
      [4, -13.5, 44, 11, 3.4, 4.55],
      [-0.5, -14.5, -14, 14, 4, 4.6]
    ] as const)
      g.add(depth, (l) => {
        const f = head.child(u, v, deg, 0.8)
        fill(l, f, union(leafShape(len, wid), capsule([0, 2], [0, -1.5], 0.9, 0.9)), BEAR_LEAF[1])
        smooth(l)
        cel(l, { shade: 1.2, rim: 1 })
        within(l, (m) => fill(m, f, capsule([0, -2], [0, -len * 0.7], 0.45, 0.45), BEAR_LEAF[2]), true)
      })
  })

const APE_SILVER = ramp('#d4d8e6', '#a2a8bc', '#7a8098', '#585c78', '#1c1830')
const APE_SKIN = ramp('#cfc9d8', '#a39cb4', '#7b748c', '#544e66', '#26232f')
const APE_NAVY = ramp('#7482c4', '#3c4684', '#283060', '#1a1e40', '#1c1830')

const apeBoss2 = () =>
  bossBust((g) => {
    const FUR = R.apeCharcoal
    const FAR = farRamp(FUR)
    const k = 0.74
    const head = Frame.at(14, 18.5, 0, k)
    // the wall of shoulders behind the head with the silver saddle on the back
    g.add(0, (l) => {
      fill(l, head, union(oval(-9, 13, 17, 11), oval(4, 15, 13, 9)), FUR[1])
      stampAt(l, head, ['..f..', '.ff..', '.fff.', 'fffff'], -12, 1.5, { f: FUR[1] })
      smooth(l)
      const o = head.pt(-12, 6)
      mantle(l, FUR[1], APE_SILVER[1], { depth: 4, tooth: 2.5, pitch: 4, origin: o })
      // the silver only on the back (the shoulder hump and the arm stay charcoal), toothed at its front
      const src = l.clone()
      for (let y = 0; y < l.h; y++)
        for (let x = 0; x < l.w; x++) {
          if (src.get(x, y) !== APE_SILVER[1]) continue
          const [u, v] = head.local(x + 0.5, y + 0.5)
          if (u > -12 - ((((v - u * 0.4) % 5) + 5) % 5) * 0.8) l.set(x, y, FUR[1])
        }
      // the paler chest plate between the arm and the neck
      tint(l, head, oval(11, 17, 7, 6), APE_SKIN[2])
      cel(l, { shade: 4, deep: 1.4, rim: 1, tooth: 2, pitch: 4, origin: o })
      dimEdge(l, APE_SILVER[0], APE_SILVER[1])
      shadow(l, head.moved(0.5, 2), union(oval(-1.5, -3, 12, 11.5), oval(7.5, 4.5, 9, 6.4)))
    })
    // the near upper arm hanging from the shoulder behind the jaw, the gang's red band round it
    g.add(0.5, (l) => {
      fill(l, head, capsule([-12, 6], [-9, 24], 6.5, 5.5), FUR[1])
      cel(l, { shade: 3, deep: 1, rim: 1, tooth: 1.5, pitch: 4, origin: head.pt(-9, 12) })
      within(l, (m) => {
        const band = Frame.at(...head.pt(-10.8, 15), 80, k)
        fill(m, band, squircle(0, 0, 2.6, 12, 4), R.bandana[1])
        fill(m, band, squircle(-2, 0, 0.8, 12, 4), R.bandana[0])
        fill(m, band, squircle(2.2, 0, 0.8, 12, 4), R.bandana[2])
      })
    })
    const skull = oval(-1.5, -3, 12, 11.5)
    const brow = capsule([-2, -6.5], [11.5, -5], 3.8, 3.3)
    const muzzle = union(oval(7.5, 4.5, 9, 6.4), oval(3, 1, 6, 6))
    const headShape = union(skull, brow, muzzle)
    g.add(3.5, (l) => {
      fill(l, head, oval(2.5, -1, 3, 3.6), FAR[1])
      cel(l, { shade: 1.2 })
    })
    const jaw = head.child(1, 7.5)
    g.add(3.8, (l) => {
      fill(l, jaw, union(capsule([-1, 1], [12.5, 1.6], 4.4, 3.6), oval(4, 3, 6, 3)), APE_SKIN[1])
      cel(l, { shade: 1.4 })
    })
    const headAt = head.pt(-1.5, -3)
    g.add(4, (l) => {
      fill(l, head, headShape, FUR[1])
      stampAt(l, head, TUFT_BACK, -12.5, 2, { f: FUR[1] })
      stampAt(l, head, TUFT_DOWN, -6, 9, { f: FUR[1] })
      smooth(l)
      // the bare face mask and muzzle (the brow stays fur)
      tint(l, head, minus(union(oval(5, 0.5, 8, 7.5), muzzle), brow), APE_SKIN[1])
      cel(l, { shade: 2.6, deep: 0.8, rim: 1, tooth: 1, pitch: 4, origin: headAt })
      dimEdge(l, FUR[0], FUR[1])
      dimEdge(l, APE_SKIN[0], APE_SKIN[1])
      // the brow throws the eyes into shadow
      shadow(l, head, capsule([0, -2.4], [12, -1.8], 1.4, 1.2))
      shadow(l, head, oval(1, 7.8, 9, 1.4))
    })
    g.add(
      4.2,
      (l) => {
        const key = { K: C.inkCool, w: C.white, B: FUR[3], s: APE_SKIN[2] }
        stampAt(l, head, ['BBB.....', 'KKBBBB..', 'KwwKKBBB', 'KwwKKwKK', '.KKKKKK.'], 3.5, -0.5, key)
        stampAt(l, head, ['...BB', '.BBBK', 'BKKwK', 'KwKwK', '.KKK.'], 11, -0.5, key)
        stampAt(l, head, ['.ssss.', 'sKKsKK', 'sKK.KK'], 12.5, 3, { K: C.inkCool, s: APE_SKIN[3] })
        stampAt(l, head, ['KK..........', '.KKKKKKKKKK.', '..........KK'], 9.5, 8.5, { K: C.inkCool })
      },
      false
    )
    g.add(4.5, (l) => {
      fill(l, head, oval(-8, 1, 3, 3.8), FUR[1])
      tint(l, head, oval(-7.6, 1.6, 1.2, 1.8), FUR[3])
      cel(l, { shade: 1.2, rim: 1 })
    })
    // the police cap: navy crown, darker band and peak, the gold star badge
    const cap = head.child(-0.5, -11.5)
    g.add(5, (l) => {
      fill(l, cap, union(squircle(0.5, -4.2, 12.6, 5.2, 2.8), squircle(1, 0.2, 11, 2.8, 4)), APE_NAVY[1])
      tint(l, cap, overlap(squircle(1, 0.2, 11, 2.8, 4), half([0, -0.8], 0, 1)), APE_NAVY[2])
      smooth(l)
      cel(l, { shade: 1.8, rim: 1 })
      within(l, (m) =>
        stampAt(m, cap, ['..h..', '.hyy.', 'yyyyy', '.yYy.', '.Y.Y.'], 5.5, -4.5, {
          y: R.gold[1],
          Y: R.gold[2],
          h: R.gold[0]
        })
      )
    })
    g.add(5.2, (l) => {
      fill(
        l,
        cap,
        polygon([
          [5, 0.6],
          [17.5, 2.6],
          [16.5, 4.6],
          [4, 3.6]
        ]),
        APE_NAVY[2]
      )
      cel(l, { shade: 1, rim: 1 })
    })
  })

const BEE_SKIN = ramp('#fff8f0', '#fbe1d4', '#e4b6ad', '#ad8190', '#3a1a22')
const BEE_PLUM = ramp('#7d6c9c', '#3f3454', '#2b2339', '#1d1727', '#1c1830')
const BEE_FUR = ramp('#fdfcff', '#ebe9f4', '#c2c0d6', '#8987a8', '#1c1830')
const BEE_TUFT = ['fffff', 'ffff.', '.fff.', '.ff..', '..f..']
const BEE_TUFT_R = ['fffff', '.ffff', '.fff.', '..ff.', '..f..']

const beeBoss2 = () =>
  bossBust((g) => {
    const HONEY = R.honey
    const PLUM_FAR = farRamp(BEE_PLUM)
    const k = 0.72
    const head = Frame.at(16.5, 19.5, 0, k)
    const torso = Frame.at(16.5 - 4 * k, 19.5 + 22 * k, 0, k)
    const face = union(oval(1, 1, 11.5, 11), oval(5.5, 5, 8, 6.5))
    const hairShape = union(oval(-1.5, -2.5, 13.5, 12), capsule([-8, -1], [-8, 9], 6.5, 5.2), oval(6, -8, 8, 5))
    const window = union(overlap(oval(5, 3.5, 10.5, 10), half([0, -3.2], 0, 1)), oval(9, 6, 6, 5.5))
    // the bodice and the great white fur collar round the neck, the brightest mass of the figure
    g.add(0, (l) => {
      fill(l, torso, union(oval(0, 0, 10, 10.5), oval(-4, 4, 6, 5)), BEE_PLUM[1])
      smooth(l)
      cel(l, { shade: 2.4, rim: 1 })
    })
    // the gang's red sash across the bodice
    g.add(1, (l) => {
      ribbon(l, spline([torso.pt(9, -6), torso.pt(2, 2), torso.pt(-7, 6)]), (t) => 4.6 + t * 0.6, R.bandana[1])
      cel(l, { shade: 1.4, rim: 1 })
    })
    const collarAt = torso.pt(1, -10)
    g.add(2, (l) => {
      fill(l, torso, union(oval(1, -11, 16, 8.5), oval(-8, -8, 9, 7.5), oval(10, -8, 9, 7.5)), BEE_FUR[1])
      for (const [u, v, rows] of [
        [-13, -2, BEE_TUFT],
        [-6.5, 0, BEE_TUFT],
        [0, 0.5, BEE_TUFT_R],
        [6.5, 0, BEE_TUFT_R],
        [13, -1.5, BEE_TUFT_R]
      ] as const)
        stampAt(l, torso, rows, u, v, { f: BEE_FUR[1] })
      smooth(l)
      cel(l, { shade: 3, deep: 1, rim: 1, tooth: 2, pitch: 4, origin: collarAt })
      dimEdge(l, BEE_FUR[0], BEE_FUR[1])
      shadow(l, head.moved(0, 2), oval(3, 3, 11, 9))
    })
    // the antennae curling up from the hair, gold bobbles at the tips (spread a little wider on the portrait)
    const antenna = (far: boolean) => (l: Raster) => {
      const tone = far ? PLUM_FAR : BEE_PLUM
      const root = head.child(far ? -5 : 2, -11, far ? -24 : 26)
      const pts: [number, number][] = far
        ? [root.pt(0, 0), root.pt(-1, -7), root.pt(-4, -13), root.pt(-8, -15)]
        : [root.pt(0, 0), root.pt(1, -7), root.pt(4, -13), root.pt(8, -15)]
      ribbon(l, spline(pts), (t) => 2 - t * 0.5, tone[1])
      smooth(l)
      cel(l, { shade: 1.2, rim: 1 })
      const [bx, by] = pts[3]
      l.stamp(['.yy.', 'yhyy', 'yyyo', '.oo.'], Math.round(bx) - 2, Math.round(by) - 2, {
        y: far ? HONEY[2] : HONEY[1],
        h: far ? HONEY[1] : HONEY[0],
        o: far ? HONEY[3] : HONEY[2]
      })
    }
    g.add(2.6, antenna(true))
    g.add(2.7, antenna(false))
    // the pale face under the dark glossy bob, one silhouette
    g.add(3, (l) => {
      fill(l, head, union(face, hairShape), BEE_SKIN[1])
      tint(l, head, minus(hairShape, window), BEE_PLUM[1])
      smooth(l)
      cel(l, { shade: 2.4, deep: 0.8, rim: 1 })
      within(
        l,
        (m) => ribbon(m, spline([head.pt(-10, -4), head.pt(-6, -9), head.pt(1, -11.2)]), () => 1.2, BEE_PLUM[0]),
        true
      )
      within(l, (m) => fill(m, head, oval(1, 6, 2.6, 1.4), R.bandana[0]), true)
      // the face: heavy-lidded disdain, arched brows, a thin red mouth, the nose and a beauty mark
      const key = {
        K: BEE_PLUM[4],
        P: BEE_PLUM[2],
        w: BEE_FUR[0],
        y: HONEY[1],
        o: HONEY[2],
        s: BEE_SKIN[2],
        S: BEE_SKIN[3]
      }
      const mouth = { K: BEE_SKIN[3], k: BEE_PLUM[4], r: R.bandana[1], R: R.bandana[2] }
      within(l, (m) => {
        stampAt(m, head, ['K.......', '.KKKKKK.', '..KKKKKK', '..wyKyw.', '...SSS..'], 2.5, 1.5, key)
        stampAt(m, head, ['.KKKK', 'KKKKK', 'wyKy.', '.SS..'], 11, 1.5, key)
        stampAt(m, head, ['..PPP...', '.P...PP.'], 2.5, -3, key)
        stampAt(m, head, ['.PPP', 'P...'], 11.5, -2.5, key)
        stampAt(m, head, ['kkkk.', '.rR..'], 9, 8.5, mouth)
        stampAt(m, head, ['K', 'K'], 14, 4.5, mouth)
      })
    })
    // the small gold crown: three points with bobbles, a red stone in the band
    g.add(3.5, (l) =>
      stampAt(l, head, ['h...h...h', 'y..yhy..y', 'yy.yyy.yy', 'yyyyyyyyy', 'oyyyryyyo', 'ooooooooo'], -1, -13.5, {
        h: HONEY[0],
        y: HONEY[1],
        o: HONEY[2],
        r: R.bandana[1]
      })
    )
  })

// ------------------------------------------------------------------------------------------------- emblems

/** One rounded-square frame shared by all emblems: 1-px ink rim, 1 px empty margin, inner highlight top-left. */
function insideMask(): Raster {
  const m = new Raster(S, S)
  // inner area 2..29 with 4-px rounded corners
  m.rect(2, 2, 28, 28, 1)
  const cut = [4, 2, 1, 1]
  cut.forEach((n, i) => {
    for (let x = 0; x < n; x++) {
      m.set(2 + x, 2 + i, 0)
      m.set(29 - x, 2 + i, 0)
      m.set(2 + x, 29 - i, 0)
      m.set(29 - x, 29 - i, 0)
    }
  })
  return m
}

const inside = memo(insideMask)

function frame(scene: Raster): Raster {
  const out = new Raster(S, S)
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      if (inside().get(x, y)) out.set(x, y, scene.get(x, y) || R.cosmos[3])
    }
  // rim: every empty pixel touching the inside
  const rim = new Raster(S, S)
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      if (out.get(x, y)) continue
      if (
        [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1]
        ].some(([dx, dy]) => out.get(x + dx, y + dy))
      )
        rim.set(x, y, C.ink)
    }
  out.blit(rim)
  // highlight line along the top-left inner edge
  for (let x = 6; x <= 17; x++) if (inside().get(x, 2)) out.set(x, 2, C.white)
  for (let y = 6; y <= 12; y++) if (inside().get(2, y)) out.set(2, y, C.white)
  out.set(4, 3, C.white)
  out.set(3, 4, C.white)
  return out
}

const scene = () => new Raster(S, S)

/** Bands of flat colour from top to bottom (rows from y0). */
function bands(r: Raster, y0: number, y1: number, cols: readonly number[]) {
  const h = (y1 - y0) / cols.length
  cols.forEach((c, i) => r.rect(2, Math.round(y0 + i * h), 28, Math.ceil(h) + 1, c))
}

function star(r: Raster, x: number, y: number, c: number, big = false) {
  r.set(x, y, c)
  if (big) {
    r.set(x - 1, y, c)
    r.set(x + 1, y, c)
    r.set(x, y - 1, c)
    r.set(x, y + 1, c)
  }
}

function themeMeadow(): Raster {
  const r = scene()
  bands(r, 2, 22, [R.skyDay[1], R.skyDay[1], R.skyDay[0]])
  // cloud
  r.ellipse(8.5, 8.5, 4, 2, R.cloud[1])
  r.ellipse(12, 7.5, 3, 2.4, R.cloud[0])
  r.rect(5, 9, 9, 1, R.cloud[2])
  // sun
  r.ellipse(23.5, 8, 5.5, 5.5, R.skyDay[0])
  ball(r, 23.5, 8, 4, 4, R.gold)
  // hills
  r.ellipse(9, 34, 22, 14, R.grass[0])
  r.ellipse(9, 35, 22, 14, R.grass[1])
  r.ellipse(26, 36, 16, 12, R.grass[2])
  r.ellipse(26, 37, 16, 12, R.grass[3])
  r.rect(2, 28, 28, 2, R.grass[2])
  // flower
  r.line(11, 20, 11, 25, R.leaf[3])
  r.set(12, 23, R.leaf[2])
  r.set(10, 22, R.leaf[2])
  for (const [dx, dy] of [
    [0, -2],
    [-2, 0],
    [2, 0],
    [0, 2]
  ])
    r.set(11 + dx, 19 + dy, R.fruitRed[1])
  r.set(11, 19, R.gold[1])
  r.set(10, 17, R.fruitRed[0])
  return frame(r)
}

function themeNight(): Raster {
  const r = scene()
  bands(r, 2, 30, [R.skyNight[3], R.skyNight[3], R.skyNight[2], R.skyNight[1], R.skyNight[1]])
  // halo and crescent moon
  r.ellipse(19.5, 11, 9.5, 9.5, R.skyNight[2])
  r.ellipse(19.5, 11, 7.5, 7.5, R.skyNight[1])
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = x + 0.5 - 19.5
      const dy = y + 0.5 - 11
      if (dx * dx + dy * dy > 5.6 * 5.6) continue
      const ex = x + 0.5 - 22.2
      const ey = y + 0.5 - 9
      if (ex * ex + ey * ey <= 4.6 * 4.6) continue
      r.set(x, y, x + y < 28 ? C.glow : R.gold[1])
    }
  // stars
  for (const [x, y, b] of [
    [6, 6, true],
    [12, 13, false],
    [5, 16, false],
    [27, 22, false],
    [10, 4, false],
    [28, 4, false]
  ] as const)
    star(r, x, y, C.glow, b)
  // pine silhouettes
  const pine = R.nightFar[4]
  r.rect(2, 26, 28, 4, pine)
  for (const [x, h] of [
    [7, 14],
    [14, 10],
    [21, 13],
    [27, 9]
  ] as const) {
    r.poly([x, 28 - h, x + 4, 22, x - 4, 22], pine)
    r.poly([x, 28 - h + 4, x + 5.5, 27, x - 5.5, 27], pine)
  }
  return frame(r)
}

function themeCave(): Raster {
  const r = scene()
  r.rect(2, 2, 28, 28, R.caveDeep[3])
  // a lit chamber in the middle, dark rock walls around it
  r.ellipse(16, 20, 12, 9, R.caveDeep[1])
  r.ellipse(16, 21, 8, 6, R.caveDeep[0])
  // floor
  r.rect(2, 26, 28, 4, R.caveRock[2])
  r.rect(2, 26, 28, 1, R.caveRock[1])
  r.rect(2, 29, 28, 1, R.caveRock[3])
  // stalactites, lighter than the wall so they read
  for (const [x, w, h] of [
    [5, 6, 11],
    [12, 4, 7],
    [22, 6, 12],
    [28, 4, 8]
  ] as const) {
    r.poly([x - w / 2, 2, x + w / 2, 2, x, 2 + h], R.caveRock[0])
    r.poly([x + 0.5, 2, x + w / 2, 2, x, 2 + h], R.caveRock[1])
  }
  r.rect(2, 2, 28, 2, R.caveRock[1])
  r.rect(2, 4, 28, 1, R.caveRock[2])
  // glowing crystals
  r.poly([4, 27, 6, 18, 9, 27], R.magic[1])
  r.poly([7, 27, 9, 21, 12, 27], R.magic[2])
  r.line(6, 20, 5, 25, R.magic[0])
  r.set(9, 23, C.white)
  r.poly([22, 27, 24.5, 17, 27, 27], R.berry[1])
  r.poly([26, 27, 28, 21, 30, 27], R.berry[2])
  r.line(24, 19, 23, 25, R.berry[0])
  // hanging lantern
  r.line(15, 2, 15, 9, R.steel[2])
  r.rect(13, 10, 5, 6, R.gold[2])
  r.rect(14, 11, 3, 4, C.glow)
  r.rect(13, 9, 5, 1, R.gold[3])
  r.rect(13, 16, 5, 1, R.gold[3])
  r.set(15, 12, C.white)
  return frame(r)
}

function themeForest(): Raster {
  const r = scene()
  r.rect(2, 2, 28, 28, R.forestDeep[2])
  // light shaft
  r.poly([9, 2, 18, 2, 27, 30, 13, 30], R.forestDeep[0])
  r.poly([11, 2, 16, 2, 23, 30, 17, 30], R.leaf[0])
  r.poly([12, 2, 14, 2, 19, 30, 17, 30], C.glow)
  // far trunk
  r.rect(15, 8, 3, 22, R.forestDeep[3])
  // thick trunks
  for (const [x, w] of [
    [3, 6],
    [22, 7]
  ] as const) {
    r.rect(x, 2, w, 28, R.bark[1])
    r.rect(x + w - 2, 2, 2, 28, R.bark[2])
    r.rect(x, 2, 1, 28, R.bark[0])
    r.rect(x + 2, 12, 1, 5, R.bark[3])
    r.rect(x + 1, 20, 1, 4, R.bark[3])
  }
  // canopy
  for (const x of [4, 10, 16, 22, 28]) ball(r, x, 4, 6, 4.5, R.forestDeep)
  r.rect(2, 2, 28, 2, R.forestDeep[3])
  for (const x of [8, 20]) ball(r, x, 7, 4, 2.5, R.pineLeaf)
  // ground
  r.ellipse(16, 33, 20, 6, R.grassForest[1])
  r.rect(2, 28, 28, 2, R.grassForest[2])
  return frame(r)
}

function themeFortress(): Raster {
  const r = scene()
  r.rect(2, 2, 28, 28, R.stone[1])
  // stone blocks
  for (let row = 0; row < 7; row++) {
    const y = 2 + row * 4
    r.rect(2, y + 3, 28, 1, R.stone[2])
    for (let x = row % 2 ? 6 : 2; x < 30; x += 8) r.rect(x, y, 1, 3, R.stone[2])
  }
  r.rect(2, 2, 28, 1, R.stone[0])
  // barred window
  r.rect(7, 6, 9, 13, R.stone[3])
  r.rect(8, 7, 7, 11, C.inkCool)
  r.rect(9, 8, 5, 5, R.skyNight[2])
  r.rect(11, 7, 1, 11, R.steel[1])
  r.rect(8, 12, 7, 1, R.steel[1])
  r.rect(8, 15, 7, 1, R.steel[1])
  // banner
  r.rect(20, 3, 8, 1, R.wood[2])
  r.rect(21, 4, 6, 9, R.bandana[1])
  r.rect(25, 4, 2, 9, R.bandana[2])
  r.poly([21, 13, 27, 13, 24, 16], R.bandana[2])
  r.set(23, 7, R.gold[1])
  r.set(24, 7, R.gold[1])
  r.set(23, 8, R.gold[1])
  // torch
  r.rect(22, 21, 2, 7, R.wood[2])
  r.rect(21, 20, 4, 1, R.steel[2])
  r.poly([20, 20, 23, 12, 26, 20], R.fire[2])
  r.poly([21.5, 20, 23, 14, 24.5, 20], R.fire[1])
  r.poly([22.5, 20, 23, 17, 23.5, 20], R.fire[0])
  r.rect(2, 28, 28, 2, R.stone[2])
  return frame(r)
}

function themeCastle(): Raster {
  const r = scene()
  // dusk sky
  bands(r, 2, 24, [R.castleStone[2], R.castleStone[1], R.castleStone[1], R.castleStone[0]])
  r.ellipse(24, 8, 2.5, 2.5, C.glow)
  // castle silhouette
  const sil = R.castleWall[3]
  r.rect(4, 14, 7, 12, sil)
  r.rect(21, 14, 7, 12, sil)
  r.rect(11, 18, 10, 8, sil)
  r.rect(12, 7, 8, 19, sil)
  r.poly([11, 7, 16, 1.5, 21, 7], R.castleWall[3])
  for (const x of [4, 7, 10, 21, 24, 27]) r.rect(x, 12, 2, 2, sil)
  r.poly([4, 14, 7.5, 9, 11, 14], sil)
  r.poly([21, 14, 24.5, 9, 28, 14], sil)
  r.rect(15, 11, 2, 3, R.fire[1])
  r.rect(7, 18, 1, 3, R.fire[1])
  r.rect(24, 18, 1, 3, R.fire[1])
  // crimson banner on the tower
  r.rect(14, 15, 4, 9, R.crimson[1])
  r.rect(17, 15, 1, 9, R.crimson[2])
  r.poly([14, 24, 18, 24, 16, 27], R.crimson[2])
  r.set(15, 18, R.gold[1])
  r.set(16, 18, R.gold[1])
  // red brick
  r.rect(2, 26, 28, 4, R.brick[1])
  r.rect(2, 26, 28, 1, R.brick[0])
  r.rect(2, 28, 28, 1, R.brick[2])
  for (const x of [7, 15, 23]) r.rect(x, 27, 1, 1, R.brick[3])
  for (const x of [3, 11, 19, 27]) r.rect(x, 29, 1, 1, R.brick[3])
  return frame(r)
}

function themeStar(): Raster {
  const r = scene()
  r.rect(2, 2, 28, 28, R.cosmos[2])
  r.ellipse(20, 20, 13, 10, R.cosmos[1])
  r.ellipse(8, 24, 9, 6, R.nebula[3])
  r.ellipse(8, 24, 6, 3.5, R.nebula[2])
  for (const [x, y, b] of [
    [5, 5, true],
    [14, 4, false],
    [27, 6, true],
    [4, 14, false],
    [26, 15, false],
    [18, 8, false]
  ] as const)
    star(r, x, y, b ? C.glow : C.white, b)
  // ringed planet: the ring is a tilted ellipse, its far half behind the globe
  const ring = (front: boolean) => {
    for (let y = 2; y < 30; y++)
      for (let x = 2; x < 30; x++) {
        const dx = x + 0.5 - 13
        const dy = y + 0.5 - 12.5 - dx * 0.22
        const q = (dx / 8.5) ** 2 + (dy / 2.8) ** 2
        if (q < 0.62 || q > 1.05) continue
        if (front === dy > 0) r.set(x, y, q > 0.85 ? R.gold[2] : R.gold[1])
      }
  }
  ring(false)
  ball(r, 13, 12.5, 5.2, 5.2, R.berry)
  ring(true)
  // floating crystal island
  r.poly([16, 22, 29, 22, 26, 25, 22.5, 29, 19, 25], R.starRock[1])
  r.poly([22.5, 29, 26, 25, 29, 22, 23, 24], R.starRock[2])
  r.rect(16, 21, 13, 1, R.gold[1])
  r.poly([20, 22, 22, 15, 24, 22], R.magic[1])
  r.poly([23, 22, 25, 18, 27, 22], R.magic[2])
  r.line(21, 17, 21, 20, R.magic[0])
  return frame(r)
}

const PORTRAITS: Record<string, () => Raster> = {
  face_hero: hero2,
  face_princess: princess2,
  face_mom: mom2,
  face_king: king2,
  face_crowBoss: crowBoss2,
  face_weaselBoss: weaselBoss2,
  face_boarBoss: boarBoss2,
  face_wolfBoss: wolfBoss2,
  face_bearBoss: bearBoss2,
  face_foxBoss: foxBoss2,
  face_apeBoss: apeBoss2,
  face_beeBoss: beeBoss2
}

const EMBLEMS: Record<string, () => Raster> = {
  theme_meadow: themeMeadow,
  theme_night: themeNight,
  theme_cave: themeCave,
  theme_forest: themeForest,
  theme_fortress: themeFortress,
  theme_castle: themeCastle,
  theme_star: themeStar
}

/** `ui`: the 32×32 `face_*` portraits and `theme_*` emblems. */
export const sheets: SheetModule = {
  ui: () => {
    const out: Record<string, Anim> = {}
    for (const [name, draw] of Object.entries({ ...PORTRAITS, ...EMBLEMS })) out[name] = make(name, draw)
    return out
  }
}

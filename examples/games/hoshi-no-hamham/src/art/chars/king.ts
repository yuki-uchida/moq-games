/**
 * 黒ハム王 (`king`), 「星を喰らう者」: the final boss, ハム彦's own build made enormous and dark. Drawn on the hamster
 * family build (`hamster.ts`) at scale 1.6 in a 128 cell: dark-purple fur with the boss coat (a darker mantle on
 * the back and the crown of the head, a lit top edge, a fur-toothed form shadow, locks on the cheeks and the rump),
 * a lilac mask and belly, dusky rose ear bowls, a heavier body and a lower, heavier brow. His face is his own stamp
 * set: glowing yellow eyes with a slit pupil under slanted brows (red in the rage), a scar through the near brow, a
 * big dark nose and a mouth with two fangs.
 *
 * His accessories are the kit's hooks: a crimson cape with a darker lining that hangs from the shoulders to his
 * heels (driven by `pose.scarf`: direction, length, ripple, phase; `acc.spread`, `acc.billow`, `acc.lining`), its
 * high pointed collar standing behind the head, the cape's edge across the chest to a gold clasp at the throat,
 * the gold crown with five spikes and a dark star gem (`acc.ct` tilt, `acc.cx` / `acc.cy` offset, `acc.gl` a glint
 * travelling along the band, `acc.flare`; `acc.loose` with `acc.lx`, `acc.ly`, `acc.lr` flies free in screen
 * space), dark fire (`acc.fire`, `acc.fph`) behind him, a flame in the near paw (`acc.hf`) and the cast's flash
 * (`acc.flash`), dust and stone chips (`acc.dust`, `acc.kick`), the cape spread flat under a fallen king
 * (`acc.rug`) and the outlined stars over a knocked-out head (`acc.stars`).
 *
 * After the transformation (`king:raged`) the fight's clips are drawn again from the same poses with the red eyes
 * and a low aura of the same dark fire (`acc.aura`, see `aura`).
 *
 * Depth (back to front): the aura (-7.1), dust (-7), dark fire (-6.5), the rug (-6.2), far ear (-5), the cape (-4.3), the collar
 * (-4.25), the kit's tail, far leg, far foot, near leg, body, far arm, near foot (-3.6 … 0.6), the cape's edge
 * across the chest (1), the clasp (1.2), near ear (1.5), head + face (2), the scar (2.05), the crown (2.2), near arm
 * (3), the flame in the paw (3.2), the flash (3.3), front dust (3.4), stars and the loose crown (6, 6.5).
 */
import type { SheetModule } from '../module'
import { TAU, clamp, lag, lerp } from '../motion'
import { C, R, color, ramp } from '../palette'
import { Raster, farRamp, type Pt, type Ramp } from '../raster'
import { Frame, capsule, cel, fill, oval, polygon, ribbon, shadow, smooth, spline, squircle, tint, union } from '../rig'
import { lazyAnim, memo } from '../sheet'
import {
  drawHamster,
  hamLook,
  hamPose,
  hamStamps,
  stampOn,
  type Eyes,
  type HamAccessory,
  type HamLock,
  type HamPose,
  type HamSize,
  type Mouth,
  type StampPair
} from './hamster'

const FUR = R.kingPurple
const BELLY = R.kingBelly
const CAPE = R.crimson
const GOLD = R.gold
const DARK = R.dark
/** The darker mantle on his back and crown: a cooler purple whose lit edge is the coat's pale lilac. */
export const KING_MANTLE = ramp('#9b86d6', '#41387c', '#2a1f4a', '#1c1830', '#1c1830')
/** Dusky rose ear bowls (their deep shares the cape's wine). */
const EAR = ramp('#d8ccf5', '#c06a98', '#8e4274', '#6a1a3a', '#3a1a22')
/** The cape's lining: the crimson's wine, a step deeper. */
const LINING = CAPE[3]
const INK = FUR[4]

/** His cell: 128×128, feet on (64, 120). */
export const KING_CELL: HamSize = { w: 128, h: 128, anchor: [64, 120] }

// ---------------------------------------------------------------------------------------------------- stamps

/**
 * His eyes, a size up from the family's (9×11 near, 8×11 far): `y` the glow's hot top, `Y` the yellow, `o` its
 * orange underside, `p` the slit pupil, `K` the lid and rim, `i` closed-eye lines. The default eye carries its anger
 * in the lid: the inner corner (toward the nose) sits lower.
 */
const EYES_K: Record<Eyes, StampPair> = {
  open: [
    [
      'KK.......',
      'KyKKK....',
      'KyyyyKKK.',
      'KyyYYYYYK',
      'KyYYpYYYK',
      'KYYYpYYYK',
      'KYYYpYYoK',
      'KYYYpYYoK',
      '.KYYpYooK',
      '..KoooKK.',
      '...KKK...'
    ],
    [
      '.......K',
      '....KKKK',
      '.KKKyyYK',
      'KyyyYYYK',
      'KyYpYYYK',
      'KYYpYYYK',
      'KYYpYYoK',
      'KYYpYYoK',
      'KYYpYooK',
      '.KoooKK.',
      '..KKK...'
    ]
  ],
  wide: [
    [
      '..KKKKK..',
      '.KyyyyYK.',
      'KyyYYYYYK',
      'KyYYppYYK',
      'KYYYppYYK',
      'KYYYppYoK',
      'KYYYppYoK',
      'KYYYYYooK',
      '.KYYYooK.',
      '..KKKKK..',
      '.........'
    ],
    [
      '..KKKK..',
      '.KyyYYK.',
      'KyyYYYYK',
      'KyYppYYK',
      'KYYppYYK',
      'KYYppYoK',
      'KYYppYoK',
      'KYYYYooK',
      '.KYYooK.',
      '..KKKK..',
      '........'
    ]
  ],
  // narrowed to a blazing slit (the coil, the charge)
  squint: [
    [
      '.........',
      '.........',
      '.........',
      'KKK......',
      'KyyKKKK..',
      'KyYYpYYKK',
      '.KYYpYooK',
      '..KKKKKK.',
      '.........',
      '.........',
      '.........'
    ],
    [
      '........',
      '........',
      '........',
      '.....KKK',
      '..KKKKyK',
      'KKyYpYYK',
      'KoYYpYoK',
      '.KKKKKK.',
      '........',
      '........',
      '........'
    ]
  ],
  // heavy-lidded: out of breath
  half: [
    [
      '.........',
      '.........',
      '.........',
      '.........',
      'KKKKKKKKK',
      'KYYYpYYYK',
      'KYYYpYYoK',
      '.KYYpYooK',
      '..KoooKK.',
      '...KKK...',
      '.........'
    ],
    [
      '........',
      '........',
      '........',
      '........',
      'KKKKKKKK',
      'KYYpYYYK',
      'KYYpYYoK',
      'KYYpYooK',
      '.KoooKK.',
      '..KKK...',
      '........'
    ]
  ],
  closed: [
    [
      '.........',
      '.........',
      '.........',
      '.........',
      'ii.......',
      '.iii.....',
      '...iiii..',
      '......iii',
      '.........',
      '.........',
      '.........'
    ],
    [
      '........',
      '........',
      '........',
      '........',
      '.......i',
      '.....ii.',
      '..iiii..',
      'iii.....',
      '........',
      '........',
      '........'
    ]
  ],
  // squeezed shut in pain
  hurt: [
    [
      '.........',
      '.........',
      'ii.......',
      '.iii.....',
      '...iii...',
      '.....iii.',
      '...iii...',
      '.iii.....',
      'ii.......',
      '.........',
      '.........'
    ],
    [
      '........',
      '........',
      '.......i',
      '.....ii.',
      '...ii...',
      '.ii.....',
      '...ii...',
      '.....ii.',
      '.......i',
      '........',
      '........'
    ]
  ],
  // a satisfied sneer: lower lids pushed up
  happy: [
    [
      '.........',
      '.........',
      '.........',
      'KK.......',
      'KyKKKKK..',
      'KyYYpYYKK',
      'KYYYpYooK',
      '.KKKKKKK.',
      '..iiii...',
      '.........',
      '.........'
    ],
    [
      '........',
      '........',
      '........',
      '......KK',
      '..KKKKyK',
      'KKyYpYYK',
      'KoYYpYoK',
      '.KKKKKK.',
      '...iii..',
      '........',
      '........'
    ]
  ],
  dizzy: [
    [
      '.........',
      '..iiiii..',
      '.i.....i.',
      'i..iii..i',
      'i.i...i.i',
      'i.i.i.i.i',
      'i.i..i..i',
      'i..i...i.',
      '.i..iii..',
      '..i......',
      '.........'
    ],
    [
      '........',
      '..iiii..',
      '.i....i.',
      'i..ii..i',
      'i.i..i.i',
      'i.i.i..i',
      'i..i..i.',
      '.i...i..',
      '..iii...',
      '........',
      '........'
    ]
  ],
  dizzy2: [
    [
      '.........',
      '......i..',
      '..iii..i.',
      '.i...i..i',
      'i..i..i.i',
      'i.i.i.i.i',
      'i.i...i.i',
      'i..iii..i',
      '.i.....i.',
      '..iiiii..',
      '.........'
    ],
    [
      '........',
      '.....i..',
      '..ii..i.',
      '.i..i..i',
      'i..i.i.i',
      'i.i..i.i',
      'i..ii..i',
      '.i....i.',
      '..iiii..',
      '........',
      '........'
    ]
  ],
  // the family's 'wet' slot: the open eye (the rage turns it red through the key, not the stamp)
  wet: [[], []]
}
EYES_K.wet = EYES_K.open

/** Heavy fur brows: `b` the lit ridge, `B` the dark fur under it, `K` the shadow line it casts on the eye. */
const BROWS_K = {
  angry: [
    ['bbb........', 'BBBbbb.....', 'BBBBBBBbb..', '..BBBBBBBBb', '.....BBBBBB'],
    ['.......bb', '....bbbBB', '.bbBBBBBB', 'BBBBBBB..', 'BBBB.....']
  ],
  hard: [
    ['bb.........', 'BBbbb......', 'BBBBBBbb...', '.BBBBBBBBbb', '....BBBBBBB'],
    ['........b', '.....bbBB', '..bbBBBBB', 'bBBBBBB..', 'BBBB.....']
  ],
  worried: [
    ['........bbb', '.....bbbBBB', '..bbBBBBBBB', 'bBBBBBBB...', 'BBBBB......'],
    ['bb.......', 'BBbbb....', 'BBBBBbb..', '..BBBBBBb', '.....BBBB']
  ],
  raised: [
    ['...bbbbb...', '.bbBBBBBbb.', 'bBBBB.BBBBb', 'BBB.....BBB', '...........'],
    ['..bbbbb..', '.bBBBBBb.', 'bBBB.BBBb', 'BB.....BB', '.........']
  ]
} as const

/** The scar through the near brow: a pale seam with two stitches. */
const SCAR = ['s....', '.s...', 'sss..', '..s..', '..ss.', '...s.', '..sss', '....s']

/** Mouths, hung from the nose: `K` lips, `w` fangs and teeth, `m` the mouth, `t` the tongue. */
const MOUTHS_K: Record<Mouth, readonly string[]> = {
  // the sneer: the lip lifted on the far side, both fangs over the lip
  smile: ['......K.....K', '.KKKKK.KKKKK.', '.KwwK....KwwK', '..KwK....KwK.', '...K......K..'],
  // grim: a flat line, fangs down
  flat: ['......K......', '.KKKKK.KKKKK.', '.KwwK...KwwK.', '..KwK...KwK..', '...K.....K...'],
  grit: ['.KKKKKKKKK.', 'KwKwKwKwKwK', 'KwKwKwKwKwK', '.KKKKKKKKK.'],
  // the roar
  wide: [
    'KKKKKKKKKKKKK',
    'KwwKmmmmmKwwK',
    'KwKmmmmmmmKwK',
    'KKmmmmmmmmmKK',
    'KmmmmmmmmmmmK',
    'KmmmmtttmmmmK',
    '.KmmttttttmK.',
    '..KmttttmmK..',
    '...KKKKKKK...'
  ],
  gape: [
    'KKKKKKKKKKKKK',
    'KwwKmmmmmKwwK',
    'KwKmmmmmmmKwK',
    'KKmmmmmmmmmKK',
    'KmmmmmmmmmmmK',
    'KmmmmtttmmmmK',
    '.KmmttttttmK.',
    '..KmttttmmK..',
    '...KKKKKKK...'
  ],
  // the gasp, the pant
  o: ['.KKKKK.', 'KwmmmwK', 'KmmmmmK', 'KmmtmmK', '.KKKKK.'],
  open: ['.KKKKKKK.', 'KwmmmmmwK', 'KmmmmmmmK', 'KmmmttmmK', '.KKKKKKK.'],
  bite: ['.KKKKKKKKK.', 'KwKwKwKwKwK', 'KwKwKwKwKwK', '.KKKKKKKKK.'],
  chomp: ['.KKKKKKKKK.', 'KwKwKwKwKwK', 'KwKwKwKwKwK', '.KKKKKKKKK.'],
  grin: ['.....K.....', '.KKKK.K..KK', 'KwK...KKKwK', '.w.......w.'],
  tongue: ['.KKKKK.', 'KmmmmmK', '.KtttK.', '.Kttt..', '..KK...'],
  small: ['.....K.....', 'KKKKK.KKKKK', '.wK.....Kw.', '.w.......w.'],
  frown: ['...KKKKK...', '.KK.....KK.', 'Kw.......wK', '.w.......w.']
}

const BASE_STAMPS = hamStamps(FUR, EAR)
const EYE_KEY: Record<string, number> = {
  K: INK,
  y: C.glow,
  Y: GOLD[1],
  o: GOLD[2],
  p: INK,
  i: INK,
  B: INK,
  b: FUR[3]
}
/** The glow's second state (the pulse): the yellow runs hotter. */
const EYE_KEY_HOT = { ...EYE_KEY, y: C.white, Y: C.glow, o: GOLD[1] }
/** The rage's blood red: a colour of its own, used for nothing but his eyes in the rage. */
export const KING_RAGE_RED = color('#ff2a4a')
/** The rage: the same eyes, blood red. */
const EYE_KEY_RED = { ...EYE_KEY, y: CAPE[0], Y: KING_RAGE_RED, o: CAPE[2] }

const STAMPS = {
  ...BASE_STAMPS,
  eyes: EYES_K,
  eyeKey: EYE_KEY,
  brows: BROWS_K,
  mouths: MOUTHS_K,
  // the tongue borrows the cape's lit pink (one colour fewer in the roar frames)
  mouthKey: { K: INK, w: C.white, m: C.mouth, t: CAPE[0], p: FUR[2] },
  nose: ['.nnnn.', 'nhnnnn', 'nnnnnn', '.nnnn.'],
  noseKey: { h: BELLY[0], n: FUR[3] },
  tufts: null
}

/** Fur locks that break the silhouette (`f` = the coat). */
const LOCK_BACK = ['...ff', '..fff', '.ffff', 'ffff.', 'fff..']
const LOCK_DOWN = ['fffff', 'fffff', '.fff.', '.ff..', '..f..']
const LOCK_CHEEK = ['ffff.', 'fffff', '.ffff', '..fff', '...ff', '....f']
const HEAD_LOCKS: HamLock[] = [[LOCK_CHEEK, -15.5, -4, 'fur']]
const BODY_LOCKS: HamLock[] = [
  [LOCK_BACK, -10.5, -7, 'fur'],
  [LOCK_DOWN, -6, 1.5, 'fur']
]

// ------------------------------------------------------------------------------------------------ accessories

const ID = Frame.at(0, 0)
const accOf = (p: HamPose, k: string, d = 0) => p.acc[k] ?? d

/** Where the cape hangs from: the back of the shoulders. */
const capeTop = (torso: Frame) => torso.pt(-6.5, -15.5)

/**
 * The cape as a screen polygon: a centre line from the shoulders in the pose's direction (0 streams straight back,
 * 90 hangs down, −90 straight up), rippling toward the hem; the outer edge bellies out, the hem is scalloped.
 */
function capeGeometry(p: HamPose, torso: Frame, s: number) {
  const [dir, len, ripple, phase] = p.scarf
  const spread = accOf(p, 'spread', 1)
  const billow = accOf(p, 'billow', 1)
  const top = capeTop(torso)
  const a = ((dir + p.turn + p.lean * 0.4) * Math.PI) / 180
  const d: Pt = [-Math.cos(a), Math.sin(a)]
  const n: Pt = [-d[1], d[0]]
  const L = len * s * 0.74
  const N = 10
  const outer: Pt[] = []
  const inner: Pt[] = []
  const mid: Pt[] = []
  const halfAt = (t: number) => lerp(4.5, 11, Math.pow(t, 0.75)) * spread * s
  for (let i = 0; i <= N; i++) {
    const t = i / N
    const w = ripple * Math.sin(phase - t * 3.2) * t * 2 * s
    const c: Pt = [top[0] + d[0] * L * t + n[0] * w, top[1] + d[1] * L * t + n[1] * w]
    const h = halfAt(t)
    const b = billow * Math.sin(Math.PI * Math.min(1, t * 1.15)) * 2.2 * s
    mid.push(c)
    outer.push([c[0] + n[0] * (h * 1.25 + b), c[1] + n[1] * (h * 1.25 + b)])
    inner.push([c[0] - n[0] * h * 0.5, c[1] - n[1] * h * 0.5])
  }
  // the scalloped hem: four lobes from the outer corner to the inner one
  const hem: Pt[] = []
  const o = outer[N]
  const e = inner[N]
  const K = 4
  for (let i = 1; i < 24; i++) {
    const u = i / 24
    const lobe = Math.abs(Math.sin(Math.PI * K * u + phase * 0.3)) * 1.7 * s
    hem.push([lerp(o[0], e[0], u) + d[0] * lobe, lerp(o[1], e[1], u) + d[1] * lobe])
  }
  return { outer, inner, mid, hem, d, n, top, halfAt }
}

const cape: HamAccessory = ({ g, pose: p, torso, s, ground }) => {
  if (accOf(p, 'rug') > 0) return
  g.add(-4.3, (l) => {
    const { outer, inner, mid, hem } = capeGeometry(p, torso, s)
    const N = outer.length - 1
    fill(l, ID, polygon([...outer, ...hem, ...[...inner].reverse()]), CAPE[1])
    // the lining shows along the outer edge as the cape opens
    const lining = accOf(p, 'lining')
    if (lining > 0) {
      const strip: Pt[] = []
      for (let i = 0; i <= N; i++) {
        const t = i / N
        const k = clamp(lining * (0.15 + t * 0.6), 0, 0.85)
        strip.push([lerp(outer[i][0], mid[i][0], k), lerp(outer[i][1], mid[i][1], k)])
      }
      tint(
        l,
        ID,
        polygon([...outer, ...hem.slice(0, Math.round(hem.length * lining * 0.5)), ...strip.reverse()]),
        LINING
      )
    }
    smooth(l)
    cel(l, { shade: 2.2 * s, rim: 1 })
    // two folds running down from the shoulders to the hem
    for (const k of [0.3, 0.68]) {
      const a = Math.round(N * 0.3)
      const from: Pt = [lerp(mid[a][0], outer[a][0], k * 0.6), lerp(mid[a][1], outer[a][1], k * 0.6)]
      const to: Pt = [lerp(inner[N][0], outer[N][0], k + 0.1), lerp(inner[N][1], outer[N][1], k + 0.1)]
      shadow(l, ID, capsule(from, to, 0.6, 1.3))
    }
    // a standing king's cape pools on the floor: nothing below the soles; nothing on the cell's edge
    const floor = p.turn === 0 && p.air <= 0 ? Math.round(ground.pt(0, 0)[1]) : l.h - 2
    clearOutside(l, floor)
  })
}

/** Clears a layer below row `floor` and within 2 px of the cell's edge. */
function clearOutside(l: Raster, floor: number) {
  for (let y = 0; y < l.h; y++)
    for (let x = 0; x < l.w; x++) if (x < 2 || y < 2 || x >= l.w - 2 || y > Math.min(floor, l.h - 3)) l.set(x, y, 0)
}

/** The high pointed collar standing behind the head: crimson outside, the wine lining facing the head. */
const collar: HamAccessory = ({ g, pose: p, torso, head, s }) => {
  if (accOf(p, 'rug') > 0) return
  const flare = accOf(p, 'collar')
  g.add(-4.25, (l) => {
    const back = [
      torso.pt(-1, -14.5),
      head.pt(-10, -12),
      head.pt(-19 - flare * 2, -27 - flare * 2),
      head.pt(-19.5 - flare * 2, -11),
      torso.pt(-11.5, -11.5)
    ]
    fill(l, ID, polygon(back), CAPE[1])
    tint(
      l,
      ID,
      polygon([torso.pt(-2, -15), head.pt(-11, -13), head.pt(-18 - flare * 2, -24.5 - flare * 2), head.pt(-15.5, -12)]),
      LINING
    )
    const front = [torso.pt(4, -15), head.pt(12, -10), head.pt(15.5 + flare * 3, -19 - flare * 4), head.pt(15, -8)]
    fill(l, ID, polygon(front), CAPE[2])
    smooth(l)
    cel(l, { shade: 1.4 * s, rim: 1 })
    void s
  })
}

/** The cape's edge over the near shoulder and across the chest to the clasp, and the clasp itself. */
const clasp: HamAccessory = ({ g, pose: p, torso, head, headShape, f, s }) => {
  if (accOf(p, 'rug') > 0 && p.lie) return
  const at: Pt = [0.5 + 7.4 * f, -12.6]
  g.add(1, (l) => {
    const band = spline([torso.pt(-5, -14.6), torso.pt(-1.5, -13.2), torso.pt(at[0] - 1.5, at[1])])
    ribbon(l, band, (t) => (3.6 - t * 0.8) * s, CAPE[1])
    cel(l, { shade: 1.2 * s, rim: 1 })
    shadow(l, head.moved(0.5 * s, 1.6 * s), headShape)
  })
  g.add(1.2, (l) => {
    const c = torso.child(at[0], at[1])
    fill(l, c, union(oval(0, 0, 2.2, 2.1), oval(-2.6, -0.3, 0.9, 0.8)), GOLD[1])
    cel(l, { shade: 1 * s, rim: 1 })
    stampOn(l, c, ['.a.', 'aDd', '.d.'], 0.2, 0.2, { a: FUR[0], D: FUR[3], d: INK })
  })
}

/** The crown in its own units (the band's middle at the origin, spikes up). */
const CROWN_SPIKES: readonly (readonly [number, number])[] = [
  [-6.2, 3.6],
  [-3.2, 5.2],
  [0, 7],
  [3.2, 5.2],
  [6.2, 3.6]
]
const crownShape = () => {
  const parts = [squircle(0, 0, 7.4, 1.8, 3.5)]
  for (const [u, h] of CROWN_SPIKES) {
    parts.push(
      polygon([
        [u - 1.5, -0.6],
        [u, -0.6 - h],
        [u + 1.5, -0.6]
      ]),
      oval(u, -0.2 - h, 0.95)
    )
  }
  return union(...parts)
}
const CROWN = crownShape()
const GEM = ['...a...', '..aDd..', 'aaDDDdd', '.aDDDd.', '..DdD..', '.dd.dd.']
const GEM_FLARE = ['...w...', '..wad..', 'wwaDDdd', '.waDDd.', '..DdD..', '.dd.dd.']
const SPARK = ['.w.', 'www', '.w.']

function drawCrown(l: Raster, c: Frame, s: number, gl: number, flare: number) {
  fill(l, c, CROWN, GOLD[1])
  smooth(l)
  cel(l, { shade: 1.2 * s, rim: 1 })
  // the band's lower edge in shadow, a hard highlight along its top
  shadow(l, c, union(squircle(0, 1.3, 7.4, 0.6, 3)))
  stampOn(l, c, flare > 0 ? GEM_FLARE : GEM, 0, -0.1, { a: FUR[0], D: FUR[3], d: INK, w: C.white })
  if (gl >= 0) stampOn(l, c, SPARK, lerp(-6, 6, gl), -0.8, { w: C.white })
}

const crown: HamAccessory = ({ g, pose: p, head, s, look, size }) => {
  if (accOf(p, 'loose') > 0) {
    g.add(6.5, (l) => {
      const t = new Raster(l.w, l.h)
      drawCrown(t, Frame.at(accOf(p, 'lx'), accOf(p, 'ly'), accOf(p, 'lr'), s * look.head), s, -1, 0)
      // a crown on the floor rests on the soles' row; one in flight stays inside the cell
      const b = t.bounds()
      if (!b) return
      const dy = accOf(p, 'floor') > 0 ? size.anchor[1] - (b.y + b.h - 1) : Math.max(0, 2 - b.y)
      const dx = Math.min(0, l.w - 3 - (b.x + b.w - 1))
      l.blit(t, dx, dy)
    })
    return
  }
  g.add(2.2, (l) => {
    const c = head.child(0.5 + accOf(p, 'cx'), -24.2 + accOf(p, 'cy'), accOf(p, 'ct'))
    drawCrown(l, c, s, accOf(p, 'gl', -1), accOf(p, 'flare'))
  })
}

/** Knuckles on the near paw: a fist's three creases (none while the fingers are spread). */
const knuckles: HamAccessory = ({ g, pose: p, handN }) => {
  if (p.open || p.groom > 0 || p.lie) return
  g.add(3.05, (l) => stampOn(l, handN, ['k.k.k', 'k.k.k'], 1.6, 0.4, { k: BELLY[3] }), false)
}

/** The scar through the near brow (no outline: it is cut into the fur). */
const scar: HamAccessory = ({ g, pose: p, head, fc, look }) => {
  if (p.eyes === 'hurt' || p.eyes === 'closed') return
  const u = Math.max(look.face.eyeMin, fc - look.face.eyeGap) - 1.2
  g.add(2.05, (l) => stampOn(l, head, SCAR, u, -13.6, { s: BELLY[1] }), false)
}

/**
 * One tongue of dark fire: a sinuous centre line from its base, a body that bulges and pinches along its length
 * and licks to a point that curls over; a pale core in its lower half.
 */
function tongue(base: Pt, h: number, w: number, sway: number, lean: number): { body: Pt[]; core: Pt[] } {
  const steps = 12
  const left: Pt[] = []
  const right: Pt[] = []
  const coreL: Pt[] = []
  const coreR: Pt[] = []
  for (let j = 0; j <= steps; j++) {
    const t = j / steps
    const x = base[0] + Math.sin(sway + t * 4.2) * t * w * 0.8 + lean * t * t * h * 0.22
    const y = base[1] - h * t
    const hw = w * Math.pow(1 - t, 0.7) * (1 + 0.3 * Math.sin(t * 9 + sway * 1.3)) + 0.3
    left.push([x - hw, y])
    right.unshift([x + hw, y])
    if (t <= 0.5) {
      coreL.push([x - hw * 0.45, y + 1.5])
      coreR.unshift([x + hw * 0.45, y + 1.5])
    }
  }
  return { body: [...left, ...right], core: [...coreL, ...coreR] }
}

/** Dark fire climbing behind him (`acc.fire` 0..1, `acc.fph` the flicker phase). */
const fire: HamAccessory = ({ g, pose: p, ground, root }) => {
  const level = accOf(p, 'fire')
  if (level <= 0) return
  const ph = accOf(p, 'fph')
  g.add(-6.5, (l) => {
    const [gx, gy] = ground.pt(0, 0)
    const [, ry] = root.pt(0, -14)
    const tongues: { body: Pt[]; core: Pt[] }[] = []
    const N = 9
    for (let i = 0; i < N; i++) {
      const k = i / (N - 1) - 0.5 // -0.5 … 0.5 across his back
      const bx = gx + k * 92
      const by = lerp(gy - 2, ry, 0.2 + Math.abs(k) * 0.5)
      const tall = (1 - Math.abs(k) * 1.2) * 0.6 + 0.4
      const flick = 0.88 + 0.12 * Math.sin(ph * 2.1 + i * 2.3)
      const h = Math.min(by - 6, (46 + tall * 62) * level * flick)
      tongues.push(tongue([bx, by], h, 8 + (i % 3) * 2, ph * 1.7 + i * 1.9, k * 2.2))
    }
    for (const t of tongues) fill(l, ID, polygon(t.body), DARK[1])
    // the fire's root: a rolling bank behind his legs
    for (let i = 0; i < 7; i++)
      fill(l, ID, oval(gx + (i - 3) * 13, gy - 9 - (i % 2) * 3, 10 * level + 2, 8 * level + 2), DARK[1])
    smooth(l)
    cel(l, { shade: 2.5, dir: [-0.45, 0.89] })
    for (const t of tongues) tint(l, ID, polygon(t.core), DARK[0])
    // nothing within 2 px of the cell edge
    for (let y = 0; y < l.h; y++)
      for (let x = 0; x < l.w; x++) if (x < 2 || y < 2 || x >= l.w - 2 || y >= l.h - 2) l.set(x, y, 0)
  })
}

/**
 * One tongue of the aura along a direction `d` (unit): a centre line whose wave travels from the base to the tip as
 * the phase `ph` grows, a body that tapers to a point with a swell running up it, a pale core in its lower part.
 * Every term turns with `ph` in whole turns, so a loop whose phase steps a whole number of turns closes.
 */
function lick(base: Pt, d: Pt, h: number, w: number, ph: number, k: number): { body: Pt[]; core: Pt[] } {
  const n: Pt = [-d[1], d[0]]
  const steps = 10
  const left: Pt[] = []
  const right: Pt[] = []
  const coreL: Pt[] = []
  const coreR: Pt[] = []
  for (let j = 0; j <= steps; j++) {
    const t = j / steps
    const wave = Math.sin(t * 5 - ph + k) * t * w * 0.75
    const cx = base[0] + d[0] * h * t + n[0] * wave
    const cy = base[1] + d[1] * h * t + n[1] * wave
    const hw = w * Math.pow(1 - t, 0.75) * (1 + 0.25 * Math.sin(t * 8 - ph * 2 + k)) + 0.3
    left.push([cx - n[0] * hw, cy - n[1] * hw])
    right.unshift([cx + n[0] * hw, cy + n[1] * hw])
    if (t <= 0.45) {
      coreL.push([cx - n[0] * hw * 0.45 - d[0] * 1.5, cy - n[1] * hw * 0.45 - d[1] * 1.5])
      coreR.unshift([cx + n[0] * hw * 0.45 - d[0] * 1.5, cy + n[1] * hw * 0.45 - d[1] * 1.5])
    }
  }
  return { body: [...left, ...right], core: [...coreL, ...coreR] }
}

/**
 * Where the aura's tongues rise, in his own units: behind the feet (`g`, on the soles' line), up the back and over
 * the shoulders (`t`, on the torso); with each tongue's share of the height and its width.
 */
const AURA_BASES: readonly (readonly ['g' | 't', number, number, number, number])[] = [
  ['g', -22, -0.5, 0.75, 4.2],
  ['g', -12, -0.5, 0.9, 4.6],
  ['g', 10, -0.5, 0.7, 4],
  ['g', 19, -0.5, 0.6, 3.6],
  ['t', -19, -4, 1, 4.6],
  ['t', -18, -12, 1, 4.4],
  ['t', -13, -18, 0.95, 4],
  ['t', -3, -21, 0.8, 3.8],
  ['t', 9, -18, 0.7, 3.4]
]

/**
 * The raged king's aura (`acc.aura` 0..1 its height; absent on the plain sheet): low tongues of the rage's dark fire
 * rising behind his feet, his back and his shoulders. `acc.aph` is its phase, `acc.alx` leans every tongue sideways
 * (negative streams back), `acc.aly` below 0 flattens it toward the ground, `acc.asp` splays the tongues away from
 * his middle, `acc.agut` makes them gutter (uneven, sunk). A tongue that would come near the cell's edge is
 * shortened, not cut.
 */
/** The aura's body: a step deeper than the rage's flames, so the lit core and the flash of the cast share its ramp. */
const AURA_BODY = DARK[2]
const aura: HamAccessory = ({ g, pose: p, ground, torso, s }) => {
  const level = accOf(p, 'aura')
  if (level <= 0) return
  const ph = accOf(p, 'aph')
  const lx = accOf(p, 'alx')
  const ly = accOf(p, 'aly')
  const sp = accOf(p, 'asp')
  const gut = accOf(p, 'agut')
  g.add(-7.1, (l) => {
    const [gx, gy] = ground.pt(0, 0)
    const lo = 3
    const hiX = l.w - 4
    const hiY = l.h - 4
    const inside = (pts: Pt[]) => pts.every(([x, y]) => x >= lo && x <= hiX && y >= lo && y <= hiY)
    const tongues: { body: Pt[]; core: Pt[] }[] = []
    AURA_BASES.forEach(([on, u, v, share, w], i) => {
      const base = on === 'g' ? ground.pt(u, v) : torso.pt(u, v)
      const side = Math.sign(base[0] - gx) || -1
      const dx = lx + side * sp
      const dy = -1 - ly
      const len = Math.hypot(dx, dy) || 1
      const d: Pt = [dx / len, dy / len]
      const flick = 1 - 0.14 * (0.5 + 0.5 * Math.sin(ph + i * 2.3)) - gut * 0.45 * (0.5 + 0.5 * Math.sin(ph + i * 1.7))
      let h = 22 * s * level * share * flick
      let t = lick(base, d, h, w * s, ph, i * 1.9)
      for (let k = 0; k < 10 && !inside(t.body); k++) {
        h *= 0.82
        t = lick(base, d, h, w * s * 0.92, ph, i * 1.9)
      }
      if (inside(t.body)) tongues.push(t)
    })
    for (const t of tongues) fill(l, ID, polygon(t.body), AURA_BODY)
    // the aura's root: a low smoulder behind his feet
    for (const u of [-9, 0, 9]) {
      const [x, y] = ground.pt(u, -2)
      const rx = Math.min((5.5 + sp * 3) * s * level, x - lo, hiX - x)
      fill(l, ID, oval(x, y, rx, (2.6 - Math.min(0, ly) * 0.8) * s * level), AURA_BODY)
    }
    smooth(l)
    cel(l, { shade: 2, dir: [-0.45, 0.89] })
    for (const t of tongues) tint(l, ID, polygon(t.core), DARK[0])
    // nothing below the soles of a standing king (its outline lands on their row), nothing within 3 px of the cell's edge
    const floor = p.air <= 0 ? Math.floor(gy) - 1 : hiY
    for (let y = 0; y < l.h; y++)
      for (let x = 0; x < l.w; x++) if (x < lo || y < lo || x > hiX || y > Math.min(floor, hiY)) l.set(x, y, 0)
  })
}

/** A flame gathering in the near paw (`acc.hf` its size) and the flash of the cast (`acc.flash`). */
const handFire: HamAccessory = ({ g, pose: p, handN, s }) => {
  const k = accOf(p, 'hf')
  if (k > 0)
    g.add(3.2, (l) => {
      const [x, y] = handN.pt(0, 0)
      const ph = accOf(p, 'fph')
      const ball = oval(x + 0.5, y - 1.5 * k * s, (2.4 + k * 1.6) * s, (2.2 + k * 1.4) * s)
      const t = tongue([x + 0.5, y - 1.5 * k * s], (6 + k * 7) * s, (2 + k * 1.4) * s, ph, 0.3)
      fill(l, ID, union(ball, polygon(t.body)), DARK[1])
      tint(l, ID, union(oval(x + 0.5, y - 1.2 * k * s, (1.2 + k) * s, (1.1 + k) * s), polygon(t.core)), DARK[0])
      smooth(l)
    })
  const flash = accOf(p, 'flash')
  if (flash > 0)
    g.add(3.3, (l) => {
      const [x, y] = handN.pt(6.5, -0.5)
      const pts: Pt[] = []
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU + 0.2
        const r = (i % 2 ? 3.4 : i % 4 ? 8 : 12.5) * flash * s * 0.7
        pts.push([x + Math.cos(a) * r * 1.1, y + Math.sin(a) * r * 0.9])
      }
      fill(l, ID, polygon(pts), DARK[0])
      fill(l, ID, oval(x, y, 2.6 * flash * s, 2.2 * flash * s), C.white)
    })
}

/** Dust puffs and stone chips: thrown out both ways by the slam (`acc.dust`), kicked back by the charge (`acc.kick`). */
const dust: HamAccessory = ({ g, pose: p, s, size }) => {
  const d = accOf(p, 'dust')
  const kick = accOf(p, 'kick')
  if (d <= 0 && kick <= 0) return
  const gy = size.anchor[1]
  const gx = size.anchor[0]
  const puff = (l: Raster, x: number, r: number) => {
    fill(
      l,
      ID,
      union(oval(x, gy - r * 0.75, r * 1.25, r * 0.8), oval(x - r * 0.55, gy - r * 1.15, r * 0.7, r * 0.6)),
      BELLY[1]
    )
  }
  g.add(-7, (l) => {
    if (d > 0)
      for (const side of [-1, 1]) {
        puff(l, gx + side * (26 + d * 8), (3.2 + d * 1.2) * s * 0.9)
        if (d > 0.4) puff(l, gx + side * (38 + d * 9), (2.2 + d * 0.7) * s * 0.8)
      }
    if (kick > 0) {
      const x = gx + accOf(p, 'kx') * s
      puff(l, x, (2 + kick * 1.4) * s)
      puff(l, x - (6 + kick * 4) * s, (1.4 + kick) * s)
    }
    smooth(l)
    cel(l, { shade: 1.4 * s, rim: 1 })
  })
  const chips = accOf(p, 'chips')
  if (chips > 0)
    g.add(3.4, (l) => {
      for (const [side, dx, h, r] of [
        [-1, 28, 10, 1.6],
        [-1, 38, 5, 1.2],
        [1, 30, 12, 1.6],
        [1, 42, 6, 1.2]
      ] as const) {
        const x = gx + side * (dx + chips * 6)
        const y = gy - h * chips - 2
        fill(
          l,
          Frame.at(x, y, side * 30 + chips * 40, s),
          polygon([
            [-r, -r * 0.6],
            [r * 0.4, -r],
            [r, r * 0.3],
            [-r * 0.3, r * 0.8]
          ]),
          FUR[2]
        )
      }
      cel(l, { shade: 1, rim: 1 })
    })
}

/** The cape spread flat on the ground under a fallen king (`acc.rug` 0..1 how far it has settled). */
const rug: HamAccessory = ({ g, pose: p, size, s }) => {
  const k = accOf(p, 'rug')
  if (k <= 0) return
  const gy = size.anchor[1]
  const x0 = size.anchor[0] + accOf(p, 'rx') * s
  g.add(-6.2, (l) => {
    const w = 44 * s
    const top = gy - (9 + (1 - k) * 6) * s
    const pts: Pt[] = [
      [x0 - w * 0.5, gy - 1],
      [x0 - w * 0.47, top + 3 * s],
      [x0 - w * 0.2, top],
      [x0 + w * 0.2, top + 1 * s],
      [x0 + w * 0.48, top + 4 * s],
      [x0 + w * 0.52, gy - 1]
    ]
    for (let i = 1; i < 16; i++) {
      const u = 1 - i / 16
      pts.push([
        lerp(x0 - w * 0.5, x0 + w * 0.52, u),
        gy - 1 + Math.abs(Math.sin(u * 5 * Math.PI + accOf(p, 'rph'))) * 1.3
      ])
    }
    fill(l, ID, polygon(pts), CAPE[1])
    tint(
      l,
      ID,
      polygon([
        [x0 - w * 0.55, gy - 3 * s],
        [x0 + w * 0.55, gy - 3 * s],
        [x0 + w * 0.55, gy + 2],
        [x0 - w * 0.55, gy + 2]
      ]),
      LINING
    )
    smooth(l)
    cel(l, { shade: 1.6 * s, rim: 1 })
    for (const u of [-0.3, 0.05, 0.32])
      shadow(l, ID, capsule([x0 + u * w * 0.6, top + 2 * s], [x0 + u * w * 1.2, gy - 3 * s], 0.6, 1))
  })
}

/** Small outlined stars circling over a knocked-out head (`acc.stars` = the phase, 0..1; absent = none). */
const STAR = ['..y..', '.yYy.', 'yyYyy', '.yYy.', '..y..']
const STAR_SMALL = ['.y.', 'yYy', '.y.']
const stars: HamAccessory = ({ g, pose: p, head }) => {
  const ph = p.acc.stars
  if (ph === undefined) return
  g.add(6, (l) => {
    const [cx, cy] = head.pt(0, -14)
    for (let i = 0; i < 3; i++) {
      const a = (ph + i / 3) * TAU
      const rows = Math.sin(a) > 0 ? STAR : STAR_SMALL
      const x = Math.round(cx + Math.cos(a) * 15) - (rows.length >> 1)
      const y = Math.round(cy - 20 + Math.sin(a) * 4) - (rows.length >> 1)
      l.stamp(rows, x, y, { y: C.glow, Y: C.white })
    }
  })
}

// ------------------------------------------------------------------------------------------------------ look

/** 黒ハム王's look: the family build at 1.6 with the boss coat, his own stamps and his regalia. */
/** What his portrait wears of the sprite's accessories (by name, so the look's own list can change freely). */
export const KING_PORTRAIT_ACCESSORIES: readonly HamAccessory[] = [cape, collar, clasp]

export const KING_LOOK = hamLook({
  scale: 1.6,
  size: KING_CELL,
  head: 1.1,
  body: 1.3,
  ear: 0.94,
  limb: 1,
  reachScaled: true,
  fur: FUR,
  furFar: farRamp(FUR),
  mask: BELLY,
  earBowl: EAR,
  paw: BELLY,
  pawFar: farRamp(BELLY),
  tail: FUR,
  streak: CAPE[1],
  headShade: 3.6,
  headDeep: 1.3,
  bodyShade: 4.6,
  stamps: STAMPS,
  face: {
    eyeV: -9.6,
    eyeGap: 5.4,
    eyeMin: -11,
    eyeMax: 13,
    browV: -12.8,
    noseV: -5,
    noseMax: 14,
    mouthV: -4.4
  },
  coat: {
    mantle: KING_MANTLE,
    bodyMantle: 4,
    headMantle: 4.2,
    rim: 2,
    bodyDeep: 1.6,
    tooth: 3,
    pitch: 5,
    bodyLocks: BODY_LOCKS,
    headLocks: HEAD_LOCKS
  },
  eyeKeyOf: (p) => (accOf(p, 'red') > 0 ? EYE_KEY_RED : accOf(p, 'hot') > 0 ? EYE_KEY_HOT : EYE_KEY),
  accessories: [fire, aura, rug, dust, cape, collar, clasp, scar, crown, knuckles, handFire, stars]
})

/** His pose: the family pose with his rest (blush off, heavy brows, the sneer, the cape hanging). */
export const kingPose = (p: Partial<HamPose> = {}): HamPose =>
  hamPose({
    blush: false,
    brow: 'angry',
    mouth: 'flat',
    armN: [7, 6],
    armF: [5, 5],
    footN: [-1.5, 0, 0],
    footF: [1.5, 0, 0],
    scarf: [86, 22, 0.5, 0],
    ...p,
    acc: { ...p.acc }
  })

export const drawKing = (p: HamPose): Raster => drawHamster(KING_LOOK, p)

// ----------------------------------------------------------------------------------------------------- clips

const draw = (poses: HamPose[]) => poses.map(drawKing)
const P = kingPose

/** Standing over the hero: a slow heavy breath, the cape stirring, the near paw clenching, the glow pulsing, a sneer. */
const idlePoses = memo(() => {
  const n = 6
  const breath = Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos((i / n) * TAU))
  const late = lag(breath, { stiffness: 0.35, damping: 0.5, loop: true })
  return breath.map((b, i) =>
    P({
      squash: 0.6 - b * 1.2,
      head: [0, b > 0.6 ? 1 : 0],
      earN: 2 + late[i] * 6,
      earF: 1 + late[i] * 5,
      elbowN: [-1, 6],
      elbowF: [0, 5.5],
      armN: [7, 6 - Math.round(b)],
      armF: [5, 5 - Math.round(b)],
      open: i === 1 || i === 2,
      paw: i === 3 ? 0.4 : 0,
      scarf: [86 + Math.sin((i / n) * TAU) * 3, 22, 0.6, 0.6 + (i / n) * TAU],
      tail: -late[i],
      mouth: i >= 3 && i <= 4 ? 'smile' : 'flat',
      acc: { hot: i === 2 || i === 3 ? 1 : 0, gl: i === 4 ? 0.35 : i === 5 ? 0.7 : -1, billow: 0.8 + b * 0.3 }
    })
  )
})

/** Turns his head slowly to the hero, flings the cape open with both arms and roars, settles into a looming stance. */
const intro = memo(() =>
  draw([
    P({
      face: 0.35,
      nod: 6,
      squash: 0.6,
      eyes: 'half',
      brow: 'hard',
      armN: [7, 1],
      armF: [5, 1],
      farFront: true,
      scarf: [94, 22, 0.3, 0],
      acc: { spread: 0.9, billow: 0.4 }
    }),
    P({
      face: 0.7,
      nod: 4,
      squash: 1.4,
      y: -1,
      eyes: 'squint',
      brow: 'hard',
      armN: [7, 0],
      armF: [5, 0],
      farFront: true,
      scarf: [92, 22, 0.4, 0.8],
      acc: { spread: 0.9, billow: 0.5, hot: 1 }
    }),
    P({
      squash: 2.6,
      y: -2,
      lean: 6,
      nod: 8,
      eyes: 'squint',
      brow: 'hard',
      mouth: 'grit',
      armN: [4, 2],
      armF: [2, 2],
      scarf: [96, 21, 0.6, 1.6],
      acc: { spread: 0.95, billow: 0.6, hot: 1 }
    }),
    // the fling: arms thrown wide, the cape opens like wings, the roar
    P({
      reach: 1.5,
      paw: 0.8,
      open: true,
      squash: -2.4,
      headSquash: -0.4,
      lean: -6,
      nod: -8,
      jaw: 1,
      eyes: 'open',
      brow: 'hard',
      mouth: 'wide',
      armN: [-14, -5],
      armF: [14, -6],
      earN: -10,
      earF: -8,
      earLift: 1,
      scarf: [24, 23, 1.4, 2.6],
      acc: { spread: 1.5, billow: 2, lining: 1, collar: 1, flare: 1, hot: 1 }
    }),
    P({
      reach: 1.5,
      paw: 0.8,
      open: true,
      squash: -2,
      headSquash: -0.3,
      lean: -7,
      nod: -9,
      jaw: 1.1,
      eyes: 'open',
      brow: 'hard',
      mouth: 'wide',
      armN: [-14, -6],
      armF: [14, -7.5],
      earN: -14,
      earF: -11,
      earLift: 1.4,
      scarf: [18, 23, 1.6, 3.8],
      acc: { spread: 1.6, billow: 2.2, lining: 1, collar: 1, flare: 1, gl: 0.5 }
    }),
    // settling: arms coming down, the cape falling back over the shoulders
    P({
      squash: 1.2,
      lean: 4,
      nod: 4,
      jaw: 0.3,
      eyes: 'open',
      brow: 'hard',
      mouth: 'grit',
      armN: [9, 1],
      armF: [8, 0],
      open: true,
      earN: 4,
      earF: 3,
      scarf: [58, 22, 1.2, 5],
      acc: { spread: 1.2, billow: 1.5, lining: 0.5, collar: 0.4, gl: 0.8 }
    }),
    // the looming stance, kept alive
    P({
      lean: 5,
      nod: 6,
      squash: 0.2,
      head: [1, 0],
      eyes: 'open',
      brow: 'hard',
      mouth: 'smile',
      armN: [9, 3],
      armF: [7, 2],
      earN: 2,
      earF: 1,
      scarf: [74, 22, 0.8, 6],
      acc: { spread: 1.05, billow: 1.1, lining: 0.2 }
    }),
    P({
      lean: 5,
      nod: 6,
      squash: 0.8,
      y: -0.6,
      head: [1, 0],
      eyes: 'open',
      brow: 'hard',
      mouth: 'smile',
      armN: [9, 4],
      armF: [7, 3],
      earN: 4,
      earF: 3,
      scarf: [78, 22, 0.8, 7.2],
      acc: { spread: 1.05, billow: 0.9, lining: 0.1, hot: 1 }
    })
  ])
)

/** Flinch with the eyes shut and the crown jolted, recoil, a furious glare. */
const hurtPoses = memo((): HamPose[] => [
  P({
    x: -2,
    y: 1.5,
    lean: -14,
    squash: -1.4,
    headSquash: -0.4,
    head: [-1, 1],
    nod: -10,
    eyes: 'hurt',
    brow: 'worried',
    mouth: 'grit',
    armN: [-6, -2],
    armF: [10, -4],
    open: true,
    earN: -16,
    earF: -12,
    footN: [-2.5, 0, 0],
    footF: [2.5, 0, -14],
    scarf: [40, 22, 1.4, 0],
    acc: { ct: -16, cx: -1, cy: -2.4, billow: 1.6 }
  }),
  P({
    x: -3,
    lean: -5,
    squash: 2,
    headSquash: 0.4,
    nod: 6,
    eyes: 'closed',
    brow: 'worried',
    mouth: 'grit',
    armN: [3, 4],
    armF: [6, 2],
    earN: -4,
    earF: -3,
    footN: [-2.5, 0, 0],
    footF: [2, 0, 0],
    scarf: [100, 21, 1, 1.4],
    acc: { ct: 9, cx: 0.6, cy: -0.8, billow: 0.6 }
  }),
  P({
    x: -1,
    lean: 6,
    squash: 0.6,
    nod: 6,
    head: [1, 0],
    eyes: 'open',
    brow: 'hard',
    mouth: 'grit',
    armN: [9, 2],
    armF: [7, 1],
    earN: 6,
    earF: 5,
    scarf: [78, 22, 0.9, 2.6],
    acc: { ct: 4, cy: -0.3, hot: 1 }
  })
])

/** A slow, crushing walk: each step a small fall, the body rolling, the cape swinging a beat late. */
const movePoses = memo((): HamPose[] => {
  const n = 8
  // contact (0, 4), down (1, 5), passing (2, 6), up (3, 7)
  const FOOT: [number, number, number][] = [
    [8, 0, -10],
    [4, 0, 0],
    [0, 0, 0],
    [-4.5, 0.5, 18],
    [-8, 3.5, 34],
    [-4, 5.5, 20],
    [2, 5, 0],
    [7, 2, -14]
  ]
  const BOB = [0.6, -0.6, 0.4, 1.2]
  const bob = Array.from({ length: n }, (_, i) => BOB[i % 4])
  const roll = Array.from({ length: n }, (_, i) => Math.sin((i / n) * TAU))
  const late = lag(roll, { stiffness: 0.3, damping: 0.45, loop: true })
  const fall = lag(bob, { stiffness: 0.35, damping: 0.5, loop: true })
  return Array.from({ length: n }, (_, i) => {
    const swing = Math.cos((i / n) * TAU)
    return P({
      y: bob[i],
      x: roll[i] * 0.6,
      lean: 5 + roll[i] * 2,
      squash: i % 4 === 1 ? 1.4 : i % 4 === 3 ? -0.6 : 0.4,
      head: [1, Math.round(-bob[i] * 0.5)],
      nod: 5,
      eyes: 'open',
      brow: 'hard',
      mouth: 'flat',
      footN: [FOOT[i][0] - 1, FOOT[i][1], FOOT[i][2]],
      footF: [FOOT[(i + 4) % n][0] + 1, FOOT[(i + 4) % n][1], FOOT[(i + 4) % n][2]],
      armN: [7 - swing * 4, 4 - Math.abs(swing)],
      armF: [3 + swing * 3, 3.5 - Math.abs(swing)],
      earN: 6 + fall[i] * 8,
      earF: 5 + fall[i] * 6,
      scarf: [74 - late[i] * 10, 22, 1, (i / n) * TAU],
      tail: -fall[i],
      acc: {
        ct: -late[i] * 5,
        billow: 1 + late[i] * 0.4,
        lining: Math.max(0, -late[i]) * 0.3,
        hot: i % 4 === 0 ? 1 : 0
      }
    })
  })
})

/** The telegraph: he sinks low and coils, the near paw drawn back, eyes blazing; the last two frames tremble. */
const windupPoses = memo((): HamPose[] => {
  const set: Partial<HamPose> = {
    y: 0.4,
    squash: 3,
    headSquash: 0.6,
    lean: -10,
    nod: 10,
    head: [1, -1],
    eyes: 'squint',
    brow: 'hard',
    mouth: 'grit',
    armN: [-9, 2],
    armF: [9, 1],
    paw: 0.6,
    earN: 26,
    earF: 22,
    footN: [-4, 0, 0],
    footF: [4, 0, -6]
  }
  return [
    P({
      y: -1,
      squash: 1.6,
      lean: -4,
      nod: 6,
      eyes: 'open',
      brow: 'hard',
      mouth: 'grit',
      armN: [-3, 3],
      armF: [8, 2],
      earN: 12,
      earF: 10,
      footN: [-3, 0, 0],
      footF: [3, 0, 0],
      scarf: [96, 21, 0.6, 0.4],
      acc: { hot: 1, billow: 0.6 }
    }),
    P({ ...set, scarf: [100, 20, 0.8, 1.4], acc: { hot: 1, gl: 0.2, billow: 0.4, collar: 0.6 } }),
    P({ ...set, x: -0.6, scarf: [101, 20, 0.9, 2.2], acc: { gl: 0.6, billow: 0.5, collar: 0.8 } }),
    P({ ...set, x: 0.6, y: 0, scarf: [99, 20, 0.9, 3], acc: { hot: 1, gl: 0.9, billow: 0.4, collar: 0.7 } })
  ]
})

/** The charge: head down like a ram, crown leading, cape streaming flat, a heavy two-legged gallop with dust. */
const attackPoses = memo((): HamPose[] => {
  const n = 6
  const FOOT: [number, number, number][] = [
    [9, 0, -12], // contact
    [3, 0, 0], // down
    [-4, 0, 20], // push-off
    [-9, 5, 60], // kicked up behind
    [-1, 7, 30], // swinging through
    [7, 3, -14] // reaching
  ]
  const BOB = [1, 0, 2, 3.5, 3, 2]
  const late = lag(BOB, { stiffness: 0.4, damping: 0.5, loop: true })
  return Array.from({ length: n }, (_, i) => {
    const j = (i + 3) % n
    const swing = Math.cos((i / n) * TAU)
    return P({
      x: 3,
      y: BOB[i],
      lean: 24,
      squash: i === 1 ? 1.6 : i === 3 ? -1 : 0.4,
      head: [2, -2 - Math.round(late[i] * 0.4)],
      nod: 18 + late[i] * 2,
      eyes: 'squint',
      brow: 'hard',
      mouth: 'grit',
      footN: FOOT[i],
      footF: FOOT[j],
      armN: [-2 + swing * 4, 6],
      armF: [-1 - swing * 3, 5],
      earN: 40 + late[i] * 4,
      earF: 34 + late[i] * 4,
      scarf: [4 + Math.sin((i / n) * TAU) * 5, 25, 1.8, (i / n) * TAU * 2],
      acc: {
        ct: 8 + late[i] * 2,
        spread: 0.8,
        billow: 0.6,
        lining: 0.35,
        kick: i === 0 || i === 3 ? 1 : i === 1 || i === 4 ? 0.5 : 0,
        kx: -10 + (i % 3) * -3
      }
    })
  })
})

/** Air: rising (arms and cape thrown up), the top (cape spread like wings), falling (fists and feet first). */
const airPoses = memo((): HamPose[] => [
  P({
    air: 3,
    reach: 1.5,
    paw: 0.6,
    up: true,
    open: true,
    squash: -2.6,
    headSquash: -0.4,
    lean: -6,
    nod: -8,
    jaw: 0.8,
    eyes: 'wide',
    brow: 'hard',
    mouth: 'wide',
    armN: [-15, -14],
    armF: [15, -14],
    footN: [-4, 1, 40],
    footF: [0, 0.5, 30],
    earN: 26,
    earF: 22,
    scarf: [100, 24, 0.9, 0.5],
    acc: { spread: 0.75, billow: 0.3, gl: 0.3 }
  }),
  P({
    air: 4,
    reach: 1.5,
    paw: 0.6,
    open: true,
    squash: 0.6,
    lean: 4,
    nod: 6,
    eyes: 'open',
    brow: 'hard',
    mouth: 'smile',
    armN: [-12, -5],
    armF: [14, -4],
    footN: [-3, 3, 24],
    footF: [3, 2, 10],
    earN: -8,
    earF: -6,
    earLift: 1,
    scarf: [-6, 27, 1.2, 1.6],
    acc: { spread: 2, billow: 2.4, lining: 1, collar: 1, hot: 1 }
  }),
  P({
    air: 4,
    squash: -1.4,
    lean: 12,
    nod: 12,
    eyes: 'squint',
    brow: 'hard',
    mouth: 'grit',
    armN: [8, 9],
    armF: [9, 8],
    paw: 0.6,
    footN: [3, -1, -20],
    footF: [7, 0, -24],
    earN: -24,
    earF: -20,
    earLift: 2,
    scarf: [-72, 24, 1.4, 3],
    acc: { spread: 1, billow: 1.2, lining: 0.6, ct: -6, cy: -1 }
  })
])

/** The slam: squashed wide with dust and stone chips, the cape collapsing a frame late; rebound; rising. */
const landPoses = memo((): HamPose[] => [
  P({
    y: -0.6,
    squash: 5,
    headSquash: 1.2,
    head: [0, -2],
    nod: 10,
    eyes: 'squint',
    brow: 'hard',
    mouth: 'grit',
    armN: [11, 6],
    armF: [9, 6],
    paw: 0.6,
    footN: [-5, 0, 0],
    footF: [5, 0, 0],
    earN: -18,
    earF: -15,
    earLift: -1,
    scarf: [-40, 24, 1.2, 0],
    acc: { dust: 1, chips: 0.5, spread: 1.2, billow: 1.6, lining: 0.6, ct: 6, cy: 1 }
  }),
  P({
    y: -0.2,
    squash: 3,
    headSquash: 0.6,
    head: [0, -1],
    nod: 8,
    eyes: 'squint',
    brow: 'hard',
    mouth: 'grit',
    armN: [10, 6],
    armF: [8, 5],
    footN: [-4, 0, 0],
    footF: [4, 0, 0],
    earN: -6,
    earF: -5,
    scarf: [110, 18, 1.4, 1.2],
    acc: { dust: 1.6, chips: 1, spread: 1.3, billow: 0.4, ct: -4 }
  }),
  P({
    y: 1,
    squash: -1.6,
    headSquash: -0.4,
    head: [0, 1],
    eyes: 'open',
    brow: 'hard',
    mouth: 'smile',
    armN: [7, 2],
    armF: [4, 2],
    earN: 10,
    earF: 8,
    earLift: 1,
    scarf: [70, 22, 1.2, 2.4],
    acc: { dust: 0.6, spread: 1.05, billow: 1.2, ct: 3, cy: -1 }
  }),
  P({
    squash: 0.6,
    eyes: 'open',
    brow: 'angry',
    mouth: 'flat',
    earN: 3,
    earF: 2,
    scarf: [84, 22, 0.8, 3.4],
    acc: { gl: 0.5 }
  })
])

/** The cast: dark fire gathers in the drawn-back paw (0–2), thrust forward on frame 3, follow-through, recovery. */
const shootPoses = memo((): HamPose[] => [
  P({
    lean: -4,
    squash: 0.8,
    eyes: 'open',
    brow: 'hard',
    mouth: 'grit',
    armN: [-5, 0],
    armF: [5, 3],
    open: true,
    scarf: [90, 22, 0.6, 0],
    acc: { hf: 0.3, fph: 0, hot: 1 }
  }),
  P({
    x: -1,
    lean: -9,
    squash: 1.6,
    nod: -2,
    eyes: 'squint',
    brow: 'hard',
    mouth: 'grit',
    armN: [-9, -2],
    armF: [5, 2],
    open: true,
    footN: [-3, 0, 0],
    footF: [3, 0, 0],
    scarf: [96, 22, 0.7, 1],
    acc: { hf: 0.7, fph: 1.4, collar: 0.4 }
  }),
  P({
    x: -2,
    y: 0.8,
    lean: -11,
    squash: 2.2,
    nod: -4,
    eyes: 'squint',
    brow: 'hard',
    mouth: 'smile',
    armN: [-10, -5],
    armF: [5, 1],
    open: true,
    footN: [-4, 0, 0],
    footF: [4, 0, -6],
    scarf: [100, 22, 0.9, 2],
    acc: { hf: 1.1, fph: 2.6, collar: 0.7, hot: 1 }
  }),
  // the volley leaves: an open palm thrust forward, a flash, the cape snapping back
  P({
    x: 4,
    lean: 18,
    squash: -1.2,
    nod: 6,
    reach: 1.5,
    paw: 0.8,
    open: true,
    jaw: 0.8,
    eyes: 'wide',
    brow: 'hard',
    mouth: 'wide',
    armN: [15, -1],
    armF: [-4, 4],
    footN: [-5, 0, 0],
    footF: [5, 0, 0],
    earN: 22,
    earF: 18,
    scarf: [20, 24, 1.6, 3],
    acc: { flash: 1, spread: 1.1, billow: 1.4, lining: 0.6, gl: 0.4 }
  }),
  P({
    x: 2,
    lean: 10,
    squash: 0.4,
    nod: 6,
    reach: 1.3,
    open: true,
    eyes: 'open',
    brow: 'hard',
    mouth: 'smile',
    armN: [13, 0],
    armF: [1, 4],
    footN: [-4, 0, 0],
    footF: [4, 0, 0],
    earN: 10,
    earF: 8,
    scarf: [50, 23, 1.4, 4.2],
    acc: { hf: 0.25, fph: 4, billow: 1.2, lining: 0.3, gl: 0.8 }
  }),
  P({
    x: 1,
    lean: 4,
    squash: 0.8,
    eyes: 'open',
    brow: 'angry',
    mouth: 'smile',
    armN: [9, 3],
    armF: [4, 3],
    earN: 4,
    earF: 3,
    scarf: [76, 22, 1, 5.4],
    acc: { billow: 1 }
  })
])

/** Out of breath: hunched, the near paw on his knee, panting, the crown askew. */
const recoverPoses = memo((): HamPose[] =>
  [0, 1, 0.3, 0.8].map((pant, i) =>
    P({
      y: 1 - pant * 0.6,
      lean: 16,
      squash: 1.4 + pant * 0.4,
      head: [1, -2],
      nod: 12,
      jaw: 0.3 + pant * 0.4,
      eyes: 'half',
      brow: 'worried',
      mouth: pant > 0.5 ? 'open' : 'o',
      armN: [4, 10],
      armF: [6, 6 - Math.round(pant)],
      footN: [-3, 0, 0],
      footF: [4, 0, 0],
      earN: 18 + pant * 4,
      earF: 15 + pant * 3,
      scarf: [92, 21, 0.4, i * 1.6],
      acc: { ct: 14, cx: 1.5, cy: 0.6, billow: 0.5 + pant * 0.2 }
    })
  )
)

/** The transformation: doubled over in pain, dark fire climbs, he throws his head back and screams, eyes go red. */
const rage = memo(() => {
  const flames = [0.15, 0.3, 0.45, 0.6, 0.78, 0.92, 1, 1, 1, 1]
  const scream: Partial<HamPose> = {
    reach: 1.5,
    paw: 0.8,
    open: true,
    squash: -2.2,
    headSquash: -0.4,
    lean: -10,
    nod: -16,
    jaw: 1.2,
    eyes: 'wide',
    brow: 'hard',
    mouth: 'wide',
    armN: [-14, -7],
    armF: [14, -8],
    earN: -20,
    earF: -16,
    earLift: 2
  }
  const poses: HamPose[] = [
    P({
      lean: 22,
      squash: 2.4,
      y: 0.6,
      head: [1, -3],
      nod: 18,
      eyes: 'hurt',
      brow: 'worried',
      mouth: 'grit',
      armN: [5, 6],
      armF: [7, 4],
      farFront: true,
      earN: 30,
      earF: 26,
      scarf: [96, 21, 0.6, 0],
      acc: { fire: flames[0], fph: 0 }
    }),
    P({
      lean: 26,
      squash: 3,
      y: 0,
      head: [1, -3],
      nod: 22,
      eyes: 'hurt',
      brow: 'worried',
      mouth: 'grit',
      armN: [4, 5],
      armF: [6, 3],
      farFront: true,
      earN: 34,
      earF: 30,
      scarf: [100, 20, 0.8, 0.9],
      acc: { fire: flames[1], fph: 0.9 }
    }),
    P({
      lean: 12,
      squash: 1.6,
      y: -1,
      nod: 10,
      eyes: 'squint',
      brow: 'hard',
      mouth: 'grit',
      armN: [3, 4],
      armF: [8, 2],
      paw: 0.6,
      earN: 20,
      earF: 18,
      scarf: [80, 22, 1, 1.8],
      acc: { fire: flames[2], fph: 1.8, collar: 0.4, billow: 1.3, red: 1 }
    }),
    P({
      ...scream,
      scarf: [36, 22, 1.4, 2.7],
      acc: { fire: flames[3], fph: 2.7, spread: 1.4, billow: 2, lining: 0.9, collar: 1, red: 1 }
    }),
    P({
      ...scream,
      nod: -18,
      scarf: [26, 23, 1.6, 3.6],
      acc: { fire: flames[4], fph: 3.6, spread: 1.5, billow: 2.2, lining: 1, collar: 1.2, red: 1, flare: 1 }
    }),
    P({
      ...scream,
      nod: -17,
      earLift: 2.4,
      scarf: [22, 23, 1.8, 4.5],
      acc: { fire: flames[5], fph: 4.5, spread: 1.55, billow: 2.4, lining: 1, collar: 1.4, red: 1 }
    }),
    P({
      ...scream,
      nod: -16,
      scarf: [26, 23, 1.6, 5.4],
      acc: { fire: flames[6], fph: 5.4, spread: 1.5, billow: 2.2, lining: 1, collar: 1.4, red: 1, flare: 1 }
    }),
    // the fire at full height: he lowers his head on the hero, burning
    P({
      lean: 6,
      squash: 0.6,
      nod: 6,
      head: [1, 0],
      jaw: 0.4,
      eyes: 'open',
      brow: 'hard',
      mouth: 'grit',
      armN: [10, 2],
      armF: [9, 0],
      open: true,
      paw: 0.4,
      earN: 10,
      earF: 8,
      scarf: [44, 23, 1.4, 6.3],
      acc: { fire: flames[7], fph: 6.3, spread: 1.3, billow: 1.8, lining: 0.6, collar: 1.2, red: 1 }
    }),
    P({
      lean: 6,
      squash: 0.4,
      nod: 6,
      head: [1, 0],
      jaw: 0.4,
      eyes: 'open',
      brow: 'hard',
      mouth: 'grit',
      armN: [10, 2],
      armF: [9, 0],
      open: true,
      paw: 0.4,
      earN: 10,
      earF: 8,
      scarf: [40, 23, 1.4, 7.2],
      acc: { fire: flames[8], fph: 7.2, spread: 1.3, billow: 1.9, lining: 0.6, collar: 1.2, red: 1, gl: 0.4 }
    }),
    P({
      lean: 6,
      squash: 0.8,
      y: -0.5,
      nod: 6,
      head: [1, 0],
      jaw: 0.4,
      eyes: 'open',
      brow: 'hard',
      mouth: 'grit',
      armN: [10, 3],
      armF: [9, 1],
      open: true,
      paw: 0.4,
      earN: 12,
      earF: 9,
      scarf: [42, 23, 1.5, 8.4],
      acc: { fire: flames[9], fph: 8.4, spread: 1.3, billow: 1.7, lining: 0.6, collar: 1.2, red: 1, gl: 0.8 }
    })
  ]
  return draw(poses)
})

/**
 * The last bite: a jolt that knocks the crown off, a sway, he falls flat on his back with a bounce of the belly and
 * lies out cold on his spread cape with the crown on the ground beside him; outlined stars circle on the last two
 * frames.
 */
const defeat = memo(() => {
  /** Flat out on his back (designed, as the hero's knock-out): head at the left, belly up, feet in the air. */
  const flat = (twitch: number, acc: Record<string, number>) =>
    P({
      lie: true,
      face: 0,
      turn: -90,
      air: -6.2,
      x: 4,
      squash: 1,
      nod: -32,
      head: [-7, 10],
      armN: [-7, -5],
      armF: [-3, -8],
      footN: [11 + twitch, 0.5 - twitch, -45 + twitch * 14],
      footF: [6 - twitch, -0.5 + twitch, -40 - twitch * 10],
      earN: 34,
      earF: 30,
      tail: 1,
      eyes: 'dizzy',
      brow: 'none',
      mouth: 'tongue',
      acc: { loose: 1, lx: 110, ly: 110, lr: 74, floor: 1, rug: 1, rx: -8, ...acc }
    })
  return draw([
    P({
      x: -2,
      lean: -14,
      squash: -1.6,
      headSquash: -0.4,
      nod: -12,
      jaw: 0.8,
      eyes: 'hurt',
      brow: 'worried',
      mouth: 'wide',
      armN: [-8, -3],
      armF: [12, -6],
      open: true,
      earN: -18,
      earF: -14,
      scarf: [36, 22, 1.4, 0],
      acc: { loose: 1, lx: 78, ly: 22, lr: 24, billow: 1.6 }
    }),
    P({
      x: -4,
      lean: 8,
      squash: 0.6,
      nod: 14,
      head: [1, -1],
      eyes: 'dizzy',
      brow: 'none',
      mouth: 'o',
      armN: [3, 7],
      armF: [8, 5],
      footN: [-3, 0, 0],
      footF: [3, 1.5, -20],
      earN: 20,
      earF: 16,
      scarf: [108, 21, 1, 1],
      acc: { loose: 1, lx: 96, ly: 22, lr: 80 }
    }),
    P({
      turn: -40,
      x: -3,
      air: 1,
      reach: 1.5,
      open: true,
      eyes: 'dizzy2',
      brow: 'none',
      mouth: 'o',
      armN: [-6, -9],
      armF: [10, -10],
      footN: [3, 3, -30],
      footF: [7, 4, -40],
      earN: -16,
      earF: -12,
      scarf: [80, 22, 1.4, 2],
      acc: { loose: 1, lx: 108, ly: 52, lr: 150 }
    }),
    // hits the ground: squashed flat, the cape slapped out under him, the crown hits the floor
    {
      ...flat(0.6, { lx: 112, ly: 110, lr: 40, rug: 0.4, rph: 0 }),
      air: -5.2,
      squash: 2.4,
      headSquash: 0.6,
      eyes: 'hurt',
      mouth: 'wide'
    },
    // the bounce of the belly
    {
      ...flat(-0.4, { lx: 113, ly: 102, lr: 60, floor: 0, rug: 0.7, rph: 1 }),
      air: -3.8,
      squash: -0.8,
      headSquash: -0.3,
      eyes: 'hurt',
      mouth: 'o'
    },
    flat(0, { rug: 0.9, rph: 2 }),
    flat(0.2, { stars: 0, rph: 2.6 }),
    { ...flat(0.8, { stars: 1 / 6, rph: 3.2 }), eyes: 'dizzy2' }
  ])
})

// ------------------------------------------------------------------------------------------------ the raged king

/** The aura of one frame: its phase and how it lies (see `aura`). */
interface AuraSet {
  ph: number
  h?: number
  lx?: number
  ly?: number
  sp?: number
  gut?: number
}

/** One turn of the aura's phase per pass of a loop of `n` frames (times `turns`): the flames close with the loop. */
const turn = (i: number, n: number, turns = 1) => (i / n) * TAU * turns
/** The phase of a clip that plays once: a steady step, so the tongues keep travelling up. */
const step = (i: number) => i * 2.2

/** How the aura lies in each frame of each clip after the transformation. */
const AURA: Record<string, (i: number, n: number) => AuraSet> = {
  // standing: the low fire breathes and climbs
  idle: (i, n) => ({ ph: turn(i, n) }),
  // the blow knocks him back: the flames drag forward a frame, then stand again
  hurt: (i) => ({ ph: step(i), h: [0.9, 0.95, 1][i], lx: [0.25, 0.1, 0][i] }),
  // the walk: trailing back a little
  move: (i, n) => ({ ph: turn(i, n), lx: -0.25 }),
  // the coil: the fire sinks with him and gathers; the held tail flickers between two states
  windup: (i) => ({ ph: [0, 2.2, 3.4, 3.4 + Math.PI][i], h: [0.95, 0.85, 0.85, 0.85][i] }),
  // the charge: streaming back, short (he already reaches far forward)
  attack: (i, n) => ({ ph: turn(i, n, 2), h: 0.85, lx: -1.5, ly: -0.15 }),
  // the leap: spread wide on the way up and at the top, pulled up behind him in the fall
  air: (i) => ({ ph: step(i), h: [0.95, 1.15, 1][i], sp: [0.7, 1.1, 0.4][i], ly: [-0.2, 0, 0.3][i] }),
  // the slam: flattened and thrown outward, then rising back
  land: (i) => ({ ph: step(i), h: [1.25, 1.1, 0.95, 1][i], ly: [-0.7, -0.55, -0.2, 0][i], sp: [1.5, 1.2, 0.5, 0][i] }),
  // the cast: blown back by the thrust on the release
  shoot: (i) => ({ ph: step(i), lx: [0, 0.1, 0.15, -0.9, -0.45, -0.1][i], h: [1, 1, 1, 0.9, 0.95, 1][i] }),
  // out of breath: low and guttering
  recover: (i, n) => ({ ph: turn(i, n), h: 0.55, gut: 1 })
}

/** A plain pose after the transformation: red eyes, the aura of the frame. */
const ragedPose = (p: HamPose, a: AuraSet): HamPose => ({
  ...p,
  acc: { ...p.acc, red: 1, aura: a.h ?? 1, aph: a.ph, alx: a.lx ?? 0, aly: a.ly ?? 0, asp: a.sp ?? 0, agut: a.gut ?? 0 }
})

const clips = new Map<string, () => Raster[]>()
/** A clip of either sheet from one pose list (the plain poses, or their raged variants), drawn once. */
const clip = (name: string, poses: () => HamPose[], raged: boolean) => {
  const key = `${raged ? 'raged' : 'plain'}/${name}`
  let build = clips.get(key)
  if (!build) {
    build = memo(() => {
      const list = poses()
      return draw(raged ? list.map((p, i) => ragedPose(p, AURA[name](i, list.length))) : list)
    })
    clips.set(key, build)
  }
  return build
}

/** The clips of the fight, the same on both sheets: name, poses, fps, loop, extra timing. */
const FIGHT: readonly [string, () => HamPose[], number, boolean, { sustain?: number }][] = [
  ['idle', idlePoses, 8, true, {}],
  ['hurt', hurtPoses, 12, false, {}],
  ['move', movePoses, 10, true, {}],
  ['windup', windupPoses, 12, false, { sustain: 2 }],
  ['attack', attackPoses, 16, true, {}],
  ['air', airPoses, 8, false, {}],
  ['land', landPoses, 14, false, {}],
  ['shoot', shootPoses, 12, false, {}],
  ['recover', recoverPoses, 6, true, {}]
]

const fight = (raged: boolean) =>
  Object.fromEntries(
    FIGHT.map(([name, poses, fps, loop, extra]) => [name, lazyAnim(clip(name, poses, raged), fps, loop, extra)])
  )

export const sheets: SheetModule = {
  king: () => {
    const f = fight(false)
    return {
      idle: f.idle,
      intro: lazyAnim(intro, 10, false, { sustain: 2 }),
      hurt: f.hurt,
      defeat: lazyAnim(defeat, 10, false, { sustain: 2 }),
      move: f.move,
      windup: f.windup,
      attack: f.attack,
      air: f.air,
      land: f.land,
      shoot: f.shoot,
      recover: f.recover,
      rage: lazyAnim(rage, 10, false, { sustain: 2 })
    }
  },
  // after the transformation: the fight's clips again, red-eyed in a low aura of dark fire
  'king:raged': () => fight(true)
}

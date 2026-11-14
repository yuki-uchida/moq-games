/**
 * The hamster family build: ハム彦 (`hero`), ハム姫 (`princess`), ママ・ハム代 (`mom`) and 黒ハム王 (`king`) are
 * one body drawn by one function, `drawHamster(look, pose, size)`. A **look** says who it is (colours, size,
 * proportions, face stamps, accessories); a **pose** (`HamPose`, the hero's pose type) says what the body does.
 *
 * A two-heads-tall hamster in three-quarter view facing right: a mochi head (a squircle skull over a wide jaw oval)
 * with a mask on the muzzle and cheeks, round ears with a coloured bowl, a crown tuft (stamped, optional), a small
 * pear body with a pale belly, short tapered arms with shaped paws, stub legs with feet, a tail nub.
 *
 * Depth (back to front) of the kit's own layers: speed streaks (-6), far ear (-5), tail (-4.6), far leg (-3.6),
 * far foot (-3.5), near leg (-1), body (0), far arm (0.4; 2.6 with `farFront`), near foot (0.6), groomed forearms
 * (0.9), near ear (1.5), raised arms (1.7, 1.75), head + face (2), groomed paws (2.5), near arm (3). Accessories put
 * their layers between these (the hero's scarf ends at -4.2 / -4, its band, knot and clasp at 1 … 1.2). Keep
 * accessory depths distinct from the kit's: layers on one depth are drawn in the order they were added.
 *
 * ## Making a look
 *
 *   const LOOK: HamLook = hamLook({
 *     fur: R.princessWhite, furFar: farRamp(R.princessWhite), mask: CREAM, earBowl: R.princessPink,
 *     paw: PAW, pawFar: farRamp(PAW), scale: 0.92, head: 1.04, body: 1.06,       // proportions (factors, 1 = hero)
 *     stamps: { ...hamStamps(R.princessWhite, R.princessPink), eyes: MY_EYES },  // replace any stamp set
 *     face: { tuftV: -25 },                                                     // nudge any face position
 *     accessories: [tiara, bow]
 *   })
 *   const frame = drawHamster(LOOK, hamPose({ eyes: 'happy' }))
 *
 * `hamLook` fills everything not given from the hero's values. `hamStamps(fur, earBowl)` is the family's 1× stamp
 * set (the hero's eyes, brows, mouths, nose and three-spike tuft) in a look's colours.
 *
 * ## What scales
 *
 * `scale` turns the whole rig through the root `Frame` (1 = the hero, about 46 px tall from the soles to the tuft;
 * the mother about 1.3 in a 96 cell, the king about 1.6 in a 128 cell). Every shape, every pose value (`x`, `y`,
 * `air`, hands, feet, head offsets: they are in the hero's pixels) and every `cel` depth scales with it. `head`,
 * `body` and `ear` are proportion factors on top (the head frame, the torso's width, the ears). **Stamps do not
 * scale**: eyes, brows, mouths, nose and tuft are pixel grids, so a bigger look brings its own bigger stamp sets
 * and, if needed, moves them (`face`: positions in head units, which do scale). Cel rims stay 1 px.
 *
 * ## Adding an accessory
 *
 * An accessory is a function of the drawn parts (`HamParts`): it adds its own layers to the Painter at its own
 * depths, hanging its shapes on the part frames so it follows the body (turns, squash, tumbles):
 *
 *   const tiara: HamAccessory = ({ g, head, s, pose }) =>
 *     g.add(2.2, (l) => {
 *       fill(l, head, oval(0.5, -24, 4, 2), GOLD[1])                 // shapes in head units: they scale
 *       cel(l, { shade: 1.2 * s, rim: 1 })
 *       if (pose.acc.glint) stampOn(l, head, GLINT, 2, -27, KEY)     // stamps follow by quarter turns
 *     })
 *
 * The parts: `ground` (the soles' line), `root` (the pelvis), `torso`, `head`, `earN`, `earF`, the paw centres
 * `handN` / `handF` (frames on the torso, or on screen while grooming), `knot` (the back of the neck, where the
 * hero's scarf is tied), the head's silhouette `headShape` (for cast shadows: `shadow(l, head.moved(0.5, 2), headShape)`),
 * `fc` (the face's centre line on the head), the facing values `f`, `side`, `hside`, the pose and the look. Soft
 * accessory parts are driven from the pose: `scarf` ([direction, length, ripple, phase]) is any look's cloth end
 * (scarf, ribbon tails, cape) and `acc` carries free numbers for the rest (a glint, a tear, a ladle's swing).
 */
import { clamp, lerp, TAU, track, type Key } from '../motion'
import { C, OUTLINE_OF } from '../palette'
import { Painter, Raster, type Pt, type Ramp } from '../raster'
import {
  Frame,
  capsule,
  cel,
  egg,
  fill,
  half,
  mantle,
  oval,
  overlap,
  shadow,
  sheen,
  smooth,
  squircle,
  tint,
  union,
  type Shape
} from '../rig'

// ------------------------------------------------------------------------------------------------------ pose

export type Eyes = 'open' | 'half' | 'closed' | 'happy' | 'wide' | 'squint' | 'hurt' | 'dizzy' | 'dizzy2' | 'wet'
export type Brow = 'none' | 'angry' | 'worried' | 'raised' | 'hard'
export type Mouth =
  | 'smile'
  | 'grin'
  | 'open'
  | 'wide'
  | 'o'
  | 'flat'
  | 'grit'
  | 'gape'
  | 'bite'
  | 'chomp'
  | 'tongue'
  | 'small'
  | 'frown'
export type Tuft = 'neutral' | 'back' | 'up'
/** A foot: forward (px), lift off the ground (px), toe-down tilt (degrees; negative lifts the toe). */
export type Foot = readonly [number, number, number]
/** A hand relative to its shoulder, in torso units (u forward, v down). */
export type Hand = readonly [number, number]

export interface HamPose {
  /** The whole figure forward (+) and up off the ground (+, feet included). */
  x: number
  air: number
  /** Pelvis lift (+ up): the body rides up and down, planted feet stay. */
  y: number
  /** Whole-body turn in degrees clockwise around the body's centre (tumbles; negative tips it backwards). */
  turn: number
  /** Torso lean in degrees (forward +) and squash (+ wider and shorter, − taller). */
  lean: number
  squash: number
  /** Head squash (keep 0 in quiet clips so the head contour never boils). */
  headSquash: number
  /** Head: offset from its seat (forward, up), nod in degrees (down +). */
  head: readonly [number, number]
  nod: number
  /** Facing: 1 = three-quarter view right, 0 = facing the camera, < 0 turned to look back. */
  face: number
  /** Features sliding over the head (px, forward +). */
  look: number
  /** Ears: turn in degrees (back +), stretch (+ taller, flying up). */
  earN: number
  earF: number
  earLift: number
  tuft: Tuft
  /** Tuft offset in whole pixels (up −): the bounce of the fur. */
  tuftY: number
  armN: Hand
  armF: Hand
  /** The far arm in front of the head and body (facing the camera). */
  farFront: boolean
  /**
   * Cheated arms (CHARACTERS.md "Limbs may cheat"): `reach` scales the longest arm (1 … 1.5), `paw` grows the paws
   * (px of radius), `open` spreads the fingers. With `up` both arms are raised behind the head: their shoulders sit
   * under the jaw, so only the part that clears the head shows, and the paws read beside and above it.
   */
  reach: number
  paw: number
  open: boolean
  up: boolean
  /** Only the far arm raised behind the head (a wave): its shoulder under the jaw, as with `up`. */
  upF: boolean
  /**
   * Optional (absent = off; looks that never set them draw exactly as before): only the near arm raised behind the
   * head (a fist brandished overhead), its shoulder under the jaw as with `up`.
   */
  upN?: boolean
  /**
   * Optional bent arms (absent = the straight arm): the elbow relative to the shoulder in torso units. The arm is
   * then drawn as an upper arm and a forearm meeting at the elbow (hands on the hips, an elbow thrown out).
   */
  elbowN?: Hand
  elbowF?: Hand
  /** Optional: the far arm behind the body (a fist on the far hip, a hand on the small of the back). */
  farBehind?: boolean
  /** Washing the face: 0 = off, else both paws on the muzzle, `rub` 0 (top of the stroke) … 1 (bottom). */
  groom: number
  rub: number
  /** Lying flat: the head is turned on its own (`nod` is then its angle on screen) and may face the camera. */
  lie: boolean
  /** A smear frame: the body drawn out backward along its path by this many px, with speed streaks behind it. */
  smear: number
  footN: Foot
  footF: Foot
  /** Tail nub: up (−) / down (+). */
  tail: number
  /**
   * The look's cloth end (the hero's scarf, the princess's ribbon tails, a cape): direction (0 streams straight
   * back, 90 hangs down, −90 straight up), length, ripple, phase. The kit does not draw it; accessories read it.
   */
  scarf: readonly [number, number, number, number]
  /** Cheeks full of air (0..1.5), the near cheek pushed up by a paw (0..1), the jaw dropped open (0..1). */
  puff: number
  squish: number
  jaw: number
  eyes: Eyes
  brow: Brow
  mouth: Mouth
  blush: boolean
  /** Free numbers for a look's accessories (a glint, a tear, a skirt flare …); the kit ignores them. */
  acc: Readonly<Record<string, number>>
}

export const hamPose = (p: Partial<HamPose> = {}): HamPose => ({
  x: 0,
  air: 0,
  y: 0,
  turn: 0,
  lean: 0,
  squash: 0,
  headSquash: 0,
  head: [0, 0],
  nod: 0,
  face: 1,
  look: 0,
  earN: 0,
  earF: 0,
  earLift: 0,
  tuft: 'neutral',
  tuftY: 0,
  armN: [7, 2.5],
  armF: [2, 2.5],
  farFront: false,
  reach: 1,
  paw: 0,
  open: false,
  up: false,
  upF: false,
  groom: 0,
  rub: 0,
  smear: 0,
  lie: false,
  footN: [0, 0, 0],
  footF: [0, 0, 0],
  tail: 0,
  scarf: [38, 12, 1, 0.6],
  puff: 0,
  squish: 0,
  jaw: 0,
  eyes: 'open',
  brow: 'none',
  mouth: 'smile',
  blush: true,
  acc: {},
  ...p
})

// ---------------------------------------------------------------------------------------------------- stamps

/** A pair of stamps: [near, far]. */
export type StampPair = readonly [readonly string[], readonly string[]]

export interface HamStamps {
  /** Near eye and far eye; every pair shares the centre row so a swap never jumps. */
  eyes: Record<Eyes, StampPair>
  eyeKey: Record<string, number>
  /** Brows: [near, far], placed above the eyes. */
  brows: Record<Exclude<Brow, 'none'>, StampPair>
  /** Mouths, hung from the nose (their top row sits just under it). */
  mouths: Record<Mouth, readonly string[]>
  mouthKey: Record<string, number>
  nose: readonly string[]
  noseKey: Record<string, number>
  /** The crown tuft per variant (all of one height), or null for none. `S` rows are the skull it grows from. */
  tufts: Record<Tuft, readonly string[]> | null
  /** The tuft's silhouette key (painted before shading) and its colour key (painted after, keeping the light). */
  tuftShape: Record<string, number>
  tuftLit: Record<string, number>
}

const EYES: Record<Eyes, StampPair> = {
  open: [
    ['.KKKK.', 'KwwKKK', 'KwwKKK', 'KKKKKK', 'KKKKKK', 'KKKKsK', 'KKKKKK', '.KKKK.'],
    ['.KKK.', 'KwwKK', 'KwwKK', 'KKKKK', 'KKKKK', 'KKKsK', 'KKKKK', '.KKK.']
  ],
  half: [
    ['......', '......', 'iiiiii', 'KwwKKK', 'KKKKKK', 'KKKKsK', 'KKKKKK', '.KKKK.'],
    ['.....', '.....', 'iiiii', 'KwKKK', 'KKKKK', 'KKKsK', 'KKKKK', '.KKK.']
  ],
  closed: [
    ['......', '......', '......', '......', 'i....i', '.iiii.', '......', '......'],
    ['.....', '.....', '.....', '.....', 'i...i', '.iii.', '.....', '.....']
  ],
  happy: [
    ['......', '......', '......', '.iiii.', 'i....i', 'i....i', '......', '......'],
    ['.....', '.....', '.....', '.iii.', 'i...i', 'i...i', '.....', '.....']
  ],
  wide: [
    ['.KKKK.', 'KwwKKK', 'KwwKKK', 'KKKKKK', 'KKKKKK', 'KKKwwK', 'KKKwwK', '.KKKK.'],
    ['.KKK.', 'KwwKK', 'KwwKK', 'KKKKK', 'KKKKK', 'KKwwK', 'KKKKK', '.KKK.']
  ],
  squint: [
    ['......', '......', '......', 'ii....', '.iiiii', '......', '......', '......'],
    ['.....', '.....', '.....', '....i', 'iiii.', '.....', '.....', '.....']
  ],
  hurt: [
    ['......', 'ii....', '..ii..', '....ii', '..ii..', 'ii....', '......', '......'],
    ['.....', '....i', '..ii.', 'ii...', '..ii.', '....i', '.....', '.....']
  ],
  dizzy: [
    ['......', '.iiii.', 'i....i', 'i.ii.i', 'i.i..i', 'i...i.', '.ii...', '......'],
    ['.....', '.iii.', 'i...i', 'i.i.i', 'i.ii.', '.i...', '.....', '.....']
  ],
  dizzy2: [
    ['......', '...ii.', '.i...i', 'i..i.i', 'i.ii.i', 'i....i', '.iiii.', '......'],
    ['.....', '..ii.', '.i..i', 'i.i.i', 'i...i', '.iii.', '.....', '.....']
  ],
  // wet eyes: the family set has none of its own, the open eye stands in
  wet: [
    ['.KKKK.', 'KwwKKK', 'KwwKKK', 'KKKKKK', 'KKKKKK', 'KKKKsK', 'KKKKKK', '.KKKK.'],
    ['.KKK.', 'KwwKK', 'KwwKK', 'KKKKK', 'KKKKK', 'KKKsK', 'KKKKK', '.KKK.']
  ]
}

const BROWS: Record<Exclude<Brow, 'none'>, StampPair> = {
  angry: [
    ['ii..', '.iii'],
    ['.ii', 'ii.']
  ],
  hard: [
    ['iii..', '.iiii'],
    ['..ii', 'iii.']
  ],
  worried: [
    ['..ii', 'ii..'],
    ['ii.', '.ii']
  ],
  raised: [
    ['.ii.', 'i..i'],
    ['.i.', 'i.i']
  ]
}

const MOUTHS: Record<Mouth, readonly string[]> = {
  smile: ['K.K.K', '.KwK.'],
  grin: ['KKKKKK', 'KwwwwK', '.KKKK.'],
  open: ['KKKKK', 'KwmwK', 'KmmmK', '.KKK.'],
  wide: ['KKKKKKK', 'KwwmwwK', 'KmmmmmK', 'KmmtttK', '.KKKKK.'],
  o: ['.KK.', 'KmmK', 'KmtK', '.KK.'],
  flat: ['KKKK'],
  grit: ['KKKKK', 'KwKwK', 'KKKKK'],
  gape: ['KKKKKKK', 'KwwmwwK', 'KmmmmmK', 'KmmtttK', '.KKKKK.'],
  bite: ['KKKKKKKKK', 'KwwwKwwwK', 'KwwwKwwwK', 'KmwKKKwmK', 'KmmmmmmmK', 'KmmtttmmK', 'KmtttttmK', '.KKKKKKK.'],
  chomp: ['KKKKKKKKK', 'KwwwKwwwK', 'KwwwKwwwK', 'KwwwKwwwK', 'KwwwKwwwK', '.KKKKKKK.'],
  tongue: ['KKKKK', 'KmmmK', '.KttK', '.Ktt.', '..K..'],
  small: ['K.K', '.K.'],
  frown: ['.KKK.', 'K...K']
}

/**
 * The hero's crown tuft: three chunky locks (two pixels wide at the base, one only at the tip, the middle one
 * tallest), hand-drawn so they never re-rasterise. `L` is the lit side of a lock, `P` its base colour, `S` the
 * skull rows the locks grow out of. Every variant has the same height, so the skull rows sit on the same line.
 */
export const SPIKY_TUFTS: Record<Tuft, readonly string[]> = {
  // leaning slightly back
  neutral: ['....P......', '....LP.....', '.P..LP.....', '.LP.LPP..P.', '.LPP.LPP.LP', '.SSSSSSSSSS', 'SSSSSSSSSSS'],
  // flattened along the skull by the wind
  back: ['...........', '...........', '.LP........', 'P..LP...P..', 'LP...LP..LP', 'SSSSSSSSSSS', 'SSSSSSSSSSS'],
  // standing and spread
  up: ['....L......', 'L...LP.....', 'LP..LP...L.', '.LP.LP..LP.', '.LP.LP.LP..', 'SSSSSSSSSS.', 'SSSSSSSSSSS']
}

/** The family's 1× stamp set (the hero's face) in a look's colours: fur for the tuft, the ear bowl for the nose. */
export function hamStamps(fur: Ramp, earBowl: Ramp): HamStamps {
  return {
    eyes: EYES,
    eyeKey: { K: C.black, w: C.white, s: earBowl[1], i: C.ink },
    brows: BROWS,
    mouths: MOUTHS,
    mouthKey: { K: C.ink, w: C.white, m: C.mouth, t: C.tongue, p: fur[2] },
    nose: ['hnn', '.n.'],
    noseKey: { h: fur[0], n: earBowl[1] },
    tufts: SPIKY_TUFTS,
    tuftShape: { L: fur[1], P: fur[1], S: fur[1] },
    tuftLit: { L: fur[0], P: fur[1] }
  }
}

/** Turns a stamp grid by clockwise quarter turns. */
export function turnGrid(rows: readonly string[], quarter: number) {
  let grid = [...rows]
  for (let n = quarter; n > 0; n--) {
    const h = grid.length
    const w = grid[0].length
    grid = Array.from({ length: w }, (_, r) => Array.from({ length: h }, (_, col) => grid[h - 1 - col][r]).join(''))
  }
  return grid
}

/**
 * Like `stampAt`, but paints only where the layer is already painted: face details can never float outside the
 * head, whatever the pose. (Toolkit candidate.)
 */
export function stampIn(
  l: Raster,
  f: Frame,
  rows: readonly string[],
  u: number,
  v: number,
  key: Record<string, number>
) {
  const grid = turnGrid(rows, f.quarter)
  const [x, y] = f.pt(u, v)
  const x0 = Math.round(x - grid[0].length / 2)
  const y0 = Math.round(y - grid.length / 2)
  grid.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[i]
      if (ch === '.') continue
      if (l.get(x0 + i, y0 + j)) l.set(x0 + i, y0 + j, key[ch])
    }
  })
}

/**
 * Like `tint`, but only on pixels inside the silhouette (all four neighbours painted): light details such as a
 * highlight or a blush never sit on the edge, where the outline would come out light. (Toolkit candidate.)
 */
export function tintIn(l: Raster, f: Frame, s: Shape, c: number) {
  const src = l.clone()
  const inner = (x: number, y: number) =>
    src.get(x, y) && src.get(x - 1, y) && src.get(x + 1, y) && src.get(x, y - 1) && src.get(x, y + 1)
  const [u0, v0, u1, v1] = s.box
  const pts = [f.pt(u0, v0), f.pt(u1, v0), f.pt(u0, v1), f.pt(u1, v1)]
  const x0 = Math.floor(Math.min(...pts.map((p) => p[0]))) - 1
  const x1 = Math.ceil(Math.max(...pts.map((p) => p[0]))) + 1
  const y0 = Math.floor(Math.min(...pts.map((p) => p[1]))) - 1
  const y1 = Math.ceil(Math.max(...pts.map((p) => p[1]))) + 1
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      if (!inner(x, y)) continue
      const [u, v] = f.local(x + 0.5, y + 0.5)
      if (s.has(u, v)) l.set(x, y, c)
    }
}

/** Like `stampAt` (rig.ts) with the quarter turn of the frame. */
export function stampOn(
  l: Raster,
  f: Frame,
  rows: readonly string[],
  u: number,
  v: number,
  key: Record<string, number>
) {
  const grid = turnGrid(rows, f.quarter)
  const [x, y] = f.pt(u, v)
  l.stamp(grid, Math.round(x - grid[0].length / 2), Math.round(y - grid.length / 2), key)
}

// ------------------------------------------------------------------------------------------------------ look

export interface HamSize {
  w: number
  h: number
  /** Where the soles stand. */
  anchor: readonly [number, number]
}

/** The small cast's cell: 64×64, feet on (32, 60). */
export const HAM_CELL: HamSize = { w: 64, h: 64, anchor: [32, 60] }

/** Where the face stamps sit, in head units (they move with the head and scale with it; the stamps do not). */
export interface HamFace {
  /** Eye row; eyes sit `eyeGap` either side of the face's centre line, clamped to [eyeMin, eyeMax]. */
  eyeV: number
  eyeGap: number
  eyeMin: number
  eyeMax: number
  browV: number
  /** Nose row and the furthest forward the nose goes. */
  noseV: number
  noseMax: number
  /** The mouth hangs from this row (plus half the mouth stamp's height). */
  mouthV: number
  /** The tuft stamp's centre. */
  tuftU: number
  tuftV: number
  /** Blush: offset from the face's centre line (near cheek), row, radii. */
  blushU: number
  blushV: number
  blushR: readonly [number, number]
}

/** A lock of fur stamped onto the silhouette before shading: rows (`f` = the material), u, v, material. */
export type HamLock = readonly [rows: readonly string[], u: number, v: number, material: 'fur' | 'mask']

/**
 * The boss treatment of a big coat (CHARACTERS.md "Big furry bodies"), optional on a look: a darker mantle on the
 * back and the crown of the head, a lit top edge, a deep accent in the form shadow, fur teeth on both edges and
 * hand-placed locks that break the silhouette. Looks without it (the small cast) draw exactly as before.
 */
export interface HamCoat {
  /** The mantle's ramp (its base replaces the coat's base on the lit side). */
  mantle: Ramp
  /** How deep the mantle reaches in from the lit edge on the body and on the head (hero px; scaled). */
  bodyMantle: number
  headMantle: number
  /** The lit top edge (px, not scaled). */
  rim: number
  /** The deep accent inside the body's form shadow (hero px; scaled). */
  bodyDeep: number
  /** Fur teeth on the shadow's and the mantle's edges: depth and spacing (px, not scaled). */
  tooth: number
  pitch: number
  /** Locks on the body (torso units) and on the head (head units). */
  bodyLocks?: readonly HamLock[]
  headLocks?: readonly HamLock[]
}

export interface HamLook {
  /** The whole figure (1 = the hero). Shapes, pose values and cel depths scale; stamps do not. */
  scale: number
  /** The cell drawn into when `drawHamster` is given no size. */
  size: HamSize
  /** Proportion factors on top of the scale: the head, the torso's width, the ears (1 = the hero's). */
  head: number
  body: number
  ear: number
  /** Ramps: the coat, the coat a step darker for far limbs, the mask and belly, the ear bowl (and foot pads), paws. */
  fur: Ramp
  furFar: Ramp
  mask: Ramp
  earBowl: Ramp
  paw: Ramp
  pawFar: Ramp
  /** The tail nub's ramp. */
  tail: Ramp
  /** Cheek blush colour, and the second colour of the smear streaks (the first is the coat's shade). */
  blush: number
  streak: number
  /** Head: cel depths of the form shadow and its deep accent (in hero pixels; scaled). */
  headShade: number
  headDeep: number
  /** The body's form shadow (hero pixels; scaled). */
  bodyShade: number
  stamps: HamStamps
  face: HamFace
  accessories: readonly HamAccessory[]
  /**
   * The silhouette's outline: `selective` (the game's default: the lit top-left side in the material's deep
   * colour) or `ink` (every edge in the material's line colour: a white coat needs it to read on light grounds).
   */
  outline: 'selective' | 'ink'
  /** Optional: the boss treatment of a big coat (absent = the small cast's single cel). */
  coat?: HamCoat
  /** Optional: the eye and brow key for a pose (a glow that pulses, eyes that turn red); absent = `stamps.eyeKey`. */
  eyeKeyOf?: (p: HamPose) => Record<string, number>
  /**
   * Optional: cheated arms (`reach` > 1) measured in the look's own scale like every other pose value (absent = in
   * screen pixels, as the small cast was drawn; a bigger look's cheated arms otherwise come out short).
   */
  reachScaled?: boolean
  /** Optional: the arms' thickness factor (absent = 1; a wide `body` factor otherwise fattens the arms with it). */
  limb?: number
}

/** Everything an accessory needs to follow the body. */
export interface HamParts {
  g: Painter
  look: HamLook
  pose: HamPose
  /** The look's scale. */
  s: number
  size: HamSize
  /** The soles' line (turns with a tumble), the pelvis, the torso, the head, the ears. */
  ground: Frame
  root: Frame
  torso: Frame
  head: Frame
  earN: Frame
  earF: Frame
  /** The paw centres: frames on the torso at the paw (on screen while grooming). */
  handN: Frame
  handF: Frame
  /** The back of the neck on the torso (the hero's scarf knot). */
  knot: Frame
  /** The head's silhouette in head units (for cast shadows of the head on what hangs under it). */
  headShape: Shape
  /** The face's centre line on the head (head units). */
  fc: number
  /** Facing: the body's (f, side; lying keeps three-quarter) and the head's (hside). */
  f: number
  side: number
  hside: number
}

export type HamAccessory = (parts: HamParts) => void

const HERO_FACE: HamFace = {
  eyeV: -10,
  eyeGap: 4.5,
  eyeMin: -10.5,
  eyeMax: 11.5,
  browV: -15.5,
  noseV: -5.6,
  noseMax: 13,
  mouthV: -4.6,
  tuftU: 0.5,
  tuftV: -26,
  blushU: 10.2,
  blushV: -4.4,
  blushR: [2.6, 1.5]
}

type LookInput = Pick<HamLook, 'fur' | 'furFar' | 'mask' | 'earBowl' | 'paw' | 'pawFar'> &
  Partial<Omit<HamLook, 'face'>> & { face?: Partial<HamFace> }

/** A look with every value not given taken from the hero's build. */
export function hamLook(o: LookInput): HamLook {
  return {
    scale: 1,
    size: HAM_CELL,
    head: 1,
    body: 1,
    ear: 1,
    tail: o.mask,
    blush: C.blush,
    streak: o.fur[2],
    headShade: 3.2,
    headDeep: 1,
    bodyShade: 2.6,
    stamps: hamStamps(o.fur, o.earBowl),
    accessories: [],
    outline: 'selective',
    ...o,
    face: { ...HERO_FACE, ...o.face }
  }
}

// ------------------------------------------------------------------------------------------------------ draw

/** The longest an arm gets (shoulder to paw), in hero pixels. */
const ARM_REACH = 10
/** Height of the turning centre above the soles (the middle of the standing figure), in hero pixels. */
const MID = 23

/** Cheeks full of air: the near one bulges down and back, the far one past the muzzle. */
const puffN = (p: HamPose, fc: number) => oval(fc - 9.5, -3, 5 + p.puff * 1.5, 4 + p.puff * 1.5)
const puffF = (p: HamPose, fc: number) => oval(Math.min(fc + 7.5, 11), -3, 4.5 + p.puff * 1.8, 3.5 + p.puff * 1.6)

/** The head's silhouette in head units: skull and jaw, plus a dropped jaw and puffed cheeks. */
export const hamHeadShape = (p: HamPose, fc: number): Shape => {
  const parts: Shape[] = [squircle(0.5, -12, 14.5, 11.5, 2.5), oval(0.5, -7, 16, 7)]
  if (p.jaw > 0) parts.push(oval(fc + 1, -1.5 + p.jaw * 1.5, 5.5 + p.jaw * 0.5, 2.5 + p.jaw * 2.5))
  if (p.puff > 0) {
    parts.push(puffN(p, fc), puffF(p, fc))
  }
  return union(...parts)
}

/** The foot in its own frame (toe forward, sole flat on v = 0): a rounded toe, a hint of heel. */
const FOOT = overlap(
  union(oval(0.8, -1.9, 3.4, 2.1), oval(2.7, -1.6, 2.2, 1.8), oval(-2, -1.9, 1.9, 1.9)),
  half([0, 0], 0, -1)
)
const FOOT_SOLE: readonly Pt[] = [
  [-3.6, -0.5],
  [-2, 0],
  [1, 0],
  [3.5, -0.2],
  [4.7, -1]
]

/**
 * The frames of a pose without drawing it (what `drawHamster` hands to the accessories, minus the Painter): for
 * tests and for anything that must know where a part is.
 */
export function hamFrames(look: HamLook, p: HamPose, size: HamSize = look.size) {
  const s = look.scale
  const [ax, ay] = size.anchor
  // the body keeps the three-quarter view while lying; the head may turn to the camera on its own (`face`)
  const hf = clamp(p.face, -1, 1)
  const hside = clamp(Math.abs(hf) * 2, 0, 1) // 0 = straight at the camera, 1 = three-quarter
  const f = p.lie ? 1 : hf
  const side = p.lie ? 1 : hside
  const centre = Frame.at(ax + p.x * s, ay - p.air * s - MID * s, p.turn, s)
  const ground = centre.child(0, MID) // the soles' line
  const root = ground.child(0, -p.y)
  const k = 1 + p.squash * 0.05
  const torso = root.child(-1, -2, p.lean, k * look.body, 1 / k)
  const [hx, hy] = torso.pt(1.5 + p.head[0], -17 - p.head[1])
  const hk = 1 + p.headSquash * 0.05
  const hs = s * look.head
  // the head sits on whole pixels (biased off the .5 boundary of the standing pose, so quiet clips never toggle)
  const head = Frame.at(
    Math.round(hx - 0.25),
    Math.round(hy),
    p.lie ? p.nod : p.turn + p.lean * 0.4 + p.nod,
    hk * hs,
    hs / hk
  )
  const fc = 0.5 + 7.5 * hf + p.look // the centre line of the face on the head
  const earF = head.child(9.5, -19, -p.earF, look.ear, look.ear * (1 + p.earLift * 0.08))
  const earN = head.child(-8.5, -19, -p.earN, look.ear, look.ear * (1 + p.earLift * 0.08))
  const knot = torso.child(-9.2, -15)
  // raised arms grow from under the jaw (hidden by the head), so the hidden stretch does not count as reach
  const upN = p.up || p.upN === true
  const lift = upN ? 6.5 : 0
  const upF = p.up || p.upF
  const liftF = upF ? 6.5 : 0
  const shoulderF: Pt = [lerp(3, 6, side) - (upF ? 1 : 0), -12.5 - liftF]
  const shoulderN: Pt = [-3 + (upN ? 1 : 0), -12 - lift]
  /** The paw centre of an arm, in torso units: a hand out of reach is pulled in (short hamster arms). */
  const handAt = (sh: Pt, hand: Hand, raised: number): Pt => {
    const longest = ARM_REACH * clamp(p.reach, 1, 1.5) + raised
    const reach = Math.hypot(hand[0], hand[1])
    const kk = reach > longest ? longest / reach : 1
    let h: Pt = [sh[0] + hand[0] * kk, sh[1] + hand[1] * kk]
    if (p.reach > 1) {
      // cheated arms keep their length when the body squashes or stretches (only the lean turns them)
      const [sx, sy] = torso.pt(sh[0], sh[1])
      const [ex, ey] = Frame.at(
        sx,
        sy,
        p.turn + p.lean,
        look.reachScaled ? s * look.body : 1,
        look.reachScaled ? s : 1
      ).pt(hand[0] * kk, hand[1] * kk)
      h = torso.local(ex, ey)
    }
    return h
  }
  const rub = clamp(p.rub, 0, 1)
  const groomN = head.pt(fc - 2, -3.8 + rub * 1.8)
  const groomF = head.pt(fc + 2.6, -4.6 + rub * 1.8)
  const hN = handAt(shoulderN, p.armN, lift)
  const hF = handAt(shoulderF, p.armF, liftF)
  const handN = p.groom > 0 ? Frame.at(groomN[0], groomN[1], 0, s) : torso.child(hN[0], hN[1])
  const handF = p.groom > 0 ? Frame.at(groomF[0], groomF[1], 0, s) : torso.child(hF[0], hF[1])
  return {
    s,
    hf,
    hside,
    f,
    side,
    ground,
    root,
    torso,
    head,
    fc,
    earF,
    earN,
    knot,
    shoulderF,
    shoulderN,
    hN,
    hF,
    handN,
    handF,
    groomN,
    groomF
  }
}

/** One frame of a hamster: the look's body in the pose, with the look's accessories. */
export function drawHamster(look: HamLook, p: HamPose, size: HamSize = look.size): Raster {
  const g = new Painter(size.w, size.h, { soft: true })
  const fr = hamFrames(look, p, size)
  const { s, hf, hside, f, side, ground, torso, head, fc, earF, earN } = fr
  const st = look.stamps
  const fa = look.face
  const FUR = look.fur
  const FAR = look.furFar
  const MASK = look.mask
  const EAR = look.earBowl
  const PAW = look.paw
  const PAW_FAR = look.pawFar
  const hShape = hamHeadShape(p, fc)
  const planted = p.turn === 0
  const sole = ground.pt(0, 0)[1]

  // ---- far ear
  g.add(-5, (l) => {
    const tone = hside < 0.5 ? FUR : FAR
    fill(l, earF, oval(2, -3.5, 5.2, 5.4), tone[1])
    tint(l, earF, oval(1.7, -2.9, 2.9, 3.2), hside < 0.5 ? EAR[1] : EAR[2])
    cel(l, { shade: 1.6 * s })
  })
  // ---- tail nub
  if (side > 0.3)
    g.add(-4.6, (l) => {
      fill(l, torso, oval(-11.5 + (1 - f) * 2, -3 + p.tail, 2.8, 2.6), look.tail[1])
      cel(l, { shade: 1.4 * s })
    })

  // ---- legs and feet
  const footFrame = (at: Foot, u: number) => {
    let ff = ground.child(u + at[0], -at[1], at[2], lerp(0.6, 1, side), 1)
    if (planted) {
      // a foot never sinks below the ground line, whatever its tilt
      const low = Math.max(...FOOT_SOLE.map(([su, sv]) => ff.pt(su, sv)[1]))
      if (low > sole) ff = ff.moved(0, sole - low)
    }
    return ff
  }
  const foot = (l: Raster, ff: Frame, tilt: number, tone: Ramp) => {
    fill(l, ff, FOOT, tone[1])
    if (Math.abs(tilt) > 35) tint(l, ff, overlap(FOOT, half([0, -1.3], 0, 1)), EAR[1])
    smooth(l)
    cel(l, { shade: 1.2 * s })
  }
  const leg = (l: Raster, ff: Frame, hip: Pt, tone: Ramp) => {
    const a = torso.pt(hip[0], hip[1])
    const b = ff.pt(-0.8, -2.6)
    fill(l, Frame.at(0, 0), capsule(a, b, 3.3 * s, 2.5 * s), tone[1])
    cel(l, { shade: 1.3 * s })
  }
  const fFar = footFrame(p.footF, 4.5)
  const fNear = footFrame(p.footN, -6)
  g.add(-3.6, (l) => leg(l, fFar, [4, -3.5], side < 0.5 ? FUR : FAR))
  g.add(-3.5, (l) => foot(l, fFar, p.footF[2], side < 0.5 ? PAW : PAW_FAR))
  g.add(-1, (l) => leg(l, fNear, [-4.5, -3.5], FUR))
  g.add(0.6, (l) => foot(l, fNear, p.footN[2], PAW))

  // ---- arms
  const arm = (l: Raster, sh: Pt, hand: Hand, h: Pt, tone: Ramp, paw: Ramp, r: number, elbow?: Hand) => {
    const lr = r * (look.limb ?? 1)
    if (elbow) {
      // a bent arm: upper arm to the elbow, forearm to the paw
      const e: Pt = [sh[0] + elbow[0], sh[1] + elbow[1]]
      fill(l, torso, union(capsule(sh, e, lr, lr - 0.3), capsule(e, h, lr - 0.3, lr - 0.6)), tone[1])
    } else fill(l, torso, capsule(sh, h, lr, lr - 0.6), tone[1])
    const pr = r + 0.1 + p.paw
    const parts: Shape[] = [oval(h[0] + 0.3, h[1] + 0.2, pr, pr - 0.2)]
    if (p.open) {
      // spread fingers: three small lobes round the end of the paw
      const d = Math.hypot(hand[0], hand[1]) || 1
      const [dx, dy] = [hand[0] / d, hand[1] / d]
      for (const a of [-0.85, 0, 0.85]) {
        const [fx, fy] = [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)]
        parts.push(oval(h[0] + 0.3 + fx * (pr + 0.4), h[1] + 0.2 + fy * (pr + 0.4), 1.15))
      }
    }
    fill(l, torso, union(...parts), paw[1])
    smooth(l)
    cel(l, { shade: 1.3 * s })
  }
  const farTone = side < 0.5 || p.farFront ? FUR : FAR
  const farPaw = side < 0.5 || p.farFront ? PAW : PAW_FAR
  const { shoulderF, shoulderN } = fr
  if (p.groom > 0) {
    // washing the face: the forearms run up under the chin, the paws sit on the muzzle in front of the face
    const pawN = fr.groomN
    const pawF = fr.groomF
    const at = (q: Pt) => torso.local(q[0], q[1])
    g.add(0.9, (l) => {
      fill(l, torso, capsule(shoulderF, at(pawF), 2.4, 2), FUR[1])
      fill(l, torso, capsule(shoulderN, at(pawN), 2.6, 2.1), FUR[1])
      smooth(l)
      cel(l, { shade: 1.3 * s })
    })
    g.add(2.5, (l) => {
      fill(
        l,
        Frame.at(0, 0),
        union(oval(pawF[0], pawF[1], 2.6 * s, 2.5 * s), oval(pawN[0], pawN[1], 3 * s, 2.8 * s)),
        PAW[1]
      )
      smooth(l)
      cel(l, { shade: 1.2 * s })
      shadow(l, Frame.at(pawN[0], pawN[1], 0, s), oval(2.6, 0, 0.9, 2.2))
    })
  } else {
    g.add(p.up || p.upF ? 1.7 : p.farFront ? 2.6 : p.farBehind ? -0.5 : 0.4, (l) =>
      arm(l, shoulderF, p.armF, fr.hF, farTone, farPaw, 2.5, p.elbowF)
    )
    g.add(p.up || p.upN ? 1.75 : 3, (l) => arm(l, shoulderN, p.armN, fr.hN, FUR, PAW, 2.8, p.elbowN))
  }

  // ---- body
  if (p.smear > 0) {
    // speed streaks in the look's colours, level on screen, trailing the body
    const [bx, by] = torso.pt(-10 - p.smear, -9)
    g.add(
      -6,
      (l) => {
        const streak = (dy: number, len: number, thick: number, c: number) => {
          const n = Math.round(len * s)
          const t = Math.round(thick * s)
          for (let j = 0; j < t; j++)
            for (let i = j; i < n; i++) l.set(Math.round(bx - 2 * s - i), Math.round(by + dy * s) + j, c)
        }
        streak(-9, 10, 2, look.streak)
        streak(-1, 13, 2, FUR[2])
        streak(6, 7, 1, FUR[2])
      },
      false
    )
  }
  g.add(0, (l) => {
    const body = [egg(0, -9, 10, 9.5, 8.5), oval(-0.5, -5.5, 11, 6.2)]
    if (p.smear > 0) body.push(egg(-1 - p.smear / 2, -8, 10 + p.smear / 2, 7.5, 7))
    fill(l, torso, union(...body), FUR[1])
    tint(l, torso, oval(lerp(0, 5, side) * Math.sign(f || 1), -6.5, lerp(8, 7, side), 7.2), MASK[1])
    smooth(l)
    if (look.coat)
      bigCoat(l, look, torso, look.coat.bodyLocks, look.coat.bodyMantle, look.bodyShade, look.coat.bodyDeep)
    else cel(l, { shade: look.bodyShade * s })
    shadow(l, head.moved(0.5 * s, 2.5 * s), hShape)
  })

  // ---- near ear
  g.add(1.5, (l) => {
    fill(l, earN, oval(-3, -3.5, 6, 6.2), FUR[1])
    tint(l, earN, oval(-2.4, -2.9, 3.5, 3.8), EAR[1])
    tint(l, earN, oval(-1.8, -2.1, 2.2, 2.4), EAR[2])
    cel(l, { shade: 1.6 * s, rim: 1 })
  })

  // ---- head and face
  g.add(2, (l) => {
    fill(l, head, hShape, FUR[1])
    // the mask: muzzle, both cheeks, the chin
    const mask = [
      oval(fc - 3.5 * hside, -3, lerp(13, 15.5, hside), 5.4),
      oval(fc + 0.5 * hside, -6.5, 7, 5.6),
      oval(fc + 6.5 * hside, -8.5, 4, 4)
    ]
    if (hside < 1) mask.push(oval(fc - 6.5, -8.5, 4 * (1 - hside), 4 * (1 - hside)))
    if (p.puff > 0) mask.push(puffN(p, fc), puffF(p, fc))
    if (p.jaw > 0) mask.push(oval(fc + 1, -1.5 + p.jaw * 1.5, 6 + p.jaw * 0.5, 3 + p.jaw * 2.5))
    tint(l, head, union(...mask), MASK[1])
    smooth(l)
    const tuft = st.tufts ? st.tufts[p.tuft] : null
    if (tuft) stampOn(l, head, tuft, fa.tuftU, fa.tuftV + p.tuftY, st.tuftShape)
    if (look.coat) bigCoat(l, look, head, look.coat.headLocks, look.coat.headMantle, look.headShade, look.headDeep)
    else cel(l, { shade: look.headShade * s, deep: look.headDeep * s })
    if (tuft)
      stampOn(
        l,
        head,
        tuft.map((r) => r.replace(/S/g, '.')),
        fa.tuftU,
        fa.tuftV + p.tuftY,
        st.tuftLit
      )
    sheen(l, head, oval(-6.5, -18.3, 3.4, 1.7))
    if (p.squish > 0) shadow(l, head, oval(fc - 9.5, -1.5 - p.squish, 4.5, 1.2))
    // eyes: the near one on the left, the far one a pixel narrower; looking back swaps them
    const [eyeL, eyeR] = st.eyes[p.eyes]
    const flipEyes = hf < -0.2
    const uL = Math.max(fa.eyeMin, fc - fa.eyeGap)
    const uR = Math.min(fa.eyeMax, fc + fa.eyeGap)
    const eyeKey = look.eyeKeyOf ? look.eyeKeyOf(p) : st.eyeKey
    stampIn(l, head, flipEyes ? eyeR : eyeL, uL, fa.eyeV, eyeKey)
    stampIn(l, head, flipEyes || hside < 0.5 ? eyeL : eyeR, uR, fa.eyeV, eyeKey)
    if (p.brow !== 'none') {
      const [bl, br] = st.brows[p.brow]
      stampIn(l, head, bl, uL + 0.5, fa.browV, eyeKey)
      stampIn(l, head, br, uR, fa.browV, eyeKey)
    }
    if (p.blush) {
      const [rx, ry] = fa.blushR
      tintIn(l, head, oval(fc - fa.blushU - (p.puff > 0 ? 1 : 0), fa.blushV, rx, ry), look.blush)
      if (hside < 0.6) tintIn(l, head, oval(fc + fa.blushU, fa.blushV, rx, ry), look.blush)
    }
    // muzzle highlight, nose, mouth
    const nu = Math.min(fa.noseMax, fc + 0.8)
    tintIn(l, head, oval(nu - 0.2, -3.4, 4.2, 2.4), MASK[0])
    stampIn(l, head, st.nose, nu, fa.noseV, st.noseKey)
    const m = st.mouths[p.mouth]
    stampIn(l, head, m, nu + (m[0].length % 2 ? 0 : 0.5), fa.mouthV + m.length / 2 / s, st.mouthKey)
  })

  // ---- the look's accessories
  const parts: HamParts = {
    g,
    look,
    pose: p,
    s,
    size,
    ground,
    root: fr.root,
    torso,
    head,
    earN,
    earF,
    handN: fr.handN,
    handF: fr.handF,
    knot: fr.knot,
    headShape: hShape,
    fc,
    f,
    side,
    hside
  }
  for (const acc of look.accessories) acc(parts)
  const out = g.render()
  if (look.outline === 'ink') inkEdge(out)
  return out
}

/**
 * The boss coat on one part (body or head), painted in base colours and smoothed: locks stamped onto the
 * silhouette, the darker mantle on the lit side, then one fur-toothed cel with a lit top edge. The teeth travel with
 * the part (their origin is the part's own point).
 */
function bigCoat(
  l: Raster,
  look: HamLook,
  f: Frame,
  locks: readonly HamLock[] | undefined,
  mantleDepth: number,
  shadeDepth: number,
  deepDepth: number
) {
  const coat = look.coat!
  const s = look.scale
  for (const [rows, u, v, mat] of locks ?? [])
    stampOn(l, f, rows, u, v, { f: (mat === 'mask' ? look.mask : look.fur)[1] })
  if (locks?.length) smooth(l)
  const origin = f.pt(0, -9)
  const teeth = { tooth: coat.tooth, pitch: coat.pitch, origin }
  mantle(l, look.fur[1], coat.mantle[1], { depth: mantleDepth * s, ...teeth })
  cel(l, { shade: shadeDepth * s, deep: deepDepth * s, rim: coat.rim, ...teeth })
}

/** Every pixel on the silhouette's edge turns to its material's line colour (a full dark outline). */
function inkEdge(r: Raster) {
  const src = r.clone()
  const empty = (x: number, y: number) => !src.get(x, y)
  for (let y = 0; y < r.h; y++)
    for (let x = 0; x < r.w; x++) {
      const c = src.get(x, y)
      if (!c) continue
      if (empty(x - 1, y) || empty(x + 1, y) || empty(x, y - 1) || empty(x, y + 1)) r.set(x, y, OUTLINE_OF[c].line)
    }
  return r
}

// ----------------------------------------------------------------------------------------------------- clips

/** Clip helpers shared by the family. */
export const cyc = (i: number, n = 8) => (i / n) * TAU
export const shift = (f: Foot, du: number): Foot => [f[0] + du, f[1], f[2]]
export const sample = <T extends object>(base: T, keys: readonly Key<T>[], n: number, period?: number) => {
  const at = track(base, keys, period)
  return Array.from({ length: n }, (_, i) => at(i))
}
/** Cheated arms for airborne and cheering poses: half again as long, paws a size up. */
export const LONG = { reach: 1.5, paw: 0.5 } as const

/**
 * ハム彦 (`hero`): a round pink hamster kid in three-quarter view, facing right, with a navy scarf and a gold star
 * clasp. One pose-parametric draw function; every clip is a list of poses (see HERO_SPEC in contract.ts).
 *
 * This file is also the style reference for the whole cast: ball-shaded body, flat cream patches painted onto
 * it, big dark eyes with one highlight, parts assembled back to front with the Painter so overlaps get inner
 * contours.
 */
import type { SheetModule } from '../module'
import { C, R } from '../palette'
import { Painter, Raster, ball, bar, farRamp, shadeEdges, shadeIndex } from '../raster'
import { anim } from '../sheet'

const PINK = R.hamPink
const FAR = farRamp(PINK)
const CREAM = R.hamCream
const EAR = R.hamEar
const SCARF = R.scarf
const SCARF_FAR = farRamp(SCARF)
const GOLD = R.gold

export type Eyes = 'open' | 'half' | 'closed' | 'happy' | 'wide' | 'hurt' | 'squint' | 'swirl'
export type Mouth = 'smile' | 'grin' | 'open' | 'wide' | 'o' | 'flat' | 'grit' | 'bite' | 'chomp' | 'tongue' | 'gape'
export type Brow = 'none' | 'angry' | 'worry' | 'up' | 'hard'

/** An arm: shoulder and hand, both relative to the body centre (px; the body is about 19 wide and 18 tall). */
export type Arm = readonly [shoulderX: number, shoulderY: number, handX: number, handY: number]

export interface HeroPose {
  /** Body lifted off its rest height (px, positive = up). Feet stay on the ground unless lifted themselves. */
  bob: number
  /** Positive squashes (wider, shorter), negative stretches. About -3..3.5; the volume is kept. */
  squash: number
  /** Whole body (everything but the feet) shifted forward (+) or back (-). */
  dx: number
  /** Face and ears slide forward (+) or back (-) over the body: a lean without turning the ball. */
  lean: number
  /** Scarf tails: direction in degrees (0 streams straight back, 90 hangs down, negative lifts them), length, ripple. */
  scarfAngle: number
  scarfLen: number
  scarfWave: number
  scarfPhase: number
  /** Ears tilt back (positive) with speed or forward (negative); `earLift` raises them (air) or flattens them. */
  earTilt: number
  earLift: number
  /** Near and far foot: forward offset (px) and lift off the ground (px). */
  nearFoot: readonly [number, number]
  farFoot: readonly [number, number]
  /** Stubby legs from the belly down to the feet (a run lifts the body so both feet and their stride show). */
  legs: boolean
  /** Foot tilt in degrees, toe down (0 = flat); a foot tilted past 35° turns its sole to the back. */
  nearTilt: number
  farTilt: number
  /** Near arm (in front of the body) and far arm (behind it, only its hand shows when it reaches out). */
  arm: Arm
  farArm: Arm | null
  eyes: Eyes
  mouth: Mouth
  brow: Brow
  /** Cheek puff 0..1.5 (swimming, chewing). */
  puff: number
}

export const heroPose = (p: Partial<HeroPose> = {}): HeroPose => ({
  bob: 0,
  squash: 0,
  dx: 0,
  lean: 0,
  scarfAngle: 30,
  scarfLen: 10,
  scarfWave: 0.8,
  scarfPhase: 0,
  earTilt: 0,
  earLift: 0,
  nearFoot: [0, 0],
  farFoot: [0, 0],
  legs: false,
  nearTilt: 0,
  farTilt: 0,
  arm: [0, 11, 4, 15],
  farArm: null,
  eyes: 'open',
  mouth: 'smile',
  brow: 'none',
  puff: 0,
  ...p
})

const EYE_KEY = { K: C.black, w: C.white, s: EAR[0], i: C.ink }

const NEAR_OPEN = ['.KKKK.', 'KwwKKK', 'KwwKKK', 'KKKKKK', 'KKKKKK', 'KKKKKK', 'KKKsKK', 'KKKKKK', '.KKKK.']
const FAR_OPEN = ['.KKK.', 'KwKKK', 'KwKKK', 'KKKKK', 'KKKKK', 'KKKKK', 'KKsKK', 'KKKKK', '.KKK.']

/** Hand-placed eye shapes: [near eye, far eye]. The far eye is a pixel narrower (three-quarter view). */
const EYE_SHAPES: Record<Eyes, readonly [readonly string[], readonly string[]]> = {
  open: [NEAR_OPEN, FAR_OPEN],
  wide: [
    ['.KKKK.', 'KwwKKK', 'KwwKKK', 'KwwKKK', 'KKKKKK', 'KKKKKK', 'KKKsKK', 'KKKKKK', '.KKKK.'],
    ['.KKK.', 'KwKKK', 'KwKKK', 'KwKKK', 'KKKKK', 'KKKKK', 'KKsKK', 'KKKKK', '.KKK.']
  ],
  half: [
    ['......', '......', '......', '......', 'iiiiii', 'KwKKKK', 'KKKsKK', 'KKKKKK', '.KKKK.'],
    ['.....', '.....', '.....', '.....', 'iiiii', 'KwKKK', 'KKsKK', 'KKKKK', '.KKK.']
  ],
  closed: [
    ['......', '......', '......', '......', 'i....i', '.iiii.', '......', '......', '......'],
    ['.....', '.....', '.....', '.....', 'i...i', '.iii.', '.....', '.....', '.....']
  ],
  happy: [
    ['......', '......', '......', '..ii..', '.i..i.', 'i....i', '......', '......', '......'],
    ['.....', '.....', '.....', '.ii..', 'i..i.', '.....', '.....', '.....', '.....']
  ],
  hurt: [
    ['......', '......', 'KK....', '.KKK..', '...KKK', '.KKK..', 'KK....', '......', '......'],
    ['.....', '.....', '...KK', '.KKK.', 'KKK..', '.KKK.', '...KK', '.....', '.....']
  ],
  squint: [
    ['......', '......', '......', 'KK....', '.KKKKK', 'KK....', '......', '......', '......'],
    ['.....', '.....', '.....', '...KK', 'KKKK.', '...KK', '.....', '.....', '.....']
  ],
  swirl: [
    ['......', '.KKKK.', 'KwwwwK', 'KwKKwK', 'KwKwwK', 'KwwwwK', '.KKKK.', '......', '......'],
    ['.....', '.KKK.', 'KwwwK', 'KKKwK', 'KwKwK', 'KwwwK', '.KKK.', '.....', '.....']
  ]
}

/** Eyes, as stamped: top-left of the near eye at (x, y); the far eye sits 10 px further right and 1 px lower. */
function eyes(l: Raster, x: number, y: number, kind: Eyes) {
  const [near, far] = EYE_SHAPES[kind]
  l.stamp(near, x, y, EYE_KEY)
  l.stamp(far, x + 10, y + 1, EYE_KEY)
}

function brows(l: Raster, x: number, y: number, kind: Brow) {
  const px = (ox: number, oy: number) => l.set(x + ox, y + oy, C.ink)
  const fx = 10
  switch (kind) {
    case 'none':
      return
    case 'angry':
    case 'hard':
      for (const [ox, oy] of [
        [0, -3],
        [1, -3],
        [2, -2],
        [3, -2],
        [4, -1],
        [fx, -1],
        [fx + 1, -2],
        [fx + 2, -2],
        [fx + 3, -3]
      ] as const)
        px(ox, oy)
      if (kind === 'hard')
        for (const [ox, oy] of [
          [1, -2],
          [2, -1],
          [3, -1],
          [fx + 1, -1],
          [fx + 2, -1]
        ] as const)
          px(ox, oy)
      return
    case 'worry':
      for (const [ox, oy] of [
        [0, -1],
        [1, -2],
        [2, -2],
        [3, -3],
        [4, -3],
        [fx, -3],
        [fx + 1, -3],
        [fx + 2, -2],
        [fx + 3, -1]
      ] as const)
        px(ox, oy)
      return
    case 'up':
      for (const [ox, oy] of [
        [1, -3],
        [2, -4],
        [3, -4],
        [4, -3],
        [fx, -3],
        [fx + 1, -4],
        [fx + 2, -4],
        [fx + 3, -3]
      ] as const)
        px(ox, oy)
  }
}

const MOUTH_KEY = { K: C.ink, m: C.mouth, t: C.tongue, w: C.white, c: CREAM[2] }
const MOUTHS: Record<Mouth, readonly string[]> = {
  smile: ['K.K.K', '.K.K.'],
  grin: ['K.....K', '.KKKKK.'],
  flat: ['.KKKK.'],
  o: ['.KK.', 'KmmK', 'KmmK', '.KK.'],
  grit: ['KKKKKKK', 'KwKwKwK', 'KKKKKKK'],
  open: ['KKKKKKK', 'KmwcwmK', 'KmmmmmK', '.KtttK.', '..KKK..'],
  wide: ['KKKKKKKKK', 'KmwwcwwmK', 'KmmmmmmmK', '.KmtttmK.', '..KtttK..', '...KKK...'],
  // the lunge: jaws as wide as the face allows, two big front teeth hanging from the upper lip
  bite: [
    '.KKKKKKKKKKKKK.',
    'KmmmwwwcwwwmmmK',
    'KmmmwwwcwwwmmmK',
    'KmmmwwwcwwwmmmK',
    'KmmmKKKKKKKmmmK',
    'KmmmmmmmmmmmmmK',
    'KmmmmtttttmmmmK',
    '.KmmtttttttmmK.',
    '..KKKtttttKKK..',
    '....KKKKKKK....'
  ],
  // CHOMP: jaws shut, the two big teeth biting over the lower lip
  chomp: [
    'KK...........KK',
    '.KKKKKKKKKKKKK.',
    '..KwwwwcwwwwK..',
    '..KwwwwcwwwwK..',
    '..KwwwwcwwwwK..',
    '..KwwwwcwwwwK..',
    '..KKKKKKKKKKK..'
  ],
  // the anticipation: the mouth already opening, two tooth tips showing
  gape: ['.KKKKKKKKK.', 'KmmwwcwwmmK', 'KmmwwcwwmmK', 'KmmmmmmmmmK', 'KmmmtttmmmK', '.KmtttttmK.', '..KKKKKKK..'],
  // open mouth, the tongue lolling out
  tongue: ['KKKKKKKKK', 'KmmmmmmmK', '.KtttttK.', '.KtttttK.', '.KtttttK.', '..KtttK..', '...KKK...']
}

function mouth(l: Raster, cx: number, y: number, kind: Mouth) {
  const rows = MOUTHS[kind]
  l.stamp(rows, cx - Math.floor(rows[0].length / 2), y, MOUTH_KEY)
}

/** Paints an ellipse only where the layer already has pixels, so patches never leave the silhouette. */
function patch(l: Raster, cx: number, cy: number, rx: number, ry: number, c: number) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x + 0.5 - cx) / rx
      const ny = (y + 0.5 - cy) / ry
      if (nx * nx + ny * ny <= 1.0001) l.paint(x, y, c)
    }
}

/** A round ear: flat rim, darker bowl. `back` draws the far ear a step darker. */
function ear(l: Raster, x: number, y: number, r: number, back: boolean) {
  const rim = back ? FAR : PINK
  l.ellipse(x, y, r, r, rim[1])
  l.ellipse(x - 1, y - 1, r - 1.5, r - 1.5, rim[back ? 1 : 0])
  l.ellipse(x, y, r - 2, r - 2, rim[1])
  l.ellipse(x, y - 0.5, r - 3, r - 3, EAR[back ? 2 : 1])
  l.ellipse(x + 0.5, y + 0.5, r - 4.5, r - 4.5, EAR[back ? 3 : 2])
}

/** A scarf tail: a tapering ribbon along a rippling path, shaded from the top-left. */
function scarfTail(
  l: Raster,
  kx: number,
  ky: number,
  angle: number,
  len: number,
  wave: number,
  phase: number,
  ramp: typeof SCARF
) {
  const a = (angle * Math.PI) / 180
  const dir = [-Math.cos(a), Math.sin(a)]
  const perp = [-dir[1], dir[0]]
  const n = 7
  const pt = (i: number): [number, number] => {
    const s = i / n
    const w = wave * Math.sin(phase - s * 3.2) * s * 1.6
    return [kx + dir[0] * len * s + perp[0] * w, ky + dir[1] * len * s + perp[1] * w]
  }
  for (let i = 0; i < n; i++) bar(l, pt(i), pt(i + 1), i < n - 3 ? 4 : 3, ramp[1])
  shadeEdges(l, ramp, 1, true)
}

/** A short chubby limb ending in a round paw. */
function limb(l: Raster, a: readonly [number, number], b: readonly [number, number], ramp: typeof PINK) {
  if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 3) {
    bar(l, [a[0], a[1]], [b[0], b[1]], 4, ramp[1])
    shadeEdges(l, ramp, 1, true)
  }
  ball(l, b[0], b[1], 2.9, 3, ramp, false)
}

type Pt = readonly [number, number]

/**
 * A paw: flat (an ellipse) or tilted toe-down by `tilt` degrees. A paw tilted past 35° shows its sole (a cream pad)
 * on the side that faces backwards, as a foot kicked up behind a runner does.
 */
function paw(l: Raster, x: number, y: number, tilt: number, ramp: typeof PINK, toeDot: boolean) {
  if (!tilt) {
    l.ellipse(x, y, ramp === PINK ? 5.5 : 5, 3, ramp[1])
    shadeEdges(l, ramp, 1, true)
    if (toeDot) l.set(x + 4, y, ramp[2])
    return
  }
  const a = (tilt * Math.PI) / 180
  const ux = Math.cos(a)
  const uy = Math.sin(a)
  bar(l, [x - ux * 2.6, y - uy * 2.6], [x + ux * 2.6, y + uy * 2.6], 5, ramp[1])
  shadeEdges(l, ramp, 1, true)
  if (tilt > 35) {
    const tall = Math.abs(uy) > Math.abs(ux)
    patch(l, x - uy * 1.4, y + ux * 1.4, tall ? 1.5 : 2.5, tall ? 2.6 : 1.5, ramp === PINK ? CREAM[1] : CREAM[2])
  }
}

/** A stubby leg from the hip to the paw's centre. */
function leg(l: Raster, hip: Pt, foot: Pt, ramp: typeof PINK) {
  bar(l, [hip[0], hip[1]], [foot[0], foot[1]], 4, ramp[1])
  shadeEdges(l, ramp, 1, true)
}

/** One frame of ハム彦. */
export function drawHero(pose: HeroPose): Raster {
  const g = new Painter(64, 64)
  const rx = 19 + pose.squash * 1.05
  const ry = 18 - pose.squash
  // The body keeps its bottom near the ground: squash lowers the centre, bob raises it.
  const cx = 31 + pose.dx
  const cy = 57 - ry - pose.bob
  const kx = rx / 19
  const ky = ry / 18
  /** Body-relative point, scaled with the squash so the face stays on the ball. */
  const X = (u: number) => Math.round(cx + u * kx)
  const Y = (v: number) => Math.round(cy + v * ky)
  const lean = pose.lean

  // ears sit behind the head so the skull covers their roots
  const earX = -pose.earTilt + lean * 0.6
  const earY = -pose.earLift
  g.add(-3, (l) => ear(l, cx + 11 * kx + earX, cy - ry + 4 + earY, 6.5, true))
  g.add(-3, (l) => ear(l, cx - 12 * kx + earX, cy - ry + 5 + earY, 7.5, false))
  // far arm: behind the body, so only a hand that reaches out shows
  if (pose.farArm) {
    const [sx, sy, hx, hy] = pose.farArm
    g.add(-1, (l) => limb(l, [cx + sx, cy + sy], [cx + hx, cy + hy], FAR))
  }
  // far foot
  g.add(-3, (l) => {
    const [fx, lift] = pose.farFoot
    if (pose.legs) leg(l, [cx + 7 * kx, cy + ry - 3], [39 + fx, 58 - lift], FAR)
    paw(l, 39 + fx, 58 - lift, pose.farTilt, FAR, false)
  })
  if (pose.legs)
    g.add(-0.7, (l) => leg(l, [cx - 5 * kx, cy + ry - 3], [27 + pose.nearFoot[0], 58 - pose.nearFoot[1]], PINK))
  // scarf tails, tied at the back of the neck
  const kx0 = cx - rx + 3
  const ky0 = cy + 10 * ky
  const front = pose.scarfAngle < -85
  g.add(front ? 0.3 : -2.5, (l) =>
    scarfTail(
      l,
      kx0,
      ky0 + 1,
      pose.scarfAngle + 24,
      pose.scarfLen - 2,
      pose.scarfWave,
      pose.scarfPhase + 1.7,
      SCARF_FAR
    )
  )
  g.add(front ? 0.35 : -2, (l) =>
    scarfTail(l, kx0, ky0, pose.scarfAngle, pose.scarfLen, pose.scarfWave, pose.scarfPhase, SCARF)
  )
  // body with a short blunt muzzle; the cream belly and muzzle are painted onto it
  g.add(0, (l) => {
    ball(l, cx, cy, rx, ry, PINK)
    patch(l, X(6), Y(14.5), 10 * kx, 4 * ky, CREAM[1])
    patch(l, X(8), Y(16.5), 8 * kx, 1.5 * ky, CREAM[2])
    // scarf band following the curve of the body
    for (let x = Math.floor(cx - rx); x <= cx + rx + 1; x++) {
      const t = (x - (cx - rx)) / (rx * 2)
      const y = Math.round(cy + 8 * ky + Math.sin(t * Math.PI) * 3)
      l.paint(x, y, SCARF[0])
      l.paint(x, y + 1, SCARF[1])
      l.paint(x, y + 2, SCARF[1])
      l.paint(x, y + 3, SCARF[2])
    }
    // the cream lower face of a hamster: both cheeks and the chin, with only a soft bulge at the near cheek
    patch(l, X(10.5) + lean, Y(4.5), 9.5 * kx, 6 * ky, CREAM[1])
    patch(l, X(9) + lean, Y(1.5), 6 * kx, 2.5 * ky, CREAM[0])
    patch(l, X(12) + lean, Y(8.5), 7 * kx, 2 * ky, CREAM[2])
    ball(l, X(15.5) + lean, Y(5), 4.6, 4.4, CREAM, false)
  })
  // knot of the scarf on the back of the neck
  g.add(0.2, (l) => ball(l, cx - rx + 3, cy + 11 * ky, 2.7, 2.7, SCARF, false))
  // puffed cheek
  if (pose.puff > 0)
    g.add(0.5, (l) => ball(l, X(5.5) + lean, Y(7.5), 4.2 + pose.puff * 1.6, 3.6 + pose.puff * 1.2, PINK, true))
  // star clasp on the scarf
  g.add(1, (l) => {
    l.stamp(['..h..', '.yyy.', 'yyyyy', '.yYy.', '.Y.Y.'], X(10) - 2, Y(12) - 2, { h: GOLD[0], y: GOLD[1], Y: GOLD[2] })
  })
  // a gaping mouth drops the lower jaw: a cream chin under the open mouth
  if (pose.mouth === 'bite') g.add(0.9, (l) => ball(l, X(13) + lean, Y(11.5), 7.5 * kx, 4.5 * ky, CREAM, false))
  // face
  const ex = X(2.5) + lean
  const ey = Y(-8)
  g.add(
    1,
    (l) => {
      eyes(l, ex, ey, pose.eyes)
      brows(l, ex, ey, pose.brow)
      // a tiny nose between the eyes, the mouth right under it
      l.rect(X(11) + lean, Y(1.5), 3, 2, EAR[1])
      l.set(X(11) + lean, Y(1.5), EAR[0])
      mouth(l, X(12.5) + lean, pose.mouth === 'chomp' ? Y(3.5) : pose.mouth === 'bite' ? Y(4) : Y(4.5), pose.mouth)
      // whiskers
      l.line(X(20) + lean, Y(3), X(23) + lean, Y(2), CREAM[3])
      l.line(X(20) + lean, Y(6), X(23) + lean, Y(7), CREAM[3])
      // cheek blush
      if (!pose.puff) l.ellipse(ex - 0.5, Y(5.5), 3, 1.8, C.blush)
      else l.ellipse(X(5.5) + lean - 1, Y(6.2), 2, 1.3, C.blush)
    },
    false
  )
  // near foot
  g.add(2, (l) => {
    const [fx, lift] = pose.nearFoot
    paw(l, 27 + fx, 58 - lift, pose.nearTilt, PINK, true)
  })
  // near arm
  g.add(3, (l) => {
    const [sx, sy, hx, hy] = pose.arm
    limb(l, [cx + sx, cy + sy], [cx + hx, cy + hy], PINK)
  })
  return g.render()
}

// ------------------------------------------------------------------------------------------------ clip helpers

const TAU = Math.PI * 2
const frames = (n: number, f: (i: number, t: number) => HeroPose) =>
  Array.from({ length: n }, (_, i) => drawHero(f(i, i / n)))

/** Arms thrown out in a V: near arm to the back, far arm to the front. `h` = how high the hands go. */
const armV = (h: number, spread = 0): Arm => [-16, 5, -23 - spread, 5 - h * 1.2]
const farArmV = (h: number, spread = 0): Arm => [14, 3, 22 + spread, 3 - h * 1.2]

/** Run foot track for phase p (0..1): stance sliding back, then a lifted swing forward. */
function stride(p: number): [number, number] {
  p = ((p % 1) + 1) % 1
  if (p < 0.5) return [7 - 14 * (p / 0.5), 0]
  const s = (p - 0.5) / 0.5
  return [-7 + 14 * s, 5 * Math.sin(Math.PI * s)]
}

// ------------------------------------------------------------------------------------------------ clips

const idle = frames(4, (i) => {
  const b = [0, 0.55, 1, 0.55][i]
  return heroPose({
    squash: 0.5 - b * 1.4,
    earLift: [0, 0, 0.6, 1][i],
    scarfAngle: 34 + [0, 4, 0, -4][i],
    scarfPhase: i * 1.4,
    arm: [0, 11, 4, 15 - [0, 0.5, 1, 0.5][i] * 0.6]
  })
})

const blink = [heroPose({ eyes: 'half', squash: 0.5 }), heroPose({ eyes: 'closed', squash: 0.5 })].map(drawHero)

/** Fidget: a paw rubs the cheek, eyes closed with pleasure. */
const wait = [
  heroPose({ squash: 0.3, lean: -1, arm: [-5, 10, -2, 8], earLift: 0.5 }),
  heroPose({ squash: 0.2, lean: -1, arm: [-5, 10, -1, 5.5], eyes: 'happy', mouth: 'grin', earTilt: 1 }),
  heroPose({ squash: 0, lean: -1, arm: [-5, 10, 3, 6.5], eyes: 'happy', mouth: 'grin', earTilt: 1.5 }),
  heroPose({ squash: 0.2, lean: -1, arm: [-5, 10, -1.5, 5.5], eyes: 'happy', mouth: 'grin', earTilt: 1 }),
  heroPose({ squash: 0.6, arm: [-4, 10, 0, 11], eyes: 'half' }),
  heroPose({ squash: -0.6, earLift: 1, scarfAngle: 38, scarfPhase: 1 })
].map(drawHero)

/**
 * Run cycle, 8 frames: 0 contact (near foot planted ahead, far foot kicked up behind), 1 down, 2 passing (feet
 * cross, body highest), 3 push-off; 4–7 the same with the feet swapped. Feet are [x relative to the body, lift, tilt].
 */
const RUN_TRACK: readonly (readonly [number, number, number])[] = [
  [11, 0, 0], // contact: foot flat, reaching well ahead
  [6, 0, 0], // the body rides over the planted foot
  [1, 0, 0], // passing: the foot is under the belly
  [-5, 0.5, 28], // push-off: heel rises, toe still pushing
  [-14, 6, 75], // kicked up behind, sole showing
  [-11, 8, 62], // trailing knee swings through
  [-1, 6.5, 24], // swing leg crossing the stance foot
  [7, 3, -6] // reaching forward for the next contact
]
const RUN_BOB = [4.5, 5, 7.5, 6.5]
const RUN_SQUASH = [0.5, 0.2, -1, -0.4]
/** Arm swing -1 (back) … 1 (front); the near arm moves against the near leg. */
const RUN_SWING = [-1, -0.7, -0.15, 0.45, 1, 0.85, 0.1, -0.55]
const run = frames(8, (i, t) => {
  const near = RUN_TRACK[i]
  const far = RUN_TRACK[(i + 4) % 8]
  const k = i % 4
  const sn = RUN_SWING[i]
  const sf = RUN_SWING[(i + 4) % 8]
  return heroPose({
    bob: RUN_BOB[k],
    squash: RUN_SQUASH[k],
    dx: 3,
    lean: 3,
    earTilt: 5,
    earLift: [-0.5, 0, -1, -0.5][k],
    legs: true,
    nearFoot: [near[0] + 6, near[1]],
    nearTilt: near[2],
    farFoot: [far[0] - 6, far[1]],
    farTilt: far[2],
    scarfAngle: -6 + Math.sin(t * TAU + 0.8) * 8,
    scarfLen: 14,
    scarfWave: 3,
    scarfPhase: t * TAU,
    arm: [-3, 9, -3 + sn * 10, 11 - Math.max(0, sn) * 5 - Math.max(0, -sn) * 1],
    farArm: [12, 9, 14 + sf * 8, 11 - Math.max(0, sf) * 6],
    mouth: 'open',
    eyes: 'open'
  })
})

const skid = [
  heroPose({
    dx: -2,
    lean: -3,
    squash: 0.8,
    earTilt: -2,
    earLift: 1,
    nearFoot: [8, 0],
    farFoot: [4, 0],
    scarfAngle: -100,
    scarfLen: 12,
    scarfWave: 1.5,
    arm: [-3, 9, 9, 8],
    farArm: [12, 8, 21, 3],
    eyes: 'wide',
    brow: 'up',
    mouth: 'o'
  }),
  heroPose({
    dx: -3,
    lean: -3,
    squash: 1.6,
    bob: 0,
    earTilt: -3,
    earLift: 0,
    nearFoot: [10, 0],
    farFoot: [6, 1],
    scarfAngle: -150,
    scarfLen: 11,
    scarfWave: 2,
    scarfPhase: 1.5,
    arm: [-10, 8, -16, 1],
    farArm: [12, 8, 22, 5],
    eyes: 'wide',
    brow: 'worry',
    mouth: 'o'
  })
].map(drawHero)

const jump = [
  heroPose({
    bob: 1,
    squash: -3.2,
    lean: 1,
    earTilt: 1,
    earLift: -1,
    nearFoot: [-4, 0],
    farFoot: [-1, 1],
    scarfAngle: 75,
    scarfLen: 11,
    scarfWave: 1,
    arm: armV(10),
    farArm: farArmV(10),
    eyes: 'open',
    brow: 'up',
    mouth: 'open'
  }),
  heroPose({
    bob: 4,
    squash: -1.6,
    lean: 1,
    earTilt: 0,
    earLift: -0.5,
    nearFoot: [-5, 4],
    farFoot: [0, 6],
    scarfAngle: 58,
    scarfLen: 12,
    scarfWave: 2,
    scarfPhase: 2,
    arm: armV(8, 1),
    farArm: farArmV(7, 1),
    eyes: 'open',
    mouth: 'open'
  })
].map(drawHero)

const fall = frames(2, (i) =>
  heroPose({
    bob: 6,
    squash: i ? -1.2 : -0.5,
    lean: 0,
    earLift: i ? 1.5 : 3,
    earTilt: i ? 0 : 1,
    nearFoot: i ? [-2, 3] : [-1, 4],
    farFoot: i ? [3, 4] : [2, 3],
    scarfAngle: i ? -34 : -52,
    scarfLen: 13,
    scarfWave: 2.5,
    scarfPhase: i * 2.6,
    arm: armV(i ? 9 : 11, 1),
    farArm: farArmV(i ? 9 : 11, 1),
    eyes: 'wide',
    brow: 'worry',
    mouth: 'o'
  })
).map((f) => f)

const land = [
  heroPose({
    squash: 3.6,
    lean: 1,
    earLift: -1,
    nearFoot: [-6, 0],
    farFoot: [6, 0],
    scarfAngle: 80,
    scarfLen: 10,
    arm: [-11, 9, -19, 13],
    farArm: [13, 9, 22, 13],
    eyes: 'squint',
    mouth: 'flat'
  }),
  heroPose({
    bob: 1,
    squash: -1.6,
    earLift: 1.5,
    nearFoot: [-2, 0.5],
    farFoot: [2, 0.5],
    scarfAngle: 8,
    scarfLen: 12,
    scarfPhase: 1,
    arm: [-6, 8, -9, 10],
    eyes: 'open',
    mouth: 'smile'
  }),
  heroPose({ squash: 0.9, earLift: 0.4, scarfAngle: 40, scarfPhase: 2, arm: [0, 11, 4, 15.5] })
].map(drawHero)

const bite = [
  // 0 anticipation: the whole body pulled back and up, mouth already opening, eyes fierce
  heroPose({
    dx: -6,
    bob: 3,
    lean: -3,
    squash: -2,
    earTilt: -2,
    earLift: 1.5,
    nearFoot: [-2, 0],
    farFoot: [-3, 0],
    scarfAngle: 64,
    scarfLen: 9,
    arm: [-4, 9, -12, 7],
    farArm: [12, 9, 15, 12],
    eyes: 'open',
    brow: 'hard',
    mouth: 'gape'
  }),
  // 1 lunge: thrown forward and stretched, mouth wide open, the feet left behind
  heroPose({
    dx: 2,
    bob: 1,
    lean: 1,
    squash: 2.8,
    earTilt: 6,
    earLift: -0.5,
    nearFoot: [-9, 3],
    farFoot: [-4, 1.5],
    nearTilt: 30,
    scarfAngle: -4,
    scarfLen: 10,
    scarfWave: 2.4,
    arm: [-3, 9, -13, 5],
    farArm: [13, 9, 22, 6],
    eyes: 'wide',
    brow: 'angry',
    mouth: 'bite'
  }),
  // 2 CHOMP: furthest reach, squashed by the impact, jaws snapped shut on the teeth, ears flung forward
  heroPose({
    dx: 5,
    lean: 1,
    squash: -1.2,
    earTilt: -5,
    earLift: 2,
    nearFoot: [-6, 0.5],
    farFoot: [0, 0],
    scarfAngle: -28,
    scarfLen: 12,
    scarfWave: 2,
    scarfPhase: 1,
    arm: [-3, 9, 5, 8],
    farArm: [12, 9, 23, 10],
    eyes: 'squint',
    brow: 'hard',
    mouth: 'chomp'
  }),
  // 3 follow-through: recoiling, chewing, the scarf and ears catch up
  heroPose({
    dx: 2,
    lean: -1,
    squash: 0.9,
    earTilt: 3,
    earLift: 2,
    nearFoot: [-3, 0],
    farFoot: [3, 0],
    scarfAngle: -22,
    scarfLen: 10,
    scarfWave: 2.6,
    scarfPhase: 2.4,
    arm: [-3, 11, 0, 16],
    eyes: 'happy',
    mouth: 'grin',
    puff: 0.6
  }),
  // 4 settling back to the idle pose
  heroPose({
    dx: 2,
    squash: 0.3,
    earTilt: 0,
    earLift: 0.8,
    scarfAngle: 38,
    scarfPhase: 3,
    arm: [0, 11, 4, 15],
    eyes: 'open',
    mouth: 'smile'
  })
].map(drawHero)

const hurt = [
  heroPose({
    bob: 2,
    dx: -3,
    lean: -3,
    squash: -1.2,
    earTilt: -2,
    earLift: 2,
    nearFoot: [-6, 2],
    farFoot: [7, 3],
    scarfAngle: -110,
    scarfLen: 12,
    scarfWave: 2,
    arm: armV(5),
    farArm: farArmV(6),
    eyes: 'hurt',
    mouth: 'open'
  }),
  heroPose({
    bob: 1,
    dx: -4,
    lean: -3,
    squash: 1,
    earTilt: -1,
    earLift: 0.5,
    nearFoot: [5, 0.5],
    farFoot: [8, 1.5],
    scarfAngle: -70,
    scarfLen: 12,
    scarfWave: 1.5,
    scarfPhase: 2,
    arm: [-12, 8, -19, 2],
    farArm: [13, 8, 22, 4],
    eyes: 'hurt',
    mouth: 'o'
  })
].map(drawHero)

// ------------------------------------------------------------------------------------------------ tumble

/** A pixel grid turned clockwise by `q` quarter turns (negative = counter-clockwise); lossless, so never ragged. */
function rotGrid(rows: readonly string[], q: number): string[] {
  let g = [...rows]
  for (let n = ((q % 4) + 4) % 4; n > 0; n--) {
    const h = g.length
    const w = g[0].length
    g = Array.from({ length: w }, (_, r) => Array.from({ length: h }, (_, c) => g[h - 1 - c][r]).join(''))
  }
  return g
}

/**
 * One tumble frame. The ball is turned by whole quarter turns (`q`, counter-clockwise when negative), but nothing is
 * rotated as a picture: every feature has an anchor in the body's own frame (u right, v down, as in `drawHero`),
 * the anchor is turned around the body centre, and the feature is painted at the new spot with the normal tools —
 * the ball is shaded again from the top-left, patches follow the turned ball, eyes, mouth and clasp are
 * quarter-turned stamps. Limbs and the scarf are placed in screen space so they can flail freely.
 */
interface Tumble {
  cx: number
  cy: number
  q: number
  eyes: Eyes
  mouth: Mouth
  /** How far the near and far ear are thrown out from the head (px). */
  ears: readonly [number, number]
  /** Scarf: screen direction (0 streams left, 90 down, negative up), length, ripple, phase. */
  scarf: readonly [number, number, number, number]
  /** Hands and feet as screen offsets from the body centre; feet also get a tilt in degrees. */
  nearArm: Pt
  farArm: Pt | null
  nearFoot: readonly [number, number, number]
  farFoot: readonly [number, number, number]
}

function drawTumble(t: Tumble): Raster {
  const g = new Painter(64, 64)
  const { cx, cy } = t
  const c = Math.round(Math.cos((t.q * Math.PI) / 2))
  const s = Math.round(Math.sin((t.q * Math.PI) / 2))
  const swap = s !== 0
  /** Body-frame point to screen. */
  const P = (u: number, v: number): Pt => [cx + c * u - s * v, cy + s * u + c * v]
  /** Screen pixel centre to body frame. */
  const back = (x: number, y: number): Pt => {
    const dx = x + 0.5 - cx
    const dy = y + 0.5 - cy
    return [c * dx + s * dy, -s * dx + c * dy]
  }
  const inE = (u: number, v: number, eu: number, ev: number, ru: number, rv: number) =>
    ((u - eu) / ru) ** 2 + ((v - ev) / rv) ** 2 <= 1.0001
  /** Stamps a body-frame grid (centre at (u0, v0)) turned with the body. */
  const place = (l: Raster, rows: readonly string[], u0: number, v0: number, key: Record<string, number>) => {
    const grid = rotGrid(rows, t.q)
    const [x, y] = P(u0, v0)
    l.stamp(grid, Math.round(x - grid[0].length / 2), Math.round(y - grid.length / 2), key)
  }
  const out = (u: number, v: number, push: number): Pt => {
    const r = Math.hypot(u, v)
    return P(u * (1 + push / r), v * (1 + push / r))
  }

  const earFar = out(11, -14, t.ears[1])
  const earNear = out(-12, -13, t.ears[0])
  g.add(-3, (l) => ear(l, earFar[0], earFar[1], 6.5, true))
  g.add(-3, (l) => ear(l, earNear[0], earNear[1], 7.5, false))

  /** The end of a limb of at most `max` px from `from`, pointing at the screen offset `to` (from the body centre). */
  const reach = (from: Pt, to: readonly number[], max: number): Pt => {
    const dx = cx + to[0] - from[0]
    const dy = cy + to[1] - from[1]
    const k = Math.min(1, max / Math.hypot(dx, dy))
    return [from[0] + dx * k, from[1] + dy * k]
  }
  const shoulderN = P(2, 10)
  const shoulderF = P(12, 8)
  if (t.farArm) {
    const farArm = t.farArm
    g.add(-1, (l) => limb(l, shoulderF, reach(shoulderF, farArm, 11), FAR))
  }
  const hipN = P(-6, 16)
  const hipF = P(7, 16)
  g.add(-3, (l) => {
    const [fx, fy] = reach(hipF, t.farFoot, 8)
    leg(l, hipF, [fx, fy], FAR)
    paw(l, fx, fy, t.farFoot[2], FAR, false)
  })
  const footN = reach(hipN, t.nearFoot, 8)
  g.add(-0.7, (l) => leg(l, hipN, footN, PINK))

  const knot = P(-16, 10)
  const [angle, len, wave, phase] = t.scarf
  g.add(-2.5, (l) => scarfTail(l, knot[0], knot[1] + 1, angle + 24, len - 2, wave, phase + 1.7, SCARF_FAR))
  g.add(-2, (l) => scarfTail(l, knot[0], knot[1], angle, len, wave, phase, SCARF))

  // the ball, shaded again from the top-left, with the cream lower face, belly and scarf band turned with it
  g.add(0, (l) => {
    const rxs = swap ? 18 : 19
    const rys = swap ? 19 : 18
    for (let y = Math.floor(cy - rys); y <= Math.ceil(cy + rys); y++)
      for (let x = Math.floor(cx - rxs); x <= Math.ceil(cx + rxs); x++) {
        const nx = (x + 0.5 - cx) / rxs
        const ny = (y + 0.5 - cy) / rys
        const q2 = nx * nx + ny * ny
        if (q2 > 1.0001) continue
        const idx = shadeIndex(nx, ny, Math.sqrt(Math.max(0, 1 - q2)))
        const [u, v] = back(x, y)
        let col: number = PINK[idx]
        if (inE(u, v, 6, 14.5, 10, 4) || inE(u, v, 10.5, 4.5, 9.5, 6)) col = CREAM[idx]
        const row = Math.floor(v - (8 + Math.sin(((u + 19) / 38) * Math.PI) * 3))
        if (row >= 0 && row < 4) col = SCARF[Math.max(0, Math.min(3, idx + [-1, 0, 0, 1][row]))]
        l.set(x, y, col)
      }
    const [bx, by] = P(15.5, 5)
    ball(l, bx, by, swap ? 4.4 : 4.6, swap ? 4.6 : 4.4, CREAM, false)
  })
  const knotC = P(-16, 11)
  g.add(0.2, (l) => ball(l, knotC[0], knotC[1], 2.7, 2.7, SCARF, false))
  g.add(1, (l) =>
    place(l, ['..h..', '.yyy.', 'yyyyy', '.yYy.', '.Y.Y.'], 10.5, 12.5, { h: GOLD[0], y: GOLD[1], Y: GOLD[2] })
  )
  if (t.mouth === 'bite') g.add(0.9, (l) => ball(l, ...P(13, 11.5), 7.5, 4.5, CREAM, false))

  g.add(
    1,
    (l) => {
      const [near, far] = EYE_SHAPES[t.eyes]
      place(l, near, 5.5, -3.5, EYE_KEY)
      place(l, far, 15, -2.5, EYE_KEY)
      place(l, ['hee', 'eee'], 12.5, 2.5, { h: EAR[0], e: EAR[1] })
      const rows = MOUTHS[t.mouth]
      place(l, rows, 12.5 - Math.floor(rows[0].length / 2) + rows[0].length / 2, 4.5 + rows.length / 2, MOUTH_KEY)
      const [w1, w2] = [P(20, 3), P(23, 2)]
      l.line(w1[0], w1[1], w2[0], w2[1], CREAM[3])
      const [w3, w4] = [P(20, 6), P(23, 7)]
      l.line(w3[0], w3[1], w4[0], w4[1], CREAM[3])
      const [kx, ky] = P(2, 5.5)
      l.ellipse(kx, ky, swap ? 1.8 : 3, swap ? 3 : 1.8, C.blush)
    },
    false
  )
  g.add(2, (l) => paw(l, footN[0], footN[1], t.nearFoot[2], PINK, true))
  g.add(3, (l) => limb(l, shoulderN, reach(shoulderN, t.nearArm, 11), PINK))
  return g.render()
}

const die = [
  // 0 the hit: knocked up and back, arms flung out
  drawHero(
    heroPose({
      bob: 3,
      dx: -2,
      lean: -3,
      squash: -1.5,
      earTilt: -2,
      earLift: 2.5,
      nearFoot: [-6, 3],
      farFoot: [6, 3],
      scarfAngle: -120,
      scarfLen: 10,
      arm: armV(7, 1),
      farArm: farArmV(8),
      eyes: 'hurt',
      mouth: 'open'
    })
  ),
  // 1–3 head over heels: a ball seen at 90°, 180° and 270°, limbs flailing
  drawTumble({
    cx: 32,
    cy: 28,
    q: -1,
    eyes: 'hurt',
    mouth: 'open',
    ears: [2, 2],
    scarf: [110, 10, 1.5, 0],
    nearArm: [24, -12],
    farArm: [-18, -22],
    nearFoot: [23, 13, 25],
    farFoot: [21, -14, -35]
  }),
  drawTumble({
    cx: 30,
    cy: 31,
    q: -2,
    eyes: 'hurt',
    mouth: 'o',
    ears: [1, 3],
    scarf: [-60, 11, 2, 1.5],
    nearArm: [24, -14],
    farArm: [-22, -14],
    nearFoot: [14, -26, 70],
    farFoot: [-8, -28, 40]
  }),
  drawTumble({
    cx: 31,
    cy: 34,
    q: -3,
    eyes: 'swirl',
    mouth: 'o',
    ears: [3, 1],
    scarf: [20, 11, 2, 3],
    nearArm: [-24, -14],
    farArm: [24, 8],
    nearFoot: [-26, -12, -30],
    farFoot: [-26, 14, 20]
  }),
  // 4 flat on his back, limbs in the air, eyes swirling
  drawTumble({
    cx: 31,
    cy: 39,
    q: -1,
    eyes: 'swirl',
    mouth: 'o',
    ears: [0, 0],
    scarf: [165, 9, 1, 0.5],
    nearArm: [20, -20],
    farArm: [-20, -16],
    nearFoot: [22, -10, 40],
    farFoot: [24, -22, 15]
  }),
  // 5 limp, tongue out
  drawTumble({
    cx: 31,
    cy: 39,
    q: -1,
    eyes: 'swirl',
    mouth: 'tongue',
    ears: [-1, -1],
    scarf: [172, 8, 0.8, 1],
    nearArm: [18, 8],
    farArm: [-22, 6],
    nearFoot: [24, -6, 70],
    farFoot: [23, -17, 55]
  })
]

const cheer = [
  // crouch
  heroPose({
    squash: 2.6,
    earLift: -0.5,
    nearFoot: [-4, 0],
    farFoot: [4, 0],
    scarfAngle: 45,
    arm: [-6, 10, -9, 15],
    farArm: [13, 10, 18, 15],
    eyes: 'happy',
    mouth: 'grin'
  }),
  // spring up
  heroPose({
    bob: 3,
    squash: -3,
    earLift: -1,
    nearFoot: [-4, 2],
    farFoot: [0, 3],
    scarfAngle: 70,
    scarfWave: 1.5,
    arm: armV(10),
    farArm: farArmV(10),
    eyes: 'happy',
    mouth: 'wide'
  }),
  // apex
  heroPose({
    bob: 7,
    squash: -1.2,
    earLift: 1.5,
    nearFoot: [-3, 5],
    farFoot: [3, 6],
    scarfAngle: -25,
    scarfLen: 13,
    scarfWave: 2.2,
    scarfPhase: 1.5,
    arm: armV(12, 2),
    farArm: farArmV(12, 2),
    eyes: 'happy',
    mouth: 'wide'
  }),
  // coming down
  heroPose({
    bob: 4,
    squash: -1.8,
    earLift: 2.5,
    nearFoot: [-1, 3],
    farFoot: [4, 2],
    scarfAngle: -48,
    scarfLen: 13,
    scarfWave: 2.5,
    scarfPhase: 3,
    arm: armV(9, 1),
    farArm: farArmV(9, 1),
    eyes: 'happy',
    mouth: 'wide'
  }),
  // landing squash
  heroPose({
    squash: 2.2,
    earLift: 0,
    nearFoot: [-5, 0],
    farFoot: [5, 0],
    scarfAngle: 60,
    arm: armV(6, 1),
    farArm: farArmV(6, 1),
    eyes: 'happy',
    mouth: 'wide'
  }),
  // rebound
  heroPose({
    bob: 1,
    squash: -1,
    earLift: 1.2,
    nearFoot: [-2, 1],
    farFoot: [2, 1],
    scarfAngle: 5,
    scarfWave: 1.8,
    scarfPhase: 2,
    arm: armV(8),
    farArm: farArmV(8),
    eyes: 'happy',
    mouth: 'wide'
  })
].map(drawHero)

const swim = frames(4, (i, t) => {
  const a = t * TAU
  return heroPose({
    bob: 2 + Math.sin(a) * 0.9,
    squash: Math.cos(a) * 0.6,
    dx: 1,
    lean: 3,
    earTilt: 2,
    earLift: [0, 0.8, 0, -0.8][i],
    nearFoot: [-8 + Math.cos(a) * 2.5, 2.5 + Math.sin(a) * 2.5 + 2],
    farFoot: [-4 - Math.cos(a) * 2.5, 2.5 - Math.sin(a) * 2.5 + 2],
    scarfAngle: 8 + Math.sin(a + 1) * 6,
    scarfLen: 11,
    scarfWave: 2,
    scarfPhase: a,
    arm: [-2, 10, 3 + Math.cos(a) * 4, 14 + Math.sin(a) * 2.5],
    farArm: [12, 9, 17 - Math.cos(a) * 4, 13 - Math.sin(a) * 2.5],
    eyes: 'open',
    brow: 'none',
    mouth: 'flat',
    puff: 1.2
  })
})

export const sheets: SheetModule = {
  hero: () => ({
    idle: anim(idle, 6, true),
    blink: anim(blink, 14, false),
    wait: anim(wait, 6, false),
    run: anim(run, 14, true),
    skid: anim(skid, 12, false),
    jump: anim(jump, 12, false),
    fall: anim(fall, 10, true),
    land: anim(land, 18, false),
    bite: anim(bite, 24, false),
    hurt: anim(hurt, 10, false),
    die: anim(die, 10, false),
    cheer: anim(cheer, 10, true),
    swim: anim(swim, 8, true)
  })
}

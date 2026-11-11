/**
 * ママ・ハム代 (`mom`): the hero's mother, a big stout orange hamster in a white apron with two teal hair curlers,
 * a steel ladle and furious slanted brows. She is the comic boss of stage 1: scary like an angry mum, never
 * monstrous. Built like ハム彦 (ball-shaded body, cream muzzle, stamped eyes, parts assembled with the Painter) but
 * a quarter bigger and rounder. One pose-parametric draw function; every clip is a list of poses
 * (see MOM_SPEC in contract.ts).
 */
import type { SheetModule } from '../module'
import { C, R } from '../palette'
import { Painter, Raster, ball, bar, farRamp, shadeEdges } from '../raster'
import { lazyAnim, memo } from '../sheet'

const ORANGE = R.momOrange
const FAR = farRamp(ORANGE)
const CREAM = R.momCream
const PAPER = R.paper
const STEEL = R.steel
const CURL = R.pipe
const GOLD = R.gold
const WATER = R.water

export type MomEyes = 'angry' | 'squint' | 'tired' | 'dizzy'
export type MomMouth = 'grit' | 'yell' | 'pant' | 'wobble' | 'yelp'
export type MomBrows = 'angry' | 'flat' | 'raised'

type Pt = readonly [number, number]
/** An arm as shoulder, elbow and hand, relative to the body centre. */
export interface Arm {
  s: Pt
  e: Pt
  h: Pt
}

export interface MomPose {
  /** Body lifted off its rest height (px) and squash (positive = wider, shorter). */
  bob: number
  squash: number
  /** Whole-body sideways shake (px). */
  jx: number
  /** Head and chest lean forward (px; negative leans back) and head drop (px). */
  lean: number
  headDy: number
  nearFoot: readonly [number, number]
  farFoot: readonly [number, number]
  nearArm: Arm
  farArm: Arm | null
  /** The ladle: held in the near or far hand, angle in radians clockwise from straight up, length of the handle. */
  ladle: { hand: 'near' | 'far'; a: number; len: number } | null
  eyes: MomEyes
  brows: MomBrows
  mouth: MomMouth
  /** Hair curlers: 0 neat; otherwise the right one is knocked askew (radians) and the left tilts the other way. */
  curlerTilt: number
  /** Apron flutter -1..1 and ear sway (px). */
  flap: number
  earSway: number
  /** Sweat drops [x, y] relative to the body centre. */
  sweat: readonly Pt[]
  /** Orbiting stars: phase in radians, or null. */
  stars: number | null
  /** Cheek flush 0..1 (bigger blush). */
  flush: number
}

const hips = (): Arm => ({ s: [-9, -2], e: [-27, 5], h: [-13, 12] })

export const momPose = (p: Partial<MomPose> = {}): MomPose => ({
  bob: 0,
  squash: 0,
  jx: 0,
  lean: 0,
  headDy: 0,
  nearFoot: [0, 0],
  farFoot: [0, 0],
  nearArm: hips(),
  farArm: { s: [12, -2], e: [28, 10], h: [19, 16] },
  ladle: null,
  eyes: 'angry',
  brows: 'angry',
  mouth: 'grit',
  curlerTilt: 0,
  flap: 0,
  earSway: 0,
  sweat: [],
  stars: null,
  flush: 0,
  ...p
})

const EYE_KEY = { K: C.black, w: C.white, i: C.ink }

const EYES: Record<MomEyes, readonly [readonly string[], readonly string[]]> = {
  // tall dark eyes with one white highlight; the far eye is a pixel narrower; the lids slope down to the nose (angry)
  angry: [
    ['.KKK..', 'KwwKK.', 'KwwKKK', 'KKKKKK', 'KKKKKK', 'KKKKKK', 'KKKKKK', '.KKKK.'],
    ['..KKK', '.KKKK', 'KwKKK', 'KKKKK', 'KKKKK', 'KKKKK', 'KKKKK', '.KKK.']
  ],
  squint: [
    ['KK...', '.KKK.', '..KKK', '.KKK.', 'KK...'],
    ['...KK', '.KKK.', 'KKK..', '.KKK.', '...KK']
  ],
  tired: [
    ['iiiii', 'KwKKK', 'KKKKK', '.KKK.', '.....'],
    ['iiii', 'KwKK', 'KKKK', '.KK.', '....']
  ],
  dizzy: [[], []]
}

/** A square-ish spiral ring with a gap that turns with the phase (dizzy eyes). */
function swirl(l: Raster, x: number, y: number, phase: number, size: number) {
  const ring: Pt[] =
    size === 5
      ? [
          [1, 0],
          [2, 0],
          [3, 0],
          [4, 1],
          [4, 2],
          [4, 3],
          [3, 4],
          [2, 4],
          [1, 4],
          [0, 3],
          [0, 2],
          [0, 1]
        ]
      : [
          [1, 0],
          [2, 0],
          [3, 1],
          [3, 2],
          [3, 3],
          [2, 4],
          [1, 4],
          [0, 3],
          [0, 2],
          [0, 1]
        ]
  const gap = Math.floor(phase * ring.length) % ring.length
  ring.forEach(([dx, dy], i) => {
    const d = (i - gap + ring.length) % ring.length
    if (d > 2) l.set(x + dx, y + dy, C.black)
  })
  l.set(x + 2, y + 2, C.black)
  const [gx, gy] = ring[(gap + 1) % ring.length]
  l.set(x + gx, y + gy, C.white)
}

/** Mouths all hang from the same spot right under the nose (x = centre, y = top). */
function drawMouth(l: Raster, x: number, y: number, kind: MomMouth) {
  switch (kind) {
    case 'grit':
      // clenched teeth
      l.stamp(['KKKKKKK', 'KwKwKwK', 'KKKKKKK'], x - 3, y, { K: C.ink, w: C.white })
      break
    case 'yell':
      l.ellipse(x + 0.5, y + 4.5, 7, 5.6, C.ink)
      l.ellipse(x + 0.5, y + 4.5, 5.9, 4.6, C.mouth)
      l.ellipse(x + 1, y + 7.5, 3.8, 1.8, C.tongue)
      l.rect(x - 4, y, 10, 2, C.white)
      l.rect(x + 1, y, 1, 2, C.ink)
      break
    case 'pant':
      l.ellipse(x, y + 3, 4, 3.6, C.ink)
      l.ellipse(x, y + 3, 3, 2.7, C.mouth)
      l.ellipse(x + 1, y + 6, 2.2, 2.6, C.tongue)
      l.rect(x + 1, y + 5, 1, 2, C.mouth)
      break
    case 'wobble':
      for (const [dx, dy] of [
        [-4, 1],
        [-3, 2],
        [-2, 1],
        [-1, 2],
        [0, 1],
        [1, 2],
        [2, 1],
        [3, 2]
      ])
        l.set(x + dx, y + dy, C.ink)
      break
    case 'yelp':
      l.ellipse(x, y + 3.6, 5, 4.8, C.ink)
      l.ellipse(x, y + 3.6, 3.9, 3.8, C.mouth)
      l.ellipse(x + 0.5, y + 5.6, 2.6, 1.6, C.tongue)
      l.rect(x - 3, y, 6, 1, C.white)
      break
  }
}

/** A round ear: orange rim, cream bowl. */
function ear(l: Raster, x: number, y: number, r: number, back: boolean) {
  const rim = back ? FAR : ORANGE
  ball(l, x, y, r, r, rim, false)
  l.ellipse(x + 0.5, y + 0.5, r - 3, r - 3, CREAM[back ? 3 : 2])
  l.ellipse(x, y, r - 3.5, r - 3.5, CREAM[back ? 2 : 1])
  l.ellipse(x + 1, y + 1.5, r - 5, r - 5.5, CREAM[2])
}

/** A teal hair roller, `ang` radians from horizontal, with a mesh of dots along its axis. */
function curler(l: Raster, x: number, y: number, ang: number) {
  const dx = Math.cos(ang) * 5
  const dy = Math.sin(ang) * 5
  bar(l, [x - dx, y - dy], [x + dx, y + dy], 6, CURL[1])
  shadeEdges(l, CURL, 1, true)
  for (let k = -3; k <= 3; k += 2) l.paint(x + (dx * k) / 5, y + (dy * k) / 5 + 0.5, CURL[3])
  // end caps
  l.paint(x - dx, y - dy, CURL[2])
  l.paint(x + dx, y + dy, CURL[0])
}

/** An arm: upper arm and forearm as bars, fist as a ball. */
function arm(l: Raster, ox: number, oy: number, a: Arm, ramp: typeof ORANGE) {
  bar(l, [ox + a.s[0], oy + a.s[1]], [ox + a.e[0], oy + a.e[1]], 6, ramp[1])
  bar(l, [ox + a.e[0], oy + a.e[1]], [ox + a.h[0], oy + a.h[1]], 6, ramp[1])
  shadeEdges(l, ramp, 1, true)
}
function fist(l: Raster, x: number, y: number, ramp: typeof ORANGE) {
  ball(l, x, y, 3.8, 3.7, ramp, false)
  l.set(x - 1, y + 1, ramp[3])
  l.set(x + 1, y + 1, ramp[3])
}

/** The ladle: wooden handle, steel bowl facing the viewer. */
function ladle(l: Raster, hx: number, hy: number, a: number, len: number) {
  const dx = Math.sin(a)
  const dy = -Math.cos(a)
  const bx = hx + dx * len
  const by = hy + dy * len
  bar(l, [hx - dx * 4, hy - dy * 4], [bx, by], 3, CREAM[1])
  shadeEdges(l, CREAM, 1, true)
  ball(l, bx, by, 5.4, 4.8, STEEL)
  l.ellipse(bx - 0.5, by - 0.5, 3.4, 2.9, STEEL[3])
  l.ellipse(bx + 0.7, by + 0.9, 2.4, 1.8, STEEL[2])
  l.set(bx - 4, by - 2, STEEL[0])
  l.set(bx - 3, by - 3, STEEL[0])
}

const STAR = ['..y..', '.yyy.', 'yyyyy', '.yyy.', '.y.y.']

/** The head ball of a pose (centre and radii), for tests that measure the silhouette against it. */
export function momHeadBall(pose: MomPose) {
  const ry = 22 - pose.squash
  return { cx: 46 + pose.jx + pose.lean * 0.4, cy: 88 - ry - pose.bob, rx: 25 + pose.squash * 0.8, ry }
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

/** One frame of ママ・ハム代. */
export function drawMom(pose: MomPose): Raster {
  const g = new Painter(96, 96)
  const rx = 25 + pose.squash * 0.8
  const ry = 22 - pose.squash
  const cx = 46 + pose.jx
  const cy = 88 - ry - pose.bob
  const bx = cx + pose.lean * 0.4
  const top = cy - ry
  const hx = cx + pose.lean // head group
  const hy = pose.headDy
  const hem = Math.round(cy + ry + 1)

  // tail puff
  g.add(-4, (l) => ball(l, bx - rx + 2, cy + 10, 4.5, 4.5, FAR, false))
  // ears (behind the skull)
  g.add(-3, (l) => ear(l, hx + 15 + pose.earSway, top + 4 + hy, 7.5, true))
  g.add(-3, (l) => ear(l, hx - 16 + pose.earSway, top + 5 + hy, 8.5, false))

  // far arm (and far-hand ladle) behind the body
  if (pose.farArm) {
    const a = pose.farArm
    g.add(-2, (l) => {
      arm(l, bx, cy, a, FAR)
      if (pose.ladle?.hand === 'far') ladle(l, bx + a.h[0], cy + a.h[1], pose.ladle.a, pose.ladle.len)
      fist(l, bx + a.h[0], cy + a.h[1], FAR)
    })
  }
  // legs and feet
  const [nfx, nfl] = pose.nearFoot
  const [ffx, ffl] = pose.farFoot
  const legTop = cy + ry - 6
  g.add(-2, (l) => {
    bar(l, [bx + 10, legTop], [cx + 11 + ffx, 87 - ffl], 9, FAR[1])
    l.ellipse(cx + 11 + ffx, 88 - ffl, 8, 3.6, FAR[1])
    l.rect(Math.round(cx + 5 + ffx), 90 - ffl, 12, 1, FAR[2])
  })
  g.add(0, (l) => {
    bar(l, [bx - 8, legTop], [cx - 9 + nfx, 87 - nfl], 9, ORANGE[2])
  })

  // body: the ball is the head and the trunk; the pale lower face, cheeks and a neck crease are painted onto it
  g.add(0, (l) => {
    ball(l, bx, cy, rx, ry, ORANGE)
    // the family face: a broad cream lower face (both cheeks and the chin), only a soft bulge at the near cheek
    const fy = cy + hy
    patch(l, hx + 13, fy + 1.5, 12, 5.8, CREAM[1])
    patch(l, hx + 12, fy - 3.5, 8, 2, CREAM[0])
    patch(l, hx + 15, fy + 6.2, 10, 1.6, CREAM[2])
    ball(l, hx + 20.5, fy + 1.5, 5.4, 5, CREAM, false)
    // neck crease under the chin, so the head reads as a head on a body
    for (let x = Math.round(bx - 13); x <= bx + 21; x++) {
      const t = (x - (bx - 13)) / 34
      l.paint(x, Math.round(cy + 8 + Math.sin(t * Math.PI) * 1.4), ORANGE[3])
    }
  })
  // blush, nose and whiskers sit on the face
  g.add(
    1,
    (l) => {
      const fy = cy + hy
      l.ellipse(hx + 6.5, fy + 1.5, 3.2 + pose.flush, 2 + pose.flush * 0.5, C.blush)
      l.rect(Math.round(hx + 11), Math.round(fy - 2), 3, 2, ORANGE[3])
      l.set(Math.round(hx + 11), Math.round(fy - 2), ORANGE[1])
      l.line(Math.round(hx + 24), Math.round(fy - 1), Math.round(hx + 27), Math.round(fy - 2), CREAM[3])
      l.line(Math.round(hx + 24), Math.round(fy + 3), Math.round(hx + 27), Math.round(fy + 4), CREAM[3])
    },
    false
  )

  // apron: bib, skirt flaring over the legs, pocket with a heart
  g.add(1, (l) => {
    const lift = Math.max(0, pose.flap) * 3
    const sway = pose.flap * 2.5
    l.poly(
      [bx - 6, cy + 10, bx + 14, cy + 10, bx + 25 + sway * 0.3, hem - lift * 0.4, bx - 17 - sway, hem - lift],
      PAPER[1]
    )
    shadeEdges(l, PAPER, 1, true)
    // shadow fold under the bib line and along the hem
    l.rect(Math.round(bx - 7), Math.round(cy + 11), 21, 1, PAPER[2])
    for (let x = Math.round(bx - 15 - sway); x <= bx + 24; x++)
      l.paint(x, hem - 1 - Math.round(lift * (1 - (x - bx + 17) / 42)), PAPER[2])
    // pocket
    const px = Math.round(bx + 1)
    const py = hem - 13
    l.rect(px, py, 12, 1, PAPER[3])
    l.rect(px, py + 1, 12, 1, PAPER[0])
    l.rect(px, py, 1, 9, PAPER[3])
    l.rect(px + 11, py, 1, 9, PAPER[3])
    l.rect(px, py + 8, 12, 1, PAPER[3])
    l.stamp(['r.r', 'rrr', '.r.'], px + 4, py + 3, { r: C.blush })
  })

  // curlers
  g.add(2, (l) => {
    const t = pose.curlerTilt
    curler(l, hx - 5 - t * 2, top + 4 + hy + (t ? 1 : 0), -0.2 - t * 1.4)
    curler(l, hx + 8 + t * 5, top + 6 + hy - t * 6, 0.18 + t)
  })

  // face
  g.add(
    2,
    (l) => {
      const ex = Math.round(hx + 4)
      const ey = Math.round(cy - 10 + hy)
      const fx = ex + 11
      const fy = ey + 1
      if (pose.eyes === 'dizzy') {
        swirl(l, ex - 1, ey - 1, pose.stars ?? 0, 5)
        swirl(l, fx - 1, fy - 1, pose.stars ?? 0, 4)
      } else {
        l.stamp(EYES[pose.eyes][0], ex, ey, EYE_KEY)
        l.stamp(EYES[pose.eyes][1], fx, fy, EYE_KEY)
      }
      const brow = (x0: number, y0: number, x1: number, y1: number) => {
        l.line(x0, y0, x1, y1, C.ink)
        l.line(x0, y0 + 1, x1, y1 + 1, C.ink)
      }
      if (pose.brows === 'angry') {
        brow(ex - 1, ey - 5, ex + 5, ey - 2)
        brow(fx - 1, fy - 2, fx + 5, fy - 5)
      } else if (pose.brows === 'flat') {
        brow(ex - 1, ey - 4, ex + 5, ey - 5)
        brow(fx - 1, fy - 5, fx + 4, fy - 4)
      } else {
        brow(ex, ey - 6, ex + 5, ey - 7)
        brow(fx - 1, fy - 7, fx + 4, fy - 6)
      }
      drawMouth(l, Math.round(hx + 13), Math.round(cy + 1 + hy), pose.mouth)
      for (const [sx, sy] of pose.sweat) {
        l.ellipse(bx + sx, cy + sy, 1.4, 2, WATER[1])
        l.set(bx + sx - 1, cy + sy - 1, C.white)
        l.set(bx + sx, cy + sy - 3, WATER[1])
      }
    },
    false
  )

  // near foot
  g.add(3, (l) => {
    l.ellipse(cx - 9 + nfx, 88 - nfl, 8.5, 3.8, ORANGE[2])
    l.rect(Math.round(cx - 15 + nfx), 86 - nfl, 11, 1, ORANGE[1])
    l.rect(Math.round(cx - 14 + nfx), 90 - nfl, 12, 1, ORANGE[3])
    l.rect(Math.round(cx - 2 + nfx), 87 - nfl, 1, 3, ORANGE[3])
  })
  // near arm, ladle and fist
  g.add(3.5, (l) => {
    const a = pose.nearArm
    if (pose.ladle?.hand === 'near') ladle(l, bx + a.h[0], cy + a.h[1], pose.ladle.a, pose.ladle.len)
  })
  g.add(4, (l) => {
    const a = pose.nearArm
    arm(l, bx, cy, a, ORANGE)
    fist(l, bx + a.h[0], cy + a.h[1], ORANGE)
  })
  // orbiting stars
  if (pose.stars !== null) {
    const ph = pose.stars
    for (let k = 0; k < 3; k++) {
      const ang = ph + (k * Math.PI * 2) / 3
      const sx = Math.round(hx + 3 + Math.cos(ang) * 19)
      const sy = Math.round(top - 3 + hy + Math.sin(ang) * 5)
      g.add(Math.sin(ang) > 0 ? 5 : -4, (l) => {
        l.stamp(STAR, sx - 2, sy - 2, { y: GOLD[1] })
        l.set(sx - 1, sy - 1, GOLD[0])
      })
    }
  }
  return g.render()
}

/** The ladle-up arm used in the run and the yell: bent elbow behind the head, fist above the ear. */
const raisedArm = (dx: number, dy: number): Arm => ({
  s: [-9, -4],
  e: [-25 + dx * 0.4, -13 + dy * 0.4],
  h: [-15 + dx, -30 + dy]
})

// ------------------------------------------------------------------------------------------------ clips

const idle = memo(() =>
  [0, 1, 2, 3].map((i) =>
    drawMom(
      momPose({
        squash: [0, -0.5, -1, -0.5][i],
        bob: [0, 0.3, 0.6, 0.3][i],
        nearFoot: [0, [0, 3, 0, 2][i]],
        ladle: { hand: 'near', a: -0.7 + [0, 0.04, 0, -0.04][i], len: 24 },
        earSway: [0, 0, 1, 0][i],
        flap: [0, 0.2, 0, -0.2][i]
      })
    )
  )
)

const yellSteps = memo(
  () =>
    [
      { lean: -3, headDy: -1, squash: -1.5, mouth: 'grit', a: -0.15, hand: [-12, -22], bob: 1 },
      { lean: 4, headDy: 1, squash: 1.5, mouth: 'yell', a: 0.45, hand: [-9, -24], bob: 0 },
      { lean: 5, headDy: 2, squash: 2, mouth: 'yell', a: -0.05, hand: [-11, -26], bob: 0 },
      { lean: 4, headDy: 1, squash: 1.2, mouth: 'yell', a: 0.55, hand: [-9, -23], bob: 0 }
    ] as const
)
const yell = memo(() =>
  yellSteps().map((s, i) =>
    drawMom(
      momPose({
        lean: s.lean,
        headDy: s.headDy,
        squash: s.squash,
        bob: s.bob,
        mouth: s.mouth,
        nearArm: raisedArm(s.hand[0] + 10, s.hand[1] + 26),
        ladle: { hand: 'near', a: s.a, len: 22 },
        farArm: i === 0 ? { s: [12, -2], e: [28, 10], h: [19, 16] } : { s: [12, -2], e: [29, 8], h: [21, 14] },
        jx: i >= 2 ? [0, 0, 1, -1][i] : 0,
        brows: 'angry',
        eyes: i === 0 ? 'angry' : 'squint',
        flush: i > 0 ? 1 : 0,
        earSway: [0, -1, 1, -1][i]
      })
    )
  )
)

/**
 * Furious run. Contact poses on frames 0 and 4 (long stride, body dropped and squashed), passing poses on 2 and 6
 * (body risen, one foot swinging through high). Head, apron, ears and ladle lag the body by a frame or so.
 */
const STRIDE = 15
const stride = (p: number) => {
  const q = ((p % 1) + 1) % 1
  // stance foot slides back at an even pace, then swings forward in an arc
  if (q < 0.5) return { x: Math.round(STRIDE - 2 * STRIDE * (q / 0.5)), lift: 0 }
  const s = (q - 0.5) / 0.5
  return { x: Math.round(-STRIDE + 2 * STRIDE * s), lift: Math.round(10 * Math.sin(Math.PI * s)) }
}
const move = memo(() =>
  Array.from({ length: 8 }, (_, i) => {
    const t = i / 8
    const n = stride(t)
    const f = stride(t + 0.5)
    const step = (i / 4) * Math.PI * 2 // two steps per cycle
    const rise = (1 - Math.cos(step)) / 2 // 0 on contact, 1 on passing
    const riseLag = (1 - Math.cos(step - 1.2)) / 2
    const bob = Math.round(rise * 3.5)
    const phi = t * Math.PI * 2
    const contact = 1 - rise
    return drawMom(
      momPose({
        bob,
        squash: contact * 1.6 - rise * 0.6,
        lean: 4 + Math.round(contact * 2),
        // the head lags: it sinks when the body rises and floats when the body drops
        headDy: Math.round((rise - riseLag) * 3),
        nearFoot: [n.x, n.lift],
        farFoot: [f.x, f.lift],
        nearArm: raisedArm(2 * Math.cos(phi), -2.5 * rise + 1.5 * Math.sin(phi)),
        farArm: { s: [12, -2], e: [26 - 3 * Math.cos(phi), 8], h: [20, 14 + Math.round(2 * Math.sin(phi))] },
        // the ladle head whips behind the arm
        ladle: { hand: 'near', a: 0.3 + 0.55 * Math.sin(step - 0.9) + 0.3 * Math.sin(phi + 0.5), len: 21 },
        mouth: i % 2 ? 'grit' : 'yell',
        eyes: 'angry',
        flush: 1,
        // the apron streams back behind the motion and peaks a frame after the body
        flap: 0.3 + 0.7 * Math.sin(((i - 3) / 4) * Math.PI * 2 + Math.PI / 2),
        earSway: Math.round(-1.5 + 1.5 * Math.sin(step - 1.2))
      })
    )
  })
)

const stunned = memo(() =>
  [0, 1, 2, 3].map((i) =>
    drawMom(
      momPose({
        jx: [-2, 0, 2, 0][i],
        lean: [-1, 0, 1, 0][i],
        squash: [1, 0, 1, 2][i],
        headDy: [1, 0, 1, 2][i],
        eyes: 'dizzy',
        brows: 'raised',
        mouth: 'wobble',
        curlerTilt: [0.45, 0.55, 0.5, 0.6][i],
        stars: (i * Math.PI) / 2,
        nearArm: { s: [-6, -2], e: [-21, 6], h: [-22, 13] },
        ladle: { hand: 'near', a: -1.75 + [0, 0.08, 0, -0.08][i], len: 12 },
        earSway: [1, 0, -1, 0][i],
        nearFoot: [[-2, 0, 2, 0][i], 0],
        farFoot: [[2, 0, -2, 0][i], 0],
        flap: [0.4, 0, -0.4, 0][i]
      })
    )
  )
)

const tired = memo(() =>
  [0, 1, 2, 3].map((i) =>
    drawMom(
      momPose({
        squash: [2, 3.5, 2.5, 1.5][i],
        lean: 3,
        headDy: [3, 5, 4, 3][i],
        jx: [0, 0, 1, 0][i],
        eyes: 'tired',
        brows: 'flat',
        mouth: 'pant',
        nearArm: { s: [-9, -2], e: [-27, 6 + [0, 1, 0, -1][i]], h: [-20 + [0, 1, 0, 1][i], 14 + [0, -1, 0, 1][i]] },
        farArm: { s: [12, -2], e: [22, 6], h: [27, 8] },
        ladle: { hand: 'far', a: 2.3 + [0, 0.1, 0, -0.1][i], len: 11 },
        sweat: [
          [
            [28, -22],
            [34, -14]
          ],
          [
            [30, -17],
            [35, -9]
          ],
          [
            [33, -11],
            [27, -24]
          ],
          [
            [35, -6],
            [29, -20]
          ]
        ][i] as unknown as Pt[],
        flap: [0, 0.2, 0, -0.2][i],
        earSway: [0, 1, 1, 0][i],
        flush: 1
      })
    )
  )
)

const hurt = memo(() =>
  [0, 1].map((i) =>
    drawMom(
      momPose({
        lean: [-4, -2][i],
        headDy: [-1, 1][i],
        squash: [-2, 2][i],
        jx: [-2, -1][i],
        eyes: 'squint',
        mouth: 'yelp',
        nearArm: raisedArm([3, 0][i], [-3, 0][i]),
        ladle: { hand: 'near', a: [-0.8, 0.5][i], len: 21 },
        earSway: [-2, 1][i],
        flap: [1, -0.5][i],
        flush: 1
      })
    )
  )
)

export const sheets: SheetModule = {
  mom: () => ({
    idle: lazyAnim(idle, 6, true),
    yell: lazyAnim(yell, 10, false),
    move: lazyAnim(move, 14, true),
    stunned: lazyAnim(stunned, 8, true),
    tired: lazyAnim(tired, 5, true),
    hurt: lazyAnim(hurt, 10, false)
  })
}

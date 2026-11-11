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
import { Painter, Raster, ball, bar, farRamp } from '../raster'
import { anim } from '../sheet'

const PINK = R.hamPink
const FAR = farRamp(PINK)
const CREAM = R.hamCream
const EAR = R.hamEar
const SCARF = R.scarf
const GOLD = R.gold

export type Eyes = 'open' | 'half' | 'closed' | 'happy' | 'wide' | 'hurt' | 'angry'
export type Mouth = 'smile' | 'open' | 'o' | 'flat' | 'grit' | 'bite'

export interface HeroPose {
  /** Body lifted off its rest height (px, positive = up). Feet stay on the ground unless lifted themselves. */
  bob: number
  /** Positive squashes (wider, shorter), negative stretches. About -3..3 px. */
  squash: number
  /** Scarf tails: vertical swing of the tips (px, positive = up) and how far they stream back (0..1). */
  scarfSwing: number
  scarfStream: number
  /** Ears tilt back (positive) with speed or forward (negative) on a stop. */
  earTilt: number
  /** Near and far foot: forward offset (px) and lift off the ground (px). */
  nearFoot: readonly [number, number]
  farFoot: readonly [number, number]
  /** Near arm: 0 resting on the belly, 1 reaching forward, 2 raised overhead. */
  arm: number
  eyes: Eyes
  mouth: Mouth
}

export const heroPose = (p: Partial<HeroPose> = {}): HeroPose => ({
  bob: 0,
  squash: 0,
  scarfSwing: 0,
  scarfStream: 0,
  earTilt: 0,
  nearFoot: [0, 0],
  farFoot: [0, 0],
  arm: 0,
  eyes: 'open',
  mouth: 'smile',
  ...p
})

/** Paints an ellipse only where the layer already has pixels, so patches never leave the silhouette. */
function patch(l: Raster, cx: number, cy: number, rx: number, ry: number, c: number) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x + 0.5 - cx) / rx
      const ny = (y + 0.5 - cy) / ry
      if (nx * nx + ny * ny <= 1.0001) l.paint(x, y, c)
    }
}

const EYE_KEY = { K: C.black, w: C.white, s: EAR[0], b: PINK[2], i: C.ink }

/** Hand-placed eye shapes: [near eye, far eye]. The far eye is a pixel narrower (three-quarter view). */
const EYE_SHAPES: Record<Eyes, readonly [readonly string[], readonly string[]]> = {
  open: [
    ['.KKK.', 'KKKKK', 'KwwKK', 'KwwKK', 'KKKKK', 'KKKKK', 'KKKsK', '.KKK.'],
    ['.KK.', 'KKKK', 'KwKK', 'KwKK', 'KKKK', 'KKKK', 'KKsK', '.KK.']
  ],
  wide: [
    ['.KKK.', 'KwwwK', 'KwKwK', 'KwKwK', 'KwKwK', 'KwwwK', 'KwwwK', '.KKK.'],
    ['.KK.', 'KwwK', 'KKwK', 'KKwK', 'KKwK', 'KwwK', 'KwwK', '.KK.']
  ],
  half: [
    ['.....', '.....', '.....', 'iiiii', 'KwKKK', 'KKKKK', 'KKKsK', '.KKK.'],
    ['....', '....', '....', 'iiii', 'KwKK', 'KKKK', 'KKsK', '.KK.']
  ],
  closed: [
    ['.....', '.....', '.....', '.....', 'i...i', 'iiiii', '.....', '.....'],
    ['....', '....', '....', '....', 'i..i', 'iiii', '....', '....']
  ],
  happy: [
    ['.....', '.....', '.....', '.iii.', 'i...i', 'i...i', '.....', '.....'],
    ['....', '....', '....', '.ii.', 'i..i', 'i..i', '....', '....']
  ],
  hurt: [
    ['.....', '.....', 'i....', '.ii..', '...ii', '.ii..', 'i....', '.....'],
    ['....', '....', '...i', '.ii.', 'i...', '.ii.', '...i', '....']
  ],
  angry: [
    ['ii...', '.bii.', '.KKii', 'KKKKK', 'KwKKK', 'KKKKK', 'KKKsK', '.KKK.'],
    ['..ii', '.iib', 'iKKK', 'KwKK', 'KKKK', 'KKKK', 'KKsK', '.KK.']
  ]
}

function eyes(l: Raster, x: number, y: number, kind: Eyes) {
  const [near, far] = EYE_SHAPES[kind]
  l.stamp(near, x, y - 4, EYE_KEY)
  l.stamp(far, x + 10, y - 3, EYE_KEY)
}

function mouth(l: Raster, x: number, y: number, kind: Mouth) {
  switch (kind) {
    case 'smile':
      l.set(x - 2, y - 1, C.ink)
      l.set(x - 1, y, C.ink)
      l.set(x, y, C.ink)
      l.set(x + 1, y - 1, C.ink)
      break
    case 'flat':
      l.rect(x - 2, y, 4, 1, C.ink)
      break
    case 'o':
      l.ellipse(x + 0.5, y + 1, 1.5, 2, C.mouth)
      break
    case 'grit':
      l.rect(x - 3, y - 1, 6, 3, C.ink)
      l.rect(x - 2, y, 4, 1, C.white)
      break
    case 'open':
      l.ellipse(x, y + 1.5, 3, 3, C.mouth)
      l.rect(x - 1, y + 3, 2, 1, C.tongue)
      l.rect(x - 1, y - 1, 3, 2, C.white)
      break
    case 'bite':
      // jaws wide: front teeth above, tongue below
      l.ellipse(x + 1, y + 1.5, 4.5, 4.5, C.mouth)
      l.rect(x - 1, y - 3, 2, 3, C.white)
      l.rect(x + 2, y - 3, 2, 3, C.white)
      l.rect(x, y + 4, 3, 1, C.tongue)
      break
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

/** One frame of ハム彦. */
export function drawHero(pose: HeroPose): Raster {
  const g = new Painter(64, 64)
  const rx = 19 + pose.squash * 0.7
  const ry = 18 - pose.squash
  // The body keeps its bottom near the ground: squash lowers the centre, bob raises it.
  const cx = 30
  const cy = 57 - ry - pose.bob
  const face = cy - 2 // eye line

  // tail
  g.add(-4, (l) => ball(l, cx - rx + 1, cy + 9, 3.4, 3.4, FAR, false))
  // ears sit behind the head so the skull covers their roots
  g.add(-3, (l) => ear(l, cx + 9 - pose.earTilt, cy - ry + 2, 6.5, true))
  g.add(-3, (l) => ear(l, cx - 10 - pose.earTilt, cy - ry + 3, 7.5, false))
  // far foot
  g.add(-3, (l) => {
    const [fx, lift] = pose.farFoot
    l.ellipse(cx + 8 + fx, 58 - lift, 5.5, 3, FAR[1])
    l.rect(Math.round(cx + 4 + fx), 59 - lift, 9, 1, FAR[2])
  })
  // scarf tails, tied at the back of the neck
  g.add(-2, (l) => {
    const kx = cx - rx + 3
    const ky = cy + 7
    const reach = 9 + pose.scarfStream * 5
    bar(l, [kx, ky], [kx - reach, ky - 3 - pose.scarfSwing], 4, SCARF[1])
    bar(l, [kx, ky + 1], [kx - reach + 2, ky + 4 - pose.scarfSwing * 0.6], 4, SCARF[2])
    l.rect(Math.round(kx - reach - 1), Math.round(ky - 5 - pose.scarfSwing), 2, 1, SCARF[0])
  })
  // body with a short blunt muzzle; the cream belly and muzzle are painted onto it
  g.add(0, (l) => {
    ball(l, cx, cy, rx, ry, PINK)
    l.ellipse(cx + 16, cy + 6, 5.5, 4.5, CREAM[1])
    patch(l, cx + 6, cy + 14.5, 10, 4, CREAM[1])
    patch(l, cx + 8, cy + 16.5, 8, 1.5, CREAM[2])
    patch(l, cx + 15, cy + 6, 6.5, 4.5, CREAM[1])
    patch(l, cx + 14, cy + 3.5, 4, 1.5, CREAM[0])
    patch(l, cx + 16, cy + 9.5, 5, 1.5, CREAM[2])
    // scarf band following the curve of the body
    for (let x = Math.floor(cx - rx); x <= cx + rx + 1; x++) {
      const t = (x - (cx - rx)) / (rx * 2)
      const y = Math.round(cy + 8 + Math.sin(t * Math.PI) * 3)
      l.paint(x, y, SCARF[0])
      l.paint(x, y + 1, SCARF[1])
      l.paint(x, y + 2, SCARF[1])
      l.paint(x, y + 3, SCARF[2])
    }
  })
  // star clasp on the scarf
  g.add(1, (l) => {
    const sx = cx + 10
    const sy = Math.round(cy + 12)
    l.stamp(['..y..', 'yyyyy', '.yYy.', '.Y.Y.'], sx - 2, sy - 1, { y: GOLD[1], Y: GOLD[2] })
    l.set(sx, sy - 1, GOLD[0])
  })
  // face
  g.add(
    1,
    (l) => {
      eyes(l, cx + 2, face, pose.eyes)
      // nose on the tip of the muzzle
      l.rect(cx + 18, face + 5, 3, 2, EAR[1])
      l.set(cx + 18, face + 5, EAR[0])
      mouth(l, cx + 15, face + 10, pose.mouth)
      // cheek
      l.ellipse(cx - 3, face + 7.5, 3, 2, C.blush)
    },
    false
  )
  // near foot
  g.add(2, (l) => {
    const [fx, lift] = pose.nearFoot
    l.ellipse(cx - 4 + fx, 58 - lift, 6, 3.2, PINK[2])
    l.rect(Math.round(cx - 8 + fx), 57 - lift, 6, 1, PINK[1])
  })
  // near arm
  g.add(3, (l) => {
    const a = pose.arm
    const ax = cx + 1 + Math.min(1, a) * 9
    const ay = cy + 15 - Math.max(0, a - 1) * 16 - Math.min(1, a) * 3
    ball(l, ax, ay, 3.4, 3.8, PINK, false)
  })
  return g.render()
}

const idle = [0, 0.5, 1, 0.5].map((breath, i) =>
  drawHero(heroPose({ bob: breath * 0.5, squash: -breath * 0.6, scarfSwing: [0, 0.6, 0, -0.6][i] }))
)

export const sheets: SheetModule = {
  hero: () => ({
    idle: anim(idle, 6, true),
    blink: anim([drawHero(heroPose({ eyes: 'half' })), drawHero(heroPose({ eyes: 'closed' }))], 14, false)
  })
}

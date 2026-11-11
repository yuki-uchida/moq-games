/**
 * ハム姫 (`princess`): the star princess, a small white hamster in three-quarter view facing right, with pink ears,
 * a gold star tiara, a pink ribbon bow at the neck and big sparkling eyes with lashes. She wears the family face
 * of ハム彦: no snout, a broad pale lower face painted onto the head ball with a soft bulge at the near cheek, a
 * tiny nose with an "ω" mouth under it, two short whiskers, round ears set wide apart. One pose-parametric draw
 * function; every clip is a list of poses (see PRINCESS_SPEC in contract.ts).
 */
import type { SheetModule } from '../module'
import { C, R, ramp } from '../palette'
import { Painter, Raster, ball, bar, farRamp, shadeEdges } from '../raster'
import { lazyAnim, memo } from '../sheet'

const WHITE = R.princessWhite
const FAR = farRamp(WHITE)
const PINK = R.princessPink
const FAR_PINK = farRamp(PINK)
const GOLD = R.gold
const WATER = R.water
/** Her "cream": a pale pink-white a shade off the body white, so the lower face still reads. */
const FACE = ramp('#fff6fb', '#fbe1ed', '#ecd3e6', '#b99ac4', '#2a1230')

export type PrincessEyes = 'open' | 'sad' | 'happy' | 'closed' | 'half'
export type PrincessMouth = 'smile' | 'open' | 'frown' | 'small' | 'o'

export interface PrincessPose {
  /** Body lifted off its rest height (px, positive = up). */
  bob: number
  /** Positive squashes (wider, shorter), negative stretches. */
  squash: number
  /** Whole-body shake sideways (px), for trembling. */
  jx: number
  /** Ear droop 0 (upright) .. 1 (hanging down), plus a sideways sway of the tips (px). */
  earNear: number
  earFar: number
  earSway: number
  /** Head tilt: positive leans to the right (ears swing clockwise around the head, face slides forward). */
  tilt: number
  /** Ribbon tails: sideways swing of the tips (px) and how long they hang (px). */
  ribbon: number
  ribbonDrop: number
  /** Hand positions relative to the body centre; the arm is a short chubby bar from the shoulder to the paw. */
  nearHand: readonly [number, number]
  farHand: readonly [number, number] | null
  /** Shoulders: when set, the arm is drawn as a bar from there to the hand; otherwise only the paw shows. */
  nearShoulder: readonly [number, number] | null
  farShoulder: readonly [number, number] | null
  /** A second paw in front (clasped hands). */
  paw2: readonly [number, number] | null
  /** Near and far foot: forward offset and lift (px). */
  nearFoot: readonly [number, number]
  farFoot: readonly [number, number]
  eyes: PrincessEyes
  mouth: PrincessMouth
  /** Worried brows. */
  brows: boolean
  /** Extra sparkle in the eyes (wet eyes). */
  glint: boolean
  /** Tears: [x, y, size 1..3] relative to the body centre. */
  tears: readonly (readonly [number, number, number])[]
  /** Twinkle on the tiara, 0 none .. 2 full. */
  twinkle: number
}

export const princessPose = (p: Partial<PrincessPose> = {}): PrincessPose => ({
  bob: 0,
  squash: 0,
  jx: 0,
  earNear: 0,
  earFar: 0,
  earSway: 0,
  tilt: 0,
  ribbon: 0,
  ribbonDrop: 6,
  nearHand: [-3, 11],
  farHand: null,
  nearShoulder: null,
  farShoulder: null,
  paw2: null,
  nearFoot: [0, 0],
  farFoot: [0, 0],
  eyes: 'open',
  mouth: 'smile',
  brows: false,
  glint: false,
  tears: [],
  twinkle: 0,
  ...p
})

/** The head ball of a pose (centre and radii), for tests that measure the silhouette against it. */
export function princessHeadBall(pose: PrincessPose) {
  const ry = 15 - pose.squash
  return { cx: 30 + pose.jx, cy: 57 - ry - pose.bob, rx: 16 + pose.squash * 0.6, ry }
}

const EYE_KEY = { K: C.black, w: C.white, a: PINK[3], p: PINK[2], i: C.ink, t: WATER[0], u: WATER[1] }

/** Hand-placed eye shapes: [near eye, far eye]. The far eye is a pixel narrower (three-quarter view). */
const EYE_SHAPES: Record<PrincessEyes, readonly [readonly string[], readonly string[]]> = {
  open: [
    ['iiKKK.', '.KKKKK', '.KwwKK', '.KwwKK', '.KKKKK', '.KaaKK', '.KpwaK', '..KKK.'],
    ['.KKKii', 'KKKKK.', 'KwwKK.', 'KwwKK.', 'KKKKK.', 'KaaKK.', 'KpwaK.', '.KKK..']
  ],
  sad: [
    ['iiKKK.', '.KKKKK', '.KwwKK', '.KwwKK', '.KKwKK', '.KaaaK', '.tpwwK', '.uuuK.'],
    ['.KKKii', 'KKKKK.', 'KwwKK.', 'KwwKK.', 'KKwKK.', 'KaaaK.', 'tpwwK.', '.uuK..']
  ],
  half: [
    ['......', '......', 'iiiiii', '.KwKKK', '.KKKKK', '.KaaaK', '.KpwaK', '..KKK.'],
    ['......', '......', 'iiiiii', 'KwKKK.', 'KKKKK.', 'KaaaK.', 'KpwaK.', '.KKK..']
  ],
  closed: [
    ['......', '......', '......', 'i.....', '.iiiii', '.....i', '......', '......'],
    ['......', '......', '......', '.....i', 'iiiii.', 'i.....', '......', '......']
  ],
  happy: [
    ['......', '......', 'i.....', '.iiii.', 'i....i', 'i....i', '......', '......'],
    ['......', '......', '.....i', '.iiii.', 'i....i', 'i....i', '......', '......']
  ]
}

function drawEyes(l: Raster, x: number, y: number, kind: PrincessEyes, glint: boolean) {
  const [near, far] = EYE_SHAPES[kind]
  l.stamp(near, x, y, EYE_KEY)
  l.stamp(far, x + 9, y + 1, EYE_KEY)
  if (glint) {
    l.set(x + 4, y + 3, C.white)
    l.set(x + 12, y + 4, C.white)
  }
}

const MOUTH_KEY = { K: C.ink, m: C.mouth, t: C.tongue }
/** Mouths all hang from the same spot right under the nose; the "ω" is the resting one. */
const MOUTHS: Record<PrincessMouth, readonly string[]> = {
  smile: ['K.K.K', '.K.K.'],
  small: ['.KKK.'],
  frown: ['.KKK.', 'K...K'],
  o: ['.KK.', 'KmmK', 'KmmK', '.KK.'],
  open: ['KKKKK', 'KmmmK', 'KmtmK', '.KKK.']
}

/** A round ear: flat rim, darker bowl. `back` draws the far ear a step darker. Elliptical so it can hang. */
function ear(l: Raster, x: number, y: number, rx: number, ry: number, back: boolean) {
  const rim = back ? FAR_PINK : PINK
  l.ellipse(x, y, rx, ry, rim[1])
  l.ellipse(x - 1, y - 1, rx - 1.5, ry - 1.5, rim[back ? 1 : 0])
  l.ellipse(x, y, rx - 2, ry - 2, rim[1])
  if (rx > 3.5) l.ellipse(x, y - 0.5, rx - 3, ry - 3, rim[2])
  if (rx > 4.5) l.ellipse(x + 0.5, y + 0.5, rx - 4.5, ry - 4.5, rim[3])
}

/** A short chubby limb ending in a round paw, like ハム彦's. */
function limb(l: Raster, a: readonly [number, number] | null, b: readonly [number, number], ramp: typeof WHITE) {
  if (a && Math.hypot(b[0] - a[0], b[1] - a[1]) > 3) {
    bar(l, [a[0], a[1]], [b[0], b[1]], 5, ramp[1])
    shadeEdges(l, ramp, 1, true)
  }
  ball(l, b[0], b[1], 3.1, 3.2, ramp, false)
}

/** A four-pointed-ish gold star, 7×6. */
const STAR = ['...y...', '...y...', '..yyy..', 'yyyyyyy', '.yyyyy.', '.yy.yy.']

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** One frame of ハム姫. */
export function drawPrincess(pose: PrincessPose): Raster {
  const g = new Painter(64, 64)
  const { cx, cy, rx, ry } = princessHeadBall(pose)
  const top = cy - ry
  const hx = pose.tilt * 0.5
  const t = pose.tilt
  /** Face-relative pixel positions (the face slides with the head tilt). */
  const X = (u: number) => Math.round(cx + u + hx)
  const Y = (v: number) => Math.round(cy + v)

  // tail: a small round puff
  g.add(-4, (l) => ball(l, cx - rx + 1, cy + 8, 3, 3, FAR, false))

  // ears: set wide apart at about 10 and 2 o'clock; the tilt swings them round the head, a droop lets them hang
  const earSpot = (side: -1 | 1) => {
    const a = ((side * 42 + t * 6) * Math.PI) / 180
    return [cx + hx + Math.sin(a) * rx * 1.02, cy - Math.cos(a) * ry * 1.02] as const
  }
  {
    const [x, y] = earSpot(1)
    const d = pose.earFar
    g.add(-3, (l) =>
      ear(l, lerp(x, cx + hx + 13, d) + pose.earSway, lerp(y, cy - 10, d), lerp(5.2, 4, d), lerp(5.2, 6, d), true)
    )
  }
  {
    const [x, y] = earSpot(-1)
    const d = pose.earNear
    g.add(d > 0.5 ? 2 : -3, (l) =>
      ear(l, lerp(x, cx + hx - 11.5, d) + pose.earSway, lerp(y, cy - 4, d), lerp(6, 3.8, d), lerp(6, 6.4, d), false)
    )
  }

  // far arm behind the body
  if (pose.farHand && pose.farShoulder) {
    const [fx, fy] = pose.farHand
    const [sx, sy] = pose.farShoulder
    g.add(-2, (l) => {
      limb(l, [cx + sx, cy + sy], [cx + fx, cy + fy], FAR)
    })
  }
  // far foot
  g.add(-3, (l) => {
    const [fx, lift] = pose.farFoot
    l.ellipse(cx + 8 + fx - pose.jx, 58 - lift, 4.5, 2.8, FAR[1])
    l.rect(Math.round(cx + 5 + fx - pose.jx), 59 - lift, 7, 1, FAR[2])
  })

  // body: the head ball; the pale lower face, cheeks and tiara band are painted onto it
  g.add(0, (l) => {
    ball(l, cx, cy, rx, ry, WHITE)
    // tiara band hugging the skull
    for (let x = Math.round(cx + hx - 5); x <= cx + hx + 5; x++) {
      const nx = (x + 0.5 - cx) / rx
      const yy = Math.round(cy - ry * Math.sqrt(Math.max(0, 1 - nx * nx))) + 1
      l.paint(x, yy, GOLD[1])
      l.paint(x, yy + 1, GOLD[2])
    }
    // the lower face of a hamster: both cheeks and the chin, with only a soft bulge at the near cheek
    patch(l, cx + 8.5 + hx, cy + 4.5, 8.4, 5.2, FACE[1])
    patch(l, cx + 7.5 + hx, cy + 2, 5, 1.8, FACE[0])
    patch(l, cx + 10 + hx, cy + 8.6, 6.4, 1.8, FACE[2])
    ball(l, cx + 12.6 + hx, cy + 4.6, 3.8, 3.7, FACE, false)
  })

  // ribbon tails, then the bow
  const bx = cx - 3
  const by = cy + 11
  g.add(1, (l) => {
    const s = pose.ribbon
    const drop = Math.min(pose.ribbonDrop, ry - 10)
    bar(l, [bx - 1, by + 1], [bx - 3 + s, by + drop], 3, PINK[1])
    bar(l, [bx + 1, by + 1], [bx + 3 + s * 0.6, by + drop - 1], 3, PINK[2])
    shadeEdges(l, PINK, 1)
  })
  g.add(2, (l) => {
    l.ellipse(bx - 3.5, by - 0.5, 3.4, 2.8, PINK[1])
    l.ellipse(bx + 3.5, by - 0.5, 3.4, 2.8, PINK[1])
    shadeEdges(l, PINK, 1, true)
    l.rect(bx - 4, by - 1, 2, 1, PINK[3])
    l.rect(bx + 3, by - 1, 2, 1, PINK[3])
    l.ellipse(bx, by, 1.6, 1.6, PINK[2])
    l.set(bx - 1, by - 1, PINK[0])
  })

  // face
  g.add(
    1,
    (l) => {
      const fx = cx + 1 + hx
      const fy = cy - 6 + t * 0.3
      drawEyes(l, Math.round(fx), Math.round(fy), pose.eyes, pose.glint)
      if (pose.brows) {
        for (const [dx, dy] of [
          [0, 1],
          [1, 1],
          [2, 0],
          [3, 0]
        ])
          l.set(Math.round(fx) + dx + 1, Math.round(fy) - 3 + dy, PINK[3])
        for (const [dx, dy] of [
          [0, 0],
          [1, 0],
          [2, 1],
          [3, 1]
        ])
          l.set(Math.round(fx) + 9 + dx, Math.round(fy) - 2 + dy, PINK[3])
      }
      // a tiny pink nose between the eyes, the mouth right under it
      l.rect(X(8), Y(2), 3, 2, PINK[2])
      l.set(X(8), Y(2), PINK[0])
      const rows = MOUTHS[pose.mouth]
      l.stamp(rows, X(9) - Math.floor(rows[0].length / 2), Y(5), MOUTH_KEY)
      // two short whiskers at the cheek
      l.line(X(15), Y(4), X(18), Y(3), WHITE[3])
      l.line(X(15), Y(7), X(18), Y(8), WHITE[3])
      // blush on the near cheek
      l.ellipse(X(3.5), Y(5.5), 2.6, 1.6, C.blush)
      for (const [tx, ty, s] of pose.tears) {
        // the wet track behind a falling tear
        if (ty > 3) l.line(Math.round(cx + tx), Y(2), Math.round(cx + tx), Math.round(cy + ty - s), WATER[0])
        l.ellipse(cx + tx, cy + ty, s * 0.6 + 0.4, s * 0.8 + 0.5, WATER[1])
        l.set(Math.round(cx + tx) - 1 + (s > 1 ? 0 : 1), Math.round(cy + ty) - 1, C.white)
      }
    },
    false
  )

  // tiara star on top of the head
  g.add(2, (l) => {
    const sx = Math.round(cx + hx - 2)
    const sy = Math.round(top - 4 + t * 0.2)
    l.stamp(STAR, sx, sy, { y: GOLD[1] })
    // shade bottom-right, highlight top-left
    const src = l.clone()
    for (let y = sy; y < sy + 6; y++)
      for (let x = sx; x < sx + 7; x++) {
        if (src.get(x, y) !== GOLD[1]) continue
        if (!src.get(x + 1, y) || !src.get(x, y + 1)) l.set(x, y, GOLD[2])
        else if (!src.get(x - 1, y) || !src.get(x, y - 1)) l.set(x, y, GOLD[0])
      }
    if (pose.twinkle > 0) {
      l.set(sx + 3, sy - 2, C.white)
      l.set(sx + 3, sy - 1, C.white)
      if (pose.twinkle > 1) {
        l.set(sx + 1, sy + 2, C.white)
        l.set(sx + 5, sy + 2, C.white)
      }
    }
  })

  // near foot
  g.add(2, (l) => {
    const [fx, lift] = pose.nearFoot
    l.ellipse(cx - 4 + fx - pose.jx, 58 - lift, 5, 3, WHITE[2])
    l.rect(Math.round(cx - 8 + fx - pose.jx), 57 - lift, 5, 1, WHITE[1])
    l.rect(Math.round(cx - 7 + fx - pose.jx), 59 - lift, 4, 1, PINK[1])
  })

  // near arm
  g.add(3, (l) => {
    const [ax, ay] = pose.nearHand
    limb(
      l,
      pose.nearShoulder ? [cx + pose.nearShoulder[0], cy + pose.nearShoulder[1]] : null,
      [cx + ax, cy + ay],
      WHITE
    )
    l.set(Math.round(cx + ax) + 1, Math.round(cy + ay) + 1, PINK[1])
    if (pose.paw2) {
      ball(l, cx + pose.paw2[0], cy + pose.paw2[1], 3.1, 3.2, WHITE, false)
      l.set(Math.round(cx + pose.paw2[0]) + 1, Math.round(cy + pose.paw2[1]) + 1, PINK[1])
    }
  })
  return g.render()
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

// ------------------------------------------------------------------------------------------------ clips

const idle = memo(() =>
  [0, 1, 2, 1].map((k, i) =>
    drawPrincess(
      princessPose({
        squash: -k * 0.35 + 0.35,
        bob: k * 0.45,
        ribbon: [0, 1, 0, -1][i],
        earSway: [0, 0, 1, 0][i],
        nearShoulder: [-10, 3],
        nearHand: [-9, 9 + (i === 1 ? 0.5 : 0)],
        twinkle: i === 2 ? 2 : i === 1 ? 1 : 0
      })
    )
  )
)

/** Sad: ears hang, paws meet in front of the chest, wet eyes, one tear running down the cheek over the loop. */
const sad = memo(() =>
  [0, 1, 2, 3].map((i) =>
    drawPrincess(
      princessPose({
        squash: 1.2,
        jx: [-1, 1, -1, 1][i],
        earNear: [0.9, 1, 1, 0.95][i],
        earFar: [0.9, 1, 1, 0.95][i],
        earSway: [0, 0.5, 0, -0.5][i],
        tilt: -1,
        ribbon: [0, 1, 0, -1][i],
        ribbonDrop: 5,
        nearShoulder: [-2, 6],
        nearHand: [3, 10 + [0, 0.5, 0, -0.5][i]],
        paw2: [8, 9 + [0.5, 0, -0.5, 0][i]],
        eyes: 'sad',
        mouth: 'frown',
        brows: true,
        glint: i % 2 === 0,
        twinkle: 0,
        tears: [
          [[3.5, 2.2, 1]],
          [[3.5, 3.8, 2]],
          [[3.2, 6.2, 2]],
          [
            [3, 8.4, 1],
            [3.6, 2.2, 1]
          ]
        ][i] as [number, number, number][]
      })
    )
  )
)

const hop = memo(() => [
  { bob: 0, squash: 3, arms: 0 },
  { bob: 3, squash: -2, arms: 0.6 },
  { bob: 8, squash: -2, arms: 1 },
  { bob: 7, squash: -1, arms: 1 },
  { bob: 2, squash: -2, arms: 0.7 },
  { bob: 0, squash: 2, arms: 0.2 }
])
/** Cheer: a hop with short chubby arms thrown up and round paws. */
const cheer = memo(() =>
  hop().map((h, i) =>
    drawPrincess(
      princessPose({
        bob: h.bob,
        squash: h.squash,
        earNear: 0,
        earSway: [1, 0, -1, -1, 0, 1][i],
        ribbon: [1, -1, -2, -1, 1, 2][i],
        ribbonDrop: 6 + (h.bob > 5 ? -1 : 0),
        nearShoulder: [-11, 3],
        farShoulder: [12, 2],
        nearHand: [-12 - h.arms * 3.5, 6 - h.arms * 14],
        farHand: [13 + h.arms * 3.5, 5 - h.arms * 14],
        nearFoot: [-1, h.bob > 1 ? h.bob - 1 : 0],
        farFoot: [1, h.bob > 1 ? h.bob : 0],
        eyes: 'happy',
        mouth: 'open',
        twinkle: [0, 1, 2, 2, 1, 0][i]
      })
    )
  )
)

/** Wave: the far arm swings through a wide arc from the shoulder while the head tilts with it. */
const wave = memo(() =>
  [0, 1, 2, 3].map((i) => {
    const a = (([82, 56, 28, 54][i] * Math.PI) / 180) as number
    const reach = 11
    const sh: [number, number] = [13, 1]
    return drawPrincess(
      princessPose({
        squash: 0,
        tilt: [2.2, 1, -0.4, 1][i],
        earSway: [0, 1, 0, -1][i],
        ribbon: [0, 1, 0, -1][i],
        nearShoulder: [-10, 3],
        nearHand: [-9, 9],
        farShoulder: sh,
        farHand: [sh[0] + Math.sin(a) * reach, sh[1] - Math.cos(a) * reach],
        eyes: i === 2 ? 'happy' : 'open',
        mouth: i === 2 ? 'open' : 'smile',
        twinkle: i === 1 ? 1 : 0
      })
    )
  })
)

export const sheets: SheetModule = {
  princess: () => ({
    idle: lazyAnim(idle, 6, true),
    sad: lazyAnim(sad, 5, true),
    cheer: lazyAnim(cheer, 10, true),
    wave: lazyAnim(wave, 8, true)
  })
}

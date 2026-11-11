/**
 * ネズミ団員 (`walker`): a low, long grey rat thug on four legs: pointed snout, round ears, a long pink tail, a
 * black bandit mask over squinting eyes and the gang's red neckerchief. 44×38 physics box.
 */
import { C, R } from '../../palette'
import { Painter, Raster, ball, farRamp } from '../../raster'
import { anim } from '../../sheet'
import { bandanaTails, limb, neckerchief, patch, tailCurve, tumble } from './gang'

const RAT = R.ratGray
const FAR = farRamp(RAT)
const PINK = R.hamEar

export type WalkerEyes = 'squint' | 'glance' | 'hurt' | 'dead' | 'wide'

export interface WalkerPose {
  /** Body lifted off the legs (px). */
  bob: number
  /** Positive: stretched long and low. Negative: gathered short and high. */
  stretch: number
  /** Shift of the whole animal along x. */
  dx: number
  /** Legs: [forward offset of the foot, lift] for near-front, near-back, far-front, far-back. */
  legs: readonly [number, number][]
  /** Tail wave phase (radians) and its base angle (radians, 0 = straight back/left is π). */
  tailPhase: number
  tailUp: number
  /** Head offset relative to the body. */
  headDx: number
  headDy: number
  /** Ears tilt back (positive) or forward (negative). */
  ear: number
  eyes: WalkerEyes
  mouth: 'closed' | 'open' | 'snarl'
  /** 0 = standing; 1 = lying flat on its belly (defeat). */
  flat: number
  tailAlways?: boolean
}

export const walkerPose = (p: Partial<WalkerPose> = {}): WalkerPose => ({
  bob: 0,
  stretch: 0,
  dx: 0,
  legs: [
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0]
  ],
  tailPhase: 0,
  tailUp: 0,
  headDx: 0,
  headDy: 0,
  ear: 0,
  eyes: 'squint',
  mouth: 'closed',
  flat: 0,
  ...p
})

export function drawWalker(pose: WalkerPose): Raster {
  const g = new Painter(64, 64)
  const f = pose.flat
  const rx = 13 + pose.stretch + f * 1.5
  const ry = 9 - pose.stretch * 0.5 - f * 4
  const cx = 28 + pose.dx - pose.stretch * 0.4
  const cy = 55 - ry - pose.bob + f * 1
  const hx = cx + 16 + pose.headDx
  const hy = cy - 4 + pose.headDy + f * 4
  const hipY = cy + ry - 2

  // far legs, behind the body
  const [nf, nb, ff, fb] = pose.legs
  const leg = (l: Raster, hx0: number, foot: readonly [number, number], far: boolean, hr = 4.2) => {
    const ramp = far ? FAR : RAT
    const fx = hx0 + foot[0]
    const fy = 58 - foot[1] + f * 0
    ball(l, hx0, hipY - 2, hr, hr, ramp, false)
    limb(l, [hx0, hipY], [fx, fy - 1], 4, ramp, 3.4, 1.9)
    l.paint(fx + 2, fy, ramp[2])
  }
  g.add(-3, (l) => leg(l, cx + 6, ff, true, 3.4))
  g.add(-3, (l) => leg(l, cx - 7, fb, true, 4.6))

  // tail: long, pink, whipping
  g.add(-4, (l) => {
    tailCurve(
      l,
      [cx - rx + 2, cy + 1],
      Math.PI + 0.75 - pose.tailUp * 0.35 + f * 0.9,
      14,
      0.45,
      pose.tailPhase,
      3,
      1.4,
      PINK
    )
  })

  // far ear
  g.add(-2, (l) => {
    const ex = hx + 3 - pose.ear * 0.6
    const ey = hy - 8.5 + pose.ear * 0.3
    ball(l, ex, ey, 3.8, 4.2, FAR, false)
    l.ellipse(ex + 0.5, ey + 0.5, 1.4, 1.8, PINK[3])
  })

  // body
  g.add(0, (l) => {
    ball(l, cx, cy, rx, ry, RAT)
    patch(l, cx + 4, cy + ry - 2, rx - 4, 3, RAT[0])
    patch(l, cx + 6, cy + ry - 0.5, rx - 6, 1.6, RAT[1])
    // a darker saddle on the back gives the rat a hunched thug look
    patch(l, cx - 3, cy - ry + 1, 8, 2.5, RAT[2])
  })

  // neckerchief with a knot and tails at the back of the neck
  g.add(1, (l) => {
    neckerchief(l, hx - 3, hy + 4, 14, 13 - f * 8)
  })
  g.add(-1, (l) => bandanaTails(l, hx - 8, hy + 5, 7, Math.sin(pose.tailPhase * 1.3) * 2 + 1))

  // head
  g.add(2, (l) => {
    ball(l, hx, hy, 8.5, 7.8, RAT)
    // snout
    ball(l, hx + 7.5, hy + 2.5, 6, 4.4, RAT)
    patch(l, hx + 8, hy + 5, 5, 1.8, RAT[0])
    // eye mask
    const m = new Raster(l.w, l.h)
    m.ellipse(hx + 2, hy - 1.5, 6.4, 2.6, C.black)
    m.ellipse(hx - 4, hy - 0.5, 2, 1.4, C.black)
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.get(x, y) && l.get(x, y)) l.set(x, y, C.black)
    // eyes
    const ex = Math.round(hx)
    const ey = Math.round(hy - 2)
    switch (pose.eyes) {
      case 'squint':
        l.stamp(['ww.', '.ww'], ex - 2, ey - 1)
        l.stamp(['ww.', '.ww'], ex + 4, ey - 1)
        break
      case 'glance':
        l.stamp(['ww.', '.ww'], ex - 3, ey - 1)
        l.stamp(['ww.', '.ww'], ex + 3, ey - 1)
        break
      case 'wide':
        l.stamp(['wwK', 'wKK', 'wKK'], ex - 3, ey - 1)
        l.stamp(['wwK', 'wKK', 'wKK'], ex + 3, ey - 1)
        break
      case 'hurt':
        l.stamp(['w...', '.ww.', '..ww', '.ww.', 'w...'], ex - 4, ey - 2)
        l.stamp(['...w', '.ww.', 'ww..', '.ww.', '...w'], ex + 3, ey - 2)
        break
      case 'dead':
        l.stamp(['w..w', '.ww.', '.ww.', 'w..w'], ex - 4, ey - 2)
        l.stamp(['w..w', '.ww.', '.ww.', 'w..w'], ex + 3, ey - 2)
        break
    }
    // nose and mouth
    l.ellipse(hx + 12.2, hy + 1.6, 1.8, 1.6, PINK[1])
    l.set(Math.round(hx + 11.5), Math.round(hy + 0.5), PINK[0])
    const my = Math.round(hy + 6)
    const mx = Math.round(hx + 7)
    if (pose.mouth === 'open') {
      l.rect(mx - 2, my - 1, 6, 3, C.mouth)
      l.rect(mx - 2, my - 1, 2, 1, C.white)
      l.rect(mx + 2, my - 1, 2, 1, C.white)
    } else if (pose.mouth === 'snarl') {
      l.rect(mx - 2, my, 6, 1, C.ink)
      l.set(mx, my + 1, C.white)
      l.set(mx + 3, my + 1, C.white)
    } else {
      l.rect(mx - 1, my, 5, 1, RAT[3])
    }
  })

  // near ear (in front of the head's top)
  g.add(3, (l) => {
    const ex = hx - 3.5 - pose.ear
    const ey = hy - 8 + pose.ear * 0.3
    ball(l, ex, ey, 4.4, 4.8, RAT, false)
    l.ellipse(ex + 0.5, ey + 0.5, 2, 2.6, PINK[2])
    l.ellipse(ex + 1, ey + 1.2, 1.1, 1.5, PINK[3])
  })

  // near legs, in front of the belly
  g.add(4, (l) => leg(l, cx + 4, nf, false, 3.6))
  g.add(4, (l) => leg(l, cx - 9, nb, false, 5))
  return g.render()
}

/** Leg phases for a scurrying run: (near-front, near-back, far-front, far-back) at cycle time t. */
function scurry(t: number, reach = 6): [number, number][] {
  const one = (ph: number): [number, number] => {
    const a = (t + ph) * Math.PI * 2
    return [Math.sin(a) * reach, Math.max(0, Math.cos(a)) * 4]
  }
  return [one(0), one(0.5), one(0.5), one(0)]
}

const idle = [
  drawWalker(walkerPose({ tailPhase: 0, tailUp: 0, eyes: 'squint', bob: 0 })),
  drawWalker(walkerPose({ tailPhase: 1.6, tailUp: 1, eyes: 'glance', bob: 0.6, ear: 1.5, stretch: -0.4, headDy: -0.6 }))
]

const move = Array.from({ length: 6 }, (_, i) => {
  const t = i / 6
  const gallop = Math.cos(t * Math.PI * 4)
  return drawWalker(
    walkerPose({
      bob: 1 + gallop * 1.2,
      stretch: gallop * 1.8,
      dx: 0,
      legs: scurry(t),
      tailPhase: t * Math.PI * 2 + 0.5,
      tailUp: 0.5 + Math.sin(t * Math.PI * 2) * 0.5,
      headDy: -gallop * 0.6,
      ear: 1.4,
      eyes: 'squint',
      mouth: i % 3 === 0 ? 'snarl' : 'closed'
    })
  )
})

const hurt = [
  drawWalker(
    walkerPose({
      bob: 1,
      stretch: -2.5,
      dx: -1,
      headDx: -3,
      headDy: -2,
      ear: 2,
      eyes: 'hurt',
      mouth: 'open',
      tailPhase: 0.8,
      tailUp: 2,
      legs: [
        [-3, 2],
        [-4, 0],
        [2, 2],
        [-2, 0]
      ]
    })
  ),
  drawWalker(
    walkerPose({
      bob: 0,
      stretch: 1,
      dx: 1,
      headDx: -1,
      headDy: 1,
      ear: 1.5,
      eyes: 'hurt',
      mouth: 'open',
      tailPhase: 2.4,
      tailUp: 1,
      legs: [
        [-2, 0],
        [-3, 0],
        [0, 0],
        [-1, 0]
      ]
    })
  )
]

const air = (rest: Partial<WalkerPose>) =>
  walkerPose({
    eyes: 'hurt',
    mouth: 'open',
    ear: 2,
    legs: [
      [3, 4],
      [-3, 3],
      [5, 3],
      [-5, 4]
    ],
    ...rest
  })

const defeat = [
  drawWalker(air({ bob: 2, dx: 0, stretch: -1, headDx: -2, headDy: -2, tailPhase: 1, tailUp: 2 })),
  tumble(drawWalker(air({ bob: 3, dx: 0, tailPhase: 2 })), -0.9, 26, 43, -2, -9),
  tumble(drawWalker(air({ bob: 3, dx: 0, tailPhase: 3, eyes: 'dead' })), -2.7, 26, 43, 6, -10),
  tumble(drawWalker(air({ bob: 0, dx: 0, tailPhase: 4, eyes: 'dead', mouth: 'closed' })), -3.5, 26, 43, 6, -3),
  drawWalker(
    walkerPose({
      flat: 1,
      eyes: 'dead',
      mouth: 'open',
      dx: -1,
      tailPhase: 5,
      tailUp: -1,
      legs: [
        [2, 3],
        [-2, 3],
        [4, 2],
        [-4, 2]
      ]
    })
  )
]

export const walkerSheet = () => ({
  idle: anim(idle, 4, true),
  move: anim(move, 10, true),
  hurt: anim(hurt, 12, false),
  defeat: anim(defeat, 12, false)
})

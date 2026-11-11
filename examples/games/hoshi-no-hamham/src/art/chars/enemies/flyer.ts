/**
 * 子ガラス (`flyer`): a small round navy crow, always airborne. Short wings that flap through up, level and down,
 * a yellow beak and the gang bandana tied round the head like a pirate. The body is drawn around the middle of
 * the cell; the anchor (32, 60) stays well below it. 44×34 physics box.
 */
import { C, R } from '../../palette'
import { Painter, Raster, ball, bar, farRamp, shadeEdges, type Pt } from '../../raster'
import { anim } from '../../sheet'
import { BANDANA, bandanaTails, patch, tumble } from './gang'

const CROW = R.crowBlue
const FAR = farRamp(CROW)
const BEAK = R.beak
const EK = { K: C.black, w: C.white }

export interface FlyerPose {
  /** Body lifted (px, positive = up). */
  bob: number
  /** Positive squashes (wider, shorter). */
  squash: number
  /** Wing angle in degrees: 0 = level and back, negative = up, positive = down. Near and far. */
  wing: number
  farWing: number
  /** Tail feathers droop (positive) or rise (negative). */
  tail: number
  /** Feet dangle swing. */
  feet: number
  eyes: 'angry' | 'wide' | 'hurt' | 'dead'
  beak: 'closed' | 'open'
  /** Bandana tail flutter. */
  flutter: number
  /** 1 = a small tight puff (defeat end). */
  puff: number
}

export const flyerPose = (p: Partial<FlyerPose> = {}): FlyerPose => ({
  bob: 0,
  squash: 0,
  wing: 0,
  farWing: 0,
  tail: 0,
  feet: 0,
  eyes: 'angry',
  beak: 'closed',
  flutter: 0,
  puff: 0,
  ...p
})

/** A wing hinged at `s`: a feathered blade with a scalloped trailing edge. */
function wing(l: Raster, s: Pt, deg: number, len: number, ramp: readonly number[]) {
  const a = (deg * Math.PI) / 180
  const d: Pt = [-Math.cos(a), Math.sin(a)]
  const n: Pt = [-d[1], d[0]]
  const at = (u: number, v: number): Pt => [s[0] + d[0] * u + n[0] * v, s[1] + d[1] * u + n[1] * v]
  const pts = [
    at(0, 5.4),
    at(len * 0.5, 5.6),
    at(len, 2),
    at(len * 0.86, -1),
    at(len * 0.74, -1.4),
    at(len * 0.66, -4),
    at(len * 0.5, -3.6),
    at(len * 0.38, -6.4),
    at(0, -5)
  ].flat()
  const m = new Raster(l.w, l.h)
  m.poly(pts, ramp[1])
  shadeEdges(m, ramp as never, 1, true)
  // feather separations along the blade
  for (const v of [-1.6, 1.2]) {
    const p0 = at(len * 0.3, v)
    const p1 = at(len * 0.88, v + 0.4)
    const line = new Raster(l.w, l.h).line(p0[0], p0[1], p1[0], p1[1], ramp[2])
    for (let i = 0; i < line.data.length; i++) if (line.data[i] && m.data[i] === ramp[1]) m.data[i] = ramp[2]
  }
  l.blit(m)
}

export function drawFlyer(pose: FlyerPose): Raster {
  const g = new Painter(64, 64)
  const pf = pose.puff
  const rx = 11.5 + pose.squash * 0.8 - pf * 3
  const ry = 10 - pose.squash * 0.8 - pf * 3
  const cx = 28
  const cy = 33 - pose.bob + pf * 5
  const hx = cx + 6
  const hy = cy - 7 + pf * 1
  const hr = 9 - pf * 1.5

  // tail feathers
  g.add(-4, (l) => {
    const m = new Raster(l.w, l.h)
    const bx = cx - rx + 2
    const by = cy + 1
    const spread = [-0.5, 0, 0.5]
    for (const sp of spread) {
      const a = Math.PI - 0.35 + sp * 0.6 + pose.tail * 0.12
      bar(m, [bx, by], [bx + Math.cos(a) * 11, by + Math.sin(a) * 11], 3, CROW[1])
    }
    shadeEdges(m, CROW, 1, true)
    l.blit(m)
  })
  // far wing
  g.add(-3, (l) => wing(l, [cx + 3, cy - 3], pose.farWing, 19 - pf * 6, FAR))
  // feet dangling under the belly
  g.add(-1, (l) => {
    for (const [dx, k] of [
      [-2, 0],
      [4, 1]
    ] as const) {
      const fx = cx + dx + pose.feet * (k ? -1 : 1)
      bar(l, [cx + dx, cy + ry - 2], [fx, cy + ry + 4], 2, BEAK[2])
      l.rect(Math.round(fx), Math.round(cy + ry + 4), 3, 1, BEAK[1])
    }
  })
  // body
  g.add(0, (l) => {
    ball(l, cx, cy, rx, ry, CROW)
    // paler breast
    patch(l, cx + 5, cy + 3, rx * 0.6, ry * 0.55, CROW[1])
    patch(l, cx + 7, cy + 5, rx * 0.4, ry * 0.3, CROW[0])
  })
  // head, bandana cap, eyes, beak
  g.add(1, (l) => {
    ball(l, hx, hy, hr, hr - 0.4, CROW)
    // beak
    const bk = new Raster(l.w, l.h)
    const open = pose.beak === 'open'
    bk.poly([hx + 6, hy - 2.5, hx + 16, hy + (open ? -1 : 1.5), hx + 6, hy + (open ? 1.5 : 3.5)], BEAK[1])
    shadeEdges(bk, BEAK, 1, true)
    const low = new Raster(l.w, l.h)
    if (open) {
      low.poly([hx + 6, hy + 2, hx + 13, hy + 6, hx + 6, hy + 5.5], BEAK[2])
      l.blit(low)
      for (let x = Math.round(hx + 7); x <= hx + 12; x++) l.set(x, Math.round(hy + 2 + (x - hx - 7) * 0.2), C.mouth)
    }
    l.blit(bk)
    // pirate bandana: a cap over the top of the head
    const cap = new Raster(l.w, l.h)
    ball(cap, hx - 1, hy - 5.5, hr + 0.6, 6.4, BANDANA, false)
    for (let y = 0; y < cap.h; y++)
      for (let x = 0; x < cap.w; x++) {
        if (!cap.get(x, y) || !l.get(x, y)) continue
        const cut = hy - 2.5 + (x - hx) * 0.22
        if (y + 0.5 > cut) continue
        l.set(x, y, cap.get(x, y))
      }
    // the lower edge of the cap is a darker hem
    for (let x = Math.floor(hx - hr); x <= hx + hr; x++) {
      const y = Math.round(hy - 2.5 + (x - hx) * 0.22)
      if (l.get(x, y) === BANDANA[1]) l.set(x, y, BANDANA[2])
      if (l.get(x, y - 1) === BANDANA[1]) l.set(x, y - 1, BANDANA[2])
    }
    l.paint(hx - 4, hy - 8, BANDANA[0])
    l.paint(hx - 3, hy - 8, BANDANA[0])
    // eyes
    const ex = Math.round(hx + 1)
    const ey = Math.round(hy - 1)
    switch (pose.eyes) {
      case 'angry':
        l.stamp(['.KKK', 'wwKK', 'wwKK', 'wwKK', '.ww.'], ex - 3, ey - 1, EK)
        l.stamp(['.KK', 'wKK', 'wKK', 'wKK', '.w.'], ex + 3, ey - 1, EK)
        break
      case 'wide':
        l.stamp(['.ww.', 'wwww', 'wKKw', 'wKKw', '.ww.'], ex - 3, ey - 2, EK)
        l.stamp(['.ww', 'www', 'wKw', 'wKw', '.w.'], ex + 3, ey - 2, EK)
        break
      case 'hurt':
        l.stamp(['w...', '.ww.', '..ww', '.ww.', 'w...'], ex - 3, ey - 2, EK)
        l.stamp(['..w', '.w.', 'ww.', '.w.', '..w'], ex + 3, ey - 2, EK)
        break
      case 'dead':
        l.stamp(['w..w', '.ww.', '.ww.', 'w..w'], ex - 3, ey - 1, EK)
        l.stamp(['w..w', '.ww.', '.ww.', 'w..w'], ex + 3, ey - 1, EK)
        break
    }
  })
  // bandana knot and tails at the back of the head
  g.add(-1, (l) => bandanaTails(l, hx - hr + 1, hy - 3, 8, pose.flutter + 1))
  // near wing, in front of the body
  g.add(3, (l) => wing(l, [cx + 1, cy - 2], pose.wing, 21 - pf * 7, CROW))
  return g.render()
}

const WING = [-72, -38, 14, 62, 28, -28]
const flap = Array.from({ length: 6 }, (_, i) =>
  drawFlyer(
    flyerPose({
      wing: WING[i],
      farWing: WING[(i + 5) % 6] * 0.9,
      bob: [0, 0.5, 1.5, 3, 2, 1][i],
      squash: i === 3 ? -1 : i === 0 ? 1 : 0,
      tail: [0, -1, -2, -1, 1, 2][i],
      feet: [1, 0, -1, -1, 0, 1][i],
      flutter: [0, 1, 2, 1, -1, -1][i],
      beak: i === 2 ? 'open' : 'closed'
    })
  )
)

const hurt = [
  drawFlyer(
    flyerPose({ eyes: 'hurt', beak: 'open', wing: -60, farWing: -50, squash: 2, bob: 0, tail: 3, feet: 2, flutter: 2 })
  ),
  drawFlyer(
    flyerPose({
      eyes: 'hurt',
      beak: 'open',
      wing: -20,
      farWing: -10,
      squash: -1,
      bob: 2,
      tail: 1,
      feet: -1,
      flutter: -1
    })
  )
]

const base = (o: Partial<FlyerPose>) =>
  flyerPose({ eyes: 'hurt', beak: 'open', wing: -50, farWing: -40, tail: 2, ...o })
const defeat = [
  drawFlyer(base({ squash: 1, bob: 1 })),
  tumble(drawFlyer(base({ bob: 2, eyes: 'dead', wing: -30 })), -1.2, 30, 30, -3, -5),
  tumble(drawFlyer(base({ bob: 2, eyes: 'dead', wing: 20 })), -3.0, 30, 30, -5, -4),
  tumble(drawFlyer(base({ bob: 0, eyes: 'dead', wing: 50, farWing: 40 })), -4.5, 30, 30, -6, 2),
  drawFlyer(base({ eyes: 'dead', beak: 'closed', puff: 1, wing: 55, farWing: 50, tail: 0 }))
]

export const flyerSheet = () => ({
  move: anim(flap, 14, true),
  hurt: anim(hurt, 12, false),
  defeat: anim(defeat, 12, false)
})

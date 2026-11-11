/**
 * モグラ隊長 (`tough`): a big, heavy mole standing half upright in three-quarter view. A pear-shaped dark-brown body
 * with a paler belly, a pointed snout ending in a round pink nose, tiny squinting eyes under the brim of a dented
 * steel helmet, two huge pale digging claws held up like boxing gloves, short thick legs and a stub tail. The gang's
 * red bandana is knotted round the neck. A heavy character: it stomps, sinks and recovers slowly. 52×50 physics box.
 */
import { C, R } from '../../palette'
import { Painter, Raster, ball, bar, farRamp, outline, shadeEdges, type Pt } from '../../raster'
import { lazyAnim, memo } from '../../sheet'
import { bandanaTails, neckerchief, patch, shaded, tumble } from './gang'

const MOLE = R.moleBrown
const FAR = farRamp(MOLE)
const STEEL = R.steel
const NOSE = R.hamEar
const CLAW = R.cream
const CLAW_FAR = farRamp(CLAW)

export type ToughEyes = 'glare' | 'hurt' | 'dead' | 'blink'

export interface ToughPose {
  /** Body lifted (px, positive = up). */
  bob: number
  /** Breathing: positive swells the chest (px). */
  breathe: number
  /** Upper body shifted sideways (px): the rocking of the walk. */
  sway: number
  /** Head shift forward (positive) or back. */
  headDx: number
  headDy: number
  /** Feet: [forward offset, lift]. */
  nearFoot: readonly [number, number]
  farFoot: readonly [number, number]
  /** Paws: offsets from their shoulders. */
  hand: Pt
  farHand: Pt
  /** 0 = claws bunched, 1 = spread wide. */
  open: number
  eyes: ToughEyes
  mouth: 'closed' | 'open' | 'grit'
  /** Helmet: offset from the head and the angle it is knocked to (radians); `null` = not drawn. */
  helmet: Pt | null
  helmetAngle: number
  flutter: number
  /** 0 = standing; 1 = lying flat (defeat). */
  flat: number
}

export const toughPose = (p: Partial<ToughPose> = {}): ToughPose => ({
  bob: 0,
  breathe: 0,
  sway: 0,
  headDx: 0,
  headDy: 0,
  nearFoot: [0, 0],
  farFoot: [0, 0],
  hand: [9, 10],
  farHand: [8, 11],
  open: 0.3,
  eyes: 'glare',
  mouth: 'closed',
  helmet: [0, 0],
  helmetAngle: 0,
  flutter: 0,
  flat: 0,
  ...p
})

/** One thick prong: a cream bar with a dark tip, outlined on its own so prongs read as separate fingers. */
function prong(l: Raster, from: Pt, to: Pt, ramp: typeof CLAW) {
  const m = new Raster(l.w, l.h)
  bar(m, from, to, 3, ramp[1])
  shadeEdges(m, ramp, 1, true)
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const len = Math.hypot(dx, dy) || 1
  // dark tip: the last two pixels along the prong
  for (const k of [0, 1]) {
    const tx = to[0] + (dx / len) * (0.6 - k * 1.2)
    const ty = to[1] + (dy / len) * (0.6 - k * 1.2)
    for (const [ox, oy] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1]
    ])
      if (k === 0 || ox * dx + oy * dy >= 0) m.paint(tx + ox, ty + oy, k === 0 ? MOLE[3] : MOLE[2])
  }
  outline(m)
  l.blit(m)
}

/** A huge digging paw: a round palm and four thick prongs fanning up and forward. */
function paw(l: Raster, p: Pt, open: number, far: boolean) {
  const ramp = far ? CLAW_FAR : CLAW
  const k = 0.85 + open * 0.45
  const angles = [-1.65, -1.15, -0.65, -0.15].map((a) => -0.9 + (a + 0.9) * k)
  const dirs = angles.map((a): Pt => [Math.cos(a), Math.sin(a)])
  dirs.forEach((d, i) => {
    const reach = i === 0 || i === 3 ? 9.5 : 11
    prong(l, [p[0] + d[0] * 2.5, p[1] + d[1] * 2.5], [p[0] + d[0] * reach, p[1] + d[1] * reach], ramp)
  })
  const m = new Raster(l.w, l.h)
  ball(m, p[0], p[1] + 1, 4.6, 4.2, ramp, !far)
  outline(m)
  l.blit(m)
}

/** The steel helmet with its brim, a seam, rivets and one dent, drawn around the head and then knocked by the pose. */
function helmetRaster(w: number, h: number, hx: number, hy: number, off: Pt, angle: number): Raster {
  const m = new Raster(w, h)
  const cx = hx - 0.5
  const cy = hy - 5
  ball(m, cx, cy, 9.4, 7.6, STEEL)
  // cut the dome at the brim line
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.get(x, y) && y > cy + 4) m.set(x, y, 0)
  const by = Math.round(cy + 4)
  m.rect(Math.round(cx - 10), by, 22, 2, STEEL[1])
  m.rect(Math.round(cx - 10), by + 1, 22, 1, STEEL[2])
  m.rect(Math.round(cx - 10), by, 4, 1, STEEL[0])
  // centre seam and a dent in the upper right
  for (let y = Math.round(cy - 7); y < by; y++) m.paint(Math.round(cx + 1), y, STEEL[2])
  m.rect(Math.round(cx + 4), Math.round(cy - 4), 3, 2, STEEL[3])
  m.rect(Math.round(cx + 3), Math.round(cy - 5), 2, 1, STEEL[2])
  // rivets
  for (const [rx, ry] of [
    [-6, 1],
    [-3, -4],
    [7, 1]
  ] as const)
    m.paint(Math.round(cx + rx), Math.round(cy + ry), C.white)
  return tumble(m, angle, Math.round(cx), Math.round(cy + 3), Math.round(off[0]), Math.round(off[1]))
}

export function drawTough(pose: ToughPose): Raster {
  const g = new Painter(64, 64)
  const f = pose.flat
  const cx = 26
  const lowRx = 14 + f * 3.5
  const lowRy = 11 + pose.breathe * 0.4 - f * 4.5
  const lowY = 46 - pose.bob + f * 7
  const up = pose.sway
  const chRx = 10.5 + pose.breathe * 0.5 + f * 2
  const chRy = 9.5 + pose.breathe - f * 4
  const chX = cx + 4 + up
  const chY = 36 - pose.bob + f * 13 + pose.breathe * -0.5
  const hx = cx + 10 + up * 1.2 + pose.headDx + f * 4
  const hy = 26 - pose.bob + pose.headDy + f * 24
  const S: Pt = [chX + 8, chY]
  const FS: Pt = [chX + 1, chY - 1]

  // legs: short and thick, planted with weight
  const leg = (l: Raster, x: number, ft: readonly [number, number], far: boolean) => {
    const ramp = far ? FAR : MOLE
    const y = 57 - ft[1]
    shaded(l, ramp, (m) => {
      m.ellipse(x + ft[0], y, 6.4, 3.3, ramp[1])
      m.ellipse(x + ft[0] - 1, y - 3, 4.6, 4, ramp[1])
    })
    // three pale toe claws
    for (const k of [0, 1, 2]) l.paint(x + ft[0] + 5.5, y - 1 + k, CLAW[1])
  }
  g.add(-3, (l) => leg(l, cx + 11, pose.farFoot, true))
  g.add(1, (l) => leg(l, cx + 1, pose.nearFoot, false))
  // stub tail
  g.add(-2, (l) => ball(l, cx - 14, lowY + 5, 3.2, 2.8, MOLE, false))

  // body: a pear, wide at the bottom, narrower at the chest, with a pale belly
  g.add(0, (l) => {
    ball(l, cx, lowY, lowRx, lowRy, MOLE)
    ball(l, chX, chY, chRx, chRy, MOLE)
    patch(l, cx + 8 + up * 0.6, lowY - 3, 6.5, lowRy + 3, MOLE[0])
    patch(l, cx + 5, lowY + 2, 5, lowRy - 3, MOLE[0])
  })

  // bandana: a red triangle on the chest under the chin, knot and tails at the back of the neck
  g.add(4, (l) => neckerchief(l, hx - 7, hy + 6, 13, Math.max(5, 12 - f * 5)))
  g.add(-1, (l) => bandanaTails(l, hx - 9, hy + 9, 6, pose.flutter + 1))

  // far arm and claw: behind the near one, in front of the chest
  g.add(1.7, (l) => {
    const h: Pt = [FS[0] + pose.farHand[0], FS[1] + pose.farHand[1]]
    shaded(l, FAR, (m) => bar(m, FS, h, 6, FAR[1]))
    paw(l, h, pose.open * 0.8, true)
  })

  // head: round, with a pointed snout and a big pink nose
  g.add(2, (l) => {
    ball(l, hx, hy, 9.6, 8.6, MOLE)
    ball(l, hx + 8, hy + 3, 5.6, 4.2, MOLE)
    l.poly([hx + 6, hy - 1, hx + 15, hy + 3.5, hx + 6, hy + 7.5], MOLE[1])
    patch(l, hx + 8, hy + 6, 5, 1.6, MOLE[2])
    patch(l, hx + 9, hy + 2.5, 5, 2.6, MOLE[0])
    ball(l, hx + 15, hy + 3.5, 2.7, 2.5, NOSE, true)
    // tiny squinting eyes just under the brim
    const ex = Math.round(hx + 1)
    const ey = Math.round(hy + 1.5)
    const K = { K: C.black, w: C.white, i: C.black }
    switch (pose.eyes) {
      case 'glare':
        l.stamp(['KKK', '.Kw'], ex, ey, K)
        l.stamp(['KKK', '.Kw'], ex + 6, ey, K)
        break
      case 'blink':
        l.stamp(['KKK'], ex, ey + 1, K)
        l.stamp(['KKK'], ex + 6, ey + 1, K)
        break
      case 'hurt':
        l.stamp(['i..', '.ii', 'i..'], ex, ey - 1, K)
        l.stamp(['..i', 'ii.', '..i'], ex + 6, ey - 1, K)
        break
      case 'dead':
        l.stamp(['i.i', '.i.', 'i.i'], ex, ey - 1, K)
        l.stamp(['i.i', '.i.', 'i.i'], ex + 6, ey - 1, K)
        break
    }
    const mx = Math.round(hx + 6)
    const my = Math.round(hy + 6)
    if (pose.mouth === 'open') {
      patch(l, mx + 2.5, my + 1, 3.2, 1.8, C.mouth)
      l.paint(mx + 1, my, C.white)
    } else if (pose.mouth === 'grit') {
      l.rect(mx, my, 5, 1, C.ink)
      l.rect(mx + 1, my + 1, 3, 1, C.white)
    } else l.rect(mx, my + 1, 4, 1, MOLE[3])
  })

  // helmet
  if (pose.helmet) {
    const hm = helmetRaster(64, 64, hx, hy, pose.helmet, pose.helmetAngle)
    g.add(3, (l) => l.blit(hm))
  }

  // near arm and the big digging claw held up in front of the chest
  g.add(5, (l) => {
    const h: Pt = [S[0] + pose.hand[0], S[1] + pose.hand[1]]
    shaded(l, MOLE, (m) => {
      bar(m, S, h, 7, MOLE[1])
      m.ellipse(S[0], S[1], 4.6, 4.6, MOLE[1])
    })
    paw(l, h, pose.open, false)
  })
  return g.render()
}

/** A heavy stomp: contact, down, lift, contact, down, lift; the body rocks over each planted foot. */
const move = memo(() =>
  Array.from({ length: 6 }, (_, i) => {
    const near: [number, number][] = [
      [4, 0],
      [1, 0],
      [-4, 3],
      [-4, 0],
      [-1, 0],
      [3, 4]
    ]
    const far: [number, number][] = [
      [-4, 0],
      [-1, 0],
      [3, 0],
      [4, 0],
      [1, 0],
      [-4, 0]
    ]
    const sway = [1.8, 0.9, -0.9, -1.8, -0.9, 0.9][i]
    return drawTough(
      toughPose({
        bob: [-1, -0.5, 1, -1, -0.5, 1][i],
        sway,
        nearFoot: near[i],
        farFoot: far[i],
        hand: [9 - sway * 0.8, 10 + [0, 0.5, -1, 0, 0.5, -1][i]],
        farHand: [8 - sway * 0.8, 11 + [0, 0.5, -1, 0, 0.5, -1][i]],
        headDx: [1, 0, 0, 1, 0, 0][i],
        headDy: [0.5, 0.5, 0, 0.5, 0.5, 0][i],
        breathe: [0, -0.5, 0.5, 0, -0.5, 0.5][i],
        open: [0.2, 0.5, 1, 0.2, 0.5, 1][i],
        flutter: [0, 1, 2, 0, -1, -2][i],
        mouth: i === 0 || i === 3 ? 'grit' : 'closed'
      })
    )
  })
)

const idle = memo(() => [
  drawTough(toughPose({ breathe: 0, open: 0.1, flutter: 0 })),
  drawTough(
    toughPose({
      breathe: 1,
      bob: 0.5,
      open: 1,
      hand: [10, 9],
      farHand: [9, 10],
      headDy: -0.5,
      flutter: 1.5,
      mouth: 'grit'
    })
  )
])

const hurt = memo(() => [
  drawTough(
    toughPose({
      bob: -1,
      breathe: -1,
      sway: -2,
      headDx: -4,
      headDy: -1,
      hand: [3, 8],
      farHand: [6, 4],
      open: 1,
      eyes: 'hurt',
      mouth: 'open',
      helmet: [-3, -4],
      helmetAngle: -0.55,
      flutter: 3,
      nearFoot: [-2, 0],
      farFoot: [-3, 0]
    })
  ),
  drawTough(
    toughPose({
      bob: -1.5,
      sway: -1,
      headDx: -2,
      headDy: 1,
      hand: [6, 9],
      farHand: [9, 5],
      open: 0.8,
      eyes: 'hurt',
      mouth: 'open',
      helmet: [-1, -1],
      helmetAngle: -0.25,
      flutter: -1
    })
  )
])

const dizzy = (o: Partial<ToughPose>) =>
  toughPose({ eyes: 'hurt', mouth: 'open', open: 1, hand: [3, 8], farHand: [6, 4], helmet: null, ...o })
/** Draws the body without its helmet, turns it, then lets the helmet fly on its own path. */
const flown = (
  pose: Partial<ToughPose>,
  angle: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
  hOff: Pt,
  ha: number
) => {
  const body = tumble(drawTough(dizzy(pose)), angle, cx, cy, dx, dy)
  const hm = helmetRaster(64, 64, 36, 26, hOff, ha)
  const p = new Painter(64, 64)
  p.add(0, (l) => l.blit(body), false)
  p.add(1, (l) => l.blit(hm))
  return p.render()
}
const defeat = memo(() => [
  // hit: the helmet pops up off the head
  drawTough(dizzy({ bob: -1, sway: -2, headDx: -4, headDy: -1, flutter: 3, helmet: [-4, -9], helmetAngle: -0.8 })),
  // falling backwards, helmet spinning away
  flown({ bob: -2, sway: -3, headDx: -4, flutter: -2, eyes: 'dead' }, -0.5, 28, 40, -2, -4, [-9, -8], -1.9),
  // on its back, helmet coming down
  flown({ bob: -2, sway: -2, headDx: -3, flutter: 2, eyes: 'dead' }, -1.1, 28, 40, -2, -3, [-16, -8], -3.4),
  // sprawled, the helmet rolled to the side
  flown(
    { bob: -3, headDx: -3, flutter: -2, eyes: 'dead', hand: [5, 6], farHand: [8, 3] },
    -1.6,
    28,
    42,
    -3,
    1,
    [-22, 4],
    -4.2
  ),
  // lying flat, the dented helmet beside it
  new Painter(64, 64)
    .add(
      0,
      (l) =>
        l.blit(
          drawTough(
            toughPose({
              flat: 1,
              eyes: 'dead',
              mouth: 'open',
              open: 1,
              hand: [7, 4],
              farHand: [10, 2],
              helmet: null,
              flutter: 1,
              nearFoot: [2, 2],
              farFoot: [3, 3]
            })
          ).shifted(0, -3)
        ),
      false
    )
    .add(1, (l) => l.blit(helmetRaster(64, 64, 36, 26, [-20, 25], -4.9)))
    .render()
])

export const toughSheet = () => ({
  idle: lazyAnim(idle, 4, true),
  move: lazyAnim(move, 8, true),
  hurt: lazyAnim(hurt, 12, false),
  defeat: lazyAnim(defeat, 12, false)
})

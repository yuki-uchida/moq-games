/**
 * リス団員 (`spitter`): a red squirrel with huge stuffed cheeks and a big curled tail, the gang neckerchief and a
 * scowl. Chews while idle; inhales, swells and spits. 46×42 physics box.
 */
import { C, R } from '../../palette'
import { Painter, Raster, ball, bar, farRamp, shadeEdges, type Pt } from '../../raster'
import { lazyAnim, memo } from '../../sheet'
import { bandanaTails, neckerchief, patch, tumble } from './gang'

const SQ = R.squirrelRed
const FAR = farRamp(SQ)
const TAIL = [SQ[1], SQ[2], SQ[3], SQ[3], SQ[4]] as const
const CREAM = R.cream

export type SpitterEyes = 'angry' | 'squeeze' | 'wide' | 'hurt' | 'dead'

export interface SpitterPose {
  /** Body bob (px, positive = up). */
  bob: number
  /** Whole animal shifted along x (leaning back is negative). */
  dx: number
  /** Head shift relative to the body. */
  headDx: number
  headDy: number
  /** Cheek radius (px) and its vertical chew offset. */
  cheek: number
  chew: number
  /** Tail sway (-1..1) and curl (0 = relaxed, 1 = tight). */
  sway: number
  curl: number
  eyes: SpitterEyes
  mouth: 'closed' | 'chew' | 'o' | 'open'
  /** Hands: 0 = under the cheeks, 1 = raised to the cheeks, 2 = thrown out. */
  arm: number
  flutter: number
  /** Lying flat (defeat end). */
  flat: number
}

export const spitterPose = (p: Partial<SpitterPose> = {}): SpitterPose => ({
  bob: 0,
  dx: 0,
  headDx: 0,
  headDy: 0,
  cheek: 6,
  chew: 0,
  sway: 0,
  curl: 0,
  eyes: 'angry',
  mouth: 'closed',
  arm: 0,
  flutter: 0,
  flat: 0,
  ...p
})

function bez(a: Pt, b: Pt, c: Pt, d: Pt, t: number): Pt {
  const u = 1 - t
  return [
    u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0],
    u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1]
  ]
}

export function drawSpitter(pose: SpitterPose): Raster {
  const g = new Painter(64, 64)
  const f = pose.flat
  const cx = 30 + pose.dx
  const rx = 9 + f * 6
  const ry = 9.5 - f * 4.5
  const cy = 57 - ry - pose.bob
  const hx = cx + 6 + pose.headDx
  const hy = cy - 13 + pose.headDy + f * 9
  const ck = pose.cheek

  // big curled tail behind
  g.add(-4, (l) => {
    const s = pose.sway
    const a: Pt = [cx - 6, cy + 6]
    const b: Pt = [cx - 24 - s * 2, cy + 6]
    const c: Pt = [cx - 24 + s * 3 + pose.curl * 4, cy - 20 - f * 6]
    const d: Pt = [cx - 8 + s * 2 + pose.curl * 5, cy - 19 + pose.curl * 4 - f * 10]
    const m = new Raster(l.w, l.h)
    const n = 26
    for (let i = 0; i <= n; i++) {
      const t = i / n
      const [x, y] = bez(a, b, c, d, t)
      const r = 3 + Math.sin(Math.min(1, t * 1.3) * Math.PI * 0.8) * 2.6
      m.ellipse(x, y, r, r, TAIL[1])
    }
    shadeEdges(m, TAIL as never, 1, true)
    // cream tip and two stripes across the tail
    for (let i = 0; i <= n; i++) {
      const t = i / n
      const [x, y] = bez(a, b, c, d, t)
      const r = 3 + Math.sin(Math.min(1, t * 1.3) * Math.PI * 0.8) * 2.6
      if (t > 0.84) patch(m, x, y, r, r, CREAM[1])
      else if (i === 9 || i === 16) patch(m, x, y, r, r * 0.45, SQ[1])
    }
    l.blit(m)
  })
  // feet
  g.add(-3, (l) => ball(l, cx - 3, 57.5, 4.6, 2.6, FAR, false))
  g.add(4, (l) => ball(l, cx + 4, 57.5, 5.2, 2.7, SQ, false))
  // body: small, so the head and the cheeks dominate
  g.add(0, (l) => {
    ball(l, cx, cy, rx, ry, SQ)
    patch(l, cx + 4, cy + 2, rx - 4, ry - 3.5, CREAM[1])
    patch(l, cx + 5, cy + ry - 3, rx - 5, 2.2, CREAM[2])
  })
  // neckerchief under the cheeks (its tip shows), knot and tails at the back of the neck
  g.add(3.5, (l) => neckerchief(l, hx - 3, hy + 9, 11, Math.max(4, 11 - f * 6)))
  g.add(-1, (l) => bandanaTails(l, hx - 8, hy + 7, 7, pose.flutter + Math.sin(pose.sway * 2) + 1))
  // far cheek and far ear, behind the head
  g.add(-1, (l) =>
    ball(l, hx + 8.5, hy + 6.5 + pose.chew * 0.5, ck * 0.78, ck * 0.74, { ...CREAM, 1: CREAM[2] } as never, false)
  )
  g.add(-1, (l) => {
    const m = new Raster(l.w, l.h)
    m.poly([hx + 3, hy - 8, hx + 6, hy - 14.5, hx + 9.5, hy - 6.5], FAR[1])
    shadeEdges(m, FAR, 1, true)
    m.set(Math.round(hx + 6), Math.round(hy - 15.5), FAR[3])
    m.set(Math.round(hx + 6), Math.round(hy - 16.5), FAR[3])
    l.blit(m)
  })
  // head: big and round
  g.add(2, (l) => {
    ball(l, hx, hy, 10, 9, SQ)
    // short muzzle
    ball(l, hx + 9, hy + 2.5, 4.8, 3.8, SQ)
    // nose
    l.ellipse(hx + 13.4, hy + 0.8, 1.7, 1.4, C.ink)
    l.set(Math.round(hx + 12.5), Math.round(hy + 0.2), SQ[0])
    // big eyes with heavy brows: cute and mean
    const ex = Math.round(hx - 1)
    const ey = Math.round(hy - 6)
    const K = { K: C.black, w: C.white, b: C.ink, i: C.black }
    switch (pose.eyes) {
      case 'angry':
        l.stamp(['.KKK.', 'KwKKK', 'KwKKK', 'KKKKK', 'KKKKK', '.KKK.'], ex, ey, K)
        l.stamp(['.KKK', 'KwKK', 'KwKK', 'KKKK', '.KK.'], ex + 7, ey + 1, K)
        l.stamp(['bbbbb', '..bbb'], ex - 1, ey - 2, K)
        l.stamp(['bbbb', '.bbb'], ex + 6, ey - 1, K)
        break
      case 'squeeze':
        l.stamp(['.....', 'iiiii', '.....'], ex, ey + 3, K)
        l.stamp(['....', 'iiii', '....'], ex + 7, ey + 3, K)
        l.stamp(['bbbbb', '..bbb'], ex - 1, ey, K)
        l.stamp(['bbbb', '.bbb'], ex + 6, ey + 1, K)
        break
      case 'wide':
        l.stamp(['.www.', 'wwwww', 'wKKKw', 'wKKKw', '.www.'], ex, ey, K)
        l.stamp(['.ww.', 'wwww', 'wKKw', 'wKKw', '.ww.'], ex + 7, ey + 1, K)
        break
      case 'hurt':
        l.stamp(['i....', '.ii..', '..ii.', '.ii..', 'i....'], ex, ey + 1, K)
        l.stamp(['...i', '.ii.', 'ii..', '.ii.', '...i'], ex + 7, ey + 2, K)
        break
      case 'dead':
        l.stamp(['i...i', '.i.i.', '..i..', '.i.i.', 'i...i'], ex, ey + 1, K)
        l.stamp(['i..i', '.ii.', '.ii.', 'i..i'], ex + 7, ey + 2, K)
        break
    }
  })
  // near ear with a dark tuft
  g.add(3, (l) => {
    const m = new Raster(l.w, l.h)
    m.poly([hx - 7, hy - 6, hx - 5, hy - 14.5, hx + 1.5, hy - 7.5], SQ[1])
    shadeEdges(m, SQ, 1, true)
    m.paint(hx - 4, hy - 8, SQ[3])
    m.paint(hx - 4, hy - 9, SQ[3])
    m.set(Math.round(hx - 5), Math.round(hy - 15.5), SQ[3])
    m.set(Math.round(hx - 5), Math.round(hy - 16.5), SQ[3])
    m.set(Math.round(hx - 4), Math.round(hy - 15.5), SQ[2])
    l.blit(m)
  })
  // near cheek: the huge stuffed pouch, the widest part of the animal
  g.add(4, (l) => {
    ball(l, hx + 0.5, hy + 6.5 + pose.chew, ck, ck * 0.92, CREAM, true)
  })
  // mouth on the muzzle, in front of the cheek so the round "o" always reads
  g.add(
    5,
    (l) => {
      const mx = Math.round(hx + 10.5)
      const my = Math.round(hy + 4.5)
      if (pose.mouth === 'o') {
        l.ellipse(mx + 0.5, my + 0.5, 4, 4, C.ink)
        l.ellipse(mx + 0.5, my + 0.5, 3, 3, C.black)
        l.set(mx - 1, my - 1, C.mouth)
        l.set(mx, my - 1, C.mouth)
      } else if (pose.mouth === 'open') {
        l.ellipse(mx + 0.5, my + 1, 3, 2.6, C.ink)
        l.ellipse(mx + 0.5, my + 1, 2, 1.7, C.mouth)
        l.set(mx + 1, my + 2, C.tongue)
      } else if (pose.mouth === 'chew') l.rect(mx - 1, my + 1, 4, 1, C.ink)
      else l.rect(mx - 1, my, 4, 1, C.ink)
    },
    false
  )
  // small paws held at the chest, under the cheeks (raised toward them when spitting)
  const paws = (l: Raster, far: boolean) => {
    const ramp = far ? FAR : SQ
    const a = pose.arm
    const s: Pt = [cx + 3 + (far ? 4 : 0), cy + 1]
    const p: Pt = [cx + 8 + (far ? 3 : 0) + a * 2.6, cy + 6 - a * 3.6]
    shadeEdges(
      (() => {
        const m = new Raster(l.w, l.h)
        bar(m, s, p, 3, ramp[1])
        l.blit(m)
        return m
      })(),
      ramp,
      1,
      true
    )
    ball(l, p[0], p[1], 3.2, 3, ramp, !far)
    l.paint(p[0] + 1, p[1] + 1, CREAM[2])
  }
  g.add(-0.5, (l) => paws(l, true))
  g.add(5.5, (l) => paws(l, false))
  return g.render()
}

const idle = memo(() => [
  drawSpitter(spitterPose({ cheek: 6.2, chew: 0, mouth: 'closed', sway: 0, bob: 0 })),
  drawSpitter(spitterPose({ cheek: 6.8, chew: 1, mouth: 'chew', sway: 0.6, bob: 0.5, flutter: 1, headDy: 0.5 })),
  drawSpitter(spitterPose({ cheek: 6, chew: 0, mouth: 'closed', sway: 1, bob: 0, flutter: 2, headDx: 0.5 })),
  drawSpitter(spitterPose({ cheek: 6.6, chew: -0.8, mouth: 'chew', sway: 0.3, bob: 0.5, flutter: 0, headDy: 0.5 }))
])

const shoot = memo(() => [
  // inhale: lean back, cheeks start to fill
  drawSpitter(
    spitterPose({ dx: -2, headDx: -2, headDy: 1, cheek: 7.6, sway: -1, curl: 0.4, eyes: 'squeeze', arm: 1, flutter: 2 })
  ),
  // swollen: the cheeks are as big as the head
  drawSpitter(
    spitterPose({
      dx: -3,
      headDx: -3,
      headDy: 0,
      cheek: 9.6,
      bob: 1,
      sway: -1.4,
      curl: 0.8,
      eyes: 'squeeze',
      mouth: 'chew',
      arm: 1.5,
      flutter: 3
    })
  ),
  // SPIT: head thrown forward, cheeks flat, mouth a round gun
  drawSpitter(
    spitterPose({
      dx: 3,
      headDx: 4,
      headDy: 1,
      cheek: 4.4,
      chew: -1,
      bob: 0,
      sway: 1.5,
      curl: -0.3,
      eyes: 'wide',
      mouth: 'o',
      arm: 2,
      flutter: -2
    })
  ),
  // recover
  drawSpitter(
    spitterPose({
      dx: 1,
      headDx: 1.5,
      headDy: 1,
      cheek: 5.2,
      sway: 0.4,
      curl: 0.2,
      eyes: 'angry',
      mouth: 'chew',
      flutter: 1
    })
  )
])

const hurt = memo(() => [
  drawSpitter(
    spitterPose({
      dx: -1,
      headDx: -3,
      headDy: -1,
      cheek: 5,
      bob: 1,
      eyes: 'hurt',
      mouth: 'open',
      sway: -1.5,
      curl: 0.6,
      arm: 2,
      flutter: 3
    })
  ),
  drawSpitter(
    spitterPose({
      dx: -1,
      headDx: -1,
      headDy: 2,
      cheek: 6.5,
      bob: 0,
      eyes: 'hurt',
      mouth: 'open',
      sway: 1,
      curl: 0.2,
      arm: 1,
      flutter: -1
    })
  )
])

const dizzy = (o: Partial<SpitterPose>) =>
  spitterPose({ eyes: 'hurt', mouth: 'open', cheek: 5, arm: 2, sway: -1, bob: 2, ...o })
const defeat = memo(() => [
  drawSpitter(dizzy({ dx: 0, headDx: -3, headDy: -1, bob: 1 })),
  tumble(drawSpitter(dizzy({ eyes: 'dead' })), -1.0, 30, 38, -3, -8),
  tumble(drawSpitter(dizzy({ eyes: 'dead', sway: 1 })), -3.0, 30, 38, -3, -8),
  tumble(drawSpitter(dizzy({ eyes: 'dead', bob: 0 })), -4.6, 30, 38, 1, -2),
  drawSpitter(spitterPose({ flat: 1, eyes: 'dead', mouth: 'open', cheek: 4, arm: 2, sway: 1, curl: 1, flutter: 1 }))
])

export const spitterSheet = () => ({
  idle: lazyAnim(idle, 6, true),
  shoot: lazyAnim(shoot, 12, false),
  hurt: lazyAnim(hurt, 12, false),
  defeat: lazyAnim(defeat, 12, false)
})

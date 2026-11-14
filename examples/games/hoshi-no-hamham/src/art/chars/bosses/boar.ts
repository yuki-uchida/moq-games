/**
 * いのしし番長 (`boarBoss`): the bouncer of the gang's hideout, a school-gang tough of a wild boar built on the rig
 * toolkit. The heaviest of the four-legged bosses: a huge wedge of shoulder and neck under a coarse bristle ridge, a
 * massive head carried low, a small rump, short thick legs with cloven hooves. His pride is the glossy black
 * pompadour rolled forward over the brow (it bounces a beat late in every move); long cream tusks curve up beside the
 * pink snout disc, a leaf stalk sits in the corner of his mouth, and the gang's red neckerchief is knotted at his
 * throat. 128×128, facing right, feet on (64, 120).
 *
 * Rendering (CHARACTERS.md "Big furry bodies"): rump, ribs, shoulder wedge, neck and the near upper legs are ONE
 * silhouette shaded once, with a dark bristle ridge (`mantle` with long teeth), a pale belly and jowl, fur teeth on
 * the shadow and bristle-lock stamps; the legs below the knee are dark.
 *
 * Depth (back to front): dust, far legs, tail, body, near lower legs, far tusk, kerchief tails, kerchief band and
 * knot, far ear, mouth, lower jaw, head, snout disc, face, leaf stalk, near tusk, near ear, pompadour, steam, stars.
 */
import type { SheetModule } from '../../module'
import { TAU, lag } from '../../motion'
import { C, R, color, ramp } from '../../palette'
import { Painter, Raster, farRamp, type Pt, type Ramp } from '../../raster'
import {
  Frame,
  capsule,
  carve,
  egg,
  cel,
  fill,
  half,
  joint,
  mantle,
  minus,
  oval,
  overlap,
  polygon,
  ribbon,
  shadow,
  smooth,
  spline,
  stampAt,
  tint,
  union,
  within,
  type Shape
} from '../../rig'
import { lazyAnim, memo } from '../../sheet'

const FUR = R.boarBrown
const FAR = farRamp(FUR)
/*
 * Colours are tight (28 a frame at most): the boar's own ramps borrow the coat's steps wherever they can, so one
 * new colour buys a whole material.
 */
const INK = '#3a1a22'
/** The bristle ridge along the spine, the lower legs and the tail tuft: lit by the coat's shade, shaded by its deep. */
const BRISTLE = ramp('#684a32', '#503828', '#402c22', '#402c22', INK)
const BRISTLE_FAR = farRamp(BRISTLE)
/** Tusks: ivory shaded into the pale ramp. */
const TUSK = ramp('#fffcee', '#f4e4c2', '#d8b68c', '#c8a078', INK)
/** The pale belly, jowl and lower jaw: lit with the tusk's ivory, shaded into the coat's highlight. */
const PALE = ramp('#f4e4c2', '#d8b68c', '#c8a078', '#402c22', INK)
/** Steam and dust, shaded with the pale ramp. */
const DUST = ramp('#fff8ec', '#e6dac8', '#d8b68c', '#c8a078', INK)
/** The stars over a knocked-out head. */
const STARS = ramp('#fff3b2', '#ffd25c', '#d8a040', '#402c22', INK)
/** The pompadour, the brows and the hooves: glossy black with a warm line. */
const HAIR = ramp('#5e5878', '#38344e', '#252232', INK, INK)
/** The blue-white sheen stripe on the pompadour. */
const SHEEN = color('#8a9ad6')
const SNOUT = ramp('#f0bca8', '#d8968c', '#aa6670', '#402c22', INK)
const BAND = R.bandana
const LEAF = ramp('#a6dc7c', '#5cae52', '#3a8048', '#402c22', INK)
const HS = 1.16

/** The boar's own materials, for tests. */
export const BOAR_TONES = { hair: HAIR, sheen: SHEEN, tusk: TUSK, coat: FUR } as const

type Hoof = readonly [number, number, number]
type Eyes = 'glare' | 'narrow' | 'wide' | 'shut' | 'hurt' | 'dizzy' | 'tired'
type Mouth = 'shut' | 'grit' | 'open'

export interface BoarPose {
  /** Whole figure forward (+) / up (+). */
  x: number
  y: number
  /** Body tilt in degrees (front down +) and stretch (+ longer and flatter). */
  lean: number
  squash: number
  /** Sides breathing 0..1. */
  breath: number
  /** Head offset from its seat and nod in degrees (snout down +). */
  head: readonly [number, number]
  nod: number
  /** Lower jaw opening 0..1. */
  jaw: number
  mouth: Mouth
  tongue: boolean
  eyes: Eyes
  /** Ears turned back, in degrees. */
  earN: number
  earF: number
  /** Hooves relative to their rest place: forward, lift, turn in degrees. */
  fN: Hoof
  fF: Hoof
  hN: Hoof
  hF: Hoof
  /** Tail: direction (0 = back, + down), curl, sway phase. */
  tail: readonly [number, number, number]
  /** Pompadour: turn in degrees (+ forward / − swept back), droop over the eye 0..1, flattened 0..1. */
  quiff: readonly [number, number, number]
  /** Neckerchief tails: direction (0 = straight back, + down), ripple, phase. */
  kerchief: readonly [number, number, number]
  /** Leaf stalk: swing −1 (back corner) .. 1 (front corner); flying off 0 (in the mouth) .. 1; lying at x (or −1). */
  stalk: readonly [number, number, number]
  /** Steam puffing from the snout 0..1 (0 = none). */
  steam: number
  /** Dust from a scraping or stomping hoof 0..1. */
  dust: number
  /** Lying on the side 0..1. */
  roll: number
  /** Stars circling over the head: phase 0..1, −1 = none. */
  stars: number
}

export const boarPose = (p: Partial<BoarPose> = {}): BoarPose => ({
  x: 0,
  y: 0,
  lean: 0,
  squash: 0,
  breath: 0,
  head: [0, 0],
  nod: 0,
  jaw: 0,
  mouth: 'shut',
  tongue: false,
  eyes: 'glare',
  earN: 0,
  earF: 0,
  fN: [0, 0, 0],
  fF: [0, 0, 0],
  hN: [0, 0, 0],
  hF: [0, 0, 0],
  tail: [40, -260, 0],
  quiff: [0, 0, 0],
  kerchief: [60, 1, 0],
  stalk: [0, 0, -1],
  steam: 0,
  dust: 0,
  roll: 0,
  stars: -1,
  ...p
})

/** Rest places of the hooves (x relative to the anchor). */
const REST = { fN: 16, fF: 9, hN: -22, hF: -16 } as const

// ------------------------------------------------------------------------------------------------ stamps

const EYE_KEY = { K: HAIR[3], w: C.white, p: C.black, B: HAIR[1], i: HAIR[3] }
/** A small angry eye under a heavy black brow; the brow does the acting. */
const EYES: Record<Eyes, readonly string[]> = {
  glare: ['BB.......', '.BBBB....', '..BBBBBB.', '...KKKBBB', '..KwwppK.', '..KwwppK.', '...KKKK..'],
  narrow: ['BB.......', '.BBBB....', '..BBBBBB.', '..BBBBBBB', '..KKKKKK.', '..KwwppK.', '...KKKK..'],
  wide: ['..BBB....', '.B...BB..', '.........', '..KKKKK..', '.KwwwwwK.', '.KwwwppK.', '.KwwwppK.', '..KKKKK..'],
  shut: ['BB.......', '.BBBB....', '..BBBBBB.', '.........', '..iiiiii.', '...i..i..'],
  hurt: ['.B.....B.', '..B...B..', '.........', '.ii......', '...iii...', '.....iii.', '...iii...', '.ii......'],
  dizzy: ['.........', '..iiiii..', '.i.....i.', '.i.iii.i.', '.i.i.i.i.', '.i...i.i.', '..iii..i.'],
  tired: ['.........', 'BBBBBBB..', '.BBBBBBBB', '..iiiiii.', '..KwwppK.', '...KKKK..']
}
const NOSTRILS = ['KK', 'KK', '..', '..', 'KK', 'KK']
/** The sheen stripe along the pompadour's roll. */
const SHINE = ['.........ssss', '.....ggsss...', '..sssss......', 'sss..........']
/** The spiral on the end of the roll. */
const CURL = ['.ss.', 's..c', 's.c.', 's...', '.cc.']
const STAR = ['..y..', '.yYy.', 'yyYyy', '.yYy.', '..y..']
const STAR_SMALL = ['.y.', 'yYy', '.y.']
/** Coarse bristle locks that break the silhouette along the ridge. */
const BRISTLE_UP = ['..f..', '.ff..', '.fff.', 'ffff.', 'fffff']
const BRISTLE_BACK = ['ff...', 'fff..', '.ffff', '..fff']
const TUFT_DOWN = ['fffff', 'fffff', '.fff.', '.ff..', '..f..']

// ------------------------------------------------------------------------------------------------ helpers

const ID = Frame.at(0, 0)

/** A cloven hoof on its own frame (origin under its sole): two toes with a cleft, a dewclaw behind. */
const hoofShape = (grounded: boolean): Shape => {
  const s = union(
    polygon([
      [-3.6, -6],
      [2.6, -6],
      [6.4, 0.4],
      [-4.2, 0.4]
    ]),
    oval(-3.8, -5.2, 1.8, 1.8)
  )
  return grounded ? overlap(s, half([0, -0.4], 0, -1)) : s
}

/** A path from `from` heading in direction `deg` (0 = back, + down), bending by `curl` degrees along its length. */
function bentPath(from: Pt, deg: number, curl: number, len: number, wobble: (s: number) => number, n = 5): Pt[] {
  const pts: Pt[] = [from]
  let [x, y] = from
  for (let i = 1; i <= n; i++) {
    const s = i / n
    const a = ((deg + curl * s) * Math.PI) / 180
    const w = wobble(s)
    x += -Math.cos(a) * (len / n)
    y += Math.sin(a) * (len / n)
    pts.push([x - Math.sin(a) * w, y - Math.cos(a) * w])
  }
  return spline(pts)
}

/** Direction of a path near its point i, in degrees on screen. */
const heading = (path: readonly Pt[], i: number) => {
  const a = path[Math.max(0, i - 2)]
  const b = path[Math.min(path.length - 1, i + 2)]
  return (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI
}

/**
 * The highlight of a ramp on the very edge of a part takes the base colour instead: the lit-side selout next to it is
 * two steps darker, and two steps below ivory is still light (as the wolf's `dimEdge`; candidate for the toolkit).
 */
function dimEdge(l: Raster, tone: Ramp) {
  const b = l.bounds()
  if (!b) return
  const src = l.clone()
  for (let y = b.y; y < b.y + b.h; y++)
    for (let x = b.x; x < b.x + b.w; x++)
      if (
        src.get(x, y) === tone[0] &&
        !(src.get(x - 1, y) && src.get(x + 1, y) && src.get(x, y - 1) && src.get(x, y + 1))
      )
        l.set(x, y, tone[1])
}

/** A muscle crease just inside one edge of an upper limb (as on the wolf). */
function crease(a: Pt, b: Pt, ra: number, rb: number, side: 1 | -1): Shape {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
  const n: Pt = [(-(b[1] - a[1]) / d) * side, ((b[0] - a[0]) / d) * side]
  const pa: Pt = [a[0] + n[0] * (ra - 3), a[1] + n[1] * (ra - 3)]
  const pb: Pt = [b[0] + n[0] * (rb - 2.4), b[1] + n[1] * (rb - 2.4)]
  return overlap(capsule(pa, pb, 3, 2.3), half(pa, n[0], n[1]))
}

/** A leaf stalk: a stem from `root` in screen direction `deg` (0 = right, 90 = down) ending in a small leaf. */
function stalkAt(l: Raster, root: Pt, deg: number) {
  const a = (deg * Math.PI) / 180
  const tip: Pt = [root[0] + Math.cos(a) * 8, root[1] + Math.sin(a) * 8]
  ribbon(l, [root, tip], () => 1.6, LEAF[2])
  const leaf = Frame.at(tip[0], tip[1], deg + 25)
  fill(l, leaf, union(oval(3, 0, 3.6, 2), oval(0.5, 0, 1.5, 1.5)), LEAF[1])
}

// ------------------------------------------------------------------------------------------------ drawing

export function drawBoar(p: BoarPose): Raster {
  const g = new Painter(128, 128, { soft: true })
  const k = 1 + p.squash * 0.04
  const ground = Frame.at(56 + p.x, 120)
  const root = ground.child(0, -p.y)
  const torso = root.child(0, -36, p.lean, k, 1 / k)
  const head = torso.child(26 + p.head[0], -5 + p.head[1], 3 + p.nod - p.lean * 0.6, HS)
  const br = p.breath
  const humpAt = torso.pt(6, -6)

  // ---- leg geometry (two-bone legs: short and thick)
  const legGeo = (front: boolean, hoof: Hoof, rest: number, near: boolean) => {
    const f = ground.child(rest + hoof[0], -hoof[1], hoof[2])
    const grounded = hoof[1] < 0.6 && Math.abs(hoof[2]) < 10
    if (front) {
      const s = torso.pt(near ? 13 : 7, 7)
      const end = f.pt(-0.6, -6)
      return { f, grounded, s, end, mid: joint(s, end, 13, 11, 1).mid }
    }
    const s = torso.pt(near ? -19 : -14, 1)
    const end = f.pt(-1.4, -6.5)
    return { f, grounded, s, end, mid: joint(s, end, 16, 12, -1).mid }
  }
  type Leg = ReturnType<typeof legGeo>
  const legFN = legGeo(true, p.fN, REST.fN, true)
  const legFF = legGeo(true, p.fF, REST.fF, false)
  const legHN = legGeo(false, p.hN, REST.hN, true)
  const legHF = legGeo(false, p.hF, REST.hF, false)

  /** The body silhouette in torso units: rump, ribs, the shoulder wedge and the thick neck. */
  const neckEnd = torso.local(...head.pt(-4, 3))
  const bodyShape = union(
    egg(7, -3 - br * 0.6, 27.5 + br * 0.4, 25.5 + br * 0.8, 24),
    capsule([2, 2], [-20, 3], 20 + br * 0.6, 15),
    oval(-22, 3, 14, 15),
    capsule([14, -5], neckEnd, 19, 14.5)
  )

  /** Shank, pastern and hoof: what hangs free below the body, dark below the knee. */
  const lowerLeg = (l: Raster, leg: Leg, tone: Ramp, hoof: Ramp, r: number) => {
    fill(l, ID, capsule(leg.mid, leg.end, r, r * 0.72), tone[1])
    fill(l, ID, capsule(leg.end, leg.f.pt(0.4, -3.6), r * 0.7, r * 0.78), tone[1])
    fill(l, leg.f, hoofShape(leg.grounded), hoof[1])
  }
  const cleft = (l: Raster, leg: Leg, hoof: Hoof, tone: Ramp) => {
    if (Math.abs(hoof[2]) < 45) stampAt(l, leg.f, ['k', 'k'], 2.6, -2.4, { k: tone[3] })
  }

  // ---- far legs (a ramp step darker), whole, behind everything
  const farLeg = (leg: Leg, front: boolean, hoof: Hoof) => (l: Raster) => {
    fill(l, ID, capsule(leg.s, leg.mid, front ? 9 : 10, 6.2), FAR[1])
    lowerLeg(l, leg, BRISTLE_FAR, farRamp(HAIR), front ? 5.2 : 5.4)
    smooth(l)
    cel(l, { shade: 2.4, rim: 1 })
    shadow(l, torso.moved(0, 2), bodyShape)
    cleft(l, leg, hoof, HAIR)
  }
  g.add(-4, farLeg(legHF, false, p.hF))
  g.add(-4, farLeg(legFF, true, p.fF))

  // ---- tail: a short curl with a dark tuft
  g.add(-3, (l) => {
    const base = torso.pt(-31.5, -3)
    const sway = (s: number) => Math.sin(p.tail[2] - s * 2.4) * s * 1.2
    const path = bentPath(base, p.tail[0], p.tail[1], 16, sway, 8)
    ribbon(l, path, (t) => 3 - t * 0.8, FUR[1])
    const end = path[path.length - 1]
    fill(l, Frame.at(end[0], end[1], heading(path, path.length - 1)), oval(1, 0, 3.2, 2.4), BRISTLE[1])
    smooth(l)
    cel(l, { shade: 1.4, rim: 1 })
  })

  // ---- the body: rump, ribs, shoulder wedge, neck and the near upper legs as ONE silhouette, shaded once
  g.add(0, (l) => {
    fill(l, torso, bodyShape, FUR[1])
    fill(l, ID, capsule(legFN.s, legFN.mid, 11.5, 7), FUR[1])
    fill(l, ID, capsule(legHN.s, legHN.mid, 12.5, 7.2), FUR[1])
    // pale belly and the underside of the neck
    tint(l, torso, union(capsule([18, 17 - br * 0.4], [-14, 16], 5, 4), oval(22, 9, 7, 8)), PALE[1])
    // coarse bristle locks along the ridge, the rump and the belly
    stampAt(l, torso, BRISTLE_UP, 10.5, -24.5 - br, { f: FUR[1] })
    stampAt(l, torso, BRISTLE_UP, 3.5, -24 - br, { f: FUR[1] })
    stampAt(l, torso, BRISTLE_UP, -3.5, -21.5, { f: FUR[1] })
    stampAt(l, torso, BRISTLE_UP, 17, -21.5 - br, { f: FUR[1] })
    stampAt(l, torso, BRISTLE_BACK, -32.5, -6, { f: FUR[1] })
    stampAt(l, torso, TUFT_DOWN, 4.5, 17.5 + br * 0.4, { f: FUR[1] })
    smooth(l)
    mantle(l, FUR[1], BRISTLE[1], { depth: 6, tooth: 4.5, pitch: 5, origin: humpAt })
    cel(l, { shade: 12, deep: 4, rim: 2.4, tooth: 3.5, pitch: 5, origin: humpAt })
    if (p.roll > 0) {
      const belly = oval(-3, 8, 22 * p.roll, 7 * p.roll)
      tint(l, torso, belly, PALE[1])
      shadow(l, torso, overlap(belly, half([0, 12], 0, 1)))
    }
    shadow(l, ID, crease(legFN.s, legFN.mid, 10, 6.4, legFN.mid[1] >= legFN.s[1] ? 1 : -1))
    shadow(l, ID, crease(legHN.s, legHN.mid, 11, 6.6, legHN.mid[1] >= legHN.s[1] ? -1 : 1))
  })

  // ---- near legs below the body
  for (const leg of [legHN, legFN])
    g.add(1, (l) => {
      lowerLeg(l, leg, BRISTLE, HAIR, leg === legHN ? 6 : 5.8)
      smooth(l)
      cel(l, { shade: 2.4, rim: 1 })
      cleft(l, leg, leg === legHN ? p.hN : p.fN, HAIR)
    })

  // ---- the head's shapes (head units: skull centre at the origin, the jaw hinge near (8, 8))
  const skull = oval(0, -1, 12.5, 11.5)
  const jowl = oval(-2, 6, 10.5, 7)
  const snout = capsule([6, 1], [21, 3], 9, 6.6)
  const headShape = union(skull, jowl, snout)
  const jawDeg = p.mouth === 'open' ? p.jaw * 30 : p.mouth === 'grit' ? 2 : 0
  const jaw = head.child(8, 8, jawDeg)
  const open = p.mouth === 'open' && p.jaw > 0.08

  // ---- tusks: thick at the root, curving up beside the snout disc
  const tuskPath = (du: number, dv: number) =>
    spline([
      jaw.pt(8 + du, -0.5 + dv),
      jaw.pt(14 + du, 1.5 + dv),
      jaw.pt(19.5 + du, -0.5 + dv),
      jaw.pt(22.5 + du, -6 + dv),
      jaw.pt(22 + du, -12 + dv)
    ])
  const tusk = (l: Raster, path: Pt[], tone: Ramp, w: number) => {
    ribbon(l, path, (t) => w * (1 - t * 0.6), tone[1])
    smooth(l)
    cel(l, { shade: 1.4, rim: 1.2 })
    dimEdge(l, tone)
  }
  g.add(2, (l) => tusk(l, tuskPath(-3.5, -1), farRamp(TUSK), 4))

  // ---- neckerchief: two short tails from the knot at the throat, the band round the neck
  const knot = head.pt(-7, 13.5)
  const wave = (s: number) => Math.sin(p.kerchief[2] - s * 4) * p.kerchief[1] * s * 1.5
  g.add(2.4, (l) => {
    for (const [d, len] of [
      [-12, 11],
      [14, 9]
    ] as const) {
      const path = bentPath(knot, p.kerchief[0] + d, 10, len, wave)
      ribbon(l, path, (t) => 3.6 + t * 2.4, BAND[1])
      const n = path.length - 1
      carve(
        l,
        Frame.at(path[n][0], path[n][1], heading(path, n)),
        polygon([
          [3, -3.4],
          [-1.6, 0],
          [3, 3.4]
        ])
      )
    }
    cel(l, { shade: 1.6, rim: 1 })
  })
  g.add(2.5, (l) => {
    ribbon(l, spline([head.pt(-13, -5), head.pt(-14, 5), knot]), (t) => 6.5 - t * 1.5, BAND[1])
    fill(l, Frame.at(knot[0], knot[1]), oval(0, 0, 3.4, 3), BAND[1])
    cel(l, { shade: 1.8, rim: 1.2 })
    shadow(l, head.moved(0, 1.5), jowl)
  })

  // ---- far ear (behind the skull)
  const earF = head.child(-5, -9, -24 - p.earF)
  g.add(3, (l) => {
    fill(
      l,
      earF,
      polygon([
        [-4, 1],
        [-2.5, -9],
        [4, 0]
      ]),
      FAR[1]
    )
    cel(l, { shade: 1.5 })
  })

  // ---- mouth and lower jaw
  if (open)
    g.add(
      3.6,
      (l) => {
        fill(l, ID, polygon([head.pt(7, 6), head.pt(21, 7.5), jaw.pt(13, 0), jaw.pt(0, -1)]), C.mouth)
      },
      false
    )
  g.add(3.8, (l) => {
    fill(l, jaw, capsule([0, 0], [12, 0.5], 4, 3), PALE[1])
    cel(l, { shade: 1.6 })
  })
  if (p.tongue)
    g.add(3.85, (l) => {
      fill(l, jaw, union(capsule([6, -1], [9.5, 4], 2.2, 2.2), oval(9.8, 5.6, 2.4, 2.4)), C.tongue)
      tint(l, jaw, capsule([7.6, 0.6], [9.8, 5.6], 0.5, 0.5), C.mouth)
    })

  // ---- head: skull, jowl and long snout as one silhouette
  const headAt = head.pt(0, -1)
  g.add(4, (l) => {
    fill(l, head, headShape, FUR[1])
    tint(l, head, union(oval(-3, 9, 9, 4.6), capsule([6, 8.5], [19, 8], 2.6, 2)), PALE[1])
    stampAt(l, head, BRISTLE_BACK, -12.5, 3, { f: FUR[1] })
    stampAt(l, head, TUFT_DOWN, -6, 13.5, { f: PALE[1] })
    smooth(l)
    mantle(l, FUR[1], BRISTLE[1], { depth: 3, tooth: 2, pitch: 4, origin: headAt })
    cel(l, { shade: 5, deep: 1.8, rim: 1.8, tooth: 1.5, pitch: 4, origin: headAt })
  })

  // ---- the snout disc
  g.add(4.1, (l) => {
    fill(l, head, oval(23.5, 2.5, 3.4, 6.8), SNOUT[1])
    cel(l, { shade: 1.6 })
  })

  // ---- face
  g.add(
    4.2,
    (l) => {
      stampAt(l, head, EYES[p.eyes], 5.5, -3, EYE_KEY)
      stampAt(l, head, NOSTRILS, 24.5, 2.5, { K: SNOUT[3] })
      if (!open) stampAt(l, head, ['KK..........', '.KKKKKKKKKKK'], 13.5, 7.5, { K: C.inkWarm })
    },
    false
  )

  // ---- leaf stalk: in the corner of the mouth, flying off, or lying on the ground
  if (p.stalk[1] < 1 || p.stalk[2] >= 0)
    g.add(4.4, (l) => {
      if (p.stalk[2] >= 0) {
        stalkAt(l, [p.stalk[2], 117.5], 180 + 8)
        return
      }
      const s = p.stalk[0]
      const t = p.stalk[1]
      const root = head.pt(10 + s * 2.5, 8)
      if (t <= 0) stalkAt(l, root, 105 - s * 45 + head.angle * 0.3)
      else stalkAt(l, [root[0] - t * 26, root[1] - t * 30 + t * t * 18], 125 + t * 400)
    })

  // ---- near tusk
  g.add(4.6, (l) => {
    tusk(l, tuskPath(0, 0), TUSK, 4.6)
    within(l, (m) => stampAt(m, jaw, ['w', 'w'], 13.5, -0.5, { w: TUSK[0] }), true)
  })

  // ---- near ear: small, with a pink bowl
  const earN = head.child(-10, -6, -30 - p.earN)
  g.add(4.8, (l) => {
    fill(
      l,
      earN,
      polygon([
        [-4.5, 1.5],
        [-3, -10],
        [5, 0]
      ]),
      FUR[1]
    )
    tint(
      l,
      earN,
      polygon([
        [-2, 0],
        [-1.8, -6],
        [2.4, -0.5]
      ]),
      SNOUT[2]
    )
    cel(l, { shade: 1.6, rim: 1 })
  })

  // ---- the pompadour: a glossy black quiff rolled forward over the brow
  const [qa, droop, flat] = p.quiff
  const quiff = head.child(-3 + flat * 2, -9 + flat * 2.5, qa + droop * 38, 1 + flat * 0.22, 1 - flat * 0.5)
  g.add(5, (l) => {
    // slicked back over the crown, then a long roll jutting forward over the brow; its end shows as a disc
    const tip: Pt = [15, -10 + droop * 6]
    const tube = union(
      capsule([-11, 3], [-3, -4], 3.5, 6.5),
      capsule([-2, -6], tip, 7, 7.6),
      egg(5, -10 + droop * 2, 8.5, 8, 4)
    )
    const end = oval(tip[0] + 1.5, tip[1], 3.8, 7.2)
    fill(l, quiff, union(tube, end), HAIR[1])
    smooth(l)
    cel(l, { shade: 3.6, deep: 1.2, rim: 1.4 })
    within(l, (m) => stampAt(m, quiff, CURL, tip[0] + 2.5, tip[1], { c: HAIR[3], s: SHEEN }), true)
    // the sheen stripe along the roll and its hard glint
    within(l, (m) => stampAt(m, quiff, SHINE, 6, -13.5, { s: SHEEN, g: C.white }), true)
  })

  // ---- steam from the snout
  if (p.steam > 0)
    g.add(6, (l) => {
      const [x, y] = head.pt(25, -4)
      const s = p.steam
      fill(l, Frame.at(x + 1 + s * 2, y - 3 - s * 2), oval(0, 0, 2.2 + s * 1.2, 1.8 + s), DUST[1])
      fill(l, Frame.at(x + 2 + s * 4, y - 7 - s * 6), oval(0, 0, 1.6 + s * 1.4, 1.4 + s * 1.1), DUST[1])
      cel(l, { shade: 1.2 })
    })

  // ---- stars over a knocked-out head, outlined
  if (p.stars >= 0)
    g.add(7, (l) => {
      const [cx, cy] = head.pt(0, -22)
      for (let i = 0; i < 3; i++) {
        const a = (p.stars + i / 3) * TAU
        l.stamp(
          Math.sin(a) > 0 ? STAR : STAR_SMALL,
          Math.round(cx + Math.cos(a) * 13) - 2,
          Math.round(cy + Math.sin(a) * 3.5) - 2,
          { y: STARS[1], Y: STARS[0] }
        )
      }
    })

  // ---- dust from a scraping or stomping hoof
  if (p.dust > 0)
    g.add(-7, (l) => {
      const [x, y] = ground.pt(REST.fN + p.fN[0] - 10, -3.6)
      fill(l, Frame.at(x, y), oval(0, 0, 3.8 + p.dust * 1.4, 2.2 + p.dust * 0.5), DUST[1])
      fill(l, Frame.at(x - 7 - p.dust * 3, y - 2 - p.dust), oval(0, 0, 2.4 + p.dust, 2 + p.dust), DUST[1])
      cel(l, { shade: 1.2 })
    })

  void minus
  return g.render()
}

// ------------------------------------------------------------------------------------------------ clips

const P = boarPose
const phase = (i: number, n: number) => (i / n) * TAU

/** idle: standing square, chewing the stalk from corner to corner, a slow breath, an ear flick, a hoof scrape. */
const idle = memo(() => {
  const N = 6
  const breath = Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos(phase(i, N)))
  const bob = breath.map((b) => b * 1.2)
  const qLag = lag(bob, { stiffness: 0.35, damping: 0.45, loop: true })
  return Array.from({ length: N }, (_, i) =>
    P({
      y: -breath[i] * 0.6,
      breath: breath[i],
      head: [0, bob[i]],
      nod: breath[i] * 2,
      eyes: i === 4 ? 'narrow' : 'glare',
      mouth: i % 2 ? 'grit' : 'shut',
      earN: i === 2 ? 30 : i === 3 ? 12 : 0,
      fN: i === 3 ? [-3, 2.5, 18] : i === 4 ? [-5, 0, 0] : [0, 0, 0],
      dust: i === 4 ? 0.6 : 0,
      tail: [40 + Math.sin(phase(i, N)) * 6, -260, phase(i, N)],
      quiff: [qLag[i] * 6, 0, 0],
      kerchief: [60 + Math.sin(phase(i, N) + 1) * 6, 1, phase(i, N)],
      stalk: [Math.sin(phase(i, N)), 0, -1]
    })
  )
})

/**
 * intro: head lowered, the ground pawed twice, then he rears up on his hind legs and comes down in a stomp that
 * shakes him (held), steam jetting, the quiff bouncing a beat late; ends glaring.
 */
const intro = memo(() => {
  const stance: Partial<BoarPose> = { x: -4, mouth: 'grit', eyes: 'glare' }
  return [
    P({ y: -1, lean: 4, head: [2, 5], nod: 14, eyes: 'narrow', fN: [5, 5, -25], quiff: [6, 0, 0] }),
    P({
      y: -1,
      lean: 5,
      head: [2, 6],
      nod: 16,
      eyes: 'narrow',
      fN: [-7, 0, 0],
      dust: 1,
      steam: 0.4,
      quiff: [-4, 0, 0]
    }),
    P({
      x: -3,
      y: 5,
      lean: -24,
      head: [-1, -4],
      nod: -22,
      jaw: 1,
      mouth: 'open',
      eyes: 'shut',
      earN: 30,
      earF: 30,
      fN: [8, 13, -60],
      fF: [5, 15, -50],
      hN: [3, 0, 0],
      hF: [3, 0, 0],
      quiff: [14, 0, 0],
      kerchief: [85, 1.5, 1],
      tail: [20, -260, 1],
      stalk: [1, 0, -1]
    }),
    P({
      x: -4,
      y: 7,
      lean: -30,
      head: [-2, -6],
      nod: -30,
      jaw: 1,
      mouth: 'open',
      eyes: 'shut',
      earN: 40,
      earF: 40,
      breath: 1,
      fN: [10, 17, -70],
      fF: [7, 19, -60],
      hN: [4, 0, 0],
      hF: [4, 0, 0],
      quiff: [4, 0, 0],
      kerchief: [95, 1.5, 2],
      tail: [10, -260, 2],
      stalk: [1, 0, -1]
    }),
    P({
      ...stance,
      y: -4,
      lean: 7,
      squash: 3,
      head: [3, 6],
      nod: 14,
      fN: [3, 0, 0],
      fF: [2, 0, 0],
      dust: 1.4,
      steam: 0.6,
      earN: 20,
      quiff: [-20, 0, 0],
      kerchief: [30, 2, 3],
      tail: [50, -260, 3]
    }),
    P({
      ...stance,
      y: -3,
      lean: 5,
      squash: 2,
      head: [3, 4],
      nod: 10,
      fN: [3, 0, 0],
      fF: [2, 0, 0],
      dust: 0.8,
      steam: 1,
      earN: 8,
      quiff: [12, 0, 0],
      kerchief: [70, 1.6, 4],
      tail: [45, -260, 4]
    }),
    P({
      ...stance,
      y: -1,
      lean: 2,
      squash: 0.5,
      head: [1, 1],
      nod: 4,
      fN: [3, 0, 0],
      fF: [2, 0, 0],
      steam: 0.5,
      quiff: [-5, 0, 0],
      kerchief: [55, 1.2, 5],
      tail: [40, -260, 5]
    }),
    P({
      ...stance,
      lean: 1,
      breath: 0.6,
      head: [1, 2],
      nod: 3,
      fN: [3, 0, 0],
      fF: [2, 0, 0],
      steam: 0.2,
      quiff: [2, 0, 0],
      kerchief: [62, 1, 6],
      tail: [42, -260, 6]
    })
  ]
})

/** hurt: a squeal with the head thrown up and the stalk flying, a recoil, a snort. */
const hurt = memo(() => [
  P({
    x: -3,
    y: 2,
    lean: -10,
    head: [-2, -5],
    nod: -28,
    jaw: 0.9,
    mouth: 'open',
    eyes: 'hurt',
    earN: 45,
    earF: 45,
    fN: [-2, 4, 20],
    quiff: [16, 0, 0],
    kerchief: [20, 2, 1],
    tail: [0, -200, 1],
    stalk: [0, 0.4, -1]
  }),
  P({
    x: -6,
    y: -1,
    lean: 5,
    head: [0, 4],
    nod: 12,
    jaw: 0.3,
    mouth: 'open',
    eyes: 'shut',
    earN: 50,
    earF: 40,
    fN: [-5, 0, 0],
    hN: [-2, 0, 0],
    quiff: [-14, 0, 0],
    kerchief: [80, 1.6, 2.5],
    tail: [50, -260, 2],
    stalk: [0, 0.85, -1]
  }),
  P({
    x: -3,
    y: -1,
    lean: 3,
    head: [1, 2],
    nod: 6,
    mouth: 'grit',
    eyes: 'narrow',
    earN: 15,
    earF: 12,
    fN: [-2, 0, 0],
    steam: 0.8,
    quiff: [5, 0, 0],
    kerchief: [60, 1.2, 4],
    tail: [40, -260, 3],
    stalk: [0, 1, -1]
  })
])

/** windup: head down to the ground, rump up, a front hoof scraping back with dust, steam; trembles. */
const windup = memo(() => {
  const set: Partial<BoarPose> = {
    y: -2,
    lean: 12,
    head: [5, 4],
    nod: 34,
    eyes: 'glare',
    mouth: 'grit',
    earN: 50,
    earF: 50,
    fF: [4, 0, 0],
    hN: [2, 0, 0],
    hF: [2, 0, 0],
    tail: [-10, -260, 0],
    kerchief: [70, 1, 0]
  }
  return [
    P({
      x: -1,
      y: -2,
      lean: 8,
      head: [3, 7],
      nod: 24,
      eyes: 'narrow',
      mouth: 'grit',
      earN: 30,
      earF: 30,
      fN: [3, 4, 30],
      hN: [1, 0, 0],
      hF: [1, 0, 0],
      quiff: [12, 0, 0],
      tail: [20, -260, 0],
      kerchief: [80, 1.2, 1]
    }),
    P({ ...set, x: -2, fN: [-8, 0, 0], dust: 1, steam: 0.5, quiff: [-6, 0, 0], kerchief: [60, 1.2, 2] }),
    P({ ...set, x: -1, head: [5, 3.4], fN: [-4, 2, 20], dust: 0.6, steam: 1, quiff: [2, 0, 0], tail: [-10, -260, 2] }),
    P({
      ...set,
      x: -3,
      head: [5.6, 3.4],
      fN: [-9, 0, 0],
      dust: 1.3,
      steam: 0.3,
      quiff: [-2, 0, 0],
      tail: [-6, -260, 4]
    })
  ]
})

/**
 * attack: the charge, a heavy rocking gallop — the fronts reach and land together, the hinds gather under and
 * drive; the head low and level like a ram, quiff and neckerchief blown back, dust at the hooves.
 */
const attack = memo(() => {
  const N = 6
  const legs: [Hoof, Hoof, Hoof, Hoof, number, number, number, number][] = [
    // fN, fF, hN, hF, y, lean, squash, dust
    [[17, 8, -40], [13, 9, -35], [-14, 8, 50], [-11, 9, 45], 5, -4, 1.8, 0],
    [[12, 0, 0], [8, 0, 0], [-13, 10, 70], [-10, 11, 60], 1, 6, 1, 1],
    [[-2, 0, 0], [-5, 2, 10], [2, 10, -20], [5, 11, -15], 0, 8, -1.6, 0],
    [[-12, 7, 60], [-9, 6, 50], [10, 0, 0], [13, 0, 0], 1, -2, -1, 0.8],
    [[0, 11, 30], [3, 10, 20], [-2, 0, 0], [1, 0, 0], 3, -7, 0, 0.4],
    [[10, 10, -15], [7, 9, -10], [-10, 3, 40], [-7, 4, 30], 5, -6, 1.6, 0]
  ]
  const bob = legs.map((l) => l[4])
  const headLag = lag(bob, { stiffness: 0.5, damping: 0.6, loop: true })
  const qLag = lag(bob, { stiffness: 0.35, damping: 0.5, loop: true })
  return legs.map(([fN, fF, hN, hF, y, lean, squash, dust], i) =>
    P({
      x: 2,
      y,
      lean: lean + 4,
      squash,
      fN,
      fF,
      hN,
      hF,
      dust,
      head: [4, 6 - headLag[i] * 0.8],
      nod: 28 + headLag[i] * 2,
      mouth: 'grit',
      eyes: 'glare',
      earN: 70,
      earF: 70,
      steam: i === 1 ? 0.6 : i === 2 ? 0.9 : 0,
      quiff: [-16 - qLag[i] * 4, 0, 0],
      tail: [-30 + Math.sin(phase(i, N)) * 8, -200, phase(i, N) * 2],
      kerchief: [-8 + Math.sin(phase(i, N) + 1) * 6, 2.4, phase(i, N) * 2],
      stalk: [-0.5, 0, -1]
    })
  )
})

/** stunned: sat back on his haunches, front legs splayed, head wobbling in a circle, quiff flopped over an eye. */
const stunned = memo(() => {
  const N = 6
  return Array.from({ length: N }, (_, i) => {
    const a = phase(i, N)
    return P({
      x: 2,
      y: -9,
      lean: -24,
      head: [1 + Math.cos(a) * 2.2, 9 + Math.sin(a) * 1.6],
      nod: 18 + Math.sin(a) * 10,
      jaw: 0.35,
      mouth: 'open',
      tongue: true,
      eyes: 'dizzy',
      earN: 40 + Math.sin(a) * 12,
      earF: 10 + Math.cos(a) * 10,
      fN: [8, 0, -10],
      fF: [-6, 0, 10],
      hN: [12, 4, -78],
      hF: [16, 4, -78],
      tail: [80, -120, a],
      quiff: [Math.sin(a - 1) * 8, 1, 0],
      kerchief: [90, 0.6, a],
      stalk: [Math.sin(a) * 0.5, 0, -1]
    })
  })
})

/** recover: standing with the head hanging, sides heaving, tongue out, the quiff limp. */
const recover = memo(() =>
  [0, 1, 0.3, 0.85].map((pant, i) =>
    P({
      y: -1 - pant,
      lean: 4,
      breath: pant,
      head: [2, 10 - pant * 1.4],
      nod: 24 - pant * 4,
      jaw: 0.4 + pant * 0.3,
      mouth: 'open',
      tongue: true,
      eyes: 'tired',
      earN: 40,
      earF: 35 + pant * 4,
      tail: [70, -150, i * 1.5],
      quiff: [10 + pant * 4, 0.5, 0],
      kerchief: [85 + pant * 4, 0.6, i * 1.6],
      stalk: [-0.5, 0, -1]
    })
  )
)

/** defeat: the jolt, a stagger, the legs give way, he crashes onto his side with a bounce and lies out cold. */
const defeat = memo(() => {
  const lying: Partial<BoarPose> = {
    x: -6,
    y: -12,
    lean: 0,
    squash: 1.5,
    roll: 1,
    head: [3, 5],
    nod: 12,
    jaw: 0.3,
    mouth: 'open',
    tongue: true,
    eyes: 'dizzy',
    earN: 60,
    earF: 40,
    fN: [16, 6.5, -90],
    fF: [12, 9, -90],
    hN: [30, 5.5, -90],
    hF: [26, 8, -90],
    tail: [0, -120, 0],
    quiff: [10, 0, 1],
    kerchief: [100, 0.4, 0],
    stalk: [0, 1, 98]
  }
  return [
    P({
      x: -2,
      y: 3,
      lean: -10,
      head: [-2, -4],
      nod: -20,
      eyes: 'wide',
      jaw: 0.7,
      mouth: 'open',
      earN: -10,
      earF: -8,
      fN: [-2, 3, 20],
      quiff: [18, 0, 0],
      kerchief: [10, 2, 0],
      stalk: [0, 0.4, -1]
    }),
    P({
      x: -5,
      y: -1,
      lean: 6,
      head: [0, 5],
      nod: 20,
      eyes: 'dizzy',
      jaw: 0.4,
      mouth: 'open',
      tongue: true,
      earN: 40,
      earF: 30,
      fN: [-6, 0, 0],
      fF: [4, 0, 0],
      hN: [3, 0, 0],
      quiff: [-16, 0.2, 0],
      kerchief: [70, 1.6, 1.2],
      stalk: [0, 0.8, -1]
    }),
    P({
      x: -5,
      y: -8,
      lean: 10,
      head: [3, 1],
      nod: 22,
      eyes: 'dizzy',
      jaw: 0.4,
      mouth: 'open',
      tongue: true,
      earN: 50,
      earF: 40,
      fN: [8, 0, -40],
      fF: [4, 0, -30],
      hN: [6, 1, -60],
      hF: [8, 1, -60],
      quiff: [12, 0.4, 0.2],
      kerchief: [20, 1.8, 2.4],
      stalk: [0, 1, 98]
    }),
    P({ ...lying, y: -13, squash: 2.6, eyes: 'shut', quiff: [16, 0, 0.8], kerchief: [-10, 1.8, 3.4] }),
    P({
      ...lying,
      y: -9,
      squash: -0.5,
      head: [5, 3],
      nod: 10,
      fN: [14, 10, -75],
      hN: [28, 9, -75],
      eyes: 'shut',
      quiff: [-8, 0, 0.6],
      kerchief: [40, 1.6, 4.4]
    }),
    P({ ...lying, y: -12.5, squash: 2, quiff: [14, 0, 1], kerchief: [110, 1, 5.4] }),
    P({ ...lying, stars: 0, kerchief: [96, 0.6, 6.2] }),
    P({ ...lying, stars: 1 / 6, breath: 0.6, quiff: [12, 0, 1], kerchief: [102, 0.6, 7.4] })
  ]
})

const draw = (poses: BoarPose[]) => poses.map(drawBoar)

export const sheets: SheetModule = {
  boarBoss: () => ({
    idle: lazyAnim(() => draw(idle()), 8, true),
    intro: lazyAnim(() => draw(intro()), 10, false, { sustain: 2 }),
    hurt: lazyAnim(() => draw(hurt()), 12, false),
    defeat: lazyAnim(() => draw(defeat()), 10, false, { sustain: 2 }),
    windup: lazyAnim(() => draw(windup()), 10, false, { sustain: 2 }),
    attack: lazyAnim(() => draw(attack()), 16, true),
    stunned: lazyAnim(() => draw(stunned()), 8, true),
    recover: lazyAnim(() => draw(recover()), 6, true)
  })
}

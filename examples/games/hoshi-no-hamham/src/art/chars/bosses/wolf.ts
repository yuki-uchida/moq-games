/**
 * おおかみ檄 (`wolfBoss`): the leader of the pursuers, a lean forest wolf built on the rig toolkit. Big head with a
 * long muzzle and a jaw that opens on teeth, a deep chest under a thick ruff, narrow waist, strong haunches, a bushy
 * tail with a pale tip, the scar over and under the near eye and the gang's red scarf with one long end that streams
 * behind him. 128×128, facing right, feet on (64, 120).
 *
 * Rendering (CHARACTERS.md "Big furry bodies"): chest, ribs, haunch, neck and the near upper legs are ONE silhouette
 * shaded once, with a dark saddle (`mantle`), a pale underside, fur teeth on the shadow and fur-lock stamps; only
 * what hangs free below the body (forearm, shank, pastern, paw) is a part of its own.
 *
 * Depth (back to front): dust, far legs, tail, body, near lower legs, ruff, scarf end, scarf band, far ear, mouth,
 * lower jaw, head, face, near ear, stars.
 */
import type { SheetModule } from '../../module'
import { TAU, ease, footPath, footfall, lag, lerp, type FootStep, type FootfallModule } from '../../motion'
import { C, R, ramp } from '../../palette'
import { Painter, Raster, farRamp, type Pt, type Ramp } from '../../raster'
import {
  Frame,
  capsule,
  carve,
  cel,
  fill,
  half,
  joint,
  mantle,
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
  type Shape
} from '../../rig'
import { lazyAnim, memo } from '../../sheet'

const FUR = R.wolfGray
const FAR = farRamp(FUR)
/** The pale chest, belly, cheek, muzzle underside and tail tip. */
const PALE = ramp('#ffffff', '#e9edf6', '#bcc3d6', '#8088a4', '#1c1830')
/** The dark saddle along the back, the crown, the ears and the top of the tail. */
const SADDLE = ramp('#a3acc6', '#737d9c', '#525a78', '#373c56', '#1c1830')
const BAND = R.bandana
const GOLD = R.gold
const SCAR = R.fruitRed
/** The head is drawn larger than nature. */
const HS = 1.16

type Paw = readonly [number, number, number]
type Eyes = 'glare' | 'narrow' | 'wide' | 'shut' | 'hurt' | 'dizzy' | 'tired'
type Mouth = 'shut' | 'snarl' | 'open'

export interface WolfPose {
  /** Whole figure forward (+) / up (+). */
  x: number
  y: number
  /** Body tilt in degrees (front down +) and stretch (+ longer and flatter). */
  lean: number
  squash: number
  /** Chest breathing 0..1. */
  breath: number
  /** Head offset from its seat on the neck and nod in degrees (nose down +). */
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
  /** Paws relative to their rest place: forward, lift, turn in degrees (front: + folds back; hind: + kicks back). */
  fN: Paw
  fF: Paw
  hN: Paw
  hF: Paw
  /** Tail: direction (0 = straight back, + down), curl along its length, sway phase. */
  tail: readonly [number, number, number]
  /** Scarf end: direction (0 = straight back, + down), length, ripple, phase, droop toward the end (degrees). */
  scarf: readonly [number, number, number, number, number]
  /** Ruff bristling outwards (0 = calm). */
  ruff: number
  /** Lying on the side 0..1 (the pale underside shows). */
  roll: number
  /** Stars circling over the head: phase 0..1, −1 = none. */
  stars: number
  /** Dust kicked up by a scraping front paw 0..1. */
  dust: number
}

export const wolfPose = (p: Partial<WolfPose> = {}): WolfPose => ({
  x: 0,
  y: 0,
  lean: 0,
  squash: 0,
  breath: 0,
  head: [0, 0],
  nod: 10,
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
  tail: [30, 45, 0],
  scarf: [6, 32, 1.2, 0, 28],
  ruff: 0,
  roll: 0,
  stars: -1,
  dust: 0,
  ...p
})

/** Rest places of the paws (x relative to the anchor). */
const REST = { fN: 19, fF: 12, hN: -22, hF: -16 } as const

// ------------------------------------------------------------------------------------------------ stamps

const EYE_KEY = { K: C.black, w: C.white, y: GOLD[1], o: GOLD[2], B: FUR[3], i: C.inkCool }
const EYES: Record<Eyes, readonly string[]> = {
  glare: ['BBBB.....', '.BBBBBBB.', '..KKKKBBB', '.KwwyyKB.', '.KwyyKyK.', '..KKKKK..'],
  narrow: ['BBBB.....', '.BBBBBBB.', '..BBBBBBB', '.KKKKKKK.', '.KwyyKyK.', '..KKKKK..'],
  wide: ['..BBB....', '.B...BB..', '..KKKKK..', '.KwwyyyK.', '.KwyyKyyK', '.KyyyKyoK', '..KKKKKK.'],
  shut: ['BBBB.....', '.BBBBBBB.', '....BBBBB', '.........', '.iiiiiii.', '..i...i..'],
  hurt: ['.B.....B.', '..B...B..', '...B.B...', 'ii.....ii', '..iii....', '....iiiii', '..iii....'],
  dizzy: ['.........', '..iiiii..', '.i.....i.', '.i.iii.i.', '.i.i.i.i.', '.i...i.i.', '..iii..i.'],
  tired: ['.........', 'BBBBBBBB.', '.BBBBBBBB', '.iiiiiiii', '.KyyyKyK.', '..KKKKK..']
}
/** The scar: a red seam above the near eye and a shorter one below it. */
const SCAR_UP = ['r.', 'r.', 'rr', '.r', '.r']
const SCAR_DOWN = ['r.', 'rr', '.r']
const NOSE = ['.KKK', 'KhKK', 'KKKK', '.KK.']
/** Upper teeth between the lips (two fangs at the ends). */
const TEETH = ['w.w.w.w.w.w', 'W.........W']
const STAR = ['..y..', '.yYy.', 'yyYyy', '.yYy.', '..y..']
const STAR_SMALL = ['.y.', 'yYy', '.y.']
/** Fur locks that break a silhouette. */
const TUFT_BACK = ['...ff', '..fff', '.ffff', 'ffff.', 'fff..']
const TUFT_DOWN = ['fffff', 'fffff', '.fff.', '.ff..', '..f..']
const TUFT_UP = ['..f..', '.ff..', '.fff.', 'fffff']

// ------------------------------------------------------------------------------------------------ helpers

const ID = Frame.at(0, 0)

/** A paw on its own frame (origin under the pads): toes forward, flat where it stands. */
const pawShape = (grounded: boolean, big: number): Shape => {
  const s = union(oval(1.8 + big, -2.4, 5 + big, 3), oval(-1.8, -2.8, 3.2, 2.8))
  return grounded ? overlap(s, half([0, -0.4], 0, -1)) : s
}

/** A path from `from` heading in direction `deg` (0 = back, + down), bending by `curl` degrees along its length. */
function bentPath(from: Pt, deg: number, curl: number, len: number, wobble: (s: number) => number): Pt[] {
  const pts: Pt[] = [from]
  let [x, y] = from
  const n = 5
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
 * White fur on the very edge of a part takes the pale base colour instead: the outline next to it is a selout two
 * ramp steps darker, and two steps below white is still light. Candidate for the toolkit (`cel` option).
 */
function dimEdge(l: Raster) {
  const b = l.bounds()
  if (!b) return
  const src = l.clone()
  for (let y = b.y; y < b.y + b.h; y++)
    for (let x = b.x; x < b.x + b.w; x++)
      if (
        src.get(x, y) === PALE[0] &&
        !(src.get(x - 1, y) && src.get(x + 1, y) && src.get(x, y - 1) && src.get(x, y + 1))
      )
        l.set(x, y, PALE[1])
}

/**
 * A muscle crease: a soft shadow strip just inside one edge of an upper limb (side +1 = the screen-right side of
 * the bone from `a` to `b`, −1 = the left side).
 */
function crease(a: Pt, b: Pt, ra: number, rb: number, side: 1 | -1): { f: Frame; s: Shape } {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
  const n: Pt = [((-(b[1] - a[1]) / d) * side) as number, (((b[0] - a[0]) / d) * side) as number]
  const pa: Pt = [a[0] + n[0] * (ra - 3), a[1] + n[1] * (ra - 3)]
  const pb: Pt = [b[0] + n[0] * (rb - 2.4), b[1] + n[1] * (rb - 2.4)]
  return { f: ID, s: overlap(capsule(pa, pb, 3, 2.3), half(pa, n[0], n[1])) }
}

// ------------------------------------------------------------------------------------------------ drawing

export function drawWolf(p: WolfPose): Raster {
  const g = new Painter(128, 128, { soft: true })
  const k = 1 + p.squash * 0.04
  const ground = Frame.at(62 + p.x, 120)
  const root = ground.child(0, -p.y)
  const torso = root.child(-4, -31, p.lean, k, 1 / k)
  const head = torso.child(31 + p.head[0], -16 + p.head[1], p.nod - 10 - p.lean * 0.7, HS)
  const br = p.breath
  const chestAt = torso.pt(13, -4)

  // ---- leg geometry (the rig's two-bone legs)
  const legGeo = (front: boolean, paw: Paw, rest: number, near: boolean) => {
    const f = ground.child(rest + paw[0], -paw[1], paw[2])
    const grounded = paw[1] < 0.6 && Math.abs(paw[2]) < 10
    if (front) {
      const s = torso.pt(near ? 11 : 6, 4)
      const end = f.pt(-1.4, -6.5)
      return { f, grounded, s, end, mid: joint(s, end, 13.5, 12, 1).mid }
    }
    const s = torso.pt(near ? -17 : -13, -1)
    const end = f.pt(-3.4, -10)
    return { f, grounded, s, end, mid: joint(s, end, 14, 12, -1).mid }
  }
  type Leg = ReturnType<typeof legGeo>
  const legFN = legGeo(true, p.fN, REST.fN, true)
  const legFF = legGeo(true, p.fF, REST.fF, false)
  const legHN = legGeo(false, p.hN, REST.hN, true)
  const legHF = legGeo(false, p.hF, REST.hF, false)

  /** The body silhouette in torso units (the near upper legs are added in screen space). */
  const neckEnd = torso.local(...head.pt(-6, 1.7))
  const bodyShape = union(
    oval(13, -4 - br * 0.8, 16 + br * 0.3, 17 + br * 0.8),
    capsule([10, -5 - br * 0.6], [-13, -2], 14, 10),
    oval(-17, -1, 12.5, 12.5),
    capsule([18, -9 - br * 0.5], neckEnd, 12.5, 10)
  )

  /** Forearm or shank, pastern and paw: what hangs free below the body. */
  const lowerLeg = (l: Raster, leg: Leg, front: boolean, tone: Ramp, r: number) => {
    fill(l, ID, capsule(leg.mid, leg.end, r, r * 0.72), tone[1])
    fill(l, ID, capsule(leg.end, leg.f.pt(0.3, -3), r * 0.68, r * 0.62), tone[1])
    const a = Math.atan2(leg.end[1] - leg.mid[1], leg.end[0] - leg.mid[0])
    if (front)
      // the feathering at the back of the forearm
      fill(
        l,
        Frame.at(leg.mid[0], leg.mid[1], (a * 180) / Math.PI),
        polygon([
          [2, 2.5],
          [4, 7.5],
          [7, 3.5]
        ]),
        tone[1]
      )
    // the tuft at the back of the hock
    else
      fill(
        l,
        Frame.at(leg.end[0], leg.end[1], (a * 180) / Math.PI),
        polygon([
          [-6, 1.5],
          [0.5, 4.6],
          [1, 0]
        ]),
        tone[1]
      )
    fill(l, leg.f, pawShape(leg.grounded, front ? 0.4 : 0.8), tone[1])
    if (p.roll > 0.5) tint(l, leg.f, oval(0, -2.5, 5, 3), tone === FUR ? PALE[1] : PALE[2])
  }
  const claws = (l: Raster, leg: Leg, front: boolean, tone: Ramp, paw: Paw) => {
    if (Math.abs(paw[2]) < 45) stampAt(l, leg.f, ['k.k', 'k.k'], front ? 4.4 : 5, -2.6, { k: tone[3] })
  }

  // ---- far legs (a ramp step darker), whole, behind everything
  const farLeg = (leg: Leg, front: boolean, paw: Paw) => (l: Raster) => {
    fill(l, ID, capsule(leg.s, leg.mid, front ? 7 : 8, front ? 4.8 : 5.2), FAR[1])
    lowerLeg(l, leg, front, FAR, front ? 4.6 : 4.8)
    smooth(l)
    cel(l, { shade: 2.2, rim: 1 })
    shadow(l, torso.moved(0, 2), bodyShape)
    claws(l, leg, front, FAR, paw)
  }
  g.add(-4, farLeg(legHF, false, p.hF))
  g.add(-4, farLeg(legFF, true, p.fF))

  // ---- tail: bushy, pale tip, locks along the underside
  g.add(-3, (l) => {
    const base = torso.pt(-25, -7)
    const sway = (s: number) => Math.sin(p.tail[2] - s * 2.6) * s * 2.2
    const path = bentPath(base, p.tail[0], p.tail[1], 25, sway)
    ribbon(l, path, (t) => 8 + Math.sin(t * Math.PI) * 6 - t * 2, FUR[1])
    const end = path[path.length - 1]
    const pre = path[Math.max(0, path.length - 7)]
    tint(l, Frame.at(end[0] * 0.8 + pre[0] * 0.2, end[1] * 0.8 + pre[1] * 0.2), oval(0, 0, 7.5, 7.5), PALE[1])
    for (const [at, rows, side] of [
      [0.45, TUFT_DOWN, 1],
      [0.25, TUFT_DOWN, 1],
      [0.4, TUFT_UP, -1]
    ] as const) {
      const i = Math.round(at * (path.length - 1))
      const a = (heading(path, i) * Math.PI) / 180
      const w = 8 + Math.sin(at * Math.PI) * 6 - at * 2
      // the side of the path that faces down on screen (+1) or up (−1)
      const nx = -Math.sin(a)
      const ny = Math.cos(a)
      const flip = ny >= 0 ? side : -side
      stampAt(l, ID, rows, path[i][0] + nx * flip * (w / 2 - 0.5), path[i][1] + ny * flip * (w / 2 - 0.5), {
        f: FUR[1]
      })
    }
    smooth(l)
    mantle(l, FUR[1], SADDLE[1], { depth: 4, tooth: 2, pitch: 4, origin: base })
    cel(l, { shade: 4.5, deep: 1.6, rim: 1.6, tooth: 2, pitch: 4, origin: base })
    dimEdge(l)
  })

  // ---- the body: chest, ribs, waist, haunch, neck and the near upper legs as ONE silhouette, shaded once
  g.add(0, (l) => {
    fill(l, torso, bodyShape, FUR[1])
    fill(l, ID, capsule(legFN.s, legFN.mid, 8.5, 5.4), FUR[1])
    fill(l, ID, capsule(legHN.s, legHN.mid, 9, 5.8), FUR[1])
    // pale chest and belly line (more of the belly shows when he lies on his side)
    tint(l, torso, union(oval(26, 1 - br * 0.6, 7, 10.5), capsule([20, 11 - br * 0.4], [-7, 8], 4.5, 3)), PALE[1])
    // hackles along the withers and locks on the rump and the back of the thigh
    stampAt(l, torso, TUFT_UP, 10.5, -22.5 - br, { f: FUR[1] })
    stampAt(l, torso, TUFT_UP, 4.5, -22, { f: FUR[1] })
    stampAt(l, torso, TUFT_UP, -1.5, -20, { f: FUR[1] })
    stampAt(l, torso, TUFT_BACK, -26.5, -9.5, { f: FUR[1] })
    stampAt(l, torso, TUFT_DOWN, -25.5, 10, { f: FUR[1] })
    smooth(l)
    mantle(l, FUR[1], SADDLE[1], { depth: 8, tooth: 4, pitch: 5, origin: chestAt })
    cel(l, { shade: 10, deep: 3.5, rim: 2.2, tooth: 3, pitch: 5, origin: chestAt })
    dimEdge(l)
    if (p.roll > 0) {
      // lying on his side: the pale belly turns toward the viewer and catches the light
      const belly = oval(-1, 5, 21 * p.roll, 7 * p.roll)
      tint(l, torso, belly, PALE[1])
      shadow(l, torso, overlap(belly, half([0, 9.5], 0, 1)))
    }
    // muscles are soft shadows, not lines: behind the shoulder, in front of the thigh
    const sh = crease(legFN.s, legFN.mid, 8.5, 5.4, legFN.mid[1] >= legFN.s[1] ? 1 : -1)
    shadow(l, sh.f, sh.s)
    const th = crease(legHN.s, legHN.mid, 9, 5.8, legHN.mid[1] >= legHN.s[1] ? -1 : 1)
    shadow(l, th.f, th.s)
  })

  // ---- near legs below the body
  g.add(1, (l) => {
    lowerLeg(l, legHN, false, FUR, 5.2)
    smooth(l)
    cel(l, { shade: 2.2, rim: 1 })
    claws(l, legHN, false, FUR, p.hN)
  })
  g.add(1, (l) => {
    lowerLeg(l, legFN, true, FUR, 5)
    smooth(l)
    cel(l, { shade: 2.2, rim: 1 })
    claws(l, legFN, true, FUR, p.fN)
  })

  // ---- the head's shapes (head units: the jaw hinge sits near (5, 6.5))
  const skull = oval(1.5, -4, 12.5, 11.5)
  const muzzle = capsule([7, -0.5], [22, 2], 7, 4.4)
  const cheek = oval(-4.5, 3, 7, 6.5)
  const headShape = union(skull, muzzle, cheek)

  // ---- ruff: a paler mane around the neck with a toothed lower edge
  g.add(2, (l) => {
    const kk = 1 + p.ruff * 0.06
    const at = (u: number, v: number): [number, number] => [23 + (u - 23) * kk, -8 + (v + 8) * kk]
    fill(l, torso, union(oval(23, -10 - br * 0.6, 12 * kk, 12.5 * kk), oval(16, -4 - br * 0.6, 8 * kk, 8 * kk)), FUR[1])
    tint(l, torso, oval(28, -5 - br * 0.6, 8, 9), PALE[1])
    stampAt(l, torso, TUFT_DOWN, ...at(14.5, 4.5 - br * 0.6), { f: FUR[1] })
    stampAt(l, torso, TUFT_DOWN, ...at(20.5, 4 - br * 0.6), { f: FUR[1] })
    stampAt(l, torso, TUFT_DOWN, ...at(27.5, 5.5 - br * 0.6), { f: PALE[1] })
    stampAt(l, torso, TUFT_UP, ...at(17.5, -23), { f: FUR[1] })
    stampAt(l, torso, TUFT_BACK, ...at(10.5, -12), { f: FUR[1] })
    smooth(l)
    const o = torso.pt(23, -10)
    mantle(l, FUR[1], SADDLE[1], { depth: 5, tooth: 3, pitch: 4, origin: o })
    cel(l, { shade: 5, deep: 1.6, rim: 1.8, tooth: 2.5, pitch: 4, origin: o })
    dimEdge(l)
    shadow(l, head.moved(-0.5, 2.5), headShape)
  })

  // ---- scarf: one long end of cloth widening to a swallowtail, a band across the ruff, the knot behind the neck
  const knot = torso.pt(14, -19.5)
  const wave = (s: number) => Math.sin(p.scarf[3] - s * 4) * p.scarf[2] * s * 2
  g.add(2.5, (l) => {
    const path = bentPath(knot, p.scarf[0], p.scarf[4], p.scarf[1] * 1.3, wave)
    ribbon(l, path, (t) => 4.6 + t * 2.6, BAND[1])
    const n = path.length - 1
    const end = Frame.at(path[n][0], path[n][1], heading(path, n))
    carve(
      l,
      end,
      polygon([
        [5, -4.2],
        [-2.5, 0],
        [5, 4.2]
      ])
    )
    cel(l, { shade: 1.8, rim: 1.2 })
    // a fold line where the cloth turns
    for (let i = Math.round(n * 0.38); i <= Math.round(n * 0.6); i++) {
      const a = (heading(path, i) * Math.PI) / 180
      const s = Math.cos(a) < 0 ? 1 : -1
      l.paint(path[i][0] - Math.sin(a) * s * 0.8, path[i][1] + Math.cos(a) * s * 0.8, BAND[2])
    }
  })
  g.add(3, (l) => {
    ribbon(l, spline([knot, torso.pt(15.5, -10), torso.pt(20, -1.5)]), (t) => 5.4 - t * 0.6, BAND[1])
    fill(l, Frame.at(knot[0], knot[1]), oval(0, 0, 3.4, 3.4), BAND[1])
    cel(l, { shade: 1.8, rim: 1.2 })
    shadow(l, head.moved(0, 1.5), skull)
  })

  // ---- far ear (behind the skull)
  const earF = head.child(7, -10, -p.earF, 1, 1 - Math.max(0, p.earF) * 0.004)
  g.add(3.5, (l) => {
    fill(
      l,
      earF,
      polygon([
        [-5, 0],
        [1.5, -16],
        [5, 0]
      ]),
      FAR[1]
    )
    tint(
      l,
      earF,
      polygon([
        [-1.5, -1.5],
        [1.2, -10.5],
        [2.8, -1.5]
      ]),
      FAR[3]
    )
    cel(l, { shade: 1.5 })
  })

  // ---- mouth and lower jaw
  const jawDeg = p.mouth === 'shut' ? 0 : p.mouth === 'snarl' ? 3 : p.jaw * 32
  const jaw = head.child(5, 6.5, jawDeg)
  const open = p.mouth === 'open' && p.jaw > 0.08
  if (open)
    g.add(
      3.7,
      (l) => {
        fill(l, ID, polygon([head.pt(5, 4), head.pt(22.5, 4.6), jaw.pt(15, -0.6), jaw.pt(0, -1)]), C.mouth)
      },
      false
    )
  g.add(3.8, (l) => {
    fill(l, jaw, capsule([0, 0], [14.5, 2.5], 3.2, 2.2), PALE[1])
    cel(l, { shade: 1.4 })
    if (open) stampAt(l, jaw, ['w.w', 'W.W'], 12, -1.6, { w: C.white, W: PALE[2] })
  })
  // the tongue lolls out over the lower lip
  if (p.tongue)
    g.add(3.85, (l) => {
      fill(l, jaw, union(capsule([7.5, -1.2], [10.5, 3.5], 2.1, 2.1), oval(10.8, 5.2, 2.3, 2.3)), C.tongue)
      tint(l, jaw, capsule([8.6, 0.5], [10.8, 5.5], 0.5, 0.5), C.mouth)
    })

  // ---- head: skull, cheek and long muzzle as one silhouette
  const headAt = head.pt(1.5, -4)
  g.add(4, (l) => {
    fill(l, head, headShape, FUR[1])
    // pale cheek and muzzle underside
    tint(l, head, union(capsule([7, 4.5], [22, 5.5], 2.6, 2.2), oval(-3, 5.5, 6.5, 4.6)), PALE[1])
    stampAt(l, head, TUFT_BACK, -10, 6.5, { f: FUR[1] })
    stampAt(l, head, TUFT_DOWN, -4.5, 11.5, { f: PALE[1] })
    if (p.mouth === 'snarl') tint(l, head, capsule([11, -2.6], [15, -1.8], 0.8, 0.8), FUR[2])
    smooth(l)
    mantle(l, FUR[1], SADDLE[1], { depth: 5, tooth: 2, pitch: 4, origin: headAt })
    cel(l, { shade: 4.8, deep: 1.6, rim: 1.8, tooth: 1.5, pitch: 4, origin: headAt })
    dimEdge(l)
  })

  // ---- face
  g.add(
    4.2,
    (l) => {
      stampAt(l, head, EYES[p.eyes], 7, -4.5, EYE_KEY)
      stampAt(l, head, SCAR_UP, 4.5, -11.5, { r: SCAR[1] })
      stampAt(l, head, SCAR_DOWN, 7.5, 1.5, { r: SCAR[1] })
      stampAt(l, head, NOSE, 25.5, 0.5, { K: C.black, h: FUR[1] })
      const tooth = { w: C.white, W: PALE[2] }
      if (p.mouth === 'shut') {
        // the lip line and one fang over it
        stampAt(l, head, ['KK.........', '.KKKKKKKKKK'], 15, 5, { K: C.inkCool })
        stampAt(l, head, ['w', 'W'], 18.5, 6.8, tooth)
      } else stampAt(l, head, TEETH, 14.5, 6.5, tooth)
    },
    false
  )

  // ---- near ear: a tall dark triangle with a darker bowl
  const earN = head.child(-4, -9.5, -p.earN, 1, 1 - Math.max(0, p.earN) * 0.004)
  g.add(5, (l) => {
    fill(
      l,
      earN,
      polygon([
        [-6.5, 1.5],
        [-2, -18.5],
        [6.5, -1.5]
      ]),
      SADDLE[1]
    )
    tint(
      l,
      earN,
      polygon([
        [-2.5, -1],
        [-0.8, -12],
        [3.2, -2.5]
      ]),
      SADDLE[3]
    )
    cel(l, { shade: 1.6, rim: 1 })
  })

  // ---- stars over a knocked-out head, outlined
  if (p.stars >= 0)
    g.add(6, (l) => {
      const [cx, cy] = head.pt(-2, -20)
      for (let i = 0; i < 3; i++) {
        const a = (p.stars + i / 3) * TAU
        l.stamp(
          Math.sin(a) > 0 ? STAR : STAR_SMALL,
          Math.round(cx + Math.cos(a) * 12) - 2,
          Math.round(cy + Math.sin(a) * 3.5) - 2,
          { y: GOLD[1], Y: GOLD[0] }
        )
      }
    })

  // ---- dust from a scraping paw
  if (p.dust > 0)
    g.add(-7, (l) => {
      const [x, y] = ground.pt(REST.fN + p.fN[0] - 9, -2.5)
      fill(l, Frame.at(x, y), oval(0, 0, 3.6 + p.dust * 1.2, 2.4 + p.dust), R.dust[1])
      fill(l, Frame.at(x - 6 - p.dust * 3, y - 2 - p.dust), oval(0, 0, 2.4 + p.dust, 2 + p.dust), R.dust[1])
      cel(l, { shade: 1.2 })
    })

  return g.render()
}

// ------------------------------------------------------------------------------------------------ clips

const P = wolfPose
const phase = (i: number, n: number) => (i / n) * TAU

/** idle: prowling on the spot — weight shifting, chest breathing, head low and watching, an ear flick. */
const idle = memo(() => {
  const N = 6
  const breath = Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos(phase(i, N)))
  const shift = Array.from({ length: N }, (_, i) => Math.sin(phase(i, N)))
  const headLag = lag(breath, { stiffness: 0.4, damping: 0.5, loop: true })
  return Array.from({ length: N }, (_, i) =>
    P({
      x: Math.round(shift[i] * 1.2),
      y: -breath[i] * 0.8,
      lean: shift[i] * 1.5,
      breath: breath[i],
      head: [0, breath[i] * 1.2 + headLag[i]],
      nod: 10 + breath[i] * 2,
      earF: i === 3 ? 26 : i === 4 ? 10 : 0,
      eyes: i === 2 ? 'narrow' : 'glare',
      mouth: i >= 3 && i <= 4 ? 'snarl' : 'shut',
      tail: [30 + shift[i] * 4, 45, phase(i, N)],
      scarf: [6 + Math.sin(phase(i, N) + 1) * 4, 32, 1.2, phase(i, N), 28]
    })
  )
})

/** intro: crouch, throw the head up, howl (held, trembling), snap down into a snarling glare that stays alive. */
const intro = memo(() => [
  P({}),
  P({
    y: -4,
    lean: 6,
    head: [1, 4],
    nod: 22,
    eyes: 'narrow',
    earN: 25,
    earF: 25,
    ruff: 0.5,
    tail: [40, 40, 0.5],
    scarf: [10, 32, 1, 1, 34]
  }),
  P({
    y: 1,
    lean: -14,
    head: [-3, -8],
    nod: -45,
    jaw: 0.6,
    mouth: 'open',
    eyes: 'shut',
    earN: -24,
    earF: -20,
    ruff: 1,
    tail: [36, 40, 1.5],
    scarf: [-4, 32, 1.6, 2, 20]
  }),
  P({
    y: 2,
    lean: -20,
    head: [-4, -11],
    nod: -72,
    jaw: 1,
    mouth: 'open',
    eyes: 'shut',
    earN: -42,
    earF: -38,
    ruff: 1.8,
    breath: 1,
    tail: [44, 30, 2.5],
    scarf: [-8, 33, 1.8, 3.2, 16]
  }),
  P({
    y: 2,
    lean: -20,
    head: [-4.5, -10.5],
    nod: -70,
    jaw: 0.92,
    mouth: 'open',
    eyes: 'shut',
    earN: -38,
    earF: -42,
    ruff: 1,
    breath: 0.8,
    tail: [46, 30, 3.5],
    scarf: [-6, 33, 1.8, 4.4, 18]
  }),
  P({
    y: -2,
    lean: 8,
    head: [3, 4],
    nod: 16,
    mouth: 'snarl',
    eyes: 'glare',
    earN: 10,
    earF: 8,
    ruff: 1.4,
    tail: [30, 45, 4.5],
    scarf: [14, 32, 1.4, 5.4, 34]
  }),
  P({
    lean: 3,
    head: [1, 1],
    nod: 12,
    breath: 1,
    mouth: 'snarl',
    ruff: 0.8,
    tail: [32, 45, 5.5],
    scarf: [8, 32, 1.2, 6.4, 28]
  }),
  P({
    y: -0.6,
    lean: 3,
    head: [1, 2],
    nod: 13,
    breath: 0.2,
    mouth: 'snarl',
    ruff: 0.4,
    tail: [30, 45, 6.6],
    scarf: [6, 32, 1.2, 7.8, 28]
  })
])

/** hurt: flinch up and back with a yelp, recoil, angry recovery. */
const hurt = memo(() => [
  P({
    x: -3,
    y: 2,
    lean: -12,
    head: [-3, -4],
    nod: -15,
    jaw: 0.7,
    mouth: 'open',
    eyes: 'hurt',
    earN: 45,
    earF: 45,
    fN: [-3, 5, 30],
    ruff: 2,
    tail: [24, 20, 0],
    scarf: [-10, 32, 2, 1, 10]
  }),
  P({
    x: -6,
    y: -2,
    lean: 5,
    head: [-1, 3],
    nod: 18,
    jaw: 0.3,
    mouth: 'open',
    eyes: 'shut',
    earN: 50,
    earF: 45,
    fN: [-4, 0, 0],
    hN: [-2, 0, 0],
    ruff: 1,
    tail: [30, 30, 1.5],
    scarf: [20, 32, 1.5, 2.5, 20]
  }),
  P({
    x: -3,
    y: -1,
    lean: 4,
    head: [1, 2],
    nod: 14,
    mouth: 'snarl',
    earN: 15,
    earF: 12,
    fN: [-2, 0, 0],
    ruff: 1,
    tail: [30, 45, 3],
    scarf: [10, 32, 1.2, 4, 30]
  })
])

/** windup: drops low on the front legs, haunches up, a paw scraping, ears flat, eyes locked forward; trembles. */
const windup = memo(() => {
  const set: Partial<WolfPose> = {
    y: -2,
    lean: 16,
    head: [5, 6],
    nod: 2,
    eyes: 'glare',
    mouth: 'snarl',
    earN: 60,
    earF: 60,
    fF: [5, 0, 0],
    hN: [3, 0, 0],
    hF: [3, 0, 0],
    tail: [0, 6, 0]
  }
  return [
    P({
      x: -2,
      y: -3,
      lean: 9,
      head: [2, 5],
      nod: 8,
      eyes: 'narrow',
      mouth: 'snarl',
      earN: 45,
      earF: 45,
      fN: [3, 3.5, 40],
      hN: [2, 0, 0],
      hF: [2, 0, 0],
      ruff: 1,
      tail: [14, 14, 0],
      scarf: [-2, 32, 1.5, 0, 12]
    }),
    P({ ...set, x: -3, fN: [-5, 0, 6], dust: 1, ruff: 1.5, scarf: [-6, 34, 2, 1.5, 6] }),
    P({ ...set, x: -2.4, fN: [-2, 1.5, 20], dust: 0.5, ruff: 1.9, scarf: [-5, 34, 2, 3, 6], tail: [0, 4, 2] }),
    P({
      ...set,
      x: -3.6,
      head: [5.4, 7.6],
      fN: [-6, 0, 6],
      dust: 1.3,
      ruff: 1.2,
      scarf: [-7, 34, 2, 4.5, 5],
      tail: [2, 8, 4]
    })
  ]
})

/** How far below its origin a paw (with the pastern above it) reaches when turned by `deg`. */
function pawDrop(deg: number, big: number) {
  const f = Frame.at(0, 0, deg)
  const ring = (cx: number, cy: number, rx: number, ry: number) =>
    Array.from(
      { length: 16 },
      (_, i) => f.pt(cx + Math.cos((i / 16) * TAU) * rx, cy + Math.sin((i / 16) * TAU) * ry)[1]
    )
  return Math.max(...ring(1.8 + big, -2.4, 5 + big, 3), ...ring(-1.8, -2.8, 3.2, 2.8), f.pt(0.3, -3)[1] + 3.4)
}

/**
 * The charge's gallop with two flights (stride 162 over 6 frames, 27 px a frame): stretched out in the air on
 * frame 0, both fores land on frame 1 (the near one further ahead) and carry two frames, the body gathers in the
 * air on frame 3 with the hinds swung far under, both hinds land on frame 4 and drive two frames. Table x is px
 * ahead of the anchor, at the middle of the pad (2 px ahead of the paw's origin).
 */
const PAD = 2
const CHARGE = (() => {
  const N = 6
  const stride = 162
  const paths = {
    fN: footPath(N, stride, { land: 1, contact: 2, front: 19 }),
    fF: footPath(N, stride, { land: 1, contact: 2, front: 14 }),
    hN: footPath(N, stride, { land: 4, contact: 2, front: -8 }),
    hF: footPath(N, stride, { land: 4, contact: 2, front: -3 })
  }
  const paw = (path: readonly FootStep[], rest: number, front: boolean): Paw[] =>
    path.map((step) => {
      const u = step.x - PAD - (0 - 2 + rest)
      if (step.down) return [u, 0, 0]
      const t = step.swing
      // just off the ground the paw flicks back sole-up, then folds and reaches forward to land
      const turn = lerp(front ? 110 : 100, front ? -50 : -25, ease.inOut(t))
      const lift = Math.max(pawDrop(turn, front ? 0.4 : 0.8) + 4, (front ? 13 : 12) * Math.sin(Math.PI * t) ** 0.8)
      return [u - 8 * Math.sin(Math.PI * t) * (1 - t), lift, turn]
    })
  return {
    fN: paw(paths.fN, REST.fN, true),
    fF: paw(paths.fF, REST.fF, true),
    hN: paw(paths.hN, REST.hN, false),
    hF: paw(paths.hF, REST.hF, false),
    footfall: footfall(7, paths.fN, paths.fF, paths.hN, paths.hF)
  }
})()

/**
 * attack: the charge, a flat-out gallop — stretched in the air, both fores land and carry, the back arches as the
 * body gathers in the air with the hinds under the chest, the hinds land and drive. Head stretched forward with
 * the jaws open, tail and scarf streaming back.
 */
const attack = memo(() => {
  const N = 6
  const body: [number, number, number][] = [
    // y, lean, squash
    [5, 0, 1.4],
    [1, 4, 1],
    [1, 5, -1.5],
    [4, 1, -3],
    [1, -4, -1.5],
    [1, -3, 1.5]
  ]
  const bob = body.map((b) => b[0])
  const headLag = lag(bob, { stiffness: 0.5, damping: 0.6, loop: true })
  return body.map(([y, lean, squash], i) =>
    P({
      x: 0,
      y,
      lean,
      squash,
      fN: CHARGE.fN[i],
      fF: CHARGE.fF[i],
      hN: CHARGE.hN[i],
      hF: CHARGE.hF[i],
      head: [2, 1 - headLag[i] * 0.8],
      nod: headLag[i] * 3,
      jaw: 0.7,
      mouth: 'open',
      eyes: 'glare',
      earN: 70,
      earF: 70,
      ruff: 1 + headLag[i] * 0.5,
      tail: [-6 + Math.sin(phase(i, N)) * 4, 6, phase(i, N) * 2],
      scarf: [-6 + Math.sin(phase(i, N) + 1) * 4, 38, 2.4, phase(i, N) * 2, 4]
    })
  )
})

/** stunned: sat back on the haunches after the wall, front legs splayed, head lolling in a circle, tongue out. */
const stunned = memo(() => {
  const N = 6
  return Array.from({ length: N }, (_, i) => {
    const a = phase(i, N)
    return P({
      x: -1,
      y: -1,
      lean: -38,
      head: [Math.cos(a) * 2.4, Math.sin(a) * 1.8],
      nod: 12 + Math.sin(a) * 12,
      jaw: 0.35,
      mouth: 'open',
      tongue: true,
      eyes: 'dizzy',
      earN: 40 + Math.sin(a) * 12,
      earF: -15 + Math.cos(a) * 10,
      fN: [6, 0, -10],
      fF: [-6, 0, 10],
      hN: [12, 4, -78],
      hF: [16, 4, -78],
      tail: [4, -6, a],
      scarf: [16, 30, 1.2, a, 34]
    })
  })
})

/** recover: out of breath — head hanging, panting with the tongue out, chest pumping, ears drooping. */
const recover = memo(() =>
  [0, 1, 0.25, 0.85].map((pant, i) =>
    P({
      y: -1 - pant,
      lean: 4,
      breath: pant,
      head: [3, 10 + pant],
      nod: 30 - pant * 4,
      jaw: 0.4 + pant * 0.3,
      mouth: 'open',
      tongue: true,
      eyes: 'tired',
      earN: 35,
      earF: 30 + pant * 4,
      tail: [55, 30, i * 1.5],
      scarf: [20 + pant * 4, 30, 0.8, i * 1.6, 34]
    })
  )
)

/** defeat: a jolt, a stagger, the legs give way, he falls on his side with a bounce and lies out cold. */
const defeat = memo(() => {
  const lying: Partial<WolfPose> = {
    x: -2,
    y: -11.5,
    lean: 0,
    squash: 1.5,
    roll: 1,
    head: [6, 9],
    nod: 32,
    jaw: 0.3,
    mouth: 'open',
    tongue: true,
    eyes: 'dizzy',
    earN: 60,
    earF: 40,
    fN: [18, 6.5, -90],
    fF: [14, 9, -90],
    hN: [34, 5.5, -90],
    hF: [30, 8, -90],
    tail: [16, -46, 0]
  }
  return [
    P({
      x: -2,
      y: 3,
      lean: -10,
      head: [-2, -3],
      nod: -10,
      eyes: 'wide',
      jaw: 0.6,
      mouth: 'open',
      earN: -10,
      earF: -8,
      ruff: 2,
      fN: [-2, 3, 20],
      scarf: [-10, 32, 2, 0, 10]
    }),
    P({
      x: -5,
      y: -1,
      lean: 6,
      head: [0, 4],
      nod: 25,
      eyes: 'dizzy',
      jaw: 0.4,
      mouth: 'open',
      tongue: true,
      earN: 40,
      earF: 30,
      fN: [-6, 0, 0],
      fF: [4, 0, 0],
      hN: [3, 0, 0],
      scarf: [20, 32, 1.6, 1.2, 24]
    }),
    P({
      x: -5,
      y: -9,
      lean: 12,
      head: [3, 3],
      nod: 26,
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
      scarf: [-14, 32, 1.8, 2.4, 10]
    }),
    P({ ...lying, scarf: [-20, 32, 1.8, 3.4, 20], eyes: 'shut' }),
    P({
      ...lying,
      y: -7.5,
      squash: -0.5,
      head: [5, 0],
      nod: 10,
      fN: [16, 10, -75],
      hN: [30, 9, -75],
      eyes: 'shut',
      scarf: [-30, 32, 1.8, 4.4, 30]
    }),
    P({ ...lying, y: -12.5, squash: 2, scarf: [-6, 28, 1.2, 5.4, 18] }),
    P({ ...lying, stars: 0, scarf: [-2, 26, 0.6, 6.2, 14] }),
    P({ ...lying, stars: 1 / 6, breath: 0.6, scarf: [-1, 26, 0.6, 7.4, 15] })
  ]
})

const draw = (poses: WolfPose[]) => poses.map(drawWolf)

/** Where the feet of his charge are on the ground (`tests/art-footfall.test.ts`). */
export const footfalls: FootfallModule = { wolfBoss: { attack: CHARGE.footfall } }

export const sheets: SheetModule = {
  wolfBoss: () => ({
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
